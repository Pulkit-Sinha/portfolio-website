// ============================================
// FLUID SIMULATION — Navier-Stokes, red/black
// Adapted from PavelDoGreat/WebGL-Fluid-Simulation (MIT)
// ============================================

export function initFluid () {
  const section = document.querySelector('#education');
  if (!section) return;

  // ── Canvas ───────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;pointer-events:none;mix-blend-mode:difference;filter:blur(8px);';
  section.prepend(canvas);

  // ── Config ───────────────────────────────
  const SIM_RESOLUTION   = 128;
  const DYE_RESOLUTION   = 1024;
  const DENSITY_DISS     = 1.2;   // slower dye fade — lasts ~3× longer than before
  const VELOCITY_DISS    = 0.4;   // velocity persists much longer → dye keeps stretching
  const PRESSURE_COEFF   = 0.8;
  const PRESSURE_ITERS   = 20;
  const CURL_STR         = 18;    // higher vorticity → tight, elongated tendrils
  const isMobileDevice   = window.matchMedia('(max-width: 768px)').matches;
  const SPLAT_RADIUS     = isMobileDevice ? 0.002 : 0.02;
  const SPLAT_FORCE      = 10000; // more initial momentum → streaks further on each movement

  // ── WebGL ────────────────────────────────
  const ctxOpts = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let gl = canvas.getContext('webgl2', ctxOpts);
  const isWebGL2 = !!gl;
  if (!isWebGL2) gl = canvas.getContext('webgl', ctxOpts) || canvas.getContext('experimental-webgl', ctxOpts);
  if (!gl) { canvas.remove(); return; }

  let halfFloat, supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
    if (!halfFloat) { canvas.remove(); return; }
  }
  const HALF_FLOAT = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

  // ── Texture format detection ─────────────
  function supportsFBOFormat (iFmt, fmt, type) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, iFmt, 4, 4, 0, fmt, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  function getSupportedFormat (iFmt, fmt) {
    if (!supportsFBOFormat(iFmt, fmt, HALF_FLOAT)) {
      if (iFmt === gl.R16F)  return getSupportedFormat(gl.RG16F,   gl.RG);
      if (iFmt === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA);
      return null;
    }
    return { internalFormat: iFmt, format: fmt };
  }

  let formatRGBA, formatRG, formatR;
  if (isWebGL2) {
    formatRGBA = getSupportedFormat(gl.RGBA16F, gl.RGBA);
    formatRG   = getSupportedFormat(gl.RG16F,   gl.RG);
    formatR    = getSupportedFormat(gl.R16F,     gl.RED);
  } else {
    formatRGBA = formatRG = formatR = { internalFormat: gl.RGBA, format: gl.RGBA };
  }
  if (!formatRGBA) { canvas.remove(); return; }

  // ── Shader / program helpers ─────────────
  function compileShader (type, source, keywords) {
    if (keywords) source = keywords.map(k => `#define ${k}`).join('\n') + '\n' + source;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  }

  class Program {
    constructor (vs, fs) {
      this.program  = gl.createProgram();
      this.uniforms = {};
      gl.attachShader(this.program, vs);
      gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);
      const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(this.program, i);
        this.uniforms[info.name] = gl.getUniformLocation(this.program, info.name);
      }
    }
    bind () { gl.useProgram(this.program); }
  }

  // ── Shaders ──────────────────────────────
  const baseVS = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `);

  const clearProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `));

  const displayProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main () {
      float i = texture2D(uTexture, vUv).r;
      gl_FragColor = vec4(i, i, i, i);
    }
  `));

  const splatProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base  = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `));

  const advectionProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st  = uv / tsize - 0.5;
      vec2 iuv = floor(st);
      vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord   = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result  = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord   = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result  = texture2D(uSource, coord);
    #endif
      float decay  = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }
  `, supportLinearFiltering ? null : ['MANUAL_FILTERING']));

  const divergenceProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;
    varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2  C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }
  `));

  const curlProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;
    varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }
  `));

  const vorticityProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
    }
  `));

  const pressureProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;
    varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float C = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - C) * 0.25, 0.0, 0.0, 1.0);
    }
  `));

  const gradSubtractProg = new Program(baseVS, compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR;
    varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      gl_FragColor = vec4(vel - vec2(R - L, T - B), 0.0, 1.0);
    }
  `));

  // ── Fullscreen quad ──────────────────────
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit (target) {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  // ── FBO helpers ──────────────────────────
  function createFBO (w, h, iFmt, fmt, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, iFmt, w, h, 0, fmt, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const tsX = 1.0 / w, tsY = 1.0 / h;
    return {
      texture: tex, fbo,
      width: w, height: h,
      texelSizeX: tsX, texelSizeY: tsY,
      attach (id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        return id;
      }
    };
  }

  function createDoubleFBO (w, h, iFmt, fmt, type, filter) {
    let a = createFBO(w, h, iFmt, fmt, type, filter);
    let b = createFBO(w, h, iFmt, fmt, type, filter);
    return {
      width: w, height: h,
      texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
      get read  () { return a; },
      get write () { return b; },
      swap ()     { [a, b] = [b, a]; }
    };
  }

  // ── Framebuffer init / resize ────────────
  let velocity, dye, pressure, divergence, curlFBO;

  function getResolution (res) {
    const aspect = canvas.width / canvas.height;
    return aspect >= 1
      ? { width: Math.round(res * aspect), height: res }
      : { width: res, height: Math.round(res / aspect) };
  }

  function initFramebuffers () {
    const simRes = getResolution(SIM_RESOLUTION);
    const dyeRes = getResolution(DYE_RESOLUTION);
    const dyeFilter = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    velocity   = createDoubleFBO(simRes.width, simRes.height, formatRG.internalFormat,   formatRG.format,   HALF_FLOAT, gl.NEAREST);
    dye        = createDoubleFBO(dyeRes.width, dyeRes.height, formatRGBA.internalFormat, formatRGBA.format, HALF_FLOAT, dyeFilter);
    pressure   = createDoubleFBO(simRes.width, simRes.height, formatR.internalFormat,    formatR.format,    HALF_FLOAT, gl.NEAREST);
    divergence = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, HALF_FLOAT, gl.NEAREST);
    curlFBO    = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, HALF_FLOAT, gl.NEAREST);
  }

  function resizeCanvas () {
    const w = section.clientWidth, h = section.clientHeight;
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w; canvas.height = h;
    return true;
  }

  resizeCanvas();
  initFramebuffers();

  // ── Color: pure red ─────────────────────
  // With mix-blend-mode: difference, red on dark bg = red, red on red bg = black
  function generateColor () {
    return { r: 1.0, g: 0.0, b: 0.0 };
  }

  function correctRadius (r) {
    const aspect = canvas.width / canvas.height;
    if (aspect > 1) return r / aspect;  // landscape: shrink X so splat stays circular
    return r * aspect;                  // portrait: shrink radius so shader's p.x*=aspect stays circular
  }

  // ── Splat ────────────────────────────────
  function splat (x, y, dx, dy, color) {
    const aspect = canvas.width / canvas.height;

    splatProg.bind();
    gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProg.uniforms.aspectRatio, aspect);
    gl.uniform2f(splatProg.uniforms.point, x, y);
    gl.uniform3f(splatProg.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProg.uniforms.radius, correctRadius(SPLAT_RADIUS));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProg.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function multipleSplats (count) {
    for (let i = 0; i < count; i++) {
      const c  = generateColor();
      const x  = Math.random();
      const y  = Math.random();
      const dx = 1000 * (Math.random() - 0.5);
      const dy = 1000 * (Math.random() - 0.5);
      splat(x, y, dx, dy, { r: c.r, g: c.g, b: c.b });
    }
  }

  // ── Simulation step ──────────────────────
  function step (dt) {
    gl.disable(gl.BLEND);

    curlProg.bind();
    gl.uniform2f(curlProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0));
    blit(curlFBO);

    vorticityProg.bind();
    gl.uniform2f(vorticityProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProg.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProg.uniforms.uCurl, curlFBO.attach(1));
    gl.uniform1f(vorticityProg.uniforms.curl, CURL_STR);
    gl.uniform1f(vorticityProg.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProg.bind();
    gl.uniform2f(divergenceProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProg.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProg.bind();
    gl.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProg.uniforms.value, PRESSURE_COEFF);
    blit(pressure.write);
    pressure.swap();

    pressureProg.bind();
    gl.uniform2f(pressureProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProg.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < PRESSURE_ITERS; i++) {
      gl.uniform1i(pressureProg.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradSubtractProg.bind();
    gl.uniform2f(gradSubtractProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradSubtractProg.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradSubtractProg.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    // Advect velocity
    advectionProg.bind();
    gl.uniform2f(advectionProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering)
      gl.uniform2f(advectionProg.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const vid = velocity.read.attach(0);
    gl.uniform1i(advectionProg.uniforms.uVelocity, vid);
    gl.uniform1i(advectionProg.uniforms.uSource,   vid);
    gl.uniform1f(advectionProg.uniforms.dt, dt);
    gl.uniform1f(advectionProg.uniforms.dissipation, VELOCITY_DISS);
    blit(velocity.write);
    velocity.swap();

    // Advect dye
    if (!supportLinearFiltering)
      gl.uniform2f(advectionProg.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProg.uniforms.uSource,   dye.read.attach(1));
    gl.uniform1f(advectionProg.uniforms.dissipation, DENSITY_DISS);
    blit(dye.write);
    dye.swap();
  }

  // ── Render ───────────────────────────────
  function render () {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    displayProg.bind();
    gl.uniform1i(displayProg.uniforms.uTexture, dye.read.attach(0));
    blit(null);
  }

  // ── Mouse input ──────────────────────────
  const pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, moved: false };

  // Max delta per frame — prevents massive splats from jumps (mirrors armatrix approach)
  const MAX_DELTA = 0.012;

  function updatePointer(clientX, clientY) {
    const rect   = section.getBoundingClientRect();
    const nx     = (clientX - rect.left) / rect.width;
    const ny     = 1.0 - (clientY - rect.top) / rect.height;
    const aspect = canvas.width / canvas.height;
    const rdx    = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, nx - pointer.x));
    const rdy    = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, ny - pointer.y));
    pointer.dx    = rdx * SPLAT_FORCE;
    pointer.dy    = rdy * (aspect > 1 ? SPLAT_FORCE / aspect : SPLAT_FORCE);
    pointer.x     = nx;
    pointer.y     = ny;
    pointer.moved = Math.abs(rdx) > 0 || Math.abs(rdy) > 0;
  }

  function seedPointer(clientX, clientY) {
    const rect = section.getBoundingClientRect();
    pointer.x     = (clientX - rect.left) / rect.width;
    pointer.y     = 1.0 - (clientY - rect.top) / rect.height;
    pointer.dx    = 0;
    pointer.dy    = 0;
    pointer.moved = false;
  }

  section.addEventListener('mousemove', e => updatePointer(e.clientX, e.clientY));

  // Always seed on touchstart — no isVisible guard, so scrolling into the section
  // from above doesn't produce a huge jump-delta on the first touchmove.
  window.addEventListener('touchstart', e => {
    seedPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!isVisible) {
      // Keep seeding while not visible so position stays current
      seedPointer(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    updatePointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // ── Color generator ──────────────────────
  // Full saturation, medium-high brightness → vivid on dark bg via difference blend;
  // automatically transforms to a different complementary hue on red/cream bg.
  function randomColor() {
    const h = Math.random();
    const s = 0.9 + Math.random() * 0.1;   // 0.90 – 1.00
    const v = 0.70 + Math.random() * 0.20; // 0.70 – 0.90
    // HSV → RGB
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r=v; g=t; b=p; break;
      case 1: r=q; g=v; b=p; break;
      case 2: r=p; g=v; b=t; break;
      case 3: r=p; g=q; b=v; break;
      case 4: r=t; g=p; b=v; break;
      case 5: r=v; g=p; b=q; break;
    }
    return { r, g, b };
  }

  // ── Animation loop ───────────────────────
  let lastTime  = performance.now();
  let isVisible = false;

  const observer = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
  }, { threshold: 0.05 });
  observer.observe(section);

  function tick (now) {
    requestAnimationFrame(tick);

    const dt = Math.min((now - lastTime) / 1000.0, 1.0 / 60.0);
    lastTime = now;

    if (!isVisible) return;
    if (resizeCanvas()) initFramebuffers();

    if (pointer.moved) {
      splat(pointer.x, pointer.y, pointer.dx, pointer.dy, randomColor());
      pointer.moved = false;
    }

    step(dt);
    render();
  }

  requestAnimationFrame(tick);
}
