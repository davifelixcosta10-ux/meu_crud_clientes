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


def carregar_clientes() -> list[Cliente]:
    supabase = get_supabase_client()
    response = supabase.table("clientes").select("*").execute()
    # Converte os registros do banco diretamente para instâncias da classe Cliente
    return [Cliente.model_validate(item) for item in response.data]


def salvar_novo_cliente(cliente_dados: dict) -> Cliente:
    supabase = get_supabase_client()
    # Insere um novo cliente no Supabase
    response = supabase.table("clientes").insert(cliente_dados).execute()
    return Cliente.model_validate(response.data[0])


def atualizar_cliente_db(cliente_id: int, cliente_dados: dict) -> Cliente | None:
    supabase = get_supabase_client()
    # Atualiza apenas os campos passados
    response = supabase.table("clientes").update(cliente_dados).eq("id", cliente_id).execute()
    if response.data:
        return Cliente.model_validate(response.data[0])
    return None


def deletar_cliente_db(cliente_id: int) -> bool:
    supabase = get_supabase_client()
    response = supabase.table("clientes").delete().eq("id", cliente_id).execute()
    return len(response.data) > 0