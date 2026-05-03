// ============================================
// MASK — Three.js scene, mouse-tracking face,
//        scroll-triggered entrance from below
// ============================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.18.1/meshopt_decoder.module.js';

let _scene, _camera, _renderer, _maskGroup, _demonGroup, _oniLight;
let _preloadedMask = null;
let _preloadedOni  = null;
let _mouse = { x: 0, y: 0 };
let _current = { rx: 0, ry: 0 };
let _glitching = false;

const MAX_RY = 0.52;
const MAX_RX = 0.28;
const LERP        = 0.06;
const LERP_MOBILE = 0.03;  /* slower on touch — keeps motion visible longer */

export function preloadMaskModels() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('./assets/models/mask.glb', gltf => { _preloadedMask = gltf; });
  loader.load('./assets/models/oni.glb',  gltf => { _preloadedOni  = gltf; });
}

export function initMask() {
  const canvas = document.getElementById('mask-canvas');
  if (!canvas) return;

  // ── Renderer ─────────────────────────────
  _scene = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  _camera.position.set(0, 0, 5.5);

  _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.4;
  _renderer.outputColorSpace = THREE.SRGBColorSpace;

  function syncSize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    _camera.aspect = w / h;
    _camera.updateProjectionMatrix();
    _renderer.setSize(w, h, false);
  }
  syncSize();
  new ResizeObserver(syncSize).observe(canvas);

  // ── Lighting ─────────────────────────────
  _scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 4);
  key.position.set(3, 4, 5);
  _scene.add(key);
  const rim = new THREE.DirectionalLight(0x99bbff, 2.5);
  rim.position.set(-4, 1, 2);
  _scene.add(rim);
  const red = new THREE.PointLight(0xff1919, 1.8, 12);
  red.position.set(0, -3, 3);
  _scene.add(red);

  // Extra front fill for oni mask — toggled on/off during glitch
  _oniLight = new THREE.DirectionalLight(0xffffff, 6);
  _oniLight.position.set(0, 2, 6);
  _oniLight.visible = false;
  _scene.add(_oniLight);

  // ── Mouse / touch tracking ────────────────
  const isTouchDevice = window.matchMedia('(max-width: 768px)').matches;

  window.addEventListener('mousemove', (e) => {
    _mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y =  (e.clientY / window.innerHeight) * 2 - 1;
  });

  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    _mouse.x =  (t.clientX / window.innerWidth)  * 2 - 1;
    _mouse.y =  (t.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // On touch-end, slowly drift back to centre
  window.addEventListener('touchend', () => {
    _mouse.x = 0;
    _mouse.y = 0;
  }, { passive: true });

  // ── Render loop ──────────────────────────
  const lerp = isTouchDevice ? LERP_MOBILE : LERP;
  function tick() {
    requestAnimationFrame(tick);
    if (_maskGroup) {
      _current.ry += (_mouse.x * MAX_RY - _current.ry) * lerp;
      _current.rx += (_mouse.y * MAX_RX - _current.rx) * lerp;
      _maskGroup.rotation.y = _current.ry;
      _maskGroup.rotation.x = _current.rx;
      if (_demonGroup) {
        _demonGroup.rotation.y = _current.ry;
        _demonGroup.rotation.x = _current.rx;
      }
    }
    _renderer.render(_scene, _camera);
  }
  tick();

  // ── Position: fixed at viewport centre, no parallax ─────────────
  // Mask stays centred throughout hero + experience sections.
  // A single ScrollTrigger handles the exit — no competing tweens.
  gsap.set(canvas, { xPercent: -50, yPercent: -50, y: 0 });

  // Exit: mask scrolls upward off screen as the user scrolls away.
  // On mobile the trigger is the hero bottom — ensures the mask is
  // fully gone before the experience section comes into view.
  // On desktop the trigger is the experience bottom (original behaviour).
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  gsap.to(canvas, {
    y: -(window.innerHeight + 200),
    ease: 'none',
    scrollTrigger: {
      trigger: isMobile ? '#hero'       : '#experience',
      start:   isMobile ? 'bottom 90%'  : 'bottom 65%',
      end:     isMobile ? 'bottom 20%'  : 'bottom top',
      scrub:   isMobile ? 0.8           : 1.5,
    },
  });

  // ── Load cat mask ────────────────────────
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  function onMaskLoaded(gltf) {
    _maskGroup = gltf.scene;
    fitModel(_maskGroup, 2.4);
    _maskGroup.traverse(child => {
      if (child.isMesh) {
        child.material.transparent = true;
        child.material.opacity = 0;
      }
    });
    _scene.add(_maskGroup);

    setTimeout(() => {
      _maskGroup.traverse(child => {
        if (child.isMesh) {
          gsap.to(child.material, { opacity: 1, duration: 1.4, ease: 'power2.out' });
        }
      });
      setTimeout(glitchLoop, 5000);
    }, 400);
  }

  function onOniLoaded(gltf) {
    _demonGroup = gltf.scene;
    fitModel(_demonGroup, 3.6);
    _demonGroup.visible = false;
    _scene.add(_demonGroup);
  }

  if (_preloadedMask) {
    onMaskLoaded(_preloadedMask);
  } else {
    loader.load('./assets/models/mask.glb', onMaskLoaded, undefined,
      (err) => console.warn('Mask GLB failed to load:', err));
  }

  if (_preloadedOni) {
    onOniLoaded(_preloadedOni);
  } else {
    loader.load('./assets/models/oni.glb', onOniLoaded, undefined,
      (err) => console.warn('Oni GLB failed to load:', err));
  }
}

// ── Fit a loaded model into a target size ──
function fitModel(group, targetSize) {
  const box    = new THREE.Box3().setFromObject(group);
  const size   = box.getSize(new THREE.Vector3());
  const scale  = targetSize / Math.max(size.x, size.y, size.z);
  group.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3());
  group.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
}

// ── Invert all mesh material colors ────────
function setInverted(group, on) {
  group.traverse(child => {
    if (!child.isMesh) return;
    const m = child.material;
    if (on) {
      m.userData.origColor    = m.color.clone();
      m.userData.origEmissive = m.emissive.clone();
      m.color.setRGB(0, 0, 0);
      m.emissive.setRGB(0, 0, 0);
      m.needsUpdate = true;
    } else {
      if (m.userData.origColor)    m.color.copy(m.userData.origColor);
      if (m.userData.origEmissive) m.emissive.copy(m.userData.origEmissive);
      m.needsUpdate = true;
    }
  });
}

// ── Mask glitch loop ─────────────────────
function glitchLoop() {
  if (_glitching) return;
  _glitching = true;

  const holdMs  = 300 + Math.random() * 400; // 300–700 ms
  const useDemon = _demonGroup && Math.random() < 0.55;

  if (useDemon) {
    _maskGroup.visible = false;
    _demonGroup.visible = true;
    _oniLight.visible = true;

    setTimeout(() => {
      _demonGroup.visible = false;
      _oniLight.visible = false;
      _maskGroup.visible = true;
      _glitching = false;
    }, holdMs);
  } else {
    // Invert cat mask colors
    setInverted(_maskGroup, true);

    setTimeout(() => {
      setInverted(_maskGroup, false);
      _glitching = false;
    }, holdMs);
  }

  // Schedule next glitch — ~15 s (12–18 s)
  setTimeout(glitchLoop, 12000 + Math.random() * 6000);
}
