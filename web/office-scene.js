import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/GLTFLoader.js';
import { HDRLoader } from '/vendor/HDRLoader.js';
import { createOfficeMaterials } from './office-materials.js';
import { addOfficeFurniture } from './office-furniture.js';
import { qaStageCopy } from './office-model.js';

/** The scene is a view of the application model; it never advances a workflow. */
export function createOfficeScene(host, { onSelect = () => {}, detailElement, nativeSurfaces = {} } = {}) {
  const P = { cream: 0xf1f2ee, paper: 0xffffff, petrol: 0x255bc0, dark: 0x172f3e, green: 0x249e9c, sage: 0xc5dcd5, wood: 0xd5b893, amber: 0xf1b84b, red: 0xf17b41, metal: 0x809aa5 };
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
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(P.cream, 0);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Isometric office with backlog, engineering, strategy, QA and finance stations. Use the station controls to inspect them.');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const generatedMixers=[];
  const generatedStaff=[];
  const assetNotice=document.createElement('a');assetNotice.className='generated-preview-notice';assetNotice.href='http://127.0.0.1:4311/#collection';assetNotice.textContent='Loading generated asset previews…';host.append(assetNotice);
  const generatedStatus={};
  const camera = new THREE.OrthographicCamera(-13, 13, 10, -10, .1, 100);
  const baseCamera = new THREE.Vector3(19, 22, 27);
  camera.position.copy(baseCamera); camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xfff9ee, 0x9dafa7, 1.15));
  const sun = new THREE.DirectionalLight(0xffedd5, 2.0);
  sun.position.set(-8, 20, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 });
  sun.shadow.radius = 4; sun.shadow.blurSamples = 8;
  sun.shadow.normalBias = .04; sun.shadow.bias = -.0001;
  scene.add(sun);
  const mats = Object.fromEntries(Object.entries(P).map(([k, color]) => [k, new THREE.MeshStandardMaterial({ color, roughness: .8 })]));
  const textures = [], labels = [], pickable = [], stations = {};
  const finish = createOfficeMaterials(THREE); textures.push(...finish.textures);
  finish.loungeFabric=finish.fabric.clone();finish.loungeFabric.color.setHex(0xb9a2d3);
  finish.ottomanFabric=finish.fabric.clone();finish.ottomanFabric.color.setHex(0xe8bc4a);
  finish.chairFabric=finish.fabric.clone();finish.chairFabric.color.setHex(0x33444e);
  const v = new THREE.Vector3();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let tourMode=new URLSearchParams(location.search).get('tour')==='1'&&!reduced.matches?'playing':'off',tourTime=0;
  const tourControls=document.createElement('div');tourControls.className='office-tour-controls';
  const tourButton=document.createElement('button'),tourReset=document.createElement('button');tourReset.textContent='Whole office';
  tourControls.append(tourButton,tourReset);host.append(tourControls);
  function tourLabel(){tourButton.textContent=tourMode==='playing'?'Pause camera tour':tourMode==='paused'?'Resume camera tour':'Play camera tour';tourButton.setAttribute('aria-pressed',String(tourMode==='playing'));tourButton.disabled=reduced.matches;host.dataset.cameraTour=tourMode;}
  tourButton.onclick=()=>{if(selected)return;if(tourMode==='playing')tourMode='paused';else tourMode='playing';tourLabel();requestRender();};
  tourReset.onclick=()=>{tourMode='off';tourTime=0;tourLabel();requestRender();};tourLabel();
  const tourStops=[{p:[0,1,0],z:1},{p:[-4,1.4,3.5],z:1.65},{p:[0,1.5,3.6],z:1.7},{p:[5,1.8,.5],z:1.6},{p:[0,1,0],z:1}];
  function tourPose(){const phase=(tourTime%64)/16,index=Math.min(3,Math.floor(phase)),a=tourStops[index],b=tourStops[index+1],u=phase-index,t=u*u*u*(u*(u*6-15)+10);return{p:a.p.map((v,i)=>v+(b.p[i]-v)*t),z:a.z+(b.z-a.z)*t};}

  let nativeDetail=null;const pageOffsets={backlog:0,strategy:0};
  let model = {}, selected = null, hovered = null, focusElapsed = 0, disposed = false, lost = false, frame = 0, previous = 0, clock = 0, signature = '', fallbackNode;
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
    const face = mesh(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), pos); face.castShadow = false;
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
  new HDRLoader().load('/assets/studio/studio-small-09.hdr', environment => { if (disposed) { environment.dispose(); return; } environment.mapping = THREE.EquirectangularReflectionMapping; scene.environment = environment; scene.environmentIntensity = .4; textures.push(environment); requestRender(); }, undefined, () => {});
  // Open daylight studio: a floating plinth, full-height glazing and slim frames.
  const shellWhite = new THREE.MeshStandardMaterial({ color: 0xfafbf8, roughness: .68 });
  const accentCoral = new THREE.MeshStandardMaterial({ color: 0xf17836, roughness: .65 });
  const accentLilac = new THREE.MeshStandardMaterial({ color: 0xb6a2e0, roughness: .65 });
  const accentBlue = new THREE.MeshStandardMaterial({ color: 0x4d8fda, roughness: .48 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0x9db5be, metalness: .65, roughness: .32 });
  rounded(scene, 21, .42, 14.7, [0, -.34, 0], finish.woodEdge, .15);
  rounded(scene, 20.6, .12, 14.3, [0, -.08, 0], finish.woodEdge, .035);
  const floorFace = new THREE.Mesh(new THREE.PlaneGeometry(20.55,14.25), finish.terrazzo); floorFace.rotation.x=-Math.PI/2; floorFace.position.y=-.015; floorFace.receiveShadow=true; scene.add(floorFace);
  box(scene, [20.2, .035, .025], [0, -.11, 7.22], mats.green);
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
  const rugFace = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.5), finish.rug); rugFace.rotation.x = -Math.PI/2; rugFace.position.set(1,.005,3.4); rugFace.receiveShadow=true; scene.add(rugFace);
  addOfficeFurniture(THREE, scene, finish);
  function desk(p, w, d, x = 0, z = 0) {
    rounded(p, w, .14, d, [x, 1.48, z], finish.woodEdge, .06);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w-.05,d-.05),finish.oak); top.rotation.x=-Math.PI/2; top.position.set(x,1.556,z); top.receiveShadow=true;p.add(top);
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
  const planningFurniture=new THREE.Group();planningFurniture.name='authored-planning';strat.add(planningFurniture);desk(planningFurniture, 3.9, 1.45, 0, 1.2); mug(planningFurniture, 1.2, 1.72, 1.3);
  rounded(planningFurniture, 1.2, .06, .74, [-.6, 1.62, 1.2], mats.petrol, .015);
  label('Strategy', anchor(strat, 0, 4.45, 0), 'office-label', 'strategy');
  const qa = station('qa', 3.7, 3.35);
  rounded(qa, 7.2, .18, 2, [0, 1.26, 0], shellWhite);
  box(qa, [6.95, .06, 1.7], [0, 1.38, 0], mats.dark);
  const slats = []; for (let i = 0; i < 35; i++) slats.push(box(qa, [.035, .018, 1.63], [-3.37 + i * .197, 1.425, 0], mats.metal));
  for (const x of [-3, 3]) for (const z of [-.7, .7]) box(qa, [.15, 1.1, .15], [x, .55, z]);
  const gates = [], gateLabels = [], stageNodes = [], gateX = [-2.65, -.9, .9, 2.65];
  gateX.forEach((x, index) => {
    const node = label(['Scope', 'Chart correctness', 'Regressions', 'Release'][index], anchor(qa, x, index % 2 ? 2.75 : 3.45, .1), 'office-label office-stage-label', 'qa');
    node.dataset.stageIndex = String(index); stageNodes.push(node);
    for (const dx of [-.73, .73]) box(qa, [.09, 1.43, .1], [x + dx, 2.12, -.82], finish.chrome);
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
  rounded(hinge, 2.45, 2.56, .2, [1.22, 0, 0], finish.chrome, .09);
  const safeDisplay = surface(hinge, 1.85, .78, [1.22, .5, .11], 840, 350);
  const wheel = mesh(hinge, new THREE.TorusGeometry(.33, .055, 10, 28), finish.chrome, [1.22, -.43, .2]);
  for (let i = 0; i < 3; i++) { const spoke = box(hinge, [.66, .055, .065], [1.22, -.43, .2], mats.paper); spoke.rotation.z = i * Math.PI / 3; }
  label('Finance', anchor(finance, 0, 3.7, 0), 'office-label', 'finance');
  const tickerStation = station('ticker',5.9,-6.92);
  const tickerFrame = rounded(tickerStation, 5.2, .68, .13, [0,4.18,0], mats.petrol, .055);
  const ticker = surface(tickerStation,4.95,.47,[0,4.18,.08],4096,160);
  ticker.texture.wrapS=THREE.RepeatWrapping; ticker.texture.repeat.x=.5;
  label('Operations ticker',anchor(tickerStation,0,4.9,0),'office-label','ticker');
  let tickerExpansion=0;
  // Actual inspectable surfaces: DOM controls project onto these same mesh faces.
  rounded(qa, 5.67, 2.67, .07, [0, 4.4, -1.05], finish.chrome);
  const qaConsole = surface(qa, 5.55, 2.55, [0, 4.4, -.95], 1100, 510);
  paint(qaConsole, '#eef5f4', c => { text(c, 'QUALITY CONTROL', 40, 45, 48, '#fffcf0'); text(c, 'Inspect the candidate · follow the evidence', 40, 125, 28, '#b5c6a0'); });
  const safeLedger = surface(finance, 2.12, 2.2, [0, 1.55, 1.165], 840, 870);
  paint(safeLedger, '#e7ece1', c => text(c, 'TREASURY', 50, 50, 45));
  const surfaces = { backlog: board, engineering: terminal, strategy: ideas, qa: qaConsole, finance: safeLedger, ticker };
  // Keep the original textured mesh at every camera distance. HTML is retained
  // only as an accessible record representation, never substituted over the object.
  for(const element of Object.values(nativeSurfaces))element.classList.add('semantic-surface');
  const returnButton=document.createElement('button');returnButton.className='office-return';returnButton.textContent='↙ Office';returnButton.hidden=true;returnButton.onclick=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));host.append(returnButton);

  const wallBrand = surface(scene, 3.7, 1.1, [-.4, 4.1, -6.95], 1000, 300);
  wallBrand.face.castShadow = false; wallBrand.face.receiveShadow = false;
  wallBrand.face.material.transparent = true; wallBrand.face.material.depthWrite = false; wallBrand.face.material.needsUpdate = true;
  paint(wallBrand, '#fffcf0', c => text(c, 'Xarts', 90, 45, 155, '#2e9999'));
  const brandImage = new Image();
  brandImage.onload = () => { if (disposed) return; wallBrand.face.material.needsUpdate = true; paint(wallBrand, '#fffcf0', (c,w,h) => { c.clearRect(0,0,w,h); const scale = Math.min(w / brandImage.naturalWidth, h / brandImage.naturalHeight) * .86; const iw = brandImage.naturalWidth * scale, ih = brandImage.naturalHeight * scale; c.drawImage(brandImage, (w-iw)/2, (h-ih)/2, iw, ih); }); requestRender(); };
  brandImage.src = '/api/project/logo';
  // Two exercise-ball seats: matte rubber with a restrained equatorial seam.
  function stabilityBall(x, z, material, radius = .54) {
    sphere(scene, radius, [x, radius + .025, z], material);
    const seam = mesh(scene, new THREE.TorusGeometry(radius * .995, .012, 6, 36), shellWhite, [x, radius + .025, z]); seam.rotation.x = Math.PI / 2;
    cyl(scene, radius * .45, .028, [x, .018, z], mats.sage);
  }
  stabilityBall(-7.6, 3.7, accentBlue);
  stabilityBall(-1.65, 1.4, accentLilac, .47);
  // Compact ribbon slide in the clear side corridor, away from all work surfaces.
  const slide = new THREE.Group();slide.name='authored-slide'; slide.position.set(-8.85, 0, -.4); scene.add(slide);
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
  mesh(slide, slideGeo, new THREE.MeshStandardMaterial({ color: 0xc7ced0, roughness: .22, metalness: .92, side: THREE.DoubleSide }));
  for (const x of [-.45, .45]) {
    const railPath = new THREE.CatmullRomCurve3(Array.from({ length: 16 }, (_, i) => { const point = track.getPoint(i / 15); point.x += x; point.y += .14; return point; }));
    mesh(slide, new THREE.TubeGeometry(railPath, 28, .045, 8, false), finish.chrome);
    cyl(slide, .045, 2.5, [x, 1.25, -1.4], brushed);
  }
  for (let i = 0; i < 6; i++) rounded(slide, .76, .065, .22, [0, .35 + i * .4, -1.57], mats.petrol, .02);
  rounded(slide, .88, .09, .5, [0, 2.46, -1.4], accentCoral, .03);
  // Art-directed adult staff; the articulation contract stays shared with the live scene.
  const staffMaterial = color => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .02 });
  const staffStyles = [
    { skin: 0xa96d4b, hair: 0x26232d, jacket: 0x416de1, trousers: 0x273144, shirt: 0xf4f3ef, accent: 0xa8f0d6, hairStyle: 'crop', glasses: true, seated: true },
    { skin: 0xe0ad8b, hair: 0x50342b, jacket: 0xb29bda, trousers: 0x40455c, shirt: 0xfffbf2, accent: 0xeaba54, hairStyle: 'bun', glasses: false },
    { skin: 0x87523e, hair: 0x242020, jacket: 0xe78669, trousers: 0xf0e6d5, shirt: 0x283a45, accent: 0xe8bd63, hairStyle: 'waves', glasses: false },
  ];
  function person(x, z, style, facing = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = facing; g.scale.setScalar(style.seated ? 1.1 : 1.28); scene.add(g);
    const skin = staffMaterial(style.skin), hair = staffMaterial(style.hair), jacket = staffMaterial(style.jacket);
    const trousers = staffMaterial(style.trousers), shirt = staffMaterial(style.shirt), accent = staffMaterial(style.accent);
    for (const cloth of [jacket,trousers,shirt]) { cloth.bumpMap=finish.fabric.bumpMap; cloth.bumpScale=.004; cloth.roughness=.93; }
    const sneaker = staffMaterial(0xf9f8f3), sole = staffMaterial(0xc9d0d2), ink = staffMaterial(0x252b34);
    const legs = [];
    for (const dx of [-.145, .145]) {
      const leg = new THREE.Group(); leg.position.set(dx, 1.06, 0); g.add(leg);
      if (style.seated) {
        const thigh=cyl(leg,.108,.47,[0,0,.235],trousers,.095);thigh.rotation.x=Math.PI/2;
        cyl(leg,.084,.72,[0,-.39,.47],trousers,.073);
        rounded(leg,.235,.14,.39,[0,-.945,.54],sneaker,.044);
        rounded(leg,.24,.042,.405,[0,-1.018,.55],sole,.018);
      } else {
        cyl(leg, .105, .87, [0, -.425, 0], trousers, .078);
        cyl(leg, .083, .085, [0, -.855, 0], shirt);
        rounded(leg, .235, .14, .39, [0, -.945, .067], sneaker, .044);
        rounded(leg, .24, .042, .405, [0, -1.018, .073], sole, .018);
        box(leg, [.19, .026, .044], [0, -.888, .132], accent);
      }
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
      sphere(shoulder, .097, [0, 0, 0], jacket);
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
      text(c, 'WORK QUEUE', 32, 22, 37);text(c,'Scroll to browse · click a note to inspect',530,30,23,'#697a6c'); const cols = model.kanban?.columns || []; const cw = (w - 50) / Math.max(cols.length, 1);
      cols.forEach((col, i) => { const x = 25 + i * cw; c.fillStyle = '#e9eadb'; c.fillRect(x, 91, cw - 15, 535); text(c, `${col.label} · ${col.cards.length}`, x + 14, 109, 27, '#244f4a', cw - 43); (col.cards || []).slice(pageOffsets.backlog, pageOffsets.backlog+4).forEach((card, j) => { const y = 160 + j * 112; c.fillStyle = j % 2 ? '#dde7d3' : '#f6e8bc'; c.fillRect(x + 12, y, cw - 39, 98); text(c, String(card.kind||'Task').replaceAll('_',' '), x + 24, y + 9, 16, '#64756a', cw-66); c.save();c.beginPath();c.rect(x+12,y,cw-39,98);c.clip();lines(c, card.title, x + 24, y + 36, cw - 66, 23, 2);c.restore(); }); });
    });
    paint(terminal, '#153a37', (c, w) => { text(c, `ENGINEERING · ${model.engineering?.status || 'idle'}`, 30, 24, 29, '#b5c6a0', w - 60); lines(c, model.engineering?.task || 'No active task', 30, 78, w - 60, 29, 2, '#fffcf0'); (model.engineering?.lines || []).slice(-8).forEach((line, i) => { text(c, typeof line === 'string' ? line : line.text || line.message || JSON.stringify(line), 30, 177 + i * 46, 25, '#d6e3ce', w - 60); }); });
    paint(ideas, '#e2d4b5', (c, w) => { text(c, 'IDEAS & DIRECTION', 30, 24, 37); if(!model.strategy?.ideas?.length){text(c,'Space for the next good idea.',36,120,32,'#655d4d');text(c,'No proposals recorded yet.',36,174,25,'#756c5b');} (model.strategy?.ideas || []).slice(pageOffsets.strategy,pageOffsets.strategy+4).forEach((idea, i) => { const x = 30 + (i % 2) * (w / 2 - 10), y = 95 + Math.floor(i / 2) * 265; c.fillStyle = i % 2 ? '#d6e1bd' : '#fff4cb'; c.fillRect(x, y, w / 2 - 45, 237); c.fillStyle = '#ca705d'; c.beginPath(); c.arc(x + (w / 2 - 45) / 2, y + 12, 7, 0, Math.PI * 2); c.fill(); lines(c, idea.title, x + 20, y + 35, w / 2 - 85, 30, 2); lines(c, idea.body || idea.status, x + 20, y + 118, w / 2 - 85, 23, 3); }); });
    const q = model.qa || {};
    paint(qaConsole, '#eef5f4', c => { text(c, 'Quality', 35, 30, 44, '#214e62'); text(c, q.candidateId || 'Waiting for a candidate', 35, 98, 30, '#45686d'); (q.stages || []).forEach((stage,i) => { const copy = qaStageCopy(stage, model.mode); text(c, copy.title, 35, 168+i*76, 26, '#214e62'); text(c, copy.headline, 360, 168+i*76, 26, stage.outcome === 'fail' ? '#a34e42' : '#45686d', 700); }); });
    gateLabels.forEach((s, i) => { const stage = q.stages?.[i]; const copy = qaStageCopy(stage || { id: ['provenance', 'meaning', 'regression', 'release'][i] }, model.mode); stageNodes[i].textContent = copy.title; stageNodes[i].dataset.outcome = stage?.outcome || 'not_run'; stageNodes[i].title = copy.headline; paint(s, ['#2858b7','#187d80','#be5e3d','#b88a26'][i], c => { text(c, copy.title, 18, 20, 44, '#f4efdf', 480); text(c, copy.headline, 18, 94, 31, '#b5c6a0', 480); }); const outcome = stage?.outcome; gates[i].material.color.setHex(outcome === 'pass' ? P.green : ['fail', 'error'].includes(outcome) ? P.red : outcome === 'pending' ? P.amber : P.sage); });
    parcel.visible = Boolean(q.candidateId);
    paint(parcelFace, '#fffcf0', c => { text(c, q.candidateId || 'No candidate', 20, 25, 45, '#244f4a', 480); text(c, `Attempt ${q.attempt || 0}`, 20, 105, 35); });
    if (reduced.matches || q.status === 'failed' || q.status === 'idle') parcel.position.x = gateX[Math.min(3, Math.max(0, Number(q.stageIndex) || 0))];
    paint(safeDisplay, '#153a37', c => { text(c, 'BUDGET / SPENT', 25, 20, 29, '#b5c6a0'); text(c, currency(model.finance?.budget), 25, 76, 64, '#fffcf0', 790); text(c, currency(model.finance?.spent), 25, 163, 43, '#e3af62', 790); text(c, `Reserved ${currency(model.finance?.reserved)}`, 25, 255, 28, '#fffcf0', 790); });
    paint(safeLedger,'#f8f5eb',(c,w)=>{
      const f=model.finance||{};const money=v=>v==null?'Not reported':`${f.currency||'—'} ${Number(v).toFixed(2)}`;
      text(c,'TREASURY',40,38,36);text(c,'Observed spend',40,112,26,'#637973');text(c,money(f.spent),40,156,62,'#238078',w-80);
      const rows=[['Approved budget',money(f.budget)],['Reserved',money(f.reserved)],['Available',f.budget==null||f.spent==null||f.reserved==null?'Unknown':money(f.budget-f.spent-f.reserved)],['Burn / hour',f.burnRate==null?'Not reported':money(f.burnRate)],['Usage',model.usage??'Not connected']];
      rows.forEach(([label,value],i)=>{const y=284+i*100;c.fillStyle='#cbd5c9';c.fillRect(40,y-16,w-80,1);text(c,label,40,y,25,'#64736c');text(c,value,40,y+33,30,'#244f4a',w-80);});text(c,model.mode==='demo'?'Illustrative demo':'Recorded costs only',40,816,23,'#637973');
    });
    if(selected==='ticker')paint(ticker,'#102d37',(c,w)=>{
      text(c,'XARTS / OPERATIONS',48,32,48,'#d6f3ed');
      if(model.operations){
        const story=model.operations;
        text(c,story.objective,48,110,30,'#a3c9bd',w-96);
        lines(c,story.heading,48,185,w-96,62,2,'#f3faf5');
        lines(c,story.detail,48,345,w-96,30,3,'#bad5ce');
        text(c,'NEXT',48,490,26,'#8ebdae');
        lines(c,story.next,48,535,w-96,32,3,'#f3faf5');
        text(c,'Click this screen for roles, evidence and the work queue →',48,725,29,'#b9dace',w-96);
        return;
      }
      const values=[['USAGE',model.usage??'Not connected'],['ERRORS',model.errors??'Not connected'],['BACKLOG',(model.kanban?.columns||[]).reduce((n,col)=>n+col.cards.length,0)],['QA',model.qa?.status||'idle'],['SPEND',currency(model.finance?.spent)],['SOURCE',model.mode==='demo'?'Illustrative demo':'Recorded snapshot']];
      values.forEach(([label,value],i)=>{const x=48+(i%3)*510,y=154+Math.floor(i/3)*260;c.fillStyle='#1d424a';c.fillRect(x,y,476,222);text(c,label,x+24,y+24,29,'#99c6bb');text(c,value,x+24,y+92,45,'#f3faf5',425);});
      if(model.operations)lines(c,model.operations.heading,48,704,w-96,30,2,'#b9dace');
    });else paint(ticker, '#102d37', c => { const count = (model.kanban?.columns || []).reduce((sum, col) => sum + (col.cards?.length || 0), 0); const parts=model.operations?[model.operations.heading.toUpperCase(),model.operations.activeCount+' AGENTS WORKING','CLICK FOR NEXT STEPS','XARTS / OPERATIONS']:[String(model.mode || 'live').toUpperCase(),'USAGE '+(model.usage??'—'),'ERRORS '+(model.errors??'—'),'BACKLOG '+count,'QA '+String(q.status || 'idle').toUpperCase(),'SPEND '+currency(model.finance?.spent),'XARTS / OPERATIONS']; let x=30; for(const part of parts){text(c,part,x,52,42,'#d6f3ed');c.font='600 42px system-ui,sans-serif';x+=c.measureText(part).width+100;} });
    if(nativeDetail){const panel=surfaces[nativeDetail.surface];paint(panel,nativeDetail.surface==='qa'?'#eef5f4':'#fffcf0',(c,w)=>{text(c,'← Back · click board',32,26,25,'#487571');lines(c,nativeDetail.title,32,100,w-64,40,3);text(c,nativeDetail.headline,32,268,32,['fail','error'].includes(nativeDetail.outcome)?'#ad382e':'#287d79',w-64);lines(c,nativeDetail.body,32,342,w-64,26,5);});}
    engBubble.textContent = model.engineering?.status === 'idle' ? 'Ready for a task' : String(model.engineering?.status || 'Idle');
    const currentStage = q.stages?.[q.stageIndex];
    qaBubble.textContent = q.status === 'failed' ? (model.mode === 'demo' && currentStage ? qaStageCopy(currentStage, model.mode).headline : 'Check failed · inspect evidence') : q.status === 'completed' ? 'Checks passed' : q.status === 'running' ? `${currentStage ? qaStageCopy(currentStage, model.mode).title : 'Checks'} in progress` : 'Waiting for a candidate';
    qaBubble.dataset.outcome = q.status || 'idle';
    ceoBubble.textContent = `${model.strategy?.ideas?.length || 0} ideas to explore`;
    requestRender();
  }
  function focus(id) { if(nativeDetail){nativeDetail=null;signature='';update(model);}tourMode='off';tourTime=0;tourLabel(); selected = stations[id] ? id : null; ticker.canvas.width=selected==='ticker'?1600:4096;ticker.canvas.height=selected==='ticker'?800:160;const oldTickerTexture=ticker.texture;oldTickerTexture.dispose();textures.splice(textures.indexOf(oldTickerTexture),1);ticker.texture=new THREE.CanvasTexture(ticker.canvas);ticker.texture.colorSpace=THREE.SRGBColorSpace;ticker.texture.wrapS=THREE.RepeatWrapping;ticker.face.material.map=ticker.texture;ticker.face.material.needsUpdate=true;textures.push(ticker.texture);ticker.texture.repeat.x=selected==='ticker'?1:.5;signature='';update(model);focusElapsed=0; hovered = null; if (detailElement) { detailElement.classList.toggle('world-surface', !!selected); if (!selected) { detailElement.style.removeProperty('transform'); detailElement.style.removeProperty('width'); detailElement.style.removeProperty('height'); detailElement.style.removeProperty('opacity'); } } requestRender(); }
  function preview(id) { hovered = stations[id] ? id : null; requestRender(); }
  const cameraTarget = new THREE.Vector3(0, 1, 0);
  const destination = new THREE.Vector3();
  const cameraOffset = baseCamera.clone().sub(cameraTarget), targetOffset = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function pick(event) { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pickable, true)[0]; let o = hit?.object; while (o && !o.userData.station) o = o.parent; return o?.userData.station; }
  function click(e) {
    const id=pick(e);
    if(selected && surfaces[selected]){
      const hit=raycaster.intersectObject(surfaces[selected].face)[0];
      if(hit){
        if(nativeDetail){nativeDetail=null;signature='';update(model);return;}
        if(selected==='ticker'){document.querySelector('.service-activity-link')?.click();return;}
        if(selected==='qa'){
          const y=(1-hit.uv.y)*510,index=Math.floor((y-168)/76);
          const stage=model.qa?.stages?.[index];if(index>=0&&index<4&&stage){const copy=qaStageCopy(stage,model.mode);nativeDetail={surface:'qa',title:copy.title,headline:copy.headline,body:copy.detail,outcome:stage.outcome};signature='';update(model);return;}
        }
        if(selected==='backlog'){
          const cols=model.kanban?.columns||[],cw=1150/Math.max(cols.length,1),i=Math.floor((hit.uv.x*1200-25)/cw),j=Math.floor(((1-hit.uv.y)*650-160)/112),card=cols[i]?.cards?.[j+pageOffsets.backlog];
          if(card&&j>=0){nativeDetail={surface:'backlog',title:card.title,headline:card.status,body:card.id};signature='';update(model);return;}
        }
      }
      return;
    }
    if(id)onSelect(id);
  }
  function scrollSurface(e){if(!['backlog','strategy'].includes(selected)||nativeDetail)return;e.preventDefault();const total=selected==='backlog'?Math.max(0,...(model.kanban?.columns||[]).map(c=>c.cards.length)):(model.strategy?.ideas?.length||0);const next=Math.max(0,Math.min(Math.max(0,Math.ceil(total/4)-1)*4,pageOffsets[selected]+Math.sign(e.deltaY)*4));if(next!==pageOffsets[selected]){pageOffsets[selected]=next;signature='';update(model);}}
  renderer.domElement.addEventListener('wheel',scrollSurface,{passive:false});
  function hover(e) { const id = pick(e); renderer.domElement.style.cursor = id ? 'pointer' : 'default'; if (hovered !== id) { hovered = id; requestRender(); } }
  function leave() { hovered = null; requestRender(); }
  renderer.domElement.addEventListener('click', click); renderer.domElement.addEventListener('pointermove', hover); renderer.domElement.addEventListener('pointerleave', leave);
  let width = 1, height = 1;
  function resize() { width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight); const aspect = width / height; const hh = Math.max(8.4, 12.0 / aspect); Object.assign(camera, { left: -hh * aspect, right: hh * aspect, top: hh, bottom: -hh }); camera.updateProjectionMatrix(); renderer.setSize(width, height, false); requestRender(); }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  function requestRender() { if (!disposed && !lost && !document.hidden && !frame) frame = requestAnimationFrame(render); }
  function render(time) {
    frame = 0; if (disposed || lost || document.hidden) return;
    if (!reduced.matches && !selected && model.mode !== 'demo' && previous && time-previous<32) { requestRender(); return; }
    const dt = previous ? Math.min((time - previous) / 1000, .05) : .016; previous = time; clock += dt;
    const motion = !reduced.matches, demo = model.mode === 'demo';
    const tickerTarget=selected==='ticker'?1:0;
    tickerExpansion+=(tickerTarget-tickerExpansion)*(motion?1-Math.exp(-dt*5):1);
    ticker.height=.47+2.15*tickerExpansion; ticker.face.scale.y=ticker.height/.47;
    ticker.face.position.y=4.18-1.075*tickerExpansion;
    tickerFrame.scale.y=(.68+2.15*tickerExpansion)/.68; tickerFrame.position.y=ticker.face.position.y;
    ticker.texture.offset.x=motion&&selected!=='ticker'?(clock*.022)%1:0;
    // Ambient posture is decorative; only recorded/demo state drives work activity.
    tester.g.rotation.z=motion?Math.sin(clock*.65)*.012:0;
    ticker.face.updateWorldMatrix(true,false);

    const targetDoor = selected === 'finance' ? -1.95 : 0; hinge.rotation.y += (targetDoor - hinge.rotation.y) * (motion ? Math.min(1, dt * 7) : 1);
    if(tourMode==='playing'&&motion&&!selected)tourTime+=dt;
    const touring=tourMode!=='off'&&!selected&&!reduced.matches;const tour=touring?tourPose():null;
    destination.set(...(tour?tour.p:[0,1,0]));
    const activeSurface = selected ? surfaces[selected] : null;
    if (activeSurface) activeSurface.face.getWorldPosition(destination);
    const ease = motion ? 1 - Math.exp(-dt * 5) : 1;
    cameraTarget.lerp(destination, ease);
    targetOffset.copy(selected ? new THREE.Vector3(0, 0, 35) : baseCamera.clone().sub(new THREE.Vector3(0,1,0)));
    cameraOffset.lerp(targetOffset, ease);
    camera.position.copy(cameraTarget).add(cameraOffset); camera.lookAt(cameraTarget);
    const fitWidth=selected==='qa'?.65:.84, fitHeight=selected==='finance'?.68:.8;
    const targetZoom = activeSurface ? Math.min((camera.right-camera.left) * fitWidth / activeSurface.width, (camera.top-camera.bottom) * fitHeight / activeSurface.height) : (tour?.z??1);
    camera.zoom += (targetZoom-camera.zoom) * ease;
    camera.near=.1; focusElapsed+=dt;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const q = model.qa || {}; const target = gateX[Math.min(3, Math.max(0, Number(q.stageIndex) || 0))];
    if (q.status === 'running' || q.status === 'completed') parcel.position.x += (target - parcel.position.x) * (motion ? Math.min(1, dt * 2.7) : 1);
    if (motion && q.status === 'running') slats.forEach((s, i) => { s.position.x = -3.37 + i * .197 + (clock * .65 % .197); });
    if(motion && !selected) for(const staff of generatedStaff) updateStaff(staff,dt);
    host.dataset.staffMotion=selected||!motion?'paused':'ambient-routes';
    engineer.arms.forEach((a, i) => { const typing = demo && model.engineering?.status && model.engineering.status !== 'idle'; a.shoulder.rotation.x = -1.1 + (motion && typing ? Math.sin(clock * 8 + i * Math.PI) * .09 : 0); a.elbow.rotation.x = -.55; });
    tester.arms[0].shoulder.rotation.x = q.status === 'failed' ? -1.5 : -.12; tester.arms[0].elbow.rotation.x = q.status === 'failed' ? -.5 : -.1;
    if (motion && demo) { ceo.g.position.x = -2.0 + Math.sin(clock * .36) * .5; ceo.g.rotation.y = Math.cos(clock * .36) > 0 ? .7 : -.7; ceo.legs.forEach((leg, i) => leg.rotation.x = Math.sin(clock * 3 + i * Math.PI) * .16); }
    else { ceo.g.position.x = -2.0; ceo.g.rotation.y = .35; ceo.legs.forEach(leg => leg.rotation.x = 0); }
    scene.updateMatrixWorld();
    // Hide whole foreground objects during inspection; never slice geometry with a near plane.
    // Shared materials are untouched, so the inspected object's frame remains physically intact.
    for (const item of inspectionObjects) {
      item.object.visible=item.visible;
      if (selected && (!motion || focusElapsed>.22) && item.object!==stations[selected] && (item.object.name.startsWith('generated-preview-') || item.front > destination.z+.25)) item.object.visible=false;
    }
    if (selected && detailElement) detailElement.style.opacity=String(motion?Math.min(1,Math.max(0,(focusElapsed-.3)/.25)):1);
    labels.forEach(({ node, anchor: point }) => { point.getWorldPosition(v); v.project(camera); node.style.left = `${(v.x + 1) * .5 * width}px`; node.style.top = `${(-v.y + 1) * .5 * height}px`; node.hidden = !!selected || !hovered || node.dataset.station !== hovered || node.classList.contains('office-stage-label') || v.z < -1 || v.z > 1; });
    for(const [id,element] of Object.entries(nativeSurfaces)){element.hidden=selected!==id;element.inert=selected!==id;}
    renderer.domElement.style.pointerEvents='auto';
    returnButton.hidden=!selected;
    if (activeSurface && !nativeSurfaces[selected] && detailElement?.open) {
      // Orthographic projection is affine: these three corners exactly register DOM to mesh.
      const { face, width: sw, height: sh } = activeSurface;
      const project = (x,y) => { const point = face.localToWorld(new THREE.Vector3(x,y,0)).project(camera); const rect = host.getBoundingClientRect(); return { x:rect.left+(point.x+1)*width/2, y:rect.top+(1-point.y)*height/2 }; };
      const localHeight=face.geometry.parameters.height;
      const origin=project(-sw/2,localHeight/2), right=project(sw/2,localHeight/2), bottom=project(-sw/2,-localHeight/2);
      const dw = Math.round(Math.min(width * fitWidth, height * fitHeight * sw / sh)), dh = dw*sh/sw;
      detailElement.style.width = `${dw}px`; detailElement.style.height = `${dh}px`;
      detailElement.style.transform = `matrix(${(right.x-origin.x)/dw},${(right.y-origin.y)/dw},${(bottom.x-origin.x)/dh},${(bottom.y-origin.y)/dh},${origin.x},${origin.y})`;
    }
    renderer.render(scene, camera);
    const settling = (selected && focusElapsed<.8) || Math.abs(tickerExpansion-tickerTarget)>.001 || cameraOffset.distanceTo(targetOffset) > .001 || cameraTarget.distanceTo(destination) > .001 || Math.abs(hinge.rotation.y - targetDoor) > .001 || Math.abs(camera.zoom - targetZoom) > .001 || ((q.status === 'running' || q.status === 'completed') && Math.abs(parcel.position.x - target) > .002);
    if (motion && (!selected || demo || q.status === 'running' || settling)) requestRender();
  }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { previous = 0; requestRender(); } }
  function motionChange() { if(reduced.matches){tourMode='off';tourTime=0;}tourLabel();previous = 0; requestRender(); }
  function contextLost(event) { event.preventDefault(); focus(null); lost = true; cancelAnimationFrame(frame); frame = 0; fallbackNode = fallback(); labels.forEach(({ node }) => node.style.display = 'none'); }
  document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motionChange); renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const inspectionObjects=scene.children.filter(o=>!o.isLight && (o.isMesh||o.isGroup)).map(object=>({object,visible:object.visible,front:new THREE.Box3().setFromObject(object).max.z}));
  // Decorative circulation stays separate from actual task state. The authored aisle
  // routes avoid workstations; root motion from generated clips cannot steer people.
  function updateStaff(staff,dt){
    const {placed,route,mixer,bones}=staff;if(!route)return;
    let walking=false;
    if(staff.wait>0)staff.wait-=dt;
    else {
      const next=route[staff.step+staff.direction];
      const dx=next[0]-placed.position.x,dz=next[1]-placed.position.z,distance=Math.hypot(dx,dz);
      const targetAngle=Math.atan2(dx,dz),angle=Math.atan2(Math.sin(targetAngle-placed.rotation.y),Math.cos(targetAngle-placed.rotation.y));
      placed.rotation.y+=Math.max(-dt*1.3,Math.min(dt*1.3,angle));
      if(Math.abs(angle)<.4){
        const travel=Math.min(distance,dt*.38);placed.position.x+=dx/Math.max(distance,.0001)*travel;placed.position.z+=dz/Math.max(distance,.0001)*travel;walking=true;
        if(distance<.03){placed.position.set(next[0],0,next[1]);staff.step+=staff.direction;if(staff.step===route.length-1||staff.step===0)staff.direction*=-1;staff.wait=12+(staff.step%3)*4;walking=false;}
      }
    }
    mixer.update(dt*(walking?.65:.22));
    for(const {bone,rotation,position} of bones){
      if(bone.name==='Hips'){bone.quaternion.copy(rotation);bone.position.copy(position);}
      else bone.quaternion.slerp(rotation,walking?.4:.88);
    }
    // Bounds change as colleagues move, so close-up occlusion must follow them.
    const record=inspectionObjects.find(x=>x.object===placed);if(record)record.front=placed.position.z+.5;
  }
  async function loadGenerated(id, size, position, rotation, replacement, file=id+'.glb') {
    try {
      const gltf=await new GLTFLoader().loadAsync(`/assets/generated/${file}`);
      const object=gltf.scene;object.name=`generated-${id}`;
      if(disposed){object.traverse(n=>{n.geometry?.dispose();for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[])m.dispose();});return;}
      const bounds=new THREE.Box3().setFromObject(object),extent=bounds.getSize(new THREE.Vector3());
      object.scale.multiplyScalar(size/(['engineer','ceo','qa-person','product-lead','plants'].includes(id)?extent.y:Math.max(extent.x,extent.z)));
      const scaled=new THREE.Box3().setFromObject(object),center=scaled.getCenter(new THREE.Vector3());object.position.set(-center.x,-scaled.min.y,-center.z);
      const placed=new THREE.Group();placed.name=`generated-preview-${id}`;placed.add(object);placed.position.set(...position);placed.rotation.y=rotation;
      object.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=false;for(const m of Array.isArray(n.material)?n.material:[n.material]){m.emissiveIntensity=0;if(m.map){m.map.minFilter=THREE.LinearFilter;m.map.generateMipmaps=false;m.map.anisotropy=renderer.capabilities.getMaxAnisotropy();m.map.needsUpdate=true;}if(m.specularIntensity!==undefined)m.specularIntensity=.3;if(['engineer','ceo','qa-person','product-lead'].includes(id)){m.metalness=0;m.roughness=Math.max(.8,m.roughness);m.roughnessMap=null;}for(const value of Object.values(m))if(value?.isTexture&&!textures.includes(value))textures.push(value);}}});
      scene.add(placed);if(id==='plants'){for(const [x,z,scale] of [[9,-5.5,.96],[9,5.5,.82],[-9,4.4,.8]]){const copy=placed.clone(true);copy.position.set(x,0,z);copy.scale.setScalar(scale);copy.rotation.y=x>0?-.6:.8;scene.add(copy);inspectionObjects.push({object:copy,visible:true,front:z+1});const old=scene.getObjectByName(`authored-plant-${x}-${z}`);if(old)old.visible=false;}}if(replacement){replacement.visible=false;const record=inspectionObjects.find(x=>x.object===replacement);if(record)record.visible=false;}
      inspectionObjects.push({object:placed,visible:true,front:new THREE.Box3().setFromObject(placed).max.z});
      if(gltf.animations.length){
        const mixer=new THREE.AnimationMixer(object);mixer.clipAction(gltf.animations[0]).play();generatedMixers.push(mixer);
        const bones=[];object.traverse(n=>{if(n.isBone)bones.push({bone:n,rotation:n.quaternion.clone(),position:n.position.clone()});});
        const routes={engineer:[[-3.6,4.8],[-1.4,4.8],[-1.4,1]],ceo:[[-2,2],[-1.5,-1],[3.8,-1],[3.8,.4]],'qa-person':[[5.4,5.3],[7.9,5.3],[7.9,.2]],'product-lead':[[2.9,-2.5],[3.6,-1.2],[.2,-1.2]]};
        generatedStaff.push({id,placed,mixer,bones,route:routes[id],step:0,direction:1,wait:8+generatedStaff.length*6,phase:0});
      }
      generatedStatus[id]='loaded';host.setAttribute(`data-${id}-asset`,'generated');requestRender();
    } catch {generatedStatus[id]='unavailable';host.setAttribute(`data-${id}-asset`,'fallback');}
    assetNotice.textContent=`Generated previews · ${Object.values(generatedStatus).filter(s=>s==='loaded').length} loaded${Object.values(generatedStatus).includes('unavailable')?' · some unavailable':''} · review in Studio ↗`;
  }
  async function loadOfficeAssets(){let entries=[];try{const r=await fetch('/api/office-assets');if(r.ok)entries=(await r.json()).entries??[];}catch{}if(disposed)return;
    const placements={engineer:[2.5,[-3.6,0,4.8],.3,engineer.g],chair:[2.4,[-6.7,0,5.65],.15,scene.getObjectByName('authored-lounge')],ceo:[2.65,[-2,0,2],.35,ceo.g],'qa-person':[2.5,[5.4,0,5.3],-.4,tester.g],'product-lead':[2.5,[2.9,0,-2.5],.4,null],slide:[3.6,[-8.8,0,-.4],0,scene.getObjectByName('authored-slide')],planning:[3.9,[.85,0,-4.5],0,planningFurniture],plants:[2.8,[-9,0,-5.5],0,scene.getObjectByName('authored-plant--9--5.5')]};
    for(const [id,placement] of Object.entries(placements)){const entry=entries.find(e=>e.id===id);if(entry||['engineer','chair'].includes(id))void loadGenerated(id,...placement,entry?.file??id+'.glb');}
    const art=entries.find(e=>e.id==='art');if(art){new THREE.TextureLoader().load('/assets/generated/'+art.file,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const panel=mesh(scene,new THREE.PlaneGeometry(1.45,.96),new THREE.MeshStandardMaterial({map:t,roughness:.9}),[-2.45,4.1,-6.99]);panel.castShadow=false;requestRender();});}
  }
  void loadOfficeAssets();
  resize(); update({});
  return { update, focus, preview, dispose() { disposed = true; tourControls.remove();returnButton.remove();assetNotice.remove();generatedMixers.forEach(m=>m.stopAllAction()); cancelAnimationFrame(frame); resizeObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motionChange); renderer.domElement.removeEventListener('wheel',scrollSurface); renderer.domElement.removeEventListener('click', click); renderer.domElement.removeEventListener('pointermove', hover); renderer.domElement.removeEventListener('pointerleave', leave); renderer.domElement.removeEventListener('webglcontextlost', contextLost); labels.forEach(({ node }) => node.remove()); fallbackNode?.remove(); const geometries = new Set(), materials = new Set(); scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); renderer.dispose(); renderer.domElement.remove(); } };
}
