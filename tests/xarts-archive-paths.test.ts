import { expect, it } from 'vitest';
import { archivePaths } from '../server/xarts-validation';
const sha='f'.repeat(40);
const git=(pkg:unknown,tree:string[])=>async(args:string[])=>args[0]==='show'?JSON.stringify(pkg):tree.map(p=>`${p.startsWith('link:')?'120000':'100644'} blob ${sha}\t${p.replace(/^link:/,'')}\0`).join('');
it('resolves committed publication files, nested exports and globs',async()=>{
 const paths=await archivePaths(git({files:['specs/**/*.json'],exports:{'.':{import:'./extra.mjs'}}},['package.json','core/index.ts','specs/demo/bar.json','extra.mjs','docs/SDK.md','docs/analysis/private.md']),sha);
 expect(paths).toEqual(['core/index.ts','docs/SDK.md','extra.mjs','package.json','specs/demo/bar.json']);
});
it('candidate declarations cannot include secrets, nested local files or symlinks',async()=>{
 const forbidden=['.env','core/.env.local','core/a.key','core/cache.sqlite','core/.local/state.json','.npmrc','credentials.json'];
 const paths=await archivePaths(git({files:['**','../outside']},[...forbidden,'core/safe.ts','link:core/linked']),sha);
 expect(paths).toEqual(['core/safe.ts']);
});
