import {expect,it,vi} from 'vitest';
import {serialWork,markFailure,failureBoundaries} from '../server/serial-work';
it('starts one item at a time and commits in input order',async()=>{
 let release!:()=>void;const first=new Promise<void>(resolve=>{release=resolve;});const events:string[]=[];
 const result=serialWork([1,2],async n=>{events.push(`start:${n}`);if(n===1)await first;events.push(`commit:${n}`);});
 await Promise.resolve();expect(events).toEqual(['start:1']);release();await result;
 expect(events).toEqual(['start:1','commit:1','start:2','commit:2']);
});
it.each(['sync','async'])('stops after a %s failure and preserves its identity',async mode=>{
 const failure=new Error('private details');const seen:number[]=[];
 const result=serialWork([1,2,3],n=>{seen.push(n);if(n===2){if(mode==='sync')throw failure;return Promise.reject(failure);}return Promise.resolve();});
 await expect(result).rejects.toBe(failure);expect(seen).toEqual([1,2]);
});
it('completes an empty queue without invoking work',async()=>{const work=vi.fn();await serialWork([],work);expect(work).not.toHaveBeenCalled();});
it('records safe boundary names without changing or serializing error identity or cause',()=>{
 const cause=new Error('secret');const error=Object.freeze(new Error('message',{cause}));
 expect(markFailure(error,'read')).toBe(error);expect(markFailure(error,'observe')).toBe(error);
 expect(failureBoundaries(error)).toEqual(['read','observe']);expect(error.cause).toBe(cause);
 expect(JSON.stringify(error)).toBe('{}');expect(markFailure(null,'read')).toBeNull();
});
