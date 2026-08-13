// ============================================================
// DaviFlow — App Principal (Dashboard Administrativo)
// ============================================================

// ============================================================
// PLANOS_CONFIG — Configuração central e editável dos planos
// Para adicionar/remover/renomear planos: edite apenas este objeto.
// ============================================================
const PLANOS_CONFIG = [
    {
        id: 'basico',
        nome: 'Básico',
        valor: 'Grátis',
        cor: 'slate',
        emoji: '⚡',
        descricao: 'Para quem está começando',
        beneficios: ['Até 25 clientes', 'Painel básico', 'Suporte por e-mail'],
        badge: {
            bg: 'bg-slate-100 dark:bg-slate-700/60',
            text: 'text-slate-600 dark:text-slate-300',
            border: 'border-slate-300/80 dark:border-slate-600/60',
            dot: 'bg-slate-400 dark:bg-slate-400',
        },
        card: {
            border: 'border-slate-300 dark:border-slate-600',
            activeBorder: 'border-cyan-500 dark:border-cyan-500',
            icon: 'text-slate-500 dark:text-slate-400',
        }
    },
    {
        id: 'pro',
        nome: 'Pro',
        valor: 'R$ 29/mês',
        cor: 'cyan',
        emoji: '🚀',
        descricao: 'Para negócios em expansão',
        beneficios: ['Clientes ilimitados', 'Métricas avançadas', 'Suporte prioritário'],
        badge: {
            bg: 'bg-cyan-100 dark:bg-cyan-900/40',
            text: 'text-cyan-800 dark:text-cyan-300',
            border: 'border-cyan-300/80 dark:border-cyan-700/50',
            dot: 'bg-cyan-500',
        },
        card: {
            border: 'border-slate-300 dark:border-slate-600',
            activeBorder: 'border-cyan-500 dark:border-cyan-500',
            icon: 'text-cyan-500 dark:text-cyan-400',
        }
    },
    {
        id: 'enterprise',
        nome: 'Enterprise',
        valor: 'R$ 99/mês',
        cor: 'yellow',
        emoji: '👑',
        descricao: 'Para grandes operações',
        beneficios: ['Tudo do Pro', 'API de integração', 'SLA e suporte 24/7'],
        badge: {
            bg: 'bg-yellow-100 dark:bg-yellow-900/40',
            text: 'text-yellow-800 dark:text-yellow-300',
            border: 'border-yellow-300/80 dark:border-yellow-700/50',
            dot: 'bg-yellow-500',
        },
        card: {
            border: 'border-slate-300 dark:border-slate-600',
            activeBorder: 'border-yellow-500 dark:border-yellow-500',
            icon: 'text-yellow-500 dark:text-yellow-400',
        }
    }
];

// MOCK DATA para testes locais / offline quando a API não estiver conectada ao banco
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
        rg: "45.678.912-3",
        data_cadastro: "2026-08-10"
    },
    {
        id: 4,
        nome: "Lucas Ferreira",
        email: "lucas.ferreira@mail.com",
        plano: null,
        ativo: true,
        telefone: null,
        cpf: null,
        rg: null,
        data_cadastro: "2026-08-12"
    }
];

// ============================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ============================================================
const API_BASE_URL = window.location.origin;
let clientesCache = [];
let clienteParaDeletarId = null;
let modoDemo = false;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    configurarTema();
    carregarClientes();
    verificarStatusAPI();
    renderizarCardsPlanoModal('criar');
    renderizarCardsPlanoModal('editar');
    inicializarFiltroPlanos();

    // Polling de status da API a cada 10s
    setInterval(verificarStatusAPI, 10000);

    // ESC fecha modais
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            fecharModalCriar();
            fecharModalEditar();
            fecharModalDeletar();
        }
    });
});

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
        const res = await fetch(`${API_BASE_URL}/clientes`, { method: 'GET' });
        isOnline = res.ok || res.status === 200;
    } catch (_) {}

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
}

// ============================================================
// 3. CARREGAR CLIENTES DA API OU MOCK DEMO
// ============================================================
async function carregarClientes() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/clientes`);
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
// 4. MÉTRICAS
// ============================================================
function atualizarMetricas(clientes) {
    const total    = clientes.length;
    const ativos   = clientes.filter(c => c.ativo).length;
    const inativos = total - ativos;

    const countByPlan = {};
    PLANOS_CONFIG.forEach(p => { countByPlan[p.id] = 0; });
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

    PLANOS_CONFIG.forEach(p => {
        const el = document.getElementById(`metric-plano-${p.id}`);
        if (el) el.textContent = countByPlan[p.id];
    });
    const semPlanoEl = document.getElementById('metric-sem-plano');
    if (semPlanoEl) semPlanoEl.textContent = semPlano;
}

// ============================================================
// 5. FILTRAGEM E RENDERIZAÇÃO DA TABELA
// ============================================================
function filtrarTabela() {
    const termo        = document.getElementById('search-input').value.toLowerCase().trim();
    const planoFiltro  = document.getElementById('filter-plano').value;
    const statusFiltro = document.getElementById('filter-status').value;

    const filtrados = clientesCache.filter(c => {
        const haystack = [
            c.nome, c.email,
            c.telefone || '', c.cpf || '',
            String(c.id)
        ].join(' ').toLowerCase();

        const matchBusca  = !termo || haystack.includes(termo);
        const matchPlano  = !planoFiltro  || c.plano === planoFiltro || (planoFiltro === '__sem_plano__' && !c.plano);
        const matchStatus = !statusFiltro || (statusFiltro === 'ativo' ? c.ativo : !c.ativo);

        return matchBusca && matchPlano && matchStatus;
    });

    renderizarClientes(filtrados);
}

function renderizarClientes(clientes) {
    const tbody               = document.getElementById('tabela-clientes-body');
    const mobileCardsContainer = document.getElementById('mobile-cards-container');
    const emptyState          = document.getElementById('empty-state');

    tbody.innerHTML               = '';
    mobileCardsContainer.innerHTML = '';

    if (clientes.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
        return;
    }

    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');

    clientes.forEach(cliente => {
        const dataFormatada = formatarData(cliente.data_cadastro);
        const planoBadgeHTML = getPlanoBadgeHTML(cliente.plano);
        const statusBadgeHTML = getStatusBadgeHTML(cliente.ativo);

        // Desktop row
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors duration-150 group';
        tr.innerHTML = `
            <td class="py-3.5 px-5 font-mono text-xs font-semibold text-slate-400 dark:text-slate-500">#${cliente.id}</td>
            <td class="py-3.5 px-5">
                <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                         style="background: ${avatarGradient(cliente.nome)};">${avatarInitials(cliente.nome)}</div>
                    <span class="font-semibold text-slate-900 dark:text-white text-sm">${escaparHTML(cliente.nome)}</span>
                </div>
            </td>
            <td class="py-3.5 px-5 text-sm text-slate-600 dark:text-slate-300">${escaparHTML(cliente.email)}</td>
            <td class="py-3.5 px-5 hidden xl:table-cell text-xs text-slate-500 dark:text-slate-400 font-mono">${escaparHTML(cliente.telefone || '—')}</td>
            <td class="py-3.5 px-5">${planoBadgeHTML}</td>
            <td class="py-3.5 px-5">${statusBadgeHTML}</td>
            <td class="py-3.5 px-5 hidden lg:table-cell text-xs text-slate-400 dark:text-slate-500">${dataFormatada}</td>
            <td class="py-3.5 px-5 text-right">
                <div class="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button onclick="abrirModalEditar(${cliente.id})"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all duration-150"
                        title="Editar">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="abrirModalDeletar(${cliente.id})"
                        class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all duration-150"
                        title="Excluir">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // Mobile card
        const card = document.createElement('div');
        card.className = 'client-card p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 shadow-sm space-y-3';
        card.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2.5 min-w-0">
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
            <div class="grid grid-cols-2 gap-2">
                <button onclick="abrirModalEditar(${cliente.id})"
                    class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-xs font-semibold active:scale-[0.97] transition-transform">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar
                </button>
                <button onclick="abrirModalDeletar(${cliente.id})"
                    class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-xs font-semibold active:scale-[0.97] transition-transform">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Excluir
                </button>
            </div>
        `;
        mobileCardsContainer.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

// ============================================================
// HELPERS DE RENDERIZAÇÃO
// ============================================================
function getPlanoBadgeHTML(planoId) {
    if (!planoId) {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400 border border-slate-200 dark:border-slate-600/60">Sem plano</span>`;
    }
    const p = PLANOS_CONFIG.find(x => x.id === planoId);
    if (!p) {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:text-slate-300 capitalize">${planoId}</span>`;
    }
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${p.badge.bg} ${p.badge.text} border ${p.badge.border}">
                <span class="w-1.5 h-1.5 rounded-full ${p.badge.dot}"></span>${p.nome}
            </span>`;
}

function getStatusBadgeHTML(ativo) {
    return ativo
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
               <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Ativo
           </span>`
        : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60">
               <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Inativo
           </span>`;
}

function avatarInitials(nome) {
    if (!nome) return '?';
    const parts = nome.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarGradient(nome) {
    const gradients = [
        'linear-gradient(135deg,#06b6d4,#10b981)',
        'linear-gradient(135deg,#8b5cf6,#ec4899)',
        'linear-gradient(135deg,#f59e0b,#ef4444)',
        'linear-gradient(135deg,#3b82f6,#6366f1)',
        'linear-gradient(135deg,#10b981,#06b6d4)',
        'linear-gradient(135deg,#f97316,#eab308)',
    ];
    const idx = (nome || '').charCodeAt(0) % gradients.length;
    return gradients[idx];
}

function formatarData(rawDate) {
    if (!rawDate) return '—';
    if (rawDate.includes('-')) {
        const [ano, mes, dia] = rawDate.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    return rawDate;
}

// ============================================================
// INICIALIZAÇÃO DO FILTRO DE PLANOS (select dinâmico)
// ============================================================
function inicializarFiltroPlanos() {
    const select = document.getElementById('filter-plano');
    if (!select) return;
    select.innerHTML = '<option value="">Todos os Planos</option>';
    PLANOS_CONFIG.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.emoji} ${p.nome}`;
        select.appendChild(opt);
    });
    const semOpt = document.createElement('option');
    semOpt.value = '__sem_plano__';
    semOpt.textContent = 'Sem plano';
    select.appendChild(semOpt);
}

// ============================================================
// 6. MODAL NOVO CLIENTE
// ============================================================
function abrirModalCriar() {
    document.getElementById('form-criar').reset();
    document.getElementById('criar-ativo').checked = true;

    // Reset plano toggle e seleção
    setPlanoToggle('criar', false);

    // Limpa erros
    limparErrosForm('form-criar');

    // Fecha seção de contato
    const secao = document.getElementById('criar-contato-section');
    if (secao && !secao.classList.contains('hidden')) {
        toggleContatoSection('criar');
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

    // Coleta de plano (se toggle ativo)
    const planoAtivo = document.getElementById('criar-plano-toggle')?.checked;
    const planoSelecionado = planoAtivo ? getPlanoSelecionado('criar') : null;

    // Payload limpo — pronto para API
    const novoCliente = {
        id: Date.now(),
        nome:     document.getElementById('criar-nome').value.trim(),
        email:    document.getElementById('criar-email').value.trim(),
        plano:    planoSelecionado,
        ativo:    document.getElementById('criar-ativo').checked,
        telefone: document.getElementById('criar-telefone')?.value.trim() || null,
        cpf:      document.getElementById('criar-cpf')?.value.trim()      || null,
        rg:       document.getElementById('criar-rg')?.value.trim()       || null,
        data_cadastro: new Date().toISOString().split('T')[0]
    };

    setButtonLoading(btnSubmit, true, 'Cadastrando...');

    try {
        if (!modoDemo) {
            const response = await fetch(`${API_BASE_URL}/clientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(novoCliente),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao criar cliente.`);
            }

            const clienteCriado = await response.json();
            exibirToast(`Cliente "${clienteCriado.nome}" criado com sucesso!`, 'sucesso');
            fecharModalCriar();
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Executando em modo local:', error);
    }

    // Fallback Modo Demo Local
    clientesCache.unshift(novoCliente);
    atualizarMetricas(clientesCache);
    filtrarTabela();
    exibirToast(`Cliente "${novoCliente.nome}" cadastrado! (Modo Local)`, 'sucesso');
    fecharModalCriar();
    setButtonLoading(btnSubmit, false, 'Cadastrar Cliente');
}

// ============================================================
// 7. MODAL EDITAR CLIENTE
// ============================================================
function abrirModalEditar(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('editar-id').value            = cliente.id;
    document.getElementById('editar-id-label').textContent = cliente.id;
    document.getElementById('editar-nome').value          = cliente.nome;
    document.getElementById('editar-email').value         = cliente.email;
    document.getElementById('editar-ativo').checked       = cliente.ativo;

    // Plano toggle
    const temPlano = !!cliente.plano;
    setPlanoToggle('editar', temPlano);
    if (temPlano) {
        setPlanoSelecionado('editar', cliente.plano);
    }

    // Campos de contato
    if (document.getElementById('editar-telefone')) {
        document.getElementById('editar-telefone').value = cliente.telefone || '';
    }
    if (document.getElementById('editar-cpf')) {
        document.getElementById('editar-cpf').value = cliente.cpf || '';
    }
    if (document.getElementById('editar-rg')) {
        document.getElementById('editar-rg').value = cliente.rg || '';
    }

    // Abre seção de contato se houver dados
    const temContato = !!(cliente.telefone || cliente.cpf || cliente.rg);
    const secaoEditar = document.getElementById('editar-contato-section');
    if (temContato && secaoEditar && secaoEditar.classList.contains('hidden')) {
        toggleContatoSection('editar');
    } else if (!temContato && secaoEditar && !secaoEditar.classList.contains('hidden')) {
        toggleContatoSection('editar');
    }

    limparErrosForm('form-editar');
    abrirModal('modal-editar');
}

function fecharModalEditar() {
    fecharModal('modal-editar');
}

async function salvarEdicaoCliente(event) {
    event.preventDefault();
    if (!validarFormulario('editar')) return;

    const id        = parseInt(document.getElementById('editar-id').value);
    const btnSubmit = document.getElementById('btn-submit-editar');

    const planoAtivo     = document.getElementById('editar-plano-toggle')?.checked;
    const planoSelecionado = planoAtivo ? getPlanoSelecionado('editar') : null;

    const clienteAtualizado = {
        nome:     document.getElementById('editar-nome').value.trim(),
        email:    document.getElementById('editar-email').value.trim(),
        plano:    planoSelecionado,
        ativo:    document.getElementById('editar-ativo').checked,
        telefone: document.getElementById('editar-telefone')?.value.trim() || null,
        cpf:      document.getElementById('editar-cpf')?.value.trim()      || null,
        rg:       document.getElementById('editar-rg')?.value.trim()       || null,
    };

    setButtonLoading(btnSubmit, true, 'Salvando...');

    try {
        if (!modoDemo) {
            const response = await fetch(`${API_BASE_URL}/clientes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clienteAtualizado),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Erro ${response.status} ao atualizar.`);
            }

            exibirToast(`Cliente #${id} atualizado com sucesso!`, 'sucesso');
            fecharModalEditar();
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Salvando edição em modo local:', error);
    }

    // Fallback Modo Demo Local
    const index = clientesCache.findIndex(c => c.id === id);
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
// 8. MODAL EXCLUIR CLIENTE
// ============================================================
function abrirModalDeletar(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    clienteParaDeletarId = id;
    document.getElementById('deletar-id-label').textContent   = cliente.id;
    document.getElementById('deletar-nome-label').textContent = cliente.nome;

    abrirModal('modal-deletar');
}

function fecharModalDeletar() {
    clienteParaDeletarId = null;
    fecharModal('modal-deletar');
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
            });

            if (!response.ok) throw new Error(`Erro ${response.status} ao excluir.`);

            exibirToast(`Cliente #${id} removido com sucesso!`, 'sucesso');
            fecharModalDeletar();
            carregarClientes();
            return;
        }
    } catch (error) {
        console.warn('Falha na API backend. Excluindo em modo local:', error);
    }

    // Fallback Modo Demo Local
    clientesCache = clientesCache.filter(c => c.id !== id);
    atualizarMetricas(clientesCache);
    filtrarTabela();
    exibirToast(`Cliente #${id} removido! (Modo Local)`, 'sucesso');
    fecharModalDeletar();
    setButtonLoading(btnSubmit, false, 'Excluir Cliente');
}

// ============================================================
// MÓDULO DE PLANOS — Toggle + Cards selecionáveis
// ============================================================
function renderizarCardsPlanoModal(ctx) {
    const container = document.getElementById(`${ctx}-plano-cards`);
    if (!container) return;

    container.innerHTML = '';
    PLANOS_CONFIG.forEach(p => {
        const card = document.createElement('button');
        card.type = 'button';
        card.id = `${ctx}-plano-card-${p.id}`;
        card.dataset.plano = p.id;
        card.className = `plan-card relative w-full text-left p-3 rounded-xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${p.card.border} hover:border-slate-400 dark:hover:border-slate-500 bg-white dark:bg-slate-900/40`;
        card.onclick = () => selecionarPlanoCard(ctx, p.id);
        card.innerHTML = `
            <div class="flex items-start gap-2.5">
                <span class="text-lg leading-none mt-0.5">${p.emoji}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1">
                        <span class="text-sm font-bold text-slate-800 dark:text-white">${p.nome}</span>
                        <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">${p.valor}</span>
                    </div>
                    <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">${p.descricao}</p>
                </div>
                <div id="${ctx}-plano-check-${p.id}" class="plan-check-icon w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-150">
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    if (PLANOS_CONFIG.length > 0) selecionarPlanoCard(ctx, PLANOS_CONFIG[0].id);
}

function selecionarPlanoCard(ctx, planoId) {
    const plano = PLANOS_CONFIG.find(p => p.id === planoId);
    if (!plano) return;

    PLANOS_CONFIG.forEach(p => {
        const card  = document.getElementById(`${ctx}-plano-card-${p.id}`);
        const check = document.getElementById(`${ctx}-plano-check-${p.id}`);
        if (card) {
            card.className = card.className
                .replace(/border-\S+/g, '')
                .replace(/ring-\S+/g, '');
            card.classList.add('border-2', p.card.border, 'bg-white', 'dark:bg-slate-900/40');
            card.setAttribute('aria-checked', 'false');
        }
        if (check) {
            check.className = 'plan-check-icon w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-150';
            check.innerHTML = '';
        }
    });

    const activeCard  = document.getElementById(`${ctx}-plano-card-${planoId}`);
    const activeCheck = document.getElementById(`${ctx}-plano-check-${planoId}`);

    if (activeCard) {
        activeCard.className = activeCard.className
            .replace(/border-\S+/g, '')
            .replace(/ring-\S+/g, '');

        const borderColor = planoId === 'enterprise' ? 'border-yellow-400 dark:border-yellow-500'
                          : planoId === 'pro'         ? 'border-cyan-500 dark:border-cyan-400'
                          :                             'border-slate-400 dark:border-slate-400';

        const bgColor = planoId === 'enterprise' ? 'bg-yellow-50/50 dark:bg-yellow-950/20'
                      : planoId === 'pro'         ? 'bg-cyan-50/50 dark:bg-cyan-950/20'
                      :                             'bg-slate-50 dark:bg-slate-800/40';

        activeCard.classList.add('border-2', borderColor, bgColor);
        activeCard.setAttribute('aria-checked', 'true');
    }

    if (activeCheck) {
        const checkColor = planoId === 'enterprise' ? 'bg-yellow-400 border-yellow-400'
                         : planoId === 'pro'         ? 'bg-cyan-500 border-cyan-500'
                         :                             'bg-slate-500 border-slate-500';
        activeCheck.className = `plan-check-icon w-4 h-4 rounded-full border-2 ${checkColor} flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-150`;
        activeCheck.innerHTML = `<svg class="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    let hiddenInput = document.getElementById(`${ctx}-plano-value`);
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id   = `${ctx}-plano-value`;
        hiddenInput.name = 'plano';
        document.getElementById(`form-${ctx}`)?.appendChild(hiddenInput);
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
// SEÇÃO COLAPSÁVEL DE CONTATO
// ============================================================
function toggleContatoSection(ctx) {
    const secao   = document.getElementById(`${ctx}-contato-section`);
    const chevron = document.getElementById(`${ctx}-contato-chevron`);
    const badge   = document.getElementById(`${ctx}-contato-badge`);

    if (!secao) return;

    const isHidden = secao.classList.contains('hidden');
    secao.classList.toggle('hidden', !isHidden);
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

    if (badge) {
        const temDados = !!(
            document.getElementById(`${ctx}-telefone`)?.value ||
            document.getElementById(`${ctx}-cpf`)?.value ||
            document.getElementById(`${ctx}-rg`)?.value
        );
        badge.textContent = isHidden && temDados ? 'Preenchido ✓' : 'Opcional';
        badge.className = isHidden && temDados
            ? 'text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wide flex-shrink-0'
            : 'text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide flex-shrink-0';
    }
}

// ============================================================
// VALIDAÇÕES DE FORMULÁRIO
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

    // CPF (se preenchido)
    const cpfInput = document.getElementById(`${ctx}-cpf`);
    if (cpfInput && cpfInput.value.trim()) {
        if (!validarCPF(cpfInput.value.trim())) {
            exibirErroField(`${ctx}-cpf-error`, 'CPF inválido.');
            valido = false;
        } else {
            ocultarErroField(`${ctx}-cpf-error`);
        }
    }

    // Telefone (se preenchido)
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
    el.querySelector('span').textContent = msg;
    el.classList.add('visible');
    el.classList.remove('hidden');

    const inputEl = document.getElementById(errorId.replace('-error', ''));
    if (inputEl) {
        inputEl.classList.add('input-error-shake', 'border-rose-400', 'dark:border-rose-500', 'focus:border-rose-400');
        inputEl.classList.remove('border-emerald-400');
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
    el.classList.remove('border-rose-400', 'dark:border-rose-500');
}

function limparErrosForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.field-error').forEach(el => {
        el.classList.remove('visible');
        el.classList.add('hidden');
    });
    form.querySelectorAll('.form-input, input, select, textarea').forEach(el => {
        el.classList.remove('border-rose-400', 'dark:border-rose-500', 'border-emerald-400');
    });
}

// ============================================================
// MÁSCARAS DE ENTRADA
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

// ============================================================
// UTILITÁRIOS DE MODAL
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
// SISTEMA DE TOAST NOTIFICATIONS (com barra de progresso)
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
            border:  'border-blue-200 dark:border-blue-800/60',
            icon:    'info',
            iconCls: 'text-blue-500',
            bar:     'bg-blue-500',
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
