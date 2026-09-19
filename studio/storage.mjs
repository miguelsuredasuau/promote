import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';

// SQLite owns metadata. Binary files stay local; legacy JSON remains a recovery copy.
export function openStorage(directory){
 mkdirSync(directory,{recursive:true});
 const db=new DatabaseSync(join(directory,'studio.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS documents(name TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS document_history(id INTEGER PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS asset_files(path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, modified_ms REAL NOT NULL, kind TEXT NOT NULL);`);
 function put(name,value){const body=JSON.stringify(value),now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{const old=db.prepare('SELECT body FROM documents WHERE name=?').get(name);if(old?.body!==body){db.prepare('INSERT INTO document_history(name,body,created_at) VALUES(?,?,?)').run(name,body,now);db.prepare('INSERT INTO documents VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(name,body,now);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 function get(name,fallback){const row=db.prepare('SELECT body FROM documents WHERE name=?').get(name);if(row)return JSON.parse(row.body);const file=join(directory,name+'.json');if(!existsSync(file))return fallback;const value=JSON.parse(readFileSync(file,'utf8'));put(name,value);return value;}
 function indexFiles(){function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){const full=join(path,entry.name);if(entry.isDirectory())walk(full);else if(entry.isFile()&&/\.(png|jpe?g|webp|glb|svg|hdr)$/i.test(entry.name)){const key=relative(directory,full),s=statSync(full),old=db.prepare('SELECT bytes,modified_ms FROM asset_files WHERE path=?').get(key);if(old?.bytes===s.size&&old?.modified_ms===s.mtimeMs)continue;const hash=createHash('sha256').update(readFileSync(full)).digest('hex');db.prepare('INSERT OR REPLACE INTO asset_files VALUES(?,?,?,?,?)').run(key,hash,s.size,s.mtimeMs,entry.name.split('.').at(-1).toLowerCase());}}}walk(directory);return db.prepare('SELECT path,sha256,bytes,kind FROM asset_files ORDER BY path').all();}
 return {get,put,indexFiles,history:name=>db.prepare('SELECT id,body,created_at FROM document_history WHERE name=? ORDER BY id').all(name).map(r=>({...r,value:JSON.parse(r.body),body:undefined})),close:()=>db.close()};
}
let instance;
export function storage(){return instance??=openStorage(resolve(import.meta.dirname,'../.local/asset-studio'));}
