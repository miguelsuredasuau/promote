import {test} from 'node:test';import assert from 'node:assert/strict';import {missingItems} from './items.mjs';
const custom={id:'ceo',method:'Generate',shared:false};
test('batch skips defaults, exact artwork and existing assets',()=>assert.deepEqual(missingItems([custom,{id:'desk',shared:true},{id:'logo',method:'Code-built'},{id:'engineer',pilot:{state:'ready'}}]).map(a=>a.id),['ceo']));
test('explicit new design includes a previously reusable asset',()=>assert.equal(missingItems([{id:'desk',shared:true,choice:'generate'}]).length,1));
test('existing failed or pending jobs are never resubmitted by generate missing',()=>{for(const status of ['failed','submitting','queued','ready'])assert.equal(missingItems([custom],[{itemId:'ceo',status}]).length,0);});
test('reuse selection excludes a custom item',()=>assert.equal(missingItems([{...custom,choice:'reuse'}]).length,0));
import {selectItemBatch} from './items.mjs';
test('targeted regeneration preserves existing versions and refuses active duplicates',()=>{
 const jobs=[{itemId:'ceo',status:'ready'}];assert.equal(selectItemBatch([custom],jobs,{itemIds:['ceo'],regenerate:true}).length,1);assert.equal(jobs.length,1);
 assert.throws(()=>selectItemBatch([custom],jobs,{itemIds:['ceo']}));
 assert.throws(()=>selectItemBatch([custom],[{itemId:'ceo',status:'queued'}],{itemIds:['ceo'],regenerate:true}));
 assert.throws(()=>selectItemBatch([{id:'brand',method:'Code-built'}],[],{itemIds:['brand'],regenerate:true}));
});
