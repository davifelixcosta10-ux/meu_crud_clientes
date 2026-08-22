import os
from dotenv import load_dotenv
from supabase import create_client, Client
from app.models import Cliente, UserLogin, UserSignUp

# Carrega variáveis de ambiente de .env ou data/arquivos.env
load_dotenv()
if not os.environ.get("SUPABASE_URL"):
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "data", "arquivos.env"))

# --- SINGLETON: cliente Supabase criado uma única vez por processo ---
# Evita abrir uma nova conexão a cada requisição, reduzindo latência.
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


# --- FUNÇÕES DE AUTENTICAÇÃO ---

def registrar_usuario(dados: UserSignUp):
    supabase = get_supabase_client()
    response = supabase.auth.sign_up({
        "email": dados.email,
        "password": dados.password,
        "options": {
            "data": {
                "nome_completo": dados.nome_completo or "",
                "nome_empresa": dados.nome_empresa or ""
            }
        }
    })
    return response


def autenticar_usuario(dados: UserLogin):
    supabase = get_supabase_client()
    response = supabase.auth.sign_in_with_password({
        "email": dados.email,
        "password": dados.password
    })
    return response


# --- FUNÇÕES DE CLIENTES ISOLADOS POR USER_ID ---

def carregar_clientes(user_id: str) -> list[Cliente]:
    supabase = get_supabase_client()
    response = supabase.table("clientes").select("*").eq("user_id", user_id).execute()
    return [Cliente.model_validate(item) for item in response.data]


def salvar_novo_cliente(cliente_dados: dict, user_id: str) -> Cliente:
    supabase = get_supabase_client()

    # Mapeia apenas as colunas aceitas na tabela public.clientes
    payload_banco = {
        "user_id":       user_id,
        "nome":          cliente_dados.get("nome"),
        "email":         cliente_dados.get("email"),
        "plano":         cliente_dados.get("plano"),
        "ativo":         cliente_dados.get("ativo", True),
        "telefone":      cliente_dados.get("telefone"),
        "cpf":           cliente_dados.get("cpf"),
        "rg":            cliente_dados.get("rg"),
        "data_cadastro": cliente_dados.get("data_cadastro"),
    }

    response = supabase.table("clientes").insert(payload_banco).execute()
    if not response.data:
        raise ValueError("Falha ao salvar cliente no banco de dados.")

    return Cliente.model_validate(response.data[0])


def atualizar_cliente_db(cliente_id: int | str, cliente_dados: dict, user_id: str) -> Cliente | None:
    supabase = get_supabase_client()

    # CORREÇÃO CRÍTICA: usar "is not None" em vez de "if v" para preservar
    # valores falsy válidos como ativo=False e valor_plano=0.0.
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