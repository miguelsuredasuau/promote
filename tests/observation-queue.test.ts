import {expect,it} from 'vitest';
import {observationQueue} from '../server/observation-queue';
const describe=(r:any)=>r;
const historical=(n:number)=>Array.from({length:n},(_,i)=>({key:`old-${i}`,terminal:true,remoteId:`remote-${i}`}));

it('puts every active session ahead of at most ten historical usage reads',()=>{
 const old=historical(200),active={key:'active',terminal:false,remoteId:'current'};
 const rows=observationQueue({},[...old,active],Date.now(),describe);
 expect(rows[0]).toBe(active);expect(rows).toHaveLength(11);
});
it('advances past failing historical attempts without fabricating provider evidence',()=>{
 const owner={},rows=historical(25),now=Date.now();
 expect(observationQueue(owner,rows,now,describe).map(r=>r.key)).toEqual(rows.slice(0,10).map(r=>r.key));
 expect(observationQueue(owner,rows,now+15000,describe).map(r=>r.key)).toEqual(rows.slice(10,20).map(r=>r.key));
 expect(observationQueue(owner,rows,now+30000,describe).map(r=>r.key)).toEqual(rows.slice(20).map(r=>r.key));
 expect(observationQueue(owner,rows,now+45000,describe)).toEqual([]);
 expect(observationQueue(owner,rows,now+60000,describe).map(r=>r.key)).toEqual(rows.slice(0,10).map(r=>r.key));
 expect(rows.every(r=>!Object.hasOwn(r,'observedAt'))).toBe(true);
});
it('respects persisted observation recency and selects the oldest eligible read',()=>{
 const now=Date.now(),rows=[
  {key:'fresh',terminal:true,remoteId:'one',observedAt:new Date(now-59000).toISOString()},
  {key:'recent',terminal:true,remoteId:'two',observedAt:new Date(now-60000).toISOString()},
  {key:'oldest',terminal:true,remoteId:'three',observedAt:new Date(now-120000).toISOString()},
  {key:'no-remote',terminal:true},
 ];
 expect(observationQueue({},rows,now,describe).map(r=>r.key)).toEqual(['oldest','recent']);
});
it('isolates attempt cooldowns between controller stores',()=>{
 const rows=historical(1),now=Date.now();
 expect(observationQueue({},rows,now,describe)).toHaveLength(1);
 expect(observationQueue({},rows,now,describe)).toHaveLength(1);
});
