# Pulkit Sinha — Portfolio Website

## Project Overview
Personal portfolio for Pulkit Sinha, Founding Engineer / Head of Software at Armatrix.
Design inspiration: utopiatokyo.com — Japanese editorial minimalism, dark, typographic, high contrast.

---

## Tech Stack
- **Plain HTML/CSS/JS** — no framework, no build step
- **GSAP 3 + ScrollTrigger** — all animations (loaded from CDN as globals)
- **Lenis** — smooth scroll (loaded from CDN)
- **Three.js** — 3D katana slash (loader exit), mask canvas, asterisk (contact section)
- **Lucide** — icons (UMD global from CDN)
- **No bundler** — open index.html directly via a local HTTP server

CDN links (already in index.html):
```
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js
https://unpkg.com/lenis@1.1.14/dist/lenis.min.js
https://unpkg.com/lucide@latest/dist/umd/lucide.min.js
```

Three.js loaded via importmap in index.html (`three` → jsDelivr CDN).

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
├── README.md
├── css/
│   ├── variables.css       # Design tokens (colors, fonts, spacing, easing)
│   ├── base.css            # Reset, @font-face, body, cursor, grain overlay
│   ├── loader.css          # Page loader styles
│   ├── slash.css           # Katana slash overlay (diagonal screen split)
│   ├── hero.css            # Hero section
│   ├── experience.css      # Experience accordion rows
│   ├── education.css       # Education + Skills + Publications combined section
│   ├── contact.css         # Contact section + footer
│   └── responsive.css      # Mobile breakpoints
├── js/
│   ├── loader.js           # Loader animation → katana slash exit
│   ├── katana.js           # Three.js katana model (spins during loader)
│   ├── mask.js             # Three.js mask canvas (fixed, scrolls in after hero)
│   ├── hero.js             # Hero reveal + HUD clock + parallax
│   ├── experience.js       # Accordion expand/collapse + ScrollTrigger reveals
│   ├── education.js        # ScrollTrigger reveals for education section
│   ├── contact.js          # Contact section animations
│   ├── asterisk.js         # Three.js spinning asterisk (contact section)
│   ├── fluid.js            # Fluid/distortion effect
│   └── glitch.js           # Site-wide glitch effect
└── assets/
    ├── fonts/
    │   ├── PPNeueMontreal-Thin.otf
    │   ├── PPNeueMontreal-Book.otf
    │   ├── PPNeueMontreal-Medium.otf
    │   ├── PPNeueMontreal-Bold.otf
    │   └── PPNeueMontreal-Italic.otf
    ├── models/
    │   ├── katana.glb      # Rengoku katana (loader + slash)
    │   ├── mask.glb        # Cat mask (default, always visible)
    │   └── oni.glb         # Oni mask (glitch swap, 55% chance)
    └── icons/
        ├── github.svg
        ├── linkedin.svg
        └── mail.svg
```

---

## Sections (All Built ✅)

### ✅ 1. Loader (`#loader`)
- Full viewport dark overlay
- "PULKIT SINHA" chars assemble from below with stagger
- Counter 000→100 in IBM Plex Mono, red progress bar
- "ENGINEER & BUILDER" tagline in mono
- Exit: Three.js katana slashes across screen (diagonal slash overlay `#slash-overlay`), then panel slides up

### ✅ 2. Hero (`#hero`)
- Full viewport height
- HUD bar: `PS / PORTFOLIO` | coordinates | live IST clock (updates every 10ms)
- Pre-heading (mono): `HEAD OF SOFTWARE / ARMATRIX`
- Name: `PULKIT` (filled) + `SINHA` (outline) — `--text-hero`
- Bottom-right info block: `ENGINEER. BUILDER. CREATOR.` tagline + company history with parallax speeds
- Bottom-left: `BENGALURU, IN — 2026`

### ✅ 3. Experience (`#experience`) — Section label: `02 / EXPERIENCE`
- Three accordion rows: Armatrix, AlphaSense, Amazon
- Each row: number, company, role (left) + dates + `+` toggle (right)
- Expanded: bullet points + tech pills
- ScrollTrigger reveal on scroll

### ✅ 4. Education + Skills + Publications (`#education`) — Labels: `03`, `04`, `05`
- Left 70%: Education entries (BITS Pilani, DPS Vasant Kunj, DPS Gurgaon)
  - Each with degree/grade + achievement bullets using Lucide sparkle icons
- Right 30%:
  - Skills section (`04 / SKILLS`): language tags + tools/frameworks tags
  - Publications section (`05 / PUBLICATIONS`): two entries with links

### ✅ 5. Contact (`#contact`) — Section label: `06 / CONTACT`
- Large heading: `LET'S BUILD` / `SOMETHING` (outline)
- Three.js spinning asterisk on right (`#asterisk-canvas`)
- Email + phone links
- Social icons: GitHub, LinkedIn, Steam
- Footer: `Built with ❤️ and Claude`

---

## Pulkit's Info
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

1. **GSAP is a CDN global** — never `import gsap`. Reference as `gsap` / `ScrollTrigger` directly.
2. **Three.js is via importmap** — `import * as THREE from 'three'` and `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'` work.
3. **Lucide is a UMD global** — call `lucide.createIcons()` after DOM ready (already done in index.html inline script).
4. **All JS files are ES modules** (`type="module"` in index.html). Use `export function` and `import { } from`.
5. **No build step** — changes are live immediately.
6. **Lenis + ScrollTrigger** — connect Lenis RAF to GSAP ticker, set ScrollTrigger scroller proxy.
7. **Custom cursor** — inline in index.html `<script type="module">` block. Cursor expands on hover over `a` and `button`.
8. **Grain overlay** — `.grain` div in base.css uses SVG `feTurbulence` as background-image.
9. **Katana slash overlay** — `#slash-overlay` has two halves + `#slash-seam`. Animated in loader.js as the exit transition.
10. **All sections complete** — no pending sections. Focus on polish, performance, and responsive fixes.
