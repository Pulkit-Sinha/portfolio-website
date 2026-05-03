// ============================================
// EDUCATION / SKILLS / PUBLICATIONS — reveals
// ============================================

export function initEducation() {
  // ── Invert both education + contact together ─
  // Both sections flip simultaneously so the shared border is never white/black.
  const eduSection     = document.querySelector('#education');
  const contactSection = document.querySelector('#contact');

  ScrollTrigger.create({
    trigger: '#contact',
    start: 'top 50%',
    end: 'bottom top',
    onEnter:     () => { eduSection?.classList.add('is-inverted');     contactSection?.classList.add('is-inverted'); },
    onLeaveBack: () => { eduSection?.classList.remove('is-inverted');  contactSection?.classList.remove('is-inverted'); },
  });

  // ── Left column: school name wipe ───────────
  gsap.fromTo(
    '.edu-school-name',
    { clipPath: 'inset(0 100% 0 0)' },
    {
      clipPath: 'inset(0 0% 0 0)',
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '#education',
        start: 'top 80%',
      },
    }
  );

  // ── Left column: degree + achievements stagger ─
  gsap.fromTo(
    ['.edu-header', '.edu-degree', '.edu-achievements li'],
    { autoAlpha: 0, y: 16 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.07,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#education',
        start: 'top 70%',
      },
    }
  );

  // ── Right column: fade in as block ──────────
  gsap.fromTo(
    ['.skills-section', '.pub-section'],
    { autoAlpha: 0, x: 20 },
    {
      autoAlpha: 1,
      x: 0,
      duration: 0.7,
      stagger: 0.15,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#education',
        start: 'top 70%',
      },
    }
  );

  // ── Institution hover: bullet points → cream ─
  document.querySelectorAll('.edu-institution').forEach(inst => {
    const lis = inst.querySelectorAll('.edu-achievements li');
    inst.addEventListener('mouseenter', () => {
      lis.forEach(li => { li.style.color = 'var(--color-text)'; });
    });
    inst.addEventListener('mouseleave', () => {
      lis.forEach(li => { li.style.color = ''; });
    });
  });

  // ── Mobile: scroll-triggered red bg (replaces :hover) ─
  if (window.matchMedia('(max-width: 768px)').matches) {
    const activeTargets = [
      ...document.querySelectorAll('.edu-institution'),
      document.querySelector('.skills-section'),
      document.querySelector('.pub-section'),
    ].filter(Boolean);

    activeTargets.forEach(el => {
      ScrollTrigger.create({
        trigger:     el,
        start:       'top 50%',
        end:         'bottom 50%',
        onEnter:      () => el.classList.add('is-active'),
        onLeave:      () => el.classList.remove('is-active'),
        onEnterBack:  () => el.classList.add('is-active'),
        onLeaveBack:  () => el.classList.remove('is-active'),
      });
    });
  }

  // ── Skill tags pop in ────────────────────────
  gsap.fromTo(
    '.skill-tag',
    { autoAlpha: 0, scale: 0.9 },
    {
      autoAlpha: 1,
      scale: 1,
      duration: 0.4,
      stagger: 0.03,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#education',
        start: 'top 60%',
      },
    }
  );

  // ── #4: BITS PILANI Ken Burns — school name + degree counter-drift ──
  // ── #6: Skill tag wave — each tag on its own parallax layer ─────────
  const eduMM = gsap.matchMedia();

  eduMM.add('(min-width: 769px)', () => {
    // #4: BITS PILANI Ken Burns — dramatic scale + counter-drift
    gsap.fromTo('.edu-school-name',
      { yPercent: 55, scale: 1.40 },
      { yPercent: -30, scale: 1.00, ease: 'none',
        scrollTrigger: { trigger: '#education', start: 'top bottom', end: 'bottom top', scrub: 1.0 } }
    );
    gsap.fromTo('.edu-degree',
      { yPercent: -45 },
      { yPercent: 45, ease: 'none',
        scrollTrigger: { trigger: '#education', start: 'top bottom', end: 'bottom top', scrub: 1.0 } }
    );

    // DPS institutions: Ken Burns scale + counter-drift on name/meta
    gsap.utils.toArray('.edu-institution--secondary').forEach((inst, i) => {
      const name = inst.querySelector('.edu-inst-name');
      const meta = inst.querySelector('.edu-inst-meta');
      if (name) {
        gsap.fromTo(name,
          { yPercent: 35 + i * 12, scale: 1.18 },
          { yPercent: -(25 + i * 8), scale: 1.00, ease: 'none',
            scrollTrigger: { trigger: inst, start: 'top bottom', end: 'bottom top', scrub: 1.2 + i * 0.2 } }
        );
      }
      if (meta) {
        gsap.fromTo(meta,
          { yPercent: -(25 + i * 8) },
          { yPercent: 25 + i * 8, ease: 'none',
            scrollTrigger: { trigger: inst, start: 'top bottom', end: 'bottom top', scrub: 1.0 + i * 0.2 } }
        );
      }
    });

    // Bullet ✦ spin — rotates in place; y:'-50%' replaces the removed CSS translateY
    gsap.utils.toArray('.edu-achievements .bullet').forEach((b, i) => {
      gsap.fromTo(b,
        { rotation: 0,       y: '-50%' },
        { rotation: 360 * 2, y: '-50%', ease: 'none',
          scrollTrigger: { trigger: b.closest('.edu-institution'), start: 'top bottom', end: 'bottom top', scrub: 1.5 + (i % 3) * 0.3 } }
      );
    });

    // #6: Skill tag wave — pixel-based y drift so small tags have visible movement
    gsap.utils.toArray('.skill-tag').forEach((tag, i) => {
      const speed = 0.6 + ((i * 37) % 100) / 125;
      const travel = (1 - speed) * 120;
      gsap.fromTo(tag,
        { y: travel },
        { y: -travel, ease: 'none',
          scrollTrigger: { trigger: '.skills-section', start: 'top bottom', end: 'bottom top', scrub: 1.8 } }
      );
    });
  });

  eduMM.add('(max-width: 768px)', () => {
    gsap.fromTo('.edu-school-name',
      { yPercent: 20, scale: 1.12 },
      { yPercent: -10, scale: 1.00, ease: 'none',
        scrollTrigger: { trigger: '#education', start: 'top bottom', end: 'bottom top', scrub: 1.2 } }
    );

    gsap.utils.toArray('.edu-achievements .bullet').forEach((b, i) => {
      gsap.fromTo(b,
        { rotation: 0,       y: '-50%' },
        { rotation: 360 * 2, y: '-50%', ease: 'none',
          scrollTrigger: { trigger: b.closest('.edu-institution'), start: 'top bottom', end: 'bottom top', scrub: 1.5 + (i % 3) * 0.3 } }
      );
    });
  });
}
