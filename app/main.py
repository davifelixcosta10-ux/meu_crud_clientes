import os
from datetime import date
from fastapi import FastAPI, HTTPException, status, Header, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    Cliente, ClienteCreate, ClienteUpdate,
    Plano, PlanoCreate, PlanoUpdate,
    UserSignUp, UserLogin, TokenResponse,
)
from app.storage import (
    carregar_clientes, salvar_novo_cliente,
    atualizar_cliente_db, deletar_cliente_db,
    listar_planos, criar_plano, atualizar_plano, deletar_plano,
    registrar_usuario, autenticar_usuario,
)

app = FastAPI(
    title="DaviFlow API",
    version="1.4.0",
    description="API de gerenciamento de clientes e planos — DaviFlow Gestões",
)

# --- CORS ---
_default_origins = ["https://daviflowgestoes.vercel.app"]
_extra_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
# Adiciona localhost para desenvolvimento e regex para subdomínios Vercel preview
ALLOWED_ORIGINS = _default_origins + _extra_origins + [
    "http://localhost",
    "http://127.0.0.1",
    "https://localhost",
    "https://127.0.0.1",
]
# Permite subdomínios Vercel (.vercel.app) via regex quando necessário
# (Nota: Em produção, mantemos as origens fixas acima; para development usa-se "*" se necessário)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|[a-z0-9-]+\.vercel\.app)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ============================================================
import base64
import json
import uuid


def extrair_user_id(token_str: str) -> str:
    """Extrai o UUID do usuário a partir de um UUID direto ou de um JWT (claim 'sub')."""
    token_str = token_str.strip()
    try:
        return str(uuid.UUID(token_str))
    except ValueError:
        pass

    parts = token_str.split(".")
    if len(parts) == 3:
        try:
            payload_b64 = parts[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload_data = json.loads(base64.urlsafe_b64decode(payload_b64))
            uid = payload_data.get("sub") or payload_data.get("user_id")
            if uid:
                return str(uuid.UUID(uid))
        except Exception:
            pass

    return token_str


# --- DEPENDÊNCIA DE AUTENTICAÇÃO ---
def obter_user_id(authorization: str = Header(None)) -> str:
    """Extrai o user_id (UUID) a partir do header Authorization: Bearer <token>."""
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
    user_id = extrair_user_id(raw_token)

    try:
        uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de usuário inválido ou formato UUID incorreto.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id


# ============================================================
# STATUS / HEALTH
# ============================================================

@app.get("/api/health", tags=["Status"])
@app.get("/api", tags=["Status"])
def health_check():
    return {"status": "online", "message": "DaviFlow API v1.4.0"}


# ============================================================
# AUTENTICAÇÃO
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
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao registrar usuário.",
        )


@app.post("/api/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(dados: UserLogin):
    """Autentica o usuário e retorna o access_token JWT."""
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

@app.get("/api/planos", response_model=list[Plano], tags=["Planos"])
def get_planos(user_id: str = Depends(obter_user_id)):
    """Lista todos os planos do usuário autenticado."""
    try:
        return listar_planos(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar planos: {str(e)}",
        )


@app.post("/api/planos", response_model=Plano, status_code=status.HTTP_201_CREATED, tags=["Planos"])
def post_plano(dados: PlanoCreate, user_id: str = Depends(obter_user_id)):
    """Cria um novo plano para o usuário autenticado."""
    try:
        return criar_plano(dados.model_dump(mode="json"), user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao criar plano: {str(e)}",
        )


@app.patch("/api/planos/{plano_id}", response_model=Plano, tags=["Planos"])
def patch_plano(plano_id: str | int, dados: PlanoUpdate, user_id: str = Depends(obter_user_id)):
    """Atualiza parcialmente um plano."""
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
def delete_plano(plano_id: str | int, user_id: str = Depends(obter_user_id)):
    """Remove um plano."""
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


@app.post("/api/clientes", response_model=Cliente, status_code=status.HTTP_201_CREATED, tags=["Clientes"])
def criar_cliente(dados: ClienteCreate, user_id: str = Depends(obter_user_id)):
    """Cria um novo cliente vinculado ao usuário autenticado."""
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
def atualizar_cliente(
    cliente_id: str | int,
    dados: ClienteUpdate,
    user_id: str = Depends(obter_user_id),
):
    """Atualiza parcialmente os dados de um cliente (PATCH)."""
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
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
def deletar_cliente(cliente_id: str | int, user_id: str = Depends(obter_user_id)):
    """Remove um cliente do banco de dados."""
    try:
        if not deletar_cliente_db(cliente_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao excluir cliente.")