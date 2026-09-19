import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControllerStore } from './store';
import { createOperatorServer } from './http';

const root = fileURLToPath(new URL('../', import.meta.url));
const database = process.env.PROMOTE_DATABASE ?? join(root, '.local/controller.sqlite');
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
mkdirSync(dirname(database), { recursive: true });
const store = new ControllerStore(database);
const server = createOperatorServer({ root, store, checkout: process.env.PROMOTE_PROJECT_PATH });
server.listen(port, '127.0.0.1', () => console.log(`Promoted operator: http://127.0.0.1:${port} (read-only)`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
