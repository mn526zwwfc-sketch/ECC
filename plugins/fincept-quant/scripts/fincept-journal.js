#!/usr/bin/env node
'use strict';

/**
 * Builds the trade journal from Liquid get_position_history output, so the
 * data analyst's figures come from code: PnL, fees, holding time, delay
 * against the plan and slippage against the proposal's reference price.
 *
 *   node fincept-journal.js <history.json|-> [--plan <plan.json>] [--csv <out.csv>]
 *
 * history: the tool's JSON ({"positions": [...]}) with includeFills: true.
 * plan: {"<symbol>": {"planned_hold_minutes": n, "reference_price": p}}.
 * Times are reported in America/Mexico_City.
 */

const fs = require('fs');

const isNil = v => v === null || v === undefined;

const TZ = 'America/Mexico_City';

function cdmx(iso) {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date(iso));
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day} ${v.hour}:${v.minute}:${v.second}`;
}

function round(x, digits) {
  if (isNil(x) || !Number.isFinite(x)) return null;
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

function journalRow(position, plan) {
  const fills = position.fills || [];
  const entries = fills.filter(f => f.portion === 'entry');
  const exits = fills.filter(f => f.portion === 'exit');
  const sum = (list, key) => list.reduce((a, f) => a + Number(f[key] || 0), 0);
  const vwap = list => {
    const qty = sum(list, 'size');
    return qty > 0 ? list.reduce((a, f) => a + Number(f.size) * Number(f.price), 0) / qty : null;
  };
  const entrySize = entries.length ? sum(entries, 'size') : Number(position.entrySize);
  const exitSize = exits.length ? sum(exits, 'size') : Number(position.exitSize || 0);
  const entryPrice = entries.length ? vwap(entries) : Number(position.averageEntryPrice);
  const exitPrice = exits.length ? vwap(exits) : (!isNil(position.averageExitPrice) ? Number(position.averageExitPrice) : null);
  const sign = position.side === 'short' ? -1 : 1;
  const closed = position.status === 'closed' && !isNil(exitPrice);
  const gross = closed ? sign * (exitPrice - entryPrice) * exitSize : null;
  const fees = fills.length ? sum(fills, 'fee') : null;
  const opened = position.openedAt ? Date.parse(position.openedAt) : null;
  const closedAt = position.closedAt ? Date.parse(position.closedAt) : null;
  const holding = !isNil(opened) && !isNil(closedAt) ? (closedAt - opened) / 60000 : null;
  const p = (plan && plan[position.symbol]) || {};
  const ref = Number(p.reference_price);
  const issues = [];
  if (closed && Math.abs(entrySize - exitSize) > 1e-9) issues.push(`entry size ${entrySize} != exit size ${exitSize}`);
  if (position.feesComplete === false) issues.push('fees incomplete');
  const tokens = [...new Set(fills.map(f => f.feeToken).filter(Boolean))];
  if (tokens.some(t => t !== 'USDC')) issues.push(`fees in ${tokens.join(', ')}: totals assume USD`);
  if (closed && !isNil(position.grossRealizedPnl) && !isNil(gross) && Math.abs(Number(position.grossRealizedPnl) - gross) > 1e-6) {
    issues.push(`venue gross ${position.grossRealizedPnl} != computed ${round(gross, 6)}`);
  }
  return {
    symbol: position.symbol, side: position.side, status: position.status,
    size: entrySize, entry_time_cdmx: cdmx(position.openedAt), entry_price: round(entryPrice, 6),
    exit_time_cdmx: cdmx(position.closedAt), exit_price: round(exitPrice, 6),
    fees_usd: round(fees, 6), gross_pnl_usd: round(gross, 6),
    net_pnl_usd: !isNil(gross) && !isNil(fees) ? round(gross - fees, 6) : null,
    holding_minutes: round(holding, 2),
    planned_hold_minutes: !isNil(p.planned_hold_minutes) ? Number(p.planned_hold_minutes) : null,
    delay_minutes: !isNil(holding) && !isNil(p.planned_hold_minutes) ? round(holding - Number(p.planned_hold_minutes), 2) : null,
    entry_slippage_bps: ref > 0 && entryPrice ? round(sign * (entryPrice - ref) / ref * 1e4, 2) : null,
    order_ids: fills.map(f => f.oid),
    issues
  };
}

function journal(history, plan) {
  const rows = (history.positions || []).map(p => journalRow(p, plan));
  const closed = rows.filter(r => !isNil(r.net_pnl_usd));
  const open = rows.filter(r => isNil(r.net_pnl_usd));
  const total = (list, key) => round(list.reduce((a, r) => a + (r[key] || 0), 0), 6);
  return {
    mode: history.mode || null,
    rows,
    totals: {
      trades_closed: closed.length,
      trades_open: open.length,
      gross_pnl_usd: total(closed, 'gross_pnl_usd'),
      fees_usd: total(closed, 'fees_usd'),
      net_pnl_usd: total(closed, 'net_pnl_usd'),
      open_entry_fees_usd: total(open, 'fees_usd'),
      winners: closed.filter(r => r.net_pnl_usd > 0).length,
      losers: closed.filter(r => r.net_pnl_usd < 0).length,
      flat: closed.filter(r => r.net_pnl_usd === 0).length
    },
    coverage_note: history.coverageNote || null
  };
}

function toCsv(rows) {
  const cols = ['symbol', 'side', 'status', 'size', 'entry_time_cdmx', 'entry_price', 'exit_time_cdmx', 'exit_price', 'fees_usd', 'gross_pnl_usd', 'net_pnl_usd', 'holding_minutes', 'planned_hold_minutes', 'delay_minutes', 'entry_slippage_bps'];
  const cell = v => (isNil(v) ? '' : String(v).replace(/"/g, '""'));
  return [cols.join(','), ...rows.map(r => cols.map(c => `"${cell(r[c])}"`).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  let code = 0;
  try {
    const args = process.argv.slice(2);
    const opt = { file: null, plan: null, csv: null };
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--plan') opt.plan = args[++i];
      else if (args[i] === '--csv') opt.csv = args[++i];
      else if (!opt.file) opt.file = args[i];
      else throw new Error(`unexpected argument: ${args[i]}`);
    }
    if (!opt.file) throw new Error('usage: node fincept-journal.js <history.json|-> [--plan <plan.json>] [--csv <out.csv>]');
    const history = JSON.parse(fs.readFileSync(opt.file === '-' ? 0 : opt.file, 'utf8'));
    const plan = opt.plan ? JSON.parse(fs.readFileSync(opt.plan, 'utf8')) : null;
    const data = journal(history, plan);
    if (opt.csv) fs.writeFileSync(opt.csv, toCsv(data.rows));
    process.stdout.write(JSON.stringify({ success: true, data }, null, 2) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
    code = 2;
  }
  process.exit(code);
}

module.exports = { cdmx, journal, journalRow, toCsv };
