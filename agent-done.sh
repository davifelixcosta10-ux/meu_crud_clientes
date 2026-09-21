#!/usr/bin/env bash
# agent-done.sh — Agent roda ao finalizar trabalho na worktree.
# Uso: ./agent-done.sh <agent-name> "mensagem do commit"
# Ex: ./agent-done.sh medio "feat: add checkout button UI"
# Branches: scout, medio, pesado, build

set -euo pipefail

AGENT_NAME="${1:-}"
COMMIT_MSG="${2:-}"

if [[ -z "$AGENT_NAME" || -z "$COMMIT_MSG" ]]; then
    echo "Uso: $0 <scout|medio|pesado|build> \"mensagem do commit\""
    exit 1
fi

VALID_AGENTS=("scout" "medio" "pesado" "build")
if [[ ! " ${VALID_AGENTS[*]} " =~ " ${AGENT_NAME} " ]]; then
    echo "Agent inválido. Use: ${VALID_AGENTS[*]}"
    exit 1
fi

BRANCH="$AGENT_NAME"
REMOTE="origin"

echo "[agent-done] Agent: $AGENT_NAME | Branch: $BRANCH"

# 1. Garante que está na branch correta (tracking remoto)
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    echo "[agent-done] Trocando para branch '$BRANCH'..."
    git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "$REMOTE/$BRANCH"
fi

# 2. Verifica se há mudanças
if git diff --quiet && git diff --cached --quiet; then
    echo "[agent-done] Nenhuma mudança para commitar."
    exit 0
fi

# 3. Commit + push
echo "[agent-done] Commitando mudanças..."
git add -A
git commit -m "$COMMIT_MSG"

echo "[agent-done] Push para $REMOTE/$BRANCH..."
git push "$REMOTE" "$BRANCH"

echo "[agent-done] ✅ Pronto. No principal rode: ./sync-agents.sh"