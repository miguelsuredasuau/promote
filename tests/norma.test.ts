import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { reviewCandidate, runNormaReview } from '../server/norma-review';
import type { NormaConnection } from '../adapters/norma';
import { ControllerStore } from '../server/store';
const roots:string[]=[];
afterEach(()=>roots.splice(0).forEach(root=>rmSync(root,{recursive:true,force:true})));
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'norma-'));roots.push(root);
 const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init']);git(['config','user.name','Test']);git(['config','user.email','test@example.test']);git(['remote','add','origin','https://github.com/test/repo']);
 writeFileSync(join(root,'a.ts'),'export const value=1;');git(['add','.']);git(['commit','-m','base']);const baseSha=git(['rev-parse','HEAD']);
 writeFileSync(join(root,'a.ts'),'export const value=2;');git(['add','.']);git(['commit','-m','candidate']);const candidateSha=git(['rev-parse','HEAD']);
 return {root,git,input:{checkout:root,repo:'test/repo',baseSha,candidateSha}};
}
function connection(result:unknown={outcome:'clean',coverage:{reduced:false},rulesets_evaluated:['ts']}){
 return {close:vi.fn(),call:vi.fn(async(name:string)=>{
  if(name==='link_repository')return{outcome:'linked'};
  if(name==='get_rulesets')return{rulesets:[{ruleset_id:'ts',version:'1'}]};
  if(name==='get_rules_for_ruleset')return[{id:'test-rule',version:'1'}];
  return result;
 })} as NormaConnection & {call:ReturnType<typeof vi.fn>};
}
it('reviews frozen git bytes, not dirty working tree, and binds rule hashes',async()=>{
 const f=fixture();writeFileSync(join(f.root,'a.ts'),'do not send this dirty content');const c=connection();
 const r=await reviewCandidate(f.input,c,AbortSignal.timeout(5000));
 expect(r.status).toBe('clean');expect(r.rules.ts.sha256).toMatch(/^[a-f0-9]{64}$/);
 expect(c.call.mock.calls.find(x=>x[0]==='live_check')?.[1]).toEqual({file_name:'a.ts',file_content:'export const value=2;',max_issues:100});
});
it.each([
 {outcome:'clean',coverage:{reduced:true},rulesets_evaluated:['ts']},
 {outcome:'clean',rulesets_evaluated:['ts']},
 {outcome:'issues',coverage:{reduced:false},rulesets_evaluated:['ts'],total_issues:5,issues:[],capped:true},
 {outcome:'clean',coverage:{reduced:false},rulesets_evaluated:['unrecorded']},
 {outcome:'refused'}, {outcome:'not_checkable'}, {unexpected:'malformed'},
])('never converts incomplete checks into a clean result: %j',async(result)=>{
 const f=fixture();expect((await reviewCandidate(f.input,connection(result),AbortSignal.timeout(5000))).status).toBe('pending');
});
it('preserves findings when coverage is reduced',async()=>{
 const f=fixture();const r=await reviewCandidate(f.input,connection({outcome:'issues',coverage:{reduced:true},total_issues:1,issues:[{rule_id:'warning',line:1}],rulesets_evaluated:['ts']}),AbortSignal.timeout(5000));
 expect(r.status).toBe('pending');expect(r.totalIssues).toBe(1);expect(r.files[0].findings?.[0].ruleId).toBe('warning');
});
it('marks drift and transport failure pending without leaking provider errors',async()=>{
 const f=fixture();const c=connection();let n=0;const original=c.call.getMockImplementation()! as (...args:unknown[])=>Promise<unknown>;
 c.call.mockImplementation(async(name:string,args:unknown)=>name==='get_rules_for_ruleset'?[{id:String(n++)}]:original(name,args));
 expect((await reviewCandidate(f.input,c,AbortSignal.timeout(5000))).reason).toBe('rules_changed');
 c.call.mockRejectedValue(Error('a provider response containing sensitive data'));
 const r=await reviewCandidate(f.input,c,AbortSignal.timeout(5000));expect(r.status).toBe('pending');expect(JSON.stringify(r)).not.toContain('sensitive');
});
it('does not read symlink targets or send credential files',async()=>{
 const f=fixture();symlinkSync('/etc/passwd',join(f.root,'link.ts'));writeFileSync(join(f.root,'credentials.ts'),'private content');f.git(['add','.']);f.git(['commit','-m','paths']);f.input.candidateSha=f.git(['rev-parse','HEAD']);
 const c=connection(),r=await reviewCandidate(f.input,c,AbortSignal.timeout(5000));expect(c.call.mock.calls.filter(x=>x[0]==='live_check')).toHaveLength(1);
 expect(r.files.find(x=>x.path==='link.ts')?.reason).toBe('not_regular_blob');expect(r.files.find(x=>x.path==='credentials.ts')?.status).toBe('excluded');
});
it('reports a wrong repository before any source is sent',async()=>{
 const f=fixture(),c=connection();f.input.repo='different/repo';const r=await reviewCandidate(f.input,c,AbortSignal.timeout(5000));
 expect(r.reason).toBe('repository_mismatch');expect(c.call).not.toHaveBeenCalled();
});
it('persists missing authentication as pending advisory evidence',async()=>{
 const f=fixture();mkdirSync(join(f.root,'.local'));writeFileSync(join(f.root,'.local/norma.json'),JSON.stringify({enabled:true,repositories:['test/repo'],credentialSource:'env'}));
 const previous=process.env.NORMA_ACCESS_TOKEN;delete process.env.NORMA_ACCESS_TOKEN;
 const store=new ControllerStore(join(f.root,'.local/controller.sqlite'));
 try{const r=await runNormaReview(store,f.root,f.input,'test-incident');expect(r.status).toBe('pending');expect(r.reason).toBe('authentication_required');
 const dir=join(f.root,'.local/norma-reviews');expect(JSON.parse(readFileSync(join(dir,readdirSync(dir)[0]),'utf8')).candidateSha).toBe(f.input.candidateSha);
 }finally{store.close();if(previous!==undefined)process.env.NORMA_ACCESS_TOKEN=previous;}
});
