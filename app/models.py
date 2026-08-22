from pydantic import BaseModel, EmailStr
from typing import Optional, Union

# --- MODELOS DE AUTENTICAÇÃO ---

class UserSignUp(BaseModel):
    email: EmailStr
    password: str
    nome_completo: Optional[str] = None
    nome_empresa: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


# --- MODELOS DE CLIENTES ---

class Cliente(BaseModel):
    id: Optional[Union[int, str]] = None
    user_id: Optional[str] = None
    nome: str
    email: str
    plano: Optional[str] = None
    ativo: bool = True
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    data_cadastro: Optional[str] = None

    class Config:
        from_attributes = True


class ClienteCreate(BaseModel):
    """Dados recebidos do frontend para criação de um novo cliente.

    Os campos 'usa_plano' e 'valor_plano' foram removidos pois não existem
    na tabela 'clientes' do Supabase e não são enviados ao banco.
    """
    nome: str
    email: EmailStr          # Validação real de formato de e-mail via Pydantic
    ativo: Optional[bool] = True
    plano: Optional[str] = None
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None


class ClienteUpdate(BaseModel):
    """Dados para atualização parcial (PATCH) de um cliente existente.

    Todos os campos são opcionais; apenas os campos enviados serão atualizados.
    IMPORTANTE: campos com valor False ou 0 (ex: ativo=False) são válidos
    e devem ser propagados ao banco de dados.
    """
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    ativo: Optional[bool] = None
    plano: Optional[str] = None
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None