import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

/** Read fresh local values without mutating the process or exposing secrets. */
export function projectEnvironment(root, overrides = process.env) {
  const path = join(root, '.env');
  return { ...(existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}), ...overrides };
}
