// Actual chat MCP render, using the accepted installed package and original SQL.
// No model call, no fixture rendering, and no client-supplied numeric data.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {checkNegativeCurrency} from './currency-check.mjs';
const [configFile]=process.argv.slice(2),config=JSON.parse(readFileSync(configFile,'utf8'));
const {chatRoot,sourceRunId,chartId,registry,releaseId,runId,requiredTextFormat}=config;
const moduleAt=path=>import(pathToFileURL(join(chatRoot,path)).href);
const {resolveRelease,ensureInstalled,describeRelease}=await moduleAt('lib/release.mjs');
const {buildRecord,writeRecord}=await moduleAt('server/record.mjs');
const {appendProgress}=await moduleAt('lib/journal.mjs');
const source=join(chatRoot,'runs',sourceRunId),original=JSON.parse(readFileSync(join(source,'record.json'),'utf8'));
const spec=JSON.parse(readFileSync(join(source,chartId+'.spec.json'),'utf8')),saved=JSON.parse(readFileSync(join(source,chartId+'.data.json'),'utf8'));
assert.ok(!Object.hasOwn(spec,'data'),'SQL provenance required');
const resolved=resolveRelease({promote:registry});assert.equal(resolved.kind,'promote');assert.equal(resolved.releaseId,releaseId);
const accepted=JSON.parse(readFileSync(join(registry,'releases',releaseId+'.json'),'utf8'));
const pkg=ensureInstalled(resolved),release=describeRelease(resolved),runDir=join(chatRoot,'runs',runId),startedAt=new Date().toISOString(),conversationId=randomUUID();
mkdirSync(runDir,{recursive:true});appendProgress(runId,{t:'request',conversationId,message:original.request.message,replayOf:sourceRunId,runner:'promote-exact-replay'});
appendProgress(runId,{t:'release',release});
const transport=new StdioClientTransport({command:process.execPath,args:['--no-warnings',join(chatRoot,'mcp/xarts-tools.mjs')],env:{...process.env,XARTS_PKG_DIR:pkg,XARTS_RUN_DIR:runDir,XARTS_CHAT_DB:join(chatRoot,'data/finance.sqlite')},stderr:'pipe'});
const client=new Client({name:'promote-exact-replay',version:'1.0.0'});let result;
try{await client.connect(transport);result=await client.callTool({name:'chart_render',arguments:{spec,sql:saved.sql}},undefined,{timeout:120000});}finally{await client.close();}
assert.ok(!result.isError,'chat render failed');
const log=readFileSync(join(runDir,'tools.jsonl'),'utf8').trim().split('\n').map(JSON.parse).find(r=>r.tool==='chart_render');
assert.ok(log&&!log.error&&!log.rejected,'successful chat tool result required');assert.ok(!(log.checks??[]).some(c=>c.status==='fail'),'chat readback check failed');assert.equal(log.dataHash,saved.dataHash,'original SQL data changed');assert.equal(log.svgHash,accepted.outputArtifactHash,'chat output differs from accepted replay');
if(requiredTextFormat==='negative_currency_sign_before_prefix')checkNegativeCurrency(readFileSync(join(runDir,log.artifact+'.svg'),'utf8'),spec,saved.rows);
const record=buildRecord({runId,conversationId,message:original.request.message,release,session:null,result:null,exitCode:0,stderr:'',startedAt,finalText:'Repetición exacta del gráfico original con la versión publicada por Promote. Mismo SQL y mismos datos; el signo monetario negativo aparece antes de €. Ejecución determinista del render, sin llamada a Claude.',aborted:false});
record.agent={completion:'confirmed',runner:'promote-exact-replay',sessionId:null,model:null,tools:'mcp__xarts chart_render',usage:null};
record.replay={sourceRunId,sourceArtifact:chartId,initiatedBy:'promote_controller',dataHash:saved.dataHash,releaseId};
writeRecord(record);appendProgress(runId,{t:'record',outcome:record.outcome,replay:record.replay});appendProgress(runId,{t:'end'});
console.log(JSON.stringify({runId,releaseId,dataHash:log.dataHash,svgHash:log.svgHash,artifact:log.artifact,outcome:record.outcome,shims:release.shims,runner:'promote-exact-replay'}));
