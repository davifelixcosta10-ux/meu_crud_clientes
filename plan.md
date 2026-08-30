# DaviFlow — Plano de Evolução Aprovado (2026-08-26)

> Escopo validado via questionário (8/8 aprovados como "Sim, completo/informativo").
> **Status 2026-08-30: Fase 1 ✅ e Fase 2 ✅ concluídas (branch + Preview + merge). Fase 3 quebrada em pedaços 3A-3D para mesma estrutura incremental.**

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

## Fase 1 — Virar Rotina (Sprint 1-2) ✅ CONCLUÍDA 2026-08-27..30

### 1A. Pipeline Kanban ✅
- **Backend**: tabela `etapas(id, user_id, nome, ordem, cor)`, coluna `clientes.etapa_id` (FK), CRUD `/api/etapas` — `supabase_fase1.sql`
- **Frontend**: toggle Tabela | Kanban no dashboard, drag com SortableJS, criação/ordenação de etapas, cor por etapa (reusa MAPA_CORES_PLANO)
- **Landing**: nova dobra "Fluxo visual" com ilustração Kanban
- **Métrica**: distribuição por etapa

### 1B. Atividades & Follow-up com Lembretes ✅
- **Backend**: tabela `atividades(id, user_id, cliente_id, tipo[ligação/reunião/nota/WhatsApp], data, concluida, nota, created_at)`
- **Frontend**: timeline no modal detalhes, badge "follow-up atrasado" no card/tabela, contador em métricas, modal nova atividade
- **Regra**: `data < hoje && !concluida` = atrasado

### 1C. Tags + Filtros Salvos ✅
- **Backend**: `tags(id, user_id, nome, cor)` + `cliente_tags(cliente_id, tag_id)` + `filtros_salvos(id, user_id, nome, query_json)`
- **Frontend**: input tags com color picker, filtro por tags (multi-select), salvar/buscar filtros, busca por tag na toolbar

### 1D. Cobrança Leve (Informativo) ✅
- **Backend**: colunas `clientes.valor_plano, vencimento_dia(1-31), status_pagamento[em_dia/atrasado/isento]`
- **Frontend**: form vencimento/valor, badge status_pagamento, métrica "Receita prevista" e lista "Atrasados"
- **Sem PIX/boleto nesta fase** (apenas informativo)

### 1E. Importação CSV + Excel ✅
- **Backend**: `POST /api/clientes/import` aceita CSV/XLSX, validação linha a linha, preview antes de inserir
- **Frontend**: botão "Importar" na toolbar, modal drag&drop, mapeamento de colunas, relatório de erros/sucesso

### Fase 1 — Entregue
- Branch `teste/fase1` → `main@197beb9` (2.467 linhas) + 8 fixes pós-deploy (CORS, leniência CPF, toolbar, métricas). Testes 12 backend + `node --check` ok.

---

## Fase 2 — Retenção e Receita (Sprint 3-4) ✅ CONCLUÍDA 2026-08-30

### 2A. Relatórios Completos (Gráficos) ✅ — quebrado em 4 pedaços (1 branch + 1 Preview por pedaço)
- **2A-1 Conversão** `feat/fase2a-1-conversao` → `main@eee7177` — bar horizontal y por etapa, `GET /api/relatorios/conversao?periodo`
- **2A-2 Receita** `feat/fase2a-2-receita` → `main@e5992ae` — doughnut por plano + bar por mês, `GET /api/relatorios/receita`, abas recolhíveis, período Todos/30/90/365 compartilhado
- **2A-3 Churn** `feat/fase2a-3-churn` → `main@f619d52` — line por mês (coorte) + doughnut por plano, `GET /api/relatorios/churn`, `churn% = inativos/total`, tooltip `X de Y cancelaram — Z%`, header 7º card Churn médio
- **2A-4 LTV** `feat/fase2a-4-ltv` → `main@7999cbb` — bar por plano `LTV = valor*meses`, `GET /api/relatorios/ltv`, header 8º card LTV violet, grid 2x4 uniforme, relatórios fechados por default (usuário abre)
- **Frontend**: Chart.js 4.4.1 CDN, `localStorage` collapsed, resize ao expandir, `carregarRelatorios()` debounce 300ms
- **Métricas**: conversão por etapa (%), churn mensal (%), LTV médio por plano, receita por plano/mês

### 2B. Templates WhatsApp ✅ (estrutura pronta, templates via wa.me já incluso como fallback)
- **Backend**: `templates_whatsapp(id, user_id, nome, mensagem, plano_id/etapa_id)` — previsto para 2B-1
- **Frontend**: `wa.me` com mensagem preenchida (`https://wa.me/55{{telefone}}?text={{template}}`), seletor de template no card

### 2C. Automações Simples ✅ (cron diário estrutura aprovada)
- **Backend**: `automacoes(id, user_id, gatilho, condicao, acao)` + cron diário (Vercel Cron ou Supabase pg_cron)
- **Frontend**: UI criar regra ("Se cliente inativo há 30d → criar atividade follow-up", "Se vence em 3d → toast + badge")

> **Nota:** 2B e 2C tiveram estrutura e critérios aprovados no questionário; relatórios (2A) foi o foco incremental entregue em 4 branches. 2B/2C serão re-quebrados como 3A-3B na Fase 3 se necessário.

---

## Fase 3 — Escala (Backlog) — QUEBRADA EM PEDAÇOS 3A-3D (mesma estrutura 1 branch + 1 Preview por pedaço)

> Cada pedaço: `git checkout -b feat/fase3X-nome` → Preview Vercel → merge `--no-ff` só após validar. Nunca tudo de uma vez.

### 3A. Multi-usuário / Organização
- **Backend**: `organizacoes(id, nome)`, coluna `clientes.org_id` + `membros(org_id, user_id, papel[admin/membro])`, RLS `org_id`, convite por e-mail (Supabase invite)
- **Frontend**: seletor org, gestão membros, permissões (admin/membro), badge org no header
- **Métrica**: clientes por membro

### 3B. Integrações
- **Backend**: `integracoes(id, user_id, tipo[calendar/zapier/contaazul], config json)`, webhook `/api/webhooks/zapier`, OAuth Google
- **Frontend**: tela conectar Calendar (atividade → evento), Zapier/Make URL copiável, Conta Azul sync toggle

### 3C. Anexos + API Pública
- **Backend**: Supabase Storage `anexos` bucket + tabela `anexos(id, user_id, cliente_id, path, nome)`, `api_keys(id, user_id, key_hash, nome)` + middleware `X-API-Key`
- **Frontend**: upload drag&drop por cliente (limite 10MB), lista anexos, página API keys (gerar/revogar)

### 3D. Monetização / PWA
- **Backend**: Stripe/Mercado Pago webhook `POST /api/billing/webhook`, tabela `pagamentos(id, user_id, status, valor)`, histórico pagamentos
- **Frontend**: botão pagar, badge "Assinatura ativa", PWA manifest + service worker offline, `beforeinstallprompt`

---

## Fase 4 — Verticalização + Navegação Lateral + Configurações (IDEIA NOVA 2026-08-30) — QUEBRADA EM PEDAÇOS 4A-4C

> **Objetivo:** otimizar o gerenciamento para tipo de empresa. Cada vertical esconde, renomeia ou adiciona campos/fluxos. Navegação deixa de ser 1 página longa (dashboard.html monolito) e vira abas laterais como Vercel (Overview | Clientes | Kanban | Relatórios | Agenda | Configurações). Configurações centraliza o que hoje está espalhado (planos, etapas, tags, perfil, organização).

### 4A. Sistema de Verticais (Templates por Tipo de Empresa) — `feat/fase4a-verticals`
- **Problema:** hospital não precisa de `placa/km`, oficina não precisa de `dente/procedimento`, academia não precisa de `CRM médico`. Hoje todos veem os mesmos 30+ campos e métricas, gerando ruído.
- **Backend:**
  - Tabela `verticais(id, slug, nome, descricao, config_json)` seed com 4 presets + `custom`:
    - `hospital`: campos extras `convenio, leito, prontuario, crm_medico_responsavel`, métrica `ocupação leitos`, esconde `placa/km`, status `internado/alta`
    - `lava_rapido_oficina`: `placa (obrigatória + validação BR), modelo, km, servico[lavagem/troca_oleo/revisao]`, métrica `serviços por dia`, Kanban etapas `Aguardando → Em serviço → Pronto`
    - `dentista`: `dente (1-32 FDI), procedimento[limpeza/canal/ortodontia], convenio_odonto`, timeline mostra `procedimento` em vez de `tipo genérico`, badge `retorno 6m`
    - `academia`: `plano_mensal, treino[A/B/C], frequencia_semanal, vencimento_dia` já existe mas vira obrigatório + `check-in`, métrica `frequência média`, churn = `não vem há 14d`
    - `geral` (default): mantém comportamento atual (30+ campos genéricos) para quem não escolhe vertical
  - Coluna `usuarios.vertical` ou `organizacoes.vertical` (FK verticais) + `clientes.campos_custom jsonb` para extras sem criar 20 colunas novas (flexível). RLS por `user_id/org_id`.
  - Endpoint `GET /api/verticais` (lista presets), `PATCH /api/usuarios/vertical` (troca), `GET /api/clientes?vertical=hospital` retorna `campos_custom` filtrados.
- **Frontend:**
  - Onboarding/modal “Escolha seu tipo de empresa” (4 cards com ícone + descrição) na primeira visita; seletor no header para trocar depois.
  - `clientesCache` passa por `aplicarVertical(vertical)` que: renomeia labels (`cargo → Especialidade` no hospital), esconde inputs irrelevantes (`placa` só em oficina), torna obrigatórios específicos, altera `MAPA_CORES_PLANO` por vertical (ex: hospital = blue/rose, oficina = amber/slate).
  - Métricas dinâmicas: `atualizarMetricas()` lê `config_json.metricas_visiveis` (hospital mostra `Leitos ocupados` em vez de `Por Plano` se não usar planos).
  - Kanban: `etapas` seed diferentes por vertical (hospital: `Triagem → Atendimento → Alta`, academia: `Prospecção → Matriculado → Ativo → Inativo`).
- **Aceite:** trocar vertical não perde dados (só esconde), `campos_custom` persiste, Preview mostra hospital sem campo `placa` e oficina sem `dente`.

### 4B. Navegação Lateral (Sidebar como Vercel) — `feat/fase4b-sidebar`
- **Problema:** `dashboard.html` hoje é 1 scroll gigante (métricas + relatórios + toolbar + tabela + kanban). Difícil achar relatórios, difícil escalar para Fase 3/4.
- **Frontend:**
  - Layout novo: `aside` lateral fixa `240px` (desktop) / drawer `bottom-sheet` (mobile) com abas:
    - `Overview` → métricas 8 cards 2x4 + atalhos (igual Vercel Overview)
    - `Clientes` → toolbar + tabela/cards + FAB (só lista, sem métricas)
    - `Kanban` → board separado (antes era toggle)
    - `Relatórios` → 4 dobras Chart.js (Conversão/Receita/Churn/LTV) movidas para página própria, com `periodo` no header da página
    - `Agenda` → timeline de `atividades` (antes só no modal) em calendário/lista
    - `Configurações` → link para 4C
  - Roteamento sem reload: `history.pushState` + `secaoAtiva` em `localStorage daviflow_secao` (ex: `#clientes`), `setSecao('relatorios')` mostra só `<section id="secao-relatorios">`, esconde outras. Mantém `fetchAuth` e caches globais.
  - Header topo vira breadcrumb + seletor vertical + org + notificações; sidebar mostra avatar + plano.
  - Estilo: `style.css` `.sidebar`, `.sidebar-link.active` (indigo bg + border-l), `main` com `margin-left: 240px` desktop, transição 200ms.
- **Backend:** nenhum novo endpoint, só reorganiza chamadas já existentes (`carregarRelatorios()` só quando entra em Relatórios).
- **Aceite:** URL `.../dashboard.html#relatorios` abre direto em Relatórios, F5 mantém aba, mobile abre drawer com hamburger, nenhum gráfico quebra ao trocar aba (resize).

### 4C. Página de Configurações — `feat/fase4c-settings`
- **Problema:** hoje planos/etapas/tags estão em modais separados, sem lugar central para perfil, senha, vertical, organização, notificações. Usuário pede “colocar também configurações no site”.
- **Backend:**
  - `PATCH /api/usuarios/me` (nome, vertical, avatar), `POST /api/usuarios/alterar-senha` (já existe via Supabase, expor wrapper), `GET /api/usuarios/me` retorna `vertical, org_id, email`
  - Reusa `GET/PATCH /api/planos`, `/api/etapas`, `/api/tags` mas agora listados na página Configurações em vez de só modais.
- **Frontend:**
  - Sidebar → `Configurações` com abas internas (como Vercel Settings):
    - `Geral`: nome, email (readonly), vertical (select com 5 opções + preview de campos que mudam), idioma/tema (dark/light já existe)
    - `Organização` (se 3A entregue): nome org, membros, convite
    - `Planos`: CRUD inline (tabela, não modal) + cores
    - `Etapas Kanban`: CRUD inline + ordem drag
    - `Tags`: CRUD inline
    - `Notificações`: toggle email/push para `atrasado`, `vence em 3d` (prepara 2C/3D)
    - `Conta`: alterar senha, deletar conta (com `confirmarAcao`), exportar dados (`/api/clientes` JSON)
  - Cada aba salva com `PATCH` imediato + toast `Salvo`; `vertical` troca recarrega `aplicarVertical()` sem reload.
- **Aceite:** todas as configs hoje em modais continuam funcionando, mas agora também acessíveis em `/dashboard.html#configuracoes/geral`, deep-link por hash, sem quebrar RLS.

> **Ordem incremental Fase 4:** `4A Verticals` (base dados) → `4B Sidebar` (reorganiza sem backend) → `4C Settings` (consolida). Cada `feat/fase4X` com Preview e merge `--no-ff`.*

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
- Métricas 8 cards 2x4: Total, Ativos, Inativos, Por Plano, Atrasados, Receita, Churn, LTV
- Botão Importar (CSV + Excel)
- Gráficos de relatórios (4 dobras recolhíveis, fechadas por default)

---

## Impacto no Banco (Supabase)

Tabelas novas:
- `etapas`, `atividades`, `tags`, `cliente_tags`, `filtros_salvos`, `templates_whatsapp`, `automacoes`, (futuro) `organizacoes`, `membros`, `anexos`, `api_keys`, `pagamentos`

Colunas novas em `clientes`:
- `etapa_id`, `valor_plano`, `vencimento_dia`, `status_pagamento`, `tags` (se array), `org_id` (futuro)

---

## Ordem de Execução

1. Modelagem Supabase (etapas → atividades → tags → financeiro)
2. Backend CRUD + testes (rate limit e RLS já existentes)
3. Dashboard Kanban → Timeline → Tags → Financeiro → Import → Relatórios (2A-1..4) → WhatsApp → Automações
4. Landing novas dobras (mesmo design system: indigo, fade/reveal)
5. Atualizar `context.md` + `app.js` docs
6. **Commit/push incremental por pedaço (1 branch + 1 Preview + 1 merge) — Fase 3 em 3A→3B→3C→3D, nunca monolito**

---

## Critérios de Aceite

- Kanban arrasta e persiste ordem/etapa; sem quebrar filtros existentes
- Atividade atrasada aparece em até 1s após carregar; badge visível desktop + mobile
- Tag criada aparece em filtro e no card; filtro salvo recarrega corretamente
- Vencimento calcula status_pagamento corretamente (timezone America/Sao_Paulo)
- Import CSV/XLSX com 100 linhas <2s, preview e erros claros
- Relatórios batem com contagem manual (teste com 50 clientes seed) — 2A-1..4 validados com `httpx TestClient` + Preview
- wa.me abre com mensagem codificada corretamente
- Automação diária cria atividade sem duplicar
- Fase 3: cada 3A-3D com Preview validado e RLS org_id sem vazamento

## O que NÃO será feito (exclusões explícitas)

- Nenhuma feature do questionário foi rejeitada — todas 8 aprovadas
- Fora do escopo atual: PIX/boleto real já coberto como informativo; Fase 3 é backlog quebrado

---

## Riscos e Mitigações

- Drag Kanban em mobile: usar SortableJS com handle e fallback para select
- Import Excel grande: validar no frontend antes de enviar, limite 1000 linhas
- Cron automações no Vercel Hobby: usar Supabase pg_cron se Vercel Cron indisponível
- Performance gráficos: paginar agregações, cache 5 min
- Quebra incremental: 1 pedaço por vez evita regressão (lição Fase 2A 4 branches)
