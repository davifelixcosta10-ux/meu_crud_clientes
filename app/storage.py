from app.models import UserLogin
from app.models import UserSignUp
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from app.models import Cliente

# Carrega variáveis de ambiente de .env ou data/arquivos.env
load_dotenv()
if not os.environ.get("SUPABASE_URL"):
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "data", "arquivos.env"))

def get_supabase_client() -> Client:
    url: str = os.environ.get("SUPABASE_URL", "")
    key: str = os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        raise ValueError("SUPABASE_URL e SUPABASE_KEY não foram encontrados nas variáveis de ambiente.")
    return create_client(url, key)

#FUNÇÕES DO AUTH
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
    # Converte os registros do banco diretamente para instâncias da classe Cliente
    return [Cliente.model_validate(item) for item in response.data]


def salvar_novo_cliente(cliente_dados: dict, user_id: str) -> Cliente:
    supabase = get_supabase_client()
    # Adiciona o user_id ao dicionário de dados do cliente
    cliente_dados["user_id"] = user_id
    # Insere um novo cliente no Supabase
    response = supabase.table("clientes").insert(cliente_dados).execute()
    return Cliente.model_validate(response.data[0])


def atualizar_cliente_db(cliente_id: int | str, cliente_dados: dict, user_id: str) -> Cliente | None:
    supabase = get_supabase_client()
    # Filtra chaves com valor None para atualizações parciais
    dados_filtrados = {k: v for k, v in cliente_dados.items() if v is not None}
    response = supabase.table("clientes").update(dados_filtrados).eq("id", cliente_id).eq("user_id", user_id).execute()
    if response.data:
        return Cliente.model_validate(response.data[0])
    return None


def deletar_cliente_db(cliente_id: int | str, user_id: str) -> bool:
    supabase = get_supabase_client()
    response = supabase.table("clientes").delete().eq("id", cliente_id).eq("user_id", user_id).execute()
    return len(response.data) > 0