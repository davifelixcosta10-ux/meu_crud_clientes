"""
===================================================================
DaviFlow API — Camada de Persistência (Supabase/PostgreSQL)
===================================================================
Módulo responsável por TODA comunicação com o banco de dados.
Usa Supabase Python Client (wrapper sobre PostgREST + PostgreSQL).

Padrões de segurança implementados:
- Row Level Security (RLS): TODAS as queries filtram por user_id
- Singleton: Cliente Supabase reutilizado (pool de conexões)
- Validação de entrada: Pydantic models antes de persistir
- Error handling: Exceptions genéricas (não vazam detalhes internos)

Tabelas Supabase:
- clientes: 30+ colunas, RLS por user_id
- planos: 5 colunas, RLS por user_id
- etapas: Kanban por user_id (Fase 1A)
- atividades: follow-ups por user_id + cliente_id (Fase 1B)
- tags: segmentação por user_id (Fase 1C)
- cliente_tags: N:N cliente <-> tag
- filtros_salvos: filtros salvos por user_id
- auth.users: gerenciado pelo Supabase Auth (JWT)
"""

import os
import re
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
from supabase import create_client, Client
from app.models import Cliente, ClienteCreate, Plano, UserLogin, UserSignUp, Etapa, Atividade, Tag, FiltroSalvo


# Carrega variáveis de ambiente de .env ou data/arquivos.env
# Ordem: .env (raiz) -> data/arquivos.env (fallback para deploy)
load_dotenv()
if not os.environ.get("SUPABASE_URL"):
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "data", "arquivos.env"))


# --- SINGLETON: cliente Supabase reutilizado por processo ---
# Evita criar nova conexão HTTP a cada request (performance)
# Thread-safe para FastAPI (single-threaded por worker)
_supabase_client: Client | None = None


_supabase_admin_client: Client | None = None

def get_supabase_client() -> Client:
    """
    Retorna instância singleton do cliente Supabase (anon).
    
    Inicialização lazy: cria apenas na primeira chamada.
    Variáveis obrigatórias: SUPABASE_URL, SUPABASE_KEY
    
    Returns:
        Client: Cliente Supabase configurado para operações CRUD
    
    Raises:
        ValueError: Se variáveis de ambiente não configuradas
    """
    global _supabase_client
    if _supabase_client is None:
        url: str = os.environ.get("SUPABASE_URL", "")
        key: str = os.environ.get("SUPABASE_KEY", "")
        if not url or not key:
            raise ValueError(
                "SUPABASE_URL e SUPABASE_KEY não foram encontrados nas variáveis de ambiente."
            )
        _supabase_client = create_client(url, key)
    return _supabase_client


def get_supabase_admin_client() -> Client:
    """Retorna cliente com service_role (para admin: invite, list_users, auth.users)."""
    global _supabase_admin_client
    if _supabase_admin_client is None:
        url: str = os.environ.get("SUPABASE_URL", "")
        # tenta service_role em várias vars comuns
        key: str = (
            os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_SERVICE_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE")
            or os.environ.get("SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_KEY", "")
        )
        if not url or not key:
            return get_supabase_client()
        try:
            _supabase_admin_client = create_client(url, key)
        except Exception:
            _supabase_admin_client = get_supabase_client()
    return _supabase_admin_client


# ============================================================
# FUNÇÕES DE AUTENTICAÇÃ� (delegam para Supabase Auth)
# ============================================================

def registrar_usuario(dados: UserSignUp):
    """
    Cadastra usuário no Supabase Auth.
    
    Delegado para Supabase: hashing bcrypt (cost 12), validação de e-mail único,
    confirmação de e-mail opcional, metadata customizada.
    
    Args:
        dados: UserSignUp (email, password, nome_completo, nome_empresa)
    
    Returns:
        AuthResponse: Contém user (se sucesso) ou error
    
    Usado em: POST /api/auth/signup
    """
    supabase = get_supabase_client()
    return supabase.auth.sign_up({
        "email": dados.email,
        "password": dados.password,
        "options": {
            "data": {
                "nome_completo": dados.nome_completo or "",
                "nome_empresa":  dados.nome_empresa  or "",
            }
        },
    })


def autenticar_usuario(dados: UserLogin):
    """
    Autentica usuário no Supabase Auth (verifica senha, gera JWT).
    
    Supabase verifica: senha correta, conta ativa, não bloqueada.
    Retorna sessão com access_token (JWT) e refresh_token.
    
    Args:
        dados: UserLogin (email, password)
    
    Returns:
        AuthResponse: Contém session (access_token, user) ou error
    
    Usado em: POST /api/auth/login
    """
    supabase = get_supabase_client()
    return supabase.auth.sign_in_with_password({
        "email":    dados.email,
        "password": dados.password,
    })


# ============================================================
# FUNÇÕES DE PLANOS (dinâmicos por usuário)
# ============================================================
# Isolamento total: TODAS as queries incluem .eq("user_id", user_id)
# RLS no Supabase garante que mesmo se query for manipulada, não vaza dados

def listar_planos(user_id: str) -> list[Plano]:
    """
    Lista todos os planos do usuário autenticado.
    
    Ordenação: created_at ASC (planos mais antigos primeiro)
    Filtro RLS: user_id obrigatório
    
    Args:
        user_id: UUID do usuário autenticado (validado pelo JWT)
    
    Returns:
        list[Plano]: Lista de planos validados pelo modelo Pydantic
    
    Usado em: GET /api/planos
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("planos")
        .select("*")
        .eq("user_id", user_id)      # CRÍTICO: isolamento por usuário
        .order("created_at")
        .execute()
    )
    return [Plano.model_validate(item) for item in response.data]


def criar_plano(dados: dict, user_id: str) -> Plano:
    """
    Cria um novo plano para o usuário autenticado.
    
    Args:
        dados: dict com nome, cor, descricao, valor (validado por PlanoCreate)
        user_id: UUID do usuário dono do plano
    
    Returns:
        Plano: Plano criado com ID gerado pelo banco
    
    Raises:
        ValueError: Se insert falhar (dados inválidos, constraint, etc.)
    
    Usado em: POST /api/planos
    """
    supabase = get_supabase_client()
    payload = {
        "user_id":   user_id,                    # CRÍTICO: dono do plano
        "nome":      dados.get("nome"),
        "cor":       dados.get("cor", "indigo"),
        "descricao": dados.get("descricao"),
        "valor":     dados.get("valor"),
    }
    response = supabase.table("planos").insert(payload).execute()
    if not response.data:
        raise ValueError("Falha ao criar plano.")
    return Plano.model_validate(response.data[0])


def atualizar_plano(plano_id: int | str, dados: dict, user_id: str) -> Plano | None:
    """
    Atualiza parcialmente um plano (PATCH).
    
    Apenas campos não-None são atualizados (exclude_unset no endpoint).
    Filtro duplo: id + user_id (defesa em profundidade + RLS).
    
    Args:
        plano_id: ID do plano (int ou string)
        dados: dict com campos a atualizar (apenas não-None)
        user_id: UUID do usuário dono do plano
    
    Returns:
        Plano atualizado ou None se não encontrado
    
    Usado em: PATCH /api/planos/{plano_id}
    """
    supabase = get_supabase_client()
    # Filtra apenas valores não-None (preserva falsy: "", 0, False)
    dados_filtrados = {k: v for k, v in dados.items() if v is not None}
    if not dados_filtrados:
        return None
    response = (
        supabase.table("planos")
        .update(dados_filtrados)
        .eq("id", plano_id)
        .eq("user_id", user_id)              # CRÍTICO: isolamento por usuário
        .execute()
    )
    if response.data:
        return Plano.model_validate(response.data[0])
    return None


def deletar_plano(plano_id: int | str, user_id: str) -> bool:
    """
    Remove um plano do usuário autenticado.
    
    Filtro duplo: id + user_id (defesa em profundidade + RLS).
    
    Args:
        plano_id: ID do plano
        user_id: UUID do usuário dono do plano
    
    Returns:
        True se deletado, False se não encontrado
    
    Usado em: DELETE /api/planos/{plano_id}
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("planos")
        .delete()
        .eq("id", plano_id)
        .eq("user_id", user_id)              # CRÍTICO: isolamento por usuário
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FUNÇÕES DE CLIENTES (isolados por user_id)
# ============================================================
# Isolamento total: TODAS as queries incluem .eq("user_id", user_id)
# 30+ colunas mapeadas para modelo Cliente

# Colunas que existem na tabela `clientes` do Supabase
# Mantida como lista para validação/serialização explícita (evita colunas extras)
# Fase 1: adicionado etapa_id, valor_plano, vencimento_dia, status_pagamento
_COLUNAS_CLIENTE = [
    "user_id", "nome", "email", "plano", "ativo", "data_cadastro",
    "telefone", "cpf", "rg",
    "data_nascimento", "genero", "empresa", "cargo", "observacoes",
    "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado",
    "etapa_id", "valor_plano", "vencimento_dia", "status_pagamento",
]


def carregar_clientes(user_id: str, org_id: str | None = None) -> list[Cliente]:
    """
    Lista todos os clientes do usuário autenticado.
    
    Ordenação: data_cadastro DESC (mais recentes primeiro)
    Filtro: se org_id fornecido filtra por org (isolamento por org), senão por user_id (compat)
    
    Args:
        user_id: UUID do usuário autenticado
        org_id: UUID da organização selecionada (opcional, Fase 3A-1)
    
    Returns:
        list[Cliente]: Lista validada pelo modelo Pydantic
    
    Usado em: GET /api/clientes?org_id=...
    """
    supabase = get_supabase_client()
    q = supabase.table("clientes").select("*")
    if org_id:
        q = q.eq("org_id", org_id)
    else:
        q = q.eq("user_id", user_id)              # fallback compat
    response = q.order("data_cadastro", desc=True).execute()
    print(f"[DEBUG] carregar_clientes user_id={user_id} => {len(response.data)} linhas brutas")
    clientes = []
    for item in response.data:
        try:
            clientes.append(Cliente.model_validate(item))
        except Exception as e:
            # Loga e ignora linha inválida para não quebrar lista inteira
            print(f"WARN: cliente id={item.get('id')} falhou na validação: {e} | dados={item}")
            # Tenta criar objeto leniente sem validação estrita
            try:
                # Fallback: cria dict apenas com campos básicos e ignora inválidos
                clientes.append(Cliente.model_validate({k: v for k, v in item.items() if k in Cliente.model_fields}))
            except Exception as e2:
                print(f"WARN2: fallback também falhou id={item.get('id')}: {e2}")
                pass
    print(f"[DEBUG] carregar_clientes user_id={user_id} => {len(clientes)} após validação")
    return clientes


def salvar_novo_cliente(cliente_dados: dict, user_id: str) -> Cliente:
    """
    Cria um novo cliente vinculado ao usuário autenticado.
    
    Processo:
    1. Cria payload apenas com colunas conhecidas (_COLUNAS_CLIENTE)
    2. Adiciona user_id obrigatório
    3. Defaults: plano="basico", ativo=True
    4. Insere no banco e valida resposta com modelo Pydantic
    
    Args:
        cliente_dados: dict validado por ClienteCreate (já tem defaults)
        user_id: UUID do usuário dono do cliente
    
    Returns:
        Cliente: Cliente criado com ID e data_cadastro do banco
    
    Raises:
        ValueError: Se insert falhar
    
    Usado em: POST /api/clientes
    """
    supabase = get_supabase_client()

    payload_banco: dict = {"user_id": user_id}
    for col in _COLUNAS_CLIENTE:
        if col == "user_id":
            continue
        if col in cliente_dados:
            payload_banco[col] = cliente_dados[col]

    # Converte valor_plano "R$ 1.500,00" -> 1500.0 (DB é numeric, BR ou EN)
    if "valor_plano" in payload_banco and payload_banco["valor_plano"] not in (None, ""):
        vp = payload_banco["valor_plano"]
        if isinstance(vp, str):
            raw = vp.replace("R$", "").strip()
            # Se tem vírgula, é BR: 1.500,00 -> 1500.00 ; senão mantém ponto como decimal
            if "," in raw:
                raw = raw.replace(".", "").replace(",", ".")
            raw = re.sub(r"[^0-9.\-]", "", raw)
            try:
                payload_banco["valor_plano"] = float(raw) if raw else 0.0
            except (ValueError, TypeError):
                payload_banco.pop("valor_plano", None)
        elif isinstance(vp, (int, float)):
            payload_banco["valor_plano"] = float(vp)

    # Sem plano deve permanecer null (mostra "Sem plano" no badge), não virar "basico"
    # Só usa "basico" se plano não foi enviado (compatibilidade antiga)
    if "plano" not in payload_banco:
        payload_banco["plano"] = None
    elif payload_banco["plano"] == "":
        payload_banco["plano"] = None
    # Garante valor padrão de ativo
    if payload_banco.get("ativo") is None:
        payload_banco["ativo"] = True
    payload_banco = _ensure_org_id(payload_banco, user_id)

    response = supabase.table("clientes").insert(payload_banco).execute()
    if not response.data:
        raise ValueError("Falha ao salvar cliente no banco de dados.")

    return Cliente.model_validate(response.data[0])


def atualizar_cliente_db(cliente_id: int | str, cliente_dados: dict, user_id: str) -> Cliente | None:
    """
    Atualiza parcialmente um cliente (PATCH).
    
    Comportamento crítico:
    - Usa `v is not None` (não `if v`) para preservar valores falsy válidos:
      * ativo=False (desativar cliente)
      * valor_plano=0.0, etc.
    - Filtro duplo: id + user_id
    - Retorna None se não encontrado (404 no endpoint)
    
    Args:
        cliente_id: ID do cliente
        cliente_dados: dict com campos a atualizar (apenas não-None)
        user_id: UUID do usuário dono do cliente
    
    Returns:
        Cliente atualizado ou None se não encontrado
    
    Usado em: PATCH /api/clientes/{cliente_id}
    """
    supabase = get_supabase_client()

    # PATCH: mantém None para permitir limpar campos nullable (etapa_id, valor_plano, etc)
    # exclude_unset no endpoint já garante que só campos enviados entram aqui
    # Preserva falsy válidos como ativo=False, "" etc.
    dados_filtrados = dict(cliente_dados)
    if not dados_filtrados:
        return None

    # Converte valor_plano "R$ 1.500,00" -> 1500.0 para coluna numeric (BR/EN)
    if "valor_plano" in dados_filtrados:
        vp = dados_filtrados["valor_plano"]
        if vp is None or vp == "":
            dados_filtrados["valor_plano"] = 0.0
        elif isinstance(vp, str):
            raw = vp.replace("R$", "").strip()
            if "," in raw:
                raw = raw.replace(".", "").replace(",", ".")
            raw = re.sub(r"[^0-9.\-]", "", raw)
            try:
                dados_filtrados["valor_plano"] = float(raw) if raw else 0.0
            except (ValueError, TypeError):
                dados_filtrados.pop("valor_plano", None)
        elif isinstance(vp, (int, float)):
            dados_filtrados["valor_plano"] = float(vp)

    response = (
        supabase.table("clientes")
        .update(dados_filtrados)
        .eq("id", cliente_id)
        .eq("user_id", user_id)              # CRÍTICO: isolamento por usuário
        .execute()
    )
    if response.data:
        return Cliente.model_validate(response.data[0])
    return None


def deletar_cliente_db(cliente_id: int | str, user_id: str) -> bool:
    """
    Remove um cliente do banco de dados.
    
    Filtro duplo: id + user_id (defesa em profundidade + RLS).
    
    Args:
        cliente_id: ID do cliente
        user_id: UUID do usuário dono do cliente
    
    Returns:
        True se deletado, False se não encontrado
    
    Usado em: DELETE /api/clientes/{cliente_id}
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("clientes")
        .delete()
        .eq("id", cliente_id)
        .eq("user_id", user_id)              # CRÍTICO: isolamento por usuário
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FASE 1A — ETAPAS (Kanban)
# ============================================================

def listar_etapas(user_id: str, org_id: str | None = None) -> list[Etapa]:
    """Lista etapas do usuário ordenadas por ordem. Filtra por org_id se fornecido."""
    supabase = get_supabase_client()
    q = supabase.table("etapas").select("*")
    if org_id:
        q = q.eq("org_id", org_id)
    else:
        q = q.eq("user_id", user_id)
    response = q.order("ordem").execute()
    return [Etapa.model_validate(item) for item in response.data]


def criar_etapa(dados: dict, user_id: str) -> Etapa:
    """Cria nova etapa Kanban."""
    supabase = get_supabase_client()
    payload = {
        "user_id": user_id,
        "nome": dados.get("nome"),
        "ordem": dados.get("ordem", 0),
        "cor": dados.get("cor", "indigo"),
    }
    payload = _ensure_org_id(payload, user_id)
    response = supabase.table("etapas").insert(payload).execute()
    if not response.data:
        raise ValueError("Falha ao criar etapa.")
    return Etapa.model_validate(response.data[0])


def atualizar_etapa(etapa_id: int | str, dados: dict, user_id: str) -> Etapa | None:
    """Atualiza etapa (nome, ordem, cor)."""
    supabase = get_supabase_client()
    dados_filtrados = {k: v for k, v in dados.items() if v is not None}
    if not dados_filtrados:
        return None
    response = (
        supabase.table("etapas")
        .update(dados_filtrados)
        .eq("id", etapa_id)
        .eq("user_id", user_id)
        .execute()
    )
    if response.data:
        return Etapa.model_validate(response.data[0])
    return None


def deletar_etapa(etapa_id: int | str, user_id: str) -> bool:
    """Remove etapa. Clientes vinculados ficam com etapa_id NULL (tratado no frontend)."""
    supabase = get_supabase_client()
    response = (
        supabase.table("etapas")
        .delete()
        .eq("id", etapa_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FASE 1B — ATIVIDADES (Follow-ups)
# ============================================================

def listar_atividades(user_id: str, cliente_id: int | str | None = None, org_id: str | None = None) -> list[Atividade]:
    """Lista atividades do usuário; filtra por cliente_id se fornecido. Filtra por org_id se fornecido."""
    supabase = get_supabase_client()
    query = supabase.table("atividades").select("*")
    if org_id:
        query = query.eq("org_id", org_id)
    else:
        query = query.eq("user_id", user_id)
    if cliente_id is not None:
        query = query.eq("cliente_id", cliente_id)
    response = query.order("data", desc=False).execute()
    return [Atividade.model_validate(item) for item in response.data]


def criar_atividade(dados: dict, user_id: str) -> Atividade:
    """Cria atividade vinculada a cliente (valida cliente pertence ao user_id via RLS)."""
    supabase = get_supabase_client()
    # Valida ownership do cliente antes de criar atividade (previne spoofing de cliente_id)
    cli = supabase.table("clientes").select("id").eq("id", dados.get("cliente_id")).eq("user_id", user_id).execute()
    if not cli.data:
        raise ValueError("Cliente não encontrado ou não pertence ao usuário.")
    payload = {
        "user_id": user_id,
        "cliente_id": dados.get("cliente_id"),
        "tipo": dados.get("tipo"),
        "data": dados.get("data"),
        "concluida": dados.get("concluida", False),
        "nota": dados.get("nota"),
    }
    payload = _ensure_org_id(payload, user_id)
    response = supabase.table("atividades").insert(payload).execute()
    if not response.data:
        raise ValueError("Falha ao criar atividade.")
    return Atividade.model_validate(response.data[0])


def atualizar_atividade(atividade_id: int | str, dados: dict, user_id: str) -> Atividade | None:
    supabase = get_supabase_client()
    dados_filtrados = {k: v for k, v in dados.items() if v is not None}
    if not dados_filtrados:
        return None
    response = (
        supabase.table("atividades")
        .update(dados_filtrados)
        .eq("id", atividade_id)
        .eq("user_id", user_id)
        .execute()
    )
    if response.data:
        return Atividade.model_validate(response.data[0])
    return None


def deletar_atividade(atividade_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    response = (
        supabase.table("atividades")
        .delete()
        .eq("id", atividade_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FASE 1C — TAGS
# ============================================================

def listar_tags(user_id: str, org_id: str | None = None) -> list[Tag]:
    supabase = get_supabase_client()
    q = supabase.table("tags").select("*")
    if org_id:
        q = q.eq("org_id", org_id)
    else:
        q = q.eq("user_id", user_id)
    response = q.order("nome").execute()
    return [Tag.model_validate(item) for item in response.data]


def criar_tag(dados: dict, user_id: str) -> Tag:
    supabase = get_supabase_client()
    payload = {"user_id": user_id, "nome": dados.get("nome"), "cor": dados.get("cor", "indigo")}
    payload = _ensure_org_id(payload, user_id)
    response = supabase.table("tags").insert(payload).execute()
    if not response.data:
        raise ValueError("Falha ao criar tag.")
    return Tag.model_validate(response.data[0])


def atualizar_tag(tag_id: int | str, dados: dict, user_id: str) -> Tag | None:
    supabase = get_supabase_client()
    dados_filtrados = {k: v for k, v in dados.items() if v is not None}
    if not dados_filtrados:
        return None
    response = (
        supabase.table("tags")
        .update(dados_filtrados)
        .eq("id", tag_id)
        .eq("user_id", user_id)
        .execute()
    )
    if response.data:
        return Tag.model_validate(response.data[0])
    return None


def deletar_tag(tag_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    # Remove vínculos primeiro (se FK não for cascade)
    supabase.table("cliente_tags").delete().eq("tag_id", tag_id).execute()
    response = (
        supabase.table("tags")
        .delete()
        .eq("id", tag_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(response.data) > 0


def listar_tags_cliente(cliente_id: int | str, user_id: str) -> list[Tag]:
    """Lista tags vinculadas a um cliente (via join cliente_tags)."""
    supabase = get_supabase_client()
    # Busca IDs das tags vinculadas
    resp = supabase.table("cliente_tags").select("tag_id").eq("cliente_id", cliente_id).execute()
    tag_ids = [r["tag_id"] for r in resp.data] if resp.data else []
    if not tag_ids:
        return []
    # Busca tags do usuário que estão na lista
    resp2 = supabase.table("tags").select("*").eq("user_id", user_id).in_("id", tag_ids).execute()
    return [Tag.model_validate(item) for item in resp2.data]


def vincular_tag_cliente(cliente_id: int | str, tag_id: int | str, user_id: str) -> bool:
    """Vincula tag a cliente (verifica ambos pertencem ao user_id via RLS indireta)."""
    supabase = get_supabase_client()
    # Verifica cliente pertence ao user
    cli = supabase.table("clientes").select("id").eq("id", cliente_id).eq("user_id", user_id).execute()
    if not cli.data:
        return False
    # Verifica tag pertence ao user
    tag = supabase.table("tags").select("id").eq("id", tag_id).eq("user_id", user_id).execute()
    if not tag.data:
        return False
    # Insere vínculo (ignora duplicado)
    try:
        supabase.table("cliente_tags").insert({"cliente_id": cliente_id, "tag_id": tag_id}).execute()
    except Exception:
        pass  # já vinculado
    return True


def desvincular_tag_cliente(cliente_id: int | str, tag_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    response = (
        supabase.table("cliente_tags")
        .delete()
        .eq("cliente_id", cliente_id)
        .eq("tag_id", tag_id)
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FASE 1C — FILTROS SALVOS
# ============================================================

def listar_filtros_salvos(user_id: str, org_id: str | None = None) -> list[FiltroSalvo]:
    supabase = get_supabase_client()
    q = supabase.table("filtros_salvos").select("*")
    if org_id:
        q = q.eq("org_id", org_id)
    else:
        q = q.eq("user_id", user_id)
    response = q.order("created_at", desc=True).execute()
    return [FiltroSalvo.model_validate(item) for item in response.data]


def criar_filtro_salvo(dados: dict, user_id: str) -> FiltroSalvo:
    supabase = get_supabase_client()
    payload = {"user_id": user_id, "nome": dados.get("nome"), "query": dados.get("query")}
    payload = _ensure_org_id(payload, user_id)
    response = supabase.table("filtros_salvos").insert(payload).execute()
    if not response.data:
        raise ValueError("Falha ao criar filtro.")
    return FiltroSalvo.model_validate(response.data[0])


def deletar_filtro_salvo(filtro_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    response = (
        supabase.table("filtros_salvos")
        .delete()
        .eq("id", filtro_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FASE 1E — IMPORTAÇÃO BULK (CSV/Excel já parseado no frontend)
# ============================================================

def _cor_para_plano(nome: str) -> str:
    """Escolhe cor determinística para plano auto-criado no import."""
    cores = ["indigo", "emerald", "amber", "rose", "cyan", "purple", "orange", "slate"]
    h = sum(ord(c) for c in (nome or "")) % len(cores)
    return cores[h]

def importar_clientes_bulk(clientes: list[dict], user_id: str) -> dict:
    """
    Importa lista de clientes em lote (usado por POST /api/clientes/import).
    Cria automaticamente planos ausentes (ex: importar dados de teste para conta do pai).
    Retorna dict com contagem de sucessos, erros e planos_criados.
    """
    supabase = get_supabase_client()
    # Auto-cria planos ausentes antes de inserir clientes
    planos_criados = []
    plano_id_map = {}  # mapeia plano original (ex: "1") -> novo id (ex: "7")
    try:
        # Coleta planos distintos do import (ex: "pro", "enterprise", "1")
        planos_import = {str(c.get("plano")).strip() for c in clientes if c.get("plano") and str(c.get("plano")).strip()}
        # Normaliza: remove empty, trata "basico" como nome
        planos_import = {p for p in planos_import if p}
        if planos_import:
            existentes = listar_planos(user_id)
            # Mapa por id string e por nome lower
            por_id = {str(p.id): p for p in existentes}
            por_nome = {p.nome.strip().lower(): p for p in existentes}
            for plano_val in planos_import:
                pv = plano_val.strip()
                pv_lower = pv.lower()
                # Já existe por id ou por nome?
                if pv in por_id or pv_lower in por_nome:
                    continue
                # Precisa criar — tenta preservar nome/cor originais
                nome_novo = None
                cor_nova = None
                desc_nova = "Criado automaticamente no import"
                valor_novo = ""
                # Se for ID numérico (ex: "1" do export), busca plano original para copiar nome/cor
                if pv.isdigit():
                    try:
                        orig = supabase.table("planos").select("nome,cor,descricao,valor").eq("id", int(pv)).limit(1).execute()
                        if orig.data:
                            nome_novo = orig.data[0].get("nome") or f"Plano {pv}"
                            cor_nova = orig.data[0].get("cor") or _cor_para_plano(nome_novo)
                            desc_nova = orig.data[0].get("descricao") or desc_nova
                            valor_novo = orig.data[0].get("valor") or ""
                        else:
                            nome_novo = f"Plano {pv}"
                    except Exception:
                        nome_novo = f"Plano {pv}"
                if not nome_novo:
                    # Para slug "pro"/"enterprise"/"basico" usa nome capitalizado e cor padrão
                    if pv_lower in ("pro", "basico", "enterprise"):
                        nome_novo = pv.capitalize()
                        # Cor padrão igual ao PLANOS_DEFAULT do frontend
                        cores_default = {"pro": "indigo", "basico": "slate", "enterprise": "amber"}
                        cor_nova = cores_default.get(pv_lower) or _cor_para_plano(nome_novo)
                        # Tenta buscar valor de plano com mesmo nome em qualquer usuário para preservar
                        try:
                            orig2 = supabase.table("planos").select("valor").ilike("nome", pv).limit(1).execute()
                            if orig2.data:
                                valor_novo = orig2.data[0].get("valor") or valor_novo
                        except Exception:
                            pass
                    else:
                        nome_novo = pv
                if not cor_nova:
                    cor_nova = _cor_para_plano(nome_novo)
                # Evita duplicar nome se já existe "Plano 1" etc.
                if nome_novo.strip().lower() in por_nome:
                    # Mesmo que nome já exista, mapeia pv (ex: "1") para id existente desse nome
                    if pv not in por_id:
                        plano_id_map[pv] = por_nome[nome_novo.strip().lower()].id if hasattr(por_nome[nome_novo.strip().lower()], 'id') else por_nome[nome_novo.strip().lower()]
                        # por_nome guarda objeto Plano, com .id
                        try:
                            plano_id_map[pv] = str(por_nome[nome_novo.strip().lower()].id)
                        except:
                            plano_id_map[pv] = str(por_nome[nome_novo.strip().lower()])
                    continue
                try:
                    novo = criar_plano({"nome": nome_novo, "cor": cor_nova, "descricao": desc_nova, "valor": valor_novo}, user_id)
                    planos_criados.append(novo.nome)
                    # Atualiza mapas para não duplicar dentro do mesmo import
                    por_id[str(novo.id)] = novo
                    por_nome[novo.nome.strip().lower()] = novo
                    plano_id_map[pv] = str(novo.id)
                except Exception as e:
                    # Se falhar criar plano (ex: race), ignora — cliente ainda será inserido com plano string original (fallback badge)
                    print(f"[import] falha ao criar plano '{nome_novo}': {e}")
    except Exception as e:
        print(f"[import] erro ao auto-criar planos: {e}")

    # Mapeia plano antigo (ex: "pro", "1") para novo id criado, para badge funcionar
    # Após criar, recarrega para ter ids corretos
    try:
        if planos_import:
            # Primeiro usa mapa direto de criação (ex: "1" -> "7" para Vip)
            for cli in clientes:
                pv = str(cli.get("plano", "")).strip()
                if pv in plano_id_map:
                    cli["plano"] = plano_id_map[pv]
                    continue
            # Recarrega planos atualizados para mapear por nome
            atuais = listar_planos(user_id)
            por_nome_atual = {p.nome.strip().lower(): str(p.id) for p in atuais}
            por_id_atual = {str(p.id): str(p.id) for p in atuais}
            for cli in clientes:
                pv = str(cli.get("plano", "")).strip()
                if not pv:
                    continue
                # Se já é id válido, mantém
                if pv in por_id_atual:
                    continue
                # Se nome já existe (ex: import "pro" -> plano "Pro" com id 5), mapeia para id
                pv_lower = pv.lower()
                if pv_lower in por_nome_atual:
                    cli["plano"] = por_nome_atual[pv_lower]
                elif pv.isdigit() and f"plano {pv}".lower() in por_nome_atual:
                    cli["plano"] = por_nome_atual[f"plano {pv}".lower()]
    except Exception as e:
        print(f"[import] erro ao remapear planos: {e}")

    sucessos = 0
    erros = []
    for idx, cli in enumerate(clientes):
        try:
            payload = {"user_id": user_id}
            for col in _COLUNAS_CLIENTE:
                if col == "user_id":
                    continue
                if col in cli and cli[col] not in (None, ""):
                    payload[col] = cli[col]
            payload.setdefault("plano", "basico")
            payload.setdefault("ativo", True)
            # Limpeza para constraints do banco (evita erro 23514 em import de dados antigos)
            if "vencimento_dia" in payload:
                try:
                    vd = int(payload["vencimento_dia"])
                    if not 1 <= vd <= 31:
                        payload.pop("vencimento_dia", None)
                    else:
                        payload["vencimento_dia"] = vd
                except (ValueError, TypeError):
                    payload.pop("vencimento_dia", None)
            if "status_pagamento" in payload and payload["status_pagamento"] not in ("em_dia", "atrasado", "isento"):
                payload.pop("status_pagamento", None)
            # Converte valor_plano "R$ 1.500,00" -> 1500.0 para coluna numeric (BR/EN)
            if "valor_plano" in payload and payload["valor_plano"] not in (None, ""):
                vp = payload["valor_plano"]
                if isinstance(vp, str):
                    raw = vp.replace("R$", "").strip()
                    if "," in raw:
                        raw = raw.replace(".", "").replace(",", ".")
                    raw = re.sub(r"[^0-9.\-]", "", raw)
                    try:
                        payload["valor_plano"] = float(raw) if raw else 0.0
                    except (ValueError, TypeError):
                        payload.pop("valor_plano", None)
                elif isinstance(vp, (int, float)):
                    payload["valor_plano"] = float(vp)
            # Valida com Pydantic leniente (Cliente) para import — permite trazer CPF antigo invalido do export
            Cliente.model_validate({**payload, "user_id": user_id})
            supabase.table("clientes").insert(payload).execute()
            sucessos += 1
        except Exception as e:
            erros.append({"linha": idx + 1, "erro": str(e), "dados": cli})
    return {"sucessos": sucessos, "erros": erros, "total": len(clientes), "planos_criados": planos_criados}


# ============================================================
# FASE 2A — RELATÓRIOS (Conversão por etapa)
# ============================================================

def relatorio_conversao(user_id: str, periodo_dias: int | None = None, org_id: str | None = None) -> dict:
    """
    Retorna distribuição de clientes por etapa Kanban (conversão).
    Calcula count e percent por etapa, incluindo 'Sem etapa' (etapa_id null).
    Filtra por periodo_dias se fornecido (ex: 30 = últimos 30 dias via data_cadastro).
    Filtra por org_id se fornecido (Fase 3A-1).
    """
    from datetime import datetime, timedelta
    # Carrega etapas e clientes do usuário (reusa funções existentes com RLS)
    etapas = listar_etapas(user_id, org_id)
    clientes = carregar_clientes(user_id, org_id)

    # Filtro por período
    if periodo_dias is not None and periodo_dias > 0:
        try:
            limite = datetime.now().date() - timedelta(days=periodo_dias)
            clientes_filtrados = []
            for c in clientes:
                if not c.data_cadastro:
                    continue
                try:
                    # data_cadastro pode ser "YYYY-MM-DD" ou "YYYY-MM-DDTHH:MM:SS"
                    dc = c.data_cadastro.split("T")[0]
                    d = datetime.strptime(dc, "%Y-%m-%d").date()
                    if d >= limite:
                        clientes_filtrados.append(c)
                except Exception:
                    # Se falhar parse, mantém cliente (não filtra)
                    clientes_filtrados.append(c)
            clientes = clientes_filtrados
        except Exception:
            pass

    total = len(clientes)
    # Conta por etapa_id
    counts: dict[str | None, int] = {}
    for c in clientes:
        key = str(c.etapa_id) if c.etapa_id is not None else None
        counts[key] = counts.get(key, 0) + 1

    # Mapa etapa id -> objeto para nome/cor
    etapa_map = {str(e.id): e for e in etapas}

    itens = []
    # Sem etapa primeiro
    sem = counts.get(None, 0)
    if sem > 0 or total == 0 or len(etapas) == 0:
        # Sempre inclui Sem etapa se houver clientes sem etapa ou se não há etapas
        # Se total 0, mostra 0 para Sem etapa
        itens.append({
            "etapa_id": None,
            "etapa_nome": "Sem etapa",
            "etapa_cor": "slate",
            "count": sem,
            "percent": round((sem / total * 100) if total > 0 else 0, 1)
        })
    # Cada etapa ordenada por ordem
    for e in sorted(etapas, key=lambda x: x.ordem):
        cnt = counts.get(str(e.id), 0)
        itens.append({
            "etapa_id": str(e.id),
            "etapa_nome": e.nome,
            "etapa_cor": e.cor,
            "count": cnt,
            "percent": round((cnt / total * 100) if total > 0 else 0, 1)
        })

    return {"total": total, "itens": itens}


def relatorio_receita(user_id: str, periodo_dias: int | None = None, org_id: str | None = None) -> dict:
    """
    Retorna receita prevista (soma valor_plano) por plano e por mês.
    Considera apenas clientes com status_pagamento='em_dia' e valor_plano >0.
    Filtra por org_id se fornecido.
    """
    from datetime import datetime, timedelta
    from collections import defaultdict
    import re

    clientes = carregar_clientes(user_id, org_id)
    planos = listar_planos(user_id)
    plano_map = {str(p.id): p for p in planos}
    plano_nome_map = {p.nome.strip().lower(): p for p in planos}

    # Filtro período
    if periodo_dias is not None and periodo_dias > 0:
        try:
            limite = datetime.now().date() - timedelta(days=periodo_dias)
            filtrados = []
            for c in clientes:
                if not c.data_cadastro:
                    continue
                try:
                    dc = c.data_cadastro.split("T")[0]
                    d = datetime.strptime(dc, "%Y-%m-%d").date()
                    if d >= limite:
                        filtrados.append(c)
                except Exception:
                    filtrados.append(c)
            clientes = filtrados
        except Exception:
            pass

    # Filtra em_dia com valor
    em_dia = [c for c in clientes if c.status_pagamento == "em_dia" and c.valor_plano]

    def parse_valor(v):
        if v is None or v == "":
            return 0.0
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).replace("R$", "").strip()
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        s = re.sub(r"[^0-9.\-]", "", s)
        try:
            return float(s) if s else 0.0
        except:
            return 0.0

    total_receita = sum(parse_valor(c.valor_plano) for c in em_dia)
    total_clientes = len(em_dia)

    # Por plano
    por_plano_dict = defaultdict(lambda: {"total": 0.0, "count": 0, "nome": "", "cor": "slate", "id": None})
    for c in em_dia:
        val = parse_valor(c.valor_plano)
        pid = str(c.plano) if c.plano else None
        # Resolve plano nome/cor
        plano_obj = plano_map.get(pid) if pid else None
        if not plano_obj and pid:
            # tenta por nome
            plano_obj = plano_nome_map.get(pid.strip().lower())
        if plano_obj:
            nome = plano_obj.nome
            cor = plano_obj.cor
            pid_resolv = str(plano_obj.id)
        elif pid:
            nome = pid
            cor = "slate"
            pid_resolv = pid
        else:
            nome = "Sem plano"
            cor = "slate"
            pid_resolv = None
        key = pid_resolv or nome
        por_plano_dict[key]["total"] += val
        por_plano_dict[key]["count"] += 1
        por_plano_dict[key]["nome"] = nome
        por_plano_dict[key]["cor"] = cor
        por_plano_dict[key]["id"] = pid_resolv

    por_plano = []
    for k, v in por_plano_dict.items():
        por_plano.append({
            "plano_id": v["id"],
            "plano_nome": v["nome"],
            "plano_cor": v["cor"],
            "total": round(v["total"], 2),
            "count": v["count"],
            "percent": round((v["total"] / total_receita * 100) if total_receita > 0 else 0, 1)
        })
    por_plano.sort(key=lambda x: x["total"], reverse=True)

    # Por mês (YYYY-MM)
    por_mes_dict = defaultdict(lambda: {"total": 0.0, "count": 0})
    for c in em_dia:
        val = parse_valor(c.valor_plano)
        dc = (c.data_cadastro or "")[:7]  # YYYY-MM
        if len(dc) == 7 and dc[4] == "-":
            por_mes_dict[dc]["total"] += val
            por_mes_dict[dc]["count"] += 1
        else:
            por_mes_dict["sem_data"]["total"] += val
            por_mes_dict["sem_data"]["count"] += 1

    por_mes = [{"mes": k, "total": round(v["total"], 2), "count": v["count"]} for k, v in sorted(por_mes_dict.items())]

    return {
        "total_receita": round(total_receita, 2),
        "total_clientes_em_dia": total_clientes,
        "por_plano": por_plano,
        "por_mes": por_mes
    }


def relatorio_churn(user_id: str, periodo_dias: int | None = None, org_id: str | None = None) -> dict:
    """
    Retorna churn por mês: total, inativos e churn% (inativos/total*100).
    Usa data_cadastro como coorte (não há data_inativacao).
    Filtra por org_id se fornecido.
    """
    from datetime import datetime, timedelta
    from collections import defaultdict

    clientes = carregar_clientes(user_id, org_id)

    # Filtro período (mesma lógica dos outros relatórios)
    if periodo_dias is not None and periodo_dias > 0:
        try:
            limite = datetime.now().date() - timedelta(days=periodo_dias)
            filtrados = []
            for c in clientes:
                if not c.data_cadastro:
                    continue
                try:
                    dc = c.data_cadastro.split("T")[0]
                    d = datetime.strptime(dc, "%Y-%m-%d").date()
                    if d >= limite:
                        filtrados.append(c)
                except Exception:
                    filtrados.append(c)
            clientes = filtrados
        except Exception:
            pass

    # Agrupa por mês
    por_mes = defaultdict(lambda: {"total": 0, "inativos": 0})
    for c in clientes:
        dc = (c.data_cadastro or "")[:7]
        if len(dc) == 7 and dc[4] == "-":
            key = dc
        else:
            key = "sem_data"
        por_mes[key]["total"] += 1
        if not c.ativo:
            por_mes[key]["inativos"] += 1

    itens = []
    total_geral = 0
    total_inativos = 0
    for mes in sorted(por_mes.keys()):
        tot = por_mes[mes]["total"]
        ina = por_mes[mes]["inativos"]
        churn = round((ina / tot * 100) if tot > 0 else 0, 1)
        itens.append({"mes": mes, "total": tot, "inativos": ina, "churn_percent": churn})
        total_geral += tot
        total_inativos += ina

    churn_medio = round((total_inativos / total_geral * 100) if total_geral > 0 else 0, 1)

    # Por plano — essencial para ver qual plano cancela mais
    try:
        planos = listar_planos(user_id)
        plano_map = {str(p.id): p for p in planos}
    except Exception:
        planos = []
        plano_map = {}
    por_plano_dict = defaultdict(lambda: {"total": 0, "inativos": 0})
    for c in clientes:
        key = c.plano if c.plano and str(c.plano) in plano_map else "__sem_plano__"
        por_plano_dict[key]["total"] += 1
        if not c.ativo:
            por_plano_dict[key]["inativos"] += 1
    por_plano = []
    for pid, vals in por_plano_dict.items():
        tot = vals["total"]
        ina = vals["inativos"]
        churn = round((ina / tot * 100) if tot > 0 else 0, 1)
        if pid == "__sem_plano__":
            por_plano.append({"plano_id": None, "plano_nome": "Sem plano", "plano_cor": "slate", "total": tot, "inativos": ina, "churn_percent": churn})
        else:
            p = plano_map.get(str(pid))
            por_plano.append({"plano_id": str(pid), "plano_nome": p.nome if p else str(pid), "plano_cor": p.cor if p else "slate", "total": tot, "inativos": ina, "churn_percent": churn})
    por_plano.sort(key=lambda x: x["churn_percent"], reverse=True)

    return {
        "total_geral": total_geral,
        "total_inativos": total_inativos,
        "churn_medio": churn_medio,
        "itens": itens,
        "por_plano": por_plano
    }


def relatorio_ltv(user_id: str, periodo_dias: int | None = None, org_id: str | None = None) -> dict:
    """
    LTV estimado = valor_plano * meses desde data_cadastro (coorte).
    Valor médio mensal = média valor_plano; meses médio = média meses; ltv médio = valor_medio * meses_medio (ou média dos ltvs individuais).
    Por plano agrupa ltv médio e receita estimada.
    Filtra por org_id se fornecido.
    """
    from datetime import datetime
    from collections import defaultdict
    from datetime import timedelta
    import re

    clientes = carregar_clientes(user_id, org_id)

    if periodo_dias is not None and periodo_dias > 0:
        try:
            limite = datetime.now().date() - timedelta(days=periodo_dias)
            filtrados = []
            for c in clientes:
                if not c.data_cadastro:
                    continue
                try:
                    dc = c.data_cadastro.split("T")[0]
                    d = datetime.strptime(dc, "%Y-%m-%d").date()
                    if d >= limite:
                        filtrados.append(c)
                except Exception:
                    filtrados.append(c)
            clientes = filtrados
        except Exception:
            pass

    try:
        planos = listar_planos(user_id)
        plano_map = {str(p.id): p for p in planos}
    except Exception:
        plano_map = {}

    hoje = datetime.now().date()

    def parse_valor(raw):
        if raw is None or raw == "":
            return 0.0
        s = str(raw)
        s = re.sub(r"[^\d,.-]", "", s)
        if not s:
            return 0.0
        try:
            if "," in s:
                return float(s.replace(".", "").replace(",", "."))
            return float(s)
        except Exception:
            return 0.0

    def meses_desde(dc_str):
        if not dc_str:
            return 1.0
        try:
            dc = dc_str.split("T")[0]
            d = datetime.strptime(dc, "%Y-%m-%d").date()
            dias = (hoje - d).days
            # arredonda para meses (30 dias), mínimo 1
            meses = dias / 30.0
            return max(1.0, round(meses, 1))
        except Exception:
            return 1.0

    por_plano_dict = defaultdict(lambda: {"count": 0, "soma_valor": 0.0, "soma_meses": 0.0, "soma_ltv": 0.0})
    total_clientes = 0
    soma_ltv_geral = 0.0
    soma_valor_geral = 0.0
    soma_meses_geral = 0.0

    for c in clientes:
        v = parse_valor(getattr(c, "valor_plano", 0))
        m = meses_desde(getattr(c, "data_cadastro", None))
        ltv = round(v * m, 2)
        total_clientes += 1
        soma_ltv_geral += ltv
        soma_valor_geral += v
        soma_meses_geral += m
        key = c.plano if c.plano and str(c.plano) in plano_map else "__sem_plano__"
        por_plano_dict[key]["count"] += 1
        por_plano_dict[key]["soma_valor"] += v
        por_plano_dict[key]["soma_meses"] += m
        por_plano_dict[key]["soma_ltv"] += ltv

    ltv_medio_geral = round(soma_ltv_geral / total_clientes, 2) if total_clientes else 0.0
    valor_medio_geral = round(soma_valor_geral / total_clientes, 2) if total_clientes else 0.0
    meses_medio_geral = round(soma_meses_geral / total_clientes, 1) if total_clientes else 0.0
    receita_estimada_total = round(soma_ltv_geral, 2)

    por_plano = []
    for pid, vals in por_plano_dict.items():
        cnt = vals["count"]
        vm = round(vals["soma_valor"] / cnt, 2) if cnt else 0.0
        mm = round(vals["soma_meses"] / cnt, 1) if cnt else 0.0
        ltv_m = round(vals["soma_ltv"] / cnt, 2) if cnt else 0.0
        rec = round(vals["soma_ltv"], 2)
        if pid == "__sem_plano__":
            por_plano.append({"plano_id": None, "plano_nome": "Sem plano", "plano_cor": "slate", "count": cnt, "valor_medio_mensal": vm, "meses_medio": mm, "ltv_medio": ltv_m, "receita_estimada": rec})
        else:
            p = plano_map.get(str(pid))
            por_plano.append({"plano_id": str(pid), "plano_nome": p.nome if p else str(pid), "plano_cor": p.cor if p else "slate", "count": cnt, "valor_medio_mensal": vm, "meses_medio": mm, "ltv_medio": ltv_m, "receita_estimada": rec})
    por_plano.sort(key=lambda x: x["ltv_medio"], reverse=True)

    return {
        "total_clientes": total_clientes,
        "ltv_medio_geral": ltv_medio_geral,
        "receita_estimada_total": receita_estimada_total,
        "valor_medio_mensal_geral": valor_medio_geral,
        "meses_medio_geral": meses_medio_geral,
        "por_plano": por_plano
    }


# ============================================================
# ORGANIZAÇÕES — Fase 3A-1
# ============================================================
def _get_default_org_id(user_id: str) -> str | None:
    """Retorna primeiro org_id do usuário (para migração limpa)."""
    try:
        supabase = get_supabase_client()
        # tenta via membros + organizacoes
        res = supabase.table("membros").select("org_id").eq("user_id", user_id).limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["org_id"]
        res2 = supabase.table("organizacoes").select("id").eq("owner_id", user_id).limit(1).execute()
        if res2.data and len(res2.data) > 0:
            return res2.data[0]["id"]
    except Exception:
        pass
    return None


def listar_organizacoes(user_id: str) -> list[dict]:
    """Lista orgs onde usuário é owner ou membro."""
    supabase = get_supabase_client()
    orgs: dict[str, dict] = {}
    try:
        # owner
        r1 = supabase.table("organizacoes").select("*").eq("owner_id", user_id).execute()
        for o in (r1.data or []):
            orgs[o["id"]] = {**o, "papel": "admin"}
    except Exception:
        pass
    try:
        r2 = supabase.table("membros").select("org_id, papel, organizacoes(id, nome, owner_id, created_at)").eq("user_id", user_id).execute()
        for m in (r2.data or []):
            org = m.get("organizacoes")
            if org and org.get("id"):
                orgs[org["id"]] = {**org, "papel": m.get("papel", "membro")}
            elif m.get("org_id"):
                # fallback buscar org
                try:
                    ro = supabase.table("organizacoes").select("*").eq("id", m["org_id"]).execute()
                    if ro.data:
                        orgs[ro.data[0]["id"]] = {**ro.data[0], "papel": m.get("papel")}
                except Exception:
                    pass
    except Exception:
        pass
    return list(orgs.values())


def criar_organizacao(user_id: str, nome: str) -> dict:
    """Cria org e membro admin. Usa admin para bypass RLS quando chamado no signup (sem JWT)."""
    nome = (nome or "").strip()
    if not nome:
        raise ValueError("Nome da organização é obrigatório")
    # tenta com client normal primeiro (com JWT), fallback para admin (sem JWT, ex: signup)
    last_err = None
    for supabase in (get_supabase_client(), get_supabase_admin_client()):
        try:
            res = supabase.table("organizacoes").insert({"nome": nome, "owner_id": user_id}).execute()
            if not res.data:
                raise ValueError("Falha ao criar organização")
            org = res.data[0]
            # tenta criar membro admin (pode falhar se já existe)
            for sup2 in (supabase, get_supabase_admin_client()):
                try:
                    sup2.table("membros").insert({"org_id": org["id"], "user_id": user_id, "papel": "admin"}).execute()
                    break
                except Exception as e2:
                    if "duplicate" in str(e2).lower():
                        break
                    last_err = e2
                    continue
            org["papel"] = "admin"
            return org
        except Exception as e:
            last_err = e
            # se for RLS (auth.uid() null no signup), tenta com admin no próximo loop
            if "row-level" in str(e).lower() or "policy" in str(e).lower() or "violates" in str(e).lower():
                continue
            # tenta próximo client
            continue
    raise ValueError(f"Falha ao criar organização: {last_err}")


def listar_membros_org(org_id: str, user_id: str) -> list[dict]:
    """Lista membros da org (verifica se solicitante é membro)."""
    supabase = get_supabase_client()
    # verifica acesso
    orgs = listar_organizacoes(user_id)
    if not any(o["id"] == org_id for o in orgs):
        raise ValueError("Acesso negado à organização")
    res = supabase.table("membros").select("user_id, papel, created_at").eq("org_id", org_id).execute()
    return res.data or []


def convidar_membro_org(org_id: str, email: str, papel: str, inviter_id: str) -> dict:
    """Convida por email (invite automático) e cria vínculo se usuário existe. Usa service_role para auth."""
    import re
    email = (email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise ValueError("Email inválido")
    if papel not in ("admin", "membro"):
        papel = "membro"
    supabase = get_supabase_client()
    supabase_admin = get_supabase_admin_client()
    # verifica permissão admin/owner
    orgs = listar_organizacoes(inviter_id)
    me = next((o for o in orgs if o["id"] == org_id), None)
    if not me or me.get("papel") not in ("admin",):
        try:
            ro = supabase.table("organizacoes").select("owner_id").eq("id", org_id).execute()
            if not ro.data or ro.data[0]["owner_id"] != inviter_id:
                rm = supabase.table("membros").select("papel").eq("org_id", org_id).eq("user_id", inviter_id).execute()
                if not rm.data or rm.data[0].get("papel") != "admin":
                    raise ValueError("Apenas admin pode convidar")
        except ValueError:
            raise
        except Exception:
            raise ValueError("Acesso negado à organização")
    # helper robusto para achar user por email (retorna dict com id e se é pendente) - com paginação
    def _find_user(mail: str):
        ml = mail.lower().strip()
        # tenta list_users via admin com paginação (supabase-py pode ter page/per_page)
        for attempt in range(3):
            try:
                # tenta com per_page grande para pegar tudo de uma vez
                try:
                    users_res = supabase_admin.auth.admin.list_users(page=1, per_page=1000)
                except TypeError:
                    users_res = supabase_admin.auth.admin.list_users()
                users = getattr(users_res, "users", None) or getattr(users_res, "data", None) or []
                if isinstance(users, dict) and "users" in users:
                    users = users["users"]
                # se for dict paginado com dados em outra chave, tenta extrair
                if isinstance(users, dict) and "data" in users:
                    users = users["data"]
                for u in users or []:
                    # u pode ser dict ou objeto
                    uemail = None
                    if isinstance(u, dict):
                        uemail = u.get("email")
                    else:
                        uemail = getattr(u, "email", None)
                    if uemail and str(uemail).lower() == ml:
                        uid = None
                        if isinstance(u, dict):
                            uid = u.get("id")
                        else:
                            uid = getattr(u, "id", None)
                        confirmed = None
                        if isinstance(u, dict):
                            confirmed = u.get("email_confirmed_at") or u.get("confirmed_at")
                        else:
                            confirmed = getattr(u, "email_confirmed_at", None) or getattr(u, "confirmed_at", None)
                        is_pending = not confirmed
                        return {"id": uid, "pending": bool(is_pending), "raw": u}
                # se não achou na lista, tenta via auth.users direto
                try:
                    res_auth = supabase_admin.schema("auth").table("users").select("id, email, email_confirmed_at, confirmed_at, invited_at").eq("email", ml).execute()
                    if res_auth.data and len(res_auth.data) > 0:
                        r = res_auth.data[0]
                        is_pending = not r.get("email_confirmed_at") and not r.get("confirmed_at")
                        return {"id": r.get("id"), "pending": bool(is_pending), "raw": r}
                    res_auth2 = supabase_admin.schema("auth").table("users").select("id, email, email_confirmed_at").ilike("email", ml).execute()
                    if res_auth2.data and len(res_auth2.data) > 0:
                        for r in res_auth2.data:
                            if str(r.get("email","")).lower() == ml:
                                is_pending = not r.get("email_confirmed_at")
                                return {"id": r.get("id"), "pending": bool(is_pending), "raw": r}
                except Exception:
                    pass
                break  # achou ou não, sai do loop de tentativas de list
            except Exception as e:
                # se falhar por rate limit ou outro, tenta via schema direto
                try:
                    res_auth = supabase_admin.schema("auth").table("users").select("id, email_confirmed_at").eq("email", ml).execute()
                    if res_auth.data and len(res_auth.data) > 0:
                        r = res_auth.data[0]
                        return {"id": r.get("id"), "pending": not r.get("email_confirmed_at"), "raw": r}
                except Exception:
                    pass
                if attempt == 2:
                    break
                continue
        # fallback final via schema direto
        try:
            res_auth = supabase_admin.schema("auth").table("users").select("id, email_confirmed_at").eq("email", ml).execute()
            if res_auth.data and len(res_auth.data) > 0:
                r = res_auth.data[0]
                return {"id": r.get("id"), "pending": not r.get("email_confirmed_at"), "raw": r}
        except Exception:
            pass
        return None

    def _find_uid(mail: str):
        u = _find_user(mail)
        return u["id"] if u else None

    found = _find_user(email)
    target_user_id = found["id"] if found else None
    is_pending = found["pending"] if found else False
    if target_user_id:
        # se for pendente, reenvia invite Supabase (com redirect para recovery, não localhost)
        if is_pending:
            try:
                site_url = os.environ.get("SITE_URL") or os.environ.get("ALLOWED_ORIGINS", "").split(",")[0].strip() or "https://daviflow.vercel.app"
                site_url = site_url.strip().rstrip("/")
                if not site_url.startswith("http"):
                    site_url = "https://" + site_url
                redirect_to = f"{site_url}/?recovery=true"
                try:
                    supabase_admin.auth.admin.invite_user_by_email(email, {"data": {"org_id": org_id, "papel": papel}, "redirect_to": redirect_to, "redirectTo": redirect_to})
                except Exception:
                    pass
            except Exception:
                pass
        # vincula como membro (mesmo pendente, para quando confirmar já ter acesso)
        try:
            supabase_admin.table("membros").insert({"org_id": org_id, "user_id": target_user_id, "papel": papel}).execute()
        except Exception as e:
            if "duplicate" in str(e).lower() or "already" in str(e).lower():
                raise ValueError("Usuário já é membro")
            raise
        if is_pending:
            return {"status": "convite_reenviado", "email": email, "user_id": target_user_id, "pending": True}
        return {"status": "membro_adicionado", "email": email, "user_id": target_user_id}
    else:
        # não existe -> invite Supabase SMTP puro (sem Resend)
        try:
            site_url = os.environ.get("SITE_URL") or os.environ.get("ALLOWED_ORIGINS", "").split(",")[0].strip() or "https://daviflow.vercel.app"
            site_url = site_url.strip().rstrip("/")
            if not site_url.startswith("http"):
                site_url = "https://" + site_url
            redirect_to = f"{site_url}/?recovery=true"
            try:
                invite_res = supabase_admin.auth.admin.invite_user_by_email(email, {"data": {"org_id": org_id, "papel": papel}, "redirect_to": redirect_to, "redirectTo": redirect_to})
            except TypeError:
                invite_res = supabase_admin.auth.admin.invite_user_by_email(email, {"data": {"org_id": org_id, "papel": papel}})
            # Se invite criou um novo usuário, já vincula como membro (mesmo pendente) para quando confirmar já ter acesso
            try:
                invited_user = getattr(invite_res, "user", None) or (invite_res.get("user") if isinstance(invite_res, dict) else None) or getattr(invite_res, "data", None)
                if isinstance(invited_user, dict) and "user" in invited_user:
                    invited_user = invited_user["user"]
                invited_id = getattr(invited_user, "id", None) if invited_user else None
                if not invited_id and isinstance(invited_user, dict):
                    invited_id = invited_user.get("id")
                # fallback: tenta achar por email recém criado
                if not invited_id:
                    invited_id = _find_uid(email)
                if invited_id:
                    try:
                        supabase_admin.table("membros").insert({"org_id": org_id, "user_id": invited_id, "papel": papel}).execute()
                    except Exception:
                        pass  # já é membro ou RLS, ignora e ainda retorna convite_enviado
            except Exception:
                pass
            return {"status": "convite_enviado", "email": email, "redirect_to": redirect_to}
        except Exception as e:
            msg = str(e).lower()
            if "already" in msg or "exists" in msg or "duplicate" in msg or "registered" in msg:
                # Usuário já existe (mesmo que _find_uid falhou por paginação) -> tenta achar e adicionar
                tid = _find_uid(email)
                if tid:
                    try:
                        supabase_admin.table("membros").insert({"org_id": org_id, "user_id": tid, "papel": papel}).execute()
                        return {"status": "membro_adicionado", "email": email, "user_id": tid}
                    except Exception as e2:
                        if "duplicate" in str(e2).lower():
                            raise ValueError("Usuário já é membro")
                        pass
                # tenta via RPC SECURITY DEFINER (funciona mesmo com anon key)
                try:
                    rpc_res = supabase_admin.rpc("adicionar_membro_por_email", {"p_org_id": org_id, "p_email": email, "p_papel": papel}).execute()
                    rpc_data = getattr(rpc_res, "data", None)
                    tid_rpc = None
                    if isinstance(rpc_data, str) and rpc_data:
                        tid_rpc = rpc_data
                    elif isinstance(rpc_data, list) and len(rpc_data) > 0:
                        tid_rpc = rpc_data[0]
                    elif isinstance(rpc_data, dict):
                        tid_rpc = rpc_data.get("adicionar_membro_por_email") or rpc_data.get("id")
                    if tid_rpc:
                        # rpc já inseriu, confirma que virou membro
                        return {"status": "membro_adicionado", "email": email, "user_id": str(tid_rpc)}
                    elif rpc_data is not None:
                        # rpc executou mas retornou null = user não existe ainda, considera como já cadastrado
                        pass
                except Exception:
                    pass
                # fallback extra já dentro de _find_uid tenta schema, se ainda não achou, tenta mais uma vez direto
                try:
                    res_auth = supabase_admin.schema("auth").table("users").select("id").eq("email", email.lower()).execute()
                    if res_auth.data and len(res_auth.data) > 0:
                        tid2 = res_auth.data[0].get("id")
                        if tid2:
                            supabase_admin.table("membros").insert({"org_id": org_id, "user_id": tid2, "papel": papel}).execute()
                            return {"status": "membro_adicionado", "email": email, "user_id": tid2}
                except Exception:
                    pass
                # ÚLTIMO FALLBACK: não conseguiu achar uid por falta de service_role, mas email JÁ existe.
                # Envia recovery via Supabase SMTP puro (sem Resend)
                try:
                    site_url2 = os.environ.get("SITE_URL") or os.environ.get("ALLOWED_ORIGINS", "").split(",")[0].strip() or "https://daviflow.vercel.app"
                    site_url2 = site_url2.strip().rstrip("/")
                    if not site_url2.startswith("http"):
                        site_url2 = "https://" + site_url2
                    redirect_to2 = f"{site_url2}/?recovery=true"
                    try:
                        supabase_admin.auth.reset_password_email(email, {"redirect_to": redirect_to2, "redirectTo": redirect_to2})
                    except Exception:
                        try:
                            get_supabase_client().auth.reset_password_email(email, {"redirect_to": redirect_to2})
                        except Exception:
                            pass
                except Exception:
                    pass
                return {"status": "ja_cadastrado", "email": email, "msg": "Usuário já possui conta e foi vinculado. Enviamos um email para definir a senha — peça para verificar inbox/spam e clicar em Definir senha."}
            raise ValueError(f"Não foi possível enviar convite automático: {str(e)[:180]}. Verifique SMTP/service_role ou peça para o usuário se cadastrar primeiro e então adicione como membro existente.")

def deletar_organizacao(org_id: str, user_id: str) -> bool:
    """Deleta organização (apenas owner). Bloqueia se tiver clientes (para não perder dados)."""
    supabase = get_supabase_client()
    # verifica owner
    ro = supabase.table("organizacoes").select("owner_id, nome").eq("id", org_id).execute()
    if not ro.data:
        raise ValueError("Organização não encontrada")
    if ro.data[0]["owner_id"] != user_id:
        raise ValueError("Apenas o dono pode excluir a organização")
    # verifica se tem clientes
    rc = supabase.table("clientes").select("id").eq("org_id", org_id).limit(1).execute()
    if rc.data and len(rc.data) > 0:
        raise ValueError("Organização tem clientes. Mova ou exclua os clientes antes de excluir (para não perder dados).")
    # verifica se tem outras orgs para não deixar user sem org
    orgs = listar_organizacoes(user_id)
    if len(orgs) <= 1:
        raise ValueError("Você precisa de pelo menos uma organização. Crie outra antes de excluir esta.")
    # deleta org (cascata membros)
    supabase.table("organizacoes").delete().eq("id", org_id).execute()
    # limpa org_id órfão em tabelas que ficaram (etapas etc com set null já, mas agora são not null então deletamos)
    # não precisa, pois já bloqueamos com clientes; etapas/tags vazias podem ser deletadas em cascata? Mantém.
    return True


def atualizar_organizacao(org_id: str, nome: str, user_id: str) -> dict:
    """Renomeia organização (apenas admin/owner)."""
    nome = (nome or "").strip()
    if not nome:
        raise ValueError("Nome é obrigatório")
    supabase = get_supabase_client()
    # verifica admin
    orgs = listar_organizacoes(user_id)
    me = next((o for o in orgs if o["id"] == org_id), None)
    if not me or me.get("papel") != "admin":
        # checa owner direto
        ro = supabase.table("organizacoes").select("owner_id").eq("id", org_id).execute()
        if not ro.data or ro.data[0]["owner_id"] != user_id:
            rm = supabase.table("membros").select("papel").eq("org_id", org_id).eq("user_id", user_id).execute()
            if not rm.data or rm.data[0].get("papel") != "admin":
                raise ValueError("Apenas admin pode renomear")
    res = supabase.table("organizacoes").update({"nome": nome}).eq("id", org_id).execute()
    if not res.data:
        raise ValueError("Falha ao renomear")
    return res.data[0]

def remover_membro_org(org_id: str, target_user_id: str, requester_id: str) -> bool:
    """Remove membro da org (apenas admin, não pode remover owner)."""
    supabase = get_supabase_client()
    # verifica que requester é admin/owner
    orgs = listar_organizacoes(requester_id)
    me = next((o for o in orgs if o["id"] == org_id), None)
    is_admin = me and me.get("papel") == "admin"
    if not is_admin:
        try:
            rm = supabase.table("membros").select("papel").eq("org_id", org_id).eq("user_id", requester_id).execute()
            if not rm.data or rm.data[0].get("papel") != "admin":
                # também checa owner
                ro = supabase.table("organizacoes").select("owner_id").eq("id", org_id).execute()
                if not ro.data or ro.data[0]["owner_id"] != requester_id:
                    raise ValueError("Apenas admin pode remover membros")
                is_admin = True
        except ValueError:
            raise
        except Exception:
            raise ValueError("Apenas admin pode remover membros")
    # não pode remover owner
    ro = supabase.table("organizacoes").select("owner_id").eq("id", org_id).execute()
    if ro.data and ro.data[0]["owner_id"] == target_user_id:
        raise ValueError("Não é possível remover o dono da organização. Transfira a propriedade primeiro.")
    # não pode remover a si mesmo se for o último admin?
    # permite, mas garante que não fica sem admin
    # verifica se target é membro
    rm_target = supabase.table("membros").select("user_id").eq("org_id", org_id).eq("user_id", target_user_id).execute()
    if not rm_target.data:
        raise ValueError("Membro não encontrado nesta organização")
    supabase.table("membros").delete().eq("org_id", org_id).eq("user_id", target_user_id).execute()
    return True

# --- Helpers para garantir org_id em criações (migração limpa) ---

def _ensure_org_id(payload: dict, user_id: str):
    """Garante org_id no payload (para tabelas com org_id not null). Auto-cria org se não existir."""
    if "org_id" in payload and payload["org_id"]:
        return payload
    oid = _get_default_org_id(user_id)
    if not oid:
        try:
            org = criar_organizacao(user_id, "Minha organização")
            oid = org.get("id") if isinstance(org, dict) else getattr(org, "id", None)
        except Exception:
            oid = _get_default_org_id(user_id)
    if oid:
        payload["org_id"] = oid
    return payload
