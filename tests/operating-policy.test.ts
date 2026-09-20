import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControllerStore } from '../server/store';
import { defaultOperatingPolicy, OperatingPolicy } from '../server/operating-policy';
import { ExplorationSpec } from '../contracts/exploration';
const cleanup: (()=>void)[]=[];
afterEach(()=>{vi.useRealTimers();for(const fn of cleanup.splice(0))fn();});
function setup(){const dir=mkdtempSync(join(tmpdir(),'policy-test-'));const path=join(dir,'db');const store=new ControllerStore(path);cleanup.push(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {store,path};}
function policy(){return {...defaultOperatingPolicy(),paused:false,totalAcu:20,dailyAcu:4,sessionAcu:2};}
function spec(){return ExplorationSpec.parse({schemaVersion:1,id:randomUUID(),repository:'example/app',baseSha:'a'.repeat(40),maxAcu:2,minutes:5,focus:'Test history',createdAt:new Date().toISOString(),deadline:new Date(Date.now()+300000).toISOString(),mode:'ui-fixture',promptHash:'a'.repeat(64)});}
it('defaults paused, validates ceilings and requires explicit testing repository',()=>{
 expect(defaultOperatingPolicy().paused).toBe(true);
 expect(()=>OperatingPolicy.parse({...policy(),maxConcurrentSessions:21})).toThrow();
 expect(OperatingPolicy.parse({...policy(),maxConcurrentSessions:20}).maxConcurrentSessions).toBe(20);
 expect(()=>OperatingPolicy.parse({...policy(),dailyAcu:1})).toThrow();
 expect(()=>OperatingPolicy.parse({...policy(),proactiveTests:true})).toThrow();
 expect(()=>OperatingPolicy.parse({...policy(),dailyAcu:NaN})).toThrow();
});
it('persists revision and rejects stale saves across store connections',()=>{
 const {store,path}=setup();const peer=new ControllerStore(path);try{
 expect(store.saveOperatingPolicy({revision:0,policy:policy()}).revision).toBe(1);
 expect(()=>peer.saveOperatingPolicy({revision:0,policy:policy()})).toThrow('Settings changed');
 expect(peer.operatingPolicy()?.revision).toBe(1);
 expect(peer.saveOperatingPolicy({revision:1,policy:{...policy(),paused:true}}).revision).toBe(2);
 }finally{peer.close();}
});
it('rejects paused, expired and oversized reservations without inserting them',()=>{
 vi.useFakeTimers();const {store}=setup();const p=policy();store.saveOperatingPolicy({revision:0,policy:{...p,paused:true}});
 expect(()=>store.reserveExploration(spec())).toThrow('paused');
 store.saveOperatingPolicy({revision:1,policy:p});expect(()=>store.reserveExploration({...spec(),maxAcu:3})).toThrow('ceiling');
 vi.setSystemTime(Date.parse(p.expiresAt)+1);expect(()=>store.reserveExploration(spec())).toThrow('expired');expect(store.explorations()).toHaveLength(0);
});
it('charges ceilings not optimistic usage and prevents another daily reservation',()=>{
 const {store}=setup();store.saveOperatingPolicy({revision:0,policy:policy()});
 for(let i=0;i<2;i++){const s=spec();store.reserveExploration(s);store.updateExploration(s.id,{state:'stopped',usageAcu:0.1});}
 expect(store.operatingBudget()).toMatchObject({committedAcu:4,remainingAcu:0});
 expect(store.operatingBudget().accounting).toContain('not billed spend');
 expect(()=>store.reserveExploration(spec())).toThrow('Daily');
});
it('only one overlapping contender reserves and duplicate replay charges once',async()=>{
 const {store,path}=setup();store.saveOperatingPolicy({revision:0,policy:policy()});const peer=new ControllerStore(path);const a=spec(),b=spec();try{
 const outcomes=await Promise.allSettled([Promise.resolve().then(()=>store.reserveExploration(a)),Promise.resolve().then(()=>peer.reserveExploration(b))]);
 expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(store.reserveExploration(a).claimed).toBe(false);expect(store.operatingBudget().committedAcu).toBe(2);
 }finally{peer.close();}
});
it('carries unresolved ceilings across midnight and retains them on the day they stop',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T23:55:00Z'));const {store}=setup();store.saveOperatingPolicy({revision:0,policy:policy()});const s=spec();store.reserveExploration(s);
 vi.setSystemTime(new Date('2026-09-21T00:05:00Z'));expect(store.operatingBudget().committedAcu).toBe(2);
 store.updateExploration(s.id,{state:'stopped',usageAcu:3});expect(store.operatingBudget().committedAcu).toBe(3);
 vi.setSystemTime(new Date('2026-09-22T00:05:00Z'));expect(store.operatingBudget().committedAcu).toBe(0);
});
it('does not trust caller-created timestamps or permit changing reservation amounts',()=>{
 const {store}=setup();store.saveOperatingPolicy({revision:0,policy:policy()});const s={...spec(),createdAt:'2000-01-01T00:00:00Z'};store.reserveExploration(s);store.updateExploration(s.id,{state:'stopped'});
 expect(store.operatingBudget().committedAcu).toBe(2);expect(()=>store.updateExploration(s.id,{spec:{...s,maxAcu:0}})).toThrow('immutable');
});
it('rejects expiry outside the explicit bounded authorization window',()=>{
 const {store}=setup();for(const expiresAt of [new Date(Date.now()-1000).toISOString(),new Date(Date.now()+32*86400000).toISOString()])expect(()=>store.saveOperatingPolicy({revision:0,policy:{...policy(),expiresAt}})).toThrow('31 days');
});
it('allows explicit parallel slots but counts ambiguous and held sessions until stopped',()=>{
 const {store}=setup();store.saveOperatingPolicy({revision:0,policy:{...policy(),maxConcurrentSessions:3,dailyAcu:10}});
 const runs=[spec(),spec(),spec()];for(const s of runs)store.reserveExploration(s);
 store.updateExploration(runs[0].id,{state:'held'});store.updateExploration(runs[1].id,{state:'unknown_outcome'});
 expect(()=>store.reserveExploration(spec())).toThrow('capacity');
 store.updateExploration(runs[2].id,{state:'stopped'});expect(store.reserveExploration(spec()).claimed).toBe(true);
 expect(store.operatingBudget().committedAcu).toBe(8);
});
it('parallel slots never relax the daily ceiling',()=>{
 const {store}=setup();store.saveOperatingPolicy({revision:0,policy:{...policy(),maxConcurrentSessions:8}});
 store.reserveExploration(spec());store.reserveExploration(spec());expect(()=>store.reserveExploration(spec())).toThrow('Daily');
});
it('total authorization survives midnight and policy edits without resetting its start',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T22:00:00Z'));const {store}=setup();
 const p={...policy(),totalAcu:2,expiresAt:'2026-09-23T22:00:00Z'};
 const initial=store.saveOperatingPolicy({revision:0,policy:p});
 const s=spec();store.reserveExploration(s);store.updateExploration(s.id,{state:'stopped',usageAcu:0.1});
 vi.setSystemTime(new Date('2026-09-21T01:00:00Z'));
 const edited=store.saveOperatingPolicy({revision:1,policy:{...p,reviewMinutes:1}});
 expect(edited.budgetStartedAt).toBe(initial.budgetStartedAt);
 expect(store.operatingBudget()).toMatchObject({committedAcu:0,totalCommittedAcu:2,totalRemainingAcu:0});
 expect(()=>store.reserveExploration(spec())).toThrow('Total');
});
it('an active policy requires an explicit finite total authorization',()=>{
 expect(()=>OperatingPolicy.parse({...policy(),totalAcu:undefined})).toThrow('Total');
 expect(defaultOperatingPolicy().totalAcu).toBe(0);
});
