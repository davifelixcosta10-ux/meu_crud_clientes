import os
from datetime import date
from fastapi import FastAPI, HTTPException, status, Header, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    Cliente,
    ClienteCreate,
    ClienteUpdate,
    UserSignUp,
    UserLogin,
    TokenResponse,
)
from app.storage import (
    carregar_clientes,
    salvar_novo_cliente,
    atualizar_cliente_db,
    deletar_cliente_db,
    registrar_usuario,
    autenticar_usuario,
)

app = FastAPI(
    title="DaviFlow API",
    version="1.3.0",
    description="API de gerenciamento de clientes — DaviFlow Gestões",
)

# --- CORS ---
# Em produção, apenas o domínio Vercel é permitido.
# Para testes locais, adicione ALLOWED_ORIGINS no ambiente:
#   ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
_default_origins = ["https://daviflowgestoes.vercel.app"]
_extra_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
ALLOWED_ORIGINS = _default_origins + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- DEPENDÊNCIA DE AUTENTICAÇÃO ---
# Extrai e valida o header Authorization.
# Usado via Depends() para que o FastAPI documente corretamente no Swagger.
def obter_user_id(authorization: str = Header(None)) -> str:
    """Extrai o user_id do header Authorization: Bearer <user_id>."""
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
    return parts[1].strip()


# ============================================================
# ENDPOINTS DE STATUS / HEALTH
# ============================================================

@app.get("/api/health", tags=["Status"])
@app.get("/api", tags=["Status"])
def health_check():
    return {"status": "online", "message": "DaviFlow API v1.3.0"}


# ============================================================
# ENDPOINTS DE AUTENTICAÇÃO
# ============================================================

@app.post("/api/auth/signup", status_code=status.HTTP_201_CREATED, tags=["Auth"])
def signup(dados: UserSignUp):
    """Cadastra um novo usuário no Supabase Auth."""
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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao registrar usuário: {str(e)}",
        )


@app.post("/api/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(dados: UserLogin):
    """Autentica o usuário e retorna o access_token JWT."""
    try:
        res = autenticar_usuario(dados)
    except Exception as e:
        # Distingue erro de credenciais de erro interno do servidor
        msg = str(e).lower()
        if "invalid" in msg or "credentials" in msg or "wrong" in msg or "email" in msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="E-mail ou senha incorretos.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao autenticar: {str(e)}",
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
# ENDPOINTS DE CLIENTES (AUTENTICADOS)
# ============================================================

@app.get("/api/clientes", response_model=list[Cliente], tags=["Clientes"])
def listar_clientes(user_id: str = Depends(obter_user_id)):
    """Lista todos os clientes do usuário autenticado."""
    try:
        return carregar_clientes(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar clientes: {str(e)}",
        )


@app.post(
    "/api/clientes",
    response_model=Cliente,
    status_code=status.HTTP_201_CREATED,
    tags=["Clientes"],
)
def criar_cliente(dados: ClienteCreate, user_id: str = Depends(obter_user_id)):
    """Cria um novo cliente vinculado ao usuário autenticado."""
    try:
        payload = dados.model_dump(mode="json")
        payload["data_cadastro"] = date.today().isoformat()
        return salvar_novo_cliente(payload, user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao criar cliente: {str(e)}",
        )


@app.patch(
    "/api/clientes/{cliente_id}",
    response_model=Cliente,
    tags=["Clientes"],
)
def atualizar_cliente(
    cliente_id: str | int,
    dados: ClienteUpdate,
    user_id: str = Depends(obter_user_id),
):
    """Atualiza parcialmente os dados de um cliente (PATCH)."""
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")

        if not campos:
            # Nenhum campo enviado: retorna o cliente atual sem alterar o banco
            clientes = carregar_clientes(user_id)
            for c in clientes:
                if str(c.id) == str(cliente_id):
                    return c
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente não encontrado.",
            )

        cliente_atualizado = atualizar_cliente_db(cliente_id, campos, user_id)
        if not cliente_atualizado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente não encontrado ou sem permissão.",
            )
        return cliente_atualizado
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao atualizar cliente: {str(e)}",
        )


@app.delete(
    "/api/clientes/{cliente_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Clientes"],
)
def deletar_cliente(
    cliente_id: str | int,
    user_id: str = Depends(obter_user_id),
):
    """Remove um cliente do banco de dados."""
    try:
        sucesso = deletar_cliente_db(cliente_id, user_id)
        if not sucesso:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente não encontrado ou sem permissão.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao deletar cliente: {str(e)}",
        )