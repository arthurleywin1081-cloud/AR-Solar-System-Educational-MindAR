// ============================================================
// main.js — AR Solar System (Educational)
//
// SPEC IMPLEMENTATION: solar-system-prompt_2.md
//
// §1 Timing:   SECONDS_PER_SIM_DAY = 2; all periods derived from it.
//              Sun differential rotation by latitude.
//              Moon 5.1° orbital tilt. Fixed world-space tilt axis.
// §2 Eclipse:  Demo mode with solar/lunar selection, eased alignment,
//              shadows, info bubble, exit-only button.
// §3 Zoom:     Speed reduced to 45% (ZOOM_SPEED = 0.45).
// §4 Seasons:  Perihelion = NH winter. Fixed tilt. Kepler speed variation.
//              Ellipse with Sun at focus.
// §5 Time:     Single SECONDS_PER_SIM_DAY constant drives everything.
// ============================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MindARThree } from "mindar-image-three";

// =============================================================
// §5 — GLOBAL TIME SCALE
// 1 simulated Earth day = 2 real seconds.
// Every period is derived from this single constant.
// =============================================================
const SECONDS_PER_SIM_DAY = 1;

// Real-world periods in Earth days → simulated seconds
const EARTH_ROT_PERIOD    = 1.0      * SECONDS_PER_SIM_DAY;  // 2.0s
const EARTH_ORBIT_PERIOD  = 365.25   * SECONDS_PER_SIM_DAY;  // 730.5s
const MOON_ORBIT_PERIOD   = 27.3     * SECONDS_PER_SIM_DAY;  // 54.6s
const MOON_ROT_PERIOD     = 27.3     * SECONDS_PER_SIM_DAY;  // 54.6s (tidally locked)
const SUN_ROT_EQUATOR     = 25.0     * SECONDS_PER_SIM_DAY;  // 50.0s
const SUN_ROT_POLE        = 34.5     * SECONDS_PER_SIM_DAY;  // 69.0s

// Scale & geometry constants
// Fix 3: Scale up from current baseline (SUN was 2.25, EARTH was 0.6, MOON was 0.2)
// Sun +30%, Earth +25%, Moon +25%
const SUN_RADIUS         = 2.925;  // 2.25 × 1.30
const EARTH_RADIUS       = 1.0;   // 0.6  × 1.25
const MOON_RADIUS        = 0.45;   // 0.2  × 1.25
const EARTH_ORBIT_RADIUS = 12.0;
const MOON_ORBIT_RADIUS  = 3.0;
const EARTH_AXIAL_TILT_RAD = THREE.MathUtils.degToRad(23.5);
const MOON_ORBITAL_TILT_RAD = THREE.MathUtils.degToRad(5.1);

// §4 — Elliptical orbit constants
// Eccentricity is visually exaggerated beyond real (~0.017) so the
// ellipse shape is clearly visible when tilting to view from above.
// This is intentional artistic choice, not a bug.
const ORBIT_A    = EARTH_ORBIT_RADIUS;            // semi-major axis
const ORBIT_B    = EARTH_ORBIT_RADIUS * 0.99;     // semi-minor axis (visible ellipse)
const ORBIT_FOCUS = Math.sqrt(ORBIT_A**2 - ORBIT_B**2); // focus offset

// §4 — Kepler's second law: angular velocity varies with distance.
// At angle θ on the ellipse, radius r = a(1-e²)/(1+e·cos θ).
// We use a simple approximation: speed ∝ 1/r² (true anomaly speed).
const ORBIT_ECC  = Math.sqrt(1 - (ORBIT_B/ORBIT_A)**2); // eccentricity

function orbitRadius(theta) {
  // Polar form of ellipse relative to focus: r = a(1-e²)/(1+e·cos θ)
  return (ORBIT_A * (1 - ORBIT_ECC**2)) / (1 + ORBIT_ECC * Math.cos(theta));
}

// §4 — Earth starts at perihelion (θ=0, closest to Sun = NH winter)
// NH winter at perihelion matches the real Jan 3 perihelion date.
let earthOrbitAngle = 0; // true anomaly, 0 = perihelion

// Spin multiplier when zoomed in
const ZOOM_SPIN_FACTOR = 0.25;

// ---------- Renderer ----------
const canvas = document.getElementById("scene-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.05, 1000);
// Fix 3: pushed back to frame the enlarged (12-unit radius) elliptical orbit
camera.position.set(0, 10, 28);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance    = 3;
controls.maxDistance    = 90; // Fix 3: enlarged to frame 12-unit orbit
controls.target.set(0, 0, 0);

// ---------- Lighting ----------
const ambient = new THREE.AmbientLight(0x223355, 0.25);
scene.add(ambient);

// Sun light placed at focus of the ellipse
const sunLight = new THREE.PointLight(0xfff4e5, 2.5, 0, 0);
sunLight.position.set(ORBIT_FOCUS, 0, 0);
scene.add(sunLight);

// =============================================================
// TEXTURES
// =============================================================
const loader = new THREE.TextureLoader();
function loadTex(f) {
  return loader.load("textures/"+f, undefined, undefined,
    ()=>console.warn("Texture missing: "+f));
}

const texSun        = loadTex("sun.jpg");
const texEarthDay   = loadTex("earth_day.jpg");
const texEarthNight = loadTex("earth_night.jpg");
const texEarthBump  = loadTex("earth_bump.jpg");
const texMoon       = loadTex("moon.jpg");
const texMilkyWay   = loadTex("milkyway.jpg");

[texSun, texEarthDay, texEarthNight, texMoon, texMilkyWay].forEach(t => {
  t.colorSpace = THREE.SRGBColorSpace;
});

// =============================================================
// MILKY WAY
// =============================================================
const milkyWaySphere = new THREE.Mesh(
  new THREE.SphereGeometry(500, 64, 64),
  new THREE.MeshBasicMaterial({ map: texMilkyWay, side: THREE.BackSide })
);
scene.add(milkyWaySphere);

// =============================================================
// SUN — textured sphere + differential-rotation flare spikes
// =============================================================
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 48, 48),
  new THREE.MeshBasicMaterial({ map: texSun })
);
sun.position.set(ORBIT_FOCUS, 0, 0); // Sun at ellipse focus
scene.add(sun);

// §1 — Sun differential rotation:
// The Sun is split into latitude bands, each rotating at a different rate.
// We simulate this by storing a per-flare latitude and interpolating
// rotation speed between equator (25 days) and pole (34.5 days).
const flares = [];
for (let i = 0; i < 8; i++) {
  const fGeo = new THREE.SphereGeometry(0.18, 8, 16);
  fGeo.scale(1, 3.5, 1);
  const flare = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0.7,
  }));
  const angle = (i / 8) * Math.PI * 2;
  flare.rotation.z = angle;
  flare.position.set(
    ORBIT_FOCUS + Math.cos(angle) * SUN_RADIUS * 0.95,
    Math.sin(angle) * SUN_RADIUS * 0.95, 0
  );
  flare.userData.phase     = (i / 8) * Math.PI * 2;
  flare.userData.baseAngle = angle;
  scene.add(flare);
  flares.push(flare);
}

// §1 — Sun differential rotation angle accumulator per latitude band.
// We track 8 latitude bands from equator (0) to pole (π/2).
// Each band has its own accumulated rotation angle.
const sunLatBands = 8;
const sunBandAngles = new Float32Array(sunLatBands).fill(0);

function getSunBandPeriod(bandIndex) {
  // Interpolate between equator period and pole period by latitude fraction
  const latFrac = bandIndex / (sunLatBands - 1); // 0=equator, 1=pole
  return SUN_ROT_EQUATOR + (SUN_ROT_POLE - SUN_ROT_EQUATOR) * latFrac;
}

// =============================================================
// EARTH — displacement mapping + day/night GLSL3 shader
// §1 — Fixed world-space tilt axis (NOT extracted from rotating matrix)
// =============================================================
const earthMat = new THREE.ShaderMaterial({
  uniforms: {
    dayTex:           { value: texEarthDay   },
    nightTex:         { value: texEarthNight },
    bumpTex:          { value: texEarthBump  },
    displacementScale:{ value: 0.018         },
    sunDir:           { value: new THREE.Vector3(1, 0, 0) },
    // Eclipse shadow uniforms — used in §2
    eclipseMode:      { value: 0   }, // 0=none, 1=solar shadow on Earth
    shadowCenter:     { value: new THREE.Vector2(0.5, 0.5) },
    shadowRadius:     { value: 0.08 },
    shadowOpacity:    { value: 0.0  },
  },
  vertexShader: `
    precision highp float;
    uniform sampler2D bumpTex;
    uniform float     displacementScale;
    out vec2 vUv;
    out vec3 vWorldNormal;
    out vec3 vWorldPos;
    void main() {
      vUv = uv;
      float elevation = texture(bumpTex, uv).r;
      vec3 displaced  = position + normal * elevation * displacementScale;
      vWorldNormal    = normalize(mat3(modelMatrix) * normal);
      vWorldPos       = (modelMatrix * vec4(displaced, 1.0)).xyz;
      gl_Position     = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D dayTex;
    uniform sampler2D nightTex;
    uniform sampler2D bumpTex;
    uniform vec3      sunDir;
    uniform int       eclipseMode;
    uniform vec2      shadowCenter;
    uniform float     shadowRadius;
    uniform float     shadowOpacity;
    in vec2 vUv;
    in vec3 vWorldNormal;
    in vec3 vWorldPos;
    out vec4 fragColor;

    vec3 bumpedNormal(vec3 N, vec2 uv) {
      float du = 1.0/2048.0; float dv = 1.0/1024.0;
      float h0 = texture(bumpTex, uv).r;
      float hu = texture(bumpTex, uv+vec2(du,0.0)).r;
      float hv = texture(bumpTex, uv+vec2(0.0,dv)).r;
      float su = (hu-h0)*1.5; float sv = (hv-h0)*1.5;
      vec3 tU = normalize(cross(N, vec3(0.0,1.0,0.001)));
      vec3 tV = normalize(cross(tU, N));
      return normalize(N + su*tU + sv*tV);
    }

    void main() {
      vec3  N      = bumpedNormal(normalize(vWorldNormal), vUv);
      float d      = dot(N, normalize(sunDir));
      float blend  = smoothstep(-0.6, 0.6, d);
      vec4  day    = texture(dayTex, vUv);
      vec4  night  = texture(nightTex, vUv);
      vec3  nightB = night.rgb + vec3(0.04, 0.045, 0.06);
      vec3  col    = mix(nightB, day.rgb, blend);

      // §2 Solar eclipse: render Moon's shadow (umbra+penumbra) on Earth
      if (eclipseMode == 1) {
        float dist  = distance(vUv, shadowCenter);
        float umbra = 1.0 - smoothstep(0.0, shadowRadius*0.5, dist);
        float penum = 1.0 - smoothstep(shadowRadius*0.5, shadowRadius, dist);
        float shadow = umbra*0.5 + penum*0.25;
        col = col * (1.0 - shadow * shadowOpacity);
      }

      fragColor = vec4(col, 1.0);
    }
  `,
  glslVersion: THREE.GLSL3,
});

// earthAnchor: moves Earth along the ellipse. No tilt applied here.
const earthAnchor = new THREE.Object3D();
scene.add(earthAnchor);

// Fix 2a: Two-level hierarchy — tilt on earthTiltGroup (fixed, set once),
// spin on earth mesh (rotation.y only, unambiguous direction).
// earth.rotation.z is now 0; only earthTiltGroup.rotation.z carries the tilt.
const earthTiltGroup = new THREE.Object3D();
earthTiltGroup.rotation.z = -EARTH_AXIAL_TILT_RAD; // fixed, never modified again
earthAnchor.add(earthTiltGroup);

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 256, 256),
  earthMat
);
// earth.rotation.z intentionally left at 0 — tilt lives on earthTiltGroup
earthTiltGroup.add(earth);

function updateEarthSunDir(dir) {
  earthMat.uniforms.sunDir.value.copy(dir);
}

// =============================================================
// MOON — with 5.1° orbital tilt relative to ecliptic
// §1 — Moon orbital tilt means eclipses don't happen every month
// =============================================================

// §2 — Eclipse shadow material on Moon (lunar eclipse — neutral dark overlay, no red tint)
const moonEclipseMat = new THREE.MeshBasicMaterial({
  color: 0x111111, transparent: true, opacity: 0.0, depthWrite: false,
});
const moonEclipseSphere = new THREE.Mesh(
  new THREE.SphereGeometry(MOON_RADIUS * 1.01, 32, 32),
  moonEclipseMat
);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(MOON_RADIUS, 32, 32),
  new THREE.MeshStandardMaterial({ map: texMoon, roughness: 0.9 })
);
moon.position.set(MOON_ORBIT_RADIUS, 0, 0);
moon.add(moonEclipseSphere);

// Moon orbit group: apply 5.1° tilt to the orbital plane
const moonOrbitTiltGroup = new THREE.Group();
moonOrbitTiltGroup.rotation.x = MOON_ORBITAL_TILT_RAD;
earthAnchor.add(moonOrbitTiltGroup);

const moonOrbitPivot = new THREE.Object3D();
moonOrbitTiltGroup.add(moonOrbitPivot);
moonOrbitPivot.add(moon);

// =============================================================
// ORBIT RINGS
// =============================================================
function makeOrbitRing(radius, color, opacity) {
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const t = (i/128)*Math.PI*2;
    pts.push(new THREE.Vector3(Math.cos(t)*radius, 0, Math.sin(t)*radius));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent:true, opacity })
  );
}

// §4 — Elliptical Earth orbit ring, Sun at focus
function makeEllipseRing(a, b, color, opacity) {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const t = (i/256)*Math.PI*2;
    pts.push(new THREE.Vector3(Math.cos(t)*a, 0, Math.sin(t)*b));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent:true, opacity })
  );
}

scene.add(makeEllipseRing(ORBIT_A, ORBIT_B, 0x4477aa, 0.35));
earthAnchor.add(makeOrbitRing(MOON_ORBIT_RADIUS, 0x888888, 0.3));

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================
// §4 — SEASON DATA
// Perihelion (θ=0) = NH Winter/SH Summer per the real Jan 3 perihelion.
// Info bubble text explicitly avoids "closer = summer" misconception.
// =============================================================
const SEASON_DATA = [
  { // θ ≈ 0 — perihelion, closest to Sun — NH Winter
    north: "Musim Sejuk", south: "Musim Panas",
    northDetail: "Kutub Utara condong menjauhi Matahari. Hemisfera Utara menerima cahaya matahari pada sudut yang condong dengan siang yang lebih singkat — kurang tenaga sampai ke permukaan, menyebabkan suhu lebih sejuk. Nota: Bumi sebenarnya paling hampir dengan Matahari sekarang (perihelion, ~3 Jan) — musim disebabkan oleh kecondongan paksi, bukan jarak.",
    southDetail: "Kutub Selatan condong ke arah Matahari. Hemisfera Selatan menerima cahaya matahari pada sudut yang lebih tegak dengan siang yang lebih panjang — lebih banyak tenaga per meter persegi bermakna suhu lebih panas.",
  },
  { // θ ≈ π/2 — March equinox
    north: "Musim Bunga", south: "Musim Luruh",
    northDetail: "Paksi kecondongan Bumi berada condong ke tepi berbanding Matahari. Hemisfera Utara beralih daripada kesejukan musim sejuk kepada kehangatan musim panas apabila siang semakin panjang. Siang dan malam hampir sama panjang di seluruh dunia (ekuinoks, ~20 Mac).",
    southDetail: "Paksi kecondongan Bumi berada condong ke tepi berbanding Matahari. Hemisfera Selatan beralih daripada kehangatan musim panas kepada kesejukan musim sejuk apabila siang semakin pendek.",
  },
  { // θ ≈ π — aphelion, farthest from Sun — NH Summer
    north: "Musim Panas", south: "Musim Sejuk",
    northDetail: "Kutub Utara condong ke arah Matahari. Hemisfera Utara menerima cahaya matahari pada sudut yang lebih tegak dengan siang yang lebih panjang — lebih banyak tenaga per meter persegi bermakna suhu lebih tinggi. Nota: Bumi sebenarnya paling jauh daripada Matahari sekarang (aphelion, ~4 Jul) — kecondongan paksi, bukan jarak, yang menentukan musim.",
    southDetail: "Kutub Selatan condong menjauhi Matahari. Hemisfera Selatan menerima cahaya matahari pada sudut yang condong dengan siang yang lebih singkat — kurang tenaga sampai ke permukaan, jadi suhu lebih rendah.",
  },
  { // θ ≈ 3π/2 — September equinox
    north: "Musim Luruh", south: "Musim Bunga",
    northDetail: "Paksi kecondongan Bumi berada condong ke tepi berbanding Matahari. Hemisfera Utara beralih daripada kehangatan musim panas kepada kesejukan musim sejuk apabila siang semakin pendek. Siang dan malam hampir sama panjang di seluruh dunia (ekuinoks, ~22 Sep).",
    southDetail: "Paksi kecondongan Bumi berada condong ke tepi berbanding Matahari. Hemisfera Selatan beralih daripada kesejukan musim sejuk kepada kehangatan musim panas apabila siang semakin panjang.",
  },
];

function getSeasonData(angle) {
  const norm = ((angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  return SEASON_DATA[Math.floor((norm/(Math.PI*2))*4)%4];
}

const seasonLabel = document.getElementById("season-label");
function updateSeasonLabel(angle) {
  const d = getSeasonData(angle);
  seasonLabel.textContent = "Hemisfera Utara: "+d.north+"  |  Hemisfera Selatan: "+d.south;
}

// =============================================================
// §3 — ZOOM STATE MACHINE
// Speed reduced to 45% (ZOOM_SPEED = 0.45) per spec §3
// =============================================================
let zoomState = "overview";
// Fix 3: updated to match new camera start position for enlarged orbit
const overviewCamPos    = new THREE.Vector3(0, 10, 28);
const overviewTarget    = new THREE.Vector3(0, 0, 0);
const ZOOM_DISTANCE     = EARTH_RADIUS * 3.5;
const ZOOM_SPEED        = 0.45; // §3: 45% speed — slower, more scenic
let   zoomT             = 0;

const _earthWorldPos   = new THREE.Vector3();
const _zoomStartCamPos = new THREE.Vector3();
const _zoomStartTarget = new THREE.Vector3();
const _zoomEndCamPos   = new THREE.Vector3();
const _zoomEndTarget   = new THREE.Vector3();
const raycaster        = new THREE.Raycaster();
const _pointer         = new THREE.Vector2();

function getEarthWorldPos() { earth.getWorldPosition(_earthWorldPos); return _earthWorldPos; }

function startZoomIn() {
  if (zoomState !== "overview") return;
  zoomState = "zooming"; zoomT = 0;
  _zoomStartCamPos.copy(camera.position);
  _zoomStartTarget.copy(controls.target);
  const ePos = getEarthWorldPos();
  _zoomEndTarget.copy(ePos);
  const dir = camera.position.clone().sub(ePos).normalize();
  _zoomEndCamPos.copy(ePos).addScaledVector(dir, ZOOM_DISTANCE);
  controls.enabled = false;
  // Fix 6: set permissive bounds NOW so controls.update() never clamps
  // the lerp path mid-tween. Final tight bounds applied in finishZoomIn().
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  document.getElementById("slider-panel").style.opacity = "0.3";
  document.getElementById("slider-panel").style.pointerEvents = "none";
}

function startZoomOut() {
  if (zoomState !== "earthview") return;
  zoomState = "zoomingout"; zoomT = 0;
  _zoomStartCamPos.copy(camera.position);
  _zoomStartTarget.copy(controls.target);
  _zoomEndCamPos.copy(overviewCamPos);
  _zoomEndTarget.copy(overviewTarget);
  controls.enabled = false;
  // Fix 6: relax to overview bounds immediately so the full pull-back path
  // is unobstructed by the tight earthview minDistance/maxDistance.
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  hideInfoBubble();
  hideEclipsePanel();
}

function finishZoomIn() {
  zoomState = "earthview";
  controls.target.copy(_zoomEndTarget);
  controls.minDistance = EARTH_RADIUS * 2;
  controls.maxDistance = EARTH_RADIUS * 16; // Fix 6: 2× the old zoom-out limit (was 8)
  controls.enabled = true;
  _earthPosInitialized = false;
  document.getElementById("zoom-hint").style.display = "block";
  document.getElementById("eclipse-demo-btn").style.display = "block";
  document.getElementById("earthview-exit-btn").style.display = "block";
  document.getElementById("season-info-btn").style.display = "flex";
  // Info bubble stays hidden — user opens it via the ⓘ button
}

function finishZoomOut() {
  zoomState = "overview";
  controls.target.copy(overviewTarget);
  controls.minDistance = 3;
  controls.maxDistance = 60;
  controls.enabled = true;
  document.getElementById("zoom-hint").style.display = "none";
  document.getElementById("eclipse-demo-btn").style.display = "none";
  document.getElementById("earthview-exit-btn").style.display = "none";
  document.getElementById("season-info-btn").style.display = "none";
  document.getElementById("eclipse-info-btn").style.display = "none";
  hideInfoBubble();
  document.getElementById("slider-panel").style.opacity = "1";
  document.getElementById("slider-panel").style.pointerEvents = "auto";
}

function easeInOut(t) { return t<0.5?2*t*t:-1+(4-2*t)*t; }

function tickZoom(delta) {
  if (zoomState!=="zooming"&&zoomState!=="zoomingout") return;
  zoomT = Math.min(1, zoomT+delta*ZOOM_SPEED);
  const e = easeInOut(zoomT);
  camera.position.lerpVectors(_zoomStartCamPos, _zoomEndCamPos, e);
  controls.target.lerpVectors(_zoomStartTarget, _zoomEndTarget, e);
  camera.lookAt(controls.target);
  if (zoomT>=1) {
    if (zoomState==="zooming")    finishZoomIn();
    if (zoomState==="zoomingout") finishZoomOut();
  }
}

// =============================================================
// INFO BUBBLE
// =============================================================
const infobubble      = document.getElementById("infobubble");
const infobubbleTitle = document.getElementById("infobubble-title");
const infobubbleText  = document.getElementById("infobubble-text");
const infobubbleClose = document.getElementById("infobubble-close");

function showInfoBubble() {
  const d = getSeasonData(earthOrbitAngle);
  infobubbleTitle.textContent = "Kenapa Musim Berlaku — Sekarang";
  infobubbleText.innerHTML =
    `<strong>🌍 Hemisfera Utara: ${d.north}</strong><br>${d.northDetail}<br><br>`+
    `<strong>🌏 Hemisfera Selatan: ${d.south}</strong><br>${d.southDetail}<br><br>`+
    `<em>Musim disebabkan oleh kecondongan paksi Bumi sebanyak 23.5° — bukan oleh jaraknya dari Matahari.</em>`;
  infobubble.style.display = "block";
  infobubble.style.left = "16px";
  infobubble.style.top  = "120px";
}

function hideInfoBubble() { infobubble.style.display = "none"; }

// ⓘ season info button — toggles the season bubble
const seasonInfoBtn = document.getElementById("season-info-btn");
seasonInfoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (infobubble.style.display === "none") {
    showInfoBubble();
  } else {
    hideInfoBubble();
  }
});

infobubbleClose.addEventListener("click", (e) => { e.stopPropagation(); hideInfoBubble(); });

// =============================================================
// §2 — ECLIPSE DEMO
//
// eclipsePhase: "none" | "solar" | "lunar"
// eclipseAlignT: 0→1, drives the eased alignment animation
// eclipseAligning: true while animation is running
//
// Solar eclipse: Moon moves to sit between Earth and Sun.
// Lunar eclipse: Moon moves to the opposite side of Earth from Sun.
//
// Own-axis rotations continue during eclipse; orbital revolution is paused.
// Exit ONLY via the exit button — no accidental tap-out.
// =============================================================
let eclipsePhase    = "none";
let eclipseAligning = false;
let eclipseAlignT   = 0;
const ECLIPSE_ALIGN_SPEED = 1/5; // 5-second ease-in-out (§2: 4-6s)

// Saved Moon angle before eclipse starts — restored on exit
let savedMoonOrbitAngle = 0;
const _moonTargetAngle  = { value: 0 }; // target angle for alignment anim
let   _moonStartAngle   = 0;

// Eclipse panel DOM
const eclipsePanel  = document.getElementById("eclipse-panel");
const eclipseExitBtn= document.getElementById("eclipse-exit");
const eclipseSolarBtn= document.getElementById("eclipse-solar");
const eclipseLunarBtn= document.getElementById("eclipse-lunar");
const eclipseInfoBubble = document.getElementById("eclipse-infobubble");
const eclipseInfoText   = document.getElementById("eclipse-info-text");
const eclipseInfoBubbleClose = document.getElementById("eclipse-infobubble-close");

// Fix 3: give the eclipse info bubble a manual close button (previously
// the only way it could disappear was via hideEclipsePanel()).
eclipseInfoBubbleClose.addEventListener("click", (e) => {
  e.stopPropagation();
  eclipseInfoBubble.style.display = "none";
});

const ECLIPSE_INFO = {
  solar: `<strong>☀️ Gerhana Matahari</strong><br>Bulan bergerak terus di antara Bumi dan Matahari. Ini hanya berlaku semasa <em>bulan baharu</em>, apabila orbit Bulan melintasi satah ekliptik (kecondongan orbit Bulan sebanyak 5.1° bermakna kebanyakan bulan baharu melepasi di atas atau di bawah garis Matahari-Bumi). Umbra Bulan mencampakkan tompok gelap kecil di permukaan Bumi — hanya orang dalam tompok itu melihat gerhana penuh.<br><br><em>Tempoh gerhana penuh: sehingga 7 minit 31 saat.</em>`,
  lunar: `<strong>🌕 Gerhana Bulan</strong><br>Bumi bergerak terus di antara Matahari dan Bulan. Ini hanya berlaku semasa <em>bulan purnama</em>, sekali lagi hanya apabila Bulan berhampiran nod orbit (titik persilangan orbit yang condong 5.1°). Bayang-bayang Bumi jatuh merentasi permukaan Bulan, menggelapkannya dengan jelas — bayang-bayang itu mempunyai tepi lembut (penumbra) dengan teras yang lebih gelap (umbra).<br><br><em>Gerhana bulan boleh dilihat serentak dari mana-mana tempat di sisi malam Bumi.</em>`,
};

function showEclipsePanel() {
  eclipsePanel.style.display = "block";
  document.getElementById("eclipse-info-btn").style.display = "flex";
  document.getElementById("season-info-btn").style.display = "none";
  hideInfoBubble();
}
function hideEclipsePanel() {
  eclipsePanel.style.display = "none";
  eclipseInfoBubble.style.display = "none";
  document.getElementById("eclipse-info-btn").style.display = "none";
  document.getElementById("season-info-btn").style.display = "flex";
  exitEclipseMode();
}

function enterEclipseMode(type) {
  if (eclipsePhase === type) return; // already in this mode, no re-animate

  eclipsePhase    = type;
  eclipseAligning = true;
  eclipseAlignT   = 0;
  _moonStartAngle = moonOrbitAngle;

  // Target: solar eclipse → Moon between Earth and Sun (angle toward Sun)
  //         lunar eclipse → Moon opposite Sun (angle away from Sun)
  // Earth-Sun direction in Earth's local space: Sun is at ORBIT_FOCUS,
  // Earth is at earthAnchor.position. Direction from Earth to Sun:
  const toSun = new THREE.Vector3(ORBIT_FOCUS, 0, 0)
    .sub(earthAnchor.position).normalize();
  // Moon orbit is in earthAnchor's XZ plane; project toSun to XZ
  const sunAngleInOrbit = Math.atan2(-toSun.z, toSun.x);

  if (type === "solar") {
    _moonTargetAngle.value = sunAngleInOrbit; // Moon toward Sun
  } else {
    _moonTargetAngle.value = sunAngleInOrbit + Math.PI; // Moon away from Sun
  }

  // Update eclipse info bubble
  eclipseInfoBubble.style.display = "block";
  eclipseInfoText.innerHTML = ECLIPSE_INFO[type];

  // Highlight active button
  eclipseSolarBtn.classList.toggle("active", type==="solar");
  eclipseLunarBtn.classList.toggle("active", type==="lunar");
}

function exitEclipseMode() {
  eclipsePhase    = "none";
  eclipseAligning = false;
  // Clear eclipse shadows
  earthMat.uniforms.eclipseMode.value    = 0;
  earthMat.uniforms.shadowOpacity.value  = 0;
  moonEclipseMat.opacity                 = 0;
  moonEclipseMat.needsUpdate             = true;
}

function tickEclipse(delta) {
  if (eclipsePhase === "none" || !eclipseAligning) return;

  eclipseAlignT = Math.min(1, eclipseAlignT + delta * ECLIPSE_ALIGN_SPEED);
  const e = easeInOut(eclipseAlignT);

  // Interpolate Moon orbit angle toward target (shortest arc)
  let diff = _moonTargetAngle.value - _moonStartAngle;
  // Wrap to [-π, π]
  while (diff >  Math.PI) diff -= Math.PI*2;
  while (diff < -Math.PI) diff += Math.PI*2;
  moonOrbitAngle = _moonStartAngle + diff * e;
  moonOrbitPivot.rotation.y = moonOrbitAngle;

  if (eclipseAlignT >= 1) {
    eclipseAligning = false;
    moonOrbitAngle  = _moonTargetAngle.value;
    moonOrbitPivot.rotation.y = moonOrbitAngle;
    applyEclipseShadows();
  }
}

function applyEclipseShadows() {
  if (eclipsePhase === "solar") {
    // Moon shadow on Earth: UV-space circle centered on sub-Moon point.
    // We place it at UV (0.5, 0.4) as a rough approximation of where
    // the shadow falls — a real implementation would project Moon's
    // world position onto Earth's UV sphere.
    earthMat.uniforms.eclipseMode.value   = 1;
    earthMat.uniforms.shadowCenter.value.set(0.5, 0.4);
    earthMat.uniforms.shadowRadius.value  = 0.07;
    earthMat.uniforms.shadowOpacity.value = 0.85;
    moonEclipseMat.opacity   = 0;
    moonEclipseMat.needsUpdate = true;
  } else if (eclipsePhase === "lunar") {
    // Earth shadow on Moon: neutral dark overlay — dims Moon without recoloring it.
    // No red/blood-moon tint; Moon keeps its natural grey texture, just darker.
    earthMat.uniforms.eclipseMode.value   = 0;
    earthMat.uniforms.shadowOpacity.value = 0;
    moonEclipseMat.color.setHex(0x111111); // neutral near-black — darkens, no hue shift
    moonEclipseMat.opacity    = 0.55;
    moonEclipseMat.needsUpdate = true;
  }
}

// Eclipse button wiring
document.getElementById("eclipse-demo-btn").addEventListener("click", () => {
  hideInfoBubble();
  showEclipsePanel();
});
eclipseSolarBtn.addEventListener("click", () => enterEclipseMode("solar"));
eclipseLunarBtn.addEventListener("click", () => enterEclipseMode("lunar"));
eclipseExitBtn.addEventListener("click",  () => {
  hideEclipsePanel();
});

// ⓘ eclipse info button — toggles the eclipse infobubble when in eclipse mode
const eclipseInfoBtn = document.getElementById("eclipse-info-btn");
eclipseInfoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const visible = eclipseInfoBubble.style.display === "block";
  eclipseInfoBubble.style.display = visible ? "none" : "block";
});

// Earthview exit button — the ONLY way to leave earthview (mirrors eclipse exit pattern)
document.getElementById("earthview-exit-btn").addEventListener("click", () => {
  startZoomOut();
});

// =============================================================
// TAP / CLICK HANDLING
// =============================================================
function onPointerUp(e) {
  if (controls.enabled && controls._pointerPositionOnMouseDown) return;

  const rect    = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.changedTouches[0].clientX : e.clientX;
  const clientY = e.touches ? e.changedTouches[0].clientY : e.clientY;

  _pointer.x =  ((clientX-rect.left)/rect.width)*2-1;
  _pointer.y = -((clientY-rect.top)/rect.height)*2+1;

  raycaster.setFromCamera(_pointer, camera);

  if (zoomState === "overview") {
    if (raycaster.intersectObject(earth, false).length > 0) startZoomIn();
  }
  // earthview no longer exits on tap-outside — use the ✕ Exit Earth View button
}

canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("touchend",  onPointerUp, { passive: true });

// =============================================================
// ANIMATION STATE
// =============================================================
let moonOrbitAngle  = 0;
let earthSpinAngle  = 0;
let moonSpinAngle   = 0;
let sunSpinAngle    = 0;
let isAutoPlaying   = true;
let lastTime        = performance.now();
const TWO_PI        = Math.PI*2;
const _sunDirVec    = new THREE.Vector3();

// =============================================================
// TILT INDICATOR
// Fixed world-space tilt axis — always points the same direction.
// §1: The tilt axis must NOT rotate with Earth's orbital position.
// We use a constant world-space direction for the tilt axis,
// derived once from the initial earth.rotation.z = 23.5°.
// =============================================================
const tiltLineN = document.getElementById("tilt-line-n");
const tiltLineS = document.getElementById("tilt-line-s");
const tiltLabel = document.getElementById("tilt-label");
const _tiltVec  = new THREE.Vector3();
const _tiltN    = new THREE.Vector3();
const _tiltS    = new THREE.Vector3();
const _tiltNSurface = new THREE.Vector3();
const _tiltSSurface = new THREE.Vector3();

// §1 — Fixed world-space tilt axis direction.
// Earth's tilt is 23.5° from vertical (world Y axis), tilted in the
// world-space XY plane. This direction NEVER changes — it's the fixed
// "pointing toward Polaris" direction that stays constant all year.
// sin(23.5°) in X, cos(23.5°) in Y = tilted axis in world space.
const FIXED_TILT_AXIS = new THREE.Vector3(
  Math.sin(EARTH_AXIAL_TILT_RAD),
  Math.cos(EARTH_AXIAL_TILT_RAD),
  0
).normalize();

function worldToScreen(pos, cam = camera) {
  const v = pos.clone().project(cam);
  return {
    x: (v.x+1)/2*window.innerWidth,
    y: (-v.y+1)/2*window.innerHeight,
    behind: v.z>1,
  };
}

// (occlusion machinery removed — tilt line now draws straight through Earth, Fix 4)

function updateTiltIndicator(cam = camera) {
  earth.getWorldPosition(_tiltVec);
  const reach = EARTH_RADIUS * 1.45;
  _tiltN.copy(_tiltVec).addScaledVector(FIXED_TILT_AXIS,  reach);
  _tiltS.copy(_tiltVec).addScaledVector(FIXED_TILT_AXIS, -reach);

  const centre = worldToScreen(_tiltVec, cam);
  const north  = worldToScreen(_tiltN, cam);
  const south  = worldToScreen(_tiltS, cam);

  if (north.behind || south.behind || centre.behind) {
    tiltLineN.style.display = tiltLineS.style.display = tiltLabel.style.display = "none";
    return;
  }
  tiltLineN.style.display = tiltLineS.style.display = tiltLabel.style.display = "";

  // Fix 2 & 3: Only draw the stub from each pole tip to where the tilt axis
  // exits Earth's surface — never through the solid body.
  _tiltNSurface.copy(_tiltVec).addScaledVector(FIXED_TILT_AXIS,  EARTH_RADIUS);
  _tiltSSurface.copy(_tiltVec).addScaledVector(FIXED_TILT_AXIS, -EARTH_RADIUS);
  const northSurface2D = worldToScreen(_tiltNSurface, cam);
  const southSurface2D = worldToScreen(_tiltSSurface, cam);

  // North stub: pole tip → where the axis meets the surface (outside sphere only)
  tiltLineN.setAttribute("x1", north.x.toFixed(1));
  tiltLineN.setAttribute("y1", north.y.toFixed(1));
  tiltLineN.setAttribute("x2", northSurface2D.x.toFixed(1));
  tiltLineN.setAttribute("y2", northSurface2D.y.toFixed(1));

  // South stub: where the axis meets the surface → pole tip (outside sphere only)
  tiltLineS.setAttribute("x1", southSurface2D.x.toFixed(1));
  tiltLineS.setAttribute("y1", southSurface2D.y.toFixed(1));
  tiltLineS.setAttribute("x2", south.x.toFixed(1));
  tiltLineS.setAttribute("y2", south.y.toFixed(1));

  // Hide each stub individually if its pole is facing away from the camera,
  // so a pole doesn't incorrectly show through the far side of the sphere.
  const toCamera = cam.position.clone().sub(_tiltVec).normalize();
  const northFacingCamera = FIXED_TILT_AXIS.dot(toCamera) > 0;
  const southFacingCamera = -FIXED_TILT_AXIS.dot(toCamera) > 0;

  tiltLineN.style.display = (northFacingCamera && !north.behind && !centre.behind) ? "" : "none";
  tiltLineS.style.display = (southFacingCamera && !south.behind && !centre.behind) ? "" : "none";

  tiltLabel.setAttribute("x", (north.x - 22).toFixed(1));
  tiltLabel.setAttribute("y", (north.y - 6).toFixed(1));
}

// Fix 7: Track Earth's world position frame-to-frame so we can
// translate the camera by Earth's motion while in earthview.
const _earthPosPrev    = new THREE.Vector3();
const _earthPosCurrent = new THREE.Vector3();
const _earthPosDelta   = new THREE.Vector3();
let   _earthPosInitialized = false;

// =============================================================
// SHARED SIMULATION UPDATE
//
// Pure solar-system simulation: orbit angles, spins, sun flares,
// eclipse alignment, season label/slider sync. Contains NO camera,
// OrbitControls, or raycaster code, so it is 100% safe to call from
// both the desktop Study Mode loop AND the MindAR AR loop.
//
// Previously all of this lived inside one render() that ALSO drove
// OrbitControls every frame — including during the old WebXR AR
// session. That meant OrbitControls.update() and the WebXR device
// pose were both writing to camera.position every frame, fighting
// each other, which is what caused the "running front and back"
// jitter. Splitting simulation from camera logic fixes that at the
// structural level: the AR loop below never touches a camera object
// controlled by OrbitControls at all.
// =============================================================
function updateSolarSystem(delta, now) {
  const spinFactor = (zoomState==="earthview") ? ZOOM_SPIN_FACTOR : 1.0;

  if (isAutoPlaying) {
    // Kepler's second law: angular speed ∝ 1/r²
    // Negated: Earth orbits counterclockwise (viewed from above north pole)
    if (eclipsePhase === "none") {
      const r = orbitRadius(earthOrbitAngle);
      const dTheta = (ORBIT_A * ORBIT_B * TWO_PI / EARTH_ORBIT_PERIOD) / (r * r);
      earthOrbitAngle = ((earthOrbitAngle + dTheta * delta) % TWO_PI + TWO_PI) % TWO_PI;

      // Move Earth along ellipse using true anomaly
      earthAnchor.position.set(
        Math.cos(earthOrbitAngle)*ORBIT_A,
        0,
        -Math.sin(earthOrbitAngle)*ORBIT_B
      );
    }

    // Fix 2: negated — Earth spins counterclockwise viewed from north pole
    earthSpinAngle = ((earthSpinAngle + (TWO_PI/EARTH_ROT_PERIOD)*delta*spinFactor) % TWO_PI + TWO_PI) % TWO_PI;

    // Fix 5: eclipse guard on Moon orbit only (Earth's is now in the block above)
    if (eclipsePhase === "none") {
      moonOrbitAngle = (moonOrbitAngle + (TWO_PI/MOON_ORBIT_PERIOD)*delta) % TWO_PI;
    }
    // Spins always keep going regardless of eclipse state
    moonSpinAngle = (moonSpinAngle + (TWO_PI/MOON_ROT_PERIOD)*delta) % TWO_PI;
    sunSpinAngle  = (sunSpinAngle  + (TWO_PI/SUN_ROT_EQUATOR)*delta) % TWO_PI;

    moonOrbitPivot.rotation.y = moonOrbitAngle;
    earth.rotation.y          = earthSpinAngle;
    moon.rotation.y           = moonSpinAngle;
    sun.rotation.y            = sunSpinAngle;

    updateSeasonLabel(earthOrbitAngle);
    syncSliderFromAngle(earthOrbitAngle);
  } else {
    if (zoomState==="earthview") {
      // Fix 2: negated to match counterclockwise direction
      earthSpinAngle=((earthSpinAngle+(TWO_PI/EARTH_ROT_PERIOD)*(1/60)*ZOOM_SPIN_FACTOR)%TWO_PI+TWO_PI)%TWO_PI;
      earth.rotation.y=earthSpinAngle;
    }
  }

  tickEclipse(delta===0?1/60:delta);

  // §1 — Sun differential rotation on flares (by latitude)
  const t = now/1000;
  for (let i=0; i<flares.length; i++) {
    const flare = flares[i];
    // Assign each flare a latitude band index
    const bandIdx = i % sunLatBands;
    const period  = getSunBandPeriod(bandIdx);
    sunBandAngles[bandIdx] = (sunBandAngles[bandIdx] + (TWO_PI/period)*(1/60)) % TWO_PI;

    const pulse = 0.6+0.4*Math.sin(t*1.8+flare.userData.phase);
    flare.scale.set(pulse,pulse,pulse);
    const drift = 0.15*Math.sin(t*0.7+flare.userData.phase);
    const a = flare.userData.baseAngle+drift+sunBandAngles[bandIdx];
    flare.position.set(
      ORBIT_FOCUS+Math.cos(a)*SUN_RADIUS*0.95,
      Math.sin(a)*SUN_RADIUS*0.95, 0
    );
    flare.rotation.z = a;
    flare.material.opacity = 0.4+0.35*pulse;
  }

  // Update Earth sunDir — direction FROM Earth TO Sun in world space
  earth.getWorldPosition(_sunDirVec);
  // Sun position is at ORBIT_FOCUS on X axis
  _sunDirVec.set(ORBIT_FOCUS,0,0).sub(earthAnchor.position).normalize();
  updateEarthSunDir(_sunDirVec);
}

// =============================================================
// DESKTOP RENDER LOOP (Study Mode only)
//
// Owns OrbitControls, click-to-zoom, the Earth-follow camera delta,
// and the on-screen tilt indicator. None of this ever runs during
// AR Mode — see arRenderLoop() further down, which only calls
// updateSolarSystem() and renders through MindAR's own camera.
// =============================================================
function render() {
  const now   = performance.now();
  const delta = isAutoPlaying ? (now-lastTime)/1000 : 0;
  lastTime    = now;

  updateSolarSystem(delta, now);

  tickZoom(delta===0?1/60:delta);

  // Fix 7 — Camera follows Earth while zoomed in.
  // Each frame, compute how far Earth moved in world space since last frame.
  // Translate both camera.position and controls.target by that same delta,
  // so the camera rig stays locked onto Earth as it orbits — the user's
  // chosen zoom distance and orbit angle (set via OrbitControls) are preserved;
  // only the absolute world-space position of the rig shifts with Earth.
  earth.getWorldPosition(_earthPosCurrent);
  if ((zoomState === "earthview" || eclipsePhase !== "none") && _earthPosInitialized) {
    _earthPosDelta.subVectors(_earthPosCurrent, _earthPosPrev);
    camera.position.add(_earthPosDelta);
    controls.target.add(_earthPosDelta);
  }
  _earthPosPrev.copy(_earthPosCurrent);
  _earthPosInitialized = true;

  updateTiltIndicator();
  controls.update();
  renderer.render(scene, camera);
}

// ---------- Slider ----------
const slider     = document.getElementById("season-slider");
const playToggle = document.getElementById("play-toggle");
const SLIDER_MAX = 1000;

function syncSliderFromAngle(angle) {
  slider.value = Math.round((angle/TWO_PI)*SLIDER_MAX);
}

slider.addEventListener("input", () => {
  isAutoPlaying = false;
  playToggle.textContent = "▶ Resume Orbit";
  const angle = (parseFloat(slider.value)/SLIDER_MAX)*TWO_PI;
  earthOrbitAngle = angle;
  earthAnchor.position.set(Math.cos(angle)*ORBIT_A, 0, -Math.sin(angle)*ORBIT_B);
  updateSeasonLabel(angle);
});

playToggle.addEventListener("click", () => {
  isAutoPlaying = !isAutoPlaying;
  playToggle.textContent = isAutoPlaying ? "⏸ Pause Orbit" : "▶ Resume Orbit";
  lastTime = performance.now();
});

function startApp() {
  document.getElementById("loading").style.display = "none";
  updateSeasonLabel(0);

  // Transfer all scene objects into arSceneGroup now that everything is added.
  // This lets AR mode scale/reposition the whole solar system as one unit.
  const children = [...scene.children].filter(c => c !== arSceneGroup);
  children.forEach(c => arSceneGroup.add(c));

  renderer.setAnimationLoop(render);
}

window.addEventListener("app-unlocked", startApp, { once: true });

// =============================================================
// STEP 6 — MindAR IMAGE-TRACKING AR MODE
//
// Replaces the old WebXR hit-test flow. MindAR tracks a printed
// marker image (targets.mind, compiled from solar-eclipse-marker.jpg)
// and gives us an anchor.group whose transform is driven entirely by
// the tracked marker pose — it has its own dedicated camera and never
// touches OrbitControls, so there is no competing camera writer and
// no jitter.
//
// How it works:
//   - arSceneGroup (built in startApp() below) holds the ENTIRE solar
//     system as one unit, exactly like before.
//   - Entering AR: freeze the desktop render loop, reparent
//     arSceneGroup from the desktop `scene` into MindAR's anchor.group,
//     scale it down to marker size, start MindAR's own render loop
//     (which only calls updateSolarSystem() — no camera code at all).
//   - Exiting AR: stop MindAR, reparent arSceneGroup back into the
//     desktop `scene`, resume the desktop render loop exactly as it was.
// =============================================================

// Wrap everything in a group so AR can scale/reposition without
// touching the individual object transforms that are carefully set up.
// Populated in startApp() after all scene objects have been added.
const arSceneGroup = new THREE.Group();
scene.add(arSceneGroup);

const NORMAL_SCALE = 1.0;

// MindAR marker-space scale: 1 anchor unit = the printed marker's width.
// The orbit is ~12 Three.js units across; 0.05 makes it ~0.6 marker-widths
// wide, a nice size sitting above the printed page. Tweak if it looks
// too big/small for your printout.
const MINDAR_SCALE = 0.06;

let isARMode = false;
let mindarThree = null;
let mindarAnchor = null;

const arContainer   = document.getElementById("ar-container");
const arEnterBtn     = document.getElementById("ar-enter-btn");
const arExitBtn      = document.getElementById("ar-exit-btn");

async function enterAR() {
  if (isARMode) return;
  isARMode = true;

  // Freeze the desktop loop — OrbitControls and click-to-zoom raycasting
  // never run while AR is active (the AR loop below drives its own camera).
  renderer.setAnimationLoop(null);

  // Fix 1: Do NOT hide #app. Keep the shared #ui-overlay (season label,
  // tilt indicator, slider, info buttons, eclipse panel/bubbles) visible —
  // it now renders above the AR camera feed (see #ui-overlay z-index in
  // index.html). Only the 3D canvas is hidden, since MindAR draws its own
  // camera feed + canvas into #ar-container instead.
  document.getElementById("scene-canvas").style.display = "none";
  document.getElementById("hint").style.display = "none";
  arEnterBtn.style.display = "none";
  arContainer.style.display = "block";
  arContainer.querySelector("#ar-status").textContent = "Starting camera…";

  // Fix 1: the eclipse demo trigger and season info button are normally
  // gated by zoomState (only shown in desktop "earthview"), but AR has no
  // zoomState of its own — force them visible so AR has the same controls
  // Study Mode has. exitAR() restores them to match zoomState afterward.
  document.getElementById("eclipse-demo-btn").style.display = "block";
  document.getElementById("season-info-btn").style.display = "flex";

  if (!mindarThree) {
    mindarThree = new MindARThree({
      container: arContainer,
      imageTargetSrc: "targets.mind",
    });
    mindarAnchor = mindarThree.addAnchor(0);
  }

  try {
    await mindarThree.start();
  } catch (err) {
    console.error("MindAR failed to start:", err);
    arContainer.querySelector("#ar-status").textContent =
      "Camera/AR failed to start — check camera permission.";
    return;
  }

  arContainer.querySelector("#ar-status").textContent =
    "Point the camera at the printed marker";

  // Hide the starfield in AR — the camera feed is the background now.
  milkyWaySphere.visible = false;

  // Move the whole solar system from the desktop scene into the
  // marker's anchor group. Rotate +90° about X so our internal
  // "Y-up" orbit plane lies flat on/above the printed marker instead
  // of standing on edge.
  mindarAnchor.group.add(arSceneGroup);
  arSceneGroup.rotation.set(Math.PI / 2, 0, 0);
  arSceneGroup.scale.setScalar(MINDAR_SCALE);
  arSceneGroup.position.set(0, 0, 0.15); // lift slightly above the page

  const { renderer: arRenderer, scene: arScene, camera: arCamera } = mindarThree;

  function arRenderLoop() {
    const now   = performance.now();
    const delta = isAutoPlaying ? (now - lastTime) / 1000 : 0;
    lastTime    = now;
    updateSolarSystem(delta, now);
    updateTiltIndicator(arCamera); // Fix 4: draw the tilt indicator in AR too
    arRenderer.render(arScene, arCamera);
  }
  lastTime = performance.now();
  arRenderer.setAnimationLoop(arRenderLoop);
}

async function exitAR() {
  if (!isARMode) return;
  isARMode = false;

  if (mindarThree) {
    mindarThree.renderer.setAnimationLoop(null);
    await mindarThree.stop();
  }

  // Move the solar system back into the desktop scene.
  arSceneGroup.rotation.set(0, 0, 0);
  arSceneGroup.scale.setScalar(NORMAL_SCALE);
  arSceneGroup.position.set(0, 0, 0);
  scene.add(arSceneGroup);

  milkyWaySphere.visible = true;

  arContainer.style.display = "none";
  document.getElementById("scene-canvas").style.display = "block";
  document.getElementById("hint").style.display = "";
  arEnterBtn.style.display = "";

  // Fix 3: unconditionally clear any eclipse/season popup state before
  // handing control back to Study Mode, so nothing left open during AR
  // (e.g. the lunar eclipse info bubble) suddenly appears on exit.
  hideEclipsePanel();
  hideInfoBubble();

  // Fix 1: AR doesn't touch zoomState, so it's still whatever it was
  // before entering AR. Restore eclipse-demo-btn/season-info-btn
  // visibility to match it (they were force-shown in enterAR()).
  if (zoomState === "overview") {
    document.getElementById("eclipse-demo-btn").style.display = "none";
    document.getElementById("season-info-btn").style.display = "none";
  }

  // Resume the desktop Study Mode loop exactly as before.
  lastTime = performance.now();
  renderer.setAnimationLoop(render);
}

arEnterBtn.addEventListener("click", enterAR);
arExitBtn.addEventListener("click", exitAR);
