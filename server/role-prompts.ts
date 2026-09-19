import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function rolePrompt(role:'orchestrator'|'feedback'|'product'|'qa'|'engineer') {
  const text=readFileSync(new URL(`../prompts/${role}-v1.md`,import.meta.url),'utf8');
  return {version:1,text,hash:createHash('sha256').update(text).digest('hex')};
}
