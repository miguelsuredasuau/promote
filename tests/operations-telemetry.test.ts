import {expect,it} from 'vitest';
import {operationsStory,serviceTelemetry} from '../web/operations-model.js';
it('separates campaign authorization, reservations, held sessions and unconfirmed zero usage',()=>{
 const service={engineeringSpend:{committedCeilings:500,reportedUsage:0,estimatedDollarCost:0,sessions:[{state:'held',reportedAcu:0,observedAt:'2026-09-20T12:00:00Z'},{state:'running',reportedAcu:0,observedAt:'2026-09-20T12:00:30Z'}]}};
 const telemetry=serviceTelemetry(service,{budget:{totalCeilingAcu:2000,totalCommittedAcu:500,totalRemainingAcu:1500}},Date.parse('2026-09-20T12:01:00Z'));
 expect(telemetry.pairs).toContainEqual(['Sessions running',1]);
 expect(telemetry.pairs).toContainEqual(['Sessions held / reserved',1]);
 expect(telemetry.pairs).toContainEqual(['Campaign authorization','2000 ACU']);
 expect(telemetry.pairs).toContainEqual(['Reserved session ceilings','500 ACU']);
 expect(telemetry.pairs).toContainEqual(['Provider-reported usage','0 ACU reported · not settled']);
 expect(telemetry.pairs).toContainEqual(['Indicative cost','Pending usage / rate']);
 expect(telemetry.note).toContain('Latest usage observation 30s ago; oldest 60s ago.');
});
it('does not turn missing budget or partial usage into zero totals',()=>{
 const telemetry=serviceTelemetry({engineeringSpend:{reportedUsage:null,knownReportedUsage:3,sessions:[{state:'stopped',reportedAcu:3},{state:'held',reportedAcu:null}]}});
 expect(telemetry.pairs).toContainEqual(['Campaign authorization','Unavailable']);
 expect(telemetry.pairs).toContainEqual(['Provider-reported usage','3 ACU known · 1 pending']);
 expect(telemetry.note).toContain('No usage observation recorded.');
});
it('puts active sessions ahead of historical release state in the current story',()=>{
 const story=operationsStory({delivery:{status:'active'},engineeringSpend:{sessions:[{state:'stopped',candidateSha:'a'},{state:'running'},{state:'running'},{state:'held'}]}});
 expect(story.heading).toBe('2 Devin sessions working');
 expect(story.detail).toContain('1 additional sessions are held');
 expect(story.stages.find((stage:{label:string})=>stage.label==='Engineering')?.state).toBe('active');
});
