import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect,it } from 'vitest';
import assert from 'node:assert/strict';
// Exercise only the standalone worker geometry check, before async helper imports.
const worker=readFileSync(new URL('../adapters/xarts/consumer-worker.mjs',import.meta.url),'utf8');
const check=worker.slice(worker.indexOf('const markup ='),worker.indexOf('const {scaleNumericRows}'));
it.each(['MNaN,0L10,10','MInfinity,0L10,10','translate(-Infinity 0)','0 NaN'])('rejects non-finite geometry %s',value=>{
 expect(()=>runInNewContext(check,{svg:`<svg><path d="${value}"/></svg>`,assert})).toThrow('non-finite output');
});
it('does not mistake embedded font payload for geometry',()=>{
 expect(()=>runInNewContext(check,{svg:'<svg><style>url(data:font/woff2;base64,aaNaNInfinityAA==)</style><path d="M0,0L10,10"/></svg>',assert})).not.toThrow();
});
