// Launch the separately owned chat with Promote's verified registry configured.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const [chatRoot] = process.argv.slice(2);
if (!chatRoot) throw Error('Usage: node scripts/start-chat.mjs /absolute/path/to/xarts-chat');
const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['--no-warnings', 'server/main.mjs'], {
  cwd: resolve(chatRoot), stdio: 'inherit',
  env: { ...process.env, PROMOTE_REGISTRY: process.env.PROMOTE_REGISTRY ?? resolve(root, '.local/registry') },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
