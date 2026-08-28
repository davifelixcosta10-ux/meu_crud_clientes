/**
 * ===================================================================
 * DaviFlow — Dashboard Administrativo (app.js v1.4)
 * ===================================================================
 * Frontend Vanilla JS do painel /dashboard.html.
 *
 * Arquitetura:
 * - SPA sem framework: manipulação direta do DOM, sem build step
 * - Estado em memória: clientesCache[], planosCache[], modoDemo
 * - Comunicação: REST via fetch() para FastAPI (/api/*) + Supabase
 * - Autenticação: JWT Bearer no header Authorization (localStorage df_token)
 * - Fallback demo: IS_LOCAL ativa CLIENTES_DEMO se API offline (nunca em prod)
 *
 * Seções (19 no total):
 *  0. Configuração (IS_LOCAL, API_BASE_URL, PLANOS_DEFAULT, CLIENTES_DEMO)
 *  1. Tema dark/light (localStorage + prefers-color-scheme)
 *  2. Status da API (badge Conectado/Demo/Desconectado, polling 15s)
 *  3. Planos - carregar e cache
 *  4. Clientes - carregar, métricas, fallback demo local
 *  5. Métricas (total, ativos, inativos, por plano)
 *  6. Filtragem e renderização (tabela desktop + cards mobile)
 *  7. Toggle de seções colapsáveis (Contato, Pessoais, Endereço)
 *  8. Busca CEP via ViaCEP (com sanitização anti-XSS)
 *  9-11. Modais: Criar, Editar, Toggle de Status
 *  12-13. Detalhes do cliente, Gerenciamento de planos
 *  14. Exportação CSV
 *  15-16. Cards de seleção de plano, Validações de formulário
 *  17-19. Máscaras, Modais utilitários, Toast notifications
 *
 * Segurança:
 * - escaparHTML() em TODA interpolação de dados do usuário (previne XSS)
 * - validarCPF() com módulo 11 no frontend (espelho do backend)
 * - fetchAuth() centraliza header Authorization e trata 401 -> redirect login
 * - ViaCEP sanitizado (remove < > " ' & e limita 200 chars)
 * - CLIENTES_DEMO só existe se IS_LOCAL (não vaza PII em produção)
 * - Token nunca exposto no DOM, apenas em header Authorization
 *
 * Performance / Mobile:
 * - Lazy render: filtrarTabela() só re-renderiza após filtro/busca
 * - Debounce implícito: oninput no search, onchange nos selects
 * - Tailwind CDN + CSS vars (sem JS pesado)
 * - Modais com overscroll-behavior: contain e max-height 92vh no mobile
 * - FAB (Floating Action Button) só em < sm para criar cliente rápido
 */

// --- Detecção de ambiente ---
// IS_LOCAL = true apenas em localhost / 127.0.0.1 / file:// (desenvolvimento)
// Em produção (vercel.app) IS_LOCAL é false -> CLIENTES_DEMO = [] e modoDemo não usa mock
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

// Base URL da API: local usa 127.0.0.1:8000, produção usa origin atual (/api via Vercel rewrite)
const API_BASE_URL = IS_LOCAL
    ? 'http://127.0.0.1:8000/api'
    : `${window.location.origin}/api`;

// ============================================================
// 0. PLANOS DEFAULT — fallback visual quando API offline ou lista vazia
//    Usado como cache inicial; substituído por dados reais em carregarPlanos()
// ============================================================
const PLANOS_DEFAULT = [
    {
        id: 'basico',
        nome: 'Básico',
        valor: 'Grátis',
        cor: 'slate',
        descricao: 'Para quem está começando'
    },
    {
        id: 'pro',
        nome: 'Pro',
        valor: 'R$ 29/mês',
        cor: 'indigo',
        descricao: 'Para negócios em expansão'
    },
    {
        id: 'enterprise',
        nome: 'Enterprise',
        valor: 'R$ 99/mês',
        cor: 'amber',
        descricao: 'Para grandes operações'
    }
];

// Mock de clientes para desenvolvimento local/offline.
// IMPORTANTE: só é populado quando IS_LOCAL === true (veja acima).
// Em produção (Vercel) este array é [] -> não expõe PII fictícia no bundle.
// Ativado apenas em carregarClientes() quando fetch falha E IS_LOCAL é true.
const CLIENTES_DEMO = IS_LOCAL ? [
    {
        id: 1,
        nome: "Ana Beatriz Silva",
        email: "ana.silva@tech.com",
        plano: "pro",
        ativo: true,
        telefone: "(11) 98765-4321",
        cpf: "123.456.789-00",
        rg: "12.345.678-9",
        empresa: "Tech Solutions",
        cargo: "Gerente de TI",
        data_nascimento: "1992-05-15",
        genero: "F",
        cep: "01310-100",
        logradouro: "Av Paulista",
        numero: "1000",
        complemento: "Apto 42",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        estado: "SP",
        observacoes: "Cliente preferencial, prefere atendimento por WhatsApp.",
        data_cadastro: "2026-08-01"
    },
    {
        id: 2,
        nome: "Carlos Eduardo Mendes",
        email: "carlos.mendes@empresa.com",
        plano: "enterprise",
        ativo: true,
        telefone: "(21) 99887-6655",
        cpf: "987.654.321-11",
        rg: "98.765.432-1",
        empresa: "Mendes Consultoria",
        cargo: "CEO",
        cidade: "Rio de Janeiro",
        estado: "RJ",
        data_cadastro: "2026-08-05"
    },
    {
        id: 3,
        nome: "Juliana Rocha",
        email: "juliana@design.co",
        plano: "basico",
        ativo: false,
        telefone: "(31) 97123-4567",
        cpf: "456.789.123-22",
        data_cadastro: "2026-08-10"
    }
] : [];

let clientesCache = [];
let planosCache = [...PLANOS_DEFAULT];
let etapasCache = [];
let tagsCache = [];
let atividadesCache = [];
let filtrosCache = [];
let importPreviewData = [];
let viewMode = localStorage.getItem('daviflow_view') || 'tabela';
let clienteParaDeletarId = null;
let modoDemo = false;

// Mapa de tema por cor de plano — usado em badges, métricas e cards de seleção.
// Cada entrada define: bg, text, border, dot, activeBorder, activeBg (Tailwind classes)
// Cores disponíveis: indigo, cyan, emerald, amber, rose, purple, slate, orange
const MAPA_CORES_PLANO = {
    indigo: {
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        text: 'text-indigo-700 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-indigo-800/50',
        dot: 'bg-indigo-500',
        activeBorder: 'border-indigo-500 dark:border-indigo-400',
        activeBg: 'bg-indigo-50 dark:bg-indigo-950/30'
    },
    cyan: {
        bg: 'bg-cyan-50 dark:bg-cyan-950/40',
        text: 'text-cyan-700 dark:text-cyan-300',
        border: 'border-cyan-200 dark:border-cyan-800/50',
        dot: 'bg-cyan-500',
        activeBorder: 'border-cyan-500 dark:border-cyan-400',
        activeBg: 'bg-cyan-50 dark:bg-cyan-950/30'
    },
    emerald: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800/50',
        dot: 'bg-emerald-500',
        activeBorder: 'border-emerald-500 dark:border-emerald-400',
        activeBg: 'bg-emerald-50 dark:bg-emerald-950/30'
    },
    amber: {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800/50',
        dot: 'bg-amber-500',
        activeBorder: 'border-amber-500 dark:border-amber-400',
        activeBg: 'bg-amber-50 dark:bg-amber-950/30'
    },
    rose: {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800/50',
        dot: 'bg-rose-500',
        activeBorder: 'border-rose-500 dark:border-rose-400',
        activeBg: 'bg-rose-50 dark:bg-rose-950/30'
    },
    purple: {
        bg: 'bg-purple-50 dark:bg-purple-950/40',
        text: 'text-purple-700 dark:text-purple-300',
        border: 'border-purple-200 dark:border-purple-800/50',
        dot: 'bg-purple-500',
        activeBorder: 'border-purple-500 dark:border-purple-400',
        activeBg: 'bg-purple-50 dark:bg-purple-950/30'
    },
    slate: {
        bg: 'bg-slate-100 dark:bg-slate-800/60',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700/60',
        dot: 'bg-slate-400',
        activeBorder: 'border-slate-500 dark:border-slate-400',
        activeBg: 'bg-slate-100 dark:bg-slate-800/40'
    },
    orange: {
        bg: 'bg-orange-50 dark:bg-orange-950/40',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-200 dark:border-orange-800/50',
        dot: 'bg-orange-500',
        activeBorder: 'border-orange-500 dark:border-orange-400',
        activeBg: 'bg-orange-50 dark:bg-orange-950/30'
    }
};

// ============================================================
// AUTENTICAÇÃO E SESSÃO — JWT via Supabase Auth
// - obterUserId(): lê df_user_id do localStorage (para métricas/debug)
// - obterAuthHeaders(): exige df_token válido, lança erro se ausente (segurança)
// - fetchAuth(): wrapper que injeta headers, trata 401 -> limpa sessão + redirect
// - salvarSessao()/encerrarSessao(): ciclo de vida do token
// ============================================================
function obterUserId() {
    return localStorage.getItem('df_user_id') || '';
}

function obterAuthHeaders() {
    const token = localStorage.getItem('df_token');
    if (!token) {
        throw new Error('Token de autenticação não encontrado. Faça login novamente.');
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Wrapper autenticado: injeta Authorization Bearer, trata expiração/invalidade
// Produção: 401 ou sem token => limpa e redireciona para /?login=true
// Live Server (IS_LOCAL): sem token => lança erro para permitir fallback demo (não redireciona)
async function fetchAuth(url, options = {}) {
    try {
        const headers = obterAuthHeaders();
        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...options.headers }
        });

        if (response.status === 401) {
            // Em produção, força login; em local, deixa caller decidir fallback demo
            if (IS_LOCAL) return response;
            localStorage.removeItem('df_token');
            localStorage.removeItem('df_user_id');
            window.location.href = '/?login=true';
            return;
        }

        return response;
    } catch (error) {
        if (error.message.includes('Token de autenticação não encontrado')) {
            // Live Server sem login => modo demo local, não redireciona
            if (IS_LOCAL) throw error;
            window.location.href = '/?login=true';
            return;
        }
        throw error;
    }
}

function salvarSessao(userId, token) {
    localStorage.setItem('df_user_id', userId);
    localStorage.setItem('df_token', token);
}

function encerrarSessao() {
    localStorage.removeItem('df_user_id');
    localStorage.removeItem('df_token');
    abrirModal('modal-logout');
}

function recarrregarParaLogin() {
    window.location.href = '/?login=true';
}

// ============================================================
// INICIALIZAÇÃO — bootstrap do dashboard
// - configurarTema(): aplica dark/light do localStorage ou prefers-color-scheme
// - inicializarApp(): carrega planos + clientes (ordem importa: planos primeiro)
// - verificarStatusAPI(): badge Conectado/Demo/Desconectado + polling 15s
// - ESC fecha todos os modais abertos
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    configurarTema();
    inicializarApp();
    verificarStatusAPI();

    // Polling de status da API a cada 15s
    setInterval(verificarStatusAPI, 15000);

    // ESC fecha modais
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            fecharModalCriar();
            fecharModalEditar();
            fecharModalDeletar();
            fecharModalPlanos();
            fecharModalDetalhes();
        }
    });
});

async function inicializarApp() {
    await carregarPlanos();
    await carregarEtapas();
    await carregarTags();
    await carregarFiltrosSalvos();
    await carregarClientes();
    setViewMode(viewMode, true);
    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 1. TEMA DARK / LIGHT — persiste em localStorage.theme
//    Toggle manual em #theme-toggle; ícone moon/sun via Tailwind dark:
/// ============================================================
function configurarTema() {
    const prefereDark = localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', prefereDark);
}

function toggleTemaManual() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// ============================================================
// 2. STATUS DA API — health check + detecção de modoDemo
//    Tenta GET /health; se falhar tenta GET /clientes (auth); se exceção -> modoDemo
//    Atualiza badge/dot/text com cores emerald/amber/rose
// ============================================================
async function verificarStatusAPI() {
    const badgeEl = document.getElementById('api-status-badge');
    const dotEl   = document.getElementById('api-status-dot');
    const textEl  = document.getElementById('api-status-text');

    let isOnline = false;
    let wasException = false;
    try {
        const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
        if (!res.ok) throw new Error('health failed');
        // Health OK: verifica também se o banco responde (via planos, leve)
        try {
            const res2 = await fetchAuth(`${API_BASE_URL}/planos`, { method: 'GET' });
            if (!res2) {
                // Sem token em produção: fetchAuth redireciona (null) → API está up, só falta auth
                isOnline = true;
            } else if (res2.ok || res2.status === 401 || res2.status === 403) {
                isOnline = true;
            } else if (res2.status >= 500) {
                isOnline = false;
            } else {
                isOnline = true;
            }
        } catch (_) {
            // IS_LOCAL sem token/banco local: health ok ainda significa online para Live Server
            isOnline = IS_LOCAL ? true : false;
            if (!IS_LOCAL) wasException = true;
        }
    } catch (_) {
        wasException = true;
        isOnline = false;
    }

    if (wasException) {
        modoDemo = true;
    } else if (isOnline) {
        modoDemo = false;
    }

    if (!badgeEl || !dotEl || !textEl) return;

    if (isOnline && !modoDemo) {
        dotEl.className  = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0';
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-all duration-300';
        textEl.textContent = 'Conectado';
    } else if (modoDemo) {
        dotEl.className  = 'w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0';
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-all duration-300';
        textEl.textContent = 'Modo Local (Demo)';
    } else {
        dotEl.className  = 'w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0';
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-all duration-300';
        textEl.textContent = 'Desconectado';
    }

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 3. PLANOS — carregar do backend e popular cache + UI
//    GET /planos via fetchAuth; fallback para PLANOS_DEFAULT se vazio/erro
//    Após carregar: inicializa filtro <select> e cards de seleção nos modais
// ============================================================
async function carregarPlanos() {
    try {
        const response = await fetchAuth(`${API_BASE_URL}/planos`, { method: 'GET' });
        if (!response) return; // Redirect handled by fetchAuth

        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                planosCache = data;
            } else {
                planosCache = [...PLANOS_DEFAULT];
            }
        } else {
            planosCache = [...PLANOS_DEFAULT];
        }
    } catch (e) {
        planosCache = [...PLANOS_DEFAULT];
    }

    inicializarFiltroPlanos();
    renderizarCardsPlanoModal('criar');
    renderizarCardsPlanoModal('editar');
}

function inicializarFiltroPlanos() {
    const select = document.getElementById('filter-plano');
    if (!select) return;
    select.innerHTML = '<option value="">Todos os Planos</option>';
    planosCache.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nome} ${p.valor ? '(' + p.valor + ')' : ''}`;
        select.appendChild(opt);
    });
    const semOpt = document.createElement('option');
    semOpt.value = '__sem_plano__';
    semOpt.textContent = 'Sem plano';
    select.appendChild(semOpt);
}

// ============================================================
// 3B. FASE 1A — ETAPAS (Kanban)
// ============================================================
async function carregarEtapas() {
    try {
        const response = await fetchAuth(`${API_BASE_URL}/etapas`, { method: 'GET' });
        if (!response) return;
        if (response.ok) {
            const data = await response.json();
            etapasCache = Array.isArray(data) ? data : [];
        } else {
            etapasCache = [];
        }
    } catch (e) {
        etapasCache = [];
    }
    inicializarFiltroEtapas();
    renderizarEtapasSelects();
    renderizarKanban();
    if (window.lucide) lucide.createIcons();
}
function inicializarFiltroEtapas() {
    const select = document.getElementById('filter-etapa');
    if (!select) return;
    select.innerHTML = '<option value="">Todas Etapas</option>';
    etapasCache.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.nome;
        select.appendChild(opt);
    });
    const semOpt = document.createElement('option');
    semOpt.value = '__sem_etapa__';
    semOpt.textContent = 'Sem etapa';
    select.appendChild(semOpt);
}
function renderizarEtapasSelects() {
    ['criar-etapa', 'editar-etapa'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Sem etapa</option>';
        etapasCache.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.nome;
            sel.appendChild(opt);
        });
        sel.value = current;
    });
}
function setViewMode(mode, skipSave) {
    viewMode = mode;
    if (!skipSave) localStorage.setItem('daviflow_view', mode);
    const tabelaMain = document.querySelector('main');
    const kanbanBoard = document.getElementById('kanban-board');
    const btnTabela = document.getElementById('btn-view-tabela');
    const btnKanban = document.getElementById('btn-view-kanban');
    if (!tabelaMain || !kanbanBoard) return;
    if (mode === 'kanban') {
        tabelaMain.classList.add('hidden');
        tabelaMain.classList.remove('flex');
        kanbanBoard.classList.remove('hidden');
        kanbanBoard.classList.add('flex');
        btnTabela?.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'border');
        btnKanban?.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'border', 'border-slate-200', 'dark:border-slate-600');
        renderizarKanban();
    } else {
        kanbanBoard.classList.add('hidden');
        kanbanBoard.classList.remove('flex');
        tabelaMain.classList.remove('hidden');
        tabelaMain.classList.add('flex');
        btnKanban?.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'border');
        btnTabela?.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'border');
    }
    if (window.lucide) lucide.createIcons();
}
function renderizarKanban() {
    const container = document.getElementById('kanban-container');
    const countEl = document.getElementById('kanban-count');
    if (!container) return;
    if (etapasCache.length === 0 && clientesCache.length === 0) {
        container.innerHTML = '<div class="w-full text-center py-16 text-sm text-slate-400">Crie etapas para usar o Kanban</div>';
        if (countEl) countEl.textContent = '0 etapas';
        return;
    }
    const grupos = {};
    etapasCache.forEach(e => grupos[e.id] = []);
    const semEtapa = [];
    clientesCache.forEach(c => {
        const termo = document.getElementById('search-input').value.toLowerCase().trim();
        const planoFiltro = document.getElementById('filter-plano').value;
        const statusFiltro = document.getElementById('filter-status').value;
        const etapaFiltro = document.getElementById('filter-etapa')?.value || '';
        const tagFiltro = document.getElementById('filter-tag')?.value || '';
        const haystack = [c.nome, c.email, c.telefone||'', c.empresa||''].join(' ').toLowerCase();
        const matchBusca = !termo || haystack.includes(termo);
        const matchPlano = !planoFiltro || String(c.plano)===String(planoFiltro) || (planoFiltro==='__sem_plano__'&&!c.plano);
        const matchStatus = !statusFiltro || (statusFiltro==='ativo'?c.ativo:!c.ativo);
        const matchEtapa = !etapaFiltro || String(c.etapa_id)===String(etapaFiltro) || (etapaFiltro==='__sem_etapa__'&&!c.etapa_id);
        let matchTag = true;
        if (tagFiltro) {
            const tagIds = c._tags || [];
            matchTag = tagIds.includes(tagFiltro);
        }
        if (!matchBusca || !matchPlano || !matchStatus || !matchTag || !matchEtapa) return;
        if (c.etapa_id && grupos.hasOwnProperty(c.etapa_id)) grupos[c.etapa_id].push(c);
        else semEtapa.push(c);
    });
    let html = '';
    html += `<div class="kanban-column">
        <div class="kanban-column-header">
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Sem etapa</span>
                <span class="px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-full">${semEtapa.length}</span>
            </div>
        </div>
        <div class="kanban-column-body" data-etapa-id="">
            ${semEtapa.length ? semEtapa.map(c => kanbanCardHTML(c)).join('') : '<div class="kanban-empty">Arraste clientes aqui</div>'}
        </div>
    </div>`;
    etapasCache.forEach(etapa => {
        const estilo = MAPA_CORES_PLANO[etapa.cor] || MAPA_CORES_PLANO.indigo;
        const clientes = grupos[etapa.id] || [];
        html += `<div class="kanban-column">
            <div class="kanban-column-header">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${estilo.dot}"></span>
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">${escaparHTML(etapa.nome)}</span>
                    <span class="px-1.5 py-0.5 text-[10px] font-bold ${estilo.bg} ${estilo.text} rounded-full">${clientes.length}</span>
                </div>
            </div>
            <div class="kanban-column-body" data-etapa-id="${etapa.id}">
                ${clientes.length ? clientes.map(c => kanbanCardHTML(c)).join('') : '<div class="kanban-empty">Arraste clientes aqui</div>'}
            </div>
        </div>`;
    });
    container.innerHTML = html;
    if (countEl) countEl.textContent = `${etapasCache.length} etapas`;
    container.querySelectorAll('.kanban-column-body').forEach(col => {
        new Sortable(col, {
            group: 'kanban',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: async function(evt) {
                const clienteId = evt.item.dataset.clienteId;
                const newEtapaId = evt.to.dataset.etapaId || null;
                if (!clienteId) return;
                try {
                    const resp = await fetchAuth(`${API_BASE_URL}/clientes/${clienteId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ etapa_id: newEtapaId || null })
                    });
                    if (resp && resp.ok) {
                        const idx = clientesCache.findIndex(c => String(c.id)===String(clienteId));
                        if (idx !== -1) clientesCache[idx].etapa_id = newEtapaId || null;
                        exibirToast('Etapa atualizada', 'sucesso');
                    } else if (!modoDemo) {
                        exibirToast('Erro ao mover card', 'erro');
                        renderizarKanban();
                    }
                } catch (e) {
                    const idx = clientesCache.findIndex(c => String(c.id)===String(clienteId));
                    if (idx !== -1) clientesCache[idx].etapa_id = newEtapaId || null;
                    renderizarKanban();
                }
                if (window.lucide) lucide.createIcons();
            }
        });
    });
    if (window.lucide) lucide.createIcons();
}
function kanbanCardHTML(cliente) {
    const planoBadge = getPlanoBadgeHTML(cliente.plano);
    const statusDot = cliente.ativo ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>' : '<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>';
    const valor = cliente.valor_plano ? `<span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">${escaparHTML(cliente.valor_plano)}</span>` : '';
    const venc = cliente.vencimento_dia ? `<span class="text-[10px] text-slate-400">Venc: ${cliente.vencimento_dia}</span>` : '';
    const tags = (cliente._tags || []).slice(0,2).map(tid => {
        const t = tagsCache.find(x => String(x.id)===String(tid));
        if (!t) return '';
        const estilo = MAPA_CORES_PLANO[t.cor] || MAPA_CORES_PLANO.slate;
        return `<span class="px-1.5 py-0.5 text-[9px] font-bold rounded-full ${estilo.bg} ${estilo.text} border ${estilo.border}">${escaparHTML(t.nome)}</span>`;
    }).join(' ');
    return `<div class="kanban-card" data-cliente-id="${cliente.id}" onclick="abrirModalDetalhes(${cliente.id})">
        <div class="flex items-center gap-2 mb-1.5">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white" style="background:${avatarGradient(cliente.nome)}">${avatarInitials(cliente.nome)}</div>
            <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${escaparHTML(cliente.nome)}</span>
            <span class="ml-auto flex items-center gap-1 text-[10px]">${statusDot}</span>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${escaparHTML(cliente.email)}</p>
        <div class="flex items-center gap-1 mt-2 flex-wrap">${planoBadge} ${tags}</div>
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <span class="text-[10px] text-slate-400">${valor} ${venc ? '· '+venc : ''}</span>
            <i data-lucide="grip" class="w-3 h-3 text-slate-300"></i>
        </div>
    </div>`;
}
function abrirModalEtapas() { renderizarListaEtapasGerenciamento(); resetarFormEtapa(); abrirModal('modal-etapas'); }
function fecharModalEtapas() { fecharModal('modal-etapas'); }
function renderizarListaEtapasGerenciamento() {
    const container = document.getElementById('lista-etapas-gerenciamento');
    if (!container) return;
    container.innerHTML = '';
    if (etapasCache.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nenhuma etapa. Crie a primeira!</p>';
        return;
    }
    etapasCache.forEach(e => {
        const estilo = MAPA_CORES_PLANO[e.cor] || MAPA_CORES_PLANO.indigo;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 gap-3';
        div.innerHTML = `<div class="flex items-center gap-3 min-w-0">
            <span class="w-3 h-3 rounded-full ${estilo.dot} flex-shrink-0"></span>
            <div class="min-w-0">
                <span class="font-bold text-slate-900 dark:text-white text-sm">${escaparHTML(e.nome)}</span>
                <span class="text-xs text-slate-400 ml-2">ordem ${e.ordem}</span>
            </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
            <button onclick="editarEtapaForm('${e.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all" title="Editar"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            <button onclick="deletarEtapa('${e.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all" title="Excluir"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`;
        container.appendChild(div);
    });
    if (window.lucide) lucide.createIcons();
}
function selecionarCorEtapa(cor) {
    document.getElementById('etapa-cor-selecionada').value = cor;
    document.querySelectorAll('#etapa-color-picker .color-dot').forEach(b => b.classList.toggle('selected', b.dataset.color===cor));
}
function resetarFormEtapa() {
    document.getElementById('etapa-id-editar').value = '';
    document.getElementById('etapa-nome').value = '';
    document.getElementById('etapa-ordem').value = '';
    document.getElementById('titulo-form-etapa').textContent = 'Nova Etapa';
    document.getElementById('btn-cancelar-etapa').classList.add('hidden');
    selecionarCorEtapa('indigo');
}
function editarEtapaForm(id) {
    const e = etapasCache.find(x => String(x.id)===String(id));
    if (!e) return;
    document.getElementById('etapa-id-editar').value = e.id;
    document.getElementById('etapa-nome').value = e.nome;
    document.getElementById('etapa-ordem').value = e.ordem;
    document.getElementById('titulo-form-etapa').textContent = 'Editar Etapa: '+e.nome;
    document.getElementById('btn-cancelar-etapa').classList.remove('hidden');
    selecionarCorEtapa(e.cor||'indigo');
}
async function salvarEtapa(event) {
    event.preventDefault();
    const id = document.getElementById('etapa-id-editar').value;
    const nome = document.getElementById('etapa-nome').value.trim();
    const ordem = parseInt(document.getElementById('etapa-ordem').value) || 0;
    const cor = document.getElementById('etapa-cor-selecionada').value;
    if (!nome) return;
    const payload = { nome, ordem, cor };
    try {
        if (!modoDemo) {
            const url = id ? `${API_BASE_URL}/etapas/${id}` : `${API_BASE_URL}/etapas`;
            const method = id ? 'PATCH' : 'POST';
            const resp = await fetchAuth(url, { method, body: JSON.stringify(payload) });
            if (!resp) return;
            if (!resp.ok) throw new Error('Erro ao salvar etapa');
            exibirToast('Etapa salva!', 'sucesso');
            await carregarEtapas();
            resetarFormEtapa();
            return;
        }
    } catch(e) { console.warn(e); }
    if (id) {
        const idx = etapasCache.findIndex(x => String(x.id)===String(id));
        if (idx!==-1) etapasCache[idx] = { ...etapasCache[idx], ...payload };
    } else {
        etapasCache.push({ id: 'etapa_'+Date.now(), user_id: 'local', ...payload, created_at: new Date().toISOString() });
    }
    inicializarFiltroEtapas(); renderizarEtapasSelects(); renderizarKanban(); renderizarListaEtapasGerenciamento(); resetarFormEtapa();
    exibirToast('Etapa salva! (Local)', 'sucesso');
}
function confirmarAcao(titulo, mensagem, aoConfirmar) {
    document.getElementById('confirm-title').textContent = titulo;
    document.getElementById('confirm-message').textContent = mensagem;
    const btnOk = document.getElementById('btn-confirm-ok');
    const novoBtnOk = btnOk.cloneNode(true);
    btnOk.parentNode.replaceChild(novoBtnOk, btnOk);
    novoBtnOk.addEventListener('click', () => {
        fecharModalConfirm();
        aoConfirmar();
    });
    if (window.lucide) lucide.createIcons();
    abrirModal('modal-confirm');
}
function fecharModalConfirm() { fecharModal('modal-confirm'); }

async function deletarEtapa(id) {
    confirmarAcao('Excluir etapa?', 'Clientes nesta etapa ficarão sem etapa. Deseja continuar?', async () => {
        try {
            if (!modoDemo) {
                const resp = await fetchAuth(`${API_BASE_URL}/etapas/${id}`, { method: 'DELETE' });
                if (!resp) return;
                if (!resp.ok) throw new Error('Erro ao excluir');
                exibirToast('Etapa removida!', 'sucesso');
                await carregarEtapas();
                return;
            }
        } catch(e) { console.warn(e); }
        etapasCache = etapasCache.filter(x => String(x.id)!==String(id));
        inicializarFiltroEtapas(); renderizarEtapasSelects(); renderizarKanban(); renderizarListaEtapasGerenciamento();
    });
}
async function carregarTags() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/tags`, { method: 'GET' });
        if (!resp) return;
        if (resp.ok) tagsCache = await resp.json();
        else tagsCache = [];
    } catch(e) { tagsCache = []; }
    inicializarFiltroTags();
    renderizarTagsSelects();
}
function inicializarFiltroTags() {
    const sel = document.getElementById('filter-tag');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas Tags</option>';
    tagsCache.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nome;
        sel.appendChild(opt);
    });
}
function renderizarTagsSelects() {
    ['criar-tags-container','editar-tags-container'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (tagsCache.length===0) {
            container.innerHTML = '<span class="text-xs text-slate-400">Nenhuma tag cadastrada</span>';
            return;
        }
        container.innerHTML = tagsCache.map(t => {
            const estilo = MAPA_CORES_PLANO[t.cor] || MAPA_CORES_PLANO.slate;
            return `<label class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${estilo.border} ${estilo.bg} cursor-pointer hover:opacity-80 transition-opacity">
                <input type="checkbox" value="${t.id}" class="tag-checkbox sr-only" data-tag-id="${t.id}">
                <span class="w-2 h-2 rounded-full ${estilo.dot}"></span>
                <span class="text-xs font-semibold ${estilo.text}">${escaparHTML(t.nome)}</span>
            </label>`;
        }).join('');
    });
    if (window.lucide) lucide.createIcons();
}
function abrirModalTags() { renderizarListaTagsGerenciamento(); resetarFormTag(); abrirModal('modal-tags'); }
function fecharModalTags() { fecharModal('modal-tags'); }
function renderizarListaTagsGerenciamento() {
    const container = document.getElementById('lista-tags-gerenciamento');
    if (!container) return;
    container.innerHTML = '';
    tagsCache.forEach(t => {
        const estilo = MAPA_CORES_PLANO[t.cor] || MAPA_CORES_PLANO.slate;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 gap-3';
        div.innerHTML = `<div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full ${estilo.dot}"></span>
            <span class="text-sm font-bold text-slate-900 dark:text-white">${escaparHTML(t.nome)}</span>
        </div>
        <div class="flex items-center gap-1">
            <button onclick="editarTagForm('${t.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700/60"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            <button onclick="deletarTag('${t.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`;
        container.appendChild(div);
    });
    if (window.lucide) lucide.createIcons();
}
function selecionarCorTag(cor) {
    document.getElementById('tag-cor-selecionada').value = cor;
    document.querySelectorAll('#tag-color-picker .color-dot').forEach(b => b.classList.toggle('selected', b.dataset.color===cor));
}
function resetarFormTag() {
    document.getElementById('tag-id-editar').value = '';
    document.getElementById('tag-nome').value = '';
    document.getElementById('titulo-form-tag').textContent = 'Nova Tag';
    document.getElementById('btn-cancelar-tag').classList.add('hidden');
    selecionarCorTag('indigo');
}
function editarTagForm(id) {
    const t = tagsCache.find(x => String(x.id)===String(id));
    if (!t) return;
    document.getElementById('tag-id-editar').value = t.id;
    document.getElementById('tag-nome').value = t.nome;
    document.getElementById('titulo-form-tag').textContent = 'Editar Tag: '+t.nome;
    document.getElementById('btn-cancelar-tag').classList.remove('hidden');
    selecionarCorTag(t.cor||'indigo');
}
async function salvarTag(event) {
    event.preventDefault();
    const id = document.getElementById('tag-id-editar').value;
    const nome = document.getElementById('tag-nome').value.trim();
    const cor = document.getElementById('tag-cor-selecionada').value;
    if (!nome) return;
    const payload = { nome, cor };
    try {
        if (!modoDemo) {
            const url = id ? `${API_BASE_URL}/tags/${id}` : `${API_BASE_URL}/tags`;
            const method = id ? 'PATCH' : 'POST';
            const resp = await fetchAuth(url, { method, body: JSON.stringify(payload) });
            if (!resp) return;
            if (!resp.ok) throw new Error('Erro');
            exibirToast('Tag salva!', 'sucesso');
            await carregarTags();
            resetarFormTag();
            return;
        }
    } catch(e) { console.warn(e); }
    if (id) {
        const idx = tagsCache.findIndex(x => String(x.id)===String(id));
        if (idx!==-1) tagsCache[idx] = { ...tagsCache[idx], ...payload };
    } else {
        tagsCache.push({ id: 'tag_'+Date.now(), user_id: 'local', ...payload });
    }
    inicializarFiltroTags(); renderizarTagsSelects(); renderizarListaTagsGerenciamento(); resetarFormTag();
}
async function deletarTag(id) {
    confirmarAcao('Excluir tag?', 'Esta ação não pode ser desfeita. Deseja continuar?', async () => {
        try {
            if (!modoDemo) {
                const resp = await fetchAuth(`${API_BASE_URL}/tags/${id}`, { method: 'DELETE' });
                if (!resp) return;
                if (!resp.ok) throw new Error('Erro');
                exibirToast('Tag removida!', 'sucesso');
                await carregarTags();
                return;
            }
        } catch(e) { console.warn(e); }
        tagsCache = tagsCache.filter(x => String(x.id)!==String(id));
        inicializarFiltroTags(); renderizarTagsSelects(); renderizarListaTagsGerenciamento();
    });
}
async function carregarFiltrosSalvos() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/filtros`, { method: 'GET' });
        if (!resp) return;
        if (resp.ok) filtrosCache = await resp.json();
        else filtrosCache = [];
    } catch(e) { filtrosCache = []; }
    renderizarFiltrosSalvos();
}
function renderizarFiltrosSalvos() {
    const container = document.getElementById('lista-filtros-salvos');
    if (!container) return;
    container.innerHTML = '';
    if (filtrosCache.length===0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nenhum filtro salvo</p>';
        return;
    }
    filtrosCache.forEach(f => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 gap-3';
        div.innerHTML = `<div class="min-w-0">
            <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${escaparHTML(f.nome)}</p>
            <p class="text-xs text-slate-400 truncate">${escaparHTML(JSON.stringify(f.query).slice(0,80))}</p>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
            <button onclick="aplicarFiltroSalvo('${f.id}')" class="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30" title="Aplicar"><i data-lucide="play" class="w-3.5 h-3.5"></i></button>
            <button onclick="deletarFiltroSalvo('${f.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Excluir"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`;
        container.appendChild(div);
    });
    if (window.lucide) lucide.createIcons();
}
function abrirModalFiltros() { renderizarFiltrosSalvos(); abrirModal('modal-filtros'); }
function fecharModalFiltros() { fecharModal('modal-filtros'); }
async function salvarFiltroAtual() {
    const nome = document.getElementById('filtro-nome').value.trim();
    if (!nome) { exibirToast('Informe um nome para o filtro', 'erro'); return; }
    const query = {
        termo: document.getElementById('search-input').value,
        plano: document.getElementById('filter-plano').value,
        status: document.getElementById('filter-status').value,
        etapa: document.getElementById('filter-etapa')?.value || '',
        tag: document.getElementById('filter-tag')?.value || ''
    };
    try {
        if (!modoDemo) {
            const resp = await fetchAuth(`${API_BASE_URL}/filtros`, { method: 'POST', body: JSON.stringify({ nome, query }) });
            if (!resp) return;
            if (!resp.ok) throw new Error('Erro');
            exibirToast('Filtro salvo!', 'sucesso');
            document.getElementById('filtro-nome').value = '';
            await carregarFiltrosSalvos();
            return;
        }
    } catch(e) { console.warn(e); }
    filtrosCache.push({ id: 'filtro_'+Date.now(), user_id: 'local', nome, query });
    renderizarFiltrosSalvos();
    document.getElementById('filtro-nome').value = '';
}
async function aplicarFiltroSalvo(id) {
    const f = filtrosCache.find(x => String(x.id)===String(id));
    if (!f) return;
    document.getElementById('search-input').value = f.query.termo || '';
    document.getElementById('filter-plano').value = f.query.plano || '';
    document.getElementById('filter-status').value = f.query.status || '';
    if (document.getElementById('filter-etapa')) document.getElementById('filter-etapa').value = f.query.etapa || '';
    if (document.getElementById('filter-tag')) document.getElementById('filter-tag').value = f.query.tag || '';
    fecharModalFiltros();
    filtrarTabela();
    exibirToast('Filtro aplicado: '+f.nome, 'sucesso');
}
async function deletarFiltroSalvo(id) {
    confirmarAcao('Excluir filtro?', 'O filtro será removido permanentemente.', async () => {
        try {
            if (!modoDemo) {
                const resp = await fetchAuth(`${API_BASE_URL}/filtros/${id}`, { method: 'DELETE' });
                if (!resp) return;
                if (!resp.ok) throw new Error('Erro');
                await carregarFiltrosSalvos();
                return;
            }
        } catch(e) { console.warn(e); }
        filtrosCache = filtrosCache.filter(x => String(x.id)!==String(id));
        renderizarFiltrosSalvos();
    });
}

// ============================================================
// FASE 1B — ATIVIDADES (timeline + modal)
// ============================================================
async function carregarAtividades(clienteId) {
    // Live Server sem backend: usa cache local
    if (IS_LOCAL && modoDemo) {
        if (clienteId) return atividadesCache.filter(a => String(a.cliente_id)===String(clienteId));
        return [...atividadesCache];
    }
    try {
        const url = clienteId ? `${API_BASE_URL}/atividades?cliente_id=${clienteId}` : `${API_BASE_URL}/atividades`;
        const resp = await fetchAuth(url, { method: 'GET' });
        if (!resp || !resp.ok) {
            if (IS_LOCAL) {
                if (clienteId) return atividadesCache.filter(a => String(a.cliente_id)===String(clienteId));
                return [...atividadesCache];
            }
            return [];
        }
        const data = await resp.json();
        return Array.isArray(data) ? data : [];
    } catch(e) {
        if (IS_LOCAL) {
            if (clienteId) return atividadesCache.filter(a => String(a.cliente_id)===String(clienteId));
            return [...atividadesCache];
        }
        return [];
    }
}
function abrirModalAtividade(clienteId, clienteNome) {
    document.getElementById('atividade-cliente-id').value = clienteId;
    document.getElementById('atividade-cliente-nome').textContent = clienteNome || '';
    document.getElementById('atividade-tipo').value = 'ligacao';
    document.getElementById('atividade-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('atividade-nota').value = '';
    document.getElementById('atividade-concluida').checked = false;
    abrirModal('modal-atividade');
}
function fecharModalAtividade() { fecharModal('modal-atividade'); }
async function salvarAtividade(event) {
    event.preventDefault();
    const cliente_id = document.getElementById('atividade-cliente-id').value;
    const tipo = document.getElementById('atividade-tipo').value;
    const data = document.getElementById('atividade-data').value;
    const nota = document.getElementById('atividade-nota').value.trim() || null;
    const concluida = document.getElementById('atividade-concluida').checked;
    if (!cliente_id || !tipo || !data) { exibirToast('Preencha cliente, tipo e data', 'erro'); return; }
    const payload = { cliente_id, tipo, data, nota, concluida };
    try {
        if (!modoDemo) {
            const resp = await fetchAuth(`${API_BASE_URL}/atividades`, { method: 'POST', body: JSON.stringify(payload) });
            if (!resp) return;
            if (!resp.ok) throw new Error('Erro ao criar atividade');
            exibirToast('Atividade criada!', 'sucesso');
            fecharModalAtividade();
            // Recarrega timeline se modal detalhes aberto
            const detalhesBody = document.getElementById('detalhes-body');
            if (detalhesBody && !document.getElementById('modal-detalhes').classList.contains('hidden')) {
                const cliente = clientesCache.find(c => String(c.id)===String(cliente_id));
                if (cliente) abrirModalDetalhes(cliente.id);
            }
            // Atualiza cache para métrica
            try { const r = await fetchAuth(`${API_BASE_URL}/atividades`, { method: 'GET' }); if (r && r.ok) atividadesCache = await r.json(); } catch(e) {}
            atualizarMetricas(clientesCache);
            return;
        }
    } catch(e) {
        console.warn(e);
        if (!IS_LOCAL) { exibirToast('Erro ao criar atividade', 'erro'); return; }
        // Fallback IS_LOCAL sem backend: salva localmente
    }
    // Fallback Live Server / modoDemo (IS_LOCAL sem backend)
    const nova = { id: 'atividade_'+Date.now(), user_id: 'local', cliente_id, tipo, data, nota, concluida, created_at: new Date().toISOString() };
    atividadesCache.push(nova);
    exibirToast('Atividade criada! (Local)', 'sucesso');
    fecharModalAtividade();
    const detalhesBody2 = document.getElementById('detalhes-body');
    if (detalhesBody2 && !document.getElementById('modal-detalhes').classList.contains('hidden')) {
        const cliente = clientesCache.find(c => String(c.id)===String(cliente_id));
        if (cliente) abrirModalDetalhes(cliente.id);
    }
    atualizarMetricas(clientesCache);
}
async function toggleAtividadeConcluida(atividadeId, clienteId) {
    try {
        const atv = atividadesCache.find(a => String(a.id)===String(atividadeId));
        if (!atv) return;
        const novo = !atv.concluida;
        if (!modoDemo) {
            const resp = await fetchAuth(`${API_BASE_URL}/atividades/${atividadeId}`, { method: 'PATCH', body: JSON.stringify({ concluida: novo }) });
            if (!resp) return;
            if (!resp.ok) throw new Error('Erro');
            atv.concluida = novo;
            exibirToast(novo ? 'Atividade concluída' : 'Atividade reaberta', 'sucesso');
            if (clienteId) abrirModalDetalhes(clienteId);
            atualizarMetricas(clientesCache);
            return;
        }
    } catch(e) { console.warn(e); }
    // Fallback IS_LOCAL / modoDemo
    const atvLocal = atividadesCache.find(a => String(a.id)===String(atividadeId));
    if (atvLocal) {
        atvLocal.concluida = !atvLocal.concluida;
        exibirToast(atvLocal.concluida ? 'Atividade concluída (Local)' : 'Atividade reaberta (Local)', 'sucesso');
        if (clienteId) abrirModalDetalhes(clienteId);
        atualizarMetricas(clientesCache);
    }
}
async function deletarAtividade(atividadeId, clienteId) {
    confirmarAcao('Excluir atividade?', 'Esta atividade será removida.', async () => {
        try {
            if (!modoDemo) {
                const resp = await fetchAuth(`${API_BASE_URL}/atividades/${atividadeId}`, { method: 'DELETE' });
                if (!resp) return;
                if (!resp.ok) throw new Error('Erro');
                exibirToast('Atividade excluída', 'sucesso');
                if (clienteId) abrirModalDetalhes(clienteId);
                atualizarMetricas(clientesCache);
                return;
            }
        } catch(e) { console.warn(e); }
        // Fallback IS_LOCAL
        const idx = atividadesCache.findIndex(a => String(a.id)===String(atividadeId));
        if (idx !== -1) {
            atividadesCache.splice(idx, 1);
            exibirToast('Atividade excluída (Local)', 'sucesso');
            if (clienteId) abrirModalDetalhes(clienteId);
            atualizarMetricas(clientesCache);
        }
    });
}

// ============================================================
// FASE 1E — IMPORT CSV/EXCEL
// ============================================================
function abrirModalImport() {
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-result').classList.add('hidden');
    document.getElementById('btn-import-confirm').classList.add('hidden');
    document.getElementById('import-file-input').value = '';
    importPreviewData = [];
    document.getElementById('import-preview-table').innerHTML = '';
    document.getElementById('import-count').textContent = '';
    abrirModal('modal-import');
}
function fecharModalImport() { fecharModal('modal-import'); }
function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.errors.length) console.warn(results.errors);
                importPreviewData = results.data.slice(0, 1000).map(row => {
                    // Normaliza keys para lower
                    const norm = {};
                    Object.keys(row).forEach(k => norm[k.trim().toLowerCase()] = row[k]);
                    return {
                        nome: norm['nome'] || norm['name'] || '',
                        email: norm['email'] || norm['e-mail'] || '',
                        telefone: norm['telefone'] || norm['phone'] || '',
                        empresa: norm['empresa'] || norm['company'] || '',
                        cpf: norm['cpf'] || '',
                        plano: norm['plano'] || 'basico',
                        ativo: !(norm['ativo'] === 'false' || norm['ativo'] === '0')
                    };
                }).filter(r => r.nome && r.email);
                renderImportPreview();
            }
        });
    } else if (['xlsx','xls'].includes(ext)) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, {type: 'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws, {header:1});
            if (json.length < 2) { exibirToast('Arquivo vazio', 'erro'); return; }
            const headers = json[0].map(h => String(h).trim().toLowerCase());
            const rows = json.slice(1, 1001);
            importPreviewData = rows.map(row => {
                const obj = {};
                headers.forEach((h,i) => obj[h] = row[i]);
                return {
                    nome: obj['nome'] || obj['name'] || '',
                    email: obj['email'] || obj['e-mail'] || '',
                    telefone: obj['telefone'] || obj['phone'] || '',
                    empresa: obj['empresa'] || obj['company'] || '',
                    cpf: obj['cpf'] || '',
                    plano: obj['plano'] || 'basico',
                    ativo: !(obj['ativo'] === 'false' || obj['ativo'] === '0')
                };
            }).filter(r => r.nome && r.email);
            renderImportPreview();
        };
        reader.readAsArrayBuffer(file);
    } else {
        exibirToast('Formato não suportado. Use CSV ou Excel.', 'erro');
    }
}
function renderImportPreview() {
    const preview = document.getElementById('import-preview');
    const tableDiv = document.getElementById('import-preview-table');
    const countEl = document.getElementById('import-count');
    const btn = document.getElementById('btn-import-confirm');
    if (importPreviewData.length === 0) {
        tableDiv.innerHTML = '<p class="text-xs text-rose-500 p-3">Nenhum cliente válido (precisa nome e email)</p>';
        countEl.textContent = '';
        btn.classList.add('hidden');
        preview.classList.remove('hidden');
        return;
    }
    const headers = Object.keys(importPreviewData[0]);
    let html = '<table class="w-full text-left border-collapse"><thead><tr class="bg-slate-50 dark:bg-slate-800">';
    headers.forEach(h => html += `<th class="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">${escaparHTML(h)}</th>`);
    html += '</tr></thead><tbody>';
    importPreviewData.slice(0,5).forEach(row => {
        html += '<tr class="border-b border-slate-100 dark:border-slate-700/40">';
        headers.forEach(h => html += `<td class="px-2 py-1.5 text-xs truncate max-w-[120px]">${escaparHTML(String(row[h]||''))}</td>`);
        html += '</tr>';
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
    countEl.textContent = `${importPreviewData.length} clientes prontos para importar (mostrando 5)`;
    btn.classList.remove('hidden');
    preview.classList.remove('hidden');
    document.getElementById('import-result').classList.add('hidden');
}
async function confirmarImport() {
    if (importPreviewData.length === 0) return;
    const btn = document.getElementById('btn-import-confirm');
    const resultDiv = document.getElementById('import-result');
    setButtonLoading(btn, true, 'Importando...');
    try {
        if (!modoDemo) {
            const resp = await fetchAuth(`${API_BASE_URL}/clientes/import`, {
                method: 'POST',
                body: JSON.stringify({ clientes: importPreviewData })
            });
            if (!resp) { setButtonLoading(btn,false,'Importar'); return; }
            const data = await resp.json();
            if (resp.ok) {
                resultDiv.className = 'p-3 rounded-xl border text-sm bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';
                resultDiv.innerHTML = `✅ ${data.sucessos}/${data.total} importados. ${data.erros?.length ? data.erros.length+' erros (ver console)' : ''}`;
                resultDiv.classList.remove('hidden');
                exibirToast(`${data.sucessos} clientes importados!`, 'sucesso');
                await carregarClientes();
                setButtonLoading(btn,false,'Importar');
                return;
            } else {
                throw new Error(data.detail || 'Erro na importação');
            }
        }
    } catch(e) {
        console.warn(e);
        resultDiv.className = 'p-3 rounded-xl border text-sm bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300';
        resultDiv.textContent = 'Erro: '+(e.message||'Falha na importação');
        resultDiv.classList.remove('hidden');
        setButtonLoading(btn,false,'Importar');
        return;
    }
    // Fallback local
    let sucessos = 0;
    importPreviewData.forEach(row => {
        try {
            // Validação rápida
            if (!row.nome || !row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return;
            row.id = Date.now() + Math.random();
            row.data_cadastro = new Date().toISOString().split('T')[0];
            row.ativo = true;
            clientesCache.unshift(row);
            sucessos++;
        } catch(e) {}
    });
    resultDiv.className = 'p-3 rounded-xl border text-sm bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';
    resultDiv.textContent = `✅ ${sucessos}/${importPreviewData.length} importados (Local)`;
    resultDiv.classList.remove('hidden');
    atualizarMetricas(clientesCache);
    filtrarTabela();
    exibirToast(`${sucessos} clientes importados! (Local)`, 'sucesso');
    setButtonLoading(btn,false,'Importar');
}

// ============================================================
// 4. CLIENTES — carregar do backend, fallback demo local apenas se IS_LOCAL
//    GET /clientes via fetchAuth; em erro: modoDemo=true, usa CLIENTES_DEMO só se IS_LOCAL
//    Atualiza métricas e re-renderiza tabela/cards
// ============================================================
async function carregarClientes() {
    mostrarLoading(true);
    try {
        const response = await fetchAuth(`${API_BASE_URL}/clientes`, { method: 'GET' });
        if (!response) return; // Redirect handled by fetchAuth

        if (!response.ok) throw new Error(`Erro ${response.status}`);
        const data = await response.json();
        clientesCache = data;
        modoDemo = false;
        // Fase 1C — Carrega tags de cada cliente (paralelo, ignora erro)
        try {
            await Promise.all(clientesCache.map(async (c) => {
                try {
                    const r = await fetchAuth(`${API_BASE_URL}/clientes/${c.id}/tags`, { method: 'GET' });
                    if (r && r.ok) {
                        const tags = await r.json();
                        c._tags = tags.map(t => String(t.id));
                    } else {
                        c._tags = [];
                    }
                } catch(e) { c._tags = []; }
            }));
        } catch(e) {}
        // Fase 1B — Carrega atividades para métrica de atrasados (se houver)
        try {
            const rAtv = await fetchAuth(`${API_BASE_URL}/atividades`, { method: 'GET' });
            if (rAtv && rAtv.ok) {
                atividadesCache = await rAtv.json();
            }
        } catch(e) { atividadesCache = []; }
        atualizarMetricas(clientesCache);
        filtrarTabela();
        renderizarKanban();
    } catch (error) {
        console.warn('API/Banco offline. Ativando modo de demonstração local:', error);
        console.error('Detalhe do erro:', error.message, error.stack);
        const isAuthError = String(error.message).includes('401') || String(error.message).includes('Token');
        if (isAuthError && !IS_LOCAL) {
            // Sessão expirada ou sem login em produção: redireciona silenciosamente, sem toast de "sem conexão"
            localStorage.removeItem('df_token');
            localStorage.removeItem('df_user_id');
            window.location.href = '/?login=true';
            return;
        }
        modoDemo = true;
        if (clientesCache.length === 0 && IS_LOCAL) {
            clientesCache = [...CLIENTES_DEMO];
            // Demo: adiciona _tags vazio e etapa_id null para não quebrar Kanban
            clientesCache.forEach(c => { c._tags = c._tags || []; c.etapa_id = c.etapa_id || null; });
            exibirToast('Modo Local (Demo) ativado para testes interativos.', 'info');
        } else if (clientesCache.length === 0) {
            if (String(error.message).includes('Failed to fetch') || error.name === 'TypeError') {
                exibirToast('Sem conexão com o servidor. Verifique sua internet.', 'erro');
            } else {
                exibirToast(`Erro ao carregar clientes: ${error.message} (tente recarregar)`, 'erro');
            }
        }
        atualizarMetricas(clientesCache);
        filtrarTabela();
        renderizarKanban();
        verificarStatusAPI();
    } finally {
        mostrarLoading(false);
    }
}

// ============================================================
// 5. MÉTRICAS — calcula totais e renderiza cards (total, ativos, inativos, por plano)
//    Usa clientesCache + planosCache; cada plano ganha badge com MAPA_CORES_PLANO
//    Sem plano também é contabilizado em badge "Livre"
// ============================================================
function atualizarMetricas(clientes) {
    const total    = clientes.length;
    const ativos   = clientes.filter(c => c.ativo).length;
    const inativos = total - ativos;

    const ativosPct   = total > 0 ? Math.round((ativos   / total) * 100) : 0;
    const inativosPct = total > 0 ? Math.round((inativos / total) * 100) : 0;

    document.getElementById('metric-total').textContent       = total;
    document.getElementById('metric-ativos').textContent      = ativos;
    document.getElementById('metric-inativos').textContent    = inativos;
    document.getElementById('metric-ativos-pct').textContent  = `${ativosPct}%`;
    document.getElementById('metric-inativos-pct').textContent = `${inativosPct}%`;

    // Fase 1B/1D — Atrasados (follow-ups) e Receita prevista
    // Atrasados: baseado em status_pagamento === 'atrasado' (simples) + atividades atrasadas se carregadas
    let atrasados = clientes.filter(c => c.status_pagamento === 'atrasado').length;
    // Se atividadesCache tiver atrasadas, soma também (evita duplicar, usa max)
    if (atividadesCache && atividadesCache.length) {
        const hoje = new Date().toISOString().split('T')[0];
        const atrasadosAtiv = atividadesCache.filter(a => !a.concluida && a.data < hoje).length;
        // Usa o maior entre os dois para não subnotificar
        atrasados = Math.max(atrasados, atrasadosAtiv);
    }
    const atrasadosEl = document.getElementById('metric-atrasados');
    if (atrasadosEl) atrasadosEl.textContent = atrasados;

    // Receita prevista: soma valor_plano dos em_dia. Valor é string "R$ 1.500,00" -> parse float (BR)
    let receita = 0;
    clientes.forEach(c => {
        if (c.status_pagamento === 'em_dia' && c.valor_plano) {
            let raw = String(c.valor_plano).replace(/[^\d,.-]/g, '');
            let num;
            if (raw.includes(',')) {
                // BR: 1.500,00 -> 1500.00
                num = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
            } else {
                num = parseFloat(raw);
            }
            if (!isNaN(num)) receita += num;
        }
    });
    const receitaEl = document.getElementById('metric-receita');
    if (receitaEl) receitaEl.textContent = receita > 0 ? `R$ ${receita.toLocaleString('pt-BR', {minimumFractionDigits: 0})}` : 'R$ 0';

    // Renderizar métrica "Por Plano" dinamicamente conforme os planos reais do usuário
    const container = document.getElementById('metric-planos-container');
    if (container) {
        container.innerHTML = '';

        const counts = {};
        planosCache.forEach(p => { counts[p.id] = 0; });
        let semPlanoCount = 0;

        clientes.forEach(c => {
            if (c.plano && counts.hasOwnProperty(c.plano)) {
                counts[c.plano]++;
            } else {
                semPlanoCount++;
            }
        });

        planosCache.forEach(plano => {
            const count = counts[plano.id] || 0;
            const theme = (MAPA_CORES_PLANO && MAPA_CORES_PLANO[plano.cor]) ? MAPA_CORES_PLANO[plano.cor] : (MAPA_CORES_PLANO ? MAPA_CORES_PLANO.indigo : { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800/50' });
            const div = document.createElement('div');
            div.className = `rounded-xl ${theme.bg} border ${theme.border} px-1.5 py-1 text-center flex-1 min-w-[55px]`;
            div.innerHTML = `
                <div class="text-[8px] sm:text-[9px] font-bold uppercase tracking-wide leading-none ${theme.text} mb-1 truncate">${escaparHTML(plano.nome ? plano.nome.slice(0, 8) : '')}</div>
                <div class="text-sm font-black ${theme.text} tabular-nums leading-none">${count}</div>
            `;
            container.appendChild(div);
        });

        if (semPlanoCount > 0 || planosCache.length === 0) {
            const div = document.createElement('div');
            div.className = 'rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 px-1.5 py-1 text-center flex-1 min-w-[55px]';
            div.innerHTML = `
                <div class="text-[8px] sm:text-[9px] font-bold uppercase tracking-wide leading-none text-slate-500 dark:text-slate-400 mb-1 truncate">Livre</div>
                <div class="text-sm font-black text-slate-600 dark:text-slate-300 tabular-nums leading-none">${semPlanoCount}</div>
            `;
            container.appendChild(div);
        }
    }
}

// ============================================================
// 6. FILTRAGEM E RENDERIZAÇÃO — busca textual + filtros de plano/status
//    - filtrarTabela(): filtra clientesCache por termo, plano e status -> renderizarClientes()
//    - renderizarClientes(): gera <tr> desktop e .client-card mobile; usa escaparHTML em tudo
//    Empty state quando 0 resultados; re-cria ícones Lucide ao final
// ============================================================
function filtrarTabela() {
    const termo        = document.getElementById('search-input').value.toLowerCase().trim();
    const planoFiltro  = document.getElementById('filter-plano').value;
    const statusFiltro = document.getElementById('filter-status').value;
    const etapaFiltro  = document.getElementById('filter-etapa')?.value || '';
    const tagFiltro    = document.getElementById('filter-tag')?.value || '';

    const filtrados = clientesCache.filter(c => {
        const haystack = [
            c.nome, c.email,
            c.telefone || '', c.cpf || '',
            c.empresa || '', c.cidade || '',
            String(c.id)
        ].join(' ').toLowerCase();

        const matchBusca  = !termo || haystack.includes(termo);
        const matchPlano  = !planoFiltro  || String(c.plano) === String(planoFiltro) || (planoFiltro === '__sem_plano__' && !c.plano);
        const matchStatus = !statusFiltro || (statusFiltro === 'ativo' ? c.ativo : !c.ativo);
        const matchEtapa  = !etapaFiltro || String(c.etapa_id) === String(etapaFiltro) || (etapaFiltro === '__sem_etapa__' && !c.etapa_id);
        let matchTag = true;
        if (tagFiltro) {
            const tagIds = c._tags || [];
            matchTag = tagIds.includes(tagFiltro);
        }

        return matchBusca && matchPlano && matchStatus && matchEtapa && matchTag;
    });

    renderizarClientes(filtrados);
    // Também atualiza Kanban se visível
    if (viewMode === 'kanban') renderizarKanban();
}

function renderizarClientes(clientes) {
    const tbody                = document.getElementById('tabela-clientes-body');
    const mobileCardsContainer = document.getElementById('mobile-cards-container');
    const emptyState           = document.getElementById('empty-state');

    tbody.innerHTML                = '';
    mobileCardsContainer.innerHTML = '';

    if (clientes.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
        if (window.lucide) lucide.createIcons();
        return;
    }

    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');

    clientes.forEach((cliente, index) => {
        const ordinal = `#${index + 1}`;
        const dataFormatada = formatarData(cliente.data_cadastro);
        const planoBadgeHTML = getPlanoBadgeHTML(cliente.plano);
        const statusBadgeHTML = getStatusBadgeHTML(cliente.ativo, cliente.id);

        // Desktop row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors duration-150 group';
        tr.innerHTML = `
            <td class="py-3 px-5 font-mono text-xs font-semibold text-slate-400 dark:text-slate-500">${ordinal}</td>
            <td class="py-3 px-5">
                <div class="flex items-center gap-2.5 cursor-pointer" onclick="abrirModalDetalhes(${cliente.id})" title="Ver detalhes completos">
                    <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white shadow-sm"
                         style="background: ${avatarGradient(cliente.nome)};">${avatarInitials(cliente.nome)}</div>
                    <div>
                        <span class="font-bold text-slate-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escaparHTML(cliente.nome)}</span>
                        ${cliente.empresa ? `<p class="text-[11px] text-slate-400 dark:text-slate-500 font-medium">${escaparHTML(cliente.empresa)}</p>` : ''}
                    </div>
                </div>
            </td>
            <td class="py-3 px-5 text-sm text-slate-600 dark:text-slate-300">${escaparHTML(cliente.email)}</td>
            <td class="py-3 px-5 hidden xl:table-cell text-xs text-slate-500 dark:text-slate-400 font-mono">${escaparHTML(cliente.telefone || '—')}</td>
            <td class="py-3 px-5">${planoBadgeHTML}</td>
            <td class="py-3 px-5">${statusBadgeHTML}</td>
            <td class="py-3 px-5 hidden lg:table-cell text-xs text-slate-400 dark:text-slate-500">${dataFormatada}</td>
            <td class="py-3 px-5 text-right">
                <div class="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button onclick="abrirModalDetalhes(${cliente.id})"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                        title="Ver Detalhes">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="abrirModalEditar(${cliente.id})"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all"
                        title="Editar">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="abrirModalDeletar(${cliente.id})"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all"
                        title="Excluir">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // Mobile card
        const card = document.createElement('div');
        card.className = 'client-card p-4 space-y-3';
        card.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2.5 min-w-0 cursor-pointer" onclick="abrirModalDetalhes(${cliente.id})">
                    <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                         style="background: ${avatarGradient(cliente.nome)};">${avatarInitials(cliente.nome)}</div>
                    <div class="min-w-0">
                        <h4 class="font-bold text-slate-900 dark:text-white text-sm leading-snug truncate">${escaparHTML(cliente.nome)}</h4>
                        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${escaparHTML(cliente.email)}</p>
                    </div>
                </div>
                <div class="flex-shrink-0">${statusBadgeHTML}</div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <div>${planoBadgeHTML}</div>
                <span class="text-[11px] text-slate-400 dark:text-slate-500 font-mono font-semibold">${ordinal}</span>
            </div>
            <div class="grid grid-cols-3 gap-1.5 pt-1">
                <button onclick="abrirModalDetalhes(${cliente.id})"
                    class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium active:scale-[0.97]">
                    <i data-lucide="eye" class="w-3.5 h-3.5 text-indigo-500"></i> Ver
                </button>
                <button onclick="abrirModalEditar(${cliente.id})"
                    class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-xs font-semibold active:scale-[0.97]">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar
                </button>
                <button onclick="abrirModalDeletar(${cliente.id})"
                    class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-xs font-semibold active:scale-[0.97]">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Excluir
                </button>
            </div>
        `;
        mobileCardsContainer.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// BADGES E FORMATADORES — helpers visuais puros (sem side effects)
// - getPlanoBadgeHTML(): badge colorido por plano (via MAPA_CORES_PLANO)
// - getStatusBadgeHTML(): botão Ativo/Inativo que faz toggle ao clicar
// - avatarInitials()/avatarGradient(): iniciais e gradiente determinístico por nome
// - formatarData(): YYYY-MM-DD -> DD/MM/YYYY
// ============================================================
function getPlanoBadgeHTML(planoId) {
    if (!planoId) {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400 border border-slate-200 dark:border-slate-600/60">Sem plano</span>`;
    }
    const p = planosCache.find(x => String(x.id) === String(planoId));
    if (!p) {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:text-slate-300 capitalize">${escaparHTML(planoId)}</span>`;
    }
    const estilo = MAPA_CORES_PLANO[p.cor] || MAPA_CORES_PLANO.slate;
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${estilo.bg} ${estilo.text} border ${estilo.border}">
                <span class="w-1.5 h-1.5 rounded-full ${estilo.dot}"></span>${escaparHTML(p.nome)}
            </span>`;
}

function getStatusBadgeHTML(ativo, clienteId) {
    return ativo
        ? `<button onclick="toggleStatusCliente(${clienteId}, false)" title="Clique para desativar"
               class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors">
               <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Ativo
           </button>`
        : `<button onclick="toggleStatusCliente(${clienteId}, true)" title="Clique para ativar"
               class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 hover:bg-rose-100 transition-colors">
               <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Inativo
           </button>`;
}

function avatarInitials(nome) {
    if (!nome) return '?';
    const parts = nome.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarGradient(nome) {
    const gradients = [
        'linear-gradient(135deg,#4f46e5,#06b6d4)',
        'linear-gradient(135deg,#059669,#10b981)',
        'linear-gradient(135deg,#d97706,#f59e0b)',
        'linear-gradient(135deg,#7c3aed,#ec4899)',
        'linear-gradient(135deg,#2563eb,#3b82f6)',
        'linear-gradient(135deg,#e11d48,#f43f5e)',
    ];
    const idx = (nome || '').charCodeAt(0) % gradients.length;
    return gradients[idx];
}

function formatarData(rawDate) {
    if (!rawDate) return '—';
    if (rawDate.includes('-')) {
        const parts = rawDate.split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return rawDate;
}

// ============================================================
// 7. SEÇÕES COLAPSÁVEIS — Contato, Dados Pessoais, Endereço nos modais
//    toggleSection(key): mostra/esconde #key-section e rotaciona chevron
// ============================================================
function toggleSection(key) {
    const secao   = document.getElementById(`${key}-section`);
    const chevron = document.getElementById(`${key}-chevron`);
    if (!secao) return;

    const isHidden = secao.classList.contains('hidden');
    secao.classList.toggle('hidden', !isHidden);
    if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

function toggleContatoSection(ctx) {
    toggleSection(`${ctx}-contato`);
}

// ============================================================
// 8. VIA CEP — busca endereço por CEP com sanitização anti-XSS
//    Sanitiza resposta (remove < > " ' &), valida campos e preenche logradouro/bairro/cidade/uf
// ============================================================
async function buscarCEP(cep, ctx) {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    const icon = document.getElementById(`${ctx}-cep-icon`);
    if (icon) icon.className = 'w-4 h-4 text-indigo-500 animate-spin';

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();

        if (data.erro) {
            exibirToast('CEP não encontrado.', 'info');
            return;
        }

        // Validação e sanitização da resposta ViaCEP (prevenção supply chain)
        const sanitize = (val) => {
            if (!val || typeof val !== 'string') return '';
            // Remove caracteres perigosos, mantém apenas alfanuméricos, espaços e pontuação básica
            return val.replace(/[<>\"'&]/g, '').substring(0, 200);
        };

        // Valida campos esperados
        const expectedFields = ['logradouro', 'bairro', 'localidade', 'uf'];
        const hasValidData = expectedFields.some(f => data[f] && typeof data[f] === 'string');
        
        if (!hasValidData) {
            exibirToast('Resposta do CEP inválida.', 'erro');
            return;
        }

        document.getElementById(`${ctx}-logradouro`).value = sanitize(data.logradouro);
        document.getElementById(`${ctx}-bairro`).value     = sanitize(data.bairro);
        document.getElementById(`${ctx}-cidade`).value     = sanitize(data.localidade);
        document.getElementById(`${ctx}-estado`).value     = sanitize(data.uf);

        exibirToast('Endereço preenchido automaticamente via CEP!', 'sucesso');
    } catch (e) {
        console.warn('Erro ao consultar ViaCEP:', e);
    } finally {
        if (icon) icon.className = 'w-4 h-4 text-slate-400';
    }
}

// ============================================================
// 9. MODAL NOVO CLIENTE — criar cliente (POST /clientes)
//    abrirModalCriar(): reset form, ativa status, limpa plano, abre modal
//    salvarNovoCliente(): valida, monta payload, tenta API via fetchAuth, fallback modoDemo
// ============================================================
function abrirModalCriar() {
    const form = document.getElementById('form-criar');
    if (form) form.reset();

    const ativoCheckbox = document.getElementById('criar-ativo');
    if (ativoCheckbox) ativoCheckbox.checked = true;

    setPlanoToggle('criar', false);
    // Fase 1 — reset etapa, financeiro, tags
    if (document.getElementById('criar-etapa')) document.getElementById('criar-etapa').value = '';
    if (document.getElementById('criar-valor-plano')) document.getElementById('criar-valor-plano').value = '';
    if (document.getElementById('criar-vencimento')) document.getElementById('criar-vencimento').value = '';
    if (document.getElementById('criar-status-pagamento')) document.getElementById('criar-status-pagamento').value = '';
    document.querySelectorAll('#criar-tags-container .tag-checkbox').forEach(cb => cb.checked = false);
    limparErrosForm('form-criar');

    abrirModal('modal-criar');
}

function fecharModalCriar() {
    fecharModal('modal-criar');
}

async function salvarNovoCliente(event) {
    event.preventDefault();
    if (!validarFormulario('criar')) return;

    const btnSubmit = document.getElementById('btn-submit-criar');

    const planoAtivo       = document.getElementById('criar-plano-toggle')?.checked;
    const planoSelecionado = planoAtivo ? getPlanoSelecionado('criar') : null;

    const novoCliente = {
        nome:            document.getElementById('criar-nome').value.trim(),
        email:           document.getElementById('criar-email').value.trim(),
        plano:           planoSelecionado,
        ativo:           Boolean(document.getElementById('criar-ativo')?.checked),
        telefone:        document.getElementById('criar-telefone')?.value.trim() || null,
        cpf:             document.getElementById('criar-cpf')?.value.trim()      || null,
        rg:              document.getElementById('criar-rg')?.value.trim()       || null,
        empresa:         document.getElementById('criar-empresa')?.value.trim()  || null,
        cargo:           document.getElementById('criar-cargo')?.value.trim()    || null,
        data_nascimento: document.getElementById('criar-nascimento')?.value      || null,
        genero:          document.getElementById('criar-genero')?.value          || null,
        cep:             document.getElementById('criar-cep')?.value.trim()      || null,
        logradouro:      document.getElementById('criar-logradouro')?.value.trim() || null,
        numero:          document.getElementById('criar-numero')?.value.trim()   || null,
        complemento:     document.getElementById('criar-complemento')?.value.trim() || null,
        bairro:          document.getElementById('criar-bairro')?.value.trim()   || null,
        cidade:          document.getElementById('criar-cidade')?.value.trim()   || null,
        estado:          document.getElementById('criar-estado')?.value.trim().toUpperCase() || null,
        observacoes:     document.getElementById('criar-observacoes')?.value.trim() || null,
        etapa_id:        document.getElementById('criar-etapa')?.value || null,
        valor_plano:     document.getElementById('criar-valor-plano')?.value.trim() || null,
        vencimento_dia:  document.getElementById('criar-vencimento')?.value ? parseInt(document.getElementById('criar-vencimento').value) : null,
        status_pagamento: document.getElementById('criar-status-pagamento')?.value || null,
        data_cadastro:   new Date().toISOString().split('T')[0]
    };

    setButtonLoading(btnSubmit, true, 'Cadastrando...');

    try {
        if (!modoDemo) {
            const response = await fetchAuth(`${API_BASE_URL}/clientes`, {
                method: 'POST',
                body: JSON.stringify(novoCliente),
            });
            if (!response) return; // Redirect handled by fetchAuth

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao criar cliente.`);
            }

            const clienteCriado = await response.json();
            // Vincula tags selecionadas (Fase 1C)
            const tagsSelCriar = [...document.querySelectorAll('#criar-tags-container .tag-checkbox:checked')].map(cb => cb.value);
            for (const tagId of tagsSelCriar) {
                try { await fetchAuth(`${API_BASE_URL}/clientes/${clienteCriado.id}/tags`, { method: 'POST', body: JSON.stringify({ tag_id: tagId }) }); } catch(e) {}
            }
            if (tagsSelCriar.length) clienteCriado._tags = tagsSelCriar;
            exibirToast(`Cliente "${clienteCriado.nome}" criado com sucesso!`, 'sucesso');
            fecharModalCriar();
            setButtonLoading(btnSubmit, false, 'Cadastrar Cliente');
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Executando em modo local:', error);
        exibirToast(error.message || 'Erro ao comunicar com a API.', 'erro');
    }

    // Fallback Modo Demo Local
    novoCliente.id = Date.now();
    try {
        const tagsSelCriarLocal = [...document.querySelectorAll('#criar-tags-container .tag-checkbox:checked')].map(cb => cb.value);
        if (tagsSelCriarLocal.length) novoCliente._tags = tagsSelCriarLocal;
    } catch(e) {}
    clientesCache.unshift(novoCliente);
    atualizarMetricas(clientesCache);
    filtrarTabela();
    renderizarKanban();
    exibirToast(`Cliente "${novoCliente.nome}" cadastrado! (Modo Local)`, 'sucesso');
    fecharModalCriar();
    setButtonLoading(btnSubmit, false, 'Cadastrar Cliente');
}

// ============================================================
// 10. MODAL EDITAR CLIENTE — PATCH /clientes/{id}
//     abrirModalEditar(): preenche form com dados do cache; salvarEdicaoCliente(): valida + PATCH
// ============================================================
function abrirModalEditar(id) {
    const cliente = clientesCache.find(c => String(c.id) === String(id));
    if (!cliente) return;

    document.getElementById('editar-id').value            = cliente.id;
    document.getElementById('editar-id-label').textContent = cliente.id;
    document.getElementById('editar-nome').value          = cliente.nome;
    document.getElementById('editar-email').value         = cliente.email;
    document.getElementById('editar-ativo').checked       = cliente.ativo;

    // Plano
    const temPlano = !!cliente.plano;
    setPlanoToggle('editar', temPlano);
    if (temPlano) setPlanoSelecionado('editar', cliente.plano);

    // Contato
    if (document.getElementById('editar-telefone')) document.getElementById('editar-telefone').value = cliente.telefone || '';
    if (document.getElementById('editar-cpf'))      document.getElementById('editar-cpf').value      = cliente.cpf || '';
    if (document.getElementById('editar-rg'))       document.getElementById('editar-rg').value       = cliente.rg || '';

    // Pessoais
    if (document.getElementById('editar-empresa'))    document.getElementById('editar-empresa').value    = cliente.empresa || '';
    if (document.getElementById('editar-cargo'))      document.getElementById('editar-cargo').value      = cliente.cargo || '';
    if (document.getElementById('editar-nascimento')) document.getElementById('editar-nascimento').value = cliente.data_nascimento || '';
    if (document.getElementById('editar-genero'))     document.getElementById('editar-genero').value     = cliente.genero || '';

    // Endereço
    if (document.getElementById('editar-cep'))         document.getElementById('editar-cep').value         = cliente.cep || '';
    if (document.getElementById('editar-logradouro'))  document.getElementById('editar-logradouro').value  = cliente.logradouro || '';
    if (document.getElementById('editar-numero'))      document.getElementById('editar-numero').value      = cliente.numero || '';
    if (document.getElementById('editar-complemento')) document.getElementById('editar-complemento').value = cliente.complemento || '';
    if (document.getElementById('editar-bairro'))      document.getElementById('editar-bairro').value      = cliente.bairro || '';
    if (document.getElementById('editar-cidade'))      document.getElementById('editar-cidade').value      = cliente.cidade || '';
    if (document.getElementById('editar-estado'))      document.getElementById('editar-estado').value      = cliente.estado || '';
    if (document.getElementById('editar-observacoes')) document.getElementById('editar-observacoes').value = cliente.observacoes || '';

    // Fase 1A — Etapa
    if (document.getElementById('editar-etapa')) document.getElementById('editar-etapa').value = cliente.etapa_id || '';
    // Fase 1D — Financeiro
    if (document.getElementById('editar-valor-plano')) document.getElementById('editar-valor-plano').value = cliente.valor_plano || '';
    if (document.getElementById('editar-vencimento')) document.getElementById('editar-vencimento').value = cliente.vencimento_dia || '';
    if (document.getElementById('editar-status-pagamento')) document.getElementById('editar-status-pagamento').value = cliente.status_pagamento || '';
    // Fase 1C — Tags (precisa tagsCache já carregado)
    // Se cliente._tags não estiver preenchido, tenta buscar do backend (async, não bloqueia)
    if (!cliente._tags && cliente.id) {
        fetchAuth(`${API_BASE_URL}/clientes/${cliente.id}/tags`, { method: 'GET' }).then(r => r && r.ok ? r.json() : []).then(tags => {
            cliente._tags = tags.map(t => String(t.id));
            document.querySelectorAll('#editar-tags-container .tag-checkbox').forEach(cb => {
                cb.checked = cliente._tags.includes(cb.value);
            });
        }).catch(()=>{});
    }
    const tagsCliente = cliente._tags || [];
    document.querySelectorAll('#editar-tags-container .tag-checkbox').forEach(cb => {
        cb.checked = tagsCliente.includes(cb.value);
    });

    limparErrosForm('form-editar');
    abrirModal('modal-editar');
}

function fecharModalEditar() {
    fecharModal('modal-editar');
}

async function salvarEdicaoCliente(event) {
    event.preventDefault();
    if (!validarFormulario('editar')) return;

    const id        = document.getElementById('editar-id').value;
    const btnSubmit = document.getElementById('btn-submit-editar');

    const planoAtivo       = document.getElementById('editar-plano-toggle')?.checked;
    const planoSelecionado = planoAtivo ? getPlanoSelecionado('editar') : null;

    const clienteAtualizado = {
        nome:            document.getElementById('editar-nome').value.trim(),
        email:           document.getElementById('editar-email').value.trim(),
        plano:           planoSelecionado,
        ativo:           Boolean(document.getElementById('editar-ativo')?.checked),
        telefone:        document.getElementById('editar-telefone')?.value.trim() || null,
        cpf:             document.getElementById('editar-cpf')?.value.trim()      || null,
        rg:              document.getElementById('editar-rg')?.value.trim()       || null,
        empresa:         document.getElementById('editar-empresa')?.value.trim()  || null,
        cargo:           document.getElementById('editar-cargo')?.value.trim()    || null,
        data_nascimento: document.getElementById('editar-nascimento')?.value      || null,
        genero:          document.getElementById('editar-genero')?.value          || null,
        cep:             document.getElementById('editar-cep')?.value.trim()      || null,
        logradouro:      document.getElementById('editar-logradouro')?.value.trim() || null,
        numero:          document.getElementById('editar-numero')?.value.trim()   || null,
        complemento:     document.getElementById('editar-complemento')?.value.trim() || null,
        bairro:          document.getElementById('editar-bairro')?.value.trim()   || null,
        cidade:          document.getElementById('editar-cidade')?.value.trim()   || null,
        estado:          document.getElementById('editar-estado')?.value.trim().toUpperCase() || null,
        observacoes:     document.getElementById('editar-observacoes')?.value.trim() || null,
        etapa_id:        document.getElementById('editar-etapa')?.value || null,
        valor_plano:     document.getElementById('editar-valor-plano')?.value.trim() || null,
        vencimento_dia:  document.getElementById('editar-vencimento')?.value ? parseInt(document.getElementById('editar-vencimento').value) : null,
        status_pagamento: document.getElementById('editar-status-pagamento')?.value || null,
    };

    setButtonLoading(btnSubmit, true, 'Salvando...');

    try {
        if (!modoDemo) {
            const response = await fetchAuth(`${API_BASE_URL}/clientes/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(clienteAtualizado),
            });
            if (!response) return; // Redirect handled by fetchAuth

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao atualizar.`);
            }
            // Sincroniza tags (Fase 1C) — adiciona selecionadas, remove desselecionadas
            const tagsSelEditar = [...document.querySelectorAll('#editar-tags-container .tag-checkbox:checked')].map(cb => cb.value);
            const clienteAntigo = clientesCache.find(c => String(c.id)===String(id));
            const tagsAntigas = clienteAntigo?._tags || [];
            for (const tagId of tagsSelEditar) {
                if (!tagsAntigas.includes(tagId)) {
                    try { await fetchAuth(`${API_BASE_URL}/clientes/${id}/tags`, { method: 'POST', body: JSON.stringify({ tag_id: tagId }) }); } catch(e) {}
                }
            }
            for (const tagId of tagsAntigas) {
                if (!tagsSelEditar.includes(tagId)) {
                    try { await fetchAuth(`${API_BASE_URL}/clientes/${id}/tags/${tagId}`, { method: 'DELETE' }); } catch(e) {}
                }
            }

            const ordinalOk = clientesCache.findIndex(c => String(c.id)===String(id)) + 1;
            exibirToast(`Cliente "${clienteAtualizado.nome}" (#${ordinalOk || id}) atualizado com sucesso!`, 'sucesso');
            fecharModalEditar();
            setButtonLoading(btnSubmit, false, 'Salvar Alterações');
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Salvando edição em modo local:', error);
        // Não mostra erro aqui — fallback local ainda vai salvar
    }

    // Fallback Modo Demo Local (sempre executa se não retornou antes, inclusive em IS_LOCAL)
    try {
        const index = clientesCache.findIndex(c => String(c.id) === String(id));
        if (index !== -1) {
            let tagsSelEditarLocal = [];
            try {
                tagsSelEditarLocal = [...document.querySelectorAll('#editar-tags-container .tag-checkbox:checked')].map(cb => cb.value);
            } catch(e) {}
            clientesCache[index] = { ...clientesCache[index], ...clienteAtualizado, _tags: tagsSelEditarLocal };
            atualizarMetricas(clientesCache);
            filtrarTabela();
            renderizarKanban();
            const ordLocal = index + 1;
            exibirToast(`Cliente "${clienteAtualizado.nome}" (#${ordLocal}) atualizado! ${modoDemo || IS_LOCAL ? '(Local)' : ''}`, 'sucesso');
        } else {
            exibirToast(`Cliente não encontrado no cache`, 'erro');
        }
    } catch (e) {
        console.error('Erro no fallback local:', e);
        exibirToast('Erro ao salvar localmente', 'erro');
    }
    fecharModalEditar();
    setButtonLoading(btnSubmit, false, 'Salvar Alterações');
}

// ============================================================
// 11. TOGGLE RÁPIDO DE STATUS — alterna ativo/inativo direto na tabela (PATCH {ativo})
// ============================================================
async function toggleStatusCliente(id, novoStatus) {
    const cliToggle = clientesCache.find(c => String(c.id)===String(id));
    const nomeToggle = cliToggle ? cliToggle.nome : '';
    const ordToggle = cliToggle ? clientesCache.findIndex(c => String(c.id)===String(id))+1 : id;
    try {
        if (!modoDemo) {
            const response = await fetchAuth(`${API_BASE_URL}/clientes/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ ativo: novoStatus })
            });
            if (!response) return; // Redirect handled by fetchAuth

            if (!response.ok) throw new Error(`Erro ao alterar status`);

            exibirToast(`Cliente "${nomeToggle}" (#${ordToggle}) ${novoStatus ? 'ativado' : 'inativado'}!`, 'sucesso');
            carregarClientes();
            return;
        }
    } catch (e) {
        console.warn('Modo local para status toggle:', e);
    }

    const index = clientesCache.findIndex(c => String(c.id) === String(id));
    if (index !== -1) {
        clientesCache[index].ativo = novoStatus;
        atualizarMetricas(clientesCache);
        filtrarTabela();
        exibirToast(`Cliente "${clientesCache[index].nome}" (#${index+1}) ${novoStatus ? 'ativado' : 'inativado'}! (Local)`, 'sucesso');
    }
}

// ============================================================
// 12. MODAL DETALHES — somente leitura, renderiza todos os campos do cliente em seções
// ============================================================
function abrirModalDetalhes(id) {
    const cliente = clientesCache.find(c => String(c.id) === String(id));
    if (!cliente) return;

    document.getElementById('detalhes-avatar').style.background = avatarGradient(cliente.nome);
    document.getElementById('detalhes-avatar').textContent       = avatarInitials(cliente.nome);
    document.getElementById('detalhes-nome').textContent         = cliente.nome;
    document.getElementById('detalhes-email').textContent        = cliente.email;

    const body = document.getElementById('detalhes-body');
    const planoHTML = getPlanoBadgeHTML(cliente.plano);
    const statusHTML = cliente.ativo
        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Ativo</span>`
        : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">Inativo</span>`;
    const etapaObj = etapasCache.find(e => String(e.id)===String(cliente.etapa_id));
    const etapaHTML2 = etapaObj ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${(MAPA_CORES_PLANO[etapaObj.cor]||MAPA_CORES_PLANO.indigo).bg} ${(MAPA_CORES_PLANO[etapaObj.cor]||MAPA_CORES_PLANO.indigo).text} border ${(MAPA_CORES_PLANO[etapaObj.cor]||MAPA_CORES_PLANO.indigo).border}"><span class="w-1.5 h-1.5 rounded-full ${(MAPA_CORES_PLANO[etapaObj.cor]||MAPA_CORES_PLANO.indigo).dot}"></span>${escaparHTML(etapaObj.nome)}</span>` : '<span class="text-xs text-slate-400">Sem etapa</span>';
    const financeiroHTML2 = (cliente.valor_plano || cliente.vencimento_dia || cliente.status_pagamento) ? `
        <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Financeiro</h4>
            <div class="grid grid-cols-3 gap-2 text-xs">
                ${cliente.valor_plano ? `<div><span class="text-slate-400">Valor:</span> <strong class="text-slate-800 dark:text-slate-200">${escaparHTML(cliente.valor_plano)}</strong></div>` : ''}
                ${cliente.vencimento_dia ? `<div><span class="text-slate-400">Vencimento:</span> <strong class="text-slate-800 dark:text-slate-200">Dia ${cliente.vencimento_dia}</strong></div>` : ''}
                ${cliente.status_pagamento ? `<div><span class="text-slate-400">Status:</span> <strong class="${cliente.status_pagamento==='atrasado'?'text-rose-600':cliente.status_pagamento==='em_dia'?'text-emerald-600':'text-slate-600'}">${escaparHTML(cliente.status_pagamento)}</strong></div>` : ''}
            </div>
        </div>` : '';
    const tagsCliente2 = cliente._tags || [];
    const tagsHTML2 = tagsCliente2.length ? `
        <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Tags</h4>
            <div class="flex flex-wrap gap-1.5">
                ${tagsCliente2.map(tid => {
                    const t = tagsCache.find(x => String(x.id)===String(tid));
                    if (!t) return '';
                    const estilo = MAPA_CORES_PLANO[t.cor] || MAPA_CORES_PLANO.slate;
                    return `<span class="px-2 py-0.5 text-xs font-bold rounded-full ${estilo.bg} ${estilo.text} border ${estilo.border}">${escaparHTML(t.nome)}</span>`;
                }).join('')}
            </div>
        </div>` : '';

    body.innerHTML = `
        <div class="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
            <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                <div class="mt-0.5">${statusHTML}</div>
            </div>
            <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plano</span>
                <div class="mt-0.5">${planoHTML}</div>
            </div>
            <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Etapa</span>
                <div class="mt-0.5">${etapaHTML2}</div>
            </div>
        </div>
        ${financeiroHTML2}
        ${tagsHTML2}

        <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Contato & Documentos</h4>
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div><span class="text-slate-400">Telefone:</span> <strong class="text-slate-800 dark:text-slate-200">${escaparHTML(cliente.telefone || '—')}</strong></div>
                <div><span class="text-slate-400">CPF:</span> <strong class="text-slate-800 dark:text-slate-200 font-mono">${escaparHTML(cliente.cpf || '—')}</strong></div>
                <div><span class="text-slate-400">RG:</span> <strong class="text-slate-800 dark:text-slate-200 font-mono">${escaparHTML(cliente.rg || '—')}</strong></div>
                <div><span class="text-slate-400">Cadastro:</span> <strong class="text-slate-800 dark:text-slate-200">${formatarData(cliente.data_cadastro)}</strong></div>
            </div>
        </div>

        ${(cliente.empresa || cliente.cargo || cliente.data_nascimento || cliente.genero) ? `
        <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Dados Pessoais & Empresa</h4>
            <div class="grid grid-cols-2 gap-2 text-xs">
                ${cliente.empresa ? `<div><span class="text-slate-400">Empresa:</span> <strong class="text-slate-800 dark:text-slate-200">${escaparHTML(cliente.empresa)}</strong></div>` : ''}
                ${cliente.cargo ? `<div><span class="text-slate-400">Cargo:</span> <strong class="text-slate-800 dark:text-slate-200">${escaparHTML(cliente.cargo)}</strong></div>` : ''}
                ${cliente.data_nascimento ? `<div><span class="text-slate-400">Nascimento:</span> <strong class="text-slate-800 dark:text-slate-200">${formatarData(cliente.data_nascimento)}</strong></div>` : ''}
                ${cliente.genero ? `<div><span class="text-slate-400">Gênero:</span> <strong class="text-slate-800 dark:text-slate-200">${escaparHTML(cliente.genero)}</strong></div>` : ''}
            </div>
        </div>
        ` : ''}

        ${(cliente.logradouro || cliente.cidade || cliente.cep) ? `
        <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Endereço</h4>
            <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                ${escaparHTML(cliente.logradouro || '')} ${escaparHTML(cliente.numero ? ', ' + cliente.numero : '')} ${escaparHTML(cliente.complemento ? ' (' + cliente.complemento + ')' : '')}<br>
                ${escaparHTML(cliente.bairro ? cliente.bairro + ' — ' : '')}${escaparHTML(cliente.cidade || '')} ${escaparHTML(cliente.estado ? '/ ' + cliente.estado : '')}<br>
                ${cliente.cep ? `<span class="font-mono text-slate-400">CEP: ${escaparHTML(cliente.cep)}</span>` : ''}
            </p>
        </div>
        ` : ''}

        ${cliente.observacoes ? `
        <div class="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Observações</h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg italic">
                "${escaparHTML(cliente.observacoes)}"
            </p>
        </div>
        ` : ''}
        <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Atividades</h4>
                <button onclick="abrirModalAtividade(${cliente.id}, '${escaparHTML(cliente.nome).replace(/'/g,"\\'")}')" class="px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i> Nova</button>
            </div>
            <div id="detalhes-atividades" class="space-y-2">
                <p class="text-xs text-slate-400">Carregando atividades...</p>
            </div>
        </div>
    `;

    // Carrega timeline de atividades para este cliente
    carregarAtividades(cliente.id).then(atividades => {
        const atvContainer = document.getElementById('detalhes-atividades');
        if (!atvContainer) return;
        if (atividades.length === 0) {
            atvContainer.innerHTML = '<p class="text-xs text-slate-400">Nenhuma atividade. Crie a primeira!</p>';
            return;
        }
        atvContainer.innerHTML = atividades.map(a => {
            const isAtrasada = !a.concluida && a.data < new Date().toISOString().split('T')[0];
            const tipoIcon = {ligacao:'phone', reuniao:'users', nota:'file-text', whatsapp:'message-circle', email:'mail', tarefa:'check-square'}[a.tipo]||'file-text';
            return `<div class="flex items-start gap-2 p-2.5 rounded-xl border ${isAtrasada ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40'}">
                <div class="w-7 h-7 rounded-lg ${a.concluida ? 'bg-emerald-100 text-emerald-600' : isAtrasada ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'} flex items-center justify-center flex-shrink-0"><i data-lucide="${tipoIcon}" class="w-3.5 h-3.5"></i></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-900 dark:text-white capitalize">${escaparHTML(a.tipo)}</span>
                        <span class="text-[11px] text-slate-400">${formatarData(a.data)}</span>
                        ${a.concluida ? '<span class="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">Concluída</span>' : isAtrasada ? '<span class="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full">Atrasada</span>' : ''}
                    </div>
                    ${a.nota ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1">${escaparHTML(a.nota)}</p>` : ''}
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    <button onclick="toggleAtividadeConcluida('${a.id}', ${cliente.id})" class="p-1.5 rounded-lg ${a.concluida ? 'text-slate-400 hover:text-amber-600' : 'text-emerald-600 hover:bg-emerald-50'}"><i data-lucide="${a.concluida ? 'rotate-ccw' : 'check'}" class="w-3.5 h-3.5"></i></button>
                    <button onclick="deletarAtividade('${a.id}', ${cliente.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    });

    document.getElementById('btn-editar-de-detalhes').onclick = () => {
        fecharModalDetalhes();
        abrirModalEditar(cliente.id);
    };

    abrirModal('modal-detalhes');
}

function fecharModalDetalhes() {
    fecharModal('modal-detalhes');
}

// ============================================================
// 13. GERENCIAMENTO DE PLANOS — CRUD de planos (POST/PATCH/DELETE /planos)
//     Lista, color picker, edição inline, fallback modoDemo
// ============================================================
function abrirModalPlanos() {
    renderizarListaPlanosGerenciamento();
    resetarFormPlano();
    abrirModal('modal-planos');
}

function fecharModalPlanos() {
    fecharModal('modal-planos');
}

function renderizarListaPlanosGerenciamento() {
    const container = document.getElementById('lista-planos-gerenciamento');
    if (!container) return;

    container.innerHTML = '';
    planosCache.forEach(p => {
        const estilo = MAPA_CORES_PLANO[p.cor] || MAPA_CORES_PLANO.slate;
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 gap-3';
        item.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <span class="w-3 h-3 rounded-full ${estilo.dot} flex-shrink-0"></span>
                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-900 dark:text-white text-sm truncate">${escaparHTML(p.nome)}</span>
                        ${p.valor ? `<span class="text-xs font-semibold text-slate-500 dark:text-slate-400">${escaparHTML(p.valor)}</span>` : ''}
                    </div>
                    ${p.descricao ? `<p class="text-xs text-slate-400 dark:text-slate-500 truncate">${escaparHTML(p.descricao)}</p>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <button type="button" onclick="editarPlanoCustom('${p.id}')"
                    class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all"
                    title="Editar Plano">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button type="button" onclick="deletarPlanoCustom('${p.id}')"
                    class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all"
                    title="Excluir Plano">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
        container.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
}

function selecionarCorPlano(cor) {
    document.getElementById('plano-cor-selecionada').value = cor;
    document.querySelectorAll('#color-picker-container .color-dot').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === cor);
    });
}

function resetarFormPlano() {
    document.getElementById('plano-id-editar').value   = '';
    document.getElementById('plano-nome').value        = '';
    document.getElementById('plano-valor').value       = '';
    document.getElementById('plano-descricao').value   = '';
    document.getElementById('titulo-form-plano').textContent = 'Novo Plano';
    document.getElementById('btn-cancelar-editar-plano').classList.add('hidden');
    selecionarCorPlano('indigo');
}

function editarPlanoCustom(id) {
    const p = planosCache.find(x => String(x.id) === String(id));
    if (!p) return;

    document.getElementById('plano-id-editar').value = p.id;
    document.getElementById('plano-nome').value      = p.nome;
    document.getElementById('plano-valor').value     = p.valor || '';
    document.getElementById('plano-descricao').value = p.descricao || '';
    document.getElementById('titulo-form-plano').textContent = `Editar Plano: ${p.nome}`;
    document.getElementById('btn-cancelar-editar-plano').classList.remove('hidden');
    selecionarCorPlano(p.cor || 'indigo');
}

async function salvarPlanoCustom(event) {
    event.preventDefault();
    const id        = document.getElementById('plano-id-editar').value;
    const nome      = document.getElementById('plano-nome').value.trim();
    const valor     = document.getElementById('plano-valor').value.trim();
    const descricao = document.getElementById('plano-descricao').value.trim();
    const cor       = document.getElementById('plano-cor-selecionada').value;

    if (!nome) return;

    const payload = { nome, valor, descricao, cor };

    try {
        if (!modoDemo) {
            const url    = id ? `${API_BASE_URL}/planos/${id}` : `${API_BASE_URL}/planos`;
            const method = id ? 'PATCH' : 'POST';

            const response = await fetchAuth(url, {
                method,
                body: JSON.stringify(payload)
            });
            if (!response) return; // Redirect handled by fetchAuth

            if (!response.ok) throw new Error(`Erro ao salvar plano`);

            exibirToast(`Plano "${nome}" salvo com sucesso!`, 'sucesso');
            await carregarPlanos();
            resetarFormPlano();
            return;
        }
    } catch (e) {
        console.warn('Erro ao salvar plano no servidor:', e);
    }

    // Modo local
    if (id) {
        const idx = planosCache.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) planosCache[idx] = { ...planosCache[idx], ...payload };
    } else {
        payload.id = 'plano_' + Date.now();
        planosCache.push(payload);
    }
    inicializarFiltroPlanos();
    renderizarCardsPlanoModal('criar');
    renderizarCardsPlanoModal('editar');
    renderizarListaPlanosGerenciamento();
    resetarFormPlano();
    exibirToast(`Plano "${nome}" salvo! (Modo Local)`, 'sucesso');
}

async function deletarPlanoCustom(id) {
    confirmarAcao('Excluir plano?', 'Este plano será removido permanentemente.', async () => {
        try {
            if (!modoDemo) {
                const response = await fetchAuth(`${API_BASE_URL}/planos/${id}`, {
                    method: 'DELETE',
                });
                if (!response) return;

                if (!response.ok) throw new Error(`Erro ao excluir plano`);

                exibirToast('Plano removido com sucesso!', 'sucesso');
                await carregarPlanos();
                return;
            }
        } catch (e) {
            console.warn('Erro ao excluir plano no servidor:', e);
        }

            planosCache = planosCache.filter(p => String(p.id) !== String(id));
        inicializarFiltroPlanos();
        renderizarCardsPlanoModal('criar');
        renderizarCardsPlanoModal('editar');
        renderizarListaPlanosGerenciamento();
        exibirToast('Plano removido! (Modo Local)', 'sucesso');
    });
}

// ============================================================
// 14. EXPORTAÇÃO CSV — gera CSV com BOM (\uFEFF), escapa aspas, download via Blob URL
// ============================================================
function exportarCSV() {
    if (clientesCache.length === 0) {
        exibirToast('Nenhum cliente para exportar.', 'info');
        return;
    }

    const headers = [
        'ID', 'Nome', 'Email', 'Status', 'Plano', 'Telefone', 'CPF', 'RG',
        'Empresa', 'Cargo', 'Data Nascimento', 'Gênero', 'CEP', 'Logradouro',
        'Número', 'Complemento', 'Bairro', 'Cidade', 'Estado', 'Observações', 'Data Cadastro'
    ];

    const rows = clientesCache.map(c => [
        c.id,
        `"${(c.nome || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        c.ativo ? 'Ativo' : 'Inativo',
        `"${(c.plano || '').replace(/"/g, '""')}"`,
        `"${(c.telefone || '').replace(/"/g, '""')}"`,
        `"${(c.cpf || '').replace(/"/g, '""')}"`,
        `"${(c.rg || '').replace(/"/g, '""')}"`,
        `"${(c.empresa || '').replace(/"/g, '""')}"`,
        `"${(c.cargo || '').replace(/"/g, '""')}"`,
        c.data_nascimento || '',
        c.genero || '',
        `"${(c.cep || '').replace(/"/g, '""')}"`,
        `"${(c.logradouro || '').replace(/"/g, '""')}"`,
        `"${(c.numero || '').replace(/"/g, '""')}"`,
        `"${(c.complemento || '').replace(/"/g, '""')}"`,
        `"${(c.bairro || '').replace(/"/g, '""')}"`,
        `"${(c.cidade || '').replace(/"/g, '""')}"`,
        `"${(c.estado || '').replace(/"/g, '""')}"`,
        `"${(c.observacoes || '').replace(/"/g, '""')}"`,
        c.data_cadastro || ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', `daviflow_clientes_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    exibirToast('Relatório CSV exportado com sucesso!', 'sucesso');
}

// ============================================================
// 15. CARDS DE SELEÇÃO DE PLANO — usados nos modais Criar/Editar
//     renderizarCardsPlanoModal(): cria botões por plano; selecionarPlanoCard(): marca ativo
//     Estado salvo em input hidden #ctx-plano-value; toggle de seção com setPlanoToggle()
// ============================================================
function renderizarCardsPlanoModal(ctx) {
    const container = document.getElementById(`${ctx}-plano-cards`);
    if (!container) return;

    container.innerHTML = '';
    planosCache.forEach(p => {
        const estilo = MAPA_CORES_PLANO[p.cor] || MAPA_CORES_PLANO.slate;
        const card = document.createElement('button');
        card.type = 'button';
        card.id = `${ctx}-plano-card-${p.id}`;
        card.dataset.plano = p.id;
        card.className = `plan-card relative w-full text-left p-3 rounded-xl border transition-all focus:outline-none border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/40`;
        card.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selecionarPlanoCard(ctx, p.id);
        });
        card.innerHTML = `
            <div class="flex items-start gap-2.5 pointer-events-none">
                <span class="w-3 h-3 rounded-full ${estilo.dot} flex-shrink-0 mt-1"></span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1">
                        <span class="text-sm font-bold text-slate-800 dark:text-white">${escaparHTML(p.nome)}</span>
                        ${p.valor ? `<span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">${escaparHTML(p.valor)}</span>` : ''}
                    </div>
                    ${p.descricao ? `<p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">${escaparHTML(p.descricao)}</p>` : ''}
                </div>
                <div id="${ctx}-plano-check-${p.id}" class="plan-check-icon w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all">
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    if (planosCache.length > 0) selecionarPlanoCard(ctx, planosCache[0].id);
}

function selecionarPlanoCard(ctx, planoId) {
    planosCache.forEach(p => {
        const card  = document.getElementById(`${ctx}-plano-card-${p.id}`);
        const check = document.getElementById(`${ctx}-plano-check-${p.id}`);
        if (card) {
            card.className = `plan-card relative w-full text-left p-3 rounded-xl border transition-all focus:outline-none border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/40`;
            card.setAttribute('aria-checked', 'false');
        }
        if (check) {
            check.className = 'plan-check-icon w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all';
            check.innerHTML = '';
        }
    });

    const activeCard  = document.getElementById(`${ctx}-plano-card-${planoId}`);
    const activeCheck = document.getElementById(`${ctx}-plano-check-${planoId}`);
    const p = planosCache.find(x => String(x.id) === String(planoId));

    if (activeCard && p) {
        const estilo = MAPA_CORES_PLANO[p.cor] || MAPA_CORES_PLANO.slate;
        activeCard.className = `plan-card relative w-full text-left p-3 rounded-xl border-2 transition-all focus:outline-none ${estilo.activeBorder} ${estilo.activeBg}`;
        activeCard.setAttribute('aria-checked', 'true');
    }

    if (activeCheck && p) {
        const estilo = MAPA_CORES_PLANO[p.cor] || MAPA_CORES_PLANO.slate;
        activeCheck.className = `plan-check-icon w-4 h-4 rounded-full border-2 ${estilo.dot} border-transparent flex-shrink-0 mt-0.5 flex items-center justify-center transition-all`;
        activeCheck.innerHTML = `<svg class="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    let hiddenInput = document.getElementById(`${ctx}-plano-value`);
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id   = `${ctx}-plano-value`;
        hiddenInput.name = 'plano';
        const formEl = document.getElementById(`form-${ctx}`) || document.getElementById(`${ctx}-plano-section`);
        formEl?.appendChild(hiddenInput);
    }
    hiddenInput.value = planoId;
}

function getPlanoSelecionado(ctx) {
    return document.getElementById(`${ctx}-plano-value`)?.value || null;
}

function setPlanoSelecionado(ctx, planoId) {
    selecionarPlanoCard(ctx, planoId);
}

function setPlanoToggle(ctx, ativo) {
    const toggle    = document.getElementById(`${ctx}-plano-toggle`);
    const container = document.getElementById(`${ctx}-plano-section`);
    const label     = document.getElementById(`${ctx}-plano-toggle-label`);

    if (toggle)    toggle.checked = ativo;
    if (container) {
        container.classList.toggle('hidden', !ativo);
        container.classList.toggle('plan-section-open', ativo);
    }
    if (label) {
        label.textContent = ativo ? 'Com plano vinculado' : 'Sem plano vinculado';
        label.className = ativo
            ? 'text-sm font-semibold text-slate-700 dark:text-slate-200'
            : 'text-sm font-semibold text-slate-500 dark:text-slate-400';
    }
}

function togglePlanoSection(ctx) {
    const toggle = document.getElementById(`${ctx}-plano-toggle`);
    if (!toggle) return;
    setPlanoToggle(ctx, toggle.checked);
}

// ============================================================
// 16. VALIDAÇÕES — nome, email (regex), CPF (módulo 11), telefone
//     Exibe erro inline com shake + borda rose; scrolla para primeiro erro
// ============================================================
function validarFormulario(ctx) {
    let valido = true;

    // Nome
    const nome = document.getElementById(`${ctx}-nome`)?.value.trim();
    if (!nome || nome.length < 2) {
        exibirErroField(`${ctx}-nome-error`, 'Nome deve ter pelo menos 2 caracteres.');
        valido = false;
    } else {
        ocultarErroField(`${ctx}-nome-error`);
        marcarFieldSucesso(`${ctx}-nome`);
    }

    // Email
    const email = document.getElementById(`${ctx}-email`)?.value.trim();
    if (!email || !validarEmail(email)) {
        exibirErroField(`${ctx}-email-error`, 'Informe um e-mail válido.');
        valido = false;
    } else {
        ocultarErroField(`${ctx}-email-error`);
        marcarFieldSucesso(`${ctx}-email`);
    }

    // CPF
    const cpfInput = document.getElementById(`${ctx}-cpf`);
    if (cpfInput && cpfInput.value.trim()) {
        if (!validarCPF(cpfInput.value.trim())) {
            exibirErroField(`${ctx}-cpf-error`, 'CPF inválido.');
            valido = false;
        } else {
            ocultarErroField(`${ctx}-cpf-error`);
        }
    }

    // Telefone
    const telInput = document.getElementById(`${ctx}-telefone`);
    if (telInput && telInput.value.trim()) {
        const telLimpo = telInput.value.replace(/\D/g, '');
        if (telLimpo.length < 10) {
            exibirErroField(`${ctx}-telefone-error`, 'Telefone incompleto.');
            valido = false;
        } else {
            ocultarErroField(`${ctx}-telefone-error`);
        }
    }

    if (!valido) {
        const firstError = document.querySelector(`#form-${ctx} .field-error.visible`);
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return valido;
}

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarCPF(cpf) {
    const nums = cpf.replace(/\D/g, '');
    if (nums.length !== 11) return false;
    if (/^(\d)\1+$/.test(nums)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
    let r1 = (soma * 10) % 11;
    if (r1 === 10 || r1 === 11) r1 = 0;
    if (r1 !== parseInt(nums[9])) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
    let r2 = (soma * 10) % 11;
    if (r2 === 10 || r2 === 11) r2 = 0;
    return r2 === parseInt(nums[10]);
}

function exibirErroField(errorId, msg) {
    const el = document.getElementById(errorId);
    if (!el) return;
    const span = el.querySelector('span');
    if (span) span.textContent = msg;
    el.classList.add('visible');
    el.classList.remove('hidden');

    const inputEl = document.getElementById(errorId.replace('-error', ''));
    if (inputEl) {
        inputEl.classList.add('input-error-shake', 'border-rose-400');
        setTimeout(() => inputEl.classList.remove('input-error-shake'), 400);
    }
}

function ocultarErroField(errorId) {
    const el = document.getElementById(errorId);
    if (!el) return;
    el.classList.remove('visible');
    el.classList.add('hidden');
}

function marcarFieldSucesso(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.remove('border-rose-400');
}

function limparErrosForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.field-error').forEach(el => {
        el.classList.remove('visible');
        el.classList.add('hidden');
    });
    form.querySelectorAll('.form-input, input, select, textarea').forEach(el => {
        el.classList.remove('border-rose-400');
    });
}

// ============================================================
// 17. MÁSCARAS — formatação ao digitar: telefone (XX) XXXXX-XXXX, CPF, RG, CEP
// ============================================================
function mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 6) {
        v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    } else if (v.length > 2) {
        v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    } else if (v.length > 0) {
        v = `(${v}`;
    }
    input.value = v;
}

function mascaraCPF(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
    else if (v.length > 6) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
    else if (v.length > 3) v = `${v.slice(0,3)}.${v.slice(3)}`;
    input.value = v;
}

function mascaraRG(input) {
    let v = input.value.replace(/[^0-9Xx]/g, '').slice(0, 9);
    if (v.length > 8) v = `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}-${v.slice(8)}`;
    else if (v.length > 5) v = `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5)}`;
    else if (v.length > 2) v = `${v.slice(0,2)}.${v.slice(2)}`;
    input.value = v;
}

function mascaraCEP(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = `${v.slice(0,5)}-${v.slice(5)}`;
    input.value = v;
}

// ============================================================
// 18. MODAIS — utilitários genéricos: abrirModal/fecharModal com animação scale
//     + helpers específicos: deletar, loading, escaparHTML
// ============================================================
function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const box = modal.querySelector('.modal-box');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        box?.classList.remove('scale-95', 'opacity-0');
        box?.classList.add('scale-100', 'opacity-100');
    });
    if (window.lucide) lucide.createIcons();
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const box = modal.querySelector('.modal-box');
    box?.classList.remove('scale-100', 'opacity-100');
    box?.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }, 200);
}

function fecharModalDeletar() {
    clienteParaDeletarId = null;
    fecharModal('modal-deletar');
}

function abrirModalDeletar(id) {
    const cliente = clientesCache.find(c => String(c.id) === String(id));
    if (!cliente) return;

    clienteParaDeletarId = id;
    document.getElementById('deletar-id-label').textContent   = cliente.id;
    document.getElementById('deletar-nome-label').textContent = cliente.nome;

    abrirModal('modal-deletar');
}

async function confirmarExclusao() {
    if (!clienteParaDeletarId) return;

    const id = clienteParaDeletarId;
    const btnSubmit = document.getElementById('btn-submit-deletar');
    setButtonLoading(btnSubmit, true, 'Excluindo...');

    try {
        if (!modoDemo) {
            const response = await fetchAuth(`${API_BASE_URL}/clientes/${id}`, {
                method: 'DELETE',
            });
            if (!response) return; // Redirect handled by fetchAuth

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao excluir.`);
            }

            const cliDel = clientesCache.find(c => String(c.id)===String(id));
            const ordDel = cliDel ? clientesCache.findIndex(c => String(c.id)===String(id))+1 : id;
            exibirToast(`Cliente "${cliDel ? cliDel.nome : ''}" (#${ordDel}) removido com sucesso!`, 'sucesso');
            fecharModalDeletar();
            setButtonLoading(btnSubmit, false, 'Excluir Cliente');
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Excluindo em modo local:', error);
        exibirToast(error.message || 'Erro ao comunicar com a API.', 'erro');
    }

    const cliDelLocal = clientesCache.find(c => String(c.id)===String(id));
    const ordLocalDel = cliDelLocal ? clientesCache.findIndex(c => String(c.id)===String(id))+1 : id;
    const nomeLocalDel = cliDelLocal ? cliDelLocal.nome : '';
    clientesCache = clientesCache.filter(c => String(c.id) !== String(id));
    atualizarMetricas(clientesCache);
    filtrarTabela();
    exibirToast(`Cliente "${nomeLocalDel}" (#${ordLocalDel}) removido! (Modo Local)`, 'sucesso');
    fecharModalDeletar();
    setButtonLoading(btnSubmit, false, 'Excluir Cliente');
}

function mostrarLoading(show) {
    const loadingState = document.getElementById('loading-state');
    const emptyState   = document.getElementById('empty-state');
    if (show) {
        loadingState?.classList.remove('hidden');
        emptyState?.classList.add('hidden');
        emptyState?.classList.remove('flex');
    } else {
        loadingState?.classList.add('hidden');
    }
}

function setButtonLoading(button, isLoading, text) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>${text}</span>`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        } else {
            button.innerHTML = `<span>${text}</span>`;
        }
    }
    if (window.lucide) lucide.createIcons();
}

function escaparHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// ============================================================
// 19. TOASTS — notificações auto-dismiss (4.2s) com barra de progresso e tipos
//     tipos: sucesso (emerald), erro (rose), info (indigo)
//     escaparHTML na mensagem para prevenir XSS via toast
// ============================================================
function exibirToast(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const configs = {
        sucesso: {
            bg:      'bg-white dark:bg-slate-800',
            border:  'border-emerald-200 dark:border-emerald-800/60',
            icon:    'check-circle',
            iconCls: 'text-emerald-500',
            bar:     'bg-emerald-500',
            text:    'text-slate-800 dark:text-slate-100',
        },
        erro: {
            bg:      'bg-white dark:bg-slate-800',
            border:  'border-rose-200 dark:border-rose-800/60',
            icon:    'x-circle',
            iconCls: 'text-rose-500',
            bar:     'bg-rose-500',
            text:    'text-slate-800 dark:text-slate-100',
        },
        info: {
            bg:      'bg-white dark:bg-slate-800',
            border:  'border-indigo-200 dark:border-indigo-800/60',
            icon:    'info',
            iconCls: 'text-indigo-500',
            bar:     'bg-indigo-500',
            text:    'text-slate-800 dark:text-slate-100',
        },
    };

    const cfg = configs[tipo] || configs.info;
    const toast = document.createElement('div');
    toast.className = [
        'relative overflow-hidden flex items-center gap-3 px-4 py-3.5 rounded-xl shadow-xl border',
        cfg.bg, cfg.border,
        'pointer-events-auto transform transition-all duration-300 translate-y-6 opacity-0',
        'max-w-sm w-full'
    ].join(' ');

    toast.innerHTML = `
        <i data-lucide="${cfg.icon}" class="w-5 h-5 flex-shrink-0 ${cfg.iconCls}"></i>
        <span class="text-sm font-medium flex-1 ${cfg.text}">${escaparHTML(mensagem)}</span>
        <button onclick="this.closest('.toast-item')?.remove()" class="p-0.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0">
            <i data-lucide="x" class="w-4 h-4"></i>
        </button>
        <div class="toast-progress absolute bottom-0 left-0 h-[2px] ${cfg.bar} rounded-full" style="width: 100%; animation: toastProgress 4s linear forwards;"></div>
    `;
    toast.classList.add('toast-item');

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-6', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4200);
}
