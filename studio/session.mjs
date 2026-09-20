import {timingSafeEqual} from 'node:crypto';
/** Loopback UI bootstrap, not remote-user authentication. Reject browser cross-site requests. */
export function localSessionRequest(headers, host) {
 const site=headers['sec-fetch-site'];
 return (!headers.origin || headers.origin===`http://${host}`) &&
  (site===undefined || site==='same-origin' || site==='none');
}
export function studioAuthorized(headers,host,token) {
 const value=headers['x-studio-token'];
 return localSessionRequest(headers,host) && headers.origin===`http://${host}` &&
  typeof value==='string' && /^[a-f0-9]{64}$/.test(value) &&
  timingSafeEqual(Buffer.from(value),Buffer.from(token));
}
