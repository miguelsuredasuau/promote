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

it('includes the preview application transitive transform sources without admitting local secrets', async () => {
 const paths = await archivePaths(git({}, [
  'app/PreviewApp.tsx', 'transform/TransformPage.tsx', 'transform/InputZone.tsx',
  'transform/PipelinePanel.tsx', 'transform/StepBuilder.tsx', 'transform/.env.local',
  'transform/.local/cache.json', 'link:transform/local-source', 'private/unrelated.ts',
 ]), sha);
 expect(paths).toEqual([
  'app/PreviewApp.tsx', 'transform/InputZone.tsx', 'transform/PipelinePanel.tsx',
  'transform/StepBuilder.tsx', 'transform/TransformPage.tsx',
 ]);
});

it('includes the exact diagnostic script exercised by protected baseline tests, not its evidence directory', async () => {
 const paths = await archivePaths(git({}, [
  'docs/analysis/probes/symbolmap-external.mjs', 'docs/analysis/probes/private-report.json',
  'docs/analysis/probes/unrelated.mjs', 'tests/consumer/sdk/symbolmap-contract-cases.mjs',
 ]), sha);
 expect(paths).toEqual(['docs/analysis/probes/symbolmap-external.mjs', 'tests/consumer/sdk/symbolmap-contract-cases.mjs']);
});
