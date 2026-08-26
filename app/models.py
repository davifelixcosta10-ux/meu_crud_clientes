import re

from pydantic import BaseModel, EmailStr, validator
from typing import Optional, Union


def validar_cpf(cpf: str) -> bool:
    """Valida CPF usando algoritmo módulo 11 (dígitos verificadores)."""
    if not cpf:
        return True  # None/empty é opcional
    
    # Remove caracteres não numéricos
    digits = re.sub(r'\D', '', cpf)
    
    # Deve ter 11 dígitos
    if len(digits) != 11:
        return False
    
    # Bloqueia sequências de dígitos iguais (ex: 111.111.111-11)
    if len(set(digits)) == 1:
        return False
    
    # Calcula primeiro dígito verificador
    soma = sum(int(digits[i]) * (10 - i) for i in range(9))
    resto = (soma * 10) % 11
    if resto == 10:
        resto = 0
    if resto != int(digits[9]):
        return False
    
    # Calcula segundo dígito verificador
    soma = sum(int(digits[i]) * (11 - i) for i in range(10))
    resto = (soma * 10) % 11
    if resto == 10:
        resto = 0
    if resto != int(digits[10]):
        return False
    
    return True


def cpf_validator(v):
    """Validator Pydantic para CPF."""
    if v is None:
        return v
    if not validar_cpf(v):
        raise ValueError("CPF inválido. Verifique os dígitos verificadores.")
    return v


# ============================================================
# MODELOS DE AUTENTICAÇÃO
# ============================================================

class UserSignUp(BaseModel):
    email: EmailStr
    password: str
    nome_completo: Optional[str] = None
    nome_empresa: Optional[str] = None

    @validator("password")
    def password_must_be_at_least_6_chars(cls, v):
        if len(v) < 6:
            raise ValueError("Senha deve ter no mínimo 6 caracteres.")
        return v


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

    @validator("cpf")
    def cpf_must_have_valid_format(cls, v):
        return cpf_validator(v)

    @validator("rg")
    def rg_must_have_valid_format(cls, v):
        if v is None:
            return v
        # Basic format check: should have digits and a dash
        digits = re.sub(r'\D', '', v)
        if len(digits) < 7 or len(digits) > 12:
            raise ValueError("RG com formato inválido.")
        return v

    @validator("telefone")
    def telefone_must_have_valid_format(cls, v):
        if v is None:
            return v
        digits = re.sub(r'\D', '', v)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Telefone com formato inválido.")
        return v

    @validator("data_nascimento")
    def data_nascimento_must_be_iso_format(cls, v):
        if v is None:
            return v
        # Basic ISO format check: YYYY-MM-DD
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Data de nascimento deve estar no formato ISO (YYYY-MM-DD).")
        return v

    class Config:
        from_attributes = True


class ClienteCreate(BaseModel):
    """Dados recebidos do frontend para criação de um novo cliente."""
    nome: str
    email: EmailStr
    ativo: Optional[bool] = True
    plano: Optional[str] = "basico"
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

    @validator("cpf")
    def cpf_must_have_valid_format(cls, v):
        return cpf_validator(v)

    @validator("rg")
    def rg_must_have_valid_format(cls, v):
        if v is None:
            return v
        digits = re.sub(r'\D', '', v)
        if len(digits) < 7 or len(digits) > 12:
            raise ValueError("RG com formato inválido.")
        return v

    @validator("telefone")
    def telefone_must_have_valid_format(cls, v):
        if v is None:
            return v
        digits = re.sub(r'\D', '', v)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Telefone com formato inválido.")
        return v

    @validator("data_nascimento")
    def data_nascimento_must_be_iso_format(cls, v):
        if v is None:
            return v
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Data de nascimento deve estar no formato ISO (YYYY-MM-DD).")
        return v

    # Password validator from UserSignUp won't apply here since there's no password in ClienteCreate


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

    @validator("cpf")
    def cpf_must_have_valid_format(cls, v):
        return cpf_validator(v)

    @validator("rg")
    def rg_must_have_valid_format(cls, v):
        if v is None:
            return v
        digits = re.sub(r'\D', '', v)
        if len(digits) < 7 or len(digits) > 12:
            raise ValueError("RG com formato inválido.")
        return v

    @validator("telefone")
    def telefone_must_have_valid_format(cls, v):
        if v is None:
            return v
        digits = re.sub(r'\D', '', v)
        if len(digits) < 10 or len(digits) > 15:
            raise ValueError("Telefone com formato inválido.")
        return v

    @validator("data_nascimento")
    def data_nascimento_must_be_iso_format(cls, v):
        if v is None:
            return v
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError("Data de nascimento deve estar no formato ISO (YYYY-MM-DD).")
        return v