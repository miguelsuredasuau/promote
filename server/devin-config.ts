import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DevinAdapter } from '../adapters/devin/client';
import { authorizeEngineering } from '../contracts/mandate';
import { projectEnvironment } from './environment.mjs';

/** Credentials stay local and never enter task records or status responses. */
export function loadDevin(root: string, env: NodeJS.ProcessEnv = process.env) {
  const read = (name: string) => { const path=join(root,'.local',name); return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null; };
  try {
    const config=projectEnvironment(root,env);
    const apiKey=config.DEVIN_API_KEY;
    const organizationId=config.DEVIN_ORG_ID??config.DEVIN_ORGANIZATION_ID;
    const adapter=apiKey&&organizationId?new DevinAdapter({apiKey,organizationId}):null;
    const task=read('engineering-task.json'),mandate=read('engineering-mandate.json');
    const funding=read('engineering-funding-policy.json');
    let authorized=false;
    if(task&&mandate){try{authorizeEngineering(mandate,task);authorized=true;}catch{/* Report no secret or task contents. */}}
    const billingPending=funding?.funding==='existing_prepaid_credit_only' &&
      (funding.balanceVerified!==true || funding.autoReloadVerifiedDisabled!==true);
    const status=!adapter?'credentials_missing':billingPending?'awaiting_billing_verification':!authorized?'task_authorization_pending':'ready_for_explicit_dispatch';
    const explanation=billingPending
      ? 'Devin credentials are configured. Your existing-credit-only instruction is recorded. No repair is running: available credit and disabled auto-reload still need verification before a spending limit can be finalized.'
      : !adapter ? 'Devin credentials are missing. No repair can start.'
      : !authorized ? 'Devin credentials are configured. The scoped repair task and spending limit still need to be finalized.'
      : 'Devin is ready for explicit dispatch within the approved task and spending limit.';
    const rate = typeof funding?.usdPerAcu === 'number' && Number.isFinite(funding.usdPerAcu) && funding.usdPerAcu > 0 ? funding.usdPerAcu : null;
    return {adapter,task,mandate,status:{status,explanation,
      usdPerAcu:rate,rateSource:rate===null?null:'user_reported',firstRepairBudgetUsd:funding?.firstRepairBudgetUsd??null,
      credentialsConfigured:!!adapter,mandateAuthorized:authorized,paidDispatchEnabled:!!adapter&&authorized&&!billingPending,
      connectionVerified:false,automaticDispatch:false}};
  } catch {
    return {adapter:null,task:null,mandate:null,status:{status:'configuration_invalid',credentialsConfigured:false,
      mandateAuthorized:false,paidDispatchEnabled:false,connectionVerified:false,automaticDispatch:false}};
  }
}
