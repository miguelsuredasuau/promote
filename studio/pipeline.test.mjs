import {test} from 'node:test';import assert from 'node:assert/strict';import {inspectGLB} from './pipeline.mjs';
function glb(doc){const body=Buffer.from(JSON.stringify(doc).padEnd(Math.ceil(JSON.stringify(doc).length/4)*4));const b=Buffer.alloc(20+body.length);b.writeUInt32LE(0x46546c67);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(body.length,12);b.writeUInt32LE(0x4e4f534a,16);body.copy(b,20);return b;}
const minimal={asset:{version:'2.0'},accessors:[{count:300}],meshes:[{primitives:[{attributes:{POSITION:0}}]}]};
test('rejects invalid model containers',()=>assert.throws(()=>inspectGLB(Buffer.from('not a model'))));
test('rejects external resources before browser loading',()=>assert.throws(()=>inspectGLB(glb({...minimal,images:[{uri:'https://example.com/track'}]})),/External/));
test('enforces geometry budget',()=>assert.throws(()=>inspectGLB(glb({...minimal,accessors:[{count:900000}]})),/budget/));
test('reports checks without claiming visual approval',()=>{const r=inspectGLB(glb(minimal));assert.equal(r.triangles,100);assert.match(r.status,/visual review required/);assert.equal(r.animations,0);});
