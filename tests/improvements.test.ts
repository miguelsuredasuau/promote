import {it,expect,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ControllerStore} from '../server/store';
import {hashCanonical} from '../contracts/hash';
import {decisionRevision} from '../server/owner-decisions';
import {executeImprovement,improvementExecution,ExecutionInput} from '../server/improvements';
const opened:{root:string;store:ControllerStore}[]=[];
afterEach(()=>{for(const x of opened.splice(0)){x.store.close();rmSync(x.root,{recursive:true,force:true});}});
function setup(){const root=mkdtempSync(join(tmpdir(),'improvements-'));mkdirSync(join(root,'.local'));const store=new ControllerStore(join(root,'db'));opened.push({root,store});const source='project-analysis:xarts:test';store.ingest(source,hashCanonical({test:true}),{summary:'real evidence fixture'},null);store.triageRecord(source,[{id:'proposal-test',title:'Improve test chart',category:'feature',priority:50,evidenceKey:source,nextAction:'Fix only the reproduced label'}],hashCanonical('test'));return{root,store,proposal:store.proposals()[0]};}
it('does not advertise execution for a proposal with no exact scoped task',()=>{const {root,store,proposal}=setup();expect(improvementExecution(root,store,proposal)).toMatchObject({canExecute:false,status:'scope_required'});expect(store.engineeringReservations()).toHaveLength(0);});
it('rejects stale evidence before looking up or launching a task',async()=>{const {root,store,proposal}=setup();await expect(executeImprovement(root,store,{proposalId:proposal.id,revision:'0'.repeat(64),taskHash:'1'.repeat(64)})).rejects.toThrow('proposal_revision_changed');expect(store.engineeringReservations()).toHaveLength(0);});
it('rejects missing bindings even when the proposal revision is current',async()=>{const {root,store,proposal}=setup();await expect(executeImprovement(root,store,{proposalId:proposal.id,revision:decisionRevision(proposal),taskHash:'1'.repeat(64)})).rejects.toThrow('execution_scope_changed');expect(store.engineeringReservations()).toHaveLength(0);});
it('does not accept client-supplied budget or delivery authority',()=>{expect(ExecutionInput.safeParse({proposalId:'x',revision:'a'.repeat(64),taskHash:'b'.repeat(64),maxAcu:1000,release:true}).success).toBe(false);});
it('rejects a malformed execution config instead of guessing a task',()=>{const {root,store,proposal}=setup();writeFileSync(join(root,'.local/improvement-executions.json'),'[{"proposalId":"proposal-test"}]');expect(()=>improvementExecution(root,store,proposal)).toThrow();expect(store.engineeringReservations()).toHaveLength(0);});
