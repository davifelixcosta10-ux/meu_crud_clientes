/**
 * DaviFlow Landing — Modular JS (ESM)
 * Modules: dom, modal, counter, reveal, smooth-scroll, navbar, auth, init
 * No inline handlers, event delegation, single DOMContentLoaded bootstrap
 * Uses CSS custom properties, WAAPI, IntersectionObserver
 */

// ------------------------------------------------------------
// dom.js — tiny helpers
// ------------------------------------------------------------
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const on = (type, sel, handler, ctx = document) => ctx.addEventListener(type, e => {
  const target = e.target.closest(sel);
  if (target) handler.call(target, e);
});
const ready = (fn) => document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn);

// ------------------------------------------------------------
// modal.js — dialog management, focus trap, @starting-style
// ------------------------------------------------------------
const openModals = [];
function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const handle = e => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  modal.addEventListener('keydown', handle);
  modal._trapHandle = handle;
  first?.focus();
}
function releaseFocus(modal) {
  modal.removeEventListener('keydown', modal._trapHandle);
}
function openModal(id) {
  const modal = $('#' + id);
  if (!modal) return;
  modal.showModal();
  openModals.push(modal);
  trapFocus(modal);
  document.body.style.overflow = 'hidden';
}
function closeModal(modal) {
  if (!modal) return;
  modal.close();
  releaseFocus(modal);
  const idx = openModals.indexOf(modal);
  if (idx > -1) openModals.splice(idx, 1);
  if (openModals.length === 0) document.body.style.overflow = '';
}
function closeTopModal() {
  const modal = openModals[openModals.length - 1];
  if (modal) closeModal(modal);
}
function switchModal(fromId, toId) {
  const from = $('#' + fromId);
  const to = $('#' + toId);
  if (from) closeModal(from);
  if (to) openModal(toId);
}

// Delegated handlers
on('click', '[data-action="open-modal"]', e => {
  e.preventDefault();
  openModal(e.currentTarget.dataset.modal);
});
on('click', '[data-action="close-modal"]', () => closeTopModal());
on('click', '[data-action="switch-modal"]', e => {
  e.preventDefault();
  const from = e.currentTarget.closest('dialog')?.id;
  const to = e.currentTarget.dataset.target;
  if (from && to) switchModal(from, to);
});
on('click', '[data-action="forgot-password"]', e => {
  e.preventDefault();
  switchModal('modal-login', 'modal-recovery');
});
// ESC close
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopModal(); });

// ------------------------------------------------------------
// counter.js — IntersectionObserver + WAAPI
// ------------------------------------------------------------
function initCounters() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target || '0', 10);
      if (prefersReduced) {
        el.textContent = target;
      } else {
        el.animate(
          [{ transform: 'scale(0.95)', opacity: 0, offset: 0 }, { transform: 'scale(1)', opacity: 1, offset: 1 }],
          { duration: 1200, easing: 'cubic-bezier(0.23,1,0.32,1)', fill: 'forwards' }
        );
        // numeric count
        let start = 0;
        const duration = 1200;
        const startTime = performance.now();
        function tick(now) {
          const p = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(eased * target);
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });
  $$('.counter').forEach(el => observer.observe(el));
}

// ------------------------------------------------------------
// reveal.js — scroll reveal with stagger
// ------------------------------------------------------------
function initReveal() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (prefersReduced) {
        el.classList.add('visible');
      } else {
        // stagger via transition-delay already in CSS
        el.classList.add('visible');
      }
      obs.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(el => observer.observe(el));
}

// ------------------------------------------------------------
// smooth-scroll.js — anchor links with navbar offset
// ------------------------------------------------------------
function initSmoothScroll() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  on('click', 'a[href^="#"]', e => {
    const href = e.currentTarget.getAttribute('href');
    if (href === '#') return;
    const target = $(href);
    if (!target) return;
    e.preventDefault();
    const navbar = $('#navbar');
    const offset = navbar ? navbar.offsetHeight + 16 : 72;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
    // close mobile menu if open
    const mobileMenu = $('#mobile-menu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('hidden');
      $('#mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
}

// ------------------------------------------------------------
// navbar.js — scroll shadow, mobile menu toggle
// ------------------------------------------------------------
function initNavbar() {
  const navbar = $('#navbar');
  const mobileMenu = $('#mobile-menu');
  const btn = $('#mobile-menu-btn');
  let lastScroll = 0;
  const onScroll = () => {
    const y = window.scrollY;
    if (y > 20) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled');
    lastScroll = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  if (btn && mobileMenu) {
    btn.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', (!open).toString());
    });
  }
  on('click', '[data-action="close-mobile-menu"]', () => {
    mobileMenu?.classList.add('hidden');
    btn?.setAttribute('aria-expanded', 'false');
  });
}

// ------------------------------------------------------------
// auth.js — safe JSON parse, login/register/recovery
// ------------------------------------------------------------
function setButtonLoading(btn, loading) {
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.7' : '1';
}
function showError(containerId, textId, msg) {
  const container = $(containerId);
  const text = $(textId);
  if (container && text) { text.textContent = msg; container.classList.remove('hidden'); }
}
function hideError(containerId) { const c = $(containerId); if (c) c.classList.add('hidden'); }

async function safeJson(response) {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) return response.json();
  const txt = await response.text();
  throw new Error(txt.slice(0,200) || 'Resposta inválida do servidor');
}

function attachAuth() {
  // Login
  const loginForm = $('#form-login');
  if (loginForm) loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideError('login-error');
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) return showError('login-error','login-error-text','Preencha todos os campos.');
    const btn = loginForm.querySelector('button[type=submit]');
    setButtonLoading(btn, true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.detail || 'Email ou senha incorretos.');
      if (data.user_id) { localStorage.setItem('df_user_id', data.user_id); if (data.access_token) localStorage.setItem('df_token', data.access_token); window.location.href = 'dashboard.html'; }
      else throw new Error('Erro no login: ID não retornado.');
    } catch (err) { showError('login-error','login-error-text', err.message); }
    finally { setButtonLoading(btn, false); }
  });

  // Register
  const regForm = $('#form-register');
  if (regForm) regForm.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('#signup-nome').value.trim();
    const email = $('#signup-email').value.trim();
    const pass = $('#signup-senha').value;
    const confirm = $('#signup-confirm-senha').value;
    if (pass !== confirm) return alert('As senhas não coincidem!');
    if (pass.length < 8) return alert('Senha deve ter pelo menos 8 caracteres.');
    const btn = regForm.querySelector('button[type=submit]');
    setButtonLoading(btn, true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome_completo:nome, email, password:pass, nome_empresa:''}) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar conta.');
      alert('Conta criada! Faça login.');
      switchModal('modal-register','modal-login');
    } catch (err) { alert(err.message); }
    finally { setButtonLoading(btn, false); }
  });

  // Recovery
  const recForm = $('#form-recovery');
  if (recForm) recForm.addEventListener('submit', async e => {
    e.preventDefault();
    const pass = $('#recovery-password').value;
    const confirm = $('#recovery-confirm').value;
    if (pass !== confirm) return alert('Senhas não coincidem');
    if (pass.length < 8) return alert('Mínimo 8 caracteres');
    const btn = recForm.querySelector('button[type=submit]');
    setButtonLoading(btn, true);
    // token from hash or localStorage
    let token = '';
    try {
      const hash = window.location.hash;
      if (hash.includes('access_token')) { const p = new URLSearchParams(hash.slice(1)); token = p.get('access_token')||''; }
      if (!token) token = localStorage.getItem('df_recovery_token')||'';
      if (!token) { const qs = new URLSearchParams(window.location.search); token = qs.get('token')||qs.get('access_token')||''; }
    } catch {}
    if (!token) return alert('Token ausente. Peça novo link.');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/update-password`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body:JSON.stringify({access_token:token,password:pass}) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.detail || 'Falha ao atualizar');
      alert('Senha atualizada! Redirecionando...');
      closeModal($('#modal-recovery'));
      openModal('modal-login');
      localStorage.removeItem('df_recovery_token');
    } catch (err) { alert(err.message); }
    finally { setButtonLoading(btn, false); }
  });
}

// ------------------------------------------------------------
// init.js — bootstrap
// ------------------------------------------------------------
ready(() => {
  initNavbar();
  initSmoothScroll();
  initReveal();
  initCounters();
  attachAuth();
  // Lucide icons (if present)
  if (window.lucide) lucide.createIcons();
});