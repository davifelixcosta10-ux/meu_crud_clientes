# OpenCode Task: Landing Page Complete Redesign (Neobrutalista P&B)

## Contexto
- Landing atual: `index.html` + `style.css` + inline JS em https://daviflow.vercel.app
- Stack: Tailwind CDN + CSS custom + vanilla JS (Lucide icons)
- Branches: trabalho em `feature/landing-redesign` → push `origin/feature/landing-redesign` → QA roda `sync-agents.sh` → `branch-teste` → PR → main

## Objetivo
**Redesign total da landing** — HTML semântico novo, CSS system novo, JS modular novo — aplicando **emil-design-eng** philosophy + **pick-ui-library** principles. Visual premium, craft de diretor de arte, "tirar cara de template de IA".

## Brief (Direção Aberta)
- **Identidade visual**: LIVRE — pode criar nova paleta, tipografia, border-radius, sombras, layout. Objetivo: **premium, craft, "não parece template de IA"**
- **Referências visuais**: Stripe, Linear, Vercel, Raycast, Sonner docs — clean, espaçoso, tipografia forte, motion purposeful
- **Estrutura/Âncoras**: hero > mock/demo > 3 recursos > 3 passos > quem usa > footer (manter IDs: `#features`, `#how-it-works`, `#about`, `modal-*`)
- **Rotas**: modais `modal-login`, `modal-register`, `modal-recovery`
- **Zero**: lorem, dados fake não marcados, depoimentos inventados, logos clientes falsos, números de conversão inventados
- **Dados visíveis**: se usar mock, marcar "Dados de exemplo"
- **Princípios emil-design-eng**: OBRIGATÓRIOS (motion, easing, hover media, active scale, focus visible, reduced motion, stagger, @starting-style, transitions over keyframes, performance)

---

## Skills a Aplicar

### 1. emil-design-eng (obrigatório)
**Animation Decision Framework:**
- Should animate? → Frequency check (hero mock counters: rare/first-time ✓; nav hover: tens/day → reduce)
- Purpose → Spatial consistency, state indication, feedback, preventing jarring changes
- Easing → Custom curves only: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`
- Duration → UI <300ms, marketing can be longer

**Component Principles:**
- Buttons: `:active { transform: scale(0.97) }` + `transition: transform 160ms var(--ease-out)`
- Never `scale(0)` entry → start `scale(0.95)` + `opacity: 0`
- Hover only `@media (hover: hover) and (pointer: fine)`
- Popovers origin-aware (modals centered)
- CSS transitions over keyframes for interruptible UI
- `@starting-style` for modal/toast enter
- `prefers-reduced-motion` respected everywhere
- Stagger 30-80ms between items
- Focus visible: `outline: 2px solid #000; outline-offset: 2px`

**Performance:**
- Only animate `transform` + `opacity`
- CSS variables for tokens, not for per-frame updates
- CSS animations off main thread preferred

### 2. pick-ui-library (referência)
- **Motion**: vanilla CSS + WAAPI (sem Framer Motion — vanilla only)
- **Toasts**: Sonner-style patterns (CSS transitions, not keyframes)
- **Dialogs**: base-ui patterns (focus trap, `@starting-style`, ESC close)
- **Styling**: cva-style variant tokens via CSS custom properties
- **State**: zustand-style singleton stores (vanilla JS modules)

---

## Entregáveis (Arquivos Novos/Reescritos)

### 1. `index.html` — HTML Semântico Novo
- **Hero**: H1 verbo+objeto+tempo, subcopy operacional, 2 CTAs (primário + ghost), mockup frame com contadores animados + badge "30s" + tag "Dados de exemplo"
- **Features (3)**: grid 3 col, cards com icon + title + copy, hover lift (desktop)
- **How it Works (3)**: steps `01` `02` `03` mono, card layout, hover lift no número
- **About**: 3 linhas operacionais (Clínica/Oficina/Academia) + 3 featurettes
- **Footer**: logo, copy, contato@ + WhatsApp link, legal links, © Brasil
- **Modais**: login, register, recovery — focus trap, `@starting-style` enter, ESC close
- **Sticky bottom bar (mobile)**: "Pronto para começar?" + CTA
- **IDs/âncoras preservados**: `#features`, `#how-it-works`, `#about`, `modal-*`

### 2. `style.css` — Design System Completo (Tokens Livres)
```
:root {
  /* Colors — defina sua paleta premium */
  --bg: ; --surface: ; --border: ; --accent: ;
  --text-1: ; --text-2: ; --text-3: ;
  --shadow-sm: ; --shadow-md: ; --shadow-lg: ;
  /* Easing — custom curves obrigatórias */
  --ease-out: cubic-bezier(0.23,1,0.32,1);
  --ease-in-out: cubic-bezier(0.77,0,0.175,1);
  --ease-drawer: cubic-bezier(0.32,0.72,0,1);
  /* Motion */
  --dur-fast: 160ms; --dur-base: 200ms; --dur-slow: 300ms; --dur-marketing: 500ms;
  /* Radius — sua escolha */
  --radius: ;
}
.dark { /* inverted tokens */ }
```

**Components (usando tokens):**
- `.btn` variants (primary, ghost, danger) com `:active { transform: scale(0.97) }`
- `.card` base + `.feature-card`, `.step-card`, `.metric-card`
- `.mockup-frame` / `.demo-frame` com hover lift + shadow scale
- `.modal` com `@starting-style` enter, backdrop, focus trap
- `.counter` animation (WAAPI/IntersectionObserver)
- `.reveal` scroll animation (staggered)
- `.navbar` scroll state transition
- Focus visible global: `outline: 2px solid var(--accent); outline-offset: 2px`
- Reduced motion media query
- Mobile touch targets 44px

### 3. `landing.js` — JS Modular (ESM)
**Modules:**
- `dom.js` — $(), $$, delegate(), ready()
- `modal.js` — open/close, focus trap, `@starting-style`, ESC, backdrop
- `counter.js` — IntersectionObserver + WAAPI animate, prefers-reduced-motion
- `reveal.js` — IntersectionObserver stagger, prefers-reduced-motion
- `smooth-scroll.js` — anchor links, offset navbar, prefers-reduced-motion
- `navbar.js` — scroll shadow, mobile menu
- `auth.js` — login/register/recovery handlers (safe JSON parse)
- `init.js` — bootstrap all modules

**Patterns:**
- No inline handlers (`onclick=""`) — event delegation
- Single `DOMContentLoaded` bootstrap
- WAAPI for counter animation (hardware accelerated)
- CSS transitions for all hover/active states
- `prefers-reduced-motion` check in every motion module

---

## Checklist de Qualidade (emil-design-eng Review Format)

| Before | After | Why |
| --- | --- | --- |
| Inline `onclick` handlers | Event delegation + modules | Maintainable, CSP-friendly, testable |
| `transition: all 300ms` | `transition: transform 200ms var(--ease-out)` | Specify properties; avoid `all` |
| `scale(0)` entry | `scale(0.95)` + `opacity: 0` @starting-style | Natural entrance |
| `ease-in` / `ease` | Custom `--ease-out` / `--ease-in-out` | Built-ins too weak |
| Hover on touch | `@media (hover: hover) and (pointer: fine)` | No false positives on tap |
| Keyframes for modals | CSS transitions + `@starting-style` | Interruptible, off-main-thread |
| No `:active` scale | `transform: scale(0.97)` | Instant press feedback |
| Hardcoded shadows | `--shadow-sm` / `--shadow-md` tokens | Dark mode, single source |
| 600ms entrance | 300ms max (marketing 500ms ok) | Perceived performance |
| No focus visible | `outline: 2px solid #000; offset: 2px` | AA accessibility |
| No reduced motion | Full `prefers-reduced-motion` support | Motion sickness safety |

---

## Não Faça
- Não use React/Vue/Svelte/Alpine — vanilla JS only
- Não adicione Framer Motion, GSAP, Motion One — CSS + WAAPI only
- Não mude estrutura de seções nem IDs/âncoras (`#features`, `#how-it-works`, `#about`, `modal-*`)
- Não invente depoimentos, logos clientes, números conversão, preços
- Não toque em `dashboard.html`, `app.js`, `app/main.py`, `app/storage.py`
- Não use `@apply` — compatibilidade CDN Tailwind

---

## Verificação (QA)
```bash
# Syntax
node --check landing.js
python3 -m py_compile app/main.py  # backend unchanged

# Visual
# Screenshot desktop (1920x1080) + mobile (375x667)

# Console
# Zero errors (especialmente classList null)

# A11y
# Tab nav — focus visible todos elementos
# Lighthouse a11y ≥ 95

# Motion
# Scroll hero → contadores animam 0→target
# Hover feature-card/step-card/mockup → lift + shadow (desktop only)
# Click btn → scale(0.97) press feedback
# prefers-reduced-motion → todas animações desligadas/instantâneas
# Smooth scroll "Ver em 60s" → #how-it-works

# Copy
# H1 = "Cadastre, cobre e acompanhe clientes em 1 painel"
# Sobre = 3 linhas operacionais
# Mock emails = *.exemplo@
# Footer = só contato@ + WhatsApp
# Tag "Dados de exemplo" visível no mock
```

---

## Entrega
- Branch: `feature/landing-redesign`
- Commits atômicos: `feat(html): semantic landing structure`, `feat(css): design system tokens + components`, `feat(js): modular landing modules`, `feat(polish): emil-design-eng compliance`
- Push `origin/feature/landing-redesign`
- QA roda `./sync-agents.sh` → merge `branch-teste` → deploy preview
- Após validação: merge `--no-ff` main

---

## Referências Visuais (para o agente)
- **Stripe/Linear/Vercel** landing pages (via `popular-web-designs` se precisar)
- **Sonner** toast/modal patterns (enter/exit, focus trap, transitions)
- **Base UI** dialog/popover patterns (origin-aware, @starting-style)
- **Emil Kowalski** blog/posts sobre motion, buttons, popovers