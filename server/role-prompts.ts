import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function rolePrompt(role:'orchestrator'|'feedback'|'product'|'qa'|'engineer') {
  const version=role==='engineer'?3:role==='qa'?2:1;
  const text=readFileSync(new URL(`../prompts/${role}-v${version}.md`,import.meta.url),'utf8');
  return {version,text,hash:createHash('sha256').update(text).digest('hex')};
}
