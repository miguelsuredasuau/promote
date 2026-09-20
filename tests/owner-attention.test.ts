import {expect,it} from 'vitest';
import {ownerAttention,decisionBrief} from '../server/owner-decisions';
it('keeps technical findings and small features with the team',()=>{
 for(const proposal of [{category:'bug',title:'SDK build failure'},{category:'infrastructure',title:'Migration script failed'},{category:'feedback',title:'Please change the colours'},{category:'feature',title:'Feature request: add support for axis labels'}])expect(ownerAttention(proposal)).toBe(false);
});
it('asks about a product direction without authorizing implementation',()=>{
 const p={category:'feature',title:'Feature request: add subscription pricing'};
 expect(ownerAttention(p)).toBe(true);expect(decisionBrief(p).consequence).toContain('does not launch paid engineering');
});
