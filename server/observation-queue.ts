// Local attempt times prevent failing historical reads monopolizing every poll.
// They are deliberately separate from provider usage evidence.
const attempts=new WeakMap<object,Map<string,number>>();
export function observationQueue<T>(owner:object,rows:T[],now:number,describe:(row:T)=>{
 key:string;terminal:boolean;remoteId?:string|null;observedAt?:string|null;
}):T[]{
 let history=attempts.get(owner);
 if(!history){history=new Map();attempts.set(owner,history);}
 const active:T[]=[];
 const terminal:Array<{row:T;key:string;last:number}>=[];
 for(const row of rows){
  const item=describe(row);
  if(!item.terminal){active.push(row);continue;}
  if(!item.remoteId)continue;
  const observed=Date.parse(item.observedAt??'');
  const last=Math.max(Number.isFinite(observed)?observed:-Infinity,history.get(item.key)??-Infinity);
  if(now-last>=60000)terminal.push({row,key:item.key,last});
 }
 terminal.sort((a,b)=>a.last-b.last);
 const selected=terminal.slice(0,10);
 for(const item of selected)history.set(item.key,now);
 return [...active,...selected.map(item=>item.row)];
}
