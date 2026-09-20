// Controller-owned standalone check. No source checkout or chat shims are present.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const standalone = spawnSync('node', ['/consumer/standalone.mjs'], { cwd: '/tmp', stdio: 'inherit' });
if (standalone.status !== 0) process.exit(standalone.status ?? 1);
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const input = JSON.parse(readFileSync('/inputs/request.json', 'utf8'));
assert.ok(!Object.hasOwn(input.spec, 'data'), 'data must come from the SQL result');
const dataHash = createHash('sha256').update(JSON.stringify(input.rows)).digest('hex');
assert.equal(dataHash, input.dataHash);
const { renderSvg } = await import('/consumer/node_modules/visx-render/core/runtime/node.js');
const full = { fonts: 'embed', ...input.spec, data: input.rows, embedSpec: false };
const { svg } = await renderSvg(full);
assert.ok(svg.startsWith('<svg') && svg.length > 2000, 'real SVG required');
const markup = svg.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, 'data:');
assert.ok(!/(?:NaN|[+-]?Infinity)/.test(markup), 'non-finite output');
assert.ok(!/<script\b/i.test(svg), 'executable SVG refused');
const {scaleNumericRows}=await import('/inputs/counterexample.mjs');
const changed=scaleNumericRows(input.rows);
assert.notEqual((await renderSvg({ ...full, data: changed })).svg, svg, 'render must respond to SQL data');
if(input.requiredTextFormat==='negative_currency_sign_before_prefix'){
 const {checkNegativeCurrency}=await import('/inputs/currency-check.mjs');
 checkNegativeCurrency(svg,input.spec,input.rows);
}
writeFileSync('/exports/chart.svg', svg);
writeFileSync('/exports/consumer.json', JSON.stringify({ schemaVersion: 1, shims: [], dataHash, rows: input.rows.length, svgBytes: Buffer.byteLength(svg), numericCounterexample: 'pass' }));
console.log('Standalone package imported and original SQL-backed request regenerated without shims.');
