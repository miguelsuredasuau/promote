import * as THREE from '/vendor/three.module.js';

// Isolated visual fixture: no API calls, evidence writes, or repository actions.
const host = document.querySelector('#prototype-scene');
const status = document.querySelector('#prototype-status');
const stationNames = [
  'A00–A02 · provenance / scope',
  'A03–A04 · meaning / artifact',
  'A05–A07 · regression',
  'A08–A10 · release',
];
const stationX = [-6, -2, 2, 6];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const palette = { cream: 0xf0eee2, petrol: 0x204d49, green: 0x79a984, amber: 0xe4b46c, red: 0xca6c56, dark: 0x153735, white: 0xfffdf5 };

if (host) startPrototype();

function startPrototype() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    host.textContent = 'The 3D demo needs WebGL, which is unavailable in this browser. This is a visual fixture; no checks have been executed.';
    if (status) status.textContent = '3D preview unavailable. No repository or evidence was changed.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(palette.cream, 0);
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D QA conveyor demo. Use the station buttons to inspect each stage.');
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-13, 13, 9, -9, 0.1, 100);
  camera.position.set(18, 19, 25);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfffdf5, 0x7a8c7b, 2.4));
  const sun = new THREE.DirectionalLight(0xfff8df, 3.2);
  sun.position.set(-6, 17, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 0.5, far: 50 });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name, mat(color)]));
  function box(parent, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function canvasLabel(width = 768, height = 160) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, context, texture };
  }
  function writeLabel(label, lines, color = '#f0eee2', background = '#204d49') {
    const { canvas, context, texture } = label;
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${lines.length > 1 ? 38 : 43}px ui-monospace, monospace`;
    lines.forEach((line, index) => context.fillText(line, canvas.width / 2, canvas.height * (index + 0.5) / lines.length, canvas.width - 34));
    texture.needsUpdate = true;
  }
  function sign(parent, label, width, height, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: label.texture, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  box(scene, [23, 0.25, 11], [0, -0.3, 0], materials.cream);
  box(scene, [19.2, 0.48, 2.7], [0, 0.9, 0], materials.petrol);
  box(scene, [18.9, 0.12, 2.34], [0, 1.21, 0], materials.dark);
  for (const x of [-8, -4, 0, 4, 8]) {
    box(scene, [0.26, 1.15, 0.28], [x, 0.3, -0.95], materials.petrol);
    box(scene, [0.26, 1.15, 0.28], [x, 0.3, 0.95], materials.petrol);
  }
  const slats = [];
  for (let i = 0; i < 35; i++) slats.push(box(scene, [0.045, 0.024, 2.25], [-9.1 + i * 0.53, 1.285, 0], materials.green));
  const stationMeshes = [];
  const lamps = [];
  stationX.forEach((x, index) => {
    const group = new THREE.Group();
    scene.add(group);
    group.userData.stage = index;
    box(group, [0.17, 2.9, 0.17], [x - 1.43, 1.5, -1.4], materials.petrol);
    box(group, [0.17, 2.9, 0.17], [x + 1.43, 1.5, -1.4], materials.petrol);
    const top = box(group, [3.05, 0.8, 0.25], [x, 3.1, -1.4], materials.petrol);
    top.userData.stage = index;
    const label = canvasLabel();
    const [code, title] = stationNames[index].split(' · ');
    writeLabel(label, [code, title]);
    const face = sign(group, label, 2.9, 0.66, x, 3.1, -1.255);
    face.userData.stage = index;
    stationMeshes.push(top, face);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), mat(palette.amber));
    lamp.position.set(x + 1.18, 3.75, -1.4);
    group.add(lamp);
    lamps.push(lamp);
    box(group, [2.7, 0.025, 2.22], [x, 1.31, 0], materials.petrol);
  });
  const parcel = new THREE.Group();
  parcel.position.set(-8.8, 1.82, 0);
  scene.add(parcel);
  box(parcel, [1.3, 1.02, 1.25], [0, 0, 0], materials.amber);
  box(parcel, [0.23, 0.025, 1.27], [0, 0.52, 0], materials.cream);
  const parcelLabel = canvasLabel(384, 160);
  writeLabel(parcelLabel, ['PR #042', 'DEMO / 01']);
  sign(parcel, parcelLabel, 1.1, 0.45, 0, 0, 0.633);

  // Hierarchical character rig: shoulder → upper arm → elbow → forearm.
  const robot = new THREE.Group();
  robot.position.set(-2.5, 0, 3.25);
  scene.add(robot);
  box(robot, [0.8, 1, 0.6], [0, 1.05, 0], materials.petrol);
  box(robot, [0.95, 0.7, 0.7], [0, 1.95, 0], materials.cream);
  box(robot, [0.62, 0.19, 0.03], [0, 1.98, 0.365], materials.petrol);
  for (const x of [-0.23, 0.23]) {
    box(robot, [0.23, 0.62, 0.24], [x, 0.38, 0], materials.petrol);
    box(robot, [0.34, 0.16, 0.46], [x, 0.08, 0.09], materials.dark);
  }
  box(robot, [0.18, 0.75, 0.2], [-0.58, 1.09, 0], materials.green);
  const shoulder = new THREE.Group();
  shoulder.position.set(0.51, 1.5, 0);
  robot.add(shoulder);
  box(shoulder, [0.2, 0.62, 0.2], [0, -0.31, 0], materials.green);
  const elbow = new THREE.Group();
  elbow.position.y = -0.61;
  shoulder.add(elbow);
  box(elbow, [0.19, 0.57, 0.19], [0, -0.285, 0], materials.cream);
  box(elbow, [0.22, 0.2, 0.22], [0, -0.6, 0], materials.amber);

  const monitorLabel = canvasLabel(768, 320);
  box(scene, [4.5, 1.9, 0.22], [4.9, 1.55, 3.4], materials.petrol);
  sign(scene, monitorLabel, 4.3, 1.72, 4.9, 1.55, 3.52);
  box(scene, [0.28, 0.8, 0.35], [4.9, 0.45, 3.4], materials.petrol);

  let state = 'running';
  let stage = 0;
  let attempt = 1;
  let beltOffset = 0;
  let inspectedStage = null;
  function describe() {
    if (state === 'failed') return 'DEMO · Attempt 1 stopped at A03–A04: simulated artifact mismatch. The belt is stopped. Resume loads corrected demo candidate 2.';
    if (state === 'complete') return 'DEMO · Attempt 2 passed all four stations. Simulated release complete. No real checks ran and no evidence or repository was changed.';
    if (state === 'paused') return `DEMO · Attempt ${attempt} paused before ${stationNames[stage]}. Resume to continue.`;
    return `DEMO · Attempt ${attempt} moving to ${stationNames[stage]}.${reducedMotion.matches ? ' Reduced motion: select Resume to advance one station.' : ''} All outcomes are scripted.`;
  }
  function sync() {
    const message = describe();
    if (status) status.textContent = message + (inspectedStage === null ? '' : ` Inspecting ${stationNames[inspectedStage]}: ${inspectedStage < stage || state === 'complete' ? 'simulated pass' : inspectedStage === stage && state === 'failed' ? 'simulated mismatch — candidate rejected' : 'waiting for demo candidate'}.`);
    const short = state === 'failed' ? 'STOP · ARTIFACT MISMATCH' : state === 'complete' ? 'ALL STAGES PASSED' : state === 'paused' ? 'BELT PAUSED' : `NEXT · ${stationNames[stage].split(' · ')[0]}`;
    writeLabel(monitorLabel, [`DEMO / ATTEMPT ${attempt}`, short, 'NO REAL EVIDENCE']);
    lamps.forEach((lamp, i) => lamp.material.color.setHex(i < stage || state === 'complete' ? palette.green : i === stage && state === 'failed' ? palette.red : palette.amber));
    document.querySelectorAll('[data-stage]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.stage) === inspectedStage)));
  }
  function arrive() {
    if (attempt === 1 && stage === 1) state = 'failed';
    else if (stage === 3) state = 'complete';
    else stage++;
    sync();
  }
  function reset() {
    stage = 0;
    attempt = 1;
    state = 'running';
    parcel.position.x = -8.8;
    shoulder.rotation.set(0, 0, 0);
    elbow.rotation.set(0, 0, 0);
    inspectedStage = null;
    writeLabel(parcelLabel, ['PR #042', 'DEMO / 01']);
    sync();
  }
  function resume() {
    if (state === 'complete') return;
    if (state === 'failed') {
      attempt = 2;
      state = 'running';
      writeLabel(parcelLabel, ['PR #042', 'DEMO / 02']);
      // Corrected fixture resumes at the rejected gate, preserving prior demo passes.
      arrive();
      return;
    }
    state = 'running';
    if (reducedMotion.matches) {
      parcel.position.x = stationX[stage];
      arrive();
    } else sync();
  }
  document.querySelectorAll('[data-prototype-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.prototypeAction;
    if (action === 'reset') reset();
    if (action === 'resume') resume();
    if (action === 'pause' && state === 'running') { state = 'paused'; sync(); }
  }));
  function inspect(index) {
    if (!Number.isInteger(index) || index < 0 || index > 3) return;
    inspectedStage = index;
    sync();
  }
  document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => inspect(Number(button.dataset.stage))));
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(stationMeshes, false)[0];
  }
  renderer.domElement.addEventListener('pointermove', event => { renderer.domElement.style.cursor = pick(event) ? 'pointer' : 'default'; });
  renderer.domElement.addEventListener('click', event => { const hit = pick(event); if (hit) inspect(hit.object.userData.stage); });
  const resize = new ResizeObserver(() => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 360);
    const aspect = width / height;
    const halfHeight = Math.max(7.7, 12.8 / aspect);
    Object.assign(camera, { left: -halfHeight * aspect, right: halfHeight * aspect, top: halfHeight, bottom: -halfHeight });
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  });
  resize.observe(host);
  let previous = 0;
  let frame;
  function animate(time) {
    const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
    previous = time;
    if (!reducedMotion.matches && state === 'running') {
      beltOffset = (beltOffset + dt * 1.5) % 0.53;
      slats.forEach((slat, i) => { slat.position.x = -9.1 + i * 0.53 + beltOffset; });
      parcel.position.x = Math.min(stationX[stage], parcel.position.x + dt * 1.55);
      if (parcel.position.x >= stationX[stage]) arrive();
    }
    const blend = reducedMotion.matches ? 1 : Math.min(dt * 7, 1);
    const pointing = state === 'failed';
    shoulder.rotation.x += ((pointing ? 1.65 : 0) - shoulder.rotation.x) * blend;
    shoulder.rotation.z += ((pointing ? 0.28 : -0.1) - shoulder.rotation.z) * blend;
    elbow.rotation.x += ((pointing ? -0.55 : -0.12) - elbow.rotation.x) * blend;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    previous = 0;
    if (!document.hidden) frame = requestAnimationFrame(animate);
  });
  reducedMotion.addEventListener('change', () => { previous = 0; sync(); });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    if (status) status.textContent = '3D rendering paused: graphics context was lost. Reload this demo to restart. No repository or evidence was changed.';
  });
  sync();
  frame = requestAnimationFrame(animate);
}
