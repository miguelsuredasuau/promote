import assert from 'node:assert/strict';
/** Protected output check: reads SQL values and SVG text, not Xarts formatting helpers. */
export function checkNegativeCurrency(svg,spec,rows){
 const texts=[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));
 assert.equal(spec.chartId,'waterfall','format check is scoped to waterfall');
 assert.equal(spec.overrides?.style?.valueFormat?.prefix,'€','expected currency fixture');
 const values=rows.map(row=>row[spec.columns.value]).filter(v=>typeof v==='number'&&v<0);
 assert.ok(values.length,'negative SQL values required');
 assert.ok(!texts.some(t=>/€[−-]\d/.test(t)),'negative sign must precede currency');
 const format=new Intl.NumberFormat(spec.locale??'en-GB',{maximumFractionDigits:6});
 for(const value of values){const expected='€'+format.format(Math.abs(value))+(spec.overrides.style.valueFormat.suffix??'');assert.ok(texts.some(t=>t==='-'+expected||t==='−'+expected),`missing unchanged negative value: -${expected}`);}
 return {negativeLabels:values.length,signBeforeCurrency:true};
}
