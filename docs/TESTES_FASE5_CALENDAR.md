# Fase 5 — Google Calendar OAuth real: Roteiro de testes

> Documento de QA para a implementação da Fase 5 (`feat/fase5-calendar`).
> Dividido em duas trilhas: **backend** (automatizado + manual via curl) e **frontend** (manual, com navegador real).
> Referência do código: plano `local://fase5-google-calendar-plan.md`.

## Pré-requisitos (todas as trilhas)

| Item | Detalhe |
|---|---|
| Branch | `feat/fase5-calendar` com bateria local verde |
| Env vars Vercel (Preview) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` configuradas no projeto (`GOOGLE_REDIRECT_URI` opcional) |
| Google Cloud | OAuth client tipo "Web application" com redirect URI autorizada: `https://<dominio-preview>/api/integracoes/calendar/callback` (adicionar também o domínio de preview do Vercel se for testar lá) |
| Banco | Migration `010_fase5_calendar.sql` aplicada (coluna `atividades.google_event_id`) |
| Conta de teste | Conta descartável no app (signup) com org própria, ≥2 clientes, e uma conta Google pessoal para consentir o OAuth |

---

## Trilha 1 — Backend (automatizado, pytest)

> Rodar: `venv/bin/python -m pytest tests/test_calendar.py -q`
> Padrão de mocks: igual `tests/test_whatsapp.py` (mock de `supabase.auth.get_user` e de `httpx`).

| # | Teste | Cenário | Esperado |
|---|---|---|---|
| B1 | `test_auth_url_requires_auth` | `GET /api/integracoes/calendar/auth-url` sem token | 401 |
| B2 | `test_auth_url_missing_env_503` | envs `GOOGLE_CLIENT_ID`/`SECRET` ausentes, com token válido | 503 com detail amigável ("não configurado") |
| B3 | `test_auth_url_success` | envs setadas (monkeypatch), org válida | 200; `auth_url` contém `accounts.google.com`, `access_type=offline`, `prompt=consent`, `scope=...calendar.events`, `state=v1.<org_id>...`; `"mock": false` |
| B4 | `test_callback_invalid_state_redirects_erro` | `GET /api/integracoes/calendar/callback?code=x&state=tamperado` (assinatura errada ou expirado) | 302 para `{SITE_URL}/dashboard.html?calendar=erro` |
| B5 | `test_callback_success_upserts_integration` | state válido + `httpx.post` do token endpoint mockado (200, access+refresh) | 302 para `?calendar=ok`; integração `calendar` da org tem `config` com `access_token`, `refresh_token`, `expiry` |
| B6 | `test_callback_no_second_row` | callback duas vezes com state válido | Apenas 1 row `calendar` para a org (upsert, não insert duplicado) |
| B7 | `test_criar_evento_failure_does_not_block_activity` | `POST /api/atividades` com httpx mockado falhando | 201; atividade criada; `google_event_id` nulo; sem exceção propagada |
| B8 | `test_criar_evento_success_stores_id` | httpx mockado retornando `{"id": "evt_123"}` | `POST /api/atividades` 201 e `google_event_id = "evt_123"` no banco (mock) |
| B9 | `test_sync_pendentes_admin` | 3 atividades sem `google_event_id` nos últimos 30 dias, eventos mockados | 200; `{"sincronizadas": 3, "falhas": 0, "total": 3}` |
| B10 | `test_sync_pendentes_member_403` | membro (não admin) chama sync | 403 |
| B11 | `test_sync_rate_limited` | 6ª chamada de sync dentro de 1 min | 429 (slowapi) |
| B12 | `test_listar_integracoes_sanitizes_tokens` | row com `config: {access_token, refresh_token, token, outro}` | GET não contém nenhuma das 3 chaves; contém `outro` |
| B13 | `test_callback_state_expired` | state válido mas com `exp` no passado | 302 `?calendar=erro` |

### Backend manual (curl, sem mocks — contra Preview ou uvicorn local)

Pré: `uvicorn app.main:app --reload` com `.env` local (sem envs Google) — valida degradação real.

| # | Cenário | Comando | Esperado |
|---|---|---|---|
| M1 | Health | `curl -s http://127.0.0.1:8000/api/health` | 200 `{"status":"online",...}` |
| M2 | auth-url sem envs | `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/integracoes/calendar/auth-url` | 503 detail amigável (não stacktrace, não `str(e)` cru) |
| M3 | auth-url sem token | `curl -s http://127.0.0.1:8000/api/integracoes/calendar/auth-url` | 401 |
| M4 | sync sem token | `curl -s -X POST http://127.0.0.1:8000/api/integracoes/calendar/sync` | 401 |
| M5 | Com envs setadas: URL do consent | `curl -s -H "Authorization: Bearer $TOKEN" .../auth-url` | JSON com `auth_url` válido; abrir no navegador redireciona pro consent do Google |
| M6 | Sanitização no GET | `curl -s -H "Authorization: Bearer $TOKEN" .../api/integracoes` após conectar | `config` da integração calendar **sem** `access_token`/`refresh_token` |

**Console/logs:** durante M2–M6, vigiar stdout do uvicorn: nenhuma traceback não tratada em rotas 4xx/5xx; tokens NUNCA aparecem em log (nem em `traceback.print_exc()` de exceção httpx).

---

## Trilha 2 — Frontend (manual, navegador real)

> Alvo: Preview Vercel da `feat/fase5-calendar` (ou `dashboard.html` no domínio onde o backend tem as envs).
> Ferramenta: navegador com devtools aberto (aba Console + Network). Screenshot de cada passo em `.omo/qa-fase5/`.

### Setup

1. Fazer login no app (conta de teste com org própria — admin).
2. Criar ≥2 clientes pela UI (ex.: "QA Cal Um", "QA Cal Dois").

### T1 — Modal Integrações (renderização)

| Check | Esperado |
|---|---|
| Botão "Integrações" na toolbar abre o modal | Modal abre sem erro de console |
| Card Google Calendar | **Sem** badge "em breve"; descrição menciona sync real |
| Botões | "Conectar Google Calendar" visível; "Sincronizar agora" visível **só para admin** (membro não vê) |
| Estilo | Neo-brutalista: `rounded-none`, bordas 2px pretas, sem gradiente/sombra suave nos elementos novos |
| Console | Zero erros JS |

### T2 — Fluxo OAuth completo (com envs reais)

| # | Passo | Esperado |
|---|---|---|
| T2.1 | Clicar "Conectar Google Calendar" | Popup 600×700 abre consent do Google (conta pedida = scope `calendar.events`) |
| T2.2 | Logar/consentir na janela | Janela redireciona e fecha retorno à dashboard; URL da dashboard tem `?calendar=ok` que é limpado em seguida |
| T2.3 | Toast | "Google Calendar conectado!" aparece |
| T2.4 | `#calendar-status` no card | "Conectado" (chip) |
| T2.5 | Network | `GET /api/integracoes/calendar/callback?code=...&state=v1...` → 302; NÃO houve 401 no callback (state assinado autentica sem cookie) |
| T2.6 | Banco (Supabase SQL editor, SELECT) | `select config from integracoes where tipo='calendar'` — contém tokens; 1 row só (reconnect não duplica) |
| T2.7 | `GET /api/integracoes` (aba Network) | Response **não contém** `access_token`/`refresh_token` |

### T3 — Criação de evento automática

| # | Passo | Esperado |
|---|---|---|
| T3.1 | Criar atividade tipo "reunião" com data futura (só data, sem hora) para um cliente | 201; toast de sucesso; atividade aparece na Agenda |
| T3.2 | Verificar no Google Calendar real | Evento all-day criado com summary "reunião: <nome cliente>" e description = nota |
| T3.3 | Banco | Row da atividade com `google_event_id` preenchido |
| T3.4 | Repetir com data + hora (ex.: `2026-10-20T14:30`) | Evento timed no Google (14:30 horário de Brasília); `google_event_id` preenchido |
| T3.5 | **Tolerância**: desconectar (deletar integração pela UI ou revogar acesso no Google) e criar outra atividade | Atividade criada normal (201), sem crash, sem evento; console registra falha silenciosa apenas |
| T3.6 | Reconectar e recriar atividade | Volta a criar eventos |

### T4 — Sincronização manual de pendentes

| # | Passo | Esperado |
|---|---|---|
| T4.1 | Deletar 2 eventos criados no Google (simular pendentes) e limpar `google_event_id` delas no banco | — |
| T4.2 | Clicar "Sincronizar agora" (admin) | Toast `Sincronizadas: N • Falhas: M`; N = nº de pendentes dentro da janela |
| T4.3 | Google Calendar | Eventos recriados; banco com `google_event_id` preenchido nas 2 |
| T4.4 | Rodar de novo | Toast com sincronizadas 0 (idempotente — só pega `google_event_id is null`) |
| T4.5 | Membro (não admin) | Não vê o botão; se chamar a rota direto (Network → copy as fetch), 403 |
| T4.6 | Sem envs (remover no Vercel temporariamente) | Sync/auth-url → toast com mensagem amigável de 503 (não erro genérico) |

### T5 — Estados de borda (UI)

| # | Passo | Esperado |
|---|---|---|
| T5.1 | Popup do consent fechado sem consentir | Sem toast de sucesso; `#calendar-status` continua "—"; nenhum erro não tratado no console |
| T5.2 | Recarregar a dashboard com `?calendar=ok` na URL | Toast de conexão dispara 1× e URL é limpa (não re-toast em F5) |
| T5.3 | Org sem integração calendar: "Sincronizar agora" | 200 com sincronizadas 0, OU toast amigável de não configurado (não crash) |
| T5.4 | Tema dark | Elementos novos legíveis (chips/bordas seguem tokens dark do design system) |
| T5.5 | Mobile (viewport < 768px) | Card Calendar e botões não quebram layout; modal com scroll ok |

### T6 — Console & rede (transversal)

| Check | Esperado |
|---|---|
| Console em toda a sessão | Zero erros JS de aplicação (favicon 404 e CSP da toolbar Vercel são aceitáveis e conhecidos) |
| Tokens | Nenhum `access_token`/`refresh_token` visível em: responses de rede, localStorage, console, HTML renderizado |
| State | Nenhum valor de `state` reutilizado entre dois fluxos OAuth (cada auth-url gera `exp` novo) |

---

## Critério de aceite final

- B1–B13 verdes + M1–M6 sem surpresas.
- T1–T6 com todos os checks "esperado" batendo, screenshots arquivados.
- **Regra de ouro**: nenhuma falha do Google pode impedir criar atividade; nenhum token pode vazar por GET/log/console; reconnect nunca duplica integração.

## Limpesa pós-QA

- Conta de teste deletada pela UI (Config → Conta) — conferir cascade no banco (`auth.users`, org, atividades, integrações calendar da org QA).
- Se testou no Google real: remover eventos de teste no Calendar (ou usar uma conta Google descartável).
- Revogar acesso do app na conta Google de teste (myaccount.google.com → Segurança → Acessos de terceiros) se não for mais usar.
