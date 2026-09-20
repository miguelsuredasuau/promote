import {mkdir,readFile,writeFile,rename,open,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {ControllerStore} from './store';
import type {DeliveryTask} from './xarts-delivery';
const exec=promisify(execFile);
export async function replayPublishedChart(root:string,store:ControllerStore,task:DeliveryTask,releaseId:string){
 if(!/^[A-Za-z0-9._-]+$/.test(releaseId))throw Error('invalid_release_id');
 const dir=join(root,'.local/chat-replays');await mkdir(dir,{recursive:true});const path=join(dir,releaseId+'.json');
 try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const intent={status:'running',runId:new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/, '')+'-'+randomUUID().slice(0,8),releaseId,chatRoot:task.chatRoot,sourceRunId:task.runId,chartId:task.chartId,registry:task.registry,requiredTextFormat:task.requiredTextFormat};
 const intentFile=path+'.'+randomUUID()+'.tmp';const handle=await open(intentFile,'wx');try{await handle.writeFile(JSON.stringify(intent,null,2));await handle.sync();}finally{await handle.close();}
 try{await link(intentFile,path);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;return JSON.parse(await readFile(path,'utf8'));}finally{await unlink(intentFile);}
 store.recordActivity('verification','Replaying the original chart through Xarts Chat with the published package',{releaseId,runId:intent.runId,sourceRunId:task.runId});
 let receipt;
 try{const {stdout}=await exec(process.execPath,[join(root,'adapters/xarts/replay-chat.mjs'),path],{cwd:root,timeout:180000,killSignal:'SIGKILL',maxBuffer:1024*1024});receipt={...intent,...JSON.parse(stdout.trim().split('\n').at(-1)!),status:'confirmed',observedAt:new Date().toISOString()};store.recordActivity('release','Xarts Chat confirmed the published improvement with the original SQL data',{releaseId,runId:receipt.runId,dataHash:receipt.dataHash});}
 catch{receipt={...intent,status:'blocked',reason:'chat_replay_failed',nextAction:'Inspect the saved replay run; do not report adoption or retry blindly.'};store.recordActivity('verification','Published package awaits chat replay verification',{releaseId,runId:intent.runId,reason:'chat_replay_failed'});}
 await writeFile(path+'.tmp',JSON.stringify(receipt,null,2));await rename(path+'.tmp',path);return receipt;
}
