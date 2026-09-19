import {startItems,resumeItems} from './items.mjs';
import {roomCommand,roomState,resumeRoom} from './concept.mjs';
import {randomBytes} from 'node:crypto';
import {progress,decide,saveDraft} from './progress.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {root,dir,load} from './pipeline.mjs';
const port=4311;
const token=randomBytes(32).toString('hex');
const staticFiles=new Map([['/studio.hdr',['web/assets/studio/studio-small-09.hdr','application/octet-stream']],['/vendor/HDRLoader.js',['node_modules/three/examples/jsm/loaders/HDRLoader.js','text/javascript']],['/vendor/SkeletonUtils.js',['node_modules/three/examples/jsm/utils/SkeletonUtils.js','text/javascript']],['/',['web/studio/board.html','text/html']],['/item-viewer.js',['web/studio/item-viewer.js','text/javascript']],['/board.js',['web/studio/board.js','text/javascript']],['/board.css',['web/studio/board.css','text/css']],['/vendor/three.module.js',['node_modules/three/build/three.module.js','text/javascript']],['/vendor/three.core.js',['node_modules/three/build/three.core.js','text/javascript']],['/vendor/GLTFLoader.js',['node_modules/three/examples/jsm/loaders/GLTFLoader.js','text/javascript']],['/vendor/BufferGeometryUtils.js',['node_modules/three/examples/jsm/utils/BufferGeometryUtils.js','text/javascript']],['/vendor/OrbitControls.js',['node_modules/three/examples/jsm/controls/OrbitControls.js','text/javascript']]]);
createServer(async(req,res)=>{
 const host=req.headers.host;if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`){res.writeHead(403).end();return;}
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 try{
 const url=new URL(req.url,`http://${host}`);
 if(req.method==='POST'&&['/decisions','/room-command','/draft','/generate-items'].includes(url.pathname)){
  if(req.headers.origin!==`http://${host}`||req.headers['x-studio-token']!==token){res.writeHead(403).end();return;}
  let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>12000){res.writeHead(413).end();return;}body+=chunk;}
  res.setHeader('Content-Type','application/json');try{res.end(JSON.stringify(await (url.pathname==='/generate-items'?startItems:url.pathname==='/room-command'?roomCommand:url.pathname==='/draft'?saveDraft:decide)(JSON.parse(body))));}catch(error){res.writeHead(409).end(JSON.stringify({error:error.message}));}return;
 }
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(url.pathname==='/preview'){res.writeHead(302,{Location:'/'}).end();return;}
 if(/^\/model-[0-9a-f-]{36}\.glb$/.test(url.pathname)){res.setHeader('Content-Type','model/gltf-binary');res.end(await readFile(join(dir,url.pathname.slice(1))));return;}
 if(/^\/(?:item|render)-[0-9a-f-]{36}\.png$/.test(url.pathname)){res.setHeader('Content-Type','image/png');res.end(await readFile(join(dir,url.pathname.slice(1))));return;}
 if(/^\/room-v[1-9][0-9]*\.png$/.test(url.pathname)){res.setHeader('Content-Type','image/png');res.end(await readFile(join(dir,url.pathname.slice(1))));return;}
 if(url.pathname==='/project-logo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(await readFile(join(process.env.PROMOTE_PROJECT_PATH??join(root,'..','xarts by anlak'),'xarts.svg')));return;}
 if(/^\/native-(room|ticker)\.png$/.test(url.pathname)){res.setHeader('Content-Type','image/png');res.end(await readFile(join(dir,url.pathname.slice(1))));return;}
 if(url.pathname==='/brand-reference.png'){res.setHeader('Content-Type','image/png');res.end(await readFile(join(dir,'references','logo.png')));return;}
 if(url.pathname==='/progress'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...await progress(),token}));return;}
 if(/^\/previews\/(chair|engineer)\.png$/.test(url.pathname)){res.setHeader('Content-Type','image/png');res.end(await readFile(join(dir,url.pathname.split('/').at(-1).replace('.png','-provider-preview.png'))));return;}

 if(url.pathname==='/state'){const state=await load();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state??{assets:[],brief:null}));return;}
 if(/^\/assets\/(chair|engineer)\.glb$/.test(url.pathname)){res.setHeader('Content-Type','model/gltf-binary');res.end(await readFile(join(dir,url.pathname.split('/').at(-1))));return;}
 const entry=staticFiles.get(url.pathname);if(!entry){res.writeHead(404).end();return;}
 let data=await readFile(join(root,entry[0]));if(url.pathname.startsWith('/vendor/'))data=Buffer.from(data.toString().replaceAll("from 'three'","from '/vendor/three.module.js'").replaceAll("'../utils/BufferGeometryUtils.js'","'/vendor/BufferGeometryUtils.js'").replaceAll("'../utils/SkeletonUtils.js'","'/vendor/SkeletonUtils.js'"));res.setHeader('Content-Type',entry[1]);res.end(data);
 }catch{res.writeHead(404).end('Not available');}
}).listen(port,'127.0.0.1',()=>{console.log(`Asset studio: http://127.0.0.1:${port}`);void resumeRoom();void resumeItems();});
