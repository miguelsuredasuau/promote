'use strict';
const $ = (id) => document.getElementById(id);
let snapshot = null;
let selection = null;
const list = (value) => Array.isArray(value) ? value : [];
const human = (value) => String(value ?? 'unknown').replace(/[_-]/g, ' ');
const asText = (value) => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
const evidenceText = value => Array.isArray(value) ? value.map(evidenceText).join('; ') : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => `${human(key)}: ${evidenceText(item)}`).join(' · ') : asText(value);
function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
function badge(value) { const label = human(value); const good = /^(completed?|passed|done|accepted|success|succeeded|verified)$/i.test(String(value)); const bad = /fail|error|blocked/i.test(String(value)); const warn = /partial|pending|running|in.progress|awaiting/i.test(String(value)); return el('span', `badge${good ? ' success' : bad ? ' danger' : warn ? ' warning' : ''}`, label); }
function empty(container, message) { container.replaceChildren(el('p', 'empty', message)); }
function time(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Timestamp unavailable' : date.toLocaleString([], { month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit' }); }
function showSelection(kind, record) {
  selection = { kind, id: record.id };
  $('inspector-empty').hidden = true; $('inspector-content').hidden = false;
  $('inspector-kind').textContent = `${kind} / recorded detail`;
  $('inspector-title').textContent = record.label || record.name || record.requestedOutcome?.summary || record.id || kind;
  $('inspector-data').textContent = JSON.stringify(record, null, 2);
  document.querySelectorAll('.gate-button').forEach(button => button.setAttribute('aria-pressed', String(kind === 'Gate' && button.dataset.id === String(record.id))));
}
function render(data) {
  const activeId = document.activeElement?.dataset?.id;
  const activeKind = document.activeElement?.classList.contains('gate-button') ? 'gate-button' : 'incident-button';
  const project = data.project || {}; const implementation = data.implementation || {};
  const milestones = list(implementation.milestones); const gates = list(project.catalog?.entries);
  const incidents = list(data.incidents); const operations = list(data.operations); const events = list(data.events);
  const owner = data.ownerReport || {}; const economics = owner.economics || {}; const backlog = owner.backlog || {}; const feedback = owner.feedback || {}; const decisions = list(owner.decisions);
  $('mandate-state').textContent = owner.mandate ? `${human(owner.mandate.status)} · ${owner.mandate.routineWork || 'Routine work policy not recorded'}` : 'Operating mandate not recorded';
  $('backlog-total').textContent = typeof backlog.total === 'number' ? `${backlog.total} items` : 'Not reported';
  $('backlog-detail').textContent = owner.backlog ? `${backlog.repairs ?? 0} repairs · ${backlog.features ?? 0} features · ${backlog.gateImprovements ?? 0} gate improvements${backlog.scope === 'latest_100_incidents' ? ' · latest 100 incidents' : ''}` : 'No backlog snapshot available.';
  const money = value => value == null ? 'Not reported' : `${value}${economics.currency ? ` ${economics.currency}` : ' (currency unknown)'}`;
  $('spend-value').textContent = money(economics.reportedSpend);
  $('economics-detail').textContent = `Budget: ${money(economics.approvedBudget)} · Reserved: ${money(economics.reserved)} · Revenue: ${money(economics.revenue)} · ROI: ${economics.roi == null ? 'not reported' : asText(economics.roi)}`;
  $('feedback-state').textContent = human(feedback.status || 'not_connected');
  $('feedback-detail').textContent = `${list(feedback.items).length} recorded feedback items. Customer signals require a connected source.`;
  $('decision-count').textContent = `${decisions.length} pending`;
  $('decision-detail').textContent = decisions.length ? 'Recorded decisions awaiting owner review.' : owner.mandate?.status === 'not_configured' ? 'No pending decisions. Mandate setup and the decision workflow are not yet implemented.' : 'No pending decisions recorded.';
  $('decision-list').replaceChildren();
  decisions.forEach(decision => { const row = el('div', 'record'); row.append(el('strong', '', decision.summary || decision.title || decision.id || 'Owner decision'), el('p', '', asText(decision))); $('decision-list').append(row); });
  $('project-name').textContent = project.name || project.id || 'Project';
  $('repo-state').textContent = project.repositoryAvailable ? 'Available locally' : 'Unavailable';
  $('head-state').textContent = project.head ? String(project.head).slice(0, 10) : 'No commit observed';
  $('head-state').title = project.head || '';
  $('catalog-match-state').textContent = !project.repositoryAvailable ? 'Checkout unavailable' : project.revisionMatchesCatalog ? 'Matches audited commit' : 'Re-audit required';
  $('adapter-state').textContent = human(project.adapterStatus);
  $('provider-state').textContent = human(project.providerStatus);
  $('dispatch-state').textContent = implementation.paidDispatchEnabled === true ? 'Enabled' : 'Disabled';
  const verification = implementation.verification || {};
  $('test-count').textContent = typeof verification.testsPassed === 'number' ? `${verification.testsPassed} passed` : 'Not reported';
  $('test-detail').textContent = `Typecheck: ${human(verification.typecheck)} · Node: ${asText(verification.node) || 'not reported'}. Recorded implementation verification.`;
  $('intake-state').textContent = `${incidents.length} recorded incident${incidents.length === 1 ? '' : 's'}`;
  $('engineering-state').textContent = operations.length ? `${operations.length} dispatch record${operations.length === 1 ? '' : 's'}` : 'No sessions dispatched';
  const executed = gates.filter(g => g.executionStatus && !['not_run', 'not_started', 'unknown'].includes(g.executionStatus)).length;
  $('verification-state').textContent = `${gates.length} catalogued · ${executed ? `${executed} with recorded execution` : 'no gate runs recorded'}`;
  $('release-state').textContent = 'Release not connected';
  const body = $('milestone-body'); body.replaceChildren();
  if (!milestones.length) { const row = el('tr'); const cell = el('td', 'empty', 'No implementation milestones recorded.'); cell.colSpan = 3; row.append(cell); body.append(row); }
  milestones.forEach(m => { const row = el('tr'); row.append(el('td', '', m.label || m.title || human(m.id))); const status = el('td'); status.append(badge(m.status)); row.append(status); const evidence = el('td'); const parts = [m.completedSlice, m.acceptance, m.evidence].filter(v => v != null && v !== ''); evidence.textContent = parts.map(evidenceText).join(' · ') || 'No supporting evidence recorded.'; row.append(evidence); body.append(row); });
  $('gate-count').textContent = `${gates.length} entries`;
  const gateList = $('gate-list'); gateList.replaceChildren();
  if (!gates.length) empty(gateList, 'No gates in the project catalog.');
  gates.forEach((gate, index) => { const button = el('button', 'gate-button'); button.type = 'button'; button.dataset.id = String(gate.id); button.setAttribute('aria-pressed', String(selection?.kind === 'Gate' && selection.id === gate.id)); const name = el('span'); name.append(el('span', 'gate-name', gate.label || gate.name || gate.id || `Gate ${index + 1}`), el('span', 'gate-meta', `Catalogued · ${human(gate.classification)}${list(gate.autonomyGateIds).length ? ` · ${list(gate.autonomyGateIds).join(', ')}` : ''}`)); const right = el('span', 'gate-right'); right.append(badge(gate.executionStatus || 'not_run'), el('span', 'gate-arrow', '↗')); button.append(name, right); button.addEventListener('click', () => showSelection('Gate', gate)); gateList.append(button); });
  $('operation-count').textContent = String(operations.length);
  const operationList = $('operation-list'); operationList.replaceChildren();
  if (!operations.length) empty(operationList, 'No engineering sessions dispatched. Model attempts and outcomes will appear here when recorded by the controller.');
  operations.forEach(operation => { const item = el('div', 'record'); const title = el('div', 'record-title'); title.append(el('strong', '', operation.harnessId || operation.id || 'Engineering session'), badge(operation.status)); item.append(title); item.append(el('p', '', `Attempt: ${operation.attempt ?? operation.attemptNumber ?? 'not recorded'} · Incident: ${operation.incidentId || 'not recorded'}`)); if (operation.outcome) item.append(el('p', '', `Outcome: ${asText(operation.outcome)}`)); operationList.append(item); });
  const incidentList = $('incident-list'); incidentList.replaceChildren();
  if (!incidents.length) empty(incidentList, 'No incidents recorded.');
  incidents.forEach(incident => { const item = el('div', 'record'); const title = el('div', 'record-title'); const button = el('button', 'incident-button', incident.requestedOutcome?.summary || incident.id || 'Incident'); button.type = 'button'; button.dataset.id = String(incident.id); button.addEventListener('click', () => showSelection('Incident', incident)); title.append(button, badge(incident.status)); item.append(title); incidentList.append(item); });
  const eventList = $('event-list'); eventList.replaceChildren();
  if (!events.length) empty(eventList, 'No controller events recorded.');
  events.slice(-20).reverse().forEach(event => { const item = el('div', 'event'); item.append(el('strong', '', `${event.sequence != null ? `#${event.sequence} · ` : ''}${human(event.type)}`)); if (event.incidentId) item.append(el('span', '', ` · ${event.incidentId}`)); const date = el('time', '', time(event.occurredAt)); if (event.occurredAt) date.dateTime = event.occurredAt; item.append(date); eventList.append(item); });
  if (selection) { const record = (selection.kind === 'Gate' ? gates : incidents).find(record => record.id === selection.id); if (record) showSelection(selection.kind, record); else { selection = null; $('inspector-empty').hidden = false; $('inspector-content').hidden = true; } }
  if (activeId) {
    const replacement = [...document.querySelectorAll(`.${activeKind}`)].find(node => node.dataset.id === activeId);
    replacement?.focus({preventScroll:true});
  }
}
async function refresh() {
  const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 8000);
  try {
    const response = await fetch('/api/overview', { cache:'no-store', signal:abort.signal, headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error(`Controller returned HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !data.project || !data.implementation || !data.observedAt) throw new Error('Controller snapshot is incomplete');
    const changed = !snapshot || JSON.stringify({...snapshot, observedAt:null}) !== JSON.stringify({...data, observedAt:null});
    snapshot = data; if (changed) render(data);
    $('connection-status').textContent = 'Local controller connected'; $('connection-dot').className = 'status-dot connected';
    $('observed').textContent = `Snapshot observed ${time(data.observedAt)}`;
    $('error-banner').hidden = true;
  } catch (error) {
    $('connection-status').textContent = snapshot ? 'Controller disconnected · stale snapshot' : 'Controller unavailable';
    $('connection-dot').className = 'status-dot error';
    $('observed').textContent = snapshot ? `Last snapshot ${time(snapshot.observedAt)}` : 'No local controller snapshot received.';
    $('error-banner').textContent = `${snapshot ? 'Showing the last received snapshot. ' : 'Waiting for controller data. '}${error.name === 'AbortError' ? 'The request timed out.' : error.message} Retrying automatically.`;
    $('error-banner').hidden = false;
  } finally { clearTimeout(timeout); setTimeout(refresh, 5000); }
}
refresh();
