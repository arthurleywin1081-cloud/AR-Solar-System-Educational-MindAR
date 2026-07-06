import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { MindARThree } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

const SECONDS_PER_SIM_DAY = 1;

// Real-world periods in Earth days → simulated seconds
const EARTH_ROT_PERIOD    = 1.0      * SECONDS_PER_SIM_DAY;
const EARTH_ORBIT_PERIOD  = 365.25   * SECONDS_PER_SIM_DAY;
const MOON_ORBIT_PERIOD   = 27.3     * SECONDS_PER_SIM_DAY;
const MOON_ROT_PERIOD     = 27.3     * SECONDS_PER_SIM_DAY;
const SUN_ROT_EQUATOR     = 25.0     * SECONDS_PER_SIM_DAY;
const SUN_ROT_POLE        = 34.5     * SECONDS_PER_SIM_DAY;

const SUN_RADIUS         = 2.925;
const EARTH_RADIUS       = 1.0;
const MOON_ORBIT_RADIUS  = 3.75;
const EARTH_ORBIT_RADIUS = 12.0;
const EARTH_AXIAL_TILT_RAD = THREE.MathUtils.degToRad(23.5);
const MOON_ORBITAL_TILT_RAD = THREE.MathUtils.degToRad(5.1);

const ORBIT_A    = EARTH_ORBIT_RADIUS;
const ORBIT_B    = EARTH_ORBIT_RADIUS * 0.99;
const ORBIT_FOCUS = Math.sqrt(ORBIT_A**2 - ORBIT_B**2);
const ORBIT_ECC  = Math.sqrt(1 - (ORBIT_B/ORBIT_A)**2);

function orbitRadius(theta) {
  return (ORBIT_A * (1 - ORBIT_ECC**2)) / (1 + ORBIT_ECC * Math.cos(theta));
}

let earthOrbitAngle = 0;
const ZOOM_SPIN_FACTOR = 0.25;

const canvas = document.getElementById("scene-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.05, 1000);
camera.position.set(0, 10, 28);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance    = 3;
controls.maxDistance    = 90;
controls.target.set(0, 0, 0);

const ambient = new THREE.AmbientLight(0x223355, 0.25);
scene.add(ambient);

const sunLight = new THREE.PointLight(0xfff4e5, 2.5, 0, 0);
sunLight.position.set(ORBIT_FOCUS, 0, 0);
scene.add(sunLight);

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

const milkyWaySphere = new THREE.Mesh(
  new THREE.SphereGeometry(500, 64, 64),
  new THREE.MeshBasicMaterial({ map: texMilkyWay, side: THREE.BackSide })
);
scene.add(milkyWaySphere);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 48, 48),
  new THREE.MeshBasicMaterial({ map: texSun })
);
sun.position.set(ORBIT_FOCUS, 0, 0);
scene.add(sun);

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

const sunLatBands = 8;
const sunBandAngles = new Float32Array(sunLatBands).fill(0);

function getSunBandPeriod(bandIndex) {
  const latFrac = bandIndex / (sunLatBands - 1);
  return SUN_ROT_EQUATOR + (SUN_ROT_POLE - SUN_ROT_EQUATOR) * latFrac;
}

const earthMat = new THREE.ShaderMaterial({
  uniforms: {
    dayTex:           { value: texEarthDay   },
    nightTex:         { value: texEarthNight },
    bumpTex:          { value: texEarthBump  },
    displacementScale:{ value: 0.018         },
    sunDir:           { value: new THREE.Vector3(1, 0, 0) },
    eclipseMode:      { value: 0   },
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

const earthAnchor = new THREE.Object3D();
scene.add(earthAnchor);

const earthTiltGroup = new THREE.Object3D();
earthTiltGroup.rotation.z = -EARTH_AXIAL_TILT_RAD;
earthAnchor.add(earthTiltGroup);

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 256, 256),
  earthMat
);
earthTiltGroup.add(earth);

function updateEarthSunDir(dir) {
  earthMat.uniforms.sunDir.value.copy(dir);
}

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

const moonOrbitTiltGroup = new THREE.Group();
moonOrbitTiltGroup.rotation.x = MOON_ORBITAL_TILT_RAD;
earthAnchor.add(moonOrbitTiltGroup);

const moonOrbitPivot = new THREE.Object3D();
moonOrbitTiltGroup.add(moonOrbitPivot);
moonOrbitPivot.add(moon);

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

const SEASON_DATA = [
  {
    north: "Winter", south: "Summer",
    northDetail: "The North Pole is tilted away from the Sun. The Northern Hemisphere receives sunlight at a shallow angle with shorter days — less energy reaches the surface, leading to colder temperatures. Note: Earth is actually closest to the Sun right now (perihelion, ~Jan 3) — seasons are caused by axial tilt, not distance.",
    southDetail: "The South Pole is tilted toward the Sun. The Southern Hemisphere receives sunlight at a steeper angle with longer days — more energy per square metre means warmer temperatures.",
  },
  {
    north: "Spring", south: "Autumn",
    northDetail: "Earth's tilt axis is sideways relative to the Sun. The Northern Hemisphere transitions from winter cold toward summer warmth as days lengthen. Days and nights are roughly equal across the globe (equinox, ~Mar 20).",
    southDetail: "Earth's tilt axis is sideways relative to the Sun. The Southern Hemisphere transitions from summer warmth toward winter cool as days shorten.",
  },
  {
    north: "Summer", south: "Winter",
    northDetail: "The North Pole is tilted toward the Sun. The Northern Hemisphere receives sunlight at a steeper angle with longer days — more energy per square metre means higher temperatures. Note: Earth is actually farthest from the Sun right now (aphelion, ~Jul 4) — axial tilt, not distance, drives seasons.",
    southDetail: "The South Pole is tilted away from the Sun. The Southern Hemisphere receives sunlight at a shallow angle with shorter days — less energy reaches the surface, so temperatures are lower.",
  },
  {
    north: "Autumn", south: "Spring",
    northDetail: "Earth's tilt axis is sideways relative to the Sun. The Northern Hemisphere transitions from summer warmth toward winter cool as days shorten. Days and nights are roughly equal across the globe (equinox, ~Sep 22).",
    southDetail: "Earth's tilt axis is sideways relative to the Sun. The Southern Hemisphere transitions from winter cold toward summer warmth as days lengthen.",
  },
];

function getSeasonData(angle) {
  const norm = ((angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  return SEASON_DATA[Math.floor((norm/(Math.PI*2))*4)%4];
}

const seasonLabel = document.getElementById("season-label");
function updateSeasonLabel(angle) {
  const d = getSeasonData(angle);
  seasonLabel.textContent = "Northern Hemisphere: "+d.north+"  |  Southern Hemisphere: "+d.south;
}

let zoomState = "overview";
const overviewCamPos    = new THREE.Vector3(0, 10, 28);
const overviewTarget    = new THREE.Vector3(0, 0, 0);
const ZOOM_DISTANCE     = EARTH_RADIUS * 3.5;
const ZOOM_SPEED        = 0.45;
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
  controls.minDistance = 0.5;
  controls.maxDistance = 200;
  hideInfoBubble();
  hideEclipsePanel();
}

function finishZoomIn() {
  zoomState = "earthview";
  controls.target.copy(_zoomEndTarget);
  controls.minDistance = EARTH_RADIUS * 2;
  controls.maxDistance = EARTH_RADIUS * 8;
  controls.enabled = true;
  _earthPosInitialized = false;
  document.getElementById("zoom-hint").style.display = "block";
  document.getElementById("eclipse-demo-btn").style.display = "block";
  document.getElementById("earthview-exit-btn").style.display = "block";
  document.getElementById("season-info-btn").style.display = "flex";
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

const infobubble      = document.getElementById("infobubble");
const infobubbleTitle = document.getElementById("infobubble-title");
const infobubbleText  = document.getElementById("infobubble-text");
const infobubbleClose = document.getElementById("infobubble-close");

function showInfoBubble() {
  const d = getSeasonData(earthOrbitAngle);
  infobubbleTitle.textContent = "Why Seasons Happen — Right Now";
  infobubbleText.innerHTML =
    `<strong>🌍 Northern Hemisphere: ${d.north}</strong><br>${d.northDetail}<br><br>`+
    `<strong>🌏 Southern Hemisphere: ${d.south}</strong><br>${d.southDetail}<br><br>`+
    `<em>Seasons are caused by Earth's 23.5° axial tilt — not by its distance from the Sun.</em>`;
  infobubble.style.display = "block";
  infobubble.style.left = "16px";
  infobubble.style.top  = "120px";
}

function hideInfoBubble() { infobubble.style.display = "none"; }

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

let eclipsePhase    = "none";
let eclipseAligning = false;
let eclipseAlignT   = 0;
const ECLIPSE_ALIGN_SPEED = 1/5;

let savedMoonOrbitAngle = 0;
const _moonTargetAngle  = { value: 0 };
let   _moonStartAngle   = 0;

const eclipsePanel  = document.getElementById("eclipse-panel");
const eclipseExitBtn= document.getElementById("eclipse-exit");
const eclipseSolarBtn= document.getElementById("eclipse-solar");
const eclipseLunarBtn= document.getElementById("eclipse-lunar");
const eclipseInfoBubble = document.getElementById("eclipse-infobubble");
const eclipseInfoText   = document.getElementById("eclipse-info-text");

const ECLIPSE_INFO = {
  solar: `<strong>☀️ Solar Eclipse</strong><br>The Moon passes directly between Earth and the Sun. This only happens at <em>new moon</em>, when the Moon's orbit crosses the ecliptic plane. The Moon's umbra casts a small dark spot on Earth's surface — only people within that spot see a total eclipse.<br><br><em>Duration of totality: up to 7 minutes 31 seconds.</em>`,
  lunar: `<strong>🌕 Lunar Eclipse</strong><br>Earth passes directly between the Sun and the Moon. This only happens at <em>full moon</em>, when the Moon is near an orbital node. Earth's shadow falls across the Moon's surface, visibly darkening it.<br><br><em>A lunar eclipse is visible from anywhere on Earth's night side simultaneously.</em>`,
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
  if (eclipsePhase === type) return;

  eclipsePhase    = type;
  eclipseAligning = true;
  eclipseAlignT   = 0;
  _moonStartAngle = moonOrbitAngle;

  const toSun = new THREE.Vector3(ORBIT_FOCUS, 0, 0).sub(earthAnchor.position).normalize();
  const sunAngleInOrbit = Math.atan2(-toSun.z, toSun.x);

  if (type === "solar") {
    _moonTargetAngle.value = sunAngleInOrbit;
  } else {
    _moonTargetAngle.value = sunAngleInOrbit + Math.PI;
  }

  eclipseInfoBubble.style.display = "block";
  eclipseInfoText.innerHTML = ECLIPSE_INFO[type];

  eclipseSolarBtn.classList.toggle("active", type==="solar");
  eclipseLunarBtn.classList.toggle("active", type==="lunar");
}

function exitEclipseMode() {
  eclipsePhase    = "none";
  eclipseAligning = false;
  earthMat.uniforms.eclipseMode.value    = 0;
  earthMat.uniforms.shadowOpacity.value  = 0;
  moonEclipseMat.opacity                 = 0;
  moonEclipseMat.needsUpdate             = true;
}

function tickEclipse(delta) {
  if (eclipsePhase === "none" || !eclipseAligning) return;

  eclipseAlignT = Math.min(1, eclipseAlignT + delta * ECLIPSE_ALIGN_SPEED);
  const e = easeInOut(eclipseAlignT);

  let diff = _moonTargetAngle.value - _moonStartAngle;
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
    earthMat.uniforms.eclipseMode.value   = 1;
    earthMat.uniforms.shadowCenter.value.set(0.5, 0.4);
    earthMat.uniforms.shadowRadius.value  = 0.07;
    earthMat.uniforms.shadowOpacity.value = 0.85;
    moonEclipseMat.opacity   = 0;
    moonEclipseMat.needsUpdate = true;
  } else if (eclipsePhase === "lunar") {
    earthMat.uniforms.eclipseMode.value   = 0;
    earthMat.uniforms.shadowOpacity.value = 0;
    moonEclipseMat.color.setHex(0x111111);
    moonEclipseMat.opacity    = 0.55;
    moonEclipseMat.needsUpdate = true;
  }
}

document.getElementById("eclipse-demo-btn").addEventListener("click", () => {
  hideInfoBubble();
  showEclipsePanel();
});
eclipseSolarBtn.addEventListener("click", () => enterEclipseMode("solar"));
eclipseLunarBtn.addEventListener("click", () => enterEclipseMode("lunar"));
eclipseExitBtn.addEventListener("click",  () => {
  hideEclipsePanel();
});

const eclipseInfoBtn = document.getElementById("eclipse-info-btn");
eclipseInfoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const visible = eclipseInfoBubble.style.display === "block";
  eclipseInfoBubble.style.display = visible ? "none" : "block";
});

document.getElementById("earthview-exit-btn").addEventListener("click", () => {
  startZoomOut();
});

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
}

canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("touchend",  onPointerUp, { passive: true });

let moonOrbitAngle  = 0;
let earthSpinAngle  = 0;
let moonSpinAngle   = 0;
let sunSpinAngle    = 0;
let isAutoPlaying   = true;
let lastTime        = performance.now();
const TWO_PI        = Math.PI*2;
const _sunDirVec    = new THREE.Vector3();

const tiltLineN = document.getElementById("tilt-line-n");
const tiltLineS = document.getElementById("tilt-line-s");
const tiltLabel = document.getElementById("tilt-label");
const _tiltVec  = new THREE.Vector3();
const _tiltN    = new THREE.Vector3();
const _tiltS    = new THREE.Vector3();
const _tiltNSurface = new THREE.Vector3();
const _tiltSSurface = new THREE.Vector3();

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

  _tiltNSurface.copy(_tiltVec).addScaledVector(FIXED_TILT_AXIS,  EARTH_RADIUS);
  _tiltSSurface.copy(_tiltVec).addScaledVector(FIXED_TILT_AXIS, -EARTH_RADIUS);
  const northSurface2D = worldToScreen(_tiltNSurface, cam);
  const southSurface2D = worldToScreen(_tiltSSurface, cam);

  tiltLineN.setAttribute("x1", north.x.toFixed(1));
  tiltLineN.setAttribute("y1", north.y.toFixed(1));
  tiltLineN.setAttribute("x2", northSurface2D.x.toFixed(1));
  tiltLineN.setAttribute("y2", northSurface2D.y.toFixed(1));

  tiltLineS.setAttribute("x1", southSurface2D.x.toFixed(1));
  tiltLineS.setAttribute("y1", southSurface2D.y.toFixed(1));
  tiltLineS.setAttribute("x2", south.x.toFixed(1));
  tiltLineS.setAttribute("y2", south.y.toFixed(1));

  const toCamera = cam.position.clone().sub(_tiltVec).normalize();
  const northFacingCamera = FIXED_TILT_AXIS.dot(toCamera) > 0;
  const southFacingCamera = -FIXED_TILT_AXIS.dot(toCamera) > 0;

  tiltLineN.style.display = (northFacingCamera && !north.behind && !centre.behind) ? "" : "none";
  tiltLineS.style.display = (southFacingCamera && !south.behind && !centre.behind) ? "" : "none";

  tiltLabel.setAttribute("x", (north.x - 22).toFixed(1));
  tiltLabel.setAttribute("y", (north.y - 6).toFixed(1));
}

const _earthPosPrev    = new THREE.Vector3();
const _earthPosCurrent = new THREE.Vector3();
const _earthPosDelta   = new THREE.Vector3();
let   _earthPosInitialized = false;

function updateSolarSystem(delta, now) {
  const spinFactor = (zoomState==="earthview") ? ZOOM_SPIN_FACTOR : 1.0;

  if (isAutoPlaying) {
    if (eclipsePhase === "none") {
      const r = orbitRadius(earthOrbitAngle);
      const dTheta = (ORBIT_A * ORBIT_B * TWO_PI / EARTH_ORBIT_PERIOD) / (r * r);
      earthOrbitAngle = ((earthOrbitAngle + dTheta * delta) % TWO_PI + TWO_PI) % TWO_PI;

      earthAnchor.position.set(
        Math.cos(earthOrbitAngle)*ORBIT_A,
        0,
        -Math.sin(earthOrbitAngle)*ORBIT_B
      );
    }

    earthSpinAngle = ((earthSpinAngle + (TWO_PI/EARTH_ROT_PERIOD)*delta*spinFactor) % TWO_PI + TWO_PI) % TWO_PI;

    if (eclipsePhase === "none") {
      moonOrbitAngle = (moonOrbitAngle + (TWO_PI/MOON_ORBIT_PERIOD)*delta) % TWO_PI;
    }
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
      earthSpinAngle=((earthSpinAngle+(TWO_PI/EARTH_ROT_PERIOD)*(1/60)*ZOOM_SPIN_FACTOR)%TWO_PI+TWO_PI)%TWO_PI;
      earth.rotation.y=earthSpinAngle;
    }
  }

  tickEclipse(delta===0?1/60:delta);

  const t = now/1000;
  for (let i=0; i<flares.length; i++) {
    const flare = flares[i];
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

  earth.getWorldPosition(_sunDirVec);
  _sunDirVec.set(ORBIT_FOCUS,0,0).sub(earthAnchor.position).normalize();
  updateEarthSunDir(_sunDirVec);
}

function render() {
  const now   = performance.now();
  const delta = isAutoPlaying ? (now-lastTime)/1000 : 0;
  lastTime    = now;

  updateSolarSystem(delta, now);
  tickZoom(delta===0?1/60:delta);

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

  const children = [...scene.children].filter(c => c !== arSceneGroup);
  children.forEach(c => arSceneGroup.add(c));

  renderer.setAnimationLoop(render);
}

const arSceneGroup = new THREE.Group();
scene.add(arSceneGroup);

const NORMAL_SCALE = 1.0;
const MINDAR_SCALE = 0.05;

let isARMode = false;
let mindarThree = null;
let mindarAnchor = null;

const arContainer   = document.getElementById("ar-container");
const arEnterBtn     = document.getElementById("ar-enter-btn");

async function enterAR() {
  if (isARMode) return;

  if (!window.isSecureContext) {
    alert("Camera access needs HTTPS (or localhost). Treat this file through an HTTPS host.");
    return;
  }

  isARMode = true;
  renderer.setAnimationLoop(null);
  
  document.getElementById("scene-canvas").style.display = "none";
  arContainer.style.display = "block";
  arEnterBtn.textContent = "✕ Exit AR";
  document.getElementById("hint").textContent = "Starting camera...";

  try {
    if (!mindarThree) {
      mindarThree = new MindARThree({
        container: arContainer,
        imageTargetSrc: "targets.mind",
      });
      mindarAnchor = mindarThree.addAnchor(0);
    }

    await mindarThree.start();
    document.getElementById("hint").textContent = "Point camera at printed marker";
    milkyWaySphere.visible = false;

    mindarAnchor.group.add(arSceneGroup);
    arSceneGroup.rotation.set(Math.PI / 2, 0, 0);
    arSceneGroup.scale.setScalar(MINDAR_SCALE);
    arSceneGroup.position.set(0, 0, 0.15);

    const { renderer: arRenderer, scene: arScene, camera: arCamera } = mindarThree;

    function arRenderLoop() {
      const now   = performance.now();
      const delta = isAutoPlaying ? (now - lastTime) / 1000 : 0;
      lastTime    = now;
      updateSolarSystem(delta, now);
      updateTiltIndicator(arCamera);
      arRenderer.render(arScene, arCamera);
    }
    lastTime = performance.now();
    arRenderer.setAnimationLoop(arRenderLoop);

  } catch (err) {
    console.error("MindAR error:", err);
    document.getElementById("hint").textContent = "AR Error: " + err.message;
    isARMode = false;
    arContainer.style.display = "none";
    document.getElementById("scene-canvas").style.display = "block";
    lastTime = performance.now();
    renderer.setAnimationLoop(render);
  }
}

async function exitAR() {
  if (!isARMode) return;
  isARMode = false;

  hideEclipsePanel();

  if (mindarThree) {
    mindarThree.renderer.setAnimationLoop(null);
    await mindarThree.stop();
  }

  arSceneGroup.rotation.set(0, 0, 0);
  arSceneGroup.scale.setScalar(NORMAL_SCALE);
  arSceneGroup.position.set(0, 0, 0);
  scene.add(arSceneGroup);

  milkyWaySphere.visible = true;
  arContainer.style.display = "none";
  document.getElementById("scene-canvas").style.display = "block";
  arEnterBtn.textContent = "🔭 View in AR";
  document.getElementById("hint").innerHTML = 'Drag to orbit • Scroll to zoom • <strong style="color:#ffb86b">Tap Earth</strong> to learn about seasons';

  lastTime = performance.now();
  renderer.setAnimationLoop(render);
}

arEnterBtn.addEventListener("click", () => {
  if (isARMode) { exitAR(); } else { enterAR(); }
});

// Run the app instantly!
startApp();
