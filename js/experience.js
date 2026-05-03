// ============================================
// EXPERIENCE — accordion rows, GSAP reveals
// ============================================

export function initExperience() {
  const rows   = document.querySelectorAll('.exp-row');
  const header = document.querySelector('.exp-header');
  const list   = document.querySelector('.exp-list');
  let   openRow = null;

  // ── Height helpers ──────────────────────────

  function listHeight() {
    return list.clientHeight;
  }

  function equalHeight() {
    return listHeight() / rows.length;
  }

  // Measure the natural scrollHeight of a row's details panel
  // by cloning it off-screen at the correct width.
  function measureDetailsHeight(row) {
    const details = row.querySelector('.exp-details');
    const clone   = details.cloneNode(true);
    Object.assign(clone.style, {
      position:   'fixed',
      top:        '-9999px',
      left:       '0',
      width:      row.clientWidth + 'px',
      height:     'auto',
      flex:       'none',
      visibility: 'hidden',
      opacity:    '0',
      display:    'flex',
    });
    document.body.appendChild(clone);
    const h = clone.scrollHeight;
    document.body.removeChild(clone);
    return h;
  }

  // Animate rows: open one, compress others, or restore equal
  function applyHeights(expandedRow = null, expandH = null) {
    const total = listHeight();
    const colH  = expandH !== null
      ? (total - expandH) / (rows.length - 1)
      : total / rows.length;

    rows.forEach(row => {
      const target = expandedRow
        ? (row === expandedRow ? expandH : colH)
        : total / rows.length;
      gsap.to(row, { height: target, duration: 0.45, ease: 'power2.inOut' });
    });
  }

  const isMobile = () => window.innerWidth <= 768;

  // ── Initial state ────────────────────────────
  rows.forEach(row => {
    if (isMobile()) {
      gsap.set(row.querySelector('.exp-details'), { display: 'none' });
    } else {
      gsap.set(row, { height: equalHeight() });
      gsap.set(row.querySelector('.exp-details'), { autoAlpha: 0, y: 10 });
    }
  });

  window.addEventListener('resize', () => {
    if (isMobile()) return;
    if (openRow) {
      const mainH    = openRow.querySelector('.exp-row-main').offsetHeight;
      const detailsH = measureDetailsHeight(openRow);
      const needed   = mainH + detailsH + 24;
      const expandH  = Math.min(needed, listHeight() * 0.92);
      applyHeights(openRow, expandH);
    } else {
      rows.forEach(row => gsap.set(row, { height: equalHeight() }));
    }
  });

  // ── Row click: accordion toggle ─────────────
  rows.forEach(row => {
    row.addEventListener('click', () => {
      const isOpen = row.classList.contains('is-open');

      // Close any open row
      rows.forEach(r => {
        if (r.classList.contains('is-open')) {
          r.classList.remove('is-open');
          if (isMobile()) {
            gsap.to(r.querySelector('.exp-details'), {
              opacity: 0, duration: 0.15, ease: 'power2.in',
              onComplete: () => gsap.set(r.querySelector('.exp-details'), { display: 'none' }),
            });
          } else {
            gsap.to(r.querySelector('.exp-details'), {
              autoAlpha: 0, y: 10, duration: 0.18, ease: 'power2.in',
            });
          }
        }
      });

      if (!isOpen) {
        row.classList.add('is-open');
        openRow = row;

        if (isMobile()) {
          gsap.set(row.querySelector('.exp-details'), { display: 'flex', opacity: 0 });
          gsap.to(row.querySelector('.exp-details'), { opacity: 1, duration: 0.3, ease: 'power2.out', delay: 0.1 });
        } else {
          const mainH    = row.querySelector('.exp-row-main').offsetHeight;
          const detailsH = measureDetailsHeight(row);
          const needed   = mainH + detailsH + 24;
          const expandH  = Math.min(needed, listHeight() * 0.92);
          applyHeights(row, expandH);
          gsap.fromTo(
            row.querySelector('.exp-details'),
            { autoAlpha: 0, y: 10 },
            { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', delay: 0.3 }
          );
        }
      } else {
        openRow = null;
        if (!isMobile()) {
          applyHeights(null);
        } else {
          window._lenis?.scrollTo(document.getElementById('experience'), { offset: -20, duration: 0.8 });
        }
      }
    });
  });

  // ── Entrance: header wipe ────────────────────
  gsap.fromTo(
    header,
    { clipPath: 'inset(0 100% 0 0)' },
    {
      clipPath: 'inset(0 0% 0 0)',
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '#experience',
        start: 'top 85%',
      },
    }
  );

  // ── Entrance: rows fade in (y handled by staircase below) ──
  gsap.fromTo(
    rows,
    { autoAlpha: 0 },
    {
      autoAlpha: 1,
      duration: 0.65,
      stagger: 0.1,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#experience',
        start: 'top 75%',
      },
    }
  );

  // ── #3: Staircase — rows enter at progressively larger y offsets ──
  // ── #7: Numerals horizontal drift — 01/02/03 slide at different speeds ──
  const expMM = gsap.matchMedia();

  expMM.add('(min-width: 769px)', () => {
    gsap.utils.toArray('.exp-row').forEach((row, i) => {
      gsap.fromTo(row,
        { y: 200 + i * 80 },
        { y: 0, ease: 'none',
          scrollTrigger: { trigger: '#experience', start: 'top bottom', end: 'top 30%', scrub: 1.2 } }
      );
    });

    // #7: Numerals drift vertically — each row at a different magnitude, fade from muted→cream
    gsap.utils.toArray('.exp-num').forEach((num, i) => {
      gsap.fromTo(num,
        { y: 90 + i * 35, opacity: 0.6, color: '#C8C4BB' },
        { y: -(90 + i * 35), opacity: 1, color: '#EBE8E0', ease: 'none',
          scrollTrigger: { trigger: num.closest('.exp-row'), start: 'top bottom', end: 'bottom top', scrub: 2 } }
      );
    });
  });

  expMM.add('(max-width: 768px)', () => {
    gsap.utils.toArray('.exp-row').forEach((row, i) => {
      gsap.fromTo(row,
        { y: 100 + i * 40 },
        { y: 0, ease: 'none',
          scrollTrigger: { trigger: '#experience', start: 'top bottom', end: 'top 30%', scrub: 1.2 } }
      );
    });
  });
}
