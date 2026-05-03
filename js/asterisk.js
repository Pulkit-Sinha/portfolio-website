// ============================================
// ASTERISK — Three.js gloss-black matcap + mouse displacement
// ============================================

import * as THREE from 'three';

export function initAsterisk() {
  const container = document.getElementById('asterisk-container');
  const canvas    = document.getElementById('asterisk-canvas');
  if (!container || !canvas) return;

  // ── Renderer ─────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ── Camera ────────────────────────────────
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 5;

  // ── Scene ─────────────────────────────────
  const scene = new THREE.Scene();

  // ── Geometry ─────────────────────────────
  const extrudeOpts = {
    depth:          0.32,
    bevelEnabled:   true,
    bevelThickness: 0.18,
    bevelSize:      0.14,
    bevelSegments:  14,
    steps:          1,
  };
  const geo = new THREE.ExtrudeGeometry(buildShape(), extrudeOpts);
  geo.center();
  geo.computeVertexNormals();

  // Alt shape — 4-point sparkle, same bounding box, shown during glitch
  const altGeo = new THREE.ExtrudeGeometry(buildAltShape(), extrudeOpts);
  altGeo.center();
  altGeo.computeVertexNormals();

  // ── Material: built-in MeshMatcapMaterial ─
  // Using Three.js's own matcap UV logic (guaranteed correct) +
  // displacement injected via onBeforeCompile.
  const material = new THREE.MeshMatcapMaterial({ matcap: buildMatcap() });

  let shaderRef = null;
  const state   = { hovered: 0 };
  const mouseModel = new THREE.Vector3();

  material.onBeforeCompile = shader => {
    shader.uniforms.uMouse   = { value: mouseModel };
    shader.uniforms.uHovered = { value: 0.0 };

    // Prepend uniform declarations
    shader.vertexShader = /* glsl */`
      uniform vec3  uMouse;
      uniform float uHovered;
    ` + shader.vertexShader;

    // Inject displacement at begin_vertex (objectNormal is already defined here)
    shader.vertexShader = shader.vertexShader.replace(
      `#include <begin_vertex>`,
      /* glsl */`
      vec3 transformed = position;
      float _d   = length(position.xy - uMouse.xy);
      float _inf = smoothstep(1.15, 0.0, _d) * uHovered;
      transformed += objectNormal * _inf * 0.42;
      `
    );

    shaderRef = shader;
  };
  material.needsUpdate = true;

  const mesh    = new THREE.Mesh(geo, material);
  const altMesh = new THREE.Mesh(altGeo, material);
  altMesh.visible = false;

  // Group both so rotation/tilt is shared; toggle child visibility for glitch
  const meshGroup = new THREE.Group();
  meshGroup.add(mesh);
  meshGroup.add(altMesh);
  scene.add(meshGroup);

  // ── Invisible plane for raycasting ───────
  const raycaster = new THREE.Raycaster();
  const hitPlane  = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  scene.add(hitPlane);

  // ── Mouse state — tracks globally when visible ──────────
  const mouseNDC = new THREE.Vector2();

  // Map global mouse to canvas-local NDC when star is visible
  window.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width  * 0.5;
    const cy = r.top  + r.height * 0.5;
    // Floor at 0.45 anywhere on screen; scales up to 1.0 within 400px of star center
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const close = Math.max(0, 1 - dist / 400); // 0 beyond 400px, 1 at center
    const hovered = 0.45 + close * 0.55;       // 0.45 floor → 1.0 at center
    mouseNDC.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
    mouseNDC.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
    gsap.to(state, { hovered, duration: 0.4, ease: 'power2.out', overwrite: true });
  });

  // ── Touch tracking (mobile) ───────────────
  function applyTouch(t) {
    const r = canvas.getBoundingClientRect();
    mouseNDC.x =  ((t.clientX - r.left) / r.width)  * 2 - 1;
    mouseNDC.y = -((t.clientY - r.top)  / r.height) * 2 + 1;
  }
  canvas.addEventListener('touchstart', e => {
    gsap.to(state, { hovered: 1, duration: 0.4, ease: 'power2.out' });
    applyTouch(e.touches[0]);
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!visible) return;
    applyTouch(e.touches[0]);
  }, { passive: true });
  window.addEventListener('touchend', () => {
    gsap.to(state, { hovered: 0, duration: 1.2, ease: 'power2.out' });
    mouseNDC.set(0, 0);
  }, { passive: true });

  // Reset when mouse leaves browser window
  window.addEventListener('mouseleave', () => {
    gsap.to(state, { hovered: 0, duration: 1.2, ease: 'power2.out' });
    mouseNDC.set(0, 0);
  });

  // ── Resize ────────────────────────────────
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ── Visibility gate ───────────────────────
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 })
    .observe(container);

  // ── Scroll reveal ─────────────────────────
  gsap.fromTo(container,
    { opacity: 0, scale: 0.82 },
    { opacity: 1, scale: 1, duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: '#contact', start: 'top 70%' } }
  );

  // ── Scroll-driven rotation — star spins 3 full turns as contact scrolls ──
  let scrollRot = 0;
  ScrollTrigger.create({
    trigger: '#contact',
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: self => { scrollRot = self.progress * Math.PI * 6; },
  });

  // ── Glitch swap loop — ~15 s intervals, 300–700 ms hold ──
  let _glitching = false;
  function glitchLoop() {
    if (!_glitching && visible) {
      _glitching = true;
      mesh.visible    = false;
      altMesh.visible = true;

      const holdMs = 300 + Math.random() * 400;
      setTimeout(() => {
        altMesh.visible = false;
        mesh.visible    = true;
        _glitching = false;
      }, holdMs);
    }
    setTimeout(glitchLoop, 12000 + Math.random() * 6000);
  }
  setTimeout(glitchLoop, 6000);

  // ── RAF loop ─────────────────────────────
  let autoRotY = 0;
  function tick(t) {
    requestAnimationFrame(tick);
    if (!visible) return;

    const time = t * 0.001;
    autoRotY += 0.004 - state.hovered * 0.003;
    meshGroup.rotation.y = autoRotY + scrollRot;
    meshGroup.rotation.x = Math.sin(time * 0.38) * 0.09;

    // Mouse → model space (both meshes share meshGroup's world transform)
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObject(hitPlane);
    if (hits.length) {
      mouseModel.copy(hits[0].point).applyMatrix4(meshGroup.matrixWorld.clone().invert());
    }

    // Push uniforms
    if (shaderRef) {
      shaderRef.uniforms.uMouse.value   = mouseModel;
      shaderRef.uniforms.uHovered.value = state.hovered;
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}

// ── Shape: 6-arm star ─────────────────────────────────────
function buildShape() {
  const shape = new THREE.Shape();
  const arms  = 6;
  const R     = 1.0;
  const ri    = 0.24;
  const pts   = [];
  for (let i = 0; i < arms * 2; i++) {
    const angle = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(new THREE.Vector2(
      Math.cos(angle) * (i % 2 === 0 ? R : ri),
      Math.sin(angle) * (i % 2 === 0 ? R : ri)
    ));
  }
  shape.setFromPoints(pts);
  return shape;
}

// ── Alt shape: 4-point sparkle (same bounding radius) ──────
function buildAltShape() {
  const shape = new THREE.Shape();
  const arms  = 4;
  const R     = 1.0;
  const ri    = 0.14;
  const pts   = [];
  for (let i = 0; i < arms * 2; i++) {
    const angle = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(new THREE.Vector2(
      Math.cos(angle) * (i % 2 === 0 ? R : ri),
      Math.sin(angle) * (i % 2 === 0 ? R : ri)
    ));
  }
  shape.setFromPoints(pts);
  return shape;
}

// ── Matcap: gloss black ────────────────────────────────────
function buildMatcap() {
  const sz  = 512;
  const c   = document.createElement('canvas');
  c.width   = c.height = sz;
  const ctx = c.getContext('2d');

  // Fill entire canvas black (no transparency trick — just solid black)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, sz, sz);

  // Tight specular highlight — top-left
  const g1 = ctx.createRadialGradient(
    sz * 0.28, sz * 0.22, 0,
    sz * 0.28, sz * 0.22, sz * 0.20
  );
  g1.addColorStop(0,   'rgba(255,255,255,0.95)');
  g1.addColorStop(0.6, 'rgba(140,140,150,0.20)');
  g1.addColorStop(1,   'rgba(0,  0,  0,  0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, sz, sz);

  // Faint rim — bottom-right
  const g2 = ctx.createRadialGradient(sz * 0.80, sz * 0.82, 0, sz * 0.80, sz * 0.82, sz * 0.25);
  g2.addColorStop(0,   'rgba(55,55,65,0.5)');
  g2.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, sz, sz);

  // NO circular mask — fill the full square so no UV goes transparent
  return new THREE.CanvasTexture(c);
}
