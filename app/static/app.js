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
  if (solidMesh)  solidMesh.visible  = mode === 'solid' || mode === 'both';
  if (wireMesh)   wireMesh.visible   = mode === 'wireframe' || mode === 'both';
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

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-2, 2, -3);
  scene.add(fill);

  // Build geometry from elevation data
  const { width, height, elevation_data, min_elevation, max_elevation } = data;
  const elevRange = max_elevation - min_elevation || 1;

  const positions = new Float32Array(width * height * 3);
  const colors    = new Float32Array(width * height * 3);
  const uvs       = new Float32Array(width * height * 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i    = y * width + x;
      const elev = elevation_data[i];
      const t    = (elev - min_elevation) / elevRange; // 0..1

      positions[i * 3 + 0] = (x / (width  - 1)) * 2 - 1;
      positions[i * 3 + 1] = t * 0.8;
      positions[i * 3 + 2] = ((height - 1 - y) / (height - 1)) * 2 - 1;

      // Grayscale vertex colour: dark low, bright high
      const c = 0.18 + t * 0.82;
      colors[i * 3]     = c;
      colors[i * 3 + 1] = c;
      colors[i * 3 + 2] = c;

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
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Solid mesh
  solidMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.0,
    })
  );
  scene.add(solidMesh);

  // Wireframe overlay
  wireMesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x3a3a3a, wireframe: true })
  );
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
