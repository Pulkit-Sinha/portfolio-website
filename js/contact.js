// ============================================
// CONTACT SECTION — scroll reveal
// ============================================

export function initContact() {
  const section = document.querySelector('#contact');
  if (!section) return;

  // ── Heading: clip-path wipe left→right ──────
  gsap.fromTo(
    '.contact-line',
    { clipPath: 'inset(0 100% 0 0)' },
    {
      clipPath: 'inset(0 0% 0 0)',
      duration: 1.2,
      ease: 'power3.out',
      stagger: 0.15,
      scrollTrigger: {
        trigger: '#contact',
        start: 'top 75%',
      },
    }
  );

  // ── Label fade in ────────────────────────────
  gsap.fromTo(
    '.contact-label',
    { autoAlpha: 0, y: 12 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#contact',
        start: 'top 80%',
      },
    }
  );

  // ── Bottom info: stagger up ──────────────────
  gsap.fromTo(
    ['.contact-item', '.contact-social', '.contact-footer'],
    { autoAlpha: 0, y: 16 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.55,
      stagger: 0.08,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#contact',
        start: 'top 60%',
      },
    }
  );

  // ── #5: Contact heading scissor — LET'S BUILD slides left, SOMETHING slides right ──
  // ── #5: Asterisk floats faster than text plane — Z-depth cue ────────────────────────
  const ctMM = gsap.matchMedia();

  ctMM.add('(min-width: 769px)', () => {
    // Both lines slide right — LET'S BUILD from 0, SOMETHING from far right
    // end:'bottom bottom' ensures animation completes at page bottom
    gsap.fromTo('.contact-line:not(.contact-line--outline)',
      { xPercent: 0 },
      { xPercent: 7, ease: 'none',
        scrollTrigger: { trigger: '#contact', start: 'top 80%', end: 'bottom bottom', scrub: 1.4 } }
    );
    gsap.fromTo('.contact-line--outline',
      { xPercent: 18 },
      { xPercent: 5, ease: 'none',
        scrollTrigger: { trigger: '#contact', start: 'top 80%', end: 'bottom bottom', scrub: 1.4 } }
    );
    gsap.to('#asterisk-container', {
      yPercent: -22, ease: 'none',
      scrollTrigger: { trigger: '#contact', start: 'top bottom', end: 'bottom top', scrub: 1.6 },
    });
  });

  ctMM.add('(max-width: 768px)', () => {
    gsap.fromTo('.contact-line:not(.contact-line--outline)',
      { xPercent: 0 },
      { xPercent: 4, ease: 'none',
        scrollTrigger: { trigger: '#contact', start: 'top 80%', end: 'bottom bottom', scrub: 1.4 } }
    );
    gsap.fromTo('.contact-line--outline',
      { xPercent: 10 },
      { xPercent: 3, ease: 'none',
        scrollTrigger: { trigger: '#contact', start: 'top 80%', end: 'bottom bottom', scrub: 1.4 } }
    );
    gsap.to('#asterisk-container', {
      yPercent: -11, ease: 'none',
      scrollTrigger: { trigger: '#contact', start: 'top bottom', end: 'bottom top', scrub: 1.6 },
    });
  });
}
