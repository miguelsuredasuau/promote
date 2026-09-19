/** Original, deterministic studio materials. No downloaded images or asset licences. */
export function createOfficeMaterials(THREE) {
  const textures = [];
  let seed = 0x58a47;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const canvas = (size) => {
    const element = document.createElement('canvas');
    element.width = element.height = size;
    return [element, element.getContext('2d')];
  };
  const texture = (element, color = true, repeat = [1, 1]) => {
    const map = new THREE.CanvasTexture(element);
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(...repeat);
    map.anisotropy = 4;
    textures.push(map);
    return map;
  };

  // Long European-oak fibres, fine vessels and occasional quiet cathedrals.
  const [woodCanvas, wood] = canvas(1024);
  wood.fillStyle = '#d7b98d'; wood.fillRect(0, 0, 1024, 1024);
  for (let plank = 0; plank < 8; plank++) {
    const y = plank * 128;
    const wash = wood.createLinearGradient(0, y, 0, y + 128);
    wash.addColorStop(0, `rgba(251,225,175,${.13 + random() * .2})`);
    wash.addColorStop(.45, 'rgba(246,217,167,.03)');
    wash.addColorStop(1, `rgba(107,77,40,${.025 + random() * .07})`);
    wood.fillStyle = wash; wood.fillRect(0, y, 1024, 128);
    for (let fibre = 0; fibre < 150; fibre++) {
      const baseline = y + random() * 128;
      const amplitude = 1 + random() * 3;
      const phase = random() * Math.PI * 2;
      wood.beginPath();
      for (let x = 0; x <= 1024; x += 16) {
        const yy = baseline + Math.sin(x / 130 + phase) * amplitude + Math.sin(x / 49 + phase) * .4;
        if (x === 0) wood.moveTo(x, yy); else wood.lineTo(x, yy);
      }
      wood.strokeStyle = fibre % 3 === 0 ? `rgba(255,246,213,${.08 + random() * .17})` : `rgba(104,70,34,${.025 + random() * .09})`;
      wood.lineWidth = .35 + random() * .75; wood.stroke();
    }
    if (plank % 3 === 1) {
      const cx = 180 + random() * 620, cy = y + 64;
      for (let ring = 1; ring < 15; ring++) {
        wood.beginPath(); wood.ellipse(cx, cy, 8 + ring * 15, 1 + ring * 2.3, .015, 0, Math.PI * 2);
        wood.strokeStyle = `rgba(119,80,40,${.06 - ring * .002})`; wood.lineWidth = .8; wood.stroke();
      }
    }
    wood.fillStyle = 'rgba(96,73,45,.12)'; wood.fillRect(0, y, 1024, 1);
    wood.fillStyle = 'rgba(255,249,225,.23)'; wood.fillRect(0, y + 1, 1024, 1);
    // The join alternates to avoid a tiled parquet-grid appearance.
    const join = [180, 670, 410, 900, 530, 250, 780, 490][plank];
    wood.fillStyle = 'rgba(99,76,47,.12)'; wood.fillRect(join, y, 1, 128);
  }
  const woodMap = texture(woodCanvas);
  const woodBump = texture(woodCanvas, false);
  const oak = new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodBump, bumpScale: .009, roughness: .57, color: 0xfff4e4 });
  const woodEdge = new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodBump, bumpScale: .004, roughness: .55, color: 0xe8c99b });

  // Shared woven relief: crossed yarns, not a photographic-noise overlay.
  const [weaveCanvas, weave] = canvas(512);
  weave.fillStyle = '#989898'; weave.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 4) {
    for (let x = 0; x < 512; x += 4) {
      const tone = Math.floor(123 + random() * 47);
      weave.fillStyle = `rgb(${tone},${tone},${tone})`;
      if ((x + y) % 8 === 0) weave.fillRect(x, y + 1, 4, 2);
      else weave.fillRect(x + 1, y, 2, 4);
    }
  }
  const weaveMap = texture(weaveCanvas, false, [3, 3]);
  const fabric = new THREE.MeshStandardMaterial({ color: 0xc1aed0, bumpMap: weaveMap, bumpScale: .019, roughness: .96 });

  // A single composition, with the hand-tufted texture in a separate relief map.
  const [rugCanvas, rugPaint] = canvas(1024);
  rugPaint.fillStyle = '#e6ddc8'; rugPaint.fillRect(0, 0, 1024, 1024);
  rugPaint.fillStyle = '#448b8a';
  rugPaint.beginPath(); rugPaint.moveTo(0, 115); rugPaint.bezierCurveTo(170, -65, 452, 80, 530, 220);
  rugPaint.bezierCurveTo(620, 365, 361, 432, 445, 573); rugPaint.bezierCurveTo(610, 823, 201, 1050, 0, 851); rugPaint.closePath(); rugPaint.fill();
  rugPaint.fillStyle = '#81a8a0';
  rugPaint.beginPath(); rugPaint.moveTo(1024, 221); rugPaint.bezierCurveTo(710, 142, 623, 357, 740, 519);
  rugPaint.bezierCurveTo(823, 636, 557, 705, 657, 893); rugPaint.bezierCurveTo(729, 1024, 930, 982, 1024, 897); rugPaint.fill();
  rugPaint.fillStyle = '#baa7bd';
  rugPaint.beginPath(); rugPaint.ellipse(385, 957, 239, 177, -.25, 0, Math.PI * 2); rugPaint.fill();
  rugPaint.fillStyle = '#cfb475';
  rugPaint.beginPath(); rugPaint.ellipse(973, 52, 153, 168, .4, 0, Math.PI * 2); rugPaint.fill();
  // Fine colour flecks emulate yarn variation without losing the large pattern.
  for (let i = 0; i < 24000; i++) {
    rugPaint.fillStyle = i % 2 ? 'rgba(255,252,233,.12)' : 'rgba(54,61,52,.065)';
    rugPaint.fillRect(random() * 1024, random() * 1024, .6 + random(), 1 + random() * 2);
  }
  const rug = new THREE.MeshStandardMaterial({ map: texture(rugCanvas), bumpMap: weaveMap, bumpScale: .023, roughness: 1 });
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf1ede1, roughness: .37, clearcoat: .18, clearcoatRoughness: .45 });

  const [leafCanvas, leafPaint] = canvas(512);
  const leafGradient = leafPaint.createLinearGradient(0, 0, 512, 0);
  leafGradient.addColorStop(0, '#254820'); leafGradient.addColorStop(.43, '#527f30');
  leafGradient.addColorStop(.5, '#82a343'); leafGradient.addColorStop(.57, '#46712a'); leafGradient.addColorStop(1, '#1e4426');
  leafPaint.fillStyle = leafGradient; leafPaint.fillRect(0, 0, 512, 512);
  leafPaint.strokeStyle = 'rgba(185,200,109,.27)'; leafPaint.lineWidth = 2;
  for (let y = 38; y < 540; y += 38) {
    leafPaint.beginPath(); leafPaint.moveTo(256, y); leafPaint.quadraticCurveTo(119, y - 6, 0, y - 130);
    leafPaint.moveTo(256, y); leafPaint.quadraticCurveTo(393, y - 6, 512, y - 130); leafPaint.stroke();
  }
  leafPaint.strokeStyle = '#779748'; leafPaint.lineWidth = 3;
  leafPaint.beginPath(); leafPaint.moveTo(256, 0); leafPaint.lineTo(256, 512); leafPaint.stroke();
  const leaf = new THREE.MeshStandardMaterial({ map: texture(leafCanvas), roughness: .58, side: THREE.DoubleSide });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xb9c2c1, metalness: .82, roughness: .24, clearcoat: .2 });
  const [stoneCanvas,stone]=canvas(1024);stone.fillStyle='#eeeae1';stone.fillRect(0,0,1024,1024);
  const chips=['#d7d2c7','#c6c1b7','#fdfaf0','#bccac7','#d7c6b5'];
  for(let i=0;i<6200;i++){const x=random()*1024,y=random()*1024,r=.5+random()*2.7;stone.fillStyle=chips[i%chips.length];stone.beginPath();stone.moveTo(x-r,y);stone.lineTo(x+r*.7,y-r);stone.lineTo(x+r,y+r*.8);stone.lineTo(x-r*.5,y+r);stone.closePath();stone.fill();}
  const terrazzo=new THREE.MeshStandardMaterial({map:texture(stoneCanvas),roughness:.72});
  return { oak, woodEdge, fabric, rug, ceramic, leaf, chrome, terrazzo, textures };
}
