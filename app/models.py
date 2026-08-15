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
    nome: str
    email: str
    ativo: Optional[bool] = True
    plano: Optional[str] = "Básico"
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    usa_plano: Optional[bool] = False
    valor_plano: Optional[float] = 0.0

class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    ativo: Optional[bool] = None
    plano: Optional[str] = None
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    usa_plano: Optional[bool] = None
    valor_plano: Optional[float] = None