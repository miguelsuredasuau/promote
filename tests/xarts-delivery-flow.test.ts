import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ControllerStore } from '../server/store';
import { runXartsDelivery } from '../server/xarts-delivery';
import { prepareXartsImage, validateXartsBuild, validateXartsConsumer } from '../server/xarts-validation';
vi.mock('../server/xarts-validation',()=>({prepareXartsImage:vi.fn(),validateXartsBuild:vi.fn(),validateXartsConsumer:vi.fn()}));
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const roots:string[]=[],stores:ControllerStore[]=[];
afterEach(()=>{stores.splice(0).forEach(s=>s.close());roots.splice(0).forEach(r=>rmSync(r,{recursive:true,force:true}));vi.resetAllMocks();});
function setup(){
 const root=mkdtempSync(join(tmpdir(),'delivery-flow-'));roots.push(root);
 const write=(path:string,value:string)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),value);};
 for(const file of ['server/xarts-delivery.ts','server/xarts-validation.ts','server/container-runner.ts','adapters/xarts/build-worker.mjs','adapters/xarts/consumer-worker.mjs','adapters/xarts/currency-check.mjs'])write(file,'// fixture evaluator');
 write('lib/sql.mjs','export const runSelect=(db,sql)=>({rows:db.prepare(sql).all().map(r=>({...r})),truncated:false});');
 write('runs/run-1/chart-1.spec.json',JSON.stringify({chartId:'bar'}));
 const rows=[{value:42}];write('runs/run-1/chart-1.data.json',JSON.stringify({sql:'SELECT 42 AS value',rows,rowCount:1,dataHash:hash(JSON.stringify(rows))}));
 mkdirSync(join(root,'data'));const db=new DatabaseSync(join(root,'data/finance.sqlite'));db.close();
 const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);git(['add','.']);git(['commit','-m','fixture']);git(['remote','add','origin','https://github.com/fixture/library']);
 const sha=git(['rev-parse','HEAD']);const store=new ControllerStore(join(root,'controller.sqlite'));stores.push(store);
 const task={schemaVersion:1,checkout:root,repo:'fixture/library',candidateSha:sha,baseSha:sha,chatRoot:root,runId:'run-1',chartId:'chart-1',registry:join(root,'registry'),allowedPaths:['core'],protectedPaths:['docs']};
 const evidence=(outputs:Record<string,string>)=>{
  const dir=join(root,'.local/xarts-validation',task.candidateSha,'artifacts');mkdirSync(dir,{recursive:true});
  const artifactIds=Object.entries({log:'test log',...outputs}).map(([key,bytes])=>{const digest=hash(bytes);writeFileSync(join(dir,digest),bytes);return key==='log'?`log:${digest}`:`output:${key}:${digest}`;});
  return{runId:'fixture-run',planId:'fixture-plan',runnerIdentity:'fixture-isolation-port',isolation:'container' as const,exitCode:0,outcome:'completed' as const,durationMs:1,artifactIds,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()};
 };
 vi.mocked(prepareXartsImage).mockResolvedValue(`sha256:${'a'.repeat(64)}`);
 vi.mocked(validateXartsBuild).mockImplementation(async()=>evidence({package:'fixture package',manifest:'{}'}));
 vi.mocked(validateXartsConsumer).mockImplementation(async()=>evidence({svg:'<svg/>',report:'{}'}));
 return{root,store,task,evidence};
}
it('activates only the accepted package and makes repeated delivery idempotent',async()=>{
 const s=setup();const first=await runXartsDelivery(s.store,s.root,s.task);
 expect(first.state).toBe('completed');expect(s.store.getIncident(first.result.incidentId)?.status).toBe('completed');
 const active=JSON.parse(readFileSync(join(s.task.registry,'active.json'),'utf8'));
 expect(active.releaseId).toBe(first.result.releaseId);
 const second=await runXartsDelivery(s.store,s.root,s.task);expect(second.result.reason).toBe('release_already_activated');
 expect(validateXartsBuild).toHaveBeenCalledTimes(1);expect(s.store.engineeringReservations()).toHaveLength(0);
});
it('a standalone failure persists a blocked incident and never publishes',async()=>{
 const s=setup();vi.mocked(validateXartsConsumer).mockImplementation(async()=>({...s.evidence({}),exitCode:1}));
 const result=await runXartsDelivery(s.store,s.root,s.task);
 expect(result).toMatchObject({state:'blocked',result:{reason:'standalone_or_regeneration_not_accepted'}});
 expect(existsSync(join(s.task.registry,'active.json'))).toBe(false);
 expect(s.store.incidentEvents(result.result.incidentId).filter(e=>e.type==='gate.finished')).toHaveLength(3);
});
it('cancellation during verification prevents activation',async()=>{
 const s=setup();vi.mocked(validateXartsConsumer).mockImplementation(async()=>{
  const incident=s.store.operatorSnapshot().incidents[0];s.store.cancel(incident.id,incident.revision,'human:test');
  return s.evidence({svg:'<svg/>',report:'{}'});
 });
 const result=await runXartsDelivery(s.store,s.root,s.task);
 expect(result.state).toBe('blocked');expect(existsSync(join(s.task.registry,'active.json'))).toBe(false);
});
it('changed SQL data is refused before building or creating a release',async()=>{
 const s=setup();writeFileSync(join(s.root,'runs/run-1/chart-1.data.json'),JSON.stringify({sql:'SELECT 99 AS value',rowCount:1,dataHash:'a'.repeat(64)}));
 await expect(runXartsDelivery(s.store,s.root,s.task)).rejects.toThrow('original_sql_data_changed');
 expect(validateXartsBuild).not.toHaveBeenCalled();
});

it('an unavailable advisory review is recorded without replacing required delivery gates',async()=>{
 const s=setup();mkdirSync(join(s.root,'.local'),{recursive:true});writeFileSync(join(s.root,'.local/norma.json'),'invalid configuration');
 const result=await runXartsDelivery(s.store,s.root,s.task);expect(result.state).toBe('completed');
 const reports=readdirSync(join(s.root,'.local/norma-reviews'));const report=JSON.parse(readFileSync(join(s.root,'.local/norma-reviews',reports[0]),'utf8'));
 expect(report.status).toBe('pending');expect(report.mode).toBe('advisory');expect(validateXartsBuild).toHaveBeenCalledTimes(1);expect(validateXartsConsumer).toHaveBeenCalledTimes(1);
});

/** A local bare "GitHub" behind the configured origin URL, reached through the same
 * `url.<base>.insteadOf` rewrite a credential proxy would use. */
function trunkFixture(){
 const s=setup();
 const git=(args:string[],cwd=s.root)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const bare=mkdtempSync(join(tmpdir(),'delivery-bare-'));roots.push(bare);git(['init','--bare','-b','main'],bare);
 git(['config',`url.${bare}.insteadOf`,'https://github.com/fixture/library']);
 git(['branch','-M','main']);
 mkdirSync(join(s.root,'docs'),{recursive:true});writeFileSync(join(s.root,'docs/guide.md'),'owner-merged doc');mkdirSync(join(s.root,'core'),{recursive:true});writeFileSync(join(s.root,'core/index.ts'),'export {}');
 git(['add','docs','core']);git(['commit','-m','merged by owner']);git(['push','origin','main']);
 s.task.candidateSha=git(['rev-parse','HEAD']);
 return{...s,git,bare};
}
it('releasing the trunk records owner-merged protected paths as evidence instead of refusing them',async()=>{
 const f=trunkFixture();
 await expect(runXartsDelivery(f.store,f.root,f.task)).rejects.toThrow('candidate_scope_violation');
 const result=await runXartsDelivery(f.store,f.root,{...f.task,trunk:'main'});
 expect(result).toMatchObject({state:'completed'});
 const gates=f.store.incidentEvents(result.result.incidentId).filter(e=>e.type==='gate.finished');
 expect(gates[0].payload).toMatchObject({result:{gateId:'protected.sourceAndSql',reason:'trunk_head_and_original_sql_verified'}});
});
it('a trunk release is refused when the remote already serves a different head',async()=>{
 const f=trunkFixture();
 writeFileSync(join(f.root,'core/later.ts'),'export {}');f.git(['add','core']);f.git(['commit','-m','later']);f.git(['push','origin','main']);
 await expect(runXartsDelivery(f.store,f.root,{...f.task,trunk:'main'})).rejects.toThrow('trunk_head_mismatch');
 expect(validateXartsBuild).not.toHaveBeenCalled();
});
