// Painel Administrativo de Clientes - Script Principal (Desktop & Mobile)

// CONFIGURAÇÕES E ESTADO DA APLICAÇÃO
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8000' 
    : window.location.origin; // Usa a própria URL da Vercel quando estiver em produção

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    configurarTema();
    carregarClientes();
    verificarStatusAPI();
    
    // Polling para status da API a cada 10 segundos
    setInterval(verificarStatusAPI, 10000);
    
    // Configura fechamento de modais com a tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            fecharModalCriar();
            fecharModalEditar();
            fecharModalDeletar();
        }
    });
});

// 1. CONFIGURAÇÃO DE TEMA (DARK / LIGHT MODE)
function configurarTema() {
    // Aplica tema inicial baseado no localStorage ou preferência do sistema
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTemaManual);
    }
}

function toggleTemaManual() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// 2. VERIFICAÇÃO DE STATUS DA API (DESKTOP & MOBILE)
async function verificarStatusAPI() {
    const badges = [
        { badge: document.getElementById('api-status-badge'), dot: document.getElementById('api-status-dot'), text: document.getElementById('api-status-text') },
        { badge: document.getElementById('api-status-badge-mobile'), dot: document.getElementById('api-status-dot-mobile'), text: document.getElementById('api-status-text-mobile') }
    ];

    try {
        const res = await fetch(`${API_BASE_URL}/clientes`, { method: 'GET' });
        const ok = res.ok || res.status === 200;

        badges.forEach(({ badge, dot, text }) => {
            if (!badge || !dot || !text) return;
            if (ok) {
                dot.className = 'w-2 h-2 mr-1.5 rounded-full bg-emerald-500 animate-pulse';
                badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
                text.textContent = 'Conectado';
            } else {
                throw new Error('Status erro');
            }
        });
    } catch (err) {
        badges.forEach(({ badge, dot, text }) => {
            if (!badge || !dot || !text) return;
            dot.className = 'w-2 h-2 mr-1.5 rounded-full bg-rose-500';
            badge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800';
            text.textContent = 'Desconectado';
        });
    }
}

// 3. REQUISIÇÕES FETCH HTTP
async function carregarClientes() {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/clientes`);
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: Falha ao buscar clientes.`);
        }
        clientesCache = await response.json();
        atualizarMetricas(clientesCache);
        filtrarTabela();
    } catch (error) {
        console.error("Erro ao carregar clientes:", error);
        exibirToast("Não foi possível carregar a lista de clientes da API.", "erro");
        clientesCache = [];
        atualizarMetricas([]);
        filtrarTabela();
    } finally {
        mostrarLoading(false);
    }
}

// 4. ATUALIZAÇÃO DE MÉTRICAS E CARDS
function atualizarMetricas(clientes) {
    const total = clientes.length;
    const ativos = clientes.filter(c => c.ativo).length;
    const inativos = total - ativos;
    
    const bronze = clientes.filter(c => c.plano === 'bronze').length;
    const prata = clientes.filter(c => c.plano === 'prata').length;
    const ouro = clientes.filter(c => c.plano === 'ouro').length;

    document.getElementById('metric-total').textContent = total;
    document.getElementById('metric-ativos').textContent = ativos;
    document.getElementById('metric-inativos').textContent = inativos;

    const ativosPct = total > 0 ? Math.round((ativos / total) * 100) : 0;
    const inativosPct = total > 0 ? Math.round((inativos / total) * 100) : 0;

    document.getElementById('metric-ativos-pct').textContent = `${ativosPct}%`;
    document.getElementById('metric-inativos-pct').textContent = `${inativosPct}%`;

    document.getElementById('metric-bronze').textContent = bronze;
    document.getElementById('metric-prata').textContent = prata;
    document.getElementById('metric-ouro').textContent = ouro;
}

// 5. RENDERING E FILTRAGEM DA TABELA & CARDS MOBILE
function filtrarTabela() {
    const termo = document.getElementById('search-input').value.toLowerCase().trim();
    const planoFiltro = document.getElementById('filter-plano').value;
    const statusFiltro = document.getElementById('filter-status').value;

    const clientesFiltrados = clientesCache.filter(c => {
        const matchBusca = c.nome.toLowerCase().includes(termo) || 
                           c.email.toLowerCase().includes(termo) || 
                           String(c.id).includes(termo);
        
        const matchPlano = !planoFiltro || c.plano === planoFiltro;
        const matchStatus = !statusFiltro || (statusFiltro === 'ativo' ? c.ativo : !c.ativo);

        return matchBusca && matchPlano && matchStatus;
    });

    renderizarClientes(clientesFiltrados);
}

function renderizarClientes(clientes) {
    const tbody = document.getElementById('tabela-clientes-body');
    const mobileCardsContainer = document.getElementById('mobile-cards-container');
    const emptyState = document.getElementById('empty-state');
    
    tbody.innerHTML = '';
    mobileCardsContainer.innerHTML = '';

    if (clientes.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    clientes.forEach(cliente => {
        // Formatar Data
        let dataFormatada = cliente.data_cadastro || '-';
        if (cliente.data_cadastro && cliente.data_cadastro.includes('-')) {
            const [ano, mes, dia] = cliente.data_cadastro.split('-');
            dataFormatada = `${dia}/${mes}/${ano}`;
        }

        // Renderizar Badge de Plano
        let planoBadgeHTML = getPlanoBadgeHTML(cliente.plano);

        // Renderizar Status Badge
        const statusBadgeHTML = cliente.ativo
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                 <span class="w-1.5 h-1.5 mr-1 rounded-full bg-emerald-500"></span>Ativo
               </span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60">
                 <span class="w-1.5 h-1.5 mr-1 rounded-full bg-rose-500"></span>Inativo
               </span>`;

        // 1. DESKTOP ROW (TABLE)
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors group';
        tr.innerHTML = `
            <td class="py-3.5 px-6 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">#${cliente.id}</td>
            <td class="py-3.5 px-6 font-semibold text-slate-900 dark:text-white">${escaparHTML(cliente.nome)}</td>
            <td class="py-3.5 px-6 text-slate-600 dark:text-slate-300">${escaparHTML(cliente.email)}</td>
            <td class="py-3.5 px-6">${planoBadgeHTML}</td>
            <td class="py-3.5 px-6">${statusBadgeHTML}</td>
            <td class="py-3.5 px-6 text-slate-500 dark:text-slate-400 text-xs">${dataFormatada}</td>
            <td class="py-3.5 px-6 text-right">
                <div class="inline-flex items-center space-x-2">
                    <button onclick="abrirModalEditar(${cliente.id})" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors" title="Editar Cliente">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                    </button>
                    <button onclick="abrirModalDeletar(${cliente.id})" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Excluir Cliente">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // 2. MOBILE CARD
        const card = document.createElement('div');
        card.className = 'p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800 shadow-sm space-y-3';
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">#${cliente.id}</span>
                <div>${statusBadgeHTML}</div>
            </div>

            <div>
                <h4 class="font-bold text-slate-900 dark:text-white text-base leading-snug">${escaparHTML(cliente.nome)}</h4>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${escaparHTML(cliente.email)}</p>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                <div>${planoBadgeHTML}</div>
                <span class="text-slate-400 text-[11px]">Cadastrado: ${dataFormatada}</span>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                <button onclick="abrirModalEditar(${cliente.id})" class="flex items-center justify-center py-2 px-3 rounded-lg border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-xs font-medium active:bg-amber-100">
                    <i data-lucide="edit" class="w-3.5 h-3.5 mr-1.5"></i> Editar
                </button>
                <button onclick="abrirModalDeletar(${cliente.id})" class="flex items-center justify-center py-2 px-3 rounded-lg border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-xs font-medium active:bg-rose-100">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5 mr-1.5"></i> Excluir
                </button>
            </div>
        `;
        mobileCardsContainer.appendChild(card);
    });

    if (window.lucide) {
        lucide.createIcons();
    }
}

function getPlanoBadgeHTML(plano) {
    switch (plano) {
        case 'bronze':
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/50">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500"></span>Bronze
                    </span>`;
        case 'prata':
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400"></span>Prata
                    </span>`;
        case 'ouro':
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-300/80 dark:border-yellow-700/50">
                        <span class="w-1.5 h-1.5 mr-1.5 rounded-full bg-yellow-500"></span>Ouro
                    </span>`;
        default:
            return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 capitalize">${plano}</span>`;
    }
}

// 6. MODAL NOVO CLIENTE (POST)
function abrirModalCriar() {
    document.getElementById('form-criar').reset();
    document.getElementById('criar-ativo').checked = true;
    abrirModal('modal-criar');
}

function fecharModalCriar() {
    fecharModal('modal-criar');
}

async function salvarNovoCliente(event) {
    event.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-criar');
    
    const novoCliente = {
        nome: document.getElementById('criar-nome').value.trim(),
        email: document.getElementById('criar-email').value.trim(),
        plano: document.getElementById('criar-plano').value,
        ativo: document.getElementById('criar-ativo').checked
    };

    setButtonLoading(btnSubmit, true, "Cadastrando...");

    try {
        const response = await fetch(`${API_BASE_URL}/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoCliente)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Erro ${response.status} ao criar cliente.`);
        }

        const clienteCriado = await response.json();
        exibirToast(`Cliente "${clienteCriado.nome}" criado com sucesso!`, 'sucesso');
        fecharModalCriar();
        carregarClientes();
    } catch (error) {
        console.error("Erro ao salvar cliente:", error);
        exibirToast(error.message || "Erro ao conectar com o servidor.", 'erro');
    } finally {
        setButtonLoading(btnSubmit, false, "Cadastrar Cliente");
    }
}

// 7. MODAL EDITAR CLIENTE (PATCH)
function abrirModalEditar(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('editar-id').value = cliente.id;
    document.getElementById('editar-id-label').textContent = cliente.id;
    document.getElementById('editar-nome').value = cliente.nome;
    document.getElementById('editar-email').value = cliente.email;
    document.getElementById('editar-plano').value = cliente.plano;
    document.getElementById('editar-ativo').checked = cliente.ativo;

    abrirModal('modal-editar');
}

function fecharModalEditar() {
    fecharModal('modal-editar');
}

async function salvarEdicaoCliente(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('editar-id').value);
    const btnSubmit = document.getElementById('btn-submit-editar');

    const clienteAtualizado = {
        nome: document.getElementById('editar-nome').value.trim(),
        email: document.getElementById('editar-email').value.trim(),
        plano: document.getElementById('editar-plano').value,
        ativo: document.getElementById('editar-ativo').checked
    };

    setButtonLoading(btnSubmit, true, "Salvando...");

    try {
        const response = await fetch(`${API_BASE_URL}/clientes/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clienteAtualizado)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Erro ${response.status} ao atualizar cliente.`);
        }

        exibirToast(`Cliente #${id} atualizado com sucesso!`, 'sucesso');
        fecharModalEditar();
        carregarClientes();
    } catch (error) {
        console.error("Erro ao editar cliente:", error);
        exibirToast(error.message || "Falha ao salvar edições.", 'erro');
    } finally {
        setButtonLoading(btnSubmit, false, "Salvar Alterações");
    }
}

// 8. MODAL EXCLUIR CLIENTE (DELETE)
function abrirModalDeletar(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    clienteParaDeletarId = id;
    document.getElementById('deletar-id-label').textContent = cliente.id;
    document.getElementById('deletar-nome-label').textContent = cliente.nome;

    abrirModal('modal-deletar');
}

function fecharModalDeletar() {
    clienteParaDeletarId = null;
    fecharModal('modal-deletar');
}

async function confirmarExclusao() {
    if (!clienteParaDeletarId) return;

    const btnSubmit = document.getElementById('btn-submit-deletar');
    setButtonLoading(btnSubmit, true, "Excluindo...");

    try {
        const response = await fetch(`${API_BASE_URL}/clientes/${clienteParaDeletarId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao apagar cliente.`);
        }

        exibirToast(`Cliente #${clienteParaDeletarId} removido com sucesso!`, 'sucesso');
        fecharModalDeletar();
        carregarClientes();
    } catch (error) {
        console.error("Erro ao deletar cliente:", error);
        exibirToast("Erro ao tentar remover cliente.", 'erro');
    } finally {
        setButtonLoading(btnSubmit, false, "Excluir Cliente");
    }
}

// UTILITÁRIOS DE MODAL E UI
function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    const box = modal.querySelector('.modal-box');
    modal.classList.remove('hidden');
    setTimeout(() => {
        box.classList.remove('scale-95', 'opacity-0');
        box.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    const box = modal.querySelector('.modal-box');
    box.classList.remove('scale-100', 'opacity-100');
    box.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 150);
}

function mostrarLoading(show) {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    if (show) {
        loadingState.classList.remove('hidden');
        emptyState.classList.add('hidden');
    } else {
        loadingState.classList.add('hidden');
    }
}

function setButtonLoading(button, isLoading, text) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i> ${text}`;
    } else {
        button.disabled = false;
        button.innerHTML = `<span>${text}</span>`;
    }
    if (window.lucide) lucide.createIcons();
}

function escaparHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// SISTEMA DE TOAST NOTIFICATIONS
function exibirToast(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const isSucesso = tipo === 'sucesso';
    const bgClass = isSucesso ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-rose-600 text-white';
    const iconName = isSucesso ? 'check-circle' : 'alert-circle';

    toast.className = `flex items-center space-x-3 p-3.5 sm:p-4 rounded-xl shadow-xl ${bgClass} pointer-events-auto transform transition-all duration-300 translate-y-4 opacity-0`;
    toast.innerHTML = `
        <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0"></i>
        <span class="text-xs sm:text-sm font-medium flex-1">${escaparHTML(mensagem)}</span>
        <button onclick="this.parentElement.remove()" class="p-1 opacity-70 hover:opacity-100">
            <i data-lucide="x" class="w-4 h-4"></i>
        </button>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-4', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
