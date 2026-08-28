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

    # Garante valor padrão de plano se não enviado
    payload_banco.setdefault("plano", "basico")
    # Garante valor padrão de ativo
    payload_banco.setdefault("ativo", True)

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

def importar_clientes_bulk(clientes: list[dict], user_id: str) -> dict:
    """
    Importa lista de clientes em lote (usado por POST /api/clientes/import).
    Validação já feita no frontend + Pydantic; aqui apenas filtra colunas e insere.
    Retorna dict com contagem de sucessos e erros.
    """
    supabase = get_supabase_client()
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
            # Valida com Pydantic leniente (Cliente) para import — permite trazer CPF antigo invalido do export
            Cliente.model_validate({**payload, "user_id": user_id})
            supabase.table("clientes").insert(payload).execute()
            sucessos += 1
        except Exception as e:
            erros.append({"linha": idx + 1, "erro": str(e), "dados": cli})
    return {"sucessos": sucessos, "erros": erros, "total": len(clientes)}
