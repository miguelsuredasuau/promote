import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ControllerStore } from '../server/store';
import { runXartsDelivery } from '../server/xarts-delivery';
const [taskFile] = process.argv.slice(2);
if (!taskFile) throw Error('Usage: node --import tsx scripts/deliver-xarts.ts <trusted delivery-task.json>');
const root = resolve('.');
const store = new ControllerStore(resolve('.local/controller.sqlite'));
try {
  const result = await runXartsDelivery(store, root, JSON.parse(readFileSync(taskFile,'utf8')));
  console.log(JSON.stringify(result,null,2));
  if(result.state!=='completed') process.exitCode=1;
} finally {store.close();}
