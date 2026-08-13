import os
from datetime import date
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.models import Cliente, ClienteCreate, ClienteUpdate
from app.storage import (
    carregar_clientes,
    salvar_novo_cliente,
    atualizar_cliente_db,
    deletar_cliente_db,
)

app = FastAPI(title="DaviFlow API v1.1")

# Permite acesso do Frontend sem bloqueios de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir arquivos estáticos (para testes locais)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static_files")


# --- ENDPOINTS DA API ---

@app.get("/")
def root():
    return {"status": "DaviFlow API online v1.1"}

@app.get("/clientes", response_model=list[Cliente])
@app.get("/api/clientes", response_model=list[Cliente])
def listar_clientes():
    try:
        return carregar_clientes()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/clientes/{cliente_id}", response_model=Cliente)
@app.get("/api/clientes/{cliente_id}", response_model=Cliente)
def buscar_cliente(cliente_id: str | int):
    clientes = carregar_clientes()
    for c in clientes:
        if str(c.id) == str(cliente_id):
            return c
    raise HTTPException(status_code=404, detail="Cliente não encontrado")


@app.post("/clientes", response_model=Cliente, status_code=status.HTTP_201_CREATED)
@app.post("/api/clientes", response_model=Cliente, status_code=status.HTTP_201_CREATED)
def criar_cliente(dados: ClienteCreate):
    try:
        payload = dados.model_dump(mode="json")
        payload["data_cadastro"] = date.today().isoformat()
        return salvar_novo_cliente(payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/clientes/{cliente_id}", response_model=Cliente)
@app.patch("/api/clientes/{cliente_id}", response_model=Cliente)
def atualizar_cliente(cliente_id: str | int, dados: ClienteUpdate):
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
            # Se nada foi enviado para atualizar, busca e retorna o cliente atual
            return buscar_cliente(cliente_id)
            
        cliente_atualizado = atualizar_cliente_db(cliente_id, campos)
        if not cliente_atualizado:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        return cliente_atualizado
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
@app.delete("/api/clientes/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_cliente(cliente_id: str | int):
    try:
        sucesso = deletar_cliente_db(cliente_id)
        if not sucesso:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        return
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))