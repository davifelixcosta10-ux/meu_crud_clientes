from pydantic import BaseModel, EmailStr
from typing import Optional, Union


# ============================================================
# MODELOS DE AUTENTICAÇÃO
# ============================================================

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


# ============================================================
# MODELOS DE PLANOS (dinâmicos por usuário)
# ============================================================

class PlanoCreate(BaseModel):
    """Dados para criar um plano personalizado do usuário."""
    nome: str                          # Ex: "Mensal", "VIP", "Ouro"
    cor: Optional[str] = "indigo"      # Slug: indigo, cyan, emerald, amber, rose, purple, slate, orange
    descricao: Optional[str] = None    # Texto livre de descrição
    valor: Optional[str] = None        # Ex: "R$ 150/mês" — texto livre


class PlanoUpdate(BaseModel):
    """Dados para atualização parcial de um plano."""
    nome: Optional[str] = None
    cor: Optional[str] = None
    descricao: Optional[str] = None
    valor: Optional[str] = None


class Plano(BaseModel):
    """Representação completa de um plano retornado pela API."""
    id: Union[int, str]
    user_id: str
    nome: str
    cor: Optional[str] = "indigo"
    descricao: Optional[str] = None
    valor: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# MODELOS DE CLIENTES
# ============================================================

class Cliente(BaseModel):
    """Representação completa de um cliente retornado pela API."""
    id: Optional[Union[int, str]] = None
    user_id: Optional[str] = None
    # Dados básicos
    nome: str
    email: str
    plano: Optional[str] = None        # ID/slug do plano vinculado
    ativo: bool = True
    data_cadastro: Optional[str] = None
    # Contato
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    # Dados pessoais estendidos
    data_nascimento: Optional[str] = None   # ISO: YYYY-MM-DD
    genero: Optional[str] = None            # "M", "F", "Outro"
    empresa: Optional[str] = None
    cargo: Optional[str] = None
    observacoes: Optional[str] = None
    # Endereço
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None           # Sigla: "SP", "RJ"...

    class Config:
        from_attributes = True


class ClienteCreate(BaseModel):
    """Dados recebidos do frontend para criação de um novo cliente."""
    nome: str
    email: EmailStr
    ativo: Optional[bool] = True
    plano: Optional[str] = None
    # Contato
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    # Dados pessoais estendidos
    data_nascimento: Optional[str] = None
    genero: Optional[str] = None
    empresa: Optional[str] = None
    cargo: Optional[str] = None
    observacoes: Optional[str] = None
    # Endereço
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None


class ClienteUpdate(BaseModel):
    """Dados para atualização parcial (PATCH) de um cliente.

    Todos os campos são opcionais. Valores False e 0 são válidos
    e devem ser propagados ao banco (filtro usa `is not None`).
    """
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    ativo: Optional[bool] = None
    plano: Optional[str] = None
    # Contato
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    # Dados pessoais estendidos
    data_nascimento: Optional[str] = None
    genero: Optional[str] = None
    empresa: Optional[str] = None
    cargo: Optional[str] = None
    observacoes: Optional[str] = None
    # Endereço
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None