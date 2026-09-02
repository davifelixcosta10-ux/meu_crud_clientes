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
let orgsCache = [];
let currentOrgId = localStorage.getItem('daviflow_org_id') || null;
function getOrgQS(qs = '') {
    if (!currentOrgId) return qs;
    return qs ? (qs.includes('?') ? `${qs}&org_id=${currentOrgId}` : `${qs}?org_id=${currentOrgId}`) : `?org_id=${currentOrgId}`;
}
function getOrgQuery() { return currentOrgId ? `?org_id=${currentOrgId}` : ''; }

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
    await carregarOrgs();
    await carregarVerticais();
    await carregarVerticalOrg();
    // mostra modal escolha na primeira visita se vertical geral e sem escolha previa
    if (!localStorage.getItem('daviflow_vertical_escolhido') && currentVertical === 'geral') {
        setTimeout(()=> abrirModalVertical(), 800);
    } else {
        aplicarVertical(currentVertical);
    }
    await carregarPlanos();
    await carregarEtapas();
    await carregarTags();
    await carregarFiltrosSalvos();
    await carregarClientes();
    await carregarIntegracoes();
    // 4B: inicializa secao a partir de hash ou localStorage
    const hashSecao = getSecaoFromHash();
    const target = hashSecao || secaoAtiva || 'overview';
    setSecao(target, false);
    // escuta hash change
    window.addEventListener('hashchange', ()=> {
        const h = getSecaoFromHash();
        if (h) setSecao(h, false);
    });
    window.addEventListener('popstate', ()=> {
        const h = getSecaoFromHash();
        if (h) setSecao(h, false);
    });
    setViewMode(viewMode, true);
    restaurarEstadoRelatorios();
    await carregarRelatorios();
    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 3A — ORGANIZAÇÕES (Fase 3A-1)
// ============================================================
let _orgsCarregadas = false;
async function carregarOrgs(retry = 0) {
    const sel = document.getElementById('org-select');
    if (sel && retry === 0) sel.innerHTML = '<option>Carregando...</option>';
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs`, { method: 'GET' });
        if (!resp) {
            // sem auth ainda (token não pronto) -> tenta novamente em 800ms
            if (retry < 3) setTimeout(() => carregarOrgs(retry + 1), 800);
            return;
        }
        if (!resp.ok) {
            if (resp.status === 401 && retry < 2) {
                // token ainda validando -> retry
                setTimeout(() => carregarOrgs(retry + 1), 1000);
                return;
            }
            orgsCache = [];
            if (sel) sel.innerHTML = '<option value="">Minha organização</option>';
            return;
        }
        const data = await resp.json();
        orgsCache = Array.isArray(data) ? data : [];
        _orgsCarregadas = true;
        // se não tem org selecionada, pega primeira
        if (!currentOrgId && orgsCache.length > 0) {
            currentOrgId = orgsCache[0].id;
            localStorage.setItem('daviflow_org_id', currentOrgId);
        }
        // valida se current ainda existe
        if (currentOrgId && !orgsCache.find(o => o.id === currentOrgId)) {
            currentOrgId = orgsCache[0]?.id || null;
            if (currentOrgId) localStorage.setItem('daviflow_org_id', currentOrgId);
            else localStorage.removeItem('daviflow_org_id');
        }
        renderizarOrgsSelect();
        // se tinha org mas ainda não carregou clientes por org, recarrega uma vez
        if (_orgsCarregadas && retry === 0 && currentOrgId) {
            // garante que clientes da org correta são carregados sem precisar F5
            // evita loop: só se clientesCache ainda vazio ou de outra org
            if (clientesCache.length === 0) carregarClientes();
        }
    } catch (e) {
        console.warn('Erro ao carregar orgs', e);
        if (retry < 3) setTimeout(() => carregarOrgs(retry + 1), 1200);
        else orgsCache = [];
    }
}
function isCurrentOrgAdmin() {
    const org = orgsCache.find(o => o.id === currentOrgId);
    return org?.papel === 'admin';
}
function atualizarPermissoesUI() {
    const isAdmin = isCurrentOrgAdmin();
    // toolbar
    const btnPlanos = document.getElementById('btn-toolbar-planos');
    const btnEtapas = document.getElementById('btn-toolbar-etapas');
    const btnTags = document.getElementById('btn-toolbar-tags');
    const btnIntegracoes = document.getElementById('btn-toolbar-integracoes');
    const btnApiKeys = document.getElementById('btn-toolbar-apikeys');
    [btnPlanos, btnEtapas, btnTags, btnIntegracoes, btnApiKeys].forEach(btn => {
        if (!btn) return;
        // 3B-fix: membro vê porém desabilitado (cinza) em vez de hidden
        btn.style.display = '';
        btn.disabled = !isAdmin;
        btn.classList.toggle('opacity-50', !isAdmin);
        btn.classList.toggle('cursor-not-allowed', !isAdmin);
        btn.title = isAdmin ? (btn.getAttribute('data-title') || btn.getAttribute('title') || '') : 'Apenas admin pode gerenciar';
        if (!btn.getAttribute('data-title') && btn.getAttribute('title')) btn.setAttribute('data-title', btn.getAttribute('title'));
    });
    // modal gerenciar
    const secConvite = document.getElementById('gerenciar-secao-convite-form');
    const btnConvite = document.getElementById('btn-gerenciar-convite');
    const secRename = document.getElementById('gerenciar-secao-rename');
    const secPerigo = document.getElementById('gerenciar-secao-perigo');
    const aviso = document.getElementById('gerenciar-aviso-membro');
    const emailInput = document.getElementById('gerenciar-email-input');
    const papelSelect = document.getElementById('gerenciar-papel-select');
    if (secConvite) secConvite.classList.toggle('hidden', !isAdmin);
    if (btnConvite) btnConvite.classList.toggle('hidden', !isAdmin);
    if (emailInput) emailInput.disabled = !isAdmin;
    if (papelSelect) papelSelect.disabled = !isAdmin;
    if (secRename) secRename.classList.toggle('hidden', !isAdmin);
    if (secPerigo) secPerigo.classList.toggle('hidden', !isAdmin);
    if (aviso) aviso.classList.toggle('hidden', isAdmin);
}
function renderizarOrgsSelect() {
    const sel = document.getElementById('org-select');
    if (!sel) return;
    if (orgsCache.length === 0) {
        sel.innerHTML = '<option value="">Minha organização</option>';
        sel.classList.add('hidden');
        atualizarPermissoesUI();
        return;
    }
    sel.classList.remove('hidden');
    sel.innerHTML = orgsCache.map(o => `<option value="${o.id}" ${o.id === currentOrgId ? 'selected' : ''}>${escaparHTML(o.nome)} ${o.papel === 'admin' ? '• admin' : ''}</option>`).join('');
    // atualiza convite org nome
    const conviteNome = document.getElementById('convite-org-nome');
    if (conviteNome) {
        const org = orgsCache.find(o => o.id === currentOrgId);
        conviteNome.textContent = org ? `Organização: ${org.nome}` : '';
    }
    atualizarPermissoesUI();
}
function trocarOrg(orgId) {
    currentOrgId = orgId || null;
    if (currentOrgId) localStorage.setItem('daviflow_org_id', currentOrgId);
    else localStorage.removeItem('daviflow_org_id');
    renderizarOrgsSelect();
    carregarVerticalOrg();
    // recarrega dados da org
    Promise.all([carregarClientes(), carregarEtapas(), carregarTags(), carregarFiltrosSalvos(), carregarRelatorios(), carregarIntegracoes()]).then(() => {
        if (window.lucide) lucide.createIcons();
    });
}
function abrirModalOrg() {
    const modal = document.getElementById('modal-org');
    if (!modal) return;
    document.getElementById('org-nome-input').value = '';
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.querySelector('.modal-box')?.classList.remove('scale-95','opacity-0');
        modal.querySelector('.modal-box')?.classList.add('scale-100','opacity-100');
    });
    if (window.lucide) lucide.createIcons();
}
function fecharModalOrg() {
    const modal = document.getElementById('modal-org');
    if (!modal) return;
    modal.querySelector('.modal-box')?.classList.add('scale-95','opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}
async function criarOrg() {
    const input = document.getElementById('org-nome-input');
    const nome = (input?.value || '').trim();
    if (!nome) { exibirToast('Informe o nome da organização', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
        if (!resp || !resp.ok) {
            const err = await resp.json().catch(() => ({}));
            exibirToast(err.detail || 'Erro ao criar organização', 'erro');
            return;
        }
        const org = await resp.json();
        orgsCache.push(org);
        currentOrgId = org.id;
        localStorage.setItem('daviflow_org_id', currentOrgId);
        renderizarOrgsSelect();
        fecharModalOrg();
        // recarrega
        await Promise.all([carregarClientes(), carregarEtapas(), carregarTags()]);
        exibirToast(`Organização "${org.nome}" criada com sucesso! Você é admin.`, 'sucesso');
    } catch (e) {
        console.warn(e);
        exibirToast('Erro ao criar organização', 'erro');
    }
}
async function carregarMembros() {
    const container = document.getElementById('lista-membros');
    if (!container) return;
    if (!currentOrgId) { container.innerHTML = '<p class="text-[11px] text-slate-400">Selecione uma organização</p>'; return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/membros`, { method: 'GET' });
        if (!resp || !resp.ok) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro ao carregar membros</p>'; return; }
        const membros = await resp.json();
        if (!Array.isArray(membros) || membros.length === 0) {
            container.innerHTML = '<p class="text-[11px] text-slate-400">Nenhum membro</p>';
            return;
        }
        const orgAtual = orgsCache.find(o => o.id === currentOrgId);
        const isAdmin = orgAtual?.papel === 'admin';
        const ownerId = orgAtual?.owner_id || null;
        container.innerHTML = membros.map(m => {
            const isOwner = ownerId && m.user_id === ownerId;
            const canRemove = isAdmin && !isOwner;
            return `<div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><div class="flex items-center gap-2 min-w-0"><span class="font-mono text-[10px] truncate" title="${escaparHTML(m.user_id)}">${escaparHTML(m.user_id.slice(0,8))}...${isOwner ? ' 👑 dono' : ''}</span><span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.papel==='admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300'}">${escaparHTML(m.papel)}</span></div>${canRemove ? `<button onclick="removerMembro('${m.user_id}')" class="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Remover membro (apenas admin)"><i data-lucide="user-x" class="w-3.5 h-3.5"></i></button>` : ''}</div>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    } catch(e) {
        container.innerHTML = '<p class="text-[11px] text-rose-400">Erro</p>';
    }
}
async function removerMembro(targetUserId) {
    if (!currentOrgId) return;
    confirmarAcao('Remover membro?', 'O membro perderá acesso a todos os clientes desta organização. Deseja continuar? (Apenas admin)', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/membros/${targetUserId}`, { method: 'DELETE' });
            if (!resp || !resp.ok) {
                const err = await resp.json().catch(() => ({}));
                exibirToast(err.detail || 'Erro ao remover membro. Verifique se é admin e não é o dono.', 'erro');
                return;
            }
            exibirToast('Membro removido com sucesso!', 'sucesso');
            await carregarMembros();
        } catch(e) {
            console.warn(e);
            exibirToast('Erro ao remover membro', 'erro');
        }
    });
}
function abrirModalConvite() {
    if (orgsCache.length === 0) { alert('Crie uma organização primeiro'); return; }
    const modal = document.getElementById('modal-convite');
    if (!modal) return;
    document.getElementById('convite-email-input').value = '';
    document.getElementById('convite-papel-select').value = 'membro';
    renderizarOrgsSelect();
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.querySelector('.modal-box')?.classList.remove('scale-95','opacity-0');
        modal.querySelector('.modal-box')?.classList.add('scale-100','opacity-100');
    });
    carregarMembros();
    if (window.lucide) lucide.createIcons();
}
function fecharModalConvite() {
    const modal = document.getElementById('modal-convite');
    if (!modal) return;
    modal.querySelector('.modal-box')?.classList.add('scale-95','opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}
async function enviarConvite() {
    const email = (document.getElementById('convite-email-input')?.value || '').trim();
    const papel = document.getElementById('convite-papel-select')?.value || 'membro';
    if (!email) { exibirToast('Informe o email', 'erro'); return; }
    if (!currentOrgId) { exibirToast('Selecione uma organização', 'erro'); return; }
    const btn = document.querySelector('#modal-convite button[onclick="enviarConvite()"]');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = 'Enviando...'; btn.disabled = true; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/convites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, papel }) });
        if (!resp || !resp.ok) {
            const err = await resp.json().catch(() => ({}));
            let msg = err.detail || 'Erro ao convidar';
            const low = msg.toLowerCase();
            if (low.includes('already') || low.includes('registered') || low.includes('ja cadastrado') || low.includes('já cadastrado')) {
                exibirToast(`✅ ${email} já tem conta — use "Esqueci a senha" no login.`, 'sucesso');
                document.getElementById('convite-email-input').value = '';
                await carregarMembros();
                await carregarMembrosGerenciar();
                return;
            }
            if (low.includes('já é membro') || low.includes('ja e membro')) {
                exibirToast(`ℹ️ ${email} já é membro desta organização`, 'info');
                return;
            }
            if (low.includes('smtp') || low.includes('service_role') || low.includes('cadastrar')) {
                msg += ' — Dica: peça para o colega criar conta em daviflowgestoes.vercel.app e convide novamente (entra direto).';
            }
            exibirToast(msg, 'erro');
            return;
        }
        const data = await resp.json();
        document.getElementById('convite-email-input').value = '';
        await carregarMembros();
        await carregarMembrosGerenciar();
        if (data.status === 'convite_enviado') {
            exibirToast(`✉️ Convite enviado para ${email}! Ele receberá um email com link para ${data.redirect_to || 'daviflowgestoes.vercel.app'} — peça para verificar spam.`, 'sucesso');
        } else if (data.status === 'convite_reenviado') {
            exibirToast(`🔄 Convite reenviado para ${email} (já estava pendente) e já adicionado como ${papel}! Peça para verificar email/spam ou usar o link anterior.`, 'sucesso');
        } else if (data.status === 'ja_cadastrado') {
            exibirToast(`✅ ${email} já tem conta — ${data.msg || 'foi vinculado à organização. Peça para usar "Esqueci a senha" para acessar.'}`, 'sucesso');
        } else if (data.status === 'ja_membro') {
            exibirToast(`ℹ️ ${email} já é membro desta organização`, 'info');
        } else {
            exibirToast(`✅ ${email} adicionado como ${papel} em "${orgsCache.find(o=>o.id===currentOrgId)?.nome || 'org'}"!`, 'sucesso');
        }
    } catch (e) {
        console.warn(e);
        exibirToast('Erro ao enviar convite', 'erro');
    } finally {
        if (btn) { btn.textContent = origText || 'Enviar convite'; btn.disabled = false; }
    }
}
async function excluirOrgAtual() {
    if (!currentOrgId) { exibirToast('Nenhuma organização selecionada', 'erro'); return; }
    const org = orgsCache.find(o => o.id === currentOrgId);
    const nome = org ? org.nome : currentOrgId;
    confirmarAcao(`Excluir "${nome}"?`, 'Isso apaga a organização (apenas se estiver sem clientes). Clientes precisam ser movidos ou excluídos antes. Deseja continuar?', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}`, { method: 'DELETE' });
            if (!resp || !resp.ok) {
                const err = await resp.json().catch(() => ({}));
                exibirToast(err.detail || 'Erro ao excluir organização. Verifique se é dono e se está sem clientes.', 'erro');
                return;
            }
            exibirToast(`🗑️ Organização "${nome}" excluída!`, 'sucesso');
            orgsCache = orgsCache.filter(o => o.id !== currentOrgId);
            currentOrgId = orgsCache[0]?.id || null;
            if (currentOrgId) localStorage.setItem('daviflow_org_id', currentOrgId);
            else localStorage.removeItem('daviflow_org_id');
            renderizarOrgsSelect();
            await Promise.all([carregarClientes(), carregarEtapas(), carregarTags(), carregarFiltrosSalvos(), carregarRelatorios()]);
            fecharModalGerenciarOrg();
        } catch(e) {
            console.warn(e);
            exibirToast('Erro ao excluir', 'erro');
        }
    });
}
function abrirModalGerenciarOrg() {
    if (orgsCache.length === 0 && !_orgsCarregadas) {
        exibirToast('Carregando organizações... tente novamente em 1s', 'info');
        carregarOrgs();
        return;
    }
    const modal = document.getElementById('modal-gerenciar-org');
    if (!modal) return;
    // preenche info org atual
    const org = orgsCache.find(o => o.id === currentOrgId);
    const info = document.getElementById('gerenciar-org-info');
    if (info) {
        if (org) info.innerHTML = `<div class="flex items-center justify-between"><span class="font-bold">${escaparHTML(org.nome)}</span><span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">${escaparHTML(org.papel || 'membro')}${org.owner_id ? ' • dono' : ''}</span></div><div class="text-[11px] text-slate-400 mt-1">${escaparHTML(org.id.slice(0,8))}... • ${orgsCache.length} org(s)</div>`;
        else info.innerHTML = '<p class="text-[11px] text-slate-400">Nenhuma organização selecionada</p>';
    }
    const renameInput = document.getElementById('gerenciar-rename-input');
    if (renameInput) renameInput.value = org ? org.nome : '';
    const orgNomeMembros = document.getElementById('gerenciar-org-nome-membros');
    if (orgNomeMembros) orgNomeMembros.textContent = org ? `Organização: ${org.nome}` : '';
    atualizarPermissoesUI();
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.querySelector('.modal-box')?.classList.remove('scale-95','opacity-0');
        modal.querySelector('.modal-box')?.classList.add('scale-100','opacity-100');
    });
    trocarAbaGerenciar('membros');
    carregarMembrosGerenciar();
    carregarClientesGerenciar();
    if (window.lucide) lucide.createIcons();
}
function fecharModalGerenciarOrg() {
    const modal = document.getElementById('modal-gerenciar-org');
    if (!modal) return;
    modal.querySelector('.modal-box')?.classList.add('scale-95','opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}
function trocarAbaGerenciar(aba) {
    const abas = ['membros','org','clientes'];
    abas.forEach(a => {
        const btn = document.getElementById(`tab-gerenciar-${a}`);
        const conteudo = document.getElementById(`gerenciar-conteudo-${a}`);
        if (btn) {
            if (a === aba) {
                btn.classList.add('border-indigo-600','text-indigo-600','dark:text-indigo-400');
                btn.classList.remove('border-transparent','text-slate-500');
            } else {
                btn.classList.remove('border-indigo-600','text-indigo-600','dark:text-indigo-400');
                btn.classList.add('border-transparent','text-slate-500');
            }
        }
        if (conteudo) conteudo.classList.toggle('hidden', a !== aba);
    });
    if (aba === 'membros') carregarMembrosGerenciar();
    if (aba === 'clientes') carregarClientesGerenciar();
    if (window.lucide) lucide.createIcons();
}
async function carregarMembrosGerenciar() {
    const container = document.getElementById('lista-membros-gerenciar');
    // também atualiza lista antiga para compat
    carregarMembros();
    if (!container) return;
    if (!currentOrgId) { container.innerHTML = '<p class="text-[11px] text-slate-400">Selecione uma organização</p>'; return; }
    container.innerHTML = '<p class="text-[11px] text-slate-400">Carregando...</p>';
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/membros`, { method: 'GET' });
        if (!resp || !resp.ok) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro ao carregar membros</p>'; return; }
        const membros = await resp.json();
        const orgAtual = orgsCache.find(o => o.id === currentOrgId);
        const isAdmin = orgAtual?.papel === 'admin';
        const ownerId = orgAtual?.owner_id || null;
        if (!Array.isArray(membros) || membros.length === 0) { container.innerHTML = '<p class="text-[11px] text-slate-400">Nenhum membro</p>'; return; }
        container.innerHTML = membros.map(m => {
            const isOwner = ownerId && m.user_id === ownerId;
            const canRemove = isAdmin && !isOwner;
            return `<div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><div class="flex items-center gap-2 min-w-0"><span class="font-mono text-[10px] truncate" title="${escaparHTML(m.user_id)}">${escaparHTML(m.user_id.slice(0,8))}...${isOwner ? ' 👑 dono' : ''}</span><span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.papel==='admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-slate-100 text-slate-600'}">${escaparHTML(m.papel)}</span></div>${canRemove ? `<button onclick="removerMembro('${m.user_id}')" class="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Remover (admin)"><i data-lucide="user-x" class="w-3.5 h-3.5"></i></button>` : ''}</div>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    } catch(e) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro</p>'; }
}
async function enviarConviteGerenciar() {
    const email = (document.getElementById('gerenciar-email-input')?.value || '').trim();
    const papel = document.getElementById('gerenciar-papel-select')?.value || 'membro';
    if (!email) { exibirToast('Informe o email', 'erro'); return; }
    if (!currentOrgId) { exibirToast('Selecione uma organização', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/convites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, papel }) });
        if (!resp || !resp.ok) {
            const err = await resp.json().catch(() => ({}));
            const detail = (err.detail || '').toLowerCase();
            // already registered não é erro — trata como sucesso
            if (detail.includes('already') || detail.includes('registered') || detail.includes('ja cadastrado') || detail.includes('já cadastrado')) {
                exibirToast(`✅ ${email} já tem conta — use "Esqueci a senha" no login para acessar. Atualizando lista...`, 'sucesso');
                document.getElementById('gerenciar-email-input').value = '';
                await carregarMembrosGerenciar();
                return;
            }
            if (detail.includes('já é membro') || detail.includes('ja e membro')) {
                exibirToast(`ℹ️ ${email} já é membro desta organização`, 'info');
                return;
            }
            exibirToast(err.detail || 'Erro ao convidar', 'erro');
            return;
        }
        const data = await resp.json();
        document.getElementById('gerenciar-email-input').value = '';
        await carregarMembrosGerenciar();
        await carregarMembros();
        if (data.status === 'convite_enviado') exibirToast(`✉️ Convite enviado para ${email}!`, 'sucesso');
        else if (data.status === 'convite_reenviado') exibirToast(`🔄 Convite reenviado para ${email} (pendente) e já adicionado como ${papel}!`, 'sucesso');
        else if (data.status === 'ja_cadastrado') exibirToast(`✅ ${email} já tem conta — ${data.msg || 'vinculado. Peça para usar "Esqueci a senha".'}`, 'sucesso');
        else if (data.status === 'ja_membro') exibirToast(`ℹ️ ${email} já é membro desta organização`, 'info');
        else exibirToast(`✅ ${email} adicionado como ${papel}!`, 'sucesso');
    } catch(e) { exibirToast('Erro ao enviar convite', 'erro'); }
}
async function criarOrgGerenciar() {
    const input = document.getElementById('gerenciar-nova-org-input');
    const nome = (input?.value || '').trim();
    if (!nome) { exibirToast('Informe o nome', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
        if (!resp || !resp.ok) { const err = await resp.json().catch(() => ({})); exibirToast(err.detail || 'Erro ao criar', 'erro'); return; }
        const org = await resp.json();
        orgsCache.push(org);
        currentOrgId = org.id;
        localStorage.setItem('daviflow_org_id', currentOrgId);
        renderizarOrgsSelect();
        exibirToast(`Organização "${org.nome}" criada!`, 'sucesso');
        input.value = '';
        // atualiza info
        const info = document.getElementById('gerenciar-org-info');
        if (info) info.innerHTML = `<div class="flex items-center justify-between"><span class="font-bold">${escaparHTML(org.nome)}</span><span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">admin</span></div>`;
        await Promise.all([carregarClientes(), carregarEtapas(), carregarTags()]);
    } catch(e) { exibirToast('Erro ao criar organização', 'erro'); }
}
async function renomearOrgAtual() {
    const input = document.getElementById('gerenciar-rename-input');
    const nome = (input?.value || '').trim();
    if (!nome) { exibirToast('Informe o novo nome', 'erro'); return; }
    if (!currentOrgId) { exibirToast('Nenhuma org selecionada', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
        if (!resp || !resp.ok) { const err = await resp.json().catch(() => ({})); exibirToast(err.detail || 'Erro ao renomear', 'erro'); return; }
        const org = await resp.json();
        const idx = orgsCache.findIndex(o => o.id === currentOrgId);
        if (idx !== -1) orgsCache[idx].nome = org.nome;
        renderizarOrgsSelect();
        exibirToast(`Organização renomeada para "${org.nome}"`, 'sucesso');
    } catch(e) { exibirToast('Erro ao renomear', 'erro'); }
}
async function carregarClientesGerenciar() {
    const container = document.getElementById('lista-clientes-gerenciar');
    if (!container) return;
    if (!currentOrgId) { container.innerHTML = '<p class="text-[11px] text-slate-400">Selecione uma organização</p>'; return; }
    // usa clientesCache já filtrado por org (carregarClientes já filtra)
    if (!clientesCache || clientesCache.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-slate-400">Nenhum cliente nesta organização</p>';
        return;
    }
    container.innerHTML = clientesCache.map(c => `<div class="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><div class="min-w-0"><div class="text-xs font-semibold truncate">${escaparHTML(c.nome)}</div><div class="text-[11px] text-slate-400 truncate">${escaparHTML(c.email || '')} • ${c.ativo ? 'ativo' : 'inativo'}</div></div><button onclick="removerClienteGerenciar('${c.id}')" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Excluir cliente (remove da org)"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>`).join('');
    if (window.lucide) lucide.createIcons();
}
async function removerClienteGerenciar(clienteId) {
    confirmarAcao('Excluir cliente?', 'O cliente será removido permanentemente desta organização. Deseja continuar?', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/clientes/${clienteId}`, { method: 'DELETE' });
            if (!resp || !resp.ok) { exibirToast('Erro ao excluir cliente', 'erro'); return; }
            exibirToast('Cliente removido!', 'sucesso');
            await carregarClientes();
            carregarClientesGerenciar();
        } catch(e) { exibirToast('Erro ao excluir', 'erro'); }
    });
}

// ============================================================
// 3B — INTEGRAÇÕES (Calendar / Zapier / Conta Azul)
// ============================================================
let integracoesCache = [];
async function carregarIntegracoes() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/integracoes${getOrgQuery()}`, { method: 'GET' });
        if (!resp || !resp.ok) { integracoesCache = []; renderizarIntegracoes(); return; }
        const data = await resp.json();
        integracoesCache = Array.isArray(data) ? data : [];
        renderizarIntegracoes();
    } catch(e) { integracoesCache = []; renderizarIntegracoes(); }
}
function renderizarIntegracoes() {
    const container = document.getElementById('lista-integracoes');
    if (!container) return;
    if (integracoesCache.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-slate-400">Nenhuma integração ativa. Crie um webhook Zapier.</p>';
        return;
    }
    container.innerHTML = integracoesCache.map(i => {
        const tipoIcon = i.tipo === 'zapier' ? 'zap' : i.tipo === 'calendar' ? 'calendar' : 'banknote';
        const tipoLabel = i.tipo;
        return `<div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><div class="flex items-center gap-2"><i data-lucide="${tipoIcon}" class="w-3.5 h-3.5 text-slate-500"></i><span class="font-semibold">${escaparHTML(i.nome || tipoLabel)}</span><span class="text-[10px] px-1.5 py-0.5 rounded-full ${i.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${i.ativo ? 'ativa' : 'inativa'}</span><span class="text-[10px] text-slate-400">${escaparHTML(i.tipo)}</span></div><button onclick="deletarIntegracao('${i.id}')" class="p-1 rounded-lg text-rose-500 hover:bg-rose-50" title="Remover (apenas admin)"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>`;
    }).join('');
    // atualiza webhook url se tiver zapier
    const zap = integracoesCache.find(x => x.tipo === 'zapier' || x.tipo === 'webhook');
    const input = document.getElementById('zapier-webhook-url');
    if (input && zap) {
        const base = window.location.origin;
        input.value = `${base}/api/webhooks/zapier/${zap.id}`;
    }
    if (window.lucide) lucide.createIcons();
}
function abrirModalIntegracoes() {
    // membro pode ver mas não criar - mostra aviso se não admin
    if (!isCurrentOrgAdmin()) {
        // permite abrir em modo leitura
    }
    const modal = document.getElementById('modal-integracoes');
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.querySelector('.modal-box')?.classList.remove('scale-95','opacity-0');
        modal.querySelector('.modal-box')?.classList.add('scale-100','opacity-100');
    });
    carregarIntegracoes();
    if (window.lucide) lucide.createIcons();
}
function fecharModalIntegracoes() {
    const modal = document.getElementById('modal-integracoes');
    if (!modal) return;
    modal.querySelector('.modal-box')?.classList.add('scale-95','opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}
async function criarIntegracaoZapier() {
    if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode criar integrações', 'erro'); return; }
    if (!currentOrgId) { exibirToast('Selecione uma organização', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/integracoes${getOrgQuery()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'zapier', nome: 'Zapier webhook', config: {}, ativo: true }) });
        if (!resp || !resp.ok) { const err = await resp.json().catch(()=>({})); if (resp && resp.status === 403) exibirToast(err.detail || 'Apenas admin pode criar', 'erro'); else exibirToast(err.detail || 'Erro ao criar integração', 'erro'); return; }
        exibirToast('Webhook Zapier criado!', 'sucesso');
        await carregarIntegracoes();
    } catch(e) { exibirToast('Erro ao criar webhook', 'erro'); }
}
async function deletarIntegracao(id) {
    if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode remover', 'erro'); return; }
    confirmarAcao('Remover integração?', 'A URL do webhook deixará de funcionar. Deseja continuar?', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/integracoes/${id}`, { method: 'DELETE' });
            if (!resp || !resp.ok) { const err = await resp.json().catch(()=>({})); if (resp && resp.status === 403) exibirToast(err.detail || 'Apenas admin', 'erro'); else exibirToast(err.detail || 'Erro ao remover', 'erro'); return; }
            exibirToast('Integração removida', 'sucesso');
            await carregarIntegracoes();
        } catch(e) { exibirToast('Erro ao remover', 'erro'); }
    });
}
function copiarWebhookUrl() {
    const input = document.getElementById('zapier-webhook-url');
    if (!input || !input.value) { exibirToast('Crie um webhook primeiro', 'info'); return; }
    navigator.clipboard.writeText(input.value).then(()=> exibirToast('URL copiada!', 'sucesso')).catch(()=> exibirToast(input.value, 'info'));
}
async function testarWebhookZapier() {
    const input = document.getElementById('zapier-webhook-url');
    if (!input || !input.value) { exibirToast('Crie um webhook primeiro', 'info'); return; }
    const url = input.value;
    try {
        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Teste Zapier', email: 'teste_zapier_'+Date.now()+'@exemplo.com', telefone: '(11) 99999-0000' }) });
        const data = await resp.json().catch(()=>({}));
        if (resp.ok) { exibirToast('Teste ok! Cliente criado: '+(data.cliente?.email || ''), 'sucesso'); await carregarClientes(); }
        else exibirToast(data.detail || 'Erro no teste', 'erro');
    } catch(e) { exibirToast('Erro ao testar webhook', 'erro'); }
}
async function conectarCalendar() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/integracoes/calendar/auth-url${getOrgQuery()}`, { method: 'GET' });
        if (!resp || !resp.ok) { exibirToast('Erro ao conectar Calendar', 'erro'); return; }
        const data = await resp.json();
        const status = document.getElementById('calendar-status');
        if (status) status.textContent = 'Mock conectado: ' + (data.auth_url || '');
        exibirToast('Calendar conectado (mock)!', 'sucesso');
        // cria integração calendar mock se não existe
        if (!integracoesCache.find(x=>x.tipo==='calendar')) {
            await fetchAuth(`${API_BASE_URL}/integracoes${getOrgQuery()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'calendar', nome: 'Google Calendar', config: { mock: true }, ativo: true }) });
            await carregarIntegracoes();
        }
    } catch(e) { exibirToast('Erro Calendar', 'erro'); }
}
async function toggleContaAzul(ativo) {
    if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode alterar', 'erro'); document.getElementById('contaazul-toggle').checked = !ativo; return; }
    try {
        const existente = integracoesCache.find(x=>x.tipo==='contaazul');
        if (ativo && !existente) {
            await fetchAuth(`${API_BASE_URL}/integracoes${getOrgQuery()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'contaazul', nome: 'Conta Azul', config: { sync: true }, ativo: true }) });
        } else if (!ativo && existente) {
            await fetchAuth(`${API_BASE_URL}/integracoes/${existente.id}`, { method: 'DELETE' });
        } else if (existente) {
            await fetchAuth(`${API_BASE_URL}/integracoes/${existente.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo }) });
        }
        exibirToast(ativo ? 'Conta Azul ativado (mock)' : 'Conta Azul desativado', ativo ? 'sucesso' : 'info');
        await carregarIntegracoes();
    } catch(e) { exibirToast('Erro Conta Azul', 'erro'); }
}

// ============================================================
// 3C — ANEXOS + API KEYS
// ============================================================
let anexosCache = [];
let apiKeysCache = [];
let detalhesClienteIdAtual = null;
let verticaisCache = [];
let currentVertical = localStorage.getItem('daviflow_vertical') || 'geral';

async function carregarAnexos(clienteId) {
    const container = document.getElementById('anexos-lista');
    if (!container) return;
    detalhesClienteIdAtual = clienteId;
    container.innerHTML = '<p class="text-[11px] text-slate-400">Carregando...</p>';
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/clientes/${clienteId}/anexos${getOrgQuery()}`, { method: 'GET' });
        if (!resp || !resp.ok) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro ao carregar anexos</p>'; return; }
        const data = await resp.json();
        anexosCache = Array.isArray(data) ? data : [];
        renderizarAnexos();
    } catch(e) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro</p>'; }
}
function renderizarAnexos() {
    const container = document.getElementById('anexos-lista');
    if (!container) return;
    if (anexosCache.length === 0) { container.innerHTML = '<p class="text-[11px] text-slate-400">Nenhum anexo</p>'; return; }
    container.innerHTML = anexosCache.map(a => {
        const kb = (a.tamanho/1024).toFixed(1);
        return `<div class="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><div class="flex items-center gap-2 min-w-0"><i data-lucide="file" class="w-3.5 h-3.5 text-slate-400"></i><span class="text-xs font-semibold truncate">${escaparHTML(a.nome)}</span><span class="text-[10px] text-slate-400">${escaparHTML(a.mime)} • ${kb}KB</span></div><button onclick="deletarAnexo('${a.id}')" class="p-1 rounded-lg text-rose-500 hover:bg-rose-50" title="Remover"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}
async function uploadAnexo(file) {
    if (!file) return;
    if (file.size > 10*1024*1024) { exibirToast('Arquivo excede 10MB', 'erro'); return; }
    if (!detalhesClienteIdAtual) { exibirToast('Selecione um cliente', 'erro'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const base64 = reader.result.split(',')[1];
            const payload = { cliente_id: detalhesClienteIdAtual, nome: file.name, tamanho: file.size, mime: file.type || 'application/octet-stream', content_base64: base64 };
            const resp = await fetchAuth(`${API_BASE_URL}/clientes/${detalhesClienteIdAtual}/anexos${getOrgQuery()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!resp || !resp.ok) { const err = await resp.json().catch(()=>({})); exibirToast(err.detail || 'Erro ao enviar anexo', 'erro'); return; }
            exibirToast('Anexo enviado!', 'sucesso');
            await carregarAnexos(detalhesClienteIdAtual);
        } catch(e) { exibirToast('Erro ao enviar', 'erro'); }
    };
    reader.readAsDataURL(file);
    // reset input
    const inp = document.getElementById('anexo-file-input');
    if (inp) inp.value = '';
}
async function deletarAnexo(id) {
    confirmarAcao('Remover anexo?', 'O arquivo será removido do Storage e da lista. Deseja continuar?', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/anexos/${id}`, { method: 'DELETE' });
            if (!resp || !resp.ok) { const err = await resp.json().catch(()=>({})); if (resp && resp.status===403) exibirToast(err.detail||'Apenas admin', 'erro'); else exibirToast(err.detail||'Erro ao remover', 'erro'); return; }
            exibirToast('Anexo removido', 'sucesso');
            await carregarAnexos(detalhesClienteIdAtual);
        } catch(e) { exibirToast('Erro ao remover', 'erro'); }
    });
}
// API Keys
async function carregarApiKeys() {
    const container = document.getElementById('lista-apikeys');
    if (!container) return;
    container.innerHTML = '<p class="text-[11px] text-slate-400">Carregando...</p>';
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/api-keys${getOrgQuery()}`, { method: 'GET' });
        if (!resp || !resp.ok) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro ao carregar</p>'; return; }
        const data = await resp.json();
        apiKeysCache = Array.isArray(data) ? data : [];
        renderizarApiKeys();
    } catch(e) { container.innerHTML = '<p class="text-[11px] text-rose-400">Erro</p>'; }
}
function renderizarApiKeys() {
    const container = document.getElementById('lista-apikeys');
    if (!container) return;
    if (apiKeysCache.length === 0) { container.innerHTML = '<p class="text-[11px] text-slate-400">Nenhuma chave. Gere a primeira.</p>'; return; }
    container.innerHTML = apiKeysCache.map(k => `<div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border"><div><div class="text-xs font-bold">${escaparHTML(k.nome)}</div><div class="text-[10px] text-slate-400 font-mono">${escaparHTML(k.prefix)}•••• • ${k.created_at ? new Date(k.created_at).toLocaleDateString() : ''}</div></div><button onclick="deletarApiKey('${k.id}')" class="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>`).join('');
    if (window.lucide) lucide.createIcons();
}
function abrirModalApiKeys() {
    const modal = document.getElementById('modal-apikeys');
    if (!modal) return;
    // esconde plain_key antiga (só mostra logo após gerar)
    const box = document.getElementById('apikey-nova');
    if (box) box.classList.add('hidden');
    const code = document.getElementById('apikey-plain');
    if (code) code.textContent = '';
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>{ modal.querySelector('.modal-box')?.classList.remove('scale-95','opacity-0'); modal.querySelector('.modal-box')?.classList.add('scale-100','opacity-100'); });
    carregarApiKeys();
    if (window.lucide) lucide.createIcons();
}
function fecharModalApiKeys() {
    const modal = document.getElementById('modal-apikeys');
    if (!modal) return;
    modal.querySelector('.modal-box')?.classList.add('scale-95','opacity-0');
    setTimeout(()=> modal.classList.add('hidden'), 200);
    // limpa plain_key ao fechar por segurança
    const box = document.getElementById('apikey-nova');
    if (box) box.classList.add('hidden');
}
async function criarApiKey() {
    const input = document.getElementById('apikey-nome-input');
    const nome = (input?.value || '').trim();
    if (!nome) { exibirToast('Informe o nome da chave', 'erro'); return; }
    if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode gerar chaves', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/api-keys${getOrgQuery()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
        if (!resp || !resp.ok) { const err = await resp.json().catch(()=>({})); if (resp && resp.status===403) exibirToast(err.detail||'Apenas admin', 'erro'); else exibirToast(err.detail||'Erro ao gerar', 'erro'); return; }
        const data = await resp.json();
        const box = document.getElementById('apikey-nova');
        const code = document.getElementById('apikey-plain');
        if (box && code && data.plain_key) { code.textContent = data.plain_key; box.classList.remove('hidden'); }
        input.value = '';
        exibirToast('API Key gerada! Copie agora (só aparece uma vez).', 'sucesso');
        await carregarApiKeys();
    } catch(e) { exibirToast('Erro ao gerar chave', 'erro'); }
}
function copiarApiKey() {
    const code = document.getElementById('apikey-plain');
    if (!code || !code.textContent) return;
    navigator.clipboard.writeText(code.textContent).then(()=> exibirToast('Chave copiada!', 'sucesso'));
}
async function deletarApiKey(id) {
    confirmarAcao('Revogar chave?', 'A chave deixará de funcionar imediatamente. Deseja continuar?', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/api-keys/${id}`, { method: 'DELETE' });
            if (!resp || !resp.ok) { const err = await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro ao revogar', 'erro'); return; }
            exibirToast('Chave revogada', 'sucesso');
            await carregarApiKeys();
        } catch(e) { exibirToast('Erro ao revogar', 'erro'); }
    });
}

// ============================================================
// 4A — VERTICAIS
// ============================================================
async function carregarVerticais() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/verticais`, { method: 'GET' });
        if (!resp || !resp.ok) return;
        verticaisCache = await resp.json();
    } catch(e) {}
}
async function carregarVerticalOrg() {
    if (!currentOrgId) return;
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/vertical`, { method: 'GET' });
        if (!resp || !resp.ok) return;
        const data = await resp.json();
        if (data.vertical) {
            currentVertical = data.vertical;
            localStorage.setItem('daviflow_vertical', currentVertical);
            const sel = document.getElementById('vertical-select');
            if (sel) sel.value = currentVertical;
            aplicarVertical(currentVertical);
        }
    } catch(e) {}
}
function aplicarVertical(slug) {
    currentVertical = slug || 'geral';
    localStorage.setItem('daviflow_vertical', currentVertical);
    const sel = document.getElementById('vertical-select');
    if (sel) sel.value = currentVertical;
    // Renomeia labels
    const mapRenomeia = {
        hospital: { cargo: 'Especialidade', empresa: 'Setor/Unidade' },
        lava_rapido_oficina: { empresa: 'Veículo/Oficina' },
        academia: { cargo: 'Treino' },
        geral: {},
        dentista: {},
    };
    const ren = mapRenomeia[slug] || {};
    document.querySelectorAll('label[for="criar-cargo"], label[for="editar-cargo"]').forEach(l => {
        const base = 'Cargo';
        l.textContent = ren.cargo || base;
        if (ren.cargo) l.innerHTML = `${ren.cargo} <span class="text-[10px] text-slate-400">(vertical)</span>`;
    });
    document.querySelectorAll('label[for="criar-empresa"], label[for="editar-empresa"]').forEach(l => {
        const base = 'Empresa';
        if (ren.empresa) l.textContent = ren.empresa;
        else l.textContent = base;
    });
    // Renderiza campos extras por vertical (4A)
    ['criar','editar'].forEach(prefix => {
        const container = document.getElementById(prefix+'-vertical-extras');
        const camposDiv = document.getElementById(prefix+'-vertical-campos');
        const nomeSpan = document.getElementById(prefix+'-vertical-nome');
        if (!container || !camposDiv) return;
        if (slug === 'geral') {
            container.classList.add('hidden');
            camposDiv.innerHTML = '';
            return;
        }
        container.classList.remove('hidden');
        if (nomeSpan) nomeSpan.textContent = '('+slug+')';
        let html = '';
        if (slug === 'hospital') {
            html = `
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="form-label">Convênio</label><input id="${prefix}-cc-convenio" type="text" placeholder="Ex: Unimed" class="form-input"></div>
                    <div><label class="form-label">Leito</label><input id="${prefix}-cc-leito" type="text" placeholder="Ex: 101-A" class="form-input"></div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="form-label">Prontuário</label><input id="${prefix}-cc-prontuario" type="text" placeholder="Ex: 2026-001" class="form-input"></div>
                    <div><label class="form-label">CRM Médico</label><input id="${prefix}-cc-crm" type="text" placeholder="Ex: 123456-SP" class="form-input"></div>
                </div>
                <div><label class="form-label">Status Internação</label><select id="${prefix}-cc-status_int" class="form-input"><option value="">Selecione</option><option value="internado">Internado</option><option value="alta">Alta</option><option value="triagem">Triagem</option></select></div>
            `;
        } else if (slug === 'lava_rapido_oficina') {
            html = `
                <div id="${prefix}-carros-container" class="space-y-3"></div>
                <button type="button" onclick="adicionarCarro('${prefix}')" class="w-full py-2 text-xs font-semibold rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar veículo</button>
                <div class="pt-2 border-t">
                    <label class="form-label">Serviço</label><select id="${prefix}-cc-servico" class="form-input"><option value="">Selecione</option><option value="lavagem">Lavagem</option><option value="troca_oleo">Troca de óleo</option><option value="revisao">Revisão</option><option value="outro">Outro</option></select>
                </div>
            `;
        } else if (slug === 'dentista') {
            html = `
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="form-label">Dente (1-32 FDI)</label><input id="${prefix}-cc-dente" type="number" min="1" max="32" placeholder="Ex: 11" class="form-input"></div>
                    <div><label class="form-label">Procedimento</label><select id="${prefix}-cc-procedimento" class="form-input"><option value="">Selecione</option><option value="limpeza">Limpeza</option><option value="canal">Canal</option><option value="ortodontia">Ortodontia</option><option value="implante">Implante</option><option value="outro">Outro</option></select></div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="form-label">Convênio Odonto</label><input id="${prefix}-cc-conv_odo" type="text" placeholder="Ex: Amil Dental" class="form-input"></div>
                    <div><label class="form-label">Retorno (6m)</label><input id="${prefix}-cc-retorno" type="date" class="form-input"></div>
                </div>
            `;
        } else if (slug === 'academia') {
            html = `
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="form-label">Plano Mensal</label><input id="${prefix}-cc-plano_mensal" type="text" placeholder="Ex: Mensal R$ 89" class="form-input"></div>
                    <div><label class="form-label">Último check-in</label><input id="${prefix}-cc-checkin" type="date" class="form-input"></div>
                </div>
            `;
        }
        camposDiv.innerHTML = html;
        if (window.lucide) lucide.createIcons();
        // Para oficina, garante 1 carro inicial
        if (slug === 'lava_rapido_oficina') {
            const cont = document.getElementById(prefix+'-carros-container');
            if (cont && cont.children.length === 0) adicionarCarro(prefix);
        }
    });
    console.log('[vertical] aplicando', slug);
}
function adicionarCarro(prefix) {
    const cont = document.getElementById(prefix+'-carros-container');
    if (!cont) return;
    const idx = cont.children.length + 1;
    const div = document.createElement('div');
    div.className = 'p-3 rounded-xl border border-amber-100 dark:border-amber-800/40 bg-white dark:bg-slate-800/40 space-y-2';
    div.innerHTML = `
        <div class="flex items-center justify-between"><span class="text-xs font-bold text-amber-700 dark:text-amber-300">Veículo ${idx}</span><button type="button" onclick="this.closest('div').parentElement.removeChild(this.closest('div').parentElement.children[0] ? this.closest('div') : this.closest('div'))" class="text-[10px] text-rose-500 hover:underline">Remover</button></div>
        <div class="grid grid-cols-3 gap-2">
            <input data-cc="placa" type="text" placeholder="Placa ABC1D23" maxlength="8" class="form-input text-xs" style="text-transform:uppercase">
            <input data-cc="modelo" type="text" placeholder="Modelo" class="form-input text-xs">
            <input data-cc="km_carro" type="number" placeholder="KM" class="form-input text-xs">
        </div>
    `;
    // Corrige remover (simplificado)
    div.querySelector('button').onclick = () => div.remove();
    cont.appendChild(div);
}
function coletarCamposCustom(prefix) {
    const slug = currentVertical;
    console.log('[4A] coletar start', prefix, 'slug', slug, 'org', currentOrgId);
    if (slug === 'geral') return {};
    const out = {};
    const g = id => document.getElementById(prefix+'-cc-'+id)?.value?.trim();
    if (slug === 'hospital') {
        if (g('convenio')) out.convenio = g('convenio');
        if (g('leito')) out.leito = g('leito');
        if (g('prontuario')) out.prontuario = g('prontuario');
        if (g('crm')) out.crm_medico_responsavel = g('crm');
        if (g('status_int')) out.status_internacao = g('status_int');
    } else if (slug === 'lava_rapido_oficina') {
        const carros = [];
        document.querySelectorAll('#'+prefix+'-carros-container [data-cc="placa"]').forEach((el, i) => {
            const row = el.closest('div').parentElement;
            // Na verdade cada carro div tem 3 inputs, pegar pela ordem
            const placa = el.value.trim().toUpperCase();
            const modelo = row.querySelector('[data-cc="modelo"]')?.value.trim();
            const km = row.querySelector('[data-cc="km_carro"]')?.value.trim();
            if (placa || modelo) carros.push({ placa, modelo, km });
        });
        // Fallback: coleta direta se estrutura diferente
        if (carros.length === 0) {
            document.querySelectorAll('#'+prefix+'-carros-container > div').forEach(div => {
                const placa = div.querySelector('[data-cc="placa"]')?.value.trim().toUpperCase();
                const modelo = div.querySelector('[data-cc="modelo"]')?.value.trim();
                const km = div.querySelector('[data-cc="km_carro"]')?.value.trim();
                if (placa || modelo) {
                    // evita duplicar se já adicionado
                    if (!carros.find(c=>c.placa===placa && c.modelo===modelo)) carros.push({ placa, modelo, km });
                }
            });
        }
        if (carros.length) out.carros = carros;
        console.log('[4A] coletar oficina', prefix, 'carros', carros, 'out', out);
        // Também suporta campos antigos single
        if (g('servico')) out.servico = g('servico');
        if (g('km')) out.km = g('km');
    } else if (slug === 'dentista') {
        if (g('dente')) out.dente = g('dente');
        if (g('procedimento')) out.procedimento = g('procedimento');
        if (g('conv_odo')) out.convenio_odonto = g('conv_odo');
        if (g('retorno')) out.data_retorno = g('retorno');
    } else if (slug === 'academia') {
        if (g('plano_mensal')) out.plano_mensal = g('plano_mensal');
        if (g('treino')) out.treino = g('treino');
        if (g('freq')) out.frequencia_semanal = g('freq');
        if (g('checkin')) out.ultimo_checkin = g('checkin');
    }
    return out;
}
function preencherCamposCustom(prefix, campos) {
    if (!campos) return;
    const g = (id, val) => { const el=document.getElementById(prefix+'-cc-'+id); if(el && val) el.value=val; };
    if (currentVertical === 'hospital') {
        g('convenio', campos.convenio); g('leito', campos.leito); g('prontuario', campos.prontuario); g('crm', campos.crm_medico_responsavel); g('status_int', campos.status_internacao);
    } else if (currentVertical === 'lava_rapido_oficina') {
        if (Array.isArray(campos.carros)) {
            const cont=document.getElementById(prefix+'-carros-container');
            if(cont){ cont.innerHTML=''; campos.carros.forEach(c=>{ adicionarCarro(prefix); const last=cont.lastElementChild; if(last){ last.querySelector('[data-cc="placa"]').value=c.placa||''; last.querySelector('[data-cc="modelo"]').value=c.modelo||''; last.querySelector('[data-cc="km_carro"]').value=c.km||''; } }); }
        }
        g('servico', campos.servico); g('km', campos.km);
    } else if (currentVertical === 'dentista') {
        g('dente', campos.dente); g('procedimento', campos.procedimento); g('conv_odo', campos.convenio_odonto); g('retorno', campos.data_retorno);
    } else if (currentVertical === 'academia') {
        g('plano_mensal', campos.plano_mensal); g('treino', campos.treino); g('freq', campos.frequencia_semanal); g('checkin', campos.ultimo_checkin);
    }
}
async function trocarVertical(slug) {
    if (!slug) slug = 'geral';
    if (!currentOrgId) { aplicarVertical(slug); return; }
    if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode trocar vertical da org', 'erro'); const sel=document.getElementById('vertical-select'); if(sel) sel.value=currentVertical; return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/vertical`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vertical: slug }) });
        if (!resp || !resp.ok) { const err=await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro ao trocar vertical', 'erro'); document.getElementById('vertical-select').value=currentVertical; return; }
        exibirToast(`Vertical alterada para ${slug}`, 'sucesso');
        aplicarVertical(slug);
    } catch(e) { exibirToast('Erro ao trocar vertical', 'erro'); }
}
function selecionarVertical(slug) {
    localStorage.setItem('daviflow_vertical_escolhido', '1');
    fecharModalVertical();
    trocarVertical(slug);
}
function abrirModalVertical() {
    const modal = document.getElementById('modal-vertical');
    if (!modal) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>{ modal.querySelector('.modal-box')?.classList.remove('scale-95','opacity-0'); modal.querySelector('.modal-box')?.classList.add('scale-100','opacity-100'); });
    if (window.lucide) lucide.createIcons();
}
function fecharModalVertical() {
    const modal = document.getElementById('modal-vertical');
    if (!modal) return;
    modal.querySelector('.modal-box')?.classList.add('scale-95','opacity-0');
    setTimeout(()=> modal.classList.add('hidden'), 200);
}

// ============================================================
// 4C — CONFIGURAÇÕES (7 abas)
// ============================================================
function trocarAbaConfig(aba) {
    const abas = ['geral','org','planos','etapas','tags','notif','conta'];
    abas.forEach(a => {
        const btn = document.getElementById('tab-config-'+a);
        const conteudo = document.getElementById('config-conteudo-'+a);
        if (btn) {
            if (a === aba) { btn.classList.add('bg-indigo-600','text-white'); btn.classList.remove('bg-slate-100','dark:bg-slate-800','text-slate-600'); }
            else { btn.classList.remove('bg-indigo-600','text-white'); btn.classList.add('bg-slate-100','dark:bg-slate-800','text-slate-600'); }
        }
        if (conteudo) conteudo.classList.toggle('hidden', a !== aba);
    });
    if (aba === 'geral') carregarConfigGeral();
    if (aba === 'org') carregarConfigOrg();
    if (aba === 'planos') renderizarConfigPlanos();
    if (aba === 'etapas') renderizarConfigEtapas();
    if (aba === 'tags') renderizarConfigTags();
    if (aba === 'notif') {
        document.getElementById('notif-email-atrasado').checked = localStorage.getItem('daviflow_notif_email_atrasado') === '1';
        document.getElementById('notif-push-vence').checked = localStorage.getItem('daviflow_notif_push_vence') === '1';
    }
    if (window.lucide) lucide.createIcons();
}
async function carregarConfigGeral() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/usuarios/me`, { method: 'GET' });
        if (!resp || !resp.ok) return;
        const data = await resp.json();
        document.getElementById('config-nome').value = data.nome_completo || '';
        document.getElementById('config-empresa').value = data.nome_empresa || '';
        document.getElementById('config-email').value = data.email || '';
        document.getElementById('config-vertical').value = data.vertical || currentVertical || 'geral';
    } catch(e) {}
}
async function salvarConfigGeral() {
    const payload = {
        nome_completo: document.getElementById('config-nome')?.value.trim() || null,
        nome_empresa: document.getElementById('config-empresa')?.value.trim() || null,
        vertical: document.getElementById('config-vertical')?.value || null,
    };
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/usuarios/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!resp || !resp.ok) { const err=await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro ao salvar', 'erro'); return; }
        exibirToast('Configurações salvas!', 'sucesso');
        const data = await resp.json();
        if (data.vertical) { currentVertical = data.vertical; localStorage.setItem('daviflow_vertical', currentVertical); aplicarVertical(currentVertical); document.getElementById('vertical-select').value = currentVertical; }
    } catch(e) { exibirToast('Erro ao salvar', 'erro'); }
}
async function carregarConfigOrg() {
    const org = orgsCache.find(o=>o.id===currentOrgId);
    const info = document.getElementById('config-org-info');
    if (info) {
        if (org) info.innerHTML = `<div class="flex items-center justify-between"><span class="font-bold">${escaparHTML(org.nome)}</span><span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">${escaparHTML(org.papel||'membro')}</span></div><div class="text-[11px] text-slate-400 mt-1">${escaparHTML(org.id.slice(0,8))}... • ${org.vertical||'geral'}</div>`;
        else info.innerHTML = '<p class="text-xs text-slate-400">Nenhuma org selecionada</p>';
    }
    const input = document.getElementById('config-org-nome');
    if (input && org) input.value = org.nome;
    // membros
    const cont = document.getElementById('config-org-membros');
    if (cont) {
        cont.innerHTML = '<p class="text-[11px] text-slate-400">Carregando...</p>';
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/membros`, { method: 'GET' });
            if (!resp || !resp.ok) { cont.innerHTML = '<p class="text-rose-400">Erro</p>'; return; }
            const membros = await resp.json();
            const isAdmin = org?.papel === 'admin';
            cont.innerHTML = membros.map(m=> `<div class="flex items-center justify-between p-1.5 rounded border"><span class="font-mono text-[10px]">${escaparHTML(m.user_id.slice(0,8))}... ${escaparHTML(m.papel)}</span>${isAdmin ? `<button onclick="removerMembro('${m.user_id}')" class="text-rose-500 text-[10px]">Remover</button>` : ''}</div>`).join('');
        } catch(e) { cont.innerHTML = '<p class="text-rose-400">Erro</p>'; }
    }
}
async function renomearOrgConfig() {
    const nome = document.getElementById('config-org-nome')?.value.trim();
    if (!nome) { exibirToast('Informe nome', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
        if (!resp || !resp.ok) { const err=await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro', 'erro'); return; }
        exibirToast('Organização renomeada', 'sucesso');
        await carregarOrgs();
    } catch(e) { exibirToast('Erro', 'erro'); }
}
async function convidarOrgConfig() {
    const email = document.getElementById('config-convite-email')?.value.trim();
    const papel = document.getElementById('config-convite-papel')?.value || 'membro';
    if (!email) { exibirToast('Informe email', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/orgs/${currentOrgId}/convites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, papel }) });
        if (!resp || !resp.ok) { const err=await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro', 'erro'); return; }
        exibirToast('Convite enviado', 'sucesso');
        document.getElementById('config-convite-email').value='';
        carregarConfigOrg();
    } catch(e) { exibirToast('Erro', 'erro'); }
}
function renderizarConfigPlanos() {
    const cont = document.getElementById('config-planos-lista');
    if (!cont) return;
    if (planosCache.length===0) { cont.innerHTML='<p class="text-slate-400">Nenhum plano</p>'; return; }
    cont.innerHTML = planosCache.map(p=> {
        const estilo = (typeof MAPA_CORES_PLANO !== 'undefined' && MAPA_CORES_PLANO[p.cor]) ? MAPA_CORES_PLANO[p.cor] : MAPA_CORES_PLANO.slate;
        return `<div class="flex items-center justify-between p-2 rounded border bg-white dark:bg-slate-800/40"><div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full ${estilo.dot} flex-shrink-0"></span><span class="font-bold text-xs">${escaparHTML(p.nome)}</span></div><span class="text-[10px] px-1.5 py-0.5 rounded-full ${estilo.bg} ${estilo.text} border ${estilo.border}">${escaparHTML(p.valor||'')}</span></div>`;
    }).join('');
}
function renderizarConfigEtapas() {
    const cont = document.getElementById('config-etapas-lista');
    if (!cont) return;
    if (etapasCache.length===0) { cont.innerHTML='<p class="text-slate-400">Nenhuma etapa</p>'; return; }
    cont.innerHTML = etapasCache.map(e=> `<div class="flex items-center justify-between p-2 rounded border"><span class="text-xs">${escaparHTML(e.nome)} • ordem ${e.ordem}</span><span class="w-2 h-2 rounded-full" style="background:${e.cor}"></span></div>`).join('');
}
function renderizarConfigTags() {
    const cont = document.getElementById('config-tags-lista');
    if (!cont) return;
    if (tagsCache.length===0) { cont.innerHTML='<p class="text-slate-400">Nenhuma tag</p>'; return; }
    cont.innerHTML = tagsCache.map(t=> `<div class="flex items-center justify-between p-2 rounded border"><span class="text-xs">${escaparHTML(t.nome)}</span><span class="w-3 h-3 rounded-full" style="background:${t.cor}"></span></div>`).join('');
}
function salvarNotificacoes() {
    const email = document.getElementById('notif-email-atrasado')?.checked;
    const push = document.getElementById('notif-push-vence')?.checked;
    localStorage.setItem('daviflow_notif_email_atrasado', email ? '1':'0');
    localStorage.setItem('daviflow_notif_push_vence', push ? '1':'0');
    exibirToast('Notificações salvas (local)', 'sucesso');
}
async function alterarSenhaConfig() {
    const nova = document.getElementById('config-nova-senha')?.value;
    if (!nova || nova.length<6) { exibirToast('Senha mínimo 6', 'erro'); return; }
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/usuarios/alterar-senha`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nova_senha: nova }) });
        if (!resp || !resp.ok) { const err=await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro', 'erro'); return; }
        exibirToast('Senha alterada!', 'sucesso');
        document.getElementById('config-nova-senha').value='';
    } catch(e) { exibirToast('Erro', 'erro'); }
}
async function exportarDados() {
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/usuarios/me/export`, { method: 'GET' });
        if (!resp || !resp.ok) { exibirToast('Erro ao exportar', 'erro'); return; }
        const data = await resp.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=`daviflow-export-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
        exibirToast('Exportado!', 'sucesso');
    } catch(e) { exibirToast('Erro ao exportar', 'erro'); }
}
async function deletarConta() {
    confirmarAcao('Deletar conta?', 'Isso apaga seu usuário e todos os dados em cascata. Deseja continuar? Digite CONFIRMAR.', async () => {
        try {
            const resp = await fetchAuth(`${API_BASE_URL}/usuarios/me`, { method: 'DELETE' });
            if (!resp || !resp.ok) { const err=await resp.json().catch(()=>({})); exibirToast(err.detail||'Erro', 'erro'); return; }
            exibirToast('Conta deletada. Redirecionando...', 'sucesso');
            setTimeout(()=> { localStorage.clear(); window.location.href='/?login=true'; }, 1500);
        } catch(e) { exibirToast('Erro', 'erro'); }
    });
}


// ============================================================
// 4B — SIDEBAR & SECAO ROUTING (Vercel style)
// ============================================================
let secaoAtiva = localStorage.getItem('daviflow_secao') || 'overview';
function setSecao(secao, pushState=true) {
    secaoAtiva = secao;
    localStorage.setItem('daviflow_secao', secao);
    // Update hash without reload
    if (pushState) {
        const url = new URL(window.location.href);
        url.hash = secao;
        history.pushState(null, '', url.toString());
    }
    // Breadcrumb
    const bc = document.getElementById('breadcrumb-text');
    if (bc) bc.textContent = secao.charAt(0).toUpperCase() + secao.slice(1);
    // Sidebar active states
    document.querySelectorAll('.sidebar-link').forEach(el => {
        const isActive = el.getAttribute('data-secao') === secao;
        el.classList.toggle('bg-indigo-50', isActive);
        el.classList.toggle('dark:bg-indigo-900/30', isActive);
        el.classList.toggle('text-indigo-700', isActive);
        el.classList.toggle('dark:text-indigo-300', isActive);
        el.classList.toggle('border', isActive);
        el.classList.toggle('border-indigo-200', isActive);
        el.classList.toggle('dark:border-indigo-800/40', isActive);
        el.classList.toggle('font-semibold', isActive);
        if (!isActive) {
            el.classList.remove('bg-indigo-50','dark:bg-indigo-900/30','text-indigo-700','dark:text-indigo-300','border','border-indigo-200','dark:border-indigo-800/40');
            el.classList.add('text-slate-600','dark:text-slate-400');
        } else {
            el.classList.remove('text-slate-600','dark:text-slate-400');
        }
    });
    // Mobile links same
    document.querySelectorAll('.sidebar-link-mobile').forEach(el => {
        const isActive = el.textContent.toLowerCase().includes(secao);
        el.classList.toggle('bg-indigo-50', isActive);
    });
    // Secoes visibility
    const secoes = {
        overview: ['secao-overview'],
        clientes: ['secao-clientes','secao-clientes-main','secao-view-toggle'],
        kanban: ['secao-kanban','kanban-board','secao-view-toggle'],
        relatorios: ['secao-relatorios','relatorios-section'],
        agenda: ['secao-agenda'],
        config: ['secao-config'],
    };
    // Hide all first
    ['secao-overview','secao-clientes','secao-clientes-main','secao-view-toggle','secao-kanban','kanban-board','secao-relatorios','relatorios-section','secao-agenda','secao-config'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
        // For flex sections, ensure they are hidden properly
        if (el) el.style.display = 'none';
    });
    // Show requested
    const toShow = secoes[secao] || secoes['overview'];
    toShow.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('hidden');
            // Restore display for flex/grid
            if (id === 'secao-overview') el.style.display = 'grid';
            else if (id === 'secao-kanban' || id === 'secao-agenda' || id === 'secao-config') el.style.display = 'flex';
            else el.style.display = '';
        }
    });
    // Special: for relatorios, ensure inner relatorios-section is visible and charts resize
    if (secao === 'relatorios') {
        const inner = document.getElementById('relatorios-section');
        if (inner) { inner.classList.remove('hidden'); inner.style.display = ''; }
        // trigger chart resize after visible
        setTimeout(()=> { if (typeof carregarRelatorios === 'function') carregarRelatorios(); window.dispatchEvent(new Event('resize')); }, 100);
    }
    if (secao === 'kanban') {
        setTimeout(()=> { if (typeof renderizarKanban === 'function') renderizarKanban(); }, 50);
    }
    if (secao === 'agenda') {
        carregarAtividadesAgenda();
    }
    if (secao === 'config') {
        trocarAbaConfig('geral');
        carregarConfigGeral();
    }
    // Sincroniza Tabela|Kanban toggle com secao
    const btnTabela = document.getElementById('btn-view-tabela');
    const btnKanban = document.getElementById('btn-view-kanban');
    if (btnTabela && btnKanban) {
        if (secao === 'kanban') {
            btnTabela.classList.remove('bg-white','dark:bg-slate-700','shadow-sm','border','border-slate-200','dark:border-slate-600','font-bold','text-slate-900','dark:text-white');
            btnTabela.classList.add('text-slate-500','dark:text-slate-400','font-semibold');
            btnKanban.classList.add('bg-white','dark:bg-slate-700','shadow-sm','border','border-slate-200','dark:border-slate-600','font-bold','text-slate-900','dark:text-white');
            btnKanban.classList.remove('text-slate-500','dark:text-slate-400','font-semibold');
        } else if (secao === 'clientes') {
            btnKanban.classList.remove('bg-white','dark:bg-slate-700','shadow-sm','border','border-slate-200','dark:border-slate-600','font-bold','text-slate-900','dark:text-white');
            btnKanban.classList.add('text-slate-500','dark:text-slate-400','font-semibold');
            btnTabela.classList.add('bg-white','dark:bg-slate-700','shadow-sm','border','border-slate-200','dark:border-slate-600','font-bold','text-slate-900','dark:text-white');
            btnTabela.classList.remove('text-slate-500','dark:text-slate-400','font-semibold');
        }
    }
    // Update sidebar org/vertical info
    const org = orgsCache.find(o=>o.id===currentOrgId);
    const sideOrg = document.getElementById('sidebar-org-nome');
    if (sideOrg) sideOrg.textContent = org ? org.nome : 'Sem org';
    const sideVert = document.getElementById('sidebar-vertical-nome');
    if (sideVert) sideVert.textContent = currentVertical || 'geral';
    // Footer API URL - hide localhost in prod
    const footerApi = document.getElementById('footer-api-url');
    if (footerApi) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
            footerApi.textContent = window.location.host;
            footerApi.classList.remove('hidden');
        } else {
            footerApi.textContent = window.location.hostname;
            // mantém hidden em mobile (hidden sm:inline) já no HTML, mas garante
            if (window.innerWidth < 640) footerApi.classList.add('hidden');
        }
    }
    if (window.lucide) lucide.createIcons();
}
function toggleSidebarMobile(show) {
    const mob = document.getElementById('sidebar-mobile');
    const overlay = document.getElementById('sidebar-overlay');
    if (!mob || !overlay) return;
    if (show) {
        mob.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        mob.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}
function getSecaoFromHash() {
    const h = window.location.hash.replace('#','').trim().toLowerCase();
    const valid = ['overview','clientes','kanban','relatorios','agenda','config'];
    return valid.includes(h) ? h : null;
}
async function carregarAtividadesAgenda() {
    const container = document.getElementById('agenda-lista');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400">Carregando agenda...</p>';
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/atividades${getOrgQuery()}`, { method: 'GET' });
        if (!resp || !resp.ok) { container.innerHTML = '<p class="text-xs text-rose-400">Erro ao carregar agenda</p>'; return; }
        const atvs = await resp.json();
        if (!Array.isArray(atvs) || atvs.length === 0) { container.innerHTML = '<p class="text-xs text-slate-400">Nenhuma atividade. Crie um follow-up em Clientes → Detalhes.</p>'; return; }
        // Ordena por data
        atvs.sort((a,b)=> (a.data||'').localeCompare(b.data||''));
        container.innerHTML = atvs.map(a => {
            const isAtrasada = !a.concluida && a.data < new Date().toISOString().split('T')[0];
            const cliente = clientesCache.find(c=> String(c.id)===String(a.cliente_id));
            const nomeCli = cliente ? cliente.nome : 'Cliente '+a.cliente_id;
            return `<div class="flex items-start gap-3 p-3 rounded-xl border ${isAtrasada ? 'border-amber-200 bg-amber-50' : a.concluida ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}">
                <div class="w-8 h-8 rounded-lg ${a.concluida ? 'bg-emerald-100 text-emerald-600' : isAtrasada ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'} flex items-center justify-center flex-shrink-0"><i data-lucide="calendar" class="w-4 h-4"></i></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2"><span class="text-xs font-bold capitalize">${escaparHTML(a.tipo)}</span><span class="text-[11px] text-slate-400">${formatarData(a.data)}</span>${a.concluida ? '<span class="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">Concluída</span>' : isAtrasada ? '<span class="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full">Atrasada</span>' : ''}</div>
                    <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">${escaparHTML(nomeCli)}</p>
                    ${a.nota ? `<p class="text-xs text-slate-600 mt-1">${escaparHTML(a.nota)}</p>` : ''}
                </div>
                <button onclick="abrirModalDetalhes(${a.cliente_id})" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 text-xs">Ver</button>
            </div>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    } catch(e) { container.innerHTML = '<p class="text-xs text-rose-400">Erro</p>'; }
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
        const qs = (typeof getOrgQS === 'function' ? getOrgQS() : '');
        const response = await fetchAuth(`${API_BASE_URL}/planos${qs}`, { method: 'GET' });
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
        const response = await fetchAuth(`${API_BASE_URL}/etapas${getOrgQuery()}`, { method: 'GET' });
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
    // Atualiza relatórios quando etapas mudam
    carregarRelatorios();
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
    // 4B: se estiver em secao clientes, toggle dentro dela; se em kanban secao, muda secao
    if (secaoAtiva === 'kanban' && mode === 'tabela') { setSecao('clientes'); return; }
    if (secaoAtiva === 'clientes' && mode === 'kanban') { setSecao('kanban'); return; }
    const tabelaMain = document.getElementById('secao-clientes-main') || document.querySelector('main');
    const kanbanBoard = document.getElementById('secao-kanban') || document.getElementById('kanban-board');
    const btnTabela = document.getElementById('btn-view-tabela');
    const btnKanban = document.getElementById('btn-view-kanban');
    if (!tabelaMain || !kanbanBoard) return;
    if (mode === 'kanban') {
        // Se estiver em clientes, mostra kanban dentro de clientes também (compat)
        if (secaoAtiva === 'clientes') tabelaMain.style.display = 'none';
        kanbanBoard.classList.remove('hidden');
        kanbanBoard.style.display = 'flex';
        btnTabela?.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'border');
        btnKanban?.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'border', 'border-slate-200', 'dark:border-slate-600');
        renderizarKanban();
    } else {
        kanbanBoard.classList.add('hidden');
        kanbanBoard.style.display = 'none';
        if (secaoAtiva === 'clientes') tabelaMain.style.display = '';
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
        if (countEl) {
            countEl.textContent = '0 etapas • 0 clientes';
            countEl.classList.remove('hidden');
        }
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
    if (countEl) {
        const totalClientesKanban = clientesCache.length;
        countEl.textContent = `${etapasCache.length} etapas • ${totalClientesKanban} cliente${totalClientesKanban !== 1 ? 's' : ''}`;
        countEl.classList.remove('hidden');
    }
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
                        atualizarMetricas(clientesCache);
                        renderizarKanban();
                        carregarRelatorios();
                    } else if (!modoDemo) {
                        exibirToast('Erro ao mover card', 'erro');
                        renderizarKanban();
                    } else {
                        // modoDemo fallback já atualizou localmente
                        const idx2 = clientesCache.findIndex(c => String(c.id)===String(clienteId));
                        if (idx2 !== -1) clientesCache[idx2].etapa_id = newEtapaId || null;
                        atualizarMetricas(clientesCache);
                        renderizarKanban();
                        carregarRelatorios();
                    }
                } catch (e) {
                    const idx = clientesCache.findIndex(c => String(c.id)===String(clienteId));
                    if (idx !== -1) clientesCache[idx].etapa_id = newEtapaId || null;
                    atualizarMetricas(clientesCache);
                    renderizarKanban();
                    carregarRelatorios();
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
function abrirModalEtapas() { if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode gerenciar etapas', 'erro'); return; } renderizarListaEtapasGerenciamento(); resetarFormEtapa(); abrirModal('modal-etapas'); }
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
            const url = id ? `${API_BASE_URL}/etapas/${id}` : `${API_BASE_URL}/etapas${getOrgQuery()}`;
            const method = id ? 'PATCH' : 'POST';
            const resp = await fetchAuth(url, { method, body: JSON.stringify(payload) });
            if (!resp) return;
            if (resp.status === 403) { const err = await resp.json().catch(()=>({detail:'Apenas admin pode realizar esta ação'})); exibirToast(err.detail || 'Apenas admin pode gerenciar etapas', 'erro'); throw new Error(err.detail); }
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
                if (resp.status === 403) { const err = await resp.json().catch(()=>({detail:'Apenas admin pode realizar esta ação'})); exibirToast(err.detail || 'Apenas admin pode excluir etapas', 'erro'); throw new Error(err.detail); }
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
        const resp = await fetchAuth(`${API_BASE_URL}/tags${getOrgQuery()}`, { method: 'GET' });
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
function abrirModalTags() { if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode gerenciar tags', 'erro'); return; } renderizarListaTagsGerenciamento(); resetarFormTag(); abrirModal('modal-tags'); }
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
            const url = id ? `${API_BASE_URL}/tags/${id}` : `${API_BASE_URL}/tags${getOrgQuery()}`;
            const method = id ? 'PATCH' : 'POST';
            const resp = await fetchAuth(url, { method, body: JSON.stringify(payload) });
            if (!resp) return;
            if (resp.status === 403) { const err = await resp.json().catch(()=>({detail:'Apenas admin pode gerenciar tags'})); exibirToast(err.detail || 'Apenas admin pode gerenciar tags', 'erro'); throw new Error(err.detail); }
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
                if (resp.status === 403) { const err = await resp.json().catch(()=>({detail:'Apenas admin pode gerenciar tags'})); exibirToast(err.detail || 'Apenas admin pode excluir tags', 'erro'); throw new Error(err.detail); }
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
        const resp = await fetchAuth(`${API_BASE_URL}/filtros${getOrgQuery()}`, { method: 'GET' });
        if (!resp) return;
        if (resp.ok) filtrosCache = await resp.json();
        else filtrosCache = [];
    } catch(e) { filtrosCache = []; }
    renderizarFiltrosSalvos();
}
function renderizarFiltrosSalvos() {
    const container = document.getElementById('lista-filtros-salvos');
    const badge = document.getElementById('filtros-count-badge');
    if (badge) {
        if (filtrosCache.length > 0) {
            badge.textContent = filtrosCache.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    if (!container) return;
    container.innerHTML = '';
    if (filtrosCache.length===0) {
        container.innerHTML = '<div class="text-center py-6"><p class="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhum filtro salvo</p><p class="text-xs text-slate-400 mt-1">Dica: ajuste busca/plano/status/etapa/tag na toolbar e clique “Salvar atual”.</p></div>';
        if (window.lucide) lucide.createIcons();
        return;
    }
    filtrosCache.forEach(f => {
        const q = f.query || {};
        const parts = [];
        if (q.termo) parts.push(`“${q.termo}”`);
        if (q.plano) {
            const p = planosCache.find(x => String(x.id)===String(q.plano));
            parts.push(p ? p.nome : q.plano);
        }
        if (q.status) parts.push(q.status==='ativo'?'Ativos':'Inativos');
        if (q.etapa) {
            const e = etapasCache.find(x => String(x.id)===String(q.etapa));
            parts.push(e ? e.nome : (q.etapa==='__sem_etapa__'?'Sem etapa':q.etapa));
        }
        if (q.tag) {
            const t = tagsCache.find(x => String(x.id)===String(q.tag));
            parts.push(t ? `#${t.nome}` : q.tag);
        }
        const resumo = parts.length ? parts.join(' · ') : 'Sem filtros (todos)';
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 gap-3';
        div.innerHTML = `<div class="min-w-0">
            <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${escaparHTML(f.nome)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${escaparHTML(resumo)}</p>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
            <button onclick="aplicarFiltroSalvo('${f.id}')" class="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30" title="Aplicar filtro"><i data-lucide="play" class="w-3.5 h-3.5"></i></button>
            <button onclick="deletarFiltroSalvo('${f.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Excluir"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
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
            const resp = await fetchAuth(`${API_BASE_URL}/filtros${getOrgQuery()}`, { method: 'POST', body: JSON.stringify({ nome, query }) });
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
            const resp = await fetchAuth(`${API_BASE_URL}/atividades${getOrgQuery()}`, { method: 'POST', body: JSON.stringify(payload) });
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
            try { const r = await fetchAuth(`${API_BASE_URL}/atividades${getOrgQuery()}`, { method: 'GET' }); if (r && r.ok) atividadesCache = await r.json(); } catch(e) {}
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
                    // Normaliza keys para lower, remove BOM e acentos básicos para compatibilidade com export
                    const norm = {};
                    Object.keys(row).forEach(k => {
                        const key = k.trim().toLowerCase().replace(/\uFEFF/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        norm[key] = row[k];
                    });
                    // Helper para pegar primeiro valor existente entre várias chaves possíveis
                    const pick = (...keys) => {
                        for (const kk of keys) {
                            const v = norm[kk];
                            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
                        }
                        return '';
                    };
                    const statusRaw = pick('status', 'ativo', 'situacao');
                    let ativo = true;
                    if (statusRaw) {
                        const s = statusRaw.toLowerCase();
                        if (s === 'inativo' || s === 'false' || s === '0' || s === 'inativo' || s.includes('inativo')) ativo = false;
                        else if (s === 'ativo' || s === 'true' || s === '1') ativo = true;
                    }
                    return {
                        nome: pick('nome', 'name'),
                        email: pick('email', 'e-mail'),
                        telefone: pick('telefone', 'phone', 'celular', 'whatsapp'),
                        cpf: pick('cpf'),
                        rg: pick('rg'),
                        empresa: pick('empresa', 'company'),
                        cargo: pick('cargo', 'funcao', 'função'),
                        data_nascimento: pick('data nascimento', 'data_nascimento', 'nascimento', 'datanascimento'),
                        genero: pick('genero', 'gênero', 'sexo'),
                        cep: pick('cep', 'codigo postal'),
                        logradouro: pick('logradouro', 'rua', 'endereco', 'endereço'),
                        numero: pick('numero', 'número', 'num'),
                        complemento: pick('complemento'),
                        bairro: pick('bairro'),
                        cidade: pick('cidade', 'municipio', 'município'),
                        estado: pick('estado', 'uf', 'estado'),
                        observacoes: pick('observacoes', 'observações', 'obs', 'notas'),
                        plano: pick('plano', 'plan') || 'basico',
                        ativo: ativo
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
            const headers = json[0].map(h => String(h).trim().toLowerCase().replace(/\uFEFF/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
            const rows = json.slice(1, 1001);
            importPreviewData = rows.map(row => {
                const obj = {};
                headers.forEach((h,i) => obj[h] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '');
                const pick = (...keys) => {
                    for (const kk of keys) {
                        const kNorm = kk.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        const v = obj[kNorm];
                        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
                    }
                    return '';
                };
                const statusRaw = pick('status', 'ativo', 'situacao');
                let ativo = true;
                if (statusRaw) {
                    const s = statusRaw.toLowerCase();
                    if (s === 'inativo' || s === 'false' || s === '0' || s.includes('inativo')) ativo = false;
                    else if (s === 'ativo' || s === 'true' || s === '1') ativo = true;
                }
                return {
                    nome: pick('nome', 'name'),
                    email: pick('email', 'e-mail'),
                    telefone: pick('telefone', 'phone', 'celular'),
                    cpf: pick('cpf'),
                    rg: pick('rg'),
                    empresa: pick('empresa', 'company'),
                    cargo: pick('cargo', 'funcao'),
                    data_nascimento: pick('data nascimento', 'data_nascimento', 'nascimento'),
                    genero: pick('genero', 'sexo'),
                    cep: pick('cep'),
                    logradouro: pick('logradouro', 'rua', 'endereco'),
                    numero: pick('numero', 'num'),
                    complemento: pick('complemento'),
                    bairro: pick('bairro'),
                    cidade: pick('cidade', 'municipio'),
                    estado: pick('estado', 'uf'),
                    observacoes: pick('observacoes', 'obs', 'notas'),
                    plano: pick('plano', 'plan') || 'basico',
                    ativo: ativo
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
                if (data.planos_criados && data.planos_criados.length) {
                    exibirToast(`Planos criados: ${data.planos_criados.join(', ')}`, 'sucesso');
                    await carregarPlanos();
                }
                if (data.erros && data.erros.length > 0) {
                    console.warn('Import erros', data.erros);
                    const detalhes = data.erros.slice(0,3).map(e => `Linha ${e.linha}: ${e.erro.slice(0,120)}`).join('<br>');
                    const mais = data.erros.length > 3 ? `<br><span class="text-xs">+${data.erros.length-3} erros (ver console F12)</span>` : '';
                    const isDup = data.erros.some(e => String(e.erro).includes('23505') || String(e.erro).toLowerCase().includes('duplicate'));
                    const hintDup = isDup ? '<br><span class="text-xs font-bold text-amber-700 dark:text-amber-300">Dica: e-mail já existe. Rode supabase_fix_email_unique.sql se ainda não rodou.</span>' : '';
                    const planosInfo = data.planos_criados?.length ? `<br><span class="text-xs font-semibold text-emerald-700">Planos criados: ${data.planos_criados.join(', ')}</span>` : '';
                    resultDiv.className = data.sucessos > 0 ? 'p-3 rounded-xl border text-sm bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300' : 'p-3 rounded-xl border text-sm bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300';
                    resultDiv.innerHTML = `${data.sucessos > 0 ? '⚠️' : '❌'} ${data.sucessos}/${data.total} importados. ${data.erros.length} erro(s):<br><span class="text-xs">${detalhes}${mais}${hintDup}${planosInfo}</span>`;
                } else {
                    const planosInfo = data.planos_criados?.length ? `<br><span class="text-xs">Planos criados: ${data.planos_criados.join(', ')}</span>` : '';
                    resultDiv.className = 'p-3 rounded-xl border text-sm bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';
                    resultDiv.innerHTML = `✅ ${data.sucessos}/${data.total} importados.${planosInfo}`;
                }
                resultDiv.classList.remove('hidden');
                exibirToast(`${data.sucessos} clientes importados!${data.planos_criados?.length ? ` Planos: ${data.planos_criados.join(', ')}` : ''}${data.erros?.length ? ` (${data.erros.length} erros)` : ''}`, data.sucessos > 0 ? 'sucesso' : 'erro');
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
        const response = await fetchAuth(`${API_BASE_URL}/clientes${getOrgQuery()}`, { method: 'GET' });
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
            const rAtv = await fetchAuth(`${API_BASE_URL}/atividades${getOrgQuery()}`, { method: 'GET' });
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

    // Churn header (global simples) — será sobrescrito por carregarRelatorioChurn com média mensal
    const churnEl = document.getElementById('metric-churn');
    if (churnEl) {
        const c = total > 0 ? (inativos / total * 100) : 0;
        churnEl.textContent = `${Number(c.toFixed(1))}%`;
    }
    // LTV header fallback — será sobrescrito por carregarRelatorioLtv
    const ltvHeaderEl = document.getElementById('metric-ltv');
    if (ltvHeaderEl && total === 0) ltvHeaderEl.textContent = 'R$ 0';

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
    // Atualiza relatórios se já carregados (mantém período selecionado)
    if (document.getElementById('chart-conversao')) {
        // debounce para não floodar API em cada métrica
        clearTimeout(window._relatorioDebounce);
        window._relatorioDebounce = setTimeout(() => carregarRelatorios(), 300);
    }
}

// ============================================================
// 5B. FASE 2A — RELATÓRIO CONVERSÃO POR ETAPA
// ============================================================
let chartConversao = null;
async function carregarRelatorioConversao() {
    const canvas = document.getElementById('chart-conversao');
    const tabelaEl = document.getElementById('relatorio-conversao-tabela');
    const totalEl = document.getElementById('relatorio-conversao-total');
    if (!canvas) return;
    const periodo = document.getElementById('relatorio-periodo')?.value || '';
    const qs = getOrgQS(periodo ? `?periodo=${periodo}` : '');
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/relatorios/conversao${qs}`, { method: 'GET' });
        if (!resp || !resp.ok) {
            if (tabelaEl) tabelaEl.innerHTML = '<p class="text-xs text-slate-400 text-center col-span-3">Sem dados para o período</p>';
            if (totalEl) totalEl.textContent = '';
            return;
        }
        const data = await resp.json();
        renderizarRelatorioConversao(data);
    } catch (e) {
        console.warn('Erro ao carregar relatório conversão', e);
        if (tabelaEl) tabelaEl.innerHTML = '<p class="text-xs text-rose-400 text-center col-span-3">Erro ao carregar</p>';
    }
}
function renderizarRelatorioConversao(data) {
    const canvas = document.getElementById('chart-conversao');
    const tabelaEl = document.getElementById('relatorio-conversao-tabela');
    const totalEl = document.getElementById('relatorio-conversao-total');
    if (!canvas || !data || !data.itens) return;
    // Destrói chart anterior
    if (chartConversao) {
        try { chartConversao.destroy(); } catch(e) {}
        chartConversao = null;
    }
    const labels = data.itens.map(i => i.etapa_nome);
    const counts = data.itens.map(i => i.count);
    const percents = data.itens.map(i => i.percent);
    const bgColors = data.itens.map(i => {
        const cor = i.etapa_cor || 'slate';
        const mapa = MAPA_CORES_PLANO[cor] || MAPA_CORES_PLANO.slate;
        // Extrai cor do dot (bg-indigo-500 -> #6366f1 aproximado)
        const corMap = { indigo: '#6366f1', cyan: '#06b6d4', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', purple: '#a855f7', slate: '#64748b', orange: '#f97316' };
        return corMap[cor] || '#64748b';
    });
    const borderColors = bgColors;
    // Verifica Chart.js carregado (CDN)
    if (typeof Chart === 'undefined') {
        if (tabelaEl) tabelaEl.innerHTML = '<p class="text-xs text-amber-600 text-center col-span-3">Chart.js não carregado</p>';
        return;
    }
    const ctx = canvas.getContext('2d');
    chartConversao = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Clientes',
                data: counts,
                backgroundColor: bgColors.map(c => c + 'CC'),
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 8,
                maxBarThickness: 48
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const idx = ctx.dataIndex;
                            return `${counts[idx]} clientes (${percents[idx]}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', font: { size: 10 } },
                    grid: { color: document.documentElement.classList.contains('dark') ? '#1e293b' : '#f1f5f9' }
                },
                y: {
                    ticks: { color: document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#334155', font: { size: 11, weight: '600' } },
                    grid: { display: false }
                }
            }
        }
    });
    // Tabela resumo abaixo do gráfico
    if (tabelaEl) {
        tabelaEl.innerHTML = data.itens.map(i => {
            const estilo = MAPA_CORES_PLANO[i.etapa_cor] || MAPA_CORES_PLANO.slate;
            return `<div class="flex items-center justify-between p-2.5 rounded-xl border ${estilo.border} ${estilo.bg}">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full ${estilo.dot} flex-shrink-0"></span>
                    <span class="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">${escaparHTML(i.etapa_nome)}</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-black tabular-nums ${estilo.text}">${i.count}</span>
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/30 ${estilo.text}">${i.percent}%</span>
                </div>
            </div>`;
        }).join('');
    }
    if (totalEl) totalEl.textContent = `Total: ${data.total} cliente(s)${document.getElementById('relatorio-periodo')?.value ? ` • últimos ${document.getElementById('relatorio-periodo').value} dias` : ''}`;
    if (window.lucide) lucide.createIcons();
}
async function carregarRelatorios() {
    await Promise.all([carregarRelatorioConversao(), carregarRelatorioReceita(), carregarRelatorioChurn(), carregarRelatorioLtv()]);
}
let chartReceitaPlano = null;
let chartReceitaMes = null;
async function carregarRelatorioReceita() {
    const canvasPlano = document.getElementById('chart-receita-plano');
    const canvasMes = document.getElementById('chart-receita-mes');
    const totalEl = document.getElementById('relatorio-receita-total');
    if (!canvasPlano && !canvasMes) return;
    const periodo = document.getElementById('relatorio-periodo')?.value || '';
    const qs = getOrgQS(periodo ? `?periodo=${periodo}` : '');
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/relatorios/receita${qs}`, { method: 'GET' });
        if (!resp || !resp.ok) {
            if (totalEl) totalEl.textContent = 'R$ 0';
            return;
        }
        const data = await resp.json();
        renderizarRelatorioReceita(data);
    } catch (e) {
        console.warn('Erro ao carregar relatório receita', e);
        if (totalEl) totalEl.textContent = 'R$ 0';
    }
}
function renderizarRelatorioReceita(data) {
    const canvasPlano = document.getElementById('chart-receita-plano');
    const canvasMes = document.getElementById('chart-receita-mes');
    const totalEl = document.getElementById('relatorio-receita-total');
    const tabelaPlanoEl = document.getElementById('relatorio-receita-plano-tabela');
    const tabelaMesEl = document.getElementById('relatorio-receita-mes-tabela');
    if (!data) return;
    const totalFmt = `R$ ${Number(data.total_receita || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (totalEl) totalEl.textContent = totalFmt;
    if (typeof Chart === 'undefined') return;
    // Por plano - doughnut
    if (canvasPlano) {
        if (chartReceitaPlano) { try { chartReceitaPlano.destroy(); } catch(e) {} chartReceitaPlano = null; }
        const labels = data.por_plano.map(p => p.plano_nome);
        const vals = data.por_plano.map(p => p.total);
        const corMap = { indigo: '#6366f1', cyan: '#06b6d4', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', purple: '#a855f7', slate: '#64748b', orange: '#f97316' };
        const bg = data.por_plano.map(p => (corMap[p.plano_cor] || '#64748b') + 'CC');
        if (labels.length === 0) {
            const ctx = canvasPlano.getContext('2d');
            ctx.clearRect(0,0,canvasPlano.width, canvasPlano.height);
            if (tabelaPlanoEl) tabelaPlanoEl.innerHTML = '<p class="text-xs text-slate-400 text-center">Sem receita em dia</p>';
        } else {
            const ctx = canvasPlano.getContext('2d');
            chartReceitaPlano = new Chart(ctx, {
                type: 'doughnut',
                data: { labels, datasets: [{ data: vals, backgroundColor: bg, borderWidth: 2, borderColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff' }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#334155', font: { size: 10 }, padding: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: R$ ${Number(c.parsed).toLocaleString('pt-BR', {minimumFractionDigits:2})}` } } } }
            });
            if (tabelaPlanoEl) {
                tabelaPlanoEl.innerHTML = data.por_plano.map(p => {
                    const estilo = MAPA_CORES_PLANO[p.plano_cor] || MAPA_CORES_PLANO.slate;
                    return `<div class="flex items-center justify-between p-2 rounded-lg border ${estilo.border} ${estilo.bg}"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${estilo.dot}"></span><span class="text-xs font-semibold ${estilo.text}">${escaparHTML(p.plano_nome)}</span><span class="text-[10px] text-slate-500">${p.count} cli • ${p.percent}%</span></div><span class="text-xs font-black ${estilo.text}">R$ ${Number(p.total).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>`;
                }).join('');
            }
        }
    }
    // Por mês - bar
    if (canvasMes) {
        if (chartReceitaMes) { try { chartReceitaMes.destroy(); } catch(e) {} chartReceitaMes = null; }
        const labels = data.por_mes.map(m => m.mes);
        const vals = data.por_mes.map(m => m.total);
        if (labels.length === 0) {
            const ctx = canvasMes.getContext('2d');
            ctx.clearRect(0,0,canvasMes.width, canvasMes.height);
            if (tabelaMesEl) tabelaMesEl.innerHTML = '<p class="text-xs text-slate-400 text-center">Sem dados por mês</p>';
        } else {
            const ctx = canvasMes.getContext('2d');
            chartReceitaMes = new Chart(ctx, {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Receita', data: vals, backgroundColor: '#10b981CC', borderColor: '#10b981', borderWidth: 1.5, borderRadius: 6 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` R$ ${Number(c.parsed.y).toLocaleString('pt-BR', {minimumFractionDigits:2})}` } } }, scales: { x: { ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', callback: (v) => `R$ ${v}` }, grid: { color: document.documentElement.classList.contains('dark') ? '#1e293b' : '#f1f5f9' } } } }
            });
            if (tabelaMesEl) {
                tabelaMesEl.innerHTML = data.por_mes.map(m => `<div class="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><span class="text-xs font-medium text-slate-600 dark:text-slate-300">${escaparHTML(m.mes)}</span><span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">R$ ${Number(m.total).toLocaleString('pt-BR', {minimumFractionDigits:2})} <span class="text-[10px] font-normal text-slate-400">(${m.count})</span></span></div>`).join('');
            }
        }
    }
    if (window.lucide) lucide.createIcons();
}
let chartChurn = null;
let chartChurnPlano = null;
async function carregarRelatorioChurn() {
    const canvas = document.getElementById('chart-churn');
    const totalEl = document.getElementById('relatorio-churn-total');
    if (!canvas) return;
    const periodo = document.getElementById('relatorio-periodo')?.value || '';
    const qs = getOrgQS(periodo ? `?periodo=${periodo}` : '');
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/relatorios/churn${qs}`, { method: 'GET' });
        if (!resp || !resp.ok) {
            if (totalEl) totalEl.textContent = '0%';
            return;
        }
        const data = await resp.json();
        renderizarRelatorioChurn(data);
    } catch (e) {
        console.warn('Erro ao carregar relatório churn', e);
        if (totalEl) totalEl.textContent = '0%';
    }
}
function renderizarRelatorioChurn(data) {
    const canvas = document.getElementById('chart-churn');
    const canvasPlano = document.getElementById('chart-churn-plano');
    const totalEl = document.getElementById('relatorio-churn-total');
    const tabelaEl = document.getElementById('relatorio-churn-tabela');
    const tabelaPlanoEl = document.getElementById('relatorio-churn-plano-tabela');
    const footerEl = document.getElementById('relatorio-churn-footer');
    const churnHeaderEl = document.getElementById('metric-churn');
    if (!canvas || !data) return;
    if (totalEl) totalEl.textContent = `${Number(data.churn_medio || 0).toFixed(1)}%`;
    if (churnHeaderEl) churnHeaderEl.textContent = `${Number(data.churn_medio || 0).toFixed(1)}%`;
    if (footerEl) footerEl.textContent = `${data.total_inativos || 0} inativos de ${data.total_geral || 0} • média ${Number(data.churn_medio || 0).toFixed(1)}%${document.getElementById('relatorio-periodo')?.value ? ` • últimos ${document.getElementById('relatorio-periodo').value} dias` : ''}`;
    if (typeof Chart === 'undefined') return;
    if (chartChurn) { try { chartChurn.destroy(); } catch(e) {} chartChurn = null; }
    if (chartChurnPlano) { try { chartChurnPlano.destroy(); } catch(e) {} chartChurnPlano = null; }
    // Por mês - line
    const labels = (data.itens || []).map(i => i.mes);
    const vals = (data.itens || []).map(i => i.churn_percent);
    if (labels.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,canvas.width, canvas.height);
        if (tabelaEl) tabelaEl.innerHTML = '<p class="text-xs text-slate-400 text-center">Sem dados por mês</p>';
    } else {
        const ctx = canvas.getContext('2d');
        chartChurn = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Churn %', data: vals, borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.12)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#f43f5e', pointBorderColor: '#fff', pointBorderWidth: 1.5 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y}% — ${data.itens[c.dataIndex].inativos} de ${data.itens[c.dataIndex].total} cancelaram` } } }, scales: { x: { ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', font: { size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, max: 100, ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', callback: (v) => `${v}%` }, grid: { color: document.documentElement.classList.contains('dark') ? '#1e293b' : '#f1f5f9' } } } }
        });
        if (tabelaEl) {
            tabelaEl.innerHTML = data.itens.map(i => `<div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40"><span class="text-xs font-medium text-slate-600 dark:text-slate-300">${escaparHTML(i.mes)}</span><span class="text-xs font-bold ${i.churn_percent > 20 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}">${i.churn_percent}% <span class="text-[10px] font-normal text-slate-400">(${i.inativos} de ${i.total} cancelaram)</span></span></div>`).join('');
        }
    }
    // Por plano - doughnut churn%
    if (canvasPlano) {
        const porPlano = data.por_plano || [];
        if (porPlano.length === 0) {
            const ctx = canvasPlano.getContext('2d');
            ctx.clearRect(0,0,canvasPlano.width, canvasPlano.height);
            if (tabelaPlanoEl) tabelaPlanoEl.innerHTML = '<p class="text-xs text-slate-400 text-center">Sem dados por plano</p>';
        } else {
            const corMap = { indigo: '#6366f1', cyan: '#06b6d4', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', purple: '#a855f7', slate: '#64748b', orange: '#f97316' };
            const labelsPlano = porPlano.map(p => p.plano_nome);
            const valsPlano = porPlano.map(p => p.churn_percent);
            const bg = porPlano.map(p => (corMap[p.plano_cor] || '#64748b') + 'CC');
            const ctx = canvasPlano.getContext('2d');
            chartChurnPlano = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: labelsPlano, datasets: [{ data: valsPlano, backgroundColor: bg, borderWidth: 2, borderColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff' }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#334155', font: { size: 10 }, padding: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${porPlano[c.dataIndex].inativos} de ${porPlano[c.dataIndex].total} cancelaram — ${c.parsed}%` } } } }
            });
            if (tabelaPlanoEl) {
                tabelaPlanoEl.innerHTML = porPlano.map(p => {
                    const estilo = MAPA_CORES_PLANO[p.plano_cor] || MAPA_CORES_PLANO.slate;
                    return `<div class="flex items-center justify-between p-2 rounded-lg border ${estilo.border} ${estilo.bg}"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${estilo.dot}"></span><span class="text-xs font-semibold ${estilo.text}">${escaparHTML(p.plano_nome)}</span><span class="text-[10px] text-slate-500">${p.inativos} de ${p.total} cancelaram</span></div><span class="text-xs font-black ${p.churn_percent > 30 ? 'text-rose-600 dark:text-rose-400' : estilo.text}">${p.churn_percent}%</span></div>`;
                }).join('');
            }
        }
    }
    if (window.lucide) lucide.createIcons();
}
let chartLtvPlano = null;
async function carregarRelatorioLtv() {
    const canvas = document.getElementById('chart-ltv-plano');
    const totalEl = document.getElementById('relatorio-ltv-total');
    if (!canvas) return;
    const periodo = document.getElementById('relatorio-periodo')?.value || '';
    const qs = getOrgQS(periodo ? `?periodo=${periodo}` : '');
    try {
        const resp = await fetchAuth(`${API_BASE_URL}/relatorios/ltv${qs}`, { method: 'GET' });
        if (!resp || !resp.ok) {
            if (totalEl) totalEl.textContent = 'R$ 0';
            return;
        }
        const data = await resp.json();
        renderizarRelatorioLtv(data);
    } catch (e) {
        console.warn('Erro ao carregar relatório LTV', e);
        if (totalEl) totalEl.textContent = 'R$ 0';
    }
}
function renderizarRelatorioLtv(data) {
    const canvas = document.getElementById('chart-ltv-plano');
    const totalEl = document.getElementById('relatorio-ltv-total');
    const tabelaEl = document.getElementById('relatorio-ltv-plano-tabela');
    const detalheEl = document.getElementById('relatorio-ltv-detalhe');
    const footerEl = document.getElementById('relatorio-ltv-footer');
    const headerEl = document.getElementById('metric-ltv');
    if (!data) return;
    const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (totalEl) totalEl.textContent = fmt(data.ltv_medio_geral);
    if (headerEl) headerEl.textContent = Number(data.ltv_medio_geral || 0) >= 1000 ? `R$ ${(Number(data.ltv_medio_geral)/1000).toFixed(1)}k` : fmt(data.ltv_medio_geral);
    if (headerEl) headerEl.title = `${fmt(data.ltv_medio_geral)} médio • ${data.meses_medio_geral} meses • ${fmt(data.valor_medio_mensal_geral)}/mês`;
    if (footerEl) footerEl.textContent = `${data.total_clientes || 0} clientes • ${fmt(data.receita_estimada_total)} estimado • ${data.meses_medio_geral} meses médio${document.getElementById('relatorio-periodo')?.value ? ` • últimos ${document.getElementById('relatorio-periodo').value} dias` : ''}`;
    if (typeof Chart === 'undefined') return;
    if (chartLtvPlano) { try { chartLtvPlano.destroy(); } catch(e) {} chartLtvPlano = null; }
    const porPlano = data.por_plano || [];
    if (!canvas) return;
    if (porPlano.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,canvas.width, canvas.height);
        if (tabelaEl) tabelaEl.innerHTML = '<p class="text-xs text-slate-400 text-center">Sem dados por plano</p>';
        if (detalheEl) detalheEl.innerHTML = '';
        return;
    }
    const corMap = { indigo: '#6366f1', cyan: '#06b6d4', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', purple: '#a855f7', slate: '#64748b', orange: '#f97316', violet: '#8b5cf6' };
    const labels = porPlano.map(p => p.plano_nome);
    const vals = porPlano.map(p => p.ltv_medio);
    const bg = porPlano.map(p => (corMap[p.plano_cor] || '#8b5cf6') + 'CC');
    const ctx = canvas.getContext('2d');
    chartLtvPlano = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'LTV médio', data: vals, backgroundColor: bg, borderColor: porPlano.map(p => corMap[p.plano_cor] || '#8b5cf6'), borderWidth: 1.5, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt(c.parsed.x)} (${porPlano[c.dataIndex].meses_medio}m × ${fmt(porPlano[c.dataIndex].valor_medio_mensal)}/mês)` } } }, scales: { x: { beginAtZero: true, ticks: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', callback: (v) => `R$ ${v}` }, grid: { color: document.documentElement.classList.contains('dark') ? '#1e293b' : '#f1f5f9' } }, y: { ticks: { color: document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#334155', font: { size: 11, weight: '600' } }, grid: { display: false } } } }
    });
    if (tabelaEl) {
        tabelaEl.innerHTML = porPlano.map(p => {
            const estilo = MAPA_CORES_PLANO[p.plano_cor] || MAPA_CORES_PLANO.slate;
            return `<div class="flex items-center justify-between p-2 rounded-lg border ${estilo.border} ${estilo.bg}"><div class="flex items-center gap-2 min-w-0"><span class="w-2 h-2 rounded-full ${estilo.dot}"></span><span class="text-xs font-semibold ${estilo.text} truncate">${escaparHTML(p.plano_nome)}</span><span class="text-[10px] text-slate-500">${p.count} cli</span></div><div class="text-right"><div class="text-xs font-black ${estilo.text}">${fmt(p.ltv_medio)}</div><div class="text-[10px] text-slate-400">${p.meses_medio}m × ${fmt(p.valor_medio_mensal)}</div></div></div>`;
        }).join('');
    }
    if (detalheEl) {
        detalheEl.innerHTML = `<div class="grid grid-cols-2 gap-2"><div class="p-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 text-center"><div class="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">LTV médio</div><div class="text-lg font-black text-violet-600 dark:text-violet-400">${fmt(data.ltv_medio_geral)}</div><div class="text-[10px] text-slate-500">${data.meses_medio_geral}m × ${fmt(data.valor_medio_mensal_geral)}</div></div><div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/40 text-center"><div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Receita estimada</div><div class="text-lg font-black text-slate-700 dark:text-slate-200">${fmt(data.receita_estimada_total)}</div><div class="text-[10px] text-slate-500">${data.total_clientes} clientes</div></div></div><div class="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-200"><i data-lucide="info" class="w-3 h-3 inline mr-1"></i> LTV = valor × meses desde cadastro (coorte). Valor com vírgula BR parseado.</div>`;
    }
    if (window.lucide) lucide.createIcons();
}
function toggleRelatoriosSection() {
    const content = document.getElementById('relatorios-content');
    const chevron = document.getElementById('relatorios-chevron');
    if (!content) return;
    const isHidden = content.classList.toggle('hidden');
    if (chevron) chevron.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
    localStorage.setItem('relatorios_collapsed', isHidden ? '1' : '0');
    // Se expandiu, redimensiona charts
    if (!isHidden) {
        setTimeout(() => {
            if (chartConversao) try { chartConversao.resize(); } catch(e) {}
            if (chartReceitaPlano) try { chartReceitaPlano.resize(); } catch(e) {}
            if (chartReceitaMes) try { chartReceitaMes.resize(); } catch(e) {}
            if (chartChurn) try { chartChurn.resize(); } catch(e) {}
            if (chartChurnPlano) try { chartChurnPlano.resize(); } catch(e) {}
            if (chartLtvPlano) try { chartLtvPlano.resize(); } catch(e) {}
        }, 100);
    }
}
function toggleRelatorioSub(tipo) {
    const content = document.getElementById(`relatorio-${tipo}-content`);
    const chevron = document.getElementById(`relatorio-${tipo}-chevron`);
    if (!content) return;
    const isHidden = content.classList.toggle('hidden');
    if (chevron) chevron.style.transform = isHidden ? 'rotate(-90deg)' : 'rotate(0deg)';
    localStorage.setItem(`relatorio_${tipo}_collapsed`, isHidden ? '1' : '0');
    if (!isHidden) {
        setTimeout(() => {
            if (tipo === 'conversao' && chartConversao) try { chartConversao.resize(); } catch(e) {}
            if (tipo === 'receita') {
                if (chartReceitaPlano) try { chartReceitaPlano.resize(); } catch(e) {}
                if (chartReceitaMes) try { chartReceitaMes.resize(); } catch(e) {}
            }
            if (tipo === 'churn') { if (chartChurn) try { chartChurn.resize(); } catch(e) {} if (chartChurnPlano) try { chartChurnPlano.resize(); } catch(e) {} }
            if (tipo === 'ltv' && chartLtvPlano) try { chartLtvPlano.resize(); } catch(e) {}
        }, 100);
    }
}
function restaurarEstadoRelatorios() {
    const collapsed = localStorage.getItem('relatorios_collapsed') !== '0';
    const content = document.getElementById('relatorios-content');
    const chevron = document.getElementById('relatorios-chevron');
    if (content) {
        if (collapsed) {
            content.classList.add('hidden');
            if (chevron) chevron.style.transform = 'rotate(-90deg)';
        } else {
            content.classList.remove('hidden');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    }
    ['conversao','receita','churn','ltv'].forEach(tipo => {
        const c = document.getElementById(`relatorio-${tipo}-content`);
        const ch = document.getElementById(`relatorio-${tipo}-chevron`);
        const col = localStorage.getItem(`relatorio_${tipo}_collapsed`) !== '0';
        if (c) {
            if (col) {
                c.classList.add('hidden');
                if (ch) ch.style.transform = 'rotate(-90deg)';
            } else {
                c.classList.remove('hidden');
                if (ch) ch.style.transform = 'rotate(0deg)';
            }
        }
    });
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

    aplicarVertical(currentVertical);
    // garante 1 carro para oficina
    if (currentVertical === 'lava_rapido_oficina') {
        const cont=document.getElementById('criar-carros-container');
        if(cont && cont.children.length===0) adicionarCarro('criar');
    }
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
        data_cadastro:   new Date().toISOString().split('T')[0],
        campos_custom:   coletarCamposCustom('criar')
    };

    console.log('[4A] salvarNovoCliente payload', JSON.stringify(novoCliente).slice(0,500));
    console.log('[4A] campos_custom', novoCliente.campos_custom);
    setButtonLoading(btnSubmit, true, 'Cadastrando...');

    try {
        if (!modoDemo) {
            const response = await fetchAuth(`${API_BASE_URL}/clientes${getOrgQuery()}`, {
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
    // 4A: garante vertical campos renderizados antes de preencher
    aplicarVertical(currentVertical);

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
        campos_custom:   coletarCamposCustom('editar'),
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

    // Carrega anexos (Fase 3C)
    carregarAnexos(cliente.id);
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

    // 4A: mostra campos_custom no detalhes
    if (cliente.campos_custom && Object.keys(cliente.campos_custom).length) {
        const cc = cliente.campos_custom;
        let ccHtml = '<div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60"><h4 class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Vertical — ' + escaparHTML(currentVertical) + '</h4><div class="grid grid-cols-2 gap-2 text-xs">';
        for (const [k,v] of Object.entries(cc)) {
            if (Array.isArray(v)) {
                ccHtml += `<div class="col-span-2"><span class="text-slate-400">${escaparHTML(k)}:</span> <strong class="text-slate-800 dark:text-slate-200">${v.map(x=> escaparHTML((x.placa||'')+' '+(x.modelo||'')+(x.km?' ('+x.km+'km)':''))).join(' • ')}</strong></div>`;
            } else {
                ccHtml += `<div><span class="text-slate-400">${escaparHTML(k)}:</span> <strong class="text-slate-800 dark:text-slate-200">${escaparHTML(String(v))}</strong></div>`;
            }
        }
        ccHtml += '</div></div>';
        // injeta antes do footer de atividades
        const detBody = document.getElementById('detalhes-body');
        if (detBody) {
            const first = detBody.querySelector('div');
            // append at end before atividades
            detBody.insertAdjacentHTML('beforeend', ccHtml);
        }
    }

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
    if (!isCurrentOrgAdmin()) { exibirToast('Apenas admin pode gerenciar planos', 'erro'); return; }
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
            const qs = (typeof getOrgQS === 'function' ? getOrgQS() : '');
            const url    = id ? `${API_BASE_URL}/planos/${id}${qs}` : `${API_BASE_URL}/planos${qs}`;
            const method = id ? 'PATCH' : 'POST';

            const response = await fetchAuth(url, {
                method,
                body: JSON.stringify(payload)
            });
            if (!response) return; // Redirect handled by fetchAuth
            if (response.status === 403) { const err = await response.json().catch(()=>({detail:'Apenas admin pode gerenciar planos'})); exibirToast(err.detail || 'Apenas admin pode gerenciar planos', 'erro'); throw new Error(err.detail); }
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
                if (response.status === 403) { const err = await response.json().catch(()=>({detail:'Apenas admin pode gerenciar planos'})); exibirToast(err.detail || 'Apenas admin pode excluir planos', 'erro'); throw new Error(err.detail); }
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

    const rows = clientesCache.map(c => {
        // Exporta nome do plano em vez de ID "1" para import preservar nome/cor (ex: "Vip" em vez de "1")
        let planoNome = c.plano || '';
        if (planoNome) {
            const p = planosCache.find(x => String(x.id) === String(planoNome));
            if (p) planoNome = p.nome;
        }
        return [
        c.id,
        `"${(c.nome || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        c.ativo ? 'Ativo' : 'Inativo',
        `"${String(planoNome).replace(/"/g, '""')}"`,
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
        ];
    });

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

function mascaraValor(input) {
    // Permite digitar direto sem precisar apagar "R$ 0,00": campo inicia vazio
    // Digitar "200" -> "R$ 200" , "200,5" -> "R$ 200,5" , paste "R$ 1.500,00" -> "R$ 1.500,00" normalizado
    let v = input.value.replace(/[^0-9,]/g, '');
    // só uma vírgula
    const firstComma = v.indexOf(',');
    if (firstComma !== -1) {
        v = v.slice(0, firstComma + 1) + v.slice(firstComma + 1).replace(/,/g, '');
    }
    // limita 2 casas decimais
    if (firstComma !== -1) {
        const dec = v.slice(firstComma + 1);
        if (dec.length > 2) v = v.slice(0, firstComma + 3);
    }
    // limita tamanho total (evita overflow)
    if (v.length > 13) v = v.slice(0, 13);
    // adiciona prefixo R$ apenas se houver dígitos
    input.value = v ? `R$ ${v}` : '';
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
