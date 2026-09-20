import {it,expect} from 'vitest';
import {scaleNumericRows} from '../adapters/xarts/counterexample.mjs';
it('changes a financial bridge without breaking its reconciliation or mutating the evidence',()=>{
 const rows=[{step:'start',v:100},{step:'revenue',v:40},{step:'cost',v:-20},{step:'total',v:120}];
 const changed=scaleNumericRows(rows);
 expect(changed[0].v+changed[1].v+changed[2].v).toBeCloseTo(changed[3].v,10);
 expect(changed[3].v).not.toBe(rows[3].v);expect(rows[3].v).toBe(120);expect(changed[2].step).toBe('cost');
});
it('refuses a vacuous counterexample or nonfinite data',()=>{
 expect(()=>scaleNumericRows([{v:0}])).toThrow('nonzero');expect(()=>scaleNumericRows([{v:Infinity}])).toThrow('finite');
});
