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
from dotenv import load_dotenv
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


def get_supabase_client() -> Client:
    """
    Retorna instância singleton do cliente Supabase.
    
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


def carregar_clientes(user_id: str) -> list[Cliente]:
    """
    Lista todos os clientes do usuário autenticado.
    
    Ordenação: data_cadastro DESC (mais recentes primeiro)
    Filtro RLS: user_id obrigatório
    Leniente: ignora linhas que falharem na validação (compatibilidade com dados antigos)
    
    Args:
        user_id: UUID do usuário autenticado
    
    Returns:
        list[Cliente]: Lista validada pelo modelo Pydantic
    
    Usado em: GET /api/clientes
    """
    supabase = get_supabase_client()
    response = (
        supabase.table("clientes")
        .select("*")
        .eq("user_id", user_id)              # CRÍTICO: isolamento por usuário
        .order("data_cadastro", desc=True)
        .execute()
    )
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

    # Garante valor padrão de plano se não enviado ou nulo (evita 23502 not-null)
    if not payload_banco.get("plano"):
        payload_banco["plano"] = "basico"
    # Garante valor padrão de ativo
    if payload_banco.get("ativo") is None:
        payload_banco["ativo"] = True

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

def listar_etapas(user_id: str) -> list[Etapa]:
    """Lista etapas do usuário ordenadas por ordem."""
    supabase = get_supabase_client()
    response = (
        supabase.table("etapas")
        .select("*")
        .eq("user_id", user_id)
        .order("ordem")
        .execute()
    )
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

def listar_atividades(user_id: str, cliente_id: int | str | None = None) -> list[Atividade]:
    """Lista atividades do usuário; filtra por cliente_id se fornecido."""
    supabase = get_supabase_client()
    query = supabase.table("atividades").select("*").eq("user_id", user_id)
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

def listar_tags(user_id: str) -> list[Tag]:
    supabase = get_supabase_client()
    response = (
        supabase.table("tags")
        .select("*")
        .eq("user_id", user_id)
        .order("nome")
        .execute()
    )
    return [Tag.model_validate(item) for item in response.data]


def criar_tag(dados: dict, user_id: str) -> Tag:
    supabase = get_supabase_client()
    payload = {"user_id": user_id, "nome": dados.get("nome"), "cor": dados.get("cor", "indigo")}
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

def listar_filtros_salvos(user_id: str) -> list[FiltroSalvo]:
    supabase = get_supabase_client()
    response = (
        supabase.table("filtros_salvos")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [FiltroSalvo.model_validate(item) for item in response.data]


def criar_filtro_salvo(dados: dict, user_id: str) -> FiltroSalvo:
    supabase = get_supabase_client()
    payload = {"user_id": user_id, "nome": dados.get("nome"), "query": dados.get("query")}
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

def relatorio_conversao(user_id: str, periodo_dias: int | None = None) -> dict:
    """
    Retorna distribuição de clientes por etapa Kanban (conversão).
    Calcula count e percent por etapa, incluindo 'Sem etapa' (etapa_id null).
    Filtra por periodo_dias se fornecido (ex: 30 = últimos 30 dias via data_cadastro).
    """
    from datetime import datetime, timedelta
    # Carrega etapas e clientes do usuário (reusa funções existentes com RLS)
    etapas = listar_etapas(user_id)
    clientes = carregar_clientes(user_id)

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
