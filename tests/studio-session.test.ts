import {expect,it} from 'vitest';
import {localSessionRequest,studioAuthorized} from '../studio/session.mjs';
const host='127.0.0.1:4311',token='a'.repeat(64);
it('restricts browser bootstrap to local same-origin requests',()=>{
 expect(localSessionRequest({'sec-fetch-site':'cross-site'},host)).toBe(false);
 expect(localSessionRequest({'sec-fetch-site':'same-site'},host)).toBe(false);
 expect(localSessionRequest({origin:'https://example.test'},host)).toBe(false);
 expect(localSessionRequest({'sec-fetch-site':'same-origin'},host)).toBe(true);
});
it('requires origin and exact token for writes, rejecting malformed token bytes',()=>{
 const headers={origin:`http://${host}`,'x-studio-token':token,'sec-fetch-site':'same-origin'};
 expect(studioAuthorized(headers,host,token)).toBe(true);
 for(const v of ['b'.repeat(64),'é'.repeat(64),'',undefined])expect(studioAuthorized({...headers,'x-studio-token':v},host,token)).toBe(false);
 expect(studioAuthorized({...headers,origin:undefined},host,token)).toBe(false);
});
