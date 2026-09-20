import assert from 'node:assert/strict';
/** A uniform scale preserves additive identities (waterfalls, subtotals and totals).
 * Adding an offset to each row creates invalid bridge data, not a useful render probe.
 */
export function scaleNumericRows(rows){
 const changed=structuredClone(rows);let different=false;
 for(const row of changed)for(const key of Object.keys(row))if(typeof row[key]==='number'){
  const next=row[key]*1.17;assert.ok(Number.isFinite(next),'finite counterexample required');
  if(next!==row[key])different=true;row[key]=next;
 }
 assert.ok(different,'nonzero numeric counterexample required');return changed;
}
