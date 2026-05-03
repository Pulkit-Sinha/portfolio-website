// ============================================
// HERO — entrance animations + scroll parallax
// ============================================


export function initHero() {
  // ── Lenis smooth scroll setup ─────────────
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  window._lenis = lenis;

  // ── Element refs ──────────────────────────
  const hud          = document.querySelector('.hero-hud');
  const pre          = document.querySelector('.hero-pre');
  const nameLine1    = document.getElementById('hero-pulkit');
  const nameLine2    = document.getElementById('hero-sinha');
  const taglineLines = document.querySelectorAll('.hero-tagline-line');
  const info         = document.querySelector('.hero-info');
  const bioSpans     = document.querySelectorAll('.hero-bio span');
  const bottom       = document.querySelector('.hero-bottom');
  const divider      = document.querySelector('.hero-divider');

  // ── Entrance animations ───────────────────

  // HUD bar fades in first
  gsap.to(hud, {
    opacity: 1,
    duration: 0.8,
    ease: 'power2.out',
    delay: 0.0,
  });

  // Pre-heading wipe
  gsap.to(pre, {
    clipPath: 'inset(0 0% 0 0)',
    duration: 1.0,
    ease: 'power3.out',
    delay: 0.1,
  });

  // Name lines — staggered wipe
  gsap.to(nameLine1, {
    clipPath: 'inset(0 0% 0 0)',
    duration: 1.4,
    ease: 'power3.out',
    delay: 0.22,
  });

  gsap.to(nameLine2, {
    clipPath: 'inset(0 0% 0 0)',
    duration: 1.4,
    ease: 'power3.out',
    delay: 0.38,
  });

  // Tagline lines — staggered fade
  gsap.to(taglineLines, {
    opacity: 1,
    duration: 0.7,
    ease: 'power2.out',
    stagger: 0.1,
    delay: 0.6,
  });

  // Bottom-right info block
  gsap.to(info, {
    opacity: 1,
    duration: 1.0,
    ease: 'power2.out',
    delay: 0.95,
  });

  // Bio lines staggered
  gsap.to(bioSpans, {
    opacity: 1,
    duration: 0.7,
    ease: 'power2.out',
    stagger: 0.1,
    delay: 1.1,
  });

  // Bottom row fade
  gsap.to(bottom, {
    opacity: 1,
    duration: 1.0,
    ease: 'power2.out',
    delay: 1.1,
  });

  // Divider line draw
  if (divider) {
    gsap.fromTo(divider,
      { scaleX: 0 },
      { scaleX: 1, duration: 1.4, ease: 'power3.out', delay: 1.15 }
    );
  }

  // ── Scroll parallax ───────────────────────
  const mm = gsap.matchMedia();

  mm.add('(min-width: 769px)', () => {
    // #1: Name counter-split — PULKIT flies hard up+left, SINHA slower up+right, pre drops down
    gsap.to(nameLine1, {
      yPercent: -55, xPercent: -3, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.4 },
    });
    gsap.to(nameLine2, {
      yPercent: -25, xPercent: 4, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.4 },
    });
    gsap.to(pre, {
      yPercent: 35, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.0 },
    });

    // #2: data-speed parallax — tagline (ENGINEER/BUILDER/CREATOR) + bio (companies) each on own layer
    document.querySelectorAll('[data-speed]').forEach(el => {
      const s = parseFloat(el.dataset.speed);
      gsap.to(el, {
        yPercent: (1 - s) * 150, ease: 'none',
        scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.6 },
      });
    });

    // #8: Grain drifts noticeably over full page
    gsap.to('.grain', {
      backgroundPosition: '400px 200px', ease: 'none',
      scrollTrigger: { trigger: 'body', start: 'top top', end: 'bottom bottom', scrub: 3 },
    });
    // #8: Experience section blood-red as hero color bleeds in, then clears
    gsap.fromTo('#experience',
      { backgroundColor: '#050508' },
      { backgroundColor: '#500b0d', ease: 'none',
        scrollTrigger: { trigger: '#experience', start: 'top bottom', end: 'top 30%', scrub: 1.5 } }
    );
    ScrollTrigger.create({
      trigger: '#experience',
      start: 'top top',
      onEnter:     () => gsap.to('#experience', { backgroundColor: '#050508', duration: 1.5, ease: 'power2.inOut', overwrite: true }),
      onLeaveBack: () => gsap.to('#experience', { backgroundColor: '#500b0d', duration: 0.5, ease: 'power2.out',  overwrite: true }),
    });
  });

  mm.add('(max-width: 768px)', () => {
    // Mobile: gentler name parallax, no xPercent drift
    gsap.to(nameLine1, {
      yPercent: -28, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.4 },
    });
    gsap.to(nameLine2, {
      yPercent: -13, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.4 },
    });
    gsap.to(pre, {
      yPercent: 18, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1.0 },
    });
  });

  // ── Align darker grids to name rule / info column ─────
  const nameRule = document.querySelector('.hero-name-rule');
  const heroInfo = document.querySelector('.hero-info');
  const hero     = document.getElementById('hero');
  const gridBL   = document.querySelector('.hero-grid-bl');
  const heroBio  = document.querySelector('.hero-bio');

  function syncGridTop() {
    if (!nameRule || !heroInfo || !hero) return;
    const heroRect = hero.getBoundingClientRect();
    const ruleRect = nameRule.getBoundingClientRect();
    const infoRect = heroInfo.getBoundingClientRect();
    const hudRect  = hud ? hud.getBoundingClientRect() : { bottom: infoRect.top };

    // Top boundary: just below the HUD bar's bottom border
    const gridOffset = hudRect.bottom - infoRect.top;

    // Bottom boundary: just above the bio separator (border-top of .hero-bio)
    const bioRect    = heroBio ? heroBio.getBoundingClientRect() : null;
    const gridBottom = bioRect ? bioRect.top - infoRect.top : ruleRect.bottom - infoRect.top;
    const gridHeight = Math.max(0, gridBottom - gridOffset);

    heroInfo.style.setProperty('--grid-offset', `${gridOffset}px`);
    heroInfo.style.setProperty('--grid-height', `${gridHeight}px`);

    // Bottom-left: starts at name rule bottom, ends at left edge of hero-info
    if (gridBL) {
      const blTop   = ruleRect.bottom - heroRect.top;
      const blRight = heroRect.width - (infoRect.left - heroRect.left);
      gridBL.style.top   = `${blTop}px`;
      gridBL.style.right = `${blRight}px`;
    }
  }

  // Set after entrance animations complete, then keep in sync on resize
  setTimeout(syncGridTop, 1600);
  window.addEventListener('resize', syncGridTop);

}
