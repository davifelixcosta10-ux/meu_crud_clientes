import os
from dotenv import load_dotenv
from supabase import create_client, Client
from app.models import Cliente, Plano, UserLogin, UserSignUp

# Carrega variáveis de ambiente de .env ou data/arquivos.env
load_dotenv()
if not os.environ.get("SUPABASE_URL"):
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "data", "arquivos.env"))

# --- SINGLETON: cliente Supabase reutilizado por processo ---
_supabase_client: Client | None = None


def get_supabase_client() -> Client:
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
# FUNÇÕES DE AUTENTICAÇÃO
# ============================================================

def registrar_usuario(dados: UserSignUp):
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
    supabase = get_supabase_client()
    return supabase.auth.sign_in_with_password({
        "email":    dados.email,
        "password": dados.password,
    })


# ============================================================
# FUNÇÕES DE PLANOS (dinâmicos por usuário)
# ============================================================

def listar_planos(user_id: str) -> list[Plano]:
    supabase = get_supabase_client()
    response = (
        supabase.table("planos")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return [Plano.model_validate(item) for item in response.data]


def criar_plano(dados: dict, user_id: str) -> Plano:
    supabase = get_supabase_client()
    payload = {
        "user_id":   user_id,
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
    supabase = get_supabase_client()
    dados_filtrados = {k: v for k, v in dados.items() if v is not None}
    if not dados_filtrados:
        return None
    response = (
        supabase.table("planos")
        .update(dados_filtrados)
        .eq("id", plano_id)
        .eq("user_id", user_id)
        .execute()
    )
    if response.data:
        return Plano.model_validate(response.data[0])
    return None


def deletar_plano(plano_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    response = (
        supabase.table("planos")
        .delete()
        .eq("id", plano_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(response.data) > 0


# ============================================================
# FUNÇÕES DE CLIENTES (isolados por user_id)
# ============================================================

# Colunas que existem na tabela `clientes` do Supabase
_COLUNAS_CLIENTE = [
    "user_id", "nome", "email", "plano", "ativo", "data_cadastro",
    "telefone", "cpf", "rg",
    "data_nascimento", "genero", "empresa", "cargo", "observacoes",
    "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado",
]


def carregar_clientes(user_id: str) -> list[Cliente]:
    supabase = get_supabase_client()
    response = (
        supabase.table("clientes")
        .select("*")
        .eq("user_id", user_id)
        .order("data_cadastro", desc=True)
        .execute()
    )
    return [Cliente.model_validate(item) for item in response.data]


def salvar_novo_cliente(cliente_dados: dict, user_id: str) -> Cliente:
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
    supabase = get_supabase_client()

    # IMPORTANTE: usa "is not None" para preservar valores falsy válidos
    # como ativo=False, valor_plano=0.0, etc.
    dados_filtrados = {k: v for k, v in cliente_dados.items() if v is not None}
    if not dados_filtrados:
        return None

    response = (
        supabase.table("clientes")
        .update(dados_filtrados)
        .eq("id", cliente_id)
        .eq("user_id", user_id)
        .execute()
    )
    if response.data:
        return Cliente.model_validate(response.data[0])
    return None


def deletar_cliente_db(cliente_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    response = (
        supabase.table("clientes")
        .delete()
        .eq("id", cliente_id)
        .eq("user_id", user_id)
        .execute()
    )
    return len(response.data) > 0