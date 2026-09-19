import{test}from'node:test';import assert from'node:assert/strict';import{validateApproval,requirements}from'./concept.mjs';
const v={status:'ready',sha256:'current'};const checked=requirements.map(([id])=>id);
test('requires a completed image',()=>assert.throws(()=>validateApproval({...v,status:'generating'},{hash:'current',checked}),/completed/));
test('rejects approval of stale image',()=>assert.throws(()=>validateApproval(v,{hash:'old',checked}),/revision/));
test('requires all components to be confirmed',()=>assert.throws(()=>validateApproval(v,{hash:'current',checked:checked.slice(1)}),/every mandatory/));
test('accepts current revision and complete checklist',()=>assert.doesNotThrow(()=>validateApproval(v,{hash:'current',checked})));

import {modelInput,queueBase} from './concept.mjs';
test('rejects arbitrary provider endpoints',()=>assert.throws(()=>modelInput('unknown','prompt',[]),/Unsupported/));
test('Nano Banana uses reference images and its resolution schema',()=>{const p=modelInput('fal-ai/nano-banana-pro/edit','brief',['reference']);assert.equal(p.resolution,'2K');assert.deepEqual(p.image_urls,['reference']);assert.equal(p.num_images,1);assert.equal(p.image_size,undefined);});
test('GPT uses one high quality image and the correct queue namespace',()=>{assert.equal(modelInput('openai/gpt-image-2.5/flare/edit','brief',[]).quality,'high');assert.equal(queueBase('openai/gpt-image-2.5/flare/edit'),'https://queue.fal.run/openai/gpt-image-2.5');});
test('legacy Flux requests retain their queue namespace',()=>assert.equal(queueBase('fal-ai/flux-2-pro/edit'),'https://queue.fal.run/fal-ai/flux-2-pro'));
