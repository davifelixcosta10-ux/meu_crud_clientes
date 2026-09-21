#!/usr/bin/env bash
# sync-agents.sh — Integra branches dos agents (scout/medio/pesado/build) no principal,
# roda suite completa de testes e sobe branch-teste para Preview Vercel.
# Uso: ./sync-agents.sh [--dry-run] [--no-pr]

set -euo pipefail

# ========== CONFIG ==========================================================
AGENT_BRANCHES=("scout" "medio" "pesado" "build")   # ordem de merge
INTEGRATION_BRANCH="branch-teste"
MAIN_BRANCH="main"
REMOTE="origin"
REPO_ROOT="$(git rev-parse --show-toplevel)"
DRY_RUN=false
CREATE_PR=true

# ========== COLORS ==========================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()   { echo -e "${BLUE}[sync]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
err()   { echo -e "${RED}[err]${NC} $*"; }
die()   { err "$*"; exit 1; }

# ========== HELPERS =========================================================
branch_exists_remote() { git ls-remote --exit-code --heads "$REMOTE" "$1" >/dev/null 2>&1; }
branch_exists_local()  { git rev-parse --verify "$1" >/dev/null 2>&1; }
current_branch()       { git branch --show-current; }

run_checks() {
    log "Rodando verificações obrigatórias..."
    python3 -m py_compile app/main.py app/storage.py app/models.py
    ok "py_compile OK"
    node --check app.js
    ok "node --check OK"
    python3 -m pytest tests/ -q
    ok "pytest -q OK (todos testes passam)"
}

create_integration_branch() {
    local base_branch="$1"
    log "Criando/atualizando branch de integração '$INTEGRATION_BRANCH' a partir de '$base_branch'..."
    if branch_exists_local "$INTEGRATION_BRANCH"; then
        git checkout "$INTEGRATION_BRANCH"
        git reset --hard "$base_branch"
    else
        git checkout -b "$INTEGRATION_BRANCH" "$base_branch"
    fi
    ok "Branch '$INTEGRATION_BRANCH' pronta"
}

merge_agent_branch() {
    local agent_branch="$1"
    if ! branch_exists_remote "$agent_branch"; then
        warn "Branch remota '$agent_branch' não existe no $REMOTE — pulando"
        return 0
    fi
    log "Fazendo merge de '$REMOTE/$agent_branch'..."
    if ! git merge --no-ff --no-edit "$REMOTE/$agent_branch"; then
        err "Conflito ao mergear '$agent_branch'. Resolva manualmente e rode novamente."
        exit 1
    fi
    ok "Merge '$agent_branch' OK"
}

push_integration_branch() {
    log "Enviando '$INTEGRATION_BRANCH' para $REMOTE..."
    git push -u "$REMOTE" "$INTEGRATION_BRANCH" --force-with-lease
    ok "Push '$INTEGRATION_BRANCH' OK"
}

create_pr() {
    if ! command -v gh >/dev/null 2>&1; then
        warn "gh CLI não instalado — pulando criação de PR. Crie manualmente: branch-teste → main"
        return 0
    fi
    log "Criando PR '$INTEGRATION_BRANCH' → '$MAIN_BRANCH'..."
    gh pr create --base "$MAIN_BRANCH" --head "$INTEGRATION_BRANCH" \
        --title "chore: sync agents → $INTEGRATION_BRANCH" \
        --body "Merge automático das branches dos agents: $(IFS=,; echo "${AGENT_BRANCHES[*]}"). Testes: py_compile + node --check + pytest -q ✅" \
        --label "sync-agents" || warn "PR já existe ou erro ao criar"
}

# ========== MAIN ============================================================
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --no-pr)   CREATE_PR=false ;;
        *) die "Opção desconhecida: $arg. Use --dry-run ou --no-pr" ;;
    esac
done

log "=== SYNC AGENTS INICIADO ==="
log "Repo: $REPO_ROOT"
log "Branch atual: $(current_branch)"

# 1. Fetch tudo
log "Fazendo fetch de $REMOTE..."
git fetch "$REMOTE" --prune

# 2. Garante que main está atualizada localmente
log "Atualizando '$MAIN_BRANCH' local..."
git checkout "$MAIN_BRANCH"
git pull "$REMOTE" "$MAIN_BRANCH" --ff-only

# 3. Cria branch de integração a partir do main atualizado
create_integration_branch "$MAIN_BRANCH"

# 4. Merge das branches dos agents (em ordem)
for b in "${AGENT_BRANCHES[@]}"; do
    merge_agent_branch "$b"
done

# 5. Rodar TODOS os testes
run_checks

# 6. Push branch-teste
if [[ "$DRY_RUN" == "true" ]]; then
    warn "--dry-run: pulando push e PR"
else
    push_integration_branch
    if [[ "$CREATE_PR" == "true" ]]; then
        create_pr
    fi
fi

# 7. Volta para branch original
git checkout - 2>/dev/null || git checkout "$MAIN_BRANCH"

log "=== SYNC AGENTS CONCLUÍDO COM SUCESSO ==="
echo
echo "Próximos passos:"
echo "  1. Acesse o Preview Vercel: https://github.com/davifelixcosta10-ux/meu_crud_clientes/pull/new/$INTEGRATION_BRANCH"
echo "  2. Teste no site real (branch-teste-xxx.vercel.app)"
echo "  3. Aprove o PR → merge --no-ff na main → produção"