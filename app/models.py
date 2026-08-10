from enum import Enum
from pydantic import BaseModel, EmailStr
from datetime import date
from typing import Optional

#Classe que irá guardar os níveis que os clientes podem escolher
class PlanoEnum(str, Enum):
    BRONZE = "bronze"
    PRATA = "prata"
    OURO = "ouro"

#Plano de criação da conta do cliente sendo as informações que o programa irá receber
class ClienteCreate(BaseModel):
    nome: str
    email:EmailStr
    plano: PlanoEnum
    ativo: bool = True

#Mensagem de retorno das informações do cliente com a data de cadastro (log de registro)
class Cliente(ClienteCreate):
    id: int
    data_cadastro: date

