import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── State ─────────────────────────────────────────────
let scene, camera, renderer, controls, animFrameId;
let solidMesh, wireMesh;
let currentFileId = null;

// ── DOM refs ──────────────────────────────────────────
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const fileInfo      = document.getElementById('fileInfo');
const fileNameEl    = document.getElementById('fileName');
const clearBtn      = document.getElementById('clearBtn');
const processBtn    = document.getElementById('processBtn');
const uploadSection = document.getElementById('uploadSection');
const processingSection = document.getElementById('processingSection');
const viewerSection = document.getElementById('viewerSection');
const metaRow       = document.getElementById('metaRow');
const downloadBtn   = document.getElementById('downloadBtn');
const newFileBtn    = document.getElementById('newFileBtn');
const btnSolid      = document.getElementById('btnSolid');
const btnWireframe  = document.getElementById('btnWireframe');
const btnBoth       = document.getElementById('btnBoth');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvas        = document.getElementById('terrainCanvas');

// ── Upload zone ───────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) applyFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) applyFile(fileInput.files[0]);
});

function applyFile(file) {
  if (!/\.(tif|tiff)$/i.test(file.name)) {
    alert('Please select a .tif or .tiff file.');
    return;
  }
  fileInput._file = file;
  fileNameEl.textContent = file.name;
  fileInfo.classList.add('visible');
  processBtn.disabled = false;
}

clearBtn.addEventListener('click', resetUpload);

function resetUpload() {
  fileInput.value = '';
  fileInput._file = null;
  fileNameEl.textContent = '';
  fileInfo.classList.remove('visible');
  processBtn.disabled = true;
}

// ── Process ───────────────────────────────────────────
processBtn.addEventListener('click', async () => {
  const file = fileInput._file;
  if (!file) return;

  show('processing');

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Server error');
    }
    const data = await res.json();
    currentFileId = data.file_id;
    show('viewer');
    buildMeta(data);
    // Wait one frame for the DOM to lay out before measuring canvas size
    requestAnimationFrame(() => initScene(data));
  } catch (err) {
    alert('Error: ' + err.message);
    show('upload');
  }
});

// ── Viewer controls ───────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (currentFileId) window.location.href = `/api/download/${currentFileId}`;
});

newFileBtn.addEventListener('click', () => {
  destroyScene();
  resetUpload();
  show('upload');
});

btnSolid.addEventListener('click',      () => setMode('solid'));
btnWireframe.addEventListener('click',  () => setMode('wireframe'));
btnBoth.addEventListener('click',       () => setMode('both'));

function setMode(mode) {
  btnSolid.classList.toggle('active',      mode === 'solid');
  btnWireframe.classList.toggle('active',  mode === 'wireframe');
  btnBoth.classList.toggle('active',       mode === 'both');

  if (solidMesh) solidMesh.visible = mode === 'solid' || mode === 'both';

  if (wireMesh) {
    wireMesh.visible = mode === 'wireframe' || mode === 'both';
    // Subtle dark grid over texture in Both; clear visible lines in Wireframe-only
    wireMesh.material.color.set(mode === 'both' ? 0x000000 : 0x999999);
    wireMesh.material.opacity = mode === 'both' ? 0.12 : 0.75;
    wireMesh.material.needsUpdate = true;
  }
}

// ── Section visibility ────────────────────────────────
function show(section) {
  uploadSection.style.display     = section === 'upload'     ? '' : 'none';
  processingSection.style.display = section === 'processing' ? '' : 'none';
  viewerSection.style.display     = section === 'viewer'     ? 'flex' : 'none';
}

// ── Meta display ──────────────────────────────────────
function buildMeta(data) {
  const range = (data.max_elevation - data.min_elevation).toFixed(1);
  metaRow.innerHTML = `
    <div class="meta-item">
      <span class="meta-label">Min Elevation</span>
      <span class="meta-value">${data.min_elevation.toFixed(1)} m</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Max Elevation</span>
      <span class="meta-value">${data.max_elevation.toFixed(1)} m</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Range</span>
      <span class="meta-value">${range} m</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Grid</span>
      <span class="meta-value">${data.width} x ${data.height}</span>
    </div>
  `;
}

// ── Three.js scene ────────────────────────────────────
function initScene(data) {
  const W = canvasWrapper.clientWidth;
  const H = canvasWrapper.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040404);

  // Camera
  camera = new THREE.PerspectiveCamera(45, W / H, 0.001, 200);
  camera.position.set(0, 1.6, 2.8);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0.15, 0);
  controls.update();

  // ── Lighting ─────────────────────────────────────────
  // Sky (pale blue) + ground (warm soil) hemisphere for natural ambient
  const hemi = new THREE.HemisphereLight(0xa8c8e8, 0x7a5c2e, 0.7);
  scene.add(hemi);

  // Sun from NW at ~45 deg — matches hillshade baked into the texture
  const sun = new THREE.DirectionalLight(0xfff2cc, 2.0);
  sun.position.set(-3, 4, 3);
  scene.add(sun);

  // Cool blue fill from SE to soften shadows
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.4);
  fill.position.set(3, 1, -3);
  scene.add(fill);

  // ── Geometry ──────────────────────────────────────────
  const { width, height, elevation_data, min_elevation, max_elevation } = data;
  const elevRange = max_elevation - min_elevation || 1;

  const positions = new Float32Array(width * height * 3);
  const uvs       = new Float32Array(width * height * 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i    = y * width + x;
      const t    = (elevation_data[i] - min_elevation) / elevRange;

      positions[i * 3 + 0] = (x / (width  - 1)) * 2 - 1;
      positions[i * 3 + 1] = t * 0.8;
      positions[i * 3 + 2] = ((height - 1 - y) / (height - 1)) * 2 - 1;

      uvs[i * 2]     = x / (width  - 1);
      uvs[i * 2 + 1] = 1 - y / (height - 1);
    }
  }

  const indices = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = y * width + x;
      const tr = tl + 1;
      const bl = (y + 1) * width + x;
      const br = bl + 1;
      indices.push(tl, bl, tr, tr, bl, br);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // ── Solid mesh with terrain texture ───────────────────
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.02,
  });

  if (data.texture) {
    const tex = new THREE.Texture();
    const img = new Image();
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
      mat.map = tex;
      mat.needsUpdate = true;
    };
    img.src = 'data:image/png;base64,' + data.texture;
  }

  solidMesh = new THREE.Mesh(geo, mat);
  scene.add(solidMesh);

  // ── Wireframe overlay ─────────────────────────────────
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x888888,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
  });
  wireMesh = new THREE.Mesh(geo, wireMat);
  wireMesh.renderOrder = 1;
  wireMesh.visible = false;
  scene.add(wireMesh);

  setMode('solid');

  window.addEventListener('resize', onResize);
  animate();
}

function destroyScene() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  window.removeEventListener('resize', onResize);
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = camera = controls = solidMesh = wireMesh = null;
}

function onResize() {
  if (!renderer) return;
  const W = canvasWrapper.clientWidth;
  const H = canvasWrapper.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
}

function animate() {
  animFrameId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
