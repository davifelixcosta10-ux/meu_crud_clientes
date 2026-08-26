# DaviFlow — Plano de Evolução Aprovado (2026-08-26)

> Escopo validado via questionário (8/8 aprovados como "Sim, completo/informativo").
> Todas as features abaixo serão implementadas. Ordem respeita dependências (Kanban → Atividades → Tags → Financeiro → Import → Relatórios → WhatsApp → Automações).

## Respostas do Questionário
- Pipeline Kanban: **Sim, Kanban completo** (etapas configuráveis, drag & drop)
- Atividades/Follow-up: **Sim, com lembretes** (timeline + badge atrasado)
- Tags/Filtros: **Sim, tags + filtros salvos**
- Cobrança leve: **Sim, informativo** (vencimento/atrasados/receita prevista)
- Importação: **CSV + Excel**
- Relatórios: **Sim, completos** (conversão, churn, LTV, receita por plano com gráficos)
- WhatsApp: **Sim, templates** (wa.me + mensagens prontas por plano/etapa)
- Automações: **Sim, automações** (regras: inativo 30d, vence 3d, etc)

---

## Fase 1 — Virar Rotina (Sprint 1-2)

### 1A. Pipeline Kanban (Alta prioridade)
- **Backend**: tabela `etapas(id, user_id, nome, ordem, cor)`, coluna `clientes.etapa_id` (FK), CRUD `/api/etapas`
- **Frontend**: toggle Tabela | Kanban no dashboard, drag com SortableJS, criação/ordenação de etapas, cor por etapa (reusa MAPA_CORES_PLANO)
- **Landing**: nova dobra "Fluxo visual" com ilustração Kanban
- **Métrica**: distribuição por etapa

### 1B. Atividades & Follow-up com Lembretes
- **Backend**: tabela `atividades(id, user_id, cliente_id, tipo[ligação/reunião/nota/WhatsApp], data, concluida, nota, created_at)`
- **Frontend**: timeline no modal detalhes, badge "follow-up atrasado" no card/tabela, contador em métricas, modal nova atividade
- **Regra**: `data < hoje && !concluida` = atrasado

### 1C. Tags + Filtros Salvos
- **Backend**: `tags(id, user_id, nome, cor)` + `cliente_tags(cliente_id, tag_id)` ou `clientes.tags TEXT[]`; `filtros_salvos(id, user_id, nome, query_json)`
- **Frontend**: input tags com color picker, filtro por tags (multi-select), salvar/buscar filtros, busca por tag na toolbar

### 1D. Cobrança Leve (Informativo)
- **Backend**: colunas `clientes.valor_plano, vencimento_dia(1-31), status_pagamento[em_dia/atrasado/isento]`
- **Frontend**: form vencimento/valor, badge status_pagamento, métrica "Receita prevista" e lista "Atrasados"
- **Sem PIX/boleto nesta fase** (apenas informativo)

### 1E. Importação CSV + Excel
- **Backend**: `POST /api/clientes/import` aceita CSV/XLSX, parser (papaparse + sheetjs no frontend ou python openpyxl no backend), validação linha a linha, preview antes de inserir
- **Frontend**: botão "Importar" na toolbar, modal drag&drop, mapeamento de colunas, relatório de erros/sucesso
- **Landing**: CTA "Importe sua planilha em 1 clique"

### Fase 1 — O que fica FORA
- Nada — todo Fase 1 aprovado integralmente

---

## Fase 2 — Retenção e Receita (Sprint 3-4)

### 2A. Relatórios Completos (Gráficos)
- **Backend**: endpoints agregação: `/api/relatorios/conversao`, `/churn`, `/ltv`, `/receita` (SQL group by etapa/plano/mês)
- **Frontend**: gráficos com Chart.js/Recharts (linha, barra, pizza), filtros por período, export PNG
- **Métricas**: conversão por etapa (%), churn mensal (%), LTV médio por plano, receita por plano/mês

### 2B. Templates WhatsApp
- **Backend**: `templates_whatsapp(id, user_id, nome, mensagem, plano_id/etapa_id)`
- **Frontend**: `wa.me` com mensagem preenchida (`https://wa.me/55{{telefone}}?text={{template}}`), seletor de template no card de cliente, fallback "Só link WhatsApp" já incluso

### 2C. Automações Simples
- **Backend**: `automacoes(id, user_id, gatilho, condicao, acao)` + cron diário (Vercel Cron ou Supabase pg_cron)
- **Frontend**: UI criar regra ("Se cliente inativo há 30d → criar atividade follow-up", "Se vence em 3d → toast + badge")
- **Execução**: job diário verifica e insere atividades/notificações

### Fase 2 — O que fica FORA
- Nada — relatórios, WhatsApp e automações todos aprovados

---

## Fase 3 — Escala (Backlog)

- Multi-usuário/organização (RLS por `org_id`), permissões (admin/membro), convite por e-mail
- Integrações: Google Calendar (atividade → evento), Zapier/Make webhook, Conta Azul/Tiny
- Anexos por cliente (Supabase Storage)
- API pública com API keys
- PWA offline, cobrança recorrente real (Stripe/Mercado Pago), histórico de pagamentos

---

## Impacto no Site (Landing + Dashboard)

### Landing (index.html)
- Hero copy: "sem planilha e sem follow-up perdido"
- Nova seção Pipeline Kanban (ilustração + benefícios) após Features
- Nova seção Rotina (timeline + lembretes + WhatsApp) com mock

### Dashboard (dashboard.html)
- Toggle Tabela | Kanban (SortableJS)
- Timeline de atividades no drawer de cliente
- Barra de tags + filtros salvos na toolbar
- Métricas novas: Follow-ups atrasados, Receita prevista, Churn
- Botão Importar (CSV + Excel)
- Gráficos de relatórios (aba ou seção)

---

## Impacto no Banco (Supabase)

Tabelas novas:
- `etapas`, `atividades`, `tags`, `cliente_tags` (ou `clientes.tags`), `filtros_salvos`, `templates_whatsapp`, `automacoes`

Colunas novas em `clientes`:
- `etapa_id`, `valor_plano`, `vencimento_dia`, `status_pagamento`, `tags` (se array)

---

## Ordem de Execução

1. Modelagem Supabase (etapas → atividades → tags → financeiro)
2. Backend CRUD + testes (rate limit e RLS já existentes)
3. Dashboard Kanban → Timeline → Tags → Financeiro → Import → Relatórios → WhatsApp → Automações
4. Landing novas dobras (mesmo design system: indigo, fade/reveal)
5. Atualizar `context.md` (este plano já reflete lá) + `app.js` docs
6. Commit/push incremental por feature (feat: kanban, feat: atividades, etc)

---

## Critérios de Aceite

- Kanban arrasta e persiste ordem/etapa; sem quebrar filtros existentes
- Atividade atrasada aparece em até 1s após carregar; badge visível desktop + mobile
- Tag criada aparece em filtro e no card; filtro salvo recarrega corretamente
- Vencimento calcula status_pagamento corretamente (timezone America/Sao_Paulo)
- Import CSV/XLSX com 100 linhas <2s, preview e erros claros
- Relatórios batem com contagem manual (teste com 50 clientes seed)
- wa.me abre com mensagem codificada corretamente
- Automação diária cria atividade sem duplicar

## O que NÃO será feito (exclusões explícitas)

- Nenhuma feature do questionário foi rejeitada — todas 8 aprovadas
- Fora do escopo atual: multi-usuário, PIX/boleto real, Storage de anexos, Google Calendar (Fase 3)

---

## Riscos e Mitigações

- Drag Kanban em mobile: usar SortableJS com handle e fallback para select
- Import Excel grande: validar no frontend antes de enviar, limite 1000 linhas
- Cron automações no Vercel Hobby: usar Supabase pg_cron se Vercel Cron indisponível
- Performance gráficos: paginar agregações, cache 5 min
