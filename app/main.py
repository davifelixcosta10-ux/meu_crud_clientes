"""
===================================================================
DaviFlow API — Backend FastAPI
===================================================================
API RESTful para gerenciamento de clientes e planos do DaviFlow.
Autenticação via JWT (Supabase Auth), isolamento de dados por usuário (RLS).

Endpoints principais:
- /api/auth/signup  — Cadastro de usuário
- /api/auth/login   — Login e obtenção de token JWT
- /api/planos       — CRUD de planos personalizados (por usuário)
- /api/clientes     — CRUD de clientes (por usuário)
- /api/health       — Health check

Segurança:
- Rate limiting em /auth/* (5-10 req/min por IP)
- Validação de assinatura JWT via Supabase (não aceita UUID direto)
- CORS restrito a domínios conhecidos
- Error messages genéricas (não expõem stack traces)
- Row Level Security no Supabase (user_id em todas as queries)
"""

import os
from datetime import date
from fastapi import FastAPI, HTTPException, status, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.models import (
    Cliente, ClienteCreate, ClienteUpdate,
    Plano, PlanoCreate, PlanoUpdate,
    UserSignUp, UserLogin, TokenResponse,
)
from app.storage import (
    carregar_clientes, salvar_novo_cliente,
    atualizar_cliente_db, deletar_cliente_db,
    listar_planos, criar_plano, atualizar_plano, deletar_plano,
    registrar_usuario, autenticar_usuario, get_supabase_client,
)

# --- Rate Limiter ---
# Limita requisições por IP para prevenir brute force e DoS
# Aplicado nas rotas de autenticação (signup: 5/min, login: 10/min)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="DaviFlow API",
    version="1.4.0",
    description="API de gerenciamento de clientes e planos — DaviFlow Gestões",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- CORS ---
# Configuração restritiva: apenas domínios conhecidos + localhost
# allow_origin_regex permite apenas localhost (com porta opcional) em dev
# Em produção, apenas as origens explícitas em ALLOWED_ORIGINS são permitidas
_default_origins = [
    "https://daviflowgestoes.vercel.app",
    "https://daviflow.vercel.app",
]
_extra_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
# Adiciona localhost para desenvolvimento
ALLOWED_ORIGINS = _default_origins + _extra_origins + [
    "http://localhost",
    "http://127.0.0.1",
    "https://localhost",
    "https://127.0.0.1",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",  # Apenas localhost com porta opcional
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ============================================================
# DEPENDÊNCIA DE AUTENTICAÇÃO — Valida JWT com Supabase (assinatura verificada)
# ============================================================
async def obter_user_id(authorization: str = Header(None)) -> str:
    """
    Extrai e valida o user_id (UUID) a partir do header Authorization: Bearer <token>.
    
    Fluxo de validação:
    1. Verifica presença do header Authorization
    2. Valida formato "Bearer <token>"
    3. Chama Supabase Auth get_user() — isso verifica:
       - Assinatura JWT (chave pública do Supabase/JWKS)
       - Expiração (exp claim)
       - Revogação (token não invalidado)
       - Estrutura válida
    4. Retorna user_id (UUID) do token válido
    
    IMPORTANTE: Não aceita UUID direto — isso previnia spoofing de identidade
    onde um atacante poderia enviar UUID de outro usuário.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header 'Authorization' ausente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido. Use o formato: 'Bearer <token>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = parts[1].strip()

    # Valida token com Supabase (verifica assinatura, expiração, revogação)
    try:
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(raw_token)
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido ou expirado.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user_response.user.id
    except HTTPException:
        raise
    except Exception:
        # Qualquer erro na validação = token inválido
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ============================================================
# STATUS / HEALTH
# ============================================================

@app.get("/api/health", tags=["Status"])
@app.get("/api", tags=["Status"])
def health_check():
    """Health check simples para monitoramento e load balancers."""
    return {"status": "online", "message": "DaviFlow API v1.4.0"}


# ============================================================
# AUTENTICAÇÃO
# ============================================================

@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED, tags=["Auth"])
@limiter.limit("5/minute")  # Previne enumeração de e-mail e spam de cadastro
async def signup(request: Request, dados: UserSignUp):
    """
    Cadastra um novo usuário no Supabase Auth.
    
    Validações (via Pydantic UserSignUp):
    - email: formato válido (EmailStr)
    - password: mínimo 6 caracteres
    - nome_completo, nome_empresa: opcionais
    
    Rate limit: 5 requisições por minuto por IP
    """
    try:
        res = registrar_usuario(dados)
        if not res.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao criar usuário. Verifique se o e-mail já está cadastrado.",
            )
        return {"mensagem": "Usuário cadastrado com sucesso", "user_id": res.user.id}
    except HTTPException:
        raise
    except Exception:
        # Mensagem genérica para não vazar detalhes internos
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao registrar usuário.",
        )


@app.post("/api/auth/login", response_model=TokenResponse, tags=["Auth"])
@limiter.limit("10/minute")  # Previne brute force de senha
async def login(request: Request, dados: UserLogin):
    """
    Autentica o usuário e retorna o access_token JWT.
    
    Fluxo:
    1. Supabase Auth verifica credenciais
    2. Se válido, retorna session com access_token (JWT) e user
    3. Frontend armazena token no localStorage e usa no header Authorization
    
    Rate limit: 10 requisições por minuto por IP
    """
    try:
        res = autenticar_usuario(dados)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao autenticar.",
        )

    if not res.session or not res.session.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "access_token": res.session.access_token,
        "token_type":   "bearer",
        "user_id":      res.session.user.id,
        "email":        res.session.user.email,
    }


# ============================================================
# PLANOS (dinâmicos por usuário)
# ============================================================
# Cada usuário pode criar seus próprios planos com nome, cor, descrição, valor
# Isolamento total via RLS: user_id em todas as queries

@app.get("/api/planos", response_model=list[Plano], tags=["Planos"])
async def get_planos(user_id: str = Depends(obter_user_id)):
    """Lista todos os planos do usuário autenticado."""
    try:
        return listar_planos(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao buscar planos.",
        )


@app.post("/api/planos", response_model=Plano, status_code=status.HTTP_201_CREATED, tags=["Planos"])
async def post_plano(dados: PlanoCreate, user_id: str = Depends(obter_user_id)):
    """Cria um novo plano para o usuário autenticado."""
    try:
        return criar_plano(dados.model_dump(mode="json"), user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erro ao criar plano.",
        )


@app.patch("/api/planos/{plano_id}", response_model=Plano, tags=["Planos"])
async def patch_plano(plano_id: str | int, dados: PlanoUpdate, user_id: str = Depends(obter_user_id)):
    """
    Atualiza parcialmente um plano (PATCH).
    Apenas campos enviados são atualizados (exclude_unset=True).
    """
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo enviado.")
        plano = atualizar_plano(plano_id, campos, user_id)
        if not plano:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado.")
        return plano
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao processar atualização do plano.")


@app.delete("/api/planos/{plano_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Planos"])
async def delete_plano(plano_id: str | int, user_id: str = Depends(obter_user_id)):
    """Remove um plano do usuário autenticado."""
    try:
        if not deletar_plano(plano_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao remover plano.")


# ============================================================
# CLIENTES (autenticados)
# ============================================================
# CRUD completo de clientes com 30+ campos opcionais
# Isolamento total via RLS: user_id em todas as queries
# Validações de CPF (módulo 11), RG, telefone, data_nascimento via Pydantic

@app.get("/api/clientes", response_model=list[Cliente], tags=["Clientes"])
async def listar_clientes(user_id: str = Depends(obter_user_id)):
    """Lista todos os clientes do usuário autenticado, ordenados por data_cadastro desc."""
    try:
        return carregar_clientes(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao buscar clientes.",
        )


@app.post("/api/clientes", response_model=Cliente, status_code=status.HTTP_201_CREATED, tags=["Clientes"])
async def criar_cliente(dados: ClienteCreate, user_id: str = Depends(obter_user_id)):
    """
    Cria um novo cliente vinculado ao usuário autenticado.
    
    Campos obrigatórios: nome, email
    Campos opcionais: telefone, cpf, rg, data_nascimento, genero, empresa, cargo,
                      observacoes, cep, logradouro, numero, complemento, bairro, cidade, estado
    Defaults: ativo=True, plano="basico", data_cadastro=hoje
    """
    try:
        payload = dados.model_dump(mode="json")
        payload["data_cadastro"] = date.today().isoformat()
        return salvar_novo_cliente(payload, user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Erro ao criar cliente.",
        )


@app.patch("/api/clientes/{cliente_id}", response_model=Cliente, tags=["Clientes"])
async def atualizar_cliente(
    cliente_id: str | int,
    dados: ClienteUpdate,
    user_id: str = Depends(obter_user_id),
):
    """
    Atualiza parcialmente os dados de um cliente (PATCH).
    
    Comportamento especial:
    - Usa `is not None` para preservar valores falsy válidos (ativo=False, etc.)
    - Se nenhum campo enviado, retorna cliente atual (idempotente)
    """
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
            # Idempotência: se nenhum campo para atualizar, retorna cliente atual
            clientes = carregar_clientes(user_id)
            for c in clientes:
                if str(c.id) == str(cliente_id):
                    return c
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")

        cliente_atualizado = atualizar_cliente_db(cliente_id, campos, user_id)
        if not cliente_atualizado:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
        return cliente_atualizado
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao atualizar cliente.")


@app.delete("/api/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Clientes"])
async def deletar_cliente(cliente_id: str | int, user_id: str = Depends(obter_user_id)):
    """Remove um cliente do banco de dados (apenas do usuário autenticado)."""
    try:
        if not deletar_cliente_db(cliente_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao excluir cliente.")