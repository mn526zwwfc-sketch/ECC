'use strict';

/**
 * Hard caps from skills/fincept-governance/policies/risk-policy.json, checked
 * before a Liquid order executes. A breach is denied outright: approving in
 * chat cannot lift a cap, only editing the policy file can.
 */

const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '..', '..', 'skills', 'fincept-governance', 'policies', 'risk-policy.json');

function loadPolicy(file = POLICY_PATH) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function legsOf(tool, input) {
  if (tool === 'execute_order') return [input];
  if (tool === 'execute_orders_batch') return Array.isArray(input.orders) ? input.orders : (Array.isArray(input.trades) ? input.trades : []);
  return [];
}

/** Returns a reason string when the order breaks a cap, else null. */
function capViolation(tool, input, policy) {
  if (!policy || !policy.modes) return null;
  input = input || {};
  if (tool === 'update_leverage') {
    const cap = policy.modes.live && policy.modes.live.max_leverage;
    const lev = Number(input.leverage);
    return cap && lev > cap ? `leverage ${lev}x is above the ${cap}x cap` : null;
  }
  const legs = legsOf(tool, input);
  if (legs.length === 0) return null;
  const mode = input.executionMode === 'paper' ? 'paper' : 'live';
  const caps = policy.modes[mode];
  if (!caps) return null;
  for (const leg of legs) {
    const size = Number(leg.size);
    const lev = Number(leg.leverage);
    if (caps.max_notional_usd && size > caps.max_notional_usd) {
      return `${mode} notional ${size} USD is above the ${caps.max_notional_usd} USD cap`;
    }
    if (caps.max_leverage && lev > caps.max_leverage) {
      return `${mode} leverage ${lev}x is above the ${caps.max_leverage}x cap`;
    }
    if (caps.require_stop_loss && !(Number(leg.sl) > 0)) {
      return `${mode} orders need a stop-loss`;
    }
  }
  return null;
}

module.exports = { POLICY_PATH, capViolation, loadPolicy };
