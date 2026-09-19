import * as THREE from '/vendor/three.module.js';
import { qaStageCopy } from './office-model.js';

/** The scene is a view of the application model; it never advances a workflow. */
export function createOfficeScene(host, { onSelect = () => {}, detailElement } = {}) {
  const P = { cream: 0xf1f2ee, paper: 0xffffff, petrol: 0x214e62, dark: 0x172f3e, green: 0x37a99b, sage: 0xc5dcd5, wood: 0xd5b893, amber: 0xf1b84b, red: 0xe97873, metal: 0x809aa5 };
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
  scene.add(new THREE.HemisphereLight(0xf3f8ff, 0x8999a6, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
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
    return { canvas, ctx, texture, face, width: w, height: h };
  }
  function paint(s, bg, draw) { const c = s.ctx; c.fillStyle = bg; c.fillRect(0, 0, s.canvas.width, s.canvas.height); c.textBaseline = 'top'; c.textAlign = 'left'; draw(c, s.canvas.width, s.canvas.height); s.texture.needsUpdate = true; }
  function text(c, content, x, y, size = 30, color = '#244f4a', maxWidth) { c.fillStyle = color; c.font = `600 ${size}px system-ui,sans-serif`; if (maxWidth) c.fillText(String(content ?? ''), x, y, maxWidth); else c.fillText(String(content ?? ''), x, y); }
  function lines(c, content, x, y, maxWidth, size = 25, maxLines = 2, color = '#244f4a') {
    c.font = `500 ${size}px system-ui,sans-serif`; c.fillStyle = color;
    const words = String(content ?? '').split(/\s+/); let line = '', row = 0;
    for (const word of words) { const next = line ? `${line} ${word}` : word; if (c.measureText(next).width > maxWidth && line) { c.fillText(line, x, y + row * (size + 8)); row++; line = word; if (row >= maxLines) return; } else line = next; }
    if (row < maxLines) c.fillText(line, x, y + row * (size + 8));
  }
  // Open daylight studio: a floating plinth, full-height glazing and slim frames.
  const shellWhite = new THREE.MeshStandardMaterial({ color: 0xfafbf8, roughness: .68 });
  const accentCoral = new THREE.MeshStandardMaterial({ color: 0xed8278, roughness: .65 });
  const accentLilac = new THREE.MeshStandardMaterial({ color: 0xb6a2e0, roughness: .65 });
  const accentBlue = new THREE.MeshStandardMaterial({ color: 0x4d8fda, roughness: .48 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0x9db5be, metalness: .65, roughness: .32 });
  rounded(scene, 21, .42, 14.7, [0, -.34, 0], shellWhite, .15);
  rounded(scene, 20.6, .12, 14.3, [0, -.08, 0], mats.cream, .035);
  box(scene, [20.2, .035, .025], [0, -.11, 7.22], mats.green);
  // Large mineral floor slabs; the fine seams keep the room visually quiet.
  for (const x of [-6.8, 0, 6.8]) box(scene, [.012, .004, 14.1], [x, -.016, 0], mats.sage);
  for (const z of [-3.55, 0, 3.55]) box(scene, [20.4, .004, .012], [0, -.016, z], mats.sage);
  const glass = new THREE.MeshStandardMaterial({ color: 0xaadfe7, transparent: true, opacity: .22, roughness: .12, metalness: .08, depthWrite: false, side: THREE.DoubleSide });
  // The central brand/strategy wall stays solid; wide glass bays flank it.
  box(scene, [7.1, 5.3, .17], [.1, 2.6, -7.12], shellWhite);
  for (const bay of [{ x: -6.95, w: 6.35 }, { x: 7.03, w: 6.3 }]) {
    const pane = box(scene, [bay.w, 5.12, .045], [bay.x, 2.58, -7.1], glass); pane.castShadow = false;
    for (const x of [bay.x - bay.w / 2, bay.x, bay.x + bay.w / 2]) box(scene, [.055, 5.3, .09], [x, 2.6, -7.1], brushed);
    box(scene, [bay.w, .075, .12], [bay.x, 5.22, -7.1], brushed);
    box(scene, [bay.w, .075, .12], [bay.x, .03, -7.1], brushed);
    // Frosted lower strip gives the glass a visible edge without blocking the office.
    const frost = box(scene, [bay.w - .12, .52, .05], [bay.x, .4, -7.06], glass); frost.castShadow = false;
  }
  // A low glass return keeps the silhouette open from the dollhouse camera.
  const sideGlass = box(scene, [.045, 1.4, 10.4], [-10.25, .7, -1.8], glass); sideGlass.castShadow = false;
  for (const z of [-6.98, -1.8, 3.4]) box(scene, [.06, 1.48, .06], [-10.25, .73, z], brushed);
  box(scene, [.065, .055, 10.45], [-10.25, 1.46, -1.8], brushed);
  // A soft blue rug anchors the collaboration area instead of a striped classroom mat.
  rounded(scene, 5.2, .045, 4.2, [.1, .018, -.1], accentLilac, .012);
  rounded(scene, 4.94, .009, 3.94, [.1, .046, -.1], mats.sage, .004);
  function plant(x, z, scale = 1) {
    const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(scale); scene.add(p);
    cyl(p, .37, .7, [0, .35, 0], shellWhite, .33); cyl(p, .31, .03, [0, .71, 0], mats.dark);
    for (let i = 0; i < 8; i++) { const a = i * 2.4; const leaf = sphere(p, .34, [Math.cos(a) * .3, 1.08 + (i % 3) * .3, Math.sin(a) * .3], i % 2 ? mats.green : mats.petrol); leaf.scale.set(.65, 1.65, .28); leaf.rotation.z = Math.cos(a) * .72; }
  }
  plant(-9.35, -5.7, 1.32); plant(9.3, -5.8, 1.15); plant(9.35, 5.6, .95); plant(-9.25, 5.9, .8);
  function desk(p, w, d, x = 0, z = 0) {
    rounded(p, w, .14, d, [x, 1.48, z], shellWhite, .06);
    rounded(p, w - .12, .055, d - .12, [x, 1.385, z], mats.wood, .02);
    // Two recessed T-shaped supports read as modern sit/stand furniture.
    for (const dx of [-w / 2 + .5, w / 2 - .5]) {
      box(p, [.14, 1.28, .2], [x + dx, .69, z], brushed);
      rounded(p, .16, .09, d * .75, [x + dx, .07, z], mats.petrol, .035);
    }
    box(p, [w - 1, .13, .14], [x, 1.12, z], brushed);
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
  // Actual inspectable surfaces: DOM controls project onto these same mesh faces.
  rounded(qa, 5.8, 2.8, .16, [0, 4.4, -1.05], mats.petrol);
  const qaConsole = surface(qa, 5.55, 2.55, [0, 4.4, -.95], 1100, 510);
  paint(qaConsole, '#153a37', c => { text(c, 'QUALITY CONTROL', 40, 45, 48, '#fffcf0'); text(c, 'Inspect the candidate · follow the evidence', 40, 125, 28, '#b5c6a0'); });
  const safeLedger = surface(finance, 2.12, 2.2, [0, 1.55, 1.12], 840, 870);
  paint(safeLedger, '#e7ece1', c => text(c, 'TREASURY', 50, 50, 45));
  const surfaces = { backlog: board, engineering: terminal, strategy: ideas, qa: qaConsole, finance: safeLedger };
  const wallBrand = surface(scene, 3.7, 1.1, [-.4, 4.1, -6.95], 1000, 300);
  wallBrand.face.material.transparent = true; wallBrand.face.material.depthWrite = false; wallBrand.face.material.needsUpdate = true;
  paint(wallBrand, '#fffcf0', c => text(c, 'Xarts', 90, 45, 155, '#2e9999'));
  const brandImage = new Image();
  brandImage.onload = () => { if (disposed) return; wallBrand.face.material.needsUpdate = true; paint(wallBrand, '#fffcf0', (c,w,h) => { c.clearRect(0,0,w,h); const scale = Math.min(w / brandImage.naturalWidth, h / brandImage.naturalHeight) * .86; const iw = brandImage.naturalWidth * scale, ih = brandImage.naturalHeight * scale; c.drawImage(brandImage, (w-iw)/2, (h-ih)/2, iw, ih); }); requestRender(); };
  brandImage.src = '/api/project/logo';
  // A colorful studio lounge, an informal perch and sculptural play corner.
  const lounge = new THREE.Group(); lounge.position.set(.2, 0, -.6); scene.add(lounge);
  for (const x of [-.65, .65]) {
    rounded(lounge, 1.22, .44, 1.22, [x, .48, 0], accentCoral, .16);
    rounded(lounge, 1.22, .77, .32, [x, .98, -.47], accentCoral, .12);
    for (const z of [-.4, .4]) cyl(lounge, .055, .25, [x, .14, z], brushed);
  }
  const cushion = rounded(lounge, .52, .5, .18, [.7, .97, -.2], accentLilac, .07); cushion.rotation.z = -.22;
  cyl(scene, .64, .08, [.25, .66, .94], shellWhite);
  cyl(scene, .23, .61, [.25, .32, .94], mats.petrol, .36);
  mug(scene, .04, .83, .91);
  rounded(scene, .46, .035, .34, [.49, .72, 1.02], accentBlue, .012);
  // Two exercise-ball seats: matte rubber with a restrained equatorial seam.
  function stabilityBall(x, z, material, radius = .54) {
    sphere(scene, radius, [x, radius + .025, z], material);
    const seam = mesh(scene, new THREE.TorusGeometry(radius * .995, .012, 6, 36), shellWhite, [x, radius + .025, z]); seam.rotation.x = Math.PI / 2;
    cyl(scene, radius * .45, .028, [x, .018, z], mats.sage);
  }
  stabilityBall(-7.6, 3.7, accentBlue);
  stabilityBall(-1.65, 1.4, accentLilac, .47);
  // Compact ribbon slide in the clear side corridor, away from all work surfaces.
  const slide = new THREE.Group(); slide.position.set(-8.85, 0, -.4); scene.add(slide);
  const track = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.5, -1.4), new THREE.Vector3(0, 2.4, -.92),
    new THREE.Vector3(0, 1.35, -.05), new THREE.Vector3(0, .31, .85), new THREE.Vector3(0, .22, 1.58),
  ]);
  const segments = 30, positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const p = track.getPoint(i / segments);
    for (const x of [-.42, .42]) positions.push(p.x + x, p.y, p.z);
    if (i < segments) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const slideGeo = new THREE.BufferGeometry(); slideGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); slideGeo.setIndex(indices); slideGeo.computeVertexNormals();
  mesh(slide, slideGeo, new THREE.MeshStandardMaterial({ color: 0xef9979, roughness: .3, metalness: .12, side: THREE.DoubleSide }));
  for (const x of [-.45, .45]) {
    const railPath = new THREE.CatmullRomCurve3(Array.from({ length: 16 }, (_, i) => { const point = track.getPoint(i / 15); point.x += x; point.y += .14; return point; }));
    mesh(slide, new THREE.TubeGeometry(railPath, 28, .07, 8, false), accentCoral);
    cyl(slide, .045, 2.5, [x, 1.25, -1.4], brushed);
  }
  for (let i = 0; i < 6; i++) rounded(slide, .76, .065, .22, [0, .35 + i * .4, -1.57], mats.petrol, .02);
  rounded(slide, .88, .09, .5, [0, 2.46, -1.4], accentCoral, .03);
  // Art-directed adult staff; the articulation contract stays shared with the live scene.
  const staffMaterial = color => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .02 });
  const staffStyles = [
    { skin: 0xa96d4b, hair: 0x26232d, jacket: 0x416de1, trousers: 0x273144, shirt: 0xf4f3ef, accent: 0xa8f0d6, hairStyle: 'crop', glasses: true },
    { skin: 0xe0ad8b, hair: 0x50342b, jacket: 0xb29bda, trousers: 0x40455c, shirt: 0xfffbf2, accent: 0xeaba54, hairStyle: 'bun', glasses: false },
    { skin: 0x87523e, hair: 0x242020, jacket: 0xe78669, trousers: 0xf0e6d5, shirt: 0x283a45, accent: 0xe8bd63, hairStyle: 'waves', glasses: false },
  ];
  function person(x, z, style, facing = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = facing; scene.add(g);
    const skin = staffMaterial(style.skin), hair = staffMaterial(style.hair), jacket = staffMaterial(style.jacket);
    const trousers = staffMaterial(style.trousers), shirt = staffMaterial(style.shirt), accent = staffMaterial(style.accent);
    const sneaker = staffMaterial(0xf9f8f3), sole = staffMaterial(0xc9d0d2), ink = staffMaterial(0x252b34);
    const legs = [];
    for (const dx of [-.145, .145]) {
      const leg = new THREE.Group(); leg.position.set(dx, 1.06, 0); g.add(leg);
      cyl(leg, .105, .87, [0, -.425, 0], trousers, .078);
      cyl(leg, .083, .085, [0, -.855, 0], shirt);
      rounded(leg, .235, .14, .39, [0, -.945, .067], sneaker, .044);
      rounded(leg, .24, .042, .405, [0, -1.018, .073], sole, .018);
      box(leg, [.19, .026, .044], [0, -.888, .132], accent);
      legs.push(leg);
    }
    rounded(g, .43, .25, .31, [0, 1.055, 0], trousers, .09);
    // Jacket tapers at the waist; a separate shirt and lapels give readable clothing layers.
    cyl(g, .275, .65, [0, 1.46, 0], jacket, .215).scale.z = .72;
    rounded(g, .18, .53, .038, [0, 1.48, .196], shirt, .015);
    for (const side of [-1, 1]) {
      const lapel = box(g, [.065, .33, .028], [side * .11, 1.615, .218], jacket);
      lapel.rotation.z = side * -.19;
      box(g, [.09, .023, .018], [side * .155, 1.265, .184], shirt);
    }
    cyl(g, .085, .16, [0, 1.86, 0], skin);
    sphere(g, .213, [0, 2.09, 0], skin).scale.set(.87, 1.13, .92);
    for (const dx of [-.186, .186]) sphere(g, .039, [dx, 2.065, 0], skin).scale.set(.55, 1.15, .7);
    // Open hemisphere follows the scalp rather than intersecting a second full sphere.
    const cap = mesh(g, new THREE.SphereGeometry(.224, 20, 12, 0, Math.PI * 2, 0, 1.35), hair, [0, 2.09, -.014]);
    cap.scale.set(.89, 1.15, .96);
    if (style.hairStyle === 'crop') {
      for (const dx of [-.095, 0, .095]) sphere(g, .079, [dx, 2.297, .017], hair).scale.set(.85, .56, 1.12);
      for (const side of [-1, 1]) rounded(g, .029, .135, .115, [side * .181, 2.115, -.021], hair, .012);
    } else if (style.hairStyle === 'bun') {
      sphere(g, .136, [0, 2.27, -.172], hair).scale.set(1, .88, 1);
      const fringe = sphere(g, .16, [-.064, 2.23, .085], hair); fringe.scale.set(.78, .41, .55); fringe.rotation.z = -.35;
      for (const side of [-1, 1]) {
        rounded(g, .042, .21, .097, [side * .177, 2.045, -.028], hair, .019);
        mesh(g, new THREE.TorusGeometry(.038, .009, 6, 14), accent, [side * .193, 2.0, .024]);
      }
    } else {
      for (const side of [-1, 1]) {
        sphere(g, .108, [side * .142, 2.11, -.082], hair).scale.set(.75, 1.65, 1.03);
        sphere(g, .101, [side * .128, 1.964, -.076], hair).scale.set(.8, .8, 1);
      }
      sphere(g, .151, [-.055, 2.245, .061], hair).scale.set(.86, .48, .9);
    }
    for (const dx of [-.068, .068]) {
      sphere(g, .014, [dx, 2.102, .18], ink);
      const brow = box(g, [.05, .012, .012], [dx, 2.145, .173], hair); brow.rotation.z = dx < 0 ? -.07 : .07;
    }
    sphere(g, .028, [0, 2.058, .192], skin).scale.set(.8, 1, 1.15);
    rounded(g, .052, .009, .009, [0, 2.015, .177], staffMaterial(0x8c5148), .003);
    if (style.glasses) {
      for (const dx of [-.071, .071]) {
        const rim = mesh(g, new THREE.TorusGeometry(.047, .009, 6, 16), ink, [dx, 2.109, .193]); rim.scale.y = .8;
      }
      box(g, [.045, .009, .009], [0, 2.11, .196], ink);
      // One discreet ear cup and headband, clearly an engineer at work.
      sphere(g, .058, [.207, 2.09, -.007], ink).scale.set(.45, 1, .9);
      rounded(g, .018, .19, .026, [.197, 2.195, -.017], ink, .007);
    }
    const arms = [];
    for (const dx of [-.3, .3]) {
      const shoulder = new THREE.Group(); shoulder.position.set(dx, 1.705, 0); g.add(shoulder);
      sphere(shoulder, .111, [0, 0, 0], jacket);
      cyl(shoulder, .095, .36, [0, -.18, 0], jacket, .077);
      const elbow = new THREE.Group(); elbow.position.y = -.36; shoulder.add(elbow);
      sphere(elbow, .079, [0, 0, 0], jacket);
      cyl(elbow, .074, .32, [0, -.16, 0], jacket, .054);
      cyl(elbow, .058, .055, [0, -.327, 0], shirt);
      sphere(elbow, .062, [0, -.398, .005], skin).scale.set(.77, 1.26, .8);
      if (dx > 0) { cyl(elbow, .062, .042, [0, -.362, 0], ink); box(elbow, [.064, .047, .025], [0, -.361, .056], accent); }
      arms.push({ shoulder, elbow });
    }
    return { g, legs, arms };
  }
  const engineer = person(-5.25, 4.1, staffStyles[0], Math.PI);
  const tester = person(5.4, 5.3, staffStyles[1], -.4);
  const ceo = person(-2.0, 2.0, staffStyles[2], .35);
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
    paint(qaConsole, '#153a37', c => { text(c, 'QUALITY CONTROL', 35, 30, 40, '#fffcf0'); text(c, q.candidateId || 'Waiting for a candidate', 35, 98, 32, '#b5c6a0'); (q.stages || []).forEach((stage,i) => { const copy = qaStageCopy(stage, model.mode); text(c, copy.title, 35, 168+i*76, 26, '#fffcf0'); text(c, copy.headline, 360, 168+i*76, 26, stage.outcome === 'fail' ? '#efaa95' : '#b5c6a0', 700); }); });
    gateLabels.forEach((s, i) => { const stage = q.stages?.[i]; const copy = qaStageCopy(stage || { id: ['provenance', 'meaning', 'regression', 'release'][i] }, model.mode); stageNodes[i].textContent = copy.title; stageNodes[i].dataset.outcome = stage?.outcome || 'not_run'; stageNodes[i].title = copy.headline; paint(s, '#244f4a', c => { text(c, copy.title, 18, 20, 44, '#f4efdf', 480); text(c, copy.headline, 18, 94, 31, '#b5c6a0', 480); }); const outcome = stage?.outcome; gates[i].material.color.setHex(outcome === 'pass' ? P.green : ['fail', 'error'].includes(outcome) ? P.red : outcome === 'pending' ? P.amber : P.sage); });
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
  function focus(id) { selected = stations[id] ? id : null; hovered = null; if (detailElement) { detailElement.classList.toggle('world-surface', !!selected); if (!selected) { detailElement.style.removeProperty('transform'); detailElement.style.removeProperty('width'); detailElement.style.removeProperty('height'); } } requestRender(); }
  function preview(id) { hovered = stations[id] ? id : null; requestRender(); }
  const cameraTarget = new THREE.Vector3(0, 1, 0);
  const destination = new THREE.Vector3();
  const cameraOffset = baseCamera.clone().sub(cameraTarget), targetOffset = new THREE.Vector3();
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
    const activeSurface = selected ? surfaces[selected] : null;
    if (activeSurface) activeSurface.face.getWorldPosition(destination);
    const ease = motion ? 1 - Math.exp(-dt * 5) : 1;
    cameraTarget.lerp(destination, ease);
    targetOffset.copy(selected ? new THREE.Vector3(0, 0, 35) : baseCamera.clone().sub(new THREE.Vector3(0,1,0)));
    cameraOffset.lerp(targetOffset, ease);
    camera.position.copy(cameraTarget).add(cameraOffset); camera.lookAt(cameraTarget);
    const targetZoom = activeSurface ? Math.min((camera.right-camera.left) * .84 / activeSurface.width, (camera.top-camera.bottom) * .8 / activeSurface.height) : 1;
    camera.zoom += (targetZoom-camera.zoom) * ease; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const q = model.qa || {}; const target = gateX[Math.min(3, Math.max(0, Number(q.stageIndex) || 0))];
    if (q.status === 'running' || q.status === 'completed') parcel.position.x += (target - parcel.position.x) * (motion ? Math.min(1, dt * 2.7) : 1);
    if (motion && q.status === 'running') slats.forEach((s, i) => { s.position.x = -3.37 + i * .197 + (clock * .65 % .197); });
    engineer.arms.forEach((a, i) => { const typing = demo && model.engineering?.status && model.engineering.status !== 'idle'; a.shoulder.rotation.x = -1.1 + (motion && typing ? Math.sin(clock * 8 + i * Math.PI) * .09 : 0); a.elbow.rotation.x = -.55; });
    tester.arms[0].shoulder.rotation.x = q.status === 'failed' ? -1.5 : -.12; tester.arms[0].elbow.rotation.x = q.status === 'failed' ? -.5 : -.1;
    if (motion && demo) { ceo.g.position.x = -2.0 + Math.sin(clock * .36) * .5; ceo.g.rotation.y = Math.cos(clock * .36) > 0 ? .7 : -.7; ceo.legs.forEach((leg, i) => leg.rotation.x = Math.sin(clock * 3 + i * Math.PI) * .16); }
    else { ceo.g.position.x = -2.0; ceo.g.rotation.y = .35; ceo.legs.forEach(leg => leg.rotation.x = 0); }
    scene.updateMatrixWorld();
    labels.forEach(({ node, anchor: point }) => { point.getWorldPosition(v); v.project(camera); node.style.left = `${(v.x + 1) * .5 * width}px`; node.style.top = `${(-v.y + 1) * .5 * height}px`; node.hidden = !!selected || !hovered || node.dataset.station !== hovered || node.classList.contains('office-stage-label') || v.z < -1 || v.z > 1; });
    if (activeSurface && detailElement?.open) {
      // Orthographic projection is affine: these three corners exactly register DOM to mesh.
      const { face, width: sw, height: sh } = activeSurface;
      const project = (x,y) => { const point = face.localToWorld(new THREE.Vector3(x,y,0)).project(camera); const rect = host.getBoundingClientRect(); return { x:rect.left+(point.x+1)*width/2, y:rect.top+(1-point.y)*height/2 }; };
      const origin=project(-sw/2,sh/2), right=project(sw/2,sh/2), bottom=project(-sw/2,-sh/2);
      const dw = Math.round(Math.min(width * .84, height * .8 * sw / sh)), dh = dw*sh/sw;
      detailElement.style.width = `${dw}px`; detailElement.style.height = `${dh}px`;
      detailElement.style.transform = `matrix(${(right.x-origin.x)/dw},${(right.y-origin.y)/dw},${(bottom.x-origin.x)/dh},${(bottom.y-origin.y)/dh},${origin.x},${origin.y})`;
    }
    renderer.render(scene, camera);
    const settling = cameraOffset.distanceTo(targetOffset) > .001 || cameraTarget.distanceTo(destination) > .001 || Math.abs(hinge.rotation.y - targetDoor) > .001 || Math.abs(camera.zoom - targetZoom) > .001 || ((q.status === 'running' || q.status === 'completed') && Math.abs(parcel.position.x - target) > .002);
    if (motion && (demo || q.status === 'running' || settling)) requestRender();
  }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { previous = 0; requestRender(); } }
  function motionChange() { previous = 0; requestRender(); }
  function contextLost(event) { event.preventDefault(); focus(null); lost = true; cancelAnimationFrame(frame); frame = 0; fallbackNode = fallback(); labels.forEach(({ node }) => node.style.display = 'none'); }
  document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motionChange); renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize(); update({});
  return { update, focus, preview, dispose() { disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motionChange); renderer.domElement.removeEventListener('click', click); renderer.domElement.removeEventListener('pointermove', hover); renderer.domElement.removeEventListener('pointerleave', leave); renderer.domElement.removeEventListener('webglcontextlost', contextLost); labels.forEach(({ node }) => node.remove()); fallbackNode?.remove(); const geometries = new Set(), materials = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove(); } };
}
