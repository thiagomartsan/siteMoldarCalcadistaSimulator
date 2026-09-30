(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WHATSAPP_NUMBER = '55SEUNUMERO';
  const WHATSAPP_MESSAGE = 'Olá! Conheci o Moldar e gostaria de entender melhor o Diagnóstico Moldar para minha produção.';

  function initYear() {
    $$('[data-current-year]').forEach(el => el.textContent = String(new Date().getFullYear()));
  }

  function initMenu() {
    const header = $('[data-header]');
    if (!header) return;
    const btn = $('.menu-toggle', header);
    const nav = $('#site-nav');
    if (!btn || !nav) return;
    const set = (open) => {
      header.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    btn.addEventListener('click', () => set(!header.classList.contains('menu-open')));
    nav.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
    document.addEventListener('click', e => { if (header.classList.contains('menu-open') && !header.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }

  function initReveal() {
    const els = $$('.reveal:not(.is-visible)');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    els.forEach(el => io.observe(el));
  }

  function initWordRotator() {
    const el = $('[data-word-rotator]');
    if (!el || reduced) return;
    const words = ['MAPEIE A PRODUÇÃO', 'COMPARE A CAPACIDADE', 'TESTE UM CENÁRIO'];
    let i = 0;
    setInterval(() => {
      i = (i + 1) % words.length;
      el.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'},{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}], {duration:420,easing:'ease'});
      setTimeout(() => { el.textContent = words[i]; }, 205);
    }, 2800);
  }

  const howData = [
    {k:'PASSO 1',t:'Quanto precisa sair por dia?',x:'Informe a meta, a jornada e os intervalos. O Moldar calcula o tempo disponível e o ritmo necessário para bater a meta.',mock:'meta'},
    {k:'PASSO 2',t:'Desenhe o caminho do par.',x:'Comece pelo fluxo sugerido e ajuste os setores. Renomeie, mude a ordem, remova ou adicione etapas sem precisar desenhar um fluxograma.',mock:'flow'},
    {k:'PASSO 3',t:'Use o número que você conhece.',x:'Informe pares por dia ou, se tiver mais detalhe, tempo por ciclo e postos trabalhando em paralelo. Uma etapa por vez.',mock:'capacity'},
    {k:'PASSO 4',t:'Confira antes de calcular.',x:'O Moldar reúne meta, jornada e capacidades em uma revisão curta para você corrigir algo antes do resultado.',mock:'review'},
    {k:'PASSO 5',t:'Veja onde investigar primeiro.',x:'A linha aparece visualmente, as etapas abaixo da meta ficam claras e você pode testar um cenário sem alterar o original.',mock:'result'}
  ];

  function mockMarkup(type) {
    if (type === 'flow') return '<div class="mock-label">SEU FLUXO</div><div class="mock-output">01 Corte <b>→</b></div><div class="mock-output">02 Preparação <b>→</b></div><div class="mock-output">03 Costura <b>→</b></div><div class="mock-output">04 Montagem <b>→</b></div>';
    if (type === 'capacity') return '<div class="mock-label">COSTURA</div><div class="mock-input"><strong>460</strong><span>pares/dia</span></div><div class="mock-row"><span>Onde é feita?</span><b>Na fábrica</b></div><div class="mock-row"><span>Como informar?</span><b>Pares/dia</b></div><div class="mock-output">Etapa completa <b>✓</b></div>';
    if (type === 'review') return '<div class="mock-label">REVISÃO</div><div class="mock-row"><span>Meta</span><b>500/dia</b></div><div class="mock-row"><span>Tempo disponível</span><b>7h</b></div><div class="mock-row"><span>Etapas</span><b>6 completas</b></div><div class="mock-output">Pronto para calcular <b>✓</b></div>';
    if (type === 'result') return '<div class="mock-label">RESULTADO</div><div class="mock-input"><strong>460</strong><span>capacidade da linha</span></div><div class="mock-row"><span>Meta</span><b>500</b></div><div class="mock-row"><span>Primeiro ponto</span><b>Costura</b></div><div class="mock-output">Faltam <b>40 pares/dia</b></div>';
    return '<div class="mock-label">META DIÁRIA</div><div class="mock-input"><strong>500</strong><span>pares/dia</span></div><div class="mock-row"><span>Jornada</span><b>8h</b></div><div class="mock-row"><span>Intervalos</span><b>60 min</b></div><div class="mock-output">Tempo disponível <b>7h</b></div>';
  }

  function initHow() {
    const root = $('[data-how]');
    if (!root) return;
    const tabs = $$('[data-how-tab]', root);
    const kicker = $('[data-how-kicker]', root), title = $('[data-how-title]', root), text = $('[data-how-text]', root), mock = $('[data-how-mock]', root);
    const set = index => {
      tabs.forEach((tab, i) => { tab.classList.toggle('is-active', i === index); tab.setAttribute('aria-selected', String(i === index)); });
      const d = howData[index];
      kicker.textContent = d.k; title.textContent = d.t; text.textContent = d.x;
      mock.classList.add('is-changing');
      setTimeout(() => { mock.innerHTML = mockMarkup(d.mock); mock.classList.remove('is-changing'); }, reduced ? 0 : 150);
    };
    tabs.forEach((tab, i) => tab.addEventListener('click', () => set(i)));
  }

  function initModal() {
    const modal = $('#home-demo-modal');
    if (!modal) return;
    const open = () => { modal.hidden = false; document.body.classList.add('modal-open'); setTimeout(() => $('.modal-close', modal)?.focus(), 0); };
    const close = () => { modal.hidden = true; document.body.classList.remove('modal-open'); $('[data-demo-open]')?.focus(); };
    $('[data-demo-open]')?.addEventListener('click', open);
    $$('[data-modal-close]', modal).forEach(el => el.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
  }

  function initWhatsApp() {
    if (!$$('[data-wa]').length) return;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
    $$('[data-wa]').forEach(a => { a.href = url; a.target = '_blank'; a.rel = 'noopener'; });
  }

  initYear();
  initMenu();
  initReveal();
  initWordRotator();
  initHow();
  initModal();
  initWhatsApp();
})();
