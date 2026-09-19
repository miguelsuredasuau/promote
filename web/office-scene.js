import * as THREE from '/vendor/three.module.js';
import { qaStageCopy } from './office-model.js';

/** The scene is a view of the application model; it never advances a workflow. */
export function createOfficeScene(host, { onSelect = () => {} } = {}) {
  const P = { cream: 0xf4efdf, paper: 0xfffcf0, petrol: 0x244f4a, dark: 0x153a37, green: 0x82a68a, sage: 0xb5c6a0, wood: 0xcaa57c, amber: 0xe3af62, red: 0xca705d, metal: 0x667e75 };
  let renderer;
  const fallback = () => {
    const message = document.createElement('p');
    message.className = 'office-fallback';
    message.textContent = '3D office unavailable. Use the station controls to inspect the workspace.';
    host.append(message);
    host.dispatchEvent(new CustomEvent('officecontextlost', { bubbles: true }));
    return message;
  };
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch { const message = fallback(); return { update() {}, focus() {}, dispose() { message.remove(); } }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(P.cream, 0);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Isometric office with backlog, engineering, strategy, QA and finance stations. Use the station controls to inspect them.');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-13, 13, 10, -10, .1, 100);
  const baseCamera = new THREE.Vector3(19, 22, 27);
  camera.position.copy(baseCamera); camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xfffcdf, 0x71897a, 2.5));
  const sun = new THREE.DirectionalLight(0xfff2d5, 3.1);
  sun.position.set(-8, 20, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  sun.shadow.normalBias = .04; sun.shadow.bias = -.0001;
  scene.add(sun);
  const mats = Object.fromEntries(Object.entries(P).map(([k, color]) => [k, new THREE.MeshStandardMaterial({ color, roughness: .8 })]));
  const textures = [], labels = [], pickable = [], stations = {};
  const v = new THREE.Vector3();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let model = {}, selected = null, hovered = null, disposed = false, lost = false, frame = 0, previous = 0, clock = 0, signature = '', fallbackNode;
  const mesh = (parent, geometry, material, pos = [0, 0, 0]) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (p, s, pos, mat = mats.petrol) => mesh(p, new THREE.BoxGeometry(...s), mat, pos);
  const cyl = (p, radius, height, pos, mat = mats.petrol, bottom = radius) => mesh(p, new THREE.CylinderGeometry(radius, bottom, height, 20), mat, pos);
  const sphere = (p, radius, pos, mat) => mesh(p, new THREE.SphereGeometry(radius, 20, 14), mat, pos);
  function rounded(p, w, h, d, pos, mat, r = .1) {
    r = Math.min(r, w / 3, h / 3, d / 3);
    const shape = new THREE.Shape();
    const x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
    shape.moveTo(x, y); shape.lineTo(x + ww, y); shape.lineTo(x + ww, y + hh); shape.lineTo(x, y + hh); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: r, bevelThickness: r });
    geo.translate(0, 0, -d / 2 + r);
    return mesh(p, geo, mat, pos);
  }
  function station(id, x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); g.userData.station = id; scene.add(g); stations[id] = g; pickable.push(g); return g; }
  function label(text, anchor, className = 'office-label', stationId) {
    const node = document.createElement(stationId ? 'button' : 'div'); node.className = className; node.textContent = text;
    node.style.position = 'absolute'; node.style.transform = 'translate(-50%,-50%)';
    if (stationId) { node.type = 'button'; node.addEventListener('click', () => onSelect(stationId)); }
    else node.style.pointerEvents = 'none';
    node.hidden = true; node.dataset.station = stationId || ''; node.style.pointerEvents = 'none'; node.tabIndex = -1; host.append(node); labels.push({ node, anchor }); return node;
  }
  function anchor(parent, x, y, z) { const a = new THREE.Object3D(); a.position.set(x, y, z); parent.add(a); return a; }
  function surface(parent, w, h, pos, width = 1024, height = 512) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const face = mesh(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }), pos); face.castShadow = false;
    return { canvas, ctx, texture, face };
  }
  function paint(s, bg, draw) { const c = s.ctx; c.fillStyle = bg; c.fillRect(0, 0, s.canvas.width, s.canvas.height); c.textBaseline = 'top'; c.textAlign = 'left'; draw(c, s.canvas.width, s.canvas.height); s.texture.needsUpdate = true; }
  function text(c, content, x, y, size = 30, color = '#244f4a', maxWidth) { c.fillStyle = color; c.font = `600 ${size}px system-ui,sans-serif`; if (maxWidth) c.fillText(String(content ?? ''), x, y, maxWidth); else c.fillText(String(content ?? ''), x, y); }
  function lines(c, content, x, y, maxWidth, size = 25, maxLines = 2, color = '#244f4a') {
    c.font = `500 ${size}px system-ui,sans-serif`; c.fillStyle = color;
    const words = String(content ?? '').split(/\s+/); let line = '', row = 0;
    for (const word of words) { const next = line ? `${line} ${word}` : word; if (c.measureText(next).width > maxWidth && line) { c.fillText(line, x, y + row * (size + 8)); row++; line = word; if (row >= maxLines) return; } else line = next; }
    if (row < maxLines) c.fillText(line, x, y + row * (size + 8));
  }
  // Open dollhouse shell: the low left wall and rear glazing preserve every station.
  rounded(scene, 21, .5, 14.7, [0, -.38, 0], mats.wood, .15);
  box(scene, [20.6, .12, 14.3], [0, -.08, 0], mats.cream);
  for (let x = -9; x <= 9; x += 1.4) box(scene, [.018, .008, 14.1], [x, -.012, 0], mats.wood);
  box(scene, [20.6, 4.7, .22], [0, 2.3, -7.1], mats.paper);
  box(scene, [.2, 1.05, 14.3], [-10.25, .5, 0], mats.paper);
  box(scene, [20.6, .14, .18], [0, .18, -6.9], mats.wood);
  const glass = new THREE.MeshStandardMaterial({ color: 0xb6d5ca, roughness: .3, metalness: .1 });
  for (const x of [-7.3, -3.85]) {
    rounded(scene, 3.1, 2.9, .12, [x, 2.95, -6.92], mats.petrol);
    box(scene, [2.85, 2.62, .09], [x, 2.95, -6.83], glass);
    box(scene, [.065, 2.62, .12], [x, 2.95, -6.76], mats.paper);
    box(scene, [2.85, .065, .12], [x, 3.1, -6.76], mats.paper);
    box(scene, [3.2, .13, .5], [x, 1.52, -6.68], mats.wood);
  }
  // Sunlight patches and quiet woven area rug.
  const rug = rounded(scene, 7.3, .045, 4.4, [-1, .018, 3.4], mats.sage, .012);
  for (let i = 0; i < 9; i++) box(scene, [6.8, .006, .016], [-1, .047, 1.55 + i * .45], mats.cream);
  function plant(x, z, scale = 1) {
    const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(scale); scene.add(p);
    cyl(p, .4, .64, [0, .33, 0], mats.wood, .31); cyl(p, .33, .03, [0, .66, 0], mats.dark);
    for (let i = 0; i < 7; i++) { const a = i * 2.4; const leaf = sphere(p, .36, [Math.cos(a) * .3, 1.05 + (i % 3) * .27, Math.sin(a) * .3], i % 2 ? mats.green : mats.petrol); leaf.scale.set(.6, 1.8, .55); leaf.rotation.z = Math.cos(a) * .6; }
  }
  plant(-9, -5.5, 1.2); plant(9, -5.8, 1.15); plant(9.15, 5.5); plant(-9.1, 5.7, .85);
  function desk(p, w, d, x = 0, z = 0) {
    rounded(p, w, .2, d, [x, 1.48, z], mats.wood);
    for (const dx of [-w / 2 + .23, w / 2 - .23]) for (const dz of [-d / 2 + .2, d / 2 - .2]) box(p, [.13, 1.42, .13], [x + dx, .7, z + dz]);
  }
  function lamp(p, x, z) {
    cyl(p, .26, .08, [x, 1.63, z]); cyl(p, .045, .7, [x, 1.99, z]);
    const arm = box(p, [.62, .07, .07], [x + .23, 2.33, z]); arm.rotation.z = .23;
    cyl(p, .16, .25, [x + .51, 2.27, z], mats.green, .29); cyl(p, .21, .02, [x + .51, 2.14, z], mats.paper);
  }
  function mug(p, x, y, z) { cyl(p, .13, .24, [x, y, z], mats.paper); const ring = mesh(p, new THREE.TorusGeometry(.1, .027, 8, 16), mats.paper, [x + .15, y, z]); ring.rotation.y = Math.PI / 2; cyl(p, .105, .008, [x, y + .121, z], mats.dark); }
  const backlog = station('backlog', -6.4, -2.7);
  for (const x of [-2.25, 2.25]) { box(backlog, [.14, 3.4, .14], [x, 1.7, 0]); box(backlog, [.55, .14, 1], [x, .08, 0]); }
  rounded(backlog, 5.1, 2.7, .18, [0, 2.6, 0], mats.wood);
  const board = surface(backlog, 4.86, 2.46, [0, 2.6, .11], 1200, 650);
  label('Backlog', anchor(backlog, 0, 4.3, 0), 'office-label', 'backlog');
  const eng = station('engineering', -5.1, 2.5); desk(eng, 4.9, 2.2);
  rounded(eng, 2.85, 1.68, .15, [0, 2.61, -.43], mats.dark);
  const terminal = surface(eng, 2.62, 1.43, [0, 2.61, -.345], 1050, 600);
  box(eng, [.14, .5, .14], [0, 1.86, -.43]); rounded(eng, .95, .07, .5, [0, 1.61, -.4], mats.dark, .02);
  rounded(eng, 1.65, .09, .5, [-.15, 1.63, .42], mats.paper, .035);
  for (let i = 0; i < 11; i++) for (let j = 0; j < 3; j++) box(eng, [.1, .008, .09], [-.83 + i * .14, 1.682, .27 + j * .13], mats.metal);
  rounded(eng, .25, .12, .38, [1.05, 1.68, .45], mats.green, .04); lamp(eng, -1.96, -.65); mug(eng, 1.98, 1.72, -.5);
  label('Engineering', anchor(eng, 0, 3.8, -.3), 'office-label', 'engineering');
  const strat = station('strategy', .85, -5.7);
  rounded(strat, 4.1, 2.58, .17, [0, 2.9, 0], mats.wood);
  const ideas = surface(strat, 3.86, 2.34, [0, 2.9, .095], 1050, 660);
  desk(strat, 3.9, 1.45, 0, 1.2); mug(strat, 1.2, 1.72, 1.3);
  rounded(strat, 1.2, .06, .74, [-.6, 1.62, 1.2], mats.petrol, .015);
  label('Strategy', anchor(strat, 0, 4.45, 0), 'office-label', 'strategy');
  const qa = station('qa', 3.7, 3.35);
  rounded(qa, 7.2, .38, 2, [0, 1.15, 0], mats.petrol);
  box(qa, [6.95, .06, 1.7], [0, 1.38, 0], mats.dark);
  const slats = []; for (let i = 0; i < 35; i++) slats.push(box(qa, [.035, .018, 1.63], [-3.37 + i * .197, 1.425, 0], mats.metal));
  for (const x of [-3, 3]) for (const z of [-.7, .7]) box(qa, [.15, 1.1, .15], [x, .55, z]);
  const gates = [], gateLabels = [], stageNodes = [], gateX = [-2.65, -.9, .9, 2.65];
  gateX.forEach((x, index) => {
    const node = label(['Scope', 'Chart correctness', 'Regressions', 'Release'][index], anchor(qa, x, index % 2 ? 2.75 : 3.45, .1), 'office-label office-stage-label', 'qa');
    node.dataset.stageIndex = String(index); stageNodes.push(node);
    for (const dx of [-.73, .73]) box(qa, [.09, 1.43, .1], [x + dx, 2.12, -.82]);
    rounded(qa, 1.53, .5, .18, [x, 2.9, -.82], mats.petrol, .035);
    gateLabels.push(surface(qa, 1.43, .4, [x, 2.9, -.718], 520, 170));
    const indicator = sphere(qa, .085, [x + .56, 3.28, -.82], mats.sage.clone()); gates.push(indicator);
  });
  const parcel = new THREE.Group(); parcel.position.set(-2.65, 1.78, 0); qa.add(parcel);
  rounded(parcel, .79, .66, .78, [0, 0, 0], mats.amber, .06); box(parcel, [.13, .014, .8], [0, .34, 0], mats.paper);
  const parcelFace = surface(parcel, .67, .34, [0, .01, .4], 520, 220);
  label('QA pipeline', anchor(qa, .15, 4.65, -.5), 'office-label', 'qa');
  const finance = station('finance', 6.85, -3.75);
  rounded(finance, 2.8, 2.9, 2.1, [0, 1.5, 0], mats.petrol, .15);
  box(finance, [2.35, 2.4, .06], [0, 1.55, 1.08], mats.dark);
  for (const y of [.62, 1.25, 1.9]) { box(finance, [2.05, .06, .65], [0, y, .83], mats.metal); for (let i = 0; i < 3; i++) cyl(finance, .2, .14, [-.67 + i * .63, y + .12, .8], mats.amber); }
  const hinge = new THREE.Group(); hinge.position.set(-1.22, 1.5, 1.17); finance.add(hinge);
  rounded(hinge, 2.45, 2.56, .2, [1.22, 0, 0], mats.green, .09);
  const safeDisplay = surface(hinge, 1.85, .78, [1.22, .5, .11], 840, 350);
  const wheel = mesh(hinge, new THREE.TorusGeometry(.33, .055, 10, 28), mats.paper, [1.22, -.43, .2]);
  for (let i = 0; i < 3; i++) { const spoke = box(hinge, [.66, .055, .065], [1.22, -.43, .2], mats.paper); spoke.rotation.z = i * Math.PI / 3; }
  label('Finance', anchor(finance, 0, 3.7, 0), 'office-label', 'finance');
  const tickerFrame = rounded(scene, 5.2, .68, .13, [5.9, 4.18, -6.92], mats.petrol, .055);
  const ticker = surface(scene, 4.95, .47, [5.9, 4.18, -6.84], 1500, 160);
  // Lounge furniture and small inhabited details, kept clear of the main path.
  rounded(scene, 2.6, .48, 1.15, [1, .46, -.75], mats.green);
  rounded(scene, 2.6, .76, .3, [1, 1.06, -1.19], mats.petrol);
  for (const x of [-.2, 2.2]) rounded(scene, .24, .65, 1.15, [x, .83, -.75], mats.petrol);
  cyl(scene, .74, .1, [1, .77, .75], mats.wood); cyl(scene, .08, .72, [1, .38, .75]); mug(scene, .8, .95, .7);
  function person(x, z, coat, facing = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = facing; scene.add(g);
    const legs = [];
    for (const dx of [-.19, .19]) { const leg = new THREE.Group(); leg.position.set(dx, .81, 0); g.add(leg); cyl(leg, .115, .66, [0, -.32, 0], mats.dark); rounded(leg, .29, .15, .44, [0, -.69, .07], mats.petrol, .045); legs.push(leg); }
    cyl(g, .32, .78, [0, 1.19, 0], coat, .28); sphere(g, .31, [0, 1.52, 0], coat).scale.y = .5;
    cyl(g, .11, .15, [0, 1.69, 0], mats.wood);
    sphere(g, .32, [0, 1.96, 0], mats.cream).scale.set(.92, 1.1, .95);
    const hair = sphere(g, .326, [0, 2.11, -.04], mats.petrol); hair.scale.set(1, .57, .94);
    for (const dx of [-.108, .108]) sphere(g, .025, [dx, 1.98, .285], mats.dark);
    sphere(g, .045, [0, 1.91, .315], mats.wood);
    const arms = [];
    for (const dx of [-.37, .37]) { const shoulder = new THREE.Group(); shoulder.position.set(dx, 1.48, 0); g.add(shoulder); sphere(shoulder, .125, [0, 0, 0], coat); cyl(shoulder, .102, .38, [0, -.19, 0], coat); const elbow = new THREE.Group(); elbow.position.y = -.38; shoulder.add(elbow); sphere(elbow, .106, [0, 0, 0], mats.wood); cyl(elbow, .085, .35, [0, -.175, 0], coat); sphere(elbow, .105, [0, -.37, 0], mats.cream); arms.push({ shoulder, elbow }); }
    return { g, legs, arms };
  }
  const engineer = person(-5.25, 4.1, mats.petrol, Math.PI);
  const tester = person(5.4, 5.3, mats.green, -.4);
  const ceo = person(-.75, -2.35, mats.wood, .35);
  const engBubble = label('', anchor(engineer.g, 0, 2.65, 0), 'office-bubble');
  const qaBubble = label('', anchor(tester.g, 0, 2.65, 0), 'office-bubble');
  const ceoBubble = label('', anchor(ceo.g, 0, 2.65, 0), 'office-bubble');
  function currency(value) { if (value === null || value === undefined || value === '') return '—'; const n = Number(value); return Number.isFinite(n) ? `${model.finance?.currency || '$'} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'; }
  function update(next) {
    if (disposed) return;
    model = next || {};
    const nextSignature = JSON.stringify(model); if (nextSignature === signature) return; signature = nextSignature;
    paint(board, '#fffcf0', (c, w) => {
      text(c, 'WORK QUEUE', 32, 22, 37); const cols = model.kanban?.columns || []; const cw = (w - 50) / Math.max(cols.length, 1);
      cols.forEach((col, i) => { const x = 25 + i * cw; c.fillStyle = '#e9eadb'; c.fillRect(x, 91, cw - 15, 535); text(c, col.label, x + 14, 109, 27, '#244f4a', cw - 43); (col.cards || []).slice(0, 4).forEach((card, j) => { const y = 160 + j * 112; c.fillStyle = j % 2 ? '#dde7d3' : '#f6e8bc'; c.fillRect(x + 12, y, cw - 39, 98); text(c, card.id, x + 24, y + 9, 18); lines(c, card.title, x + 24, y + 36, cw - 66, 23, 2); }); });
    });
    paint(terminal, '#153a37', (c, w) => { text(c, `ENGINEERING · ${model.engineering?.status || 'idle'}`, 30, 24, 29, '#b5c6a0', w - 60); lines(c, model.engineering?.task || 'No active task', 30, 78, w - 60, 29, 2, '#fffcf0'); (model.engineering?.lines || []).slice(-8).forEach((line, i) => { text(c, typeof line === 'string' ? line : line.text || line.message || JSON.stringify(line), 30, 177 + i * 46, 25, '#d6e3ce', w - 60); }); });
    paint(ideas, '#e2d4b5', (c, w) => { text(c, 'IDEAS & DIRECTION', 30, 24, 37); (model.strategy?.ideas || []).slice(0, 4).forEach((idea, i) => { const x = 30 + (i % 2) * (w / 2 - 10), y = 95 + Math.floor(i / 2) * 265; c.fillStyle = i % 2 ? '#d6e1bd' : '#fff4cb'; c.fillRect(x, y, w / 2 - 45, 237); c.fillStyle = '#ca705d'; c.beginPath(); c.arc(x + (w / 2 - 45) / 2, y + 12, 7, 0, Math.PI * 2); c.fill(); lines(c, idea.title, x + 20, y + 35, w / 2 - 85, 30, 2); lines(c, idea.body || idea.status, x + 20, y + 118, w / 2 - 85, 23, 3); }); });
    const q = model.qa || {};
    gateLabels.forEach((s, i) => { const stage = q.stages?.[i]; const copy = qaStageCopy(stage || { id: ['provenance', 'meaning', 'regression', 'release'][i] }, model.mode); stageNodes[i].textContent = copy.title; stageNodes[i].dataset.outcome = stage?.outcome || 'not_run'; stageNodes[i].title = copy.headline; paint(s, '#244f4a', c => { text(c, copy.title, 18, 20, 44, '#f4efdf', 480); text(c, stage?.outcome || 'not_run', 18, 94, 31, '#b5c6a0', 480); }); const outcome = stage?.outcome; gates[i].material.color.setHex(outcome === 'pass' ? P.green : ['fail', 'error'].includes(outcome) ? P.red : outcome === 'pending' ? P.amber : P.sage); });
    parcel.visible = Boolean(q.candidateId);
    paint(parcelFace, '#fffcf0', c => { text(c, q.candidateId || 'No candidate', 20, 25, 45, '#244f4a', 480); text(c, `Attempt ${q.attempt || 0}`, 20, 105, 35); });
    if (reduced.matches || q.status === 'failed' || q.status === 'idle') parcel.position.x = gateX[Math.min(3, Math.max(0, Number(q.stageIndex) || 0))];
    paint(safeDisplay, '#153a37', c => { text(c, 'BUDGET / SPENT', 25, 20, 29, '#b5c6a0'); text(c, currency(model.finance?.budget), 25, 76, 64, '#fffcf0', 790); text(c, currency(model.finance?.spent), 25, 163, 43, '#e3af62', 790); text(c, `Reserved ${currency(model.finance?.reserved)}`, 25, 255, 28, '#fffcf0', 790); });
    paint(ticker, '#244f4a', (c, w) => { const count = (model.kanban?.columns || []).reduce((sum, col) => sum + (col.cards?.length || 0), 0); text(c, `${String(model.mode || 'live').toUpperCase()}    /    ${count} TASKS    /    QA ${String(q.status || 'idle').toUpperCase()}    /    SPENT ${currency(model.finance?.spent)}`, 30, 46, 46, '#f4efdf', w - 60); });
    engBubble.textContent = model.engineering?.status === 'idle' ? 'Ready for a task' : String(model.engineering?.status || 'Idle');
    const currentStage = q.stages?.[q.stageIndex];
    qaBubble.textContent = q.status === 'failed' ? (model.mode === 'demo' && currentStage ? qaStageCopy(currentStage, model.mode).headline : 'Check failed · inspect evidence') : q.status === 'completed' ? 'Checks passed' : q.status === 'running' ? `${currentStage ? qaStageCopy(currentStage, model.mode).title : 'Checks'} in progress` : 'Waiting for a candidate';
    qaBubble.dataset.outcome = q.status || 'idle';
    ceoBubble.textContent = `${model.strategy?.ideas?.length || 0} ideas to explore`;
    requestRender();
  }
  function focus(id) { selected = stations[id] ? id : null; hovered = null; requestRender(); }
  function preview(id) { hovered = stations[id] ? id : null; requestRender(); }
  const cameraTarget = new THREE.Vector3(0, 1, 0);
  const destination = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function pick(event) { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pickable, true)[0]; let o = hit?.object; while (o && !o.userData.station) o = o.parent; return o?.userData.station; }
  function click(e) { const id = pick(e); if (id) onSelect(id); }
  function hover(e) { const id = pick(e); renderer.domElement.style.cursor = id ? 'pointer' : 'default'; if (hovered !== id) { hovered = id; requestRender(); } }
  function leave() { hovered = null; requestRender(); }
  renderer.domElement.addEventListener('click', click); renderer.domElement.addEventListener('pointermove', hover); renderer.domElement.addEventListener('pointerleave', leave);
  let width = 1, height = 1;
  function resize() { width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight); const aspect = width / height; const hh = Math.max(8.4, 12.0 / aspect); Object.assign(camera, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh }); camera.updateProjectionMatrix(); renderer.setSize(width, height, false); requestRender(); }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  function requestRender() { if (!disposed && !lost && !document.hidden && !frame) frame = requestAnimationFrame(render); }
  function render(time) {
    frame = 0; if (disposed || lost || document.hidden) return;
    const dt = previous ? Math.min((time - previous) / 1000, .05) : .016; previous = time; clock += dt;
    const motion = !reduced.matches, demo = model.mode === 'demo';
    const targetDoor = selected === 'finance' ? -1.15 : 0; hinge.rotation.y += (targetDoor - hinge.rotation.y) * (motion ? Math.min(1, dt * 7) : 1);
    destination.set(0, 1, 0);
    if (selected) { stations[selected].getWorldPosition(destination); destination.y = selected === 'backlog' || selected === 'strategy' ? 2.8 : 1.8; }
    cameraTarget.lerp(destination, motion ? Math.min(1, dt * 5) : 1);
    camera.position.copy(baseCamera).add(cameraTarget).sub(new THREE.Vector3(0, 1, 0)); camera.lookAt(cameraTarget);
    const targetZoom = selected ? (width < 650 ? 1.65 : 2.35) : 1; camera.zoom += (targetZoom - camera.zoom) * (motion ? Math.min(1, dt * 5) : 1); camera.updateProjectionMatrix();
    const q = model.qa || {}; const target = gateX[Math.min(3, Math.max(0, Number(q.stageIndex) || 0))];
    if (q.status === 'running' || q.status === 'completed') parcel.position.x += (target - parcel.position.x) * (motion ? Math.min(1, dt * 2.7) : 1);
    if (motion && q.status === 'running') slats.forEach((s, i) => { s.position.x = -3.37 + i * .197 + (clock * .65 % .197); });
    engineer.arms.forEach((a, i) => { const typing = demo && model.engineering?.status && model.engineering.status !== 'idle'; a.shoulder.rotation.x = -1.1 + (motion && typing ? Math.sin(clock * 8 + i * Math.PI) * .09 : 0); a.elbow.rotation.x = -.55; });
    tester.arms[0].shoulder.rotation.x = q.status === 'failed' ? -1.5 : -.12; tester.arms[0].elbow.rotation.x = q.status === 'failed' ? -.5 : -.1;
    if (motion && demo) { ceo.g.position.x = -.75 + Math.sin(clock * .36) * .75; ceo.g.rotation.y = Math.cos(clock * .36) > 0 ? .7 : -.7; ceo.legs.forEach((leg, i) => leg.rotation.x = Math.sin(clock * 3 + i * Math.PI) * .16); }
    else { ceo.g.position.x = -.75; ceo.g.rotation.y = .35; ceo.legs.forEach(leg => leg.rotation.x = 0); }
    scene.updateMatrixWorld();
    labels.forEach(({ node, anchor: point }) => { point.getWorldPosition(v); v.project(camera); node.style.left = `${(v.x + 1) * .5 * width}px`; node.style.top = `${(-v.y + 1) * .5 * height}px`; node.hidden = !!selected || !hovered || node.dataset.station !== hovered || node.classList.contains('office-stage-label') || v.z < -1 || v.z > 1; });
    renderer.render(scene, camera);
    const settling = cameraTarget.distanceTo(destination) > .001 || Math.abs(hinge.rotation.y - targetDoor) > .001 || Math.abs(camera.zoom - targetZoom) > .001 || ((q.status === 'running' || q.status === 'completed') && Math.abs(parcel.position.x - target) > .002);
    if (motion && (demo || q.status === 'running' || settling)) requestRender();
  }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { previous = 0; requestRender(); } }
  function motionChange() { previous = 0; requestRender(); }
  function contextLost(event) { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; fallbackNode = fallback(); labels.forEach(({ node }) => node.style.display = 'none'); }
  document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motionChange); renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize(); update({});
  return { update, focus, preview, dispose() { disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motionChange); renderer.domElement.removeEventListener('click', click); renderer.domElement.removeEventListener('pointermove', hover); renderer.domElement.removeEventListener('pointerleave', leave); renderer.domElement.removeEventListener('webglcontextlost', contextLost); labels.forEach(({ node }) => node.remove()); fallbackNode?.remove(); const geometries = new Set(), materials = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove(); } };
}
