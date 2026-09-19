import type { Incident } from '../contracts/records';

/** Owner-facing projection. Never converts missing telemetry into zero spending or ROI. */
export function ownerReport(incidents: readonly Incident[]) {
  const terminal = new Set(['completed', 'refused', 'cancelled', 'budget_exhausted']);
  const backlog = incidents.filter((incident) => !terminal.has(incident.status));
  return {
    mandate: {
      status: 'not_configured', routineWork: 'Not yet authorized by configured policy',
      decisionCategories: ['budget_expansion', 'new_feature_investment', 'technology_change', 'product_pivot', 'protected_gate_change'],
    },
    backlog: {
      scope: 'latest_100_incidents', total: backlog.length,
      repairs: backlog.filter((i) => i.requestedOutcome.kind === 'repair').length,
      features: backlog.filter((i) => i.requestedOutcome.kind === 'capability').length,
      gateImprovements: backlog.filter((i) => i.requestedOutcome.kind === 'gate_strengthening').length,
    },
    feedback: { status: 'not_connected', items: [] },
    economics: {
      status: 'not_connected', currency: null, approvedBudget: null, reserved: null,
      reportedSpend: null, revenue: null, roi: null, observations: [],
    },
    decisionWorkflowStatus: 'not_implemented', decisions: [],
  };
}
