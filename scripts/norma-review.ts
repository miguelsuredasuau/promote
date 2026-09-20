import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ControllerStore } from '../server/store';
import { runNormaReview } from '../server/norma-review';
const [checkout,repo,baseSha,candidateSha]=process.argv.slice(2);
if(!checkout||!repo||!baseSha||!candidateSha||!/^\w[\w.-]*\/[\w.-]+$/.test(repo)||![baseSha,candidateSha].every(x=>/^[a-f0-9]{40}$/.test(x))){
 console.error('Usage: pnpm norma:review <checkout> <owner/repo> <base-sha> <candidate-sha>');process.exit(1);
}
const root=resolve(import.meta.dirname,'..');await mkdir(resolve(root,'.local'),{recursive:true});
const store=new ControllerStore(resolve(root,'.local/controller.sqlite'));
try{
 const result=await runNormaReview(store,root,{checkout:resolve(checkout),repo,baseSha,candidateSha},`norma-manual-${candidateSha.slice(0,12)}`);
 console.log(JSON.stringify({status:result.status,reason:result.reason??null,candidateSha:result.candidateSha,files:result.files.length,findings:result.totalIssues,mode:result.mode}));
 process.exitCode=result.status==='pending'||result.status==='disabled'?2:0;
}finally{store.close();}
