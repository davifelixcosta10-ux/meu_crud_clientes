// ============================================================
// DaviFlow — App Principal (Dashboard Administrativo v1.4)
// ============================================================

// ============================================================
// CONFIGURAÇÃO DE PLANOS DEFAULT (fallback offline)
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

// MOCK DATA para testes locais / offline quando a API não estiver conectada
const CLIENTES_DEMO = [
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
];

// Detecta automaticamente se está rodando localmente ou na Vercel
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://127.0.0.1:8000/api'
    : `${window.location.origin}/api`;

let clientesCache = [];
let planosCache = [...PLANOS_DEFAULT];
let clienteParaDeletarId = null;
let modoDemo = false;

// Mapa de cores para badges e estilos visuais dos planos
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
// AUTENTICAÇÃO E SESSÃO
// ============================================================
function obterUserId() {
    return localStorage.getItem('df_user_id') || '';
}

function obterAuthHeaders() {
    const token = localStorage.getItem('df_token') || obterUserId();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function salvarSessao(userId, token) {
    localStorage.setItem('df_user_id', userId);
    localStorage.setItem('df_token', token);
}

function encerrarSessao() {
    localStorage.removeItem('df_user_id');
    localStorage.removeItem('df_token');
    window.location.reload();
}

// ============================================================
// INICIALIZAÇÃO
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
    await carregarClientes();
    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 1. TEMA DARK / LIGHT
// ============================================================
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
// 2. STATUS DA API
// ============================================================
async function verificarStatusAPI() {
    const selectors = [
        { badge: 'api-status-badge', dot: 'api-status-dot', text: 'api-status-text' },
        { badge: 'api-status-badge-mobile', dot: 'api-status-dot-mobile', text: 'api-status-text-mobile' },
    ];

    let isOnline = false;
    try {
        const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET' });
        if (res.ok) {
            isOnline = true;
        } else {
            const res2 = await fetch(`${API_BASE_URL}/clientes`, {
                method: 'GET',
                headers: obterAuthHeaders()
            });
            isOnline = res2.ok || res2.status === 200 || res2.status === 401;
        }
    } catch (_) {
        modoDemo = true;
    }

    selectors.forEach(({ badge, dot, text }) => {
        const badgeEl = document.getElementById(badge);
        const dotEl   = document.getElementById(dot);
        const textEl  = document.getElementById(text);
        if (!badgeEl || !dotEl || !textEl) return;

        if (isOnline && !modoDemo) {
            dotEl.className  = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0';
            badgeEl.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-all duration-300';
            textEl.textContent = 'Conectado';
        } else if (modoDemo) {
            dotEl.className  = 'w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0';
            badgeEl.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition-all duration-300';
            textEl.textContent = 'Modo Local (Demo)';
        } else {
            dotEl.className  = 'w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0';
            badgeEl.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-all duration-300';
            textEl.textContent = 'Desconectado';
        }
    });

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// 3. CARREGAR E GERENCIAR PLANOS (API + CACHE)
// ============================================================
async function carregarPlanos() {
    try {
        const response = await fetch(`${API_BASE_URL}/planos`, {
            method: 'GET',
            headers: obterAuthHeaders()
        });

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
// 4. CARREGAR CLIENTES
// ============================================================
async function carregarClientes() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/clientes`, {
            method: 'GET',
            headers: obterAuthHeaders()
        });

        if (!response.ok) throw new Error(`Erro ${response.status}`);
        const data = await response.json();
        clientesCache = data;
        modoDemo = false;
        atualizarMetricas(clientesCache);
        filtrarTabela();
    } catch (error) {
        console.warn('API/Banco offline. Ativando modo de demonstração local:', error);
        modoDemo = true;
        if (clientesCache.length === 0) {
            clientesCache = [...CLIENTES_DEMO];
            exibirToast('Modo Local (Demo) ativado para testes interativos.', 'info');
        }
        atualizarMetricas(clientesCache);
        filtrarTabela();
        verificarStatusAPI();
    } finally {
        mostrarLoading(false);
    }
}

// ============================================================
// 5. MÉTRICAS DADOS
// ============================================================
function atualizarMetricas(clientes) {
    const total    = clientes.length;
    const ativos   = clientes.filter(c => c.ativo).length;
    const inativos = total - ativos;

    const countByPlan = {};
    planosCache.forEach(p => { countByPlan[p.id] = 0; });
    clientes.forEach(c => {
        if (c.plano && countByPlan.hasOwnProperty(c.plano)) {
            countByPlan[c.plano]++;
        }
    });
    const semPlano = clientes.filter(c => !c.plano).length;

    const ativosPct   = total > 0 ? Math.round((ativos   / total) * 100) : 0;
    const inativosPct = total > 0 ? Math.round((inativos / total) * 100) : 0;

    document.getElementById('metric-total').textContent       = total;
    document.getElementById('metric-ativos').textContent      = ativos;
    document.getElementById('metric-inativos').textContent    = inativos;
    document.getElementById('metric-ativos-pct').textContent  = `${ativosPct}%`;
    document.getElementById('metric-inativos-pct').textContent = `${inativosPct}%`;

    const semPlanoEl = document.getElementById('metric-sem-plano');
    if (semPlanoEl) semPlanoEl.textContent = semPlano;
}

// ============================================================
// 6. FILTRAGEM E RENDERIZAÇÃO DA TABELA
// ============================================================
function filtrarTabela() {
    const termo        = document.getElementById('search-input').value.toLowerCase().trim();
    const planoFiltro  = document.getElementById('filter-plano').value;
    const statusFiltro = document.getElementById('filter-status').value;

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

        return matchBusca && matchPlano && matchStatus;
    });

    renderizarClientes(filtrados);
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

    clientes.forEach(cliente => {
        const dataFormatada = formatarData(cliente.data_cadastro);
        const planoBadgeHTML = getPlanoBadgeHTML(cliente.plano);
        const statusBadgeHTML = getStatusBadgeHTML(cliente.ativo, cliente.id);

        // Desktop row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors duration-150 group';
        tr.innerHTML = `
            <td class="py-3 px-5 font-mono text-xs font-semibold text-slate-400 dark:text-slate-500">#${cliente.id}</td>
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
                <span class="text-[11px] text-slate-400 dark:text-slate-500 font-mono">#${cliente.id}</span>
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
// BADGES E FORMATADORES
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
// 7. TOGGLE DE SEÇÕES COLAPSÁVEIS
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
// 8. BUSCA AUTOMÁTICA DE CEP (ViaCEP)
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

        document.getElementById(`${ctx}-logradouro`).value = data.logradouro || '';
        document.getElementById(`${ctx}-bairro`).value     = data.bairro || '';
        document.getElementById(`${ctx}-cidade`).value     = data.localidade || '';
        document.getElementById(`${ctx}-estado`).value     = data.uf || '';

        exibirToast('Endereço preenchido automaticamente via CEP!', 'sucesso');
    } catch (e) {
        console.warn('Erro ao consultar ViaCEP:', e);
    } finally {
        if (icon) icon.className = 'w-4 h-4 text-slate-400';
    }
}

// ============================================================
// 9. MODAL NOVO CLIENTE
// ============================================================
function abrirModalCriar() {
    const form = document.getElementById('form-criar');
    if (form) form.reset();

    const ativoCheckbox = document.getElementById('criar-ativo');
    if (ativoCheckbox) ativoCheckbox.checked = true;

    setPlanoToggle('criar', false);
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
        data_cadastro:   new Date().toISOString().split('T')[0]
    };

    setButtonLoading(btnSubmit, true, 'Cadastrando...');

    try {
        if (!modoDemo) {
            const response = await fetch(`${API_BASE_URL}/clientes`, {
                method: 'POST',
                headers: obterAuthHeaders(),
                body: JSON.stringify(novoCliente),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao criar cliente.`);
            }

            const clienteCriado = await response.json();
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
    clientesCache.unshift(novoCliente);
    atualizarMetricas(clientesCache);
    filtrarTabela();
    exibirToast(`Cliente "${novoCliente.nome}" cadastrado! (Modo Local)`, 'sucesso');
    fecharModalCriar();
    setButtonLoading(btnSubmit, false, 'Cadastrar Cliente');
}

// ============================================================
// 10. MODAL EDITAR CLIENTE
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
    };

    setButtonLoading(btnSubmit, true, 'Salvando...');

    try {
        if (!modoDemo) {
            const response = await fetch(`${API_BASE_URL}/clientes/${id}`, {
                method: 'PATCH',
                headers: obterAuthHeaders(),
                body: JSON.stringify(clienteAtualizado),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao atualizar.`);
            }

            exibirToast(`Cliente #${id} atualizado com sucesso!`, 'sucesso');
            fecharModalEditar();
            setButtonLoading(btnSubmit, false, 'Salvar Alterações');
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Salvando edição em modo local:', error);
        exibirToast(error.message || 'Erro ao comunicar com a API.', 'erro');
    }

    // Fallback Modo Demo Local
    const index = clientesCache.findIndex(c => String(c.id) === String(id));
    if (index !== -1) {
        clientesCache[index] = { ...clientesCache[index], ...clienteAtualizado };
        atualizarMetricas(clientesCache);
        filtrarTabela();
        exibirToast(`Cliente #${id} atualizado! (Modo Local)`, 'sucesso');
    }
    fecharModalEditar();
    setButtonLoading(btnSubmit, false, 'Salvar Alterações');
}

// ============================================================
// 11. TOGGLE RÁPIDO DE STATUS
// ============================================================
async function toggleStatusCliente(id, novoStatus) {
    try {
        if (!modoDemo) {
            const response = await fetch(`${API_BASE_URL}/clientes/${id}`, {
                method: 'PATCH',
                headers: obterAuthHeaders(),
                body: JSON.stringify({ ativo: novoStatus })
            });

            if (!response.ok) throw new Error(`Erro ao alterar status`);

            exibirToast(`Cliente #${id} ${novoStatus ? 'ativado' : 'inativado'}!`, 'sucesso');
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
        exibirToast(`Cliente #${id} ${novoStatus ? 'ativado' : 'inativado'}! (Local)`, 'sucesso');
    }
}

// ============================================================
// 12. MODAL DETALHES DO CLIENTE
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

    body.innerHTML = `
        <div class="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
            <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
                <div class="mt-0.5">${statusHTML}</div>
            </div>
            <div>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plano</span>
                <div class="mt-0.5">${planoHTML}</div>
            </div>
        </div>

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
    `;

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
// 13. MODAL GERENCIAMENTO DE PLANOS
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

            const response = await fetch(url, {
                method,
                headers: obterAuthHeaders(),
                body: JSON.stringify(payload)
            });

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
    if (!confirm('Deseja realmente excluir este plano?')) return;

    try {
        if (!modoDemo) {
            const response = await fetch(`${API_BASE_URL}/planos/${id}`, {
                method: 'DELETE',
                headers: obterAuthHeaders()
            });

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
}

// ============================================================
// 14. EXPORTAÇÃO PARA CSV
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
// 15. RENDERIZAÇÃO DOS CARDS DE SELEÇÃO DE PLANO
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
// 16. VALIDAÇÕES DE FORMULÁRIO
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
// 17. MÁSCARAS DE ENTRADA
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
// 18. UTILITÁRIOS DE MODAL
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
            const response = await fetch(`${API_BASE_URL}/clientes/${id}`, {
                method: 'DELETE',
                headers: obterAuthHeaders()
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao excluir.`);
            }

            exibirToast(`Cliente #${id} removido com sucesso!`, 'sucesso');
            fecharModalDeletar();
            setButtonLoading(btnSubmit, false, 'Excluir Cliente');
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Excluindo em modo local:', error);
        exibirToast(error.message || 'Erro ao comunicar com a API.', 'erro');
    }

    clientesCache = clientesCache.filter(c => String(c.id) !== String(id));
    atualizarMetricas(clientesCache);
    filtrarTabela();
    exibirToast(`Cliente #${id} removido! (Modo Local)`, 'sucesso');
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
// 19. SISTEMA DE TOAST NOTIFICATIONS
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
