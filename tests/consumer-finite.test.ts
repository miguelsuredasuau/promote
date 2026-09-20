import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect,it } from 'vitest';
import assert from 'node:assert/strict';
// Exercise the actual standalone worker check; it is mounted alone in the container.
const worker=readFileSync(new URL('../adapters/xarts/consumer-worker.mjs',import.meta.url),'utf8');
const check=worker.slice(worker.indexOf('const markup ='),worker.indexOf('const changed ='));
it.each(['MNaN,0L10,10','MInfinity,0L10,10','translate(-Infinity 0)','0 NaN'])('rejects non-finite geometry %s',value=>{
 expect(()=>runInNewContext(check,{svg:`<svg><path d="${value}"/></svg>`,assert})).toThrow();
});
it('does not mistake embedded font payload for geometry',()=>{
 expect(()=>runInNewContext(check,{svg:'<svg><style>url(data:font/woff2;base64,aaNaNInfinityAA==)</style><path d="M0,0L10,10"/></svg>',assert})).not.toThrow();
});
