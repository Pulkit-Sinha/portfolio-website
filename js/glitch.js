// ============================================
// GLITCH — character-level text glitch effect
// Katakana substitution + color flicker, ~2s intervals
// ============================================

const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const GLITCH_COLORS = ['#00F3FF', '#FF1919', '#ffffff'];

const _segmenter = (typeof Intl !== 'undefined' && 'Segmenter' in Intl)
  ? new Intl.Segmenter('en', { granularity: 'grapheme' })
  : null;

function rndKana() {
  return KATAKANA[Math.floor(Math.random() * KATAKANA.length)];
}

function graphemes(text) {
  return _segmenter ? [..._segmenter.segment(text)].map(s => s.segment) : [...text];
}

// Recursively walk a subtree, replacing text nodes with per-grapheme <span>s
// while preserving nested inline elements (<a>, <em>, etc.) and <br>.
// HTML source-formatting whitespace is stripped at element starts and after <br>s.
function wrapTextNodes(root) {
  const state = { afterBreak: true };

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent.replace(/[\r\n]/g, '');
      if (state.afterBreak) text = text.trimStart();
      if (!text) { node.remove(); return; }
      state.afterBreak = false;

      const frag = document.createDocumentFragment();
      graphemes(text).forEach(ch => {
        // Whitespace stays as plain text nodes so the browser can break
        // lines at word boundaries. Wrapping spaces in <span>s (or worse,
        // replacing them with NBSP) turns the entire run into one
        // unbreakable token and forces mid-word character breaks under
        // overflow-wrap: break-word.
        if (ch === ' ' || ch === '\t') {
          frag.appendChild(document.createTextNode(ch));
          return;
        }
        const span = document.createElement('span');
        span.className = 'glitch-char';
        span.dataset.original = ch;
        span.textContent = ch;
        frag.appendChild(span);
      });
      node.replaceWith(frag);
    } else if (node.nodeName === 'BR') {
      state.afterBreak = true;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList?.contains('glitch-char')) return;
      if (node.dataset?.noGlitch) return;
      [...node.childNodes].forEach(walk);
    }
  }

  [...root.childNodes].forEach(walk);
}

function splitIntoChars(el) {
  if (el.dataset.glitchReady) return;
  wrapTextNodes(el);
  el.dataset.glitchReady = '1';
}

// Apply a color glitch to a single span (optional kana substitution)
function applyGlitch(span, color, useKana) {
  span.dataset.glitching = '1';
  if (useKana) span.textContent = rndKana();
  span.style.color = color;
  span.style.webkitTextStroke = '0';
  span.style.fontFamily = useKana ? 'serif' : '';
}

// Restore a span to its original state
function restore(span) {
  span.textContent = span.dataset.original;
  span.style.color = '';
  span.style.webkitTextStroke = '';
  span.style.fontFamily = '';
  delete span.dataset.glitching;
}

// On cream-backgrounded (.is-inverted) sections, drop white from the palette
// so chars don't vanish for 100ms.
function pickColor(el, palette) {
  const inverted = el.closest('.is-inverted');
  const pool = inverted ? palette.filter(c => c !== '#ffffff') : palette;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Run a katakana + color glitch on 2-5 adjacent chars in an element
function glitchBlock(el) {
  const chars = [...el.querySelectorAll('.glitch-char')];
  const eligible = chars.filter(c => c.dataset.original.trim() !== '');
  if (eligible.length < 2) return;

  const count   = Math.floor(Math.random() * 4) + 2; // 2–5 chars
  const start   = Math.floor(Math.random() * Math.max(1, eligible.length - count));
  const targets = eligible.slice(start, start + count);
  const color   = pickColor(el, GLITCH_COLORS);

  targets.forEach(s => applyGlitch(s, color, true));

  // Hold, then restore — with optional micro re-glitch
  const holdMs = 80 + Math.random() * 160;
  setTimeout(() => {
    targets.forEach(restore);

    if (Math.random() < 0.4) {
      const micro = targets[Math.floor(Math.random() * targets.length)];
      setTimeout(() => {
        applyGlitch(micro, '#00F3FF', true);
        setTimeout(() => restore(micro), 40 + Math.random() * 60);
      }, 30);
    }
  }, holdMs);
}

// Flicker a single character's color without swapping the glyph
function colorFlicker(el) {
  const chars = [...el.querySelectorAll('.glitch-char')];
  const eligible = chars.filter(c => c.dataset.original.trim() !== '');
  if (!eligible.length) return;

  const target = eligible[Math.floor(Math.random() * eligible.length)];
  const colors = ['#00F3FF', '#FF1919', '#ffffff', '#FFD700'];
  applyGlitch(target, pickColor(target, colors), false);
  setTimeout(() => restore(target), 60 + Math.random() * 120);
}

// Returns true if any part of the element is within the viewport
function isInViewport(el) {
  const { top, bottom } = el.getBoundingClientRect();
  return bottom > 0 && top < window.innerHeight;
}

// ── Public API ──────────────────────────────
// elements: array of DOM nodes to glitch
// startDelay: ms to wait before first glitch (let entrance anims finish)
export function initGlitch(elements, { startDelay = 2200 } = {}) {
  elements.forEach(el => splitIntoChars(el));

  const loop = () => {
    // Only glitch elements currently visible in the viewport
    const visible = elements.filter(isInViewport);

    if (visible.length > 0) {
      // Bias toward the first (larger) elements
      const pool = visible.flatMap((el, i) => Array(Math.max(1, visible.length - i)).fill(el));
      const el   = pool[Math.floor(Math.random() * pool.length)];

      if (Math.random() < 0.72) {
        glitchBlock(el);
      } else {
        colorFlicker(el);
      }

      // Occasionally hit a second visible element in the same burst
      if (Math.random() < 0.3) {
        const el2 = visible[Math.floor(Math.random() * visible.length)];
        setTimeout(() => colorFlicker(el2), 80 + Math.random() * 120);
      }
    }

    setTimeout(loop, 1400 + Math.random() * 1400); // ~1.4–2.8 s
  };

  setTimeout(loop, startDelay);
}

// Site-wide wiring — queries all text-leaf elements across the page
// and registers a single glitch loop. Call once after sections are mounted.
const SITE_SELECTORS = [
  // Hero
  '.hero-pre',
  '.hero-name-line',
  '.hero-tagline-line',
  '.hero-bio span',
  '.hero-location',
  '.hero-hud span:not(#hud-clock)',
  // Experience
  '.exp-label', '.exp-sublabel',
  '.exp-num', '.exp-company', '.exp-role', '.exp-dates',
  '.exp-intro', '.exp-bullets li', '.exp-pill',
  // Education
  '.edu-label', '.edu-sublabel',
  '.edu-school-name', '.edu-degree',
  '.edu-inst-name', '.edu-inst-meta',
  '.edu-achievements li',
  // Skills + publications
  '.skills-label', '.skills-group-title', '.skill-tag',
  '.pub-label', '.pub-title', '.pub-meta',
  // Contact
  '.contact-label', '.contact-line',
  '.contact-item-label', '.contact-item-value',
  '.contact-footer span',
];

export function initSiteGlitch({ startDelay = 2200 } = {}) {
  const seen = new Set();
  const els = [];
  SITE_SELECTORS.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (seen.has(el)) return;
      seen.add(el);
      els.push(el);
    });
  });
  if (els.length) initGlitch(els, { startDelay });
}
