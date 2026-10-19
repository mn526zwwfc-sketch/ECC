#!/usr/bin/env node
'use strict';

/**
 * Deterministic pre-trade check against the governance risk policy, used by
 * the compliance officer so that limits are applied by code, not judgment.
 *
 *   node fincept-precheck.js <ticket.json|-> [--policy <risk-policy.json>]
 *
 * ticket: {"mode": "paper"|"live", "open_positions": n, "daily_realized_pnl_usd": x,
 *          "legs": [{"symbol", "side": "long"|"short", "size", "leverage", "mark",
 *                    "tp", "sl", "planned_hold_minutes", "spread_bps",
 *                    "top_of_book_usd", "atr_1h_pct", "quote_age_minutes"}]}
 * Prints {"success": true, "data": {"decision", "legs": [...]}}. A leg passes
 * only when every rule passes; missing market data fails the rule that needs it.
 */

const fs = require('fs');

const isNil = v => v === null || v === undefined;
const { POLICY_PATH, loadPolicy } = require('./lib/liquid-policy');

function checkLeg(leg, mode, policy) {
  const caps = policy.modes[mode] || {};
  const failures = [];
  const size = Number(leg.size);
  const lev = Number(leg.leverage);
  const mark = Number(leg.mark);
  const tp = isNil(leg.tp) ? null : Number(leg.tp);
  const sl = isNil(leg.sl) ? null : Number(leg.sl);
  if (!(size > 0)) failures.push('size must be a positive USD notional');
  if (caps.max_notional_usd && size > caps.max_notional_usd) failures.push(`modes.${mode}.max_notional_usd = ${caps.max_notional_usd} (order ${size})`);
  if (!(lev > 0)) failures.push('leverage must be positive');
  if (caps.max_leverage && lev > caps.max_leverage) failures.push(`modes.${mode}.max_leverage = ${caps.max_leverage} (order ${lev}x)`);
  if (caps.require_stop_loss && isNil(sl)) failures.push(`modes.${mode}.require_stop_loss = true`);

  const minHold = policy.timed_exit && policy.timed_exit.min_minutes_for_scheduled_close;
  if (minHold && Number(leg.planned_hold_minutes) < minHold && (isNil(tp) || isNil(sl))) {
    failures.push(`timed_exit.min_minutes_for_scheduled_close = ${minHold} (hold ${leg.planned_hold_minutes} min needs TP and SL)`);
  }
  if (mark > 0) {
    const long = leg.side === 'long';
    if (!isNil(tp) && (long ? tp <= mark : tp >= mark)) failures.push(`take-profit ${tp} is on the wrong side of mark ${mark}`);
    if (!isNil(sl) && (long ? sl >= mark : sl <= mark)) failures.push(`stop-loss ${sl} is on the wrong side of mark ${mark}`);
  } else if (!isNil(tp) || !isNil(sl)) {
    failures.push('mark price missing: cannot validate TP/SL');
  }

  const maxAge = policy.ticket && policy.ticket.max_quote_age_minutes;
  if (maxAge) {
    if (!(Number(leg.quote_age_minutes) >= 0)) failures.push('quote_age_minutes missing');
    else if (Number(leg.quote_age_minutes) > maxAge) failures.push(`ticket.max_quote_age_minutes = ${maxAge} (quote is ${leg.quote_age_minutes} min old: re-read the market)`);
  }
  const liq = policy.liquidity || {};
  if (liq.max_spread_bps) {
    if (!(Number(leg.spread_bps) >= 0)) failures.push('spread_bps missing');
    else if (Number(leg.spread_bps) > liq.max_spread_bps) failures.push(`liquidity.max_spread_bps = ${liq.max_spread_bps} (spread ${leg.spread_bps})`);
  }
  if (liq.min_top_of_book_multiple) {
    const depth = Number(leg.top_of_book_usd);
    if (!(depth >= 0)) failures.push('top_of_book_usd missing');
    else if (depth < liq.min_top_of_book_multiple * size) failures.push(`liquidity.min_top_of_book_multiple = ${liq.min_top_of_book_multiple} (depth ${depth} for ${size})`);
  }
  const vol = policy.volatility || {};
  const liquidationPct = lev > 0 ? 100 / lev : null;
  const atr = Number(leg.atr_1h_pct);
  let atrMultiple = null;
  if (vol.min_liquidation_distance_atr_multiple) {
    if (!(atr > 0)) failures.push('atr_1h_pct missing');
    else {
      atrMultiple = liquidationPct / atr;
      if (atrMultiple < vol.min_liquidation_distance_atr_multiple) {
        failures.push(`volatility.min_liquidation_distance_atr_multiple = ${vol.min_liquidation_distance_atr_multiple} (${atrMultiple.toFixed(2)})`);
      }
    }
  }
  return {
    symbol: leg.symbol, side: leg.side, size, leverage: lev, pass: failures.length === 0, failures,
    collateral_usd: lev > 0 ? size / lev : null,
    liquidation_distance_pct: liquidationPct,
    liquidation_distance_atr: atrMultiple,
    risk_to_sl_usd: !isNil(sl) && mark > 0 ? Math.abs(mark - sl) / mark * size : null,
    reward_to_tp_usd: !isNil(tp) && mark > 0 ? Math.abs(tp - mark) / mark * size : null
  };
}

function precheck(ticket, policy) {
  if (!policy || !policy.modes) throw new Error('risk policy missing or unreadable');
  const mode = ticket.mode === 'paper' ? 'paper' : 'live';
  const caps = policy.modes[mode] || {};
  const legs = (ticket.legs || []).map(leg => checkLeg(leg, mode, policy));
  const blockers = [];
  if (caps.max_daily_loss_usd && -Number(ticket.daily_realized_pnl_usd || 0) >= caps.max_daily_loss_usd) {
    blockers.push(`modes.${mode}.max_daily_loss_usd = ${caps.max_daily_loss_usd} reached`);
  }
  if (caps.max_open_positions) {
    let open = Number(ticket.open_positions || 0);
    for (const leg of legs) {
      if (!leg.pass) continue;
      if (open >= caps.max_open_positions) {
        leg.pass = false;
        leg.failures.push(`modes.${mode}.max_open_positions = ${caps.max_open_positions} (already ${open})`);
      } else open++;
    }
  }
  if (blockers.length) legs.forEach(leg => { leg.pass = false; leg.failures.push(...blockers); });
  const passing = legs.filter(l => l.pass).length;
  return {
    policy_version: policy.version, mode, blockers,
    decision: passing === 0 ? 'NO_EJECUTAR' : (passing === legs.length ? 'PROCEDER' : 'PROCEDER_PARCIAL'),
    passing, legs
  };
}

if (require.main === module) {
  let code = 0;
  try {
    const args = process.argv.slice(2);
    const policyIdx = args.indexOf('--policy');
    const policyFile = policyIdx >= 0 ? args.splice(policyIdx, 2)[1] : POLICY_PATH;
    if (args.length !== 1) throw new Error('usage: node fincept-precheck.js <ticket.json|-> [--policy <risk-policy.json>]');
    const ticket = JSON.parse(fs.readFileSync(args[0] === '-' ? 0 : args[0], 'utf8'));
    process.stdout.write(JSON.stringify({ success: true, data: precheck(ticket, loadPolicy(policyFile)) }, null, 2) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
    code = 2;
  }
  process.exit(code);
}

module.exports = { checkLeg, precheck };
