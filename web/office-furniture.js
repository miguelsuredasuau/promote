/** Authored studio furniture and botanical meshes. No external assets or licences required. */
export function addOfficeFurniture(THREE, scene, materials = {}) {
  const group = new THREE.Group(); group.name = 'authored-studio-furniture'; scene.add(group);
  const owned = [];
  const material = (key, color, options = {}) => materials[key] || (() => { const m = new THREE.MeshStandardMaterial({ color, roughness: .8, ...options }); owned.push(m); return m; })();
  const oak = material('oak', 0xc9a574), ceramic = material('ceramic', 0xe8e3d8);
  const leaf = material('leaf', 0x35693b, { side: THREE.DoubleSide });
  const chrome = material('chrome', 0x9babad, { metalness: .8, roughness: .23 });
  const lilac = material('loungeFabric', 0xb4a2bd), mustard = material('ottomanFabric', 0xd7ac46);
  const charcoal = material('chairFabric', 0x34484a), black = material('rubber', 0x263331);
  const soil = material('soil', 0x403729), vein = material('vein', 0x809653);
  const paper = material('bookPaper', 0xf2ead7), teal = material('bookTeal', 0x397e85), coral = material('bookCoral', 0xc7796e);
  function add(p, geo, mat, x=0,y=0,z=0) { const m = new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; p.add(m); return m; }
  function curve(p, points, radius, mat, tubular=20) { return add(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(a=>new THREE.Vector3(...a))),tubular,radius,6,false),mat); }
  function rounded(p,w,h,d,x,y,z,mat,r=.08) {
    const s=new THREE.Shape(), a=-w/2+r,b=-h/2+r;
    s.moveTo(a,b); s.lineTo(a+w-2*r,b); s.lineTo(a+w-2*r,b+h-2*r); s.lineTo(a,b+h-2*r); s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(.005,d-2*r),bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:r,bevelThickness:r}); g.translate(0,0,-d/2+r);
    return add(p,g,mat,x,y,z);
  }
  function lathe(p,points,mat,x=0,y=0,z=0,segments=40) { return add(p,new THREE.LatheGeometry(points.map(a=>new THREE.Vector2(...a)),segments),mat,x,y,z); }
  // The lounge shell is a continuous upholstered horseshoe with gently flared arms.
  const lounge = new THREE.Group(); lounge.name='authored-lounge'; lounge.position.set(-6.7,0,5.65); lounge.rotation.y=-.35; group.add(lounge);
  const shellPoints=[], indices=[]; const rows=8, cols=56;
  for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
    const u=i/cols,a=.04+u*(Math.PI*1.92),t=j/rows;
    const height=.95+.4*Math.sin(Math.PI*u), radius=1.04+.13*t;
    shellPoints.push(Math.sin(a)*radius,.37+t*height,Math.cos(a)*radius*.82);
  }
  for(let j=0;j<rows;j++) for(let i=0;i<cols;i++){ const a=j*(cols+1)+i;indices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1); }
  const shellGeo=new THREE.BufferGeometry();shellGeo.setAttribute('position',new THREE.Float32BufferAttribute(shellPoints,3));shellGeo.setIndex(indices);shellGeo.computeVertexNormals();
  const upholstery=lilac.clone(); upholstery.side=THREE.DoubleSide;owned.push(upholstery);add(lounge,shellGeo,upholstery);
  const rim=[];for(let i=0;i<=64;i++){const u=i/64,a=.04+u*Math.PI*1.92;rim.push([Math.sin(a)*1.17,1.32+.4*Math.sin(Math.PI*u),Math.cos(a)*1.17*.82]);}curve(lounge,rim,.105,lilac,72);
  const cushion=add(lounge,new THREE.SphereGeometry(1,40,24),lilac,0,.52,0);cushion.scale.set(1.0,.25,.85);
  const lower=add(lounge,new THREE.SphereGeometry(1,36,18),lilac,0,.32,0);lower.scale.set(1.05,.27,.88);
  const seam=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;seam.push([Math.cos(a)*.98,.57,Math.sin(a)*.83]);}curve(lounge,seam,.013,lilac,64);
  // Sculpted oak pedestal table with a recessed ceramic coffee cup and stacked art books.
  const table=new THREE.Group();table.position.set(-4.3,0,5.65);group.add(table);
  lathe(table,[[0,0],[.52,0],[.53,.05],[.3,.14],[.25,.72],[.35,.79],[.88,.82],[.91,.9],[.89,.95],[0,.95]],oak);
  function book(p,x,y,z,w,d,color,angle=0) {const b=new THREE.Group();b.position.set(x,y,z);b.rotation.y=angle;p.add(b);rounded(b,w,.08,d,0,0,0,paper,.015);for(const h of [-.055,.055])rounded(b,w+.04,.02,d+.04,0,h,0,color,.005);rounded(b,.03,.12,d+.04,-w/2,0,0,color,.006);}
  book(table,-.12,1.03,0,.75,.57,teal,-.18);book(table,-.1,1.17,-.03,.66,.48,coral,.05);
  lathe(table,[[.12,0],[.15,.03],[.16,.27],[.145,.285],[.13,.27],[.115,.045],[0,.045]],ceramic,.42,.95,.23,24);
  add(table,new THREE.CylinderGeometry(.126,.126,.005,24),soil,.42,1.218,.23);
  const handle=add(table,new THREE.TorusGeometry(.09,.023,8,18),ceramic,.59,1.09,.23);handle.rotation.y=Math.PI/2;
  // Tailored ottoman: fabric body and six subtly raised stitched panels.
  const ottoman=new THREE.Group();ottoman.position.set(-3.65,0,6.85);group.add(ottoman);
  lathe(ottoman,[[0,0],[.43,0],[.52,.08],[.55,.55],[.5,.72],[.25,.76],[0,.76]],mustard);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;curve(ottoman,[[Math.cos(a)*.44,.04,Math.sin(a)*.44],[Math.cos(a)*.548,.33,Math.sin(a)*.548],[Math.cos(a)*.5,.68,Math.sin(a)*.5],[Math.cos(a)*.3,.75,Math.sin(a)*.3]],.009,mustard,12);}
  // Ergonomic task chair: five-star metal base, casters, contoured mesh back and armrests.
  const chair=new THREE.Group();chair.name='authored-task-chair';chair.position.set(-5.25,0,4.1);group.add(chair);
  add(chair,new THREE.CylinderGeometry(.075,.09,.64,16),chrome,0,.44,0);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5,dx=Math.cos(a),dz=Math.sin(a);curve(chair,[[0,.27,0],[dx*.36,.18,dz*.36],[dx*.69,.14,dz*.69]],.048,chrome,12);const wheel=add(chair,new THREE.CylinderGeometry(.105,.105,.105,16),black,dx*.7,.105,dz*.7);wheel.rotation.z=Math.PI/2;wheel.rotation.y=-a;}
  const seat=add(chair,new THREE.SphereGeometry(1,32,16),charcoal,0,.89,0);seat.scale.set(.67,.15,.59);
  curve(chair,[[0,.68,.24],[0,.86,.57],[0,1.35,.68],[0,1.9,.72]],.055,chrome);
  const backFrame=[[-.57,1.13,.6],[-.62,1.66,.73],[-.51,2.04,.79],[0,2.09,.8],[.51,2.04,.79],[.62,1.66,.73],[.57,1.13,.6]];curve(chair,backFrame,.058,charcoal,36);
  for(let i=0;i<17;i++){const y=1.16+i*.051;const width=.55+.04*Math.sin(i/16*Math.PI);const z=.61+(y-1.16)*.21;curve(chair,[[-width,y,z],[0,y-.03,z-.05],[width,y,z]],.011,charcoal,8);}
  for(let i=0;i<15;i++){const x=-.5+i/14;curve(chair,[[x,1.15,.6],[x*1.08,1.57,.68],[x,2.04,.79]],.008,charcoal,8);}
  for(const x of [-.72,.72]){curve(chair,[[x*.65,.77,.18],[x,1.17,.2],[x,1.26,-.2]],.037,chrome);rounded(chair,.17,.075,.64,x,1.3,-.03,charcoal,.025);}
  // Botanicals use curved blade meshes with tapered silhouettes and a central rib.
  function plant(x,z,scale=1,phase=0) {
    const p=new THREE.Group();p.name=`authored-plant-${x}-${z}`;p.position.set(x,0,z);p.scale.setScalar(scale);group.add(p);
    lathe(p,[[0,0],[.36,0],[.4,.05],[.48,.7],[.48,.82],[.43,.83],[.41,.76],[.37,.12],[0,.12]],ceramic);
    add(p,new THREE.CylinderGeometry(.415,.415,.02,32),soil,0,.76,0);
    for(let i=0;i<12;i++){
      const a=i*2.399+phase,height=1.08+(i%4)*.35,reach=.46+(i%3)*.2;
      const start=new THREE.Vector3(Math.cos(a)*.06,.77,Math.sin(a)*.06), base=new THREE.Vector3(Math.cos(a)*reach*.45,height,Math.sin(a)*reach*.45);
      curve(p,[start.toArray(),[base.x*.5,height*.84,base.z*.5],base.toArray()],.013,vein,10);
      const positions=[],ids=[],rows=16,cols=6,length=.8+(i%3)*.22,width=.22+(i%2)*.08;
      const direction=new THREE.Vector3(Math.cos(a),.76,Math.sin(a)).normalize(),side=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
      const spine=[];
      for(let r=0;r<=rows;r++){
        const t=r/rows,center=base.clone().addScaledVector(direction,length*t);center.y-=.56*t*t;spine.push(center.toArray());
        const spread=width*Math.pow(Math.sin(Math.PI*t),.8);
        for(let c=0;c<=cols;c++){const s=c/cols*2-1,point=center.clone().addScaledVector(side,spread*s);point.y+=.09*Math.abs(s)*Math.sin(Math.PI*t);positions.push(point.x,point.y,point.z);}
      }
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const n=r*(cols+1)+c;ids.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(ids);geo.computeVertexNormals();add(p,geo,leaf);curve(p,spine,.006,vein,18);
    }
  }
  plant(-9,-5.5,1.15);plant(9,-5.5,1.06,1);plant(9,5.5,.9,2);plant(-9,4.4,.85,.5);
  return { group, materials: owned };
}

/** Articulation belongs to the presentation layer; it cannot advance controller state. */
export function articulateVault(THREE, placed, display, ledger) {
  placed.updateWorldMatrix(true,true);
  const inverse=placed.matrixWorld.clone().invert(), bounds=new THREE.Box3();
  const sources=[];
  placed.traverse(mesh=>{if(!mesh.isMesh||mesh.isSkinnedMesh)return;const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));geometry.computeBoundingBox();bounds.union(geometry.boundingBox);sources.push({mesh,geometry});});
  const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
  const pivot=new THREE.Vector3(bounds.max.x-size.x*.065,0,bounds.max.z-.32);
  const door=new THREE.Group();door.name='articulated-vault-door';door.position.copy(pivot);placed.add(door);
  const enamel=new THREE.MeshPhysicalMaterial({color:0x194eac,metalness:.28,roughness:.3,clearcoat:.55}),steel=new THREE.MeshStandardMaterial({color:0xc1ccd2,metalness:.75,roughness:.3});let doorTriangles=0;
  for(const {mesh,geometry} of sources){
    const p=geometry.attributes.position, buckets=[[],[]];
    for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
      const front=x>bounds.min.x+size.x*.065&&x<bounds.max.x-size.x*.065&&y>bounds.min.y+size.y*.05&&y<bounds.max.y-size.y*.07&&z>pivot.z;
      buckets[front?1:0].push(i,i+1,i+2);if(front)doorTriangles++;
    }
    buckets.forEach((indices,isDoor)=>{if(!isDoor||!indices.length)return;const g=new THREE.BufferGeometry();for(const [name,attribute] of Object.entries(geometry.attributes)){const values=new attribute.array.constructor(indices.length*attribute.itemSize);indices.forEach((source,target)=>{for(let n=0;n<attribute.itemSize;n++)values[target*attribute.itemSize+n]=attribute.array[source*attribute.itemSize+n];});g.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));}
      if(isDoor)g.translate(-pivot.x,-pivot.y,-pivot.z);g.computeBoundingSphere();const part=new THREE.Mesh(g,isDoor?steel:enamel);part.castShadow=true;part.receiveShadow=true;(isDoor?door:placed).add(part);
    });mesh.visible=false;geometry.dispose();
  }
  if(!doorTriangles)return null;
  // Reparent the live LCD onto the actual moving door without changing its registration.
  door.attach(display.face);
  ledger.face.visible=true;placed.attach(ledger.face);ledger.face.position.set(center.x,size.y*.5,pivot.z-.09);
  const dark=new THREE.MeshStandardMaterial({color:0x102a39,roughness:.45,metalness:.35});
  const lining=new THREE.Mesh(new THREE.BoxGeometry(size.x*.88,size.y*.9,.12),dark);lining.position.set(center.x,size.y*.5,pivot.z-.18);placed.add(lining);
  // Repair the generated shell's ragged planar boundary with an exact, bevelled housing.
  const outline=new THREE.Shape();outline.moveTo(-size.x/2,0);outline.lineTo(size.x/2,0);outline.lineTo(size.x/2,size.y);outline.lineTo(-size.x/2,size.y);outline.closePath();
  const opening=new THREE.Path();opening.moveTo(-size.x*.435,size.y*.05);opening.lineTo(-size.x*.435,size.y*.93);opening.lineTo(size.x*.435,size.y*.93);opening.lineTo(size.x*.435,size.y*.05);opening.closePath();outline.holes.push(opening);
  const housing=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:pivot.z-bounds.min.z+.06,bevelEnabled:true,bevelSize:.028,bevelThickness:.028,bevelSegments:3,steps:1}),enamel);housing.position.set(center.x,0,bounds.min.z);housing.castShadow=true;housing.receiveShadow=true;placed.add(housing);
  const backing=new THREE.Mesh(new THREE.BoxGeometry(size.x*.87,size.y*.88,.16),steel);backing.position.set(-size.x*.435,size.y*.49,.09);door.add(backing);
  for(const [w,h,x,y] of [[size.x*.91,.055,center.x,size.y*.94],[size.x*.91,.055,center.x,size.y*.055],[.055,size.y*.9,bounds.min.x+size.x*.05,size.y*.5],[.055,size.y*.9,bounds.max.x-size.x*.05,size.y*.5]]){const rim=new THREE.Mesh(new THREE.BoxGeometry(w,h,.11),steel);rim.position.set(x,y,pivot.z+.005);placed.add(rim);}
  return {door,triangles:doorTriangles,width:size.x,height:size.y,center:new THREE.Vector3(center.x,size.y*.5,pivot.z),surface:ledger};
}

/** Rotate in the rig's parent-space; generated bones do not share Blender's local axes. */
export function applyWalkingPose(THREE, staff, distance, dt, walking) {
  staff.stride=(staff.stride??0)+distance*2*Math.PI/.9;
  staff.gaitWeight=THREE.MathUtils.damp(staff.gaitWeight??0,walking?1:0,7,dt);
  for(const {bone,rotation,position} of staff.bones){bone.quaternion.copy(rotation);bone.position.copy(position);}
  const w=staff.gaitWeight, phase=staff.stride, axis=new THREE.Vector3(), parentQ=new THREE.Quaternion(), rotation=new THREE.Quaternion();
  staff.placed.updateWorldMatrix(true,true);
  for(const {bone,position} of staff.bones){
    if(/^(Left|Right)Arm$/.test(bone.name)){
      const child=bone.children.find(n=>n.isBone);if(child){const origin=bone.getWorldPosition(new THREE.Vector3()),direction=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();const desired=new THREE.Vector3(bone.name.startsWith('Left')?.14:-.14,-.985,.035).normalize().applyQuaternion(staff.placed.quaternion);const delta=new THREE.Quaternion().setFromUnitVectors(direction,desired);bone.parent.getWorldQuaternion(parentQ);bone.quaternion.premultiply(parentQ.clone().invert().multiply(delta).multiply(parentQ));bone.updateWorldMatrix(false,true);}
    }
    const side=bone.name.startsWith('Left')?1:-1, cycle=Math.sin(phase+(side===1?0:Math.PI));let angle=0;
    if(/UpLeg$/.test(bone.name))angle=cycle*.30*w;
    else if(/^(Left|Right)Leg$/.test(bone.name))angle=-Math.max(0,-cycle)*.48*w;
    else if(/^(Left|Right)Foot$/.test(bone.name))angle=-cycle*.12*w;
    else if(/^(Left|Right)Arm$/.test(bone.name))angle=-cycle*.16*w;
    if(!angle)continue;
    // World right of the person, converted into the bone parent's coordinates.
    axis.set(1,0,0).applyQuaternion(staff.placed.quaternion);bone.parent.getWorldQuaternion(parentQ);axis.applyQuaternion(parentQ.invert()).normalize();rotation.setFromAxisAngle(axis,angle);bone.quaternion.premultiply(rotation);bone.updateWorldMatrix(false,true);
  }
}
