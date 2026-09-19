import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ControllerStore } from '../server/store';
import { loadDevin } from '../server/devin-config';
import { dispatchEngineering, observeEngineering } from '../server/engineering';

const root=fileURLToPath(new URL('../',import.meta.url));
const command=process.argv[2]??'check';
if(!['check','dispatch','observe'].includes(command))throw new Error('Use check, dispatch, or observe');
const config=loadDevin(root);
if(command==='check')console.log(JSON.stringify(config.status,null,2));
else {
  if(!config.adapter)throw new Error('Devin credentials are missing or invalid; see docs/devin-operations.md');
  if(command==='dispatch'&&!config.status.paidDispatchEnabled)throw new Error('An approved task, ACU mandate and any required billing verification are required');
  const store=new ControllerStore(process.env.PROMOTE_DATABASE??join(root,'.local/controller.sqlite'));
  try {
    store.providerStatus(config.status);
    if(command==='dispatch')console.log(JSON.stringify(await dispatchEngineering(store,config.adapter,config.mandate,config.task)));
    else {await observeEngineering(store,config.adapter);console.log(JSON.stringify(store.engineeringSpend(),null,2));}
  } finally {store.close();}
}
