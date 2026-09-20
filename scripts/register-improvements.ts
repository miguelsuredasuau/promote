import {ControllerStore} from '../server/store';
import {registerImprovements} from '../server/improvements';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
if(!process.argv[2]||!process.argv[3])throw Error('Provide Xarts checkout and chat checkout');
const store=new ControllerStore(join(root,'.local/controller.sqlite'));
try{console.log(JSON.stringify(registerImprovements(store,resolve(process.argv[2]),resolve(process.argv[3])),null,2));}finally{store.close();}
