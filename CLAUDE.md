# Pulkit Sinha — Portfolio Website

## Project Overview
Personal portfolio for Pulkit Sinha, Founding Engineer / Head of Software at Armatrix.
Design inspiration: utopiatokyo.com — Japanese editorial minimalism, dark, typographic, high contrast.

---

## Tech Stack
- **Plain HTML/CSS/JS** — no framework, no build step
- **GSAP 3 + ScrollTrigger** — all animations (loaded from CDN as globals)
- **Lenis** — smooth scroll (loaded from CDN)
- **No bundler** — open index.html directly via a local HTTP server

CDN links (already in index.html):
```
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js
https://unpkg.com/lenis@1.1.14/dist/lenis.min.js
```

Dev server: `python3 -m http.server 3333` from `/portfolio/`

---

## Design System

### Colors (css/variables.css)
```css
--color-bg:          #050508   /* near-black, cool undertone */
--color-bg-elevated: #0f0f14   /* card/hover surfaces */
--color-text:        #EBE8E0   /* warm cream */
--color-text-muted:  #6B6860   /* secondary text, labels */
--color-accent:      #FF1919   /* bright red — use sparingly */
--color-accent-dim:  rgba(255,25,25,0.15)
--color-cyan:        #00F3FF   /* secondary accent */
--color-border:      #1C1C22   /* dividers */
```

### Typography
| Role | Font | Weight | Variable |
|---|---|---|---|
| Display / Headings / Body | **Chakra Petch** (Google Fonts) | 300, 400, 500, 700 | `--font-display` |
| Mono accents / labels | **IBM Plex Mono** (Google Fonts CDN) | 300, 400, 500 | `--font-mono` |
| Pixel accent (very sparingly) | **Zpix** | 400 | `--font-pixel` |

Font loaded via Google Fonts CDN (`@import` in `base.css`).

### Type Scale
```css
--text-hero:    clamp(4rem, 13vw, 12rem)   /* PULKIT SINHA, LET'S BUILD */
--text-display: clamp(2.5rem, 5vw, 5rem)   /* Section headings */
--text-heading: clamp(1.5rem, 2.5vw, 2.5rem) /* Card titles */
--text-body:    clamp(0.9rem, 1.1vw, 1.1rem) /* Paragraphs */
--text-label:   0.7rem                      /* Section labels, tags, mono */
--text-caption: 0.6rem                      /* Footer, metadata */
```

### Easing
```css
--ease-out:    cubic-bezier(0.625, 0.05, 0, 1)   /* Primary — snappy Utopia Tokyo easing */
--ease-in-out: cubic-bezier(0.87, 0, 0.13, 1)    /* Panel transitions */
```

---

## File Structure
```
portfolio/
├── index.html              # Single page, all sections
├── CLAUDE.md               # This file
├── css/
│   ├── variables.css       # Design tokens (colors, fonts, spacing, easing)
│   ├── base.css            # Reset, @font-face, body, cursor, grain overlay
│   ├── loader.css          # Page loader styles
│   ├── hero.css            # (next)
│   ├── about.css
│   ├── experience.css
│   ├── publications.css
│   ├── marquee.css
│   ├── contact.css
│   └── responsive.css
├── js/
│   ├── loader.js           # Loader animation (initLoader function, ES module)
│   ├── cursor.js           # (to be extracted)
│   ├── hero.js
│   ├── about.js
│   ├── experience.js       # Horizontal scroll panel
│   ├── publications.js
│   ├── marquee.js
│   └── contact.js
└── assets/
    ├── fonts/
    │   ├── PPNeueMontreal-Thin.otf
    │   ├── PPNeueMontreal-Book.otf
    │   ├── PPNeueMontreal-Medium.otf
    │   ├── PPNeueMontreal-Bold.otf
    │   └── PPNeueMontreal-Italic.otf
    ├── images/
    │   └── pulkit-football.jpeg   # About section photo (to be added)
    └── icons/
        ├── github.svg
        ├── linkedin.svg
        └── mail.svg
```

---

## Sections (Build Order)

### ✅ 1. Loader (`#loader`)
- Full viewport, dark background
- "PULKIT SINHA" split into chars, assemble from below with stagger (0.08s each, 1.6s duration)
- Counter 000→100 in IBM Plex Mono, red progress bar (`--color-accent`)
- "ENGINEER & BUILDER" tagline in mono
- Exit: chars scatter upward, panel slides up (`yPercent: -100`)
- **Total duration: ~5s**

### ⬜ 2. Hero (`#hero`)
- Full viewport height
- Pre-heading (mono, muted): `FOUNDING ENGINEER / HEAD OF SOFTWARE`
- Name: `PULKIT` line 1, `SINHA` line 2 — `--text-hero` size, NeueMontreal Bold
- Clip-path wipe reveal left→right after loader exits
- Subline (mono): `Building interfaces for robots at Armatrix. Previously AlphaSense and Amazon.`
- Bottom left: `BENGALURU, IN — 2026`
- Bottom right: scroll indicator (animated vertical line)
- On scroll: name has parallax (each word at different speed)

### ⬜ 3. About (`#about`)
- Two columns: 55% text / 45% photo
- Section label: `01 / ABOUT` (mono, accent red, top-left)
- Bio paragraph (3-4 sentences — draft needed)
- Fast facts row (mono): `2 BOOKS PUBLISHED` | `AIR 2840 JEE ADV.` | `KVPY FELLOW '19`
- Right column: football photo (`assets/images/pulkit-football.jpeg`) with subtle Ken Burns animation
- ScrollTrigger reveals: label slides from left, text per-line reveal, photo scales in

### ⬜ 4. Experience (`#experience`) — HORIZONTAL SCROLL
- Section is ~300vh tall so ScrollTrigger has room to drive horizontal movement
- Header pins at top: `02 / EXPERIENCE` + `WHERE I'VE BUILT THINGS`
- Three cards scroll horizontally (left→right as user scrolls down):
  1. **Armatrix** — Jan 2026–Present · React/Next.js, Three.js, Python, PostgreSQL, GCP
  2. **AlphaSense** — Jul 2024–Dec 2025 · Python, FastAPI, AWS, Docker, Kubernetes
  3. **Amazon** — Jul–Dec 2023 · Java, AWS — reduced DB refresh time ~75%
- Each card: large faded background number (01/02/03), role tag (mono), company name (display), description, tech pills
- Card entrance: scale 0.95→1.0 + fade as it enters viewport

### ⬜ 5. Publications (`#publications`)
- Section label: `03 / PUBLICATIONS`
- Heading: `WRITTEN WORD`
- Two entries as full-width rows with 1px top border:
  1. *Machine Learning for Education* — BPB Publications, 2023, Co-author
  2. *Blockchain Technology and Applications* — Kindle, 2022, Contributor
- Animation: border line draws left→right (0.6s), then text fades in

### ⬜ 6. Skills Marquee (`.marquee-section`)
- Two rows scrolling in opposite directions:
  - Row 1 (→ left): `C++ — JAVA — PYTHON — JAVASCRIPT — DART — SQL — REACT — NEXT.JS — THREE.JS — FASTAPI — FLUTTER — UNITY`
  - Row 2 (← right): `DOCKER — KUBERNETES — AWS — GCP — MYSQL — POSTGRESQL — GIT — GRAFANA — MACHINE LEARNING — SYSTEM DESIGN`
- Large NeueMontreal (5vw), every other item in `--color-accent`
- Slows on hover (CSS animation-duration doubles)

### ⬜ 7. Contact (`#contact`)
- Full viewport
- Large heading: `LET'S BUILD` / `SOMETHING` — same clip-path wipe as hero
- Email: `aryantopulkit2@gmail.com`
- Phone: `+91 93546 94299`
- Resume download button (link to PDF)
- Social icons: GitHub (github.com/pulkit-sinha), LinkedIn (linkedin.com/in/pulkit-sinha-803907200)
- Footer: `© 2026 PULKIT SINHA` left, `BUILT WITH CARE` right

---

## Pulkit's Info (from resume)
- **Name:** Pulkit Sinha
- **Email:** aryantopulkit2@gmail.com
- **Phone:** +91 93546 94299
- **GitHub:** https://github.com/pulkit-sinha
- **LinkedIn:** https://www.linkedin.com/in/pulkit-sinha-803907200/
- **Location:** Bengaluru, India
- **Education:** B.E. Computer Science, BITS Pilani, 2024

### Experience
1. Founding Engineer / Head of Software @ Armatrix (Jan 2026–Present)
2. Software Developer @ AlphaSense (Jul 2024–Dec 2025)
3. SDE Intern @ Amazon (Jul–Dec 2023)

### Achievements
- AIR 2840, JEE Advanced 2020
- KVPY Fellowship Award 2019
- 100/100 Mathematics (12th CBSE)
- 99/100 English (10th CBSE)

### Publications
- *Machine Learning for Education* — BPB Publications, 2023 (Co-author)
- *Blockchain Technology and Applications* — Kindle, 2022 (Contributor)

---

## Important Notes for New Sessions

1. **GSAP is a CDN global** — never `import gsap`. Reference it as `window.gsap` or just `gsap`.
2. **All JS files are ES modules** (`type="module"` in index.html). Use `export function` and `import { } from`.
3. **No build step** — changes are live immediately. Run `python3 -m http.server 3333` from portfolio dir.
4. **Section-by-section** — build one section at a time, test with Playwright before moving on.
5. **Lenis + ScrollTrigger** — when initializing: connect Lenis RAF to GSAP ticker, set ScrollTrigger scroller.
6. **Custom cursor** — `.cursor` div is already in HTML. Cursor JS is currently inline in index.html `<script type="module">` block. Extract to `js/cursor.js` when ready.
7. **Grain overlay** — `.grain` div uses inline SVG `feTurbulence` as background-image. Already in base.css.
