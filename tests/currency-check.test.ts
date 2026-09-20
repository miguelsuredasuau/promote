import {it,expect} from 'vitest';
import {checkNegativeCurrency} from '../adapters/xarts/currency-check.mjs';
const spec={chartId:'waterfall',locale:'en-GB',columns:{value:'amount'},overrides:{style:{valueFormat:{prefix:'€',suffix:'k'}}}};
const rows=[{amount:-110.3},{amount:-29}];
it('accepts correctly positioned signs with the unchanged SQL values',()=>{expect(checkNegativeCurrency('<svg><text>-€110.3k</text><text>−€29k</text></svg>',spec,rows)).toEqual({negativeLabels:2,signBeforeCurrency:true});});
it('rejects the reproduced currency-before-sign defect',()=>{expect(()=>checkNegativeCurrency('<svg><text>€-110.3k</text><text>€-29k</text></svg>',spec,rows)).toThrow('sign must precede');});
it('rejects fabricated or missing numbers even if the sign is correct',()=>{expect(()=>checkNegativeCurrency('<svg><text>-€110.4k</text><text>-€29k</text></svg>',spec,rows)).toThrow('unchanged negative value');});
it('does not accept a vacuous fixture with no negative SQL values',()=>{expect(()=>checkNegativeCurrency('<svg/>',spec,[{amount:1}])).toThrow('negative SQL');});
