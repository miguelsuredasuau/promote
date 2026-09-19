import { describe, expect, it } from 'vitest';
import { archivePaths } from '../server/xarts-validation';

const sha = 'f'.repeat(40);

function fakeGit(pkg: unknown, tree: string[]) {
  return async (args: string[]) => {
    if (args[0] === 'show') return JSON.stringify(pkg);
    if (args[0] === 'ls-tree') return tree.join('\n') + '\n';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

describe('archivePaths', () => {
  it('adds published files and export targets that exist in the candidate tree', async () => {
    const pkg = {
      files: ['core', 'docs/catalogo-ficha.json', 'docs/primitivas-muestras', 'specs/demo', '!**/*.test.ts', 'docs/missing.json'],
      exports: { '.': './core/index.ts', './mandos.json': './docs/mandos.json', './package.json': './package.json', './x': { import: './x.mjs' } },
    };
    const tree = ['core/index.ts', 'docs/catalogo-ficha.json', 'docs/mandos.json', 'docs/primitivas-muestras/a.svg', 'specs/demo/bar.json', 'package.json'];
    const paths = await archivePaths(fakeGit(pkg, tree), sha);
    expect(paths).toContain('docs/catalogo-ficha.json');
    expect(paths).toContain('docs/mandos.json');
    expect(paths).toContain('docs/primitivas-muestras');
    expect(paths).toContain('specs/demo');
    expect(paths).not.toContain('docs/missing.json');
    expect(paths.filter((p) => p === 'core')).toHaveLength(1);
    expect(paths.filter((p) => p === 'package.json')).toHaveLength(1);
    expect(paths.some((p) => p.includes('*'))).toBe(false);
  });

  it('never archives uncommitted or traversal paths', async () => {
    const paths = await archivePaths(fakeGit({ files: ['../secrets', '.env', 'docs/'] }, ['docs/SDK.md']), sha);
    expect(paths).not.toContain('../secrets');
    expect(paths).not.toContain('.env');
    expect(paths).toContain('docs');
  });
});
