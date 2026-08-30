"""
===================================================================
DaviFlow API — Modelos Pydantic (Validação e Serialização)
===================================================================
Este módulo define todos os modelos de dados usados na API.
Pydantic v2 fornece validação automática, serialização JSON e documentação OpenAPI.

Estrutura:
1. Modelos de Autenticação (UserSignUp, UserLogin, TokenResponse)
2. Modelos de Planos (PlanoCreate, PlanoUpdate, Plano)
3. Modelos de Clientes (Cliente, ClienteCreate, ClienteUpdate)
4. Validadores customizados (CPF módulo 11, RG, telefone, data_nascimento)

Segurança:
- EmailStr valida formato de e-mail RFC 5322
- CPF validado com algoritmo módulo 11 (dígitos verificadores reais)
- Senha mínima 6 caracteres
- Todos os campos opcionais explícitos (None por padrão)
"""

import re

from pydantic import BaseModel, EmailStr, validator
from typing import Optional, Union


# ============================================================
# FUNÇÕES AUXILIARES DE VALIDAÇÃO
# ============================================================

def validar_cpf(cpf: str) -> bool:
    """
    Valida CPF usando algoritmo módulo 11 (dígitos verificadores oficiais).
    
    Algoritmo:
    1. Remove formatação (pontos, traços)
    2. Verifica 11 dígitos numéricos
    3. Bloqueia sequências inválidas (ex: 111.111.111-11)
    4. Calcula 1º dígito: soma(dígito * peso) onde peso vai de 10 a 2
       resto = (soma * 10) % 11; se 10 -> 0
    5. Calcula 2º dígito: soma(dígito * peso) onde peso vai de 11 a 2
       resto = (soma * 10) % 11; se 10 -> 0
    
    Args:
        cpf: String com ou sem formatação (ex: "529.982.247-25" ou "52998224725")
    
    Returns:
        True se CPF válido, False caso contrário
        Retorna True para None/string vazia (campo opcional)
    """
    if not cpf:
        return True  # None/empty é opcional - não bloqueia
    
    # Remove caracteres não numéricos
    digits = re.sub(r'\D', '', cpf)
    
    # Deve ter exatamente 11 dígitos
    if len(digits) != 11:
        return False
    
    # Bloqueia sequências de dígitos iguais (ex: 111.111.111-11)
    # CPFs válidos nunca têm todos os dígitos idênticos
    if len(set(digits)) == 1:
        return False
    
    # Calcula primeiro dígito verificador
    # Pesos: 10, 9, 8, 7, 6, 5, 4, 3, 2 (para os 9 primeiros dígitos)
    soma = sum(int(digits[i]) * (10 - i) for i in range(9))
    resto = (soma * 10) % 11
    if resto == 10:
        resto = 0
    if resto != int(digits[9]):
        return False
    
    # Calcula segundo dígito verificador
    # Pesos: 11, 10, 9, 8, 7, 6, 5, 4, 3, 2 (para os 10 primeiros dígitos)
    soma = sum(int(digits[i]) * (11 - i) for i in range(10))
    resto = (soma * 10) % 11
    if resto == 10:
        resto = 0
    if resto != int(digits[10]):
        return False
    
    return True


def cpf_validator(v):
    """
    Validator Pydantic para campo CPF.
    Usado via @validator("cpf") nos modelos.
    Levanta ValueError se inválido (Pydantic captura e retorna 422).
    """
    if v is None:
        return v
    if not validar_cpf(v):
        raise ValueError("CPF inválido. Verifique os dígitos verificadores.")
    return v


# ============================================================
# MODELOS DE AUTENTICAÇÃO
# ============================================================

class UserSignUp(BaseModel):
    """
    Dados para cadastro de novo usuário.
    
    Validações automáticas:
    - email: EmailStr (formato RFC 5322)
    - password: mínimo 6 caracteres (validator customizado)
    - nome_completo, nome_empresa: opcionais
    
    Usado em: POST /api/auth/signup
    """
    email: EmailStr
    password: str
    nome_completo: Optional[str] = None
    nome_empresa: Optional[str] = None

    @validator("password")
    def password_must_be_at_least_6_chars(cls, v):
        """Garante senha com pelo menos 6 caracteres (política mínima)."""
        if len(v) < 6:
            raise ValueError("Senha deve ter no mínimo 6 caracteres.")
        return v


class UserLogin(BaseModel):
    """
    Dados para login de usuário existente.
    
    Usado em: POST /api/auth/login
    """
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """
    Resposta de autenticação bem-sucedida.
    
    Campos:
    - access_token: JWT do Supabase (expira em 1h por padrão)
    - token_type: sempre "bearer" (padrão OAuth2)
    - user_id: UUID do usuário autenticado
    - email: e-mail do usuário (para exibição no frontend)
    
    Usado em: resposta de POST /api/auth/login
    """
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


# ============================================================
# MODELOS DE PLANOS (dinâmicos por usuário)
# ============================================================

class PlanoCreate(BaseModel):
    """
    Dados para criar um plano personalizado do usuário.
    
    Campos:
    - nome: obrigatório, ex: "Mensal", "VIP", "Ouro"
    - cor: slug da cor para badge UI (indigo, cyan, emerald, amber, rose, purple, slate, orange)
    - descricao: texto livre opcional
    - valor: texto livre opcional, ex: "R$ 150/mês"
    
    Usado em: POST /api/planos
    """
    nome: str
    cor: Optional[str] = "indigo"
    descricao: Optional[str] = None
    valor: Optional[str] = None


class PlanoUpdate(BaseModel):
    """
    Dados para atualização parcial de um plano (PATCH).
    
    Todos os campos opcionais - apenas campos enviados são atualizados.
    exclude_unset=True no endpoint garante isso.
    
    Usado em: PATCH /api/planos/{plano_id}
    """
    nome: Optional[str] = None
    cor: Optional[str] = None
    descricao: Optional[str] = None
    valor: Optional[str] = None


class Plano(BaseModel):
    """
    Representação completa de um plano retornado pela API.
    
    Inclui ID e user_id (preenchidos pelo banco).
    from_attributes=True permite criar instância a partir de ORM/row do Supabase.
    
    Usado em: resposta de GET/POST/PATCH /api/planos
    """
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
    """
    Representação completa de um cliente retornado pela API.
    
    Contém TODOS os campos (básicos + opcionais).
    id e user_id são preenchidos pelo banco (opcionais aqui para criação).
    from_attributes=True permite criar instância a partir de row do Supabase.
    
    Usado em: resposta de GET/POST/PATCH /api/clientes
    """
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
    # Fase 1 — Kanban e Financeiro
    etapa_id: Optional[Union[int, str]] = None  # FK para etapas (Kanban)
    valor_plano: Optional[str] = None      # ex: "R$ 150" (informativo)

    @validator("valor_plano", pre=True)
    def valor_plano_para_string(cls, v):
        if isinstance(v, (int, float)):
            return f"R$ {v:.2f}".replace(".", ",")
        return v
    vencimento_dia: Optional[int] = None   # 1-31
    status_pagamento: Optional[str] = None # em_dia | atrasado | isento

    # Leituras (GET) são lenientes para compatibilidade com dados antigos:
    # não bloqueiam se CPF for inválido no novo módulo 11, apenas retornam como está.
    @validator("cpf")
    def cpf_must_have_valid_format(cls, v):
        return v

    @validator("rg")
    def rg_must_have_valid_format(cls, v):
        return v

    @validator("telefone")
    def telefone_must_have_valid_format(cls, v):
        return v

    @validator("data_nascimento")
    def data_nascimento_must_be_iso_format(cls, v):
        return v

    @validator("vencimento_dia")
    def vencimento_dia_must_be_valid(cls, v):
        return v

    @validator("status_pagamento")
    def status_pagamento_must_be_valid(cls, v):
        return v

    class Config:
        from_attributes = True


class ClienteCreate(BaseModel):
    """
    Dados recebidos do frontend para criação de um novo cliente.
    
    DIFERENÇA do Cliente: não tem id, user_id, data_cadastro (preenchidos pelo backend).
    Campos obrigatórios: nome, email
    Defaults: ativo=True, plano="basico"
    Validações: CPF, RG, telefone, data_nascimento (mesmos validators do Cliente)
    
    Usado em: POST /api/clientes (body da request)
    """
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
    # Fase 1 — Kanban e Financeiro
    etapa_id: Optional[Union[int, str]] = None
    valor_plano: Optional[str] = None
    vencimento_dia: Optional[int] = None
    status_pagamento: Optional[str] = None

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

    @validator("vencimento_dia")
    def vencimento_dia_must_be_valid(cls, v):
        if v is None:
            return v
        if not 1 <= v <= 31:
            raise ValueError("Vencimento deve ser entre 1 e 31.")
        return v

    @validator("status_pagamento")
    def status_pagamento_must_be_valid(cls, v):
        if v is None:
            return v
        if v not in ("em_dia", "atrasado", "isento"):
            raise ValueError("status_pagamento deve ser em_dia, atrasado ou isento.")
        return v


class ClienteUpdate(BaseModel):
    """
    Dados para atualização parcial (PATCH) de um cliente.

    LENIENTE para compatibilidade com dados antigos (igual Cliente leitura):
    permite manter CPF/telefone/RG/vencimento antigos invalidos ao atualizar
    outros campos como valor_plano. Create continua estrito, Update leniente.
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
    # Fase 1 — Kanban e Financeiro
    etapa_id: Optional[Union[int, str]] = None
    valor_plano: Optional[str] = None
    vencimento_dia: Optional[int] = None
    status_pagamento: Optional[str] = None

    @validator("valor_plano", pre=True)
    def valor_plano_para_string(cls, v):
        if isinstance(v, (int, float)):
            return f"R$ {v:.2f}".replace(".", ",")
        return v

    @validator("cpf")
    def cpf_must_have_valid_format(cls, v):
        return v

    @validator("rg")
    def rg_must_have_valid_format(cls, v):
        return v

    @validator("telefone")
    def telefone_must_have_valid_format(cls, v):
        return v

    @validator("data_nascimento")
    def data_nascimento_must_be_iso_format(cls, v):
        return v
    @validator("vencimento_dia")
    def vencimento_dia_must_be_valid(cls, v):
        return v

    @validator("status_pagamento")
    def status_pagamento_must_be_valid(cls, v):
        return v

# ============================================================
# MODELOS FASE 1 — Kanban, Atividades, Tags, Filtros Salvos
# ============================================================

class EtapaCreate(BaseModel):
    """
    Dados para criar uma etapa do Kanban.
    - nome: obrigatório (ex: Lead, Proposta, Fechado)
    - ordem: posição no quadro (0 = primeira coluna)
    - cor: slug para UI (reusa MAPA_CORES_PLANO no frontend)
    Usado em: POST /api/etapas
    """
    nome: str
    ordem: Optional[int] = 0
    cor: Optional[str] = "indigo"


class EtapaUpdate(BaseModel):
    """Atualização parcial de etapa (PATCH)."""
    nome: Optional[str] = None
    ordem: Optional[int] = None
    cor: Optional[str] = None


class Etapa(BaseModel):
    """Representação completa de etapa retornada pela API."""
    id: Union[int, str]
    user_id: str
    nome: str
    ordem: int = 0
    cor: Optional[str] = "indigo"
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class AtividadeCreate(BaseModel):
    """
    Dados para criar atividade/follow-up vinculada a cliente.
    - cliente_id: obrigatório (FK)
    - tipo: ligacao | reuniao | nota | whatsapp | email | tarefa
    - data: ISO YYYY-MM-DD ou YYYY-MM-DDTHH:MM
    - concluida: default False
    - nota: texto opcional
    Usado em: POST /api/atividades
    """
    cliente_id: Union[int, str]
    tipo: str
    data: str
    concluida: Optional[bool] = False
    nota: Optional[str] = None

    @validator("tipo")
    def tipo_must_be_valid(cls, v):
        allowed = {"ligacao", "reuniao", "nota", "whatsapp", "email", "tarefa"}
        if v not in allowed:
            raise ValueError(f"tipo deve ser um de: {', '.join(sorted(allowed))}")
        return v

    @validator("data")
    def data_must_be_iso(cls, v):
        if not re.match(r"^\d{4}-\d{2}-\d{2}", v):
            raise ValueError("data deve ser ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:MM)")
        return v


class AtividadeUpdate(BaseModel):
    """Atualização parcial de atividade (PATCH)."""
    tipo: Optional[str] = None
    data: Optional[str] = None
    concluida: Optional[bool] = None
    nota: Optional[str] = None

    @validator("tipo")
    def tipo_must_be_valid(cls, v):
        if v is None:
            return v
        allowed = {"ligacao", "reuniao", "nota", "whatsapp", "email", "tarefa"}
        if v not in allowed:
            raise ValueError(f"tipo deve ser um de: {', '.join(sorted(allowed))}")
        return v

    @validator("data")
    def data_must_be_iso(cls, v):
        if v is None:
            return v
        if not re.match(r"^\d{4}-\d{2}-\d{2}", v):
            raise ValueError("data deve ser ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:MM)")
        return v


class Atividade(BaseModel):
    """Representação completa de atividade retornada pela API."""
    id: Union[int, str]
    user_id: str
    cliente_id: Union[int, str]
    tipo: str
    data: str
    concluida: bool = False
    nota: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class TagCreate(BaseModel):
    """
    Dados para criar tag de segmentação.
    - nome: obrigatório, único por usuário
    - cor: slug para badge
    Usado em: POST /api/tags
    """
    nome: str
    cor: Optional[str] = "indigo"


class TagUpdate(BaseModel):
    nome: Optional[str] = None
    cor: Optional[str] = None


class Tag(BaseModel):
    id: Union[int, str]
    user_id: str
    nome: str
    cor: Optional[str] = "indigo"
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class ClienteTagCreate(BaseModel):
    """Vincula tag a cliente (POST /api/clientes/{id}/tags)."""
    tag_id: Union[int, str]


class FiltroSalvoCreate(BaseModel):
    """
    Filtro salvo pelo usuário (busca + filtros).
    - nome: nome do filtro (ex: VIP Atrasados)
    - query: dict com {termo, plano, status, tags, etapa_id, etc}
    Usado em: POST /api/filtros
    """
    nome: str
    query: dict


class FiltroSalvo(BaseModel):
    id: Union[int, str]
    user_id: str
    nome: str
    query: dict
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class ImportPreviewRequest(BaseModel):
    """Payload para import preview (CSV/Excel já parseado no frontend)."""
    clientes: list[dict]


# ============================================================
# MODELOS FASE 2A — Relatórios (Conversão por etapa)
# ============================================================

class RelatorioConversaoItem(BaseModel):
    """Item de conversão por etapa Kanban."""
    etapa_id: Optional[Union[int, str]] = None
    etapa_nome: str
    etapa_cor: Optional[str] = None
    count: int
    percent: float

    class Config:
        from_attributes = True


class RelatorioConversaoResponse(BaseModel):
    """Resposta completa do relatório de conversão."""
    total: int
    itens: list[RelatorioConversaoItem]

    class Config:
        from_attributes = True


class RelatorioReceitaPorPlano(BaseModel):
    plano_id: Optional[str] = None
    plano_nome: str
    plano_cor: Optional[str] = None
    total: float
    count: int
    percent: float

    class Config:
        from_attributes = True


class RelatorioReceitaPorMes(BaseModel):
    mes: str  # YYYY-MM
    total: float
    count: int

    class Config:
        from_attributes = True


class RelatorioReceitaResponse(BaseModel):
    total_receita: float
    total_clientes_em_dia: int
    por_plano: list[RelatorioReceitaPorPlano]
    por_mes: list[RelatorioReceitaPorMes]

    class Config:
        from_attributes = True


class RelatorioChurnItem(BaseModel):
    mes: str  # YYYY-MM
    total: int
    inativos: int
    churn_percent: float

    class Config:
        from_attributes = True


class RelatorioChurnPorPlano(BaseModel):
    plano_id: Optional[str] = None
    plano_nome: str
    plano_cor: Optional[str] = None
    total: int
    inativos: int
    churn_percent: float

    class Config:
        from_attributes = True


class RelatorioChurnResponse(BaseModel):
    total_geral: int
    total_inativos: int
    churn_medio: float
    itens: list[RelatorioChurnItem]
    por_plano: list[RelatorioChurnPorPlano] = []

    class Config:
        from_attributes = True


class RelatorioLtvPorPlano(BaseModel):
    plano_id: Optional[str] = None
    plano_nome: str
    plano_cor: Optional[str] = None
    count: int
    valor_medio_mensal: float
    meses_medio: float
    ltv_medio: float
    receita_estimada: float

    class Config:
        from_attributes = True


class RelatorioLtvResponse(BaseModel):
    total_clientes: int
    ltv_medio_geral: float
    receita_estimada_total: float
    valor_medio_mensal_geral: float
    meses_medio_geral: float
    por_plano: list[RelatorioLtvPorPlano]

    class Config:
        from_attributes = True


class Organizacao(BaseModel):
    id: str
    nome: str
    owner_id: str
    created_at: Optional[str] = None
    papel: Optional[str] = None  # preenchido no list

    class Config:
        from_attributes = True


class OrganizacaoCreate(BaseModel):
    nome: str

    class Config:
        from_attributes = True


class ConviteCreate(BaseModel):
    email: str
    papel: str = "membro"  # admin|membro

    class Config:
        from_attributes = True
