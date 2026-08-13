from pydantic import BaseModel
from typing import Optional

class Cliente(BaseModel):
    id: Optional[int | str] = None
    nome: str
    email: str
    status: Optional[str] = "Ativo"
    plano: Optional[str] = "Básico"
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    usa_plano: Optional[bool] = False
    valor_plano: Optional[float] = 0.0

    class Config:
        from_attributes = True

class ClienteCreate(BaseModel):
    nome: str
    email: str
    status: Optional[str] = "Ativo"
    plano: Optional[str] = "Básico"
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    usa_plano: Optional[bool] = False
    valor_plano: Optional[float] = 0.0

class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    plano: Optional[str] = None
    telefone: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    usa_plano: Optional[bool] = None
    valor_plano: Optional[float] = None