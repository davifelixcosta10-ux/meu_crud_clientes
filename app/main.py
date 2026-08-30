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
    Etapa, EtapaCreate, EtapaUpdate,
    Atividade, AtividadeCreate, AtividadeUpdate,
    Tag, TagCreate, TagUpdate, ClienteTagCreate,
    FiltroSalvo, FiltroSalvoCreate, ImportPreviewRequest,
    RelatorioConversaoResponse,
    RelatorioReceitaResponse,
    RelatorioChurnResponse,
    RelatorioLtvResponse,
    Organizacao, OrganizacaoCreate, ConviteCreate,
)
from app.storage import (
    carregar_clientes, salvar_novo_cliente,
    atualizar_cliente_db, deletar_cliente_db,
    listar_planos, criar_plano, atualizar_plano, deletar_plano,
    registrar_usuario, autenticar_usuario, get_supabase_client,
    listar_etapas, criar_etapa, atualizar_etapa, deletar_etapa,
    listar_atividades, criar_atividade, atualizar_atividade, deletar_atividade,
    listar_tags, criar_tag, atualizar_tag, deletar_tag,
    listar_tags_cliente, vincular_tag_cliente, desvincular_tag_cliente,
    listar_filtros_salvos, criar_filtro_salvo, deletar_filtro_salvo,
    importar_clientes_bulk,
    relatorio_conversao,
    relatorio_receita,
    relatorio_churn,
    relatorio_ltv,
    listar_organizacoes, criar_organizacao, listar_membros_org, convidar_membro_org, deletar_organizacao, remover_membro_org, atualizar_organizacao,
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
        # Supabase pode retornar user None + erro em res.error quando já existe
        err_msg = ""
        try:
            # tenta extrair mensagem de erro do supabase (pode estar em res.error ou res.message)
            err_obj = getattr(res, "error", None) or getattr(res, "message", None)
            if err_obj:
                err_msg = str(err_obj).lower()
        except Exception:
            pass
        if not res.user:
            # email já cadastrado (incluindo pendente de invite) -> mensagem mais útil
            if "already" in err_msg or "registered" in err_msg or "exists" in err_msg or "duplicate" in err_msg:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Este e-mail já foi convidado ou cadastrado. Peça para o admin da organização adicioná-lo em Gerenciar → Membros → Adicionar (entra direto como membro), ou use o link do email de convite para definir a senha.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao criar usuário. Verifique se o e-mail já está cadastrado.",
            )
        # Fase 3A-1 migração limpa: auto-cria org padrão para novo usuário (se tabela já migrada)
        try:
            org_nome = (dados.nome_empresa or "Minha organização").strip() or "Minha organização"
            criar_organizacao(res.user.id, org_nome)
        except Exception:
            pass
        return {"mensagem": "Usuário cadastrado com sucesso", "user_id": res.user.id}
    except HTTPException:
        raise
    except Exception as e:
        # loga erro real para debug (Vercel logs)
        print(f"[ERRO signup] {e}")
        # tenta extrair mensagem já tratada acima
        if "already" in str(e).lower() or "registered" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Este e-mail já foi convidado ou cadastrado. Peça para o admin adicioná-lo como membro existente.",
            )
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
# FASE 1A — ETAPAS (Kanban)
# ============================================================

@app.get("/api/etapas", response_model=list[Etapa], tags=["Etapas"])
async def get_etapas(org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """Lista etapas Kanban do usuário. Filtra por org_id se fornecido."""
    try:
        return listar_etapas(user_id, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar etapas.")


@app.post("/api/etapas", response_model=Etapa, status_code=status.HTTP_201_CREATED, tags=["Etapas"])
async def post_etapa(dados: EtapaCreate, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        payload = dados.model_dump(mode="json")
        if org_id:
            payload["org_id"] = org_id
        return criar_etapa(payload, user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar etapa.")


@app.patch("/api/etapas/{etapa_id}", response_model=Etapa, tags=["Etapas"])
async def patch_etapa(etapa_id: str | int, dados: EtapaUpdate, user_id: str = Depends(obter_user_id)):
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo enviado.")
        etapa = atualizar_etapa(etapa_id, campos, user_id)
        if not etapa:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etapa não encontrada.")
        return etapa
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao atualizar etapa.")


@app.delete("/api/etapas/{etapa_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Etapas"])
async def delete_etapa_api(etapa_id: str | int, user_id: str = Depends(obter_user_id)):
    try:
        if not deletar_etapa(etapa_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etapa não encontrada.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao remover etapa.")


# ============================================================
# FASE 1B — ATIVIDADES (Follow-ups)
# ============================================================

@app.get("/api/atividades", response_model=list[Atividade], tags=["Atividades"])
async def get_atividades(cliente_id: str | int | None = None, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        return listar_atividades(user_id, cliente_id, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar atividades.")


@app.post("/api/atividades", response_model=Atividade, status_code=status.HTTP_201_CREATED, tags=["Atividades"])
async def post_atividade(dados: AtividadeCreate, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        payload = dados.model_dump(mode="json")
        if org_id:
            payload["org_id"] = org_id
        return criar_atividade(payload, user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar atividade.")


@app.patch("/api/atividades/{atividade_id}", response_model=Atividade, tags=["Atividades"])
async def patch_atividade(atividade_id: str | int, dados: AtividadeUpdate, user_id: str = Depends(obter_user_id)):
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo enviado.")
        atv = atualizar_atividade(atividade_id, campos, user_id)
        if not atv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade não encontrada.")
        return atv
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao atualizar atividade.")


@app.delete("/api/atividades/{atividade_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Atividades"])
async def delete_atividade_api(atividade_id: str | int, user_id: str = Depends(obter_user_id)):
    try:
        if not deletar_atividade(atividade_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade não encontrada.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao remover atividade.")


# ============================================================
# FASE 1C — TAGS e FILTROS SALVOS
# ============================================================

@app.get("/api/tags", response_model=list[Tag], tags=["Tags"])
async def get_tags(org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        return listar_tags(user_id, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar tags.")


@app.post("/api/tags", response_model=Tag, status_code=status.HTTP_201_CREATED, tags=["Tags"])
async def post_tag(dados: TagCreate, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        payload = dados.model_dump(mode="json")
        if org_id:
            payload["org_id"] = org_id
        return criar_tag(payload, user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar tag.")


@app.patch("/api/tags/{tag_id}", response_model=Tag, tags=["Tags"])
async def patch_tag(tag_id: str | int, dados: TagUpdate, user_id: str = Depends(obter_user_id)):
    try:
        campos = dados.model_dump(exclude_unset=True, mode="json")
        if not campos:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum campo enviado.")
        tag = atualizar_tag(tag_id, campos, user_id)
        if not tag:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag não encontrada.")
        return tag
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao atualizar tag.")


@app.delete("/api/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Tags"])
async def delete_tag_api(tag_id: str | int, user_id: str = Depends(obter_user_id)):
    try:
        if not deletar_tag(tag_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag não encontrada.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao remover tag.")


@app.get("/api/clientes/{cliente_id}/tags", response_model=list[Tag], tags=["Tags"])
async def get_tags_cliente(cliente_id: str | int, user_id: str = Depends(obter_user_id)):
    try:
        return listar_tags_cliente(cliente_id, user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar tags do cliente.")


@app.post("/api/clientes/{cliente_id}/tags", tags=["Tags"])
async def post_vincular_tag(cliente_id: str | int, dados: ClienteTagCreate, user_id: str = Depends(obter_user_id)):
    try:
        ok = vincular_tag_cliente(cliente_id, dados.tag_id, user_id)
        if not ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente ou tag não encontrados.")
        return {"mensagem": "Tag vinculada com sucesso"}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao vincular tag.")


@app.delete("/api/clientes/{cliente_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Tags"])
async def delete_vinculo_tag(cliente_id: str | int, tag_id: str | int, user_id: str = Depends(obter_user_id)):
    try:
        if not desvincular_tag_cliente(cliente_id, tag_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao desvincular tag.")


@app.get("/api/filtros", response_model=list[FiltroSalvo], tags=["Filtros"])
async def get_filtros(org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        return listar_filtros_salvos(user_id, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar filtros.")


@app.post("/api/filtros", response_model=FiltroSalvo, status_code=status.HTTP_201_CREATED, tags=["Filtros"])
async def post_filtro(dados: FiltroSalvoCreate, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    try:
        payload = dados.model_dump(mode="json")
        if org_id:
            payload["org_id"] = org_id
        return criar_filtro_salvo(payload, user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao criar filtro.")


@app.delete("/api/filtros/{filtro_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Filtros"])
async def delete_filtro(filtro_id: str | int, user_id: str = Depends(obter_user_id)):
    try:
        if not deletar_filtro_salvo(filtro_id, user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Filtro não encontrado.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro ao remover filtro.")


# ============================================================
# FASE 1E — IMPORTAÇÃO BULK
# ============================================================

@app.post("/api/clientes/import", tags=["Clientes"])
async def import_clientes(dados: ImportPreviewRequest, user_id: str = Depends(obter_user_id)):
    """
    Importa lista de clientes em lote (CSV/Excel já parseado no frontend).
    Valida cada cliente com Pydantic e insere via RLS.
    """
    try:
        resultado = importar_clientes_bulk(dados.clientes, user_id)
        return resultado
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Erro na importação.")


# ============================================================
# FASE 2A — RELATÓRIOS (Conversão por etapa)
# ============================================================

@app.get("/api/relatorios/conversao", response_model=RelatorioConversaoResponse, tags=["Relatórios"])
async def get_relatorio_conversao(periodo: int | None = None, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """Retorna distribuição de clientes por etapa (conversão). Query ?periodo=30 para últimos 30 dias. Filtra por org_id se fornecido."""
    try:
        return relatorio_conversao(user_id, periodo, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar relatório de conversão.")


@app.get("/api/relatorios/receita", response_model=RelatorioReceitaResponse, tags=["Relatórios"])
async def get_relatorio_receita(periodo: int | None = None, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """Retorna receita prevista (em_dia) por plano e por mês. Filtra por org_id se fornecido."""
    try:
        return relatorio_receita(user_id, periodo, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar relatório de receita.")


@app.get("/api/relatorios/churn", response_model=RelatorioChurnResponse, tags=["Relatórios"])
async def get_relatorio_churn(periodo: int | None = None, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """Retorna churn por mês (inativos/total). Filtra por org_id se fornecido."""
    try:
        return relatorio_churn(user_id, periodo, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar relatório de churn.")


@app.get("/api/relatorios/ltv", response_model=RelatorioLtvResponse, tags=["Relatórios"])
async def get_relatorio_ltv(periodo: int | None = None, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """Retorna LTV estimado (valor * meses) geral e por plano. Filtra por org_id se fornecido."""
    try:
        return relatorio_ltv(user_id, periodo, org_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao gerar relatório de LTV.")


# ============================================================
# ORGANIZAÇÕES — Fase 3A-1
# ============================================================
@app.get("/api/orgs", tags=["Organizações"])
async def get_orgs(user_id: str = Depends(obter_user_id)):
    """Lista organizações do usuário (owner ou membro)."""
    try:
        return listar_organizacoes(user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao listar organizações.")


@app.post("/api/orgs", tags=["Organizações"])
async def post_org(dados: OrganizacaoCreate, user_id: str = Depends(obter_user_id)):
    """Cria organização e vira admin."""
    try:
        return criar_organizacao(user_id, dados.nome)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao criar organização.")


@app.get("/api/orgs/{org_id}/membros", tags=["Organizações"])
async def get_membros(org_id: str, user_id: str = Depends(obter_user_id)):
    """Lista membros da organização (requer ser membro)."""
    try:
        return listar_membros_org(org_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao listar membros.")


@app.post("/api/orgs/{org_id}/convites", tags=["Organizações"])
async def post_convite(org_id: str, dados: ConviteCreate, user_id: str = Depends(obter_user_id)):
    """Convida por email (invite automático). Requer admin. Se email já existe adiciona como membro direto."""
    try:
        return convidar_membro_org(org_id, dados.email, dados.papel, user_id)
    except ValueError as e:
        # 400 para email inválido, 403 para permissão
        msg = str(e).lower()
        if "acesso" in msg or "permiss" in msg or "apenas admin" in msg:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao convidar.")


@app.delete("/api/orgs/{org_id}", tags=["Organizações"])
async def delete_org(org_id: str, user_id: str = Depends(obter_user_id)):
    """Exclui organização (apenas dono, sem clientes)."""
    try:
        deletar_organizacao(org_id, user_id)
        return {"mensagem": "Organização excluída com sucesso"}
    except ValueError as e:
        msg = str(e).lower()
        if "dono" in msg or "permiss" in msg or "acesso" in msg:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao excluir organização.")


@app.delete("/api/orgs/{org_id}/membros/{target_user_id}", tags=["Organizações"])
async def delete_membro(org_id: str, target_user_id: str, user_id: str = Depends(obter_user_id)):
    """Remove membro da organização (apenas admin, não pode remover dono)."""
    try:
        remover_membro_org(org_id, target_user_id, user_id)
        return {"mensagem": "Membro removido com sucesso"}
    except ValueError as e:
        msg = str(e).lower()
        if "admin" in msg or "permiss" in msg or "acesso" in msg or "dono" in msg:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao remover membro.")


@app.patch("/api/orgs/{org_id}", tags=["Organizações"])
async def patch_org(org_id: str, dados: OrganizacaoCreate, user_id: str = Depends(obter_user_id)):
    """Renomeia organização (apenas admin)."""
    try:
        return atualizar_organizacao(org_id, dados.nome, user_id)
    except ValueError as e:
        msg = str(e).lower()
        if "admin" in msg or "permiss" in msg or "acesso" in msg:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao renomear organização.")


# ============================================================
# CLIENTES (autenticados)
# ============================================================
# CRUD completo de clientes com 30+ campos opcionais
# Isolamento total via RLS: user_id em todas as queries
# Validações de CPF (módulo 11), RG, telefone, data_nascimento via Pydantic

@app.get("/api/clientes", response_model=list[Cliente], tags=["Clientes"])
async def listar_clientes(org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """Lista todos os clientes do usuário autenticado, ordenados por data_cadastro desc. Filtra por org_id se fornecido."""
    try:
        return carregar_clientes(user_id, org_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro interno ao buscar clientes.",
        )


@app.post("/api/clientes", response_model=Cliente, status_code=status.HTTP_201_CREATED, tags=["Clientes"])
async def criar_cliente(dados: ClienteCreate, org_id: str | None = None, user_id: str = Depends(obter_user_id)):
    """
    Cria um novo cliente vinculado ao usuário autenticado.
    
    Campos obrigatórios: nome, email
    Campos opcionais: telefone, cpf, rg, data_nascimento, genero, empresa, cargo,
                      observacoes, cep, logradouro, numero, complemento, bairro, cidade, estado
    Defaults: ativo=True, plano="basico", data_cadastro=hoje
    Se org_id fornecido usa ele, senão _ensure_org_id pega a org atual.
    """
    try:
        payload = dados.model_dump(mode="json")
        payload["data_cadastro"] = date.today().isoformat()
        if org_id:
            payload["org_id"] = org_id
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