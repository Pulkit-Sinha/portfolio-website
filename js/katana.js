// ============================================
// KATANA — Three.js scene + GLB model + slash
// ============================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.18.1/meshopt_decoder.module.js';

const RISE_DURATION = 1.20; // seconds — blade rises from below to centre

// Rotation about the blade's length axis: start face-on (flat toward camera),
// end edge-on (edge toward camera) just before the cut.
const FACE_ROT_Z = -Math.PI / 2;  // start: flat of blade faces screen
const EDGE_ROT_Z = -Math.PI;      // end:   edge faces screen (cut pose)

let _scene, _camera, _renderer;
let _outerGroup, _katanaGroup;
let _isSlashing   = false;
let _riseProgress = 0;     // 0→1, exported for bar sync

// Reusable temps to avoid per-frame allocation during re-centring
const _tmpBox = new THREE.Box3();
const _tmpVec = new THREE.Vector3();

// Re-centre the sword horizontally at world x = 0 given its CURRENT rotation.
// The model is slightly asymmetric, so the bounding-box centre shifts during
// the face→edge rotation. Calling this each frame keeps the visible centre
// pinned, so the rise looks purely vertical.
function recentreX() {
  if (!_outerGroup) return;
  _outerGroup.position.x = 0;
  _outerGroup.updateWorldMatrix(true, true);
  _tmpBox.setFromObject(_outerGroup);
  _outerGroup.position.x = -_tmpBox.getCenter(_tmpVec).x;
}

// ─── PUBLIC API ────────────────────────────

/** 0→1 progress of the blade rise. Exported so loader can sync its bar. */
export function getSpinProgress() {
  return _riseProgress;
}

export function initKatana() {
  const canvas = document.getElementById('katana-canvas');

  _scene = new THREE.Scene();

  _camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  _camera.position.set(0, 0, 9);

  _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setSize(window.innerWidth, window.innerHeight);
  _renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.8;
  _renderer.outputColorSpace    = THREE.SRGBColorSpace;

  _scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const keyLight = new THREE.DirectionalLight(0xffffff, 5);
  keyLight.position.set(3, 5, 4);
  _scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x99bbff, 3);
  rimLight.position.set(-4, 2, 2);
  _scene.add(rimLight);

  const redFill = new THREE.PointLight(0xff1919, 2, 10);
  redFill.position.set(0, -3, 4);
  _scene.add(redFill);

  // Render loop — just renders, no per-frame transform needed
  (function tick() {
    requestAnimationFrame(tick);
    _renderer.render(_scene, _camera);
  })();

  window.addEventListener('resize', () => {
    _camera.aspect = window.innerWidth / window.innerHeight;
    _camera.updateProjectionMatrix();
    _renderer.setSize(window.innerWidth, window.innerHeight);
  });

  loadKatana();
}

function loadKatana() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  loader.load(
    './assets/models/katana.glb',
    (gltf) => {
      _katanaGroup = gltf.scene;

      // Fit model to 7 world units along longest axis
      _katanaGroup.position.set(0, 0, 0);
      _katanaGroup.scale.setScalar(1);
      _katanaGroup.rotation.set(0, 0, 0);

      const box    = new THREE.Box3().setFromObject(_katanaGroup);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale  = 7.0 / Math.max(size.x, size.y, size.z);
      _katanaGroup.scale.setScalar(scale);
      _katanaGroup.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

      // Outer group orientation: blade vertical, face toward camera
      _outerGroup = new THREE.Group();
      _outerGroup.rotation.set(Math.PI / 2, Math.PI, 0);
      _outerGroup.add(_katanaGroup);
      _scene.add(_outerGroup);

      // Start at face-on pose (flat of blade toward camera)
      _katanaGroup.rotation.z = FACE_ROT_Z;
      // Centre horizontally for this pose; riseKatana re-centres each frame
      // so the blade stays pinned at x = 0 throughout the rotation.
      recentreX();

      // Start below the visible viewport
      _outerGroup.position.y = -9;

      // Hide mesh, then fade in + rise
      _katanaGroup.traverse(child => {
        if (child.isMesh) {
          child.material.transparent = true;
          child.material.opacity = 0;
        }
      });

      setTimeout(riseKatana, 150);
    },
    undefined,
    (err) => console.warn('Katana GLB not found:', err)
  );
}

function riseKatana() {
  if (!_katanaGroup) return;

  // Fade blade in over the first part of the rise
  _katanaGroup.traverse(child => {
    if (child.isMesh) {
      gsap.to(child.material, { opacity: 0.75, duration: 0.55, ease: 'power2.out' });
    }
  });

  // Rise from y = -9 to y = 0, tracking progress for the bar
  gsap.fromTo(
    _outerGroup.position,
    { y: -9 },
    {
      y: 0,
      duration: RISE_DURATION,
      ease: 'power3.out',
      onUpdate: function () { _riseProgress = this.progress(); },
      onComplete: ()        => { _riseProgress = 1; },
    }
  );

  // Rotate face→edge as it rises, re-centring horizontally each frame so the
  // blade stays pinned at world x = 0 regardless of model asymmetry.
  gsap.fromTo(
    _katanaGroup.rotation,
    { z: FACE_ROT_Z },
    {
      z: EDGE_ROT_Z,
      duration: RISE_DURATION,
      ease: 'power3.out',
      onUpdate: recentreX,
    }
  );
}

// ─── SLASH TRIGGER ─────────────────────────

export function triggerSlash(onComplete) {
  if (_isSlashing) return;
  _isSlashing = true;

  if (!_katanaGroup) {
    doScreenSplit(onComplete);
    return;
  }

  // Sword is already edge-on — brief hold then cut
  const tl = gsap.timeline();
  tl.to({}, { duration: 0.20 });
  tl.call(() => doScreenSplit(onComplete));
  return tl;
}

// ─── SCREEN SPLIT (vertical) ───────────────

function doScreenSplit(onComplete) {
  const overlay = document.getElementById('slash-overlay');
  const seam    = document.getElementById('slash-seam');
  const left    = document.getElementById('slash-left');
  const right   = document.getElementById('slash-right');
  const loader  = document.getElementById('loader');
  const main    = document.getElementById('main');
  const katana  = document.getElementById('katana-canvas');

  overlay.style.display = 'block';
  // Hide the sword the instant the red halves cover it, so it can't reappear
  // underneath when the halves fade.
  if (katana) katana.style.display = 'none';
  if (loader) loader.style.display = 'none';
  if (main)   gsap.set(main, { opacity: 1 });

  const splitTl = gsap.timeline({
    onComplete: () => {
      overlay.style.display = 'none';
      if (onComplete) onComplete();
    }
  });

  splitTl.to(seam,          { opacity: 1, duration: 0.025 }, 0);
  splitTl.to(seam,          { opacity: 0, duration: 0.175 }, 0.05);
  splitTl.to([left, right], { opacity: 0, duration: 0.15, ease: 'power2.in' }, 0.10);

  return splitTl;
}
