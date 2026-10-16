#!/usr/bin/env node
'use strict';

/**
 * fincept-quant hooks.
 *
 *   session-start  Checks that FINCEPT_ANALYTICS_DIR points at the engine and
 *                  tells Claude how to fix it when it does not.
 *   post-edit      After an edit to the engine, reminds Claude of the
 *                  Python/JavaScript parity rule and the commands to re-run.
 *   pre-liquid     Before a Liquid (Co-Invest connector) tool that can move
 *                  money or change the account, asks the user to confirm; a
 *                  subagent is denied outright, since only the main
 *                  conversation can get the user's approval of an order.
 *                  An order above the caps in the governance risk policy is
 *                  denied even in the main conversation.
 *
 * Every mode only reads its input and the filesystem and always exits 0.
 */

const fs = require('fs');
const path = require('path');
const { capViolation, loadPolicy } = require('./lib/liquid-policy');

const CLI_NAME = 'quant_evidence_cli.py';
const SERVER_REL = path.join('quant_evidence', 'mcp_server.py');
const TEST_CMD = 'python3 -m unittest discover -s quant_evidence/tests -t .';

// Engine files whose edits need a follow-up, keyed by path suffix.
const EDIT_RULES = [
  {
    suffix: 'quant_evidence/stats.py',
    note: 'stats.py changed: web/engine.js is a line-by-line port of it. Mirror the change in engine.js, '
      + `then run \`${TEST_CMD}\` from the Analytics dir (the parity test compares both engines).`
  },
  {
    suffix: 'quant_evidence/evaluator.py',
    note: 'evaluator.py changed: mirror it in web/engine.js (parity test), '
      + `run \`${TEST_CMD}\`, then rebuild the page with \`python3 ${CLI_NAME} export_web\`.`
  },
  {
    suffix: 'quant_evidence/web/engine.js',
    note: 'engine.js changed: it must stay in parity with stats.py and evaluator.py. '
      + `Run \`${TEST_CMD}\` and \`python3 ${CLI_NAME} export_web\`.`
  },
  {
    suffix: 'quant_evidence/data/evidence_kb.json',
    note: 'evidence_kb.json changed: every strategy needs sources and valid categories. '
      + `Run \`${TEST_CMD}\` and \`python3 ${CLI_NAME} export_web\` so the pages embed the new data.`
  },
  {
    suffix: 'quant_evidence/agent_tools.py',
    note: 'agent_tools.py changed: it backs the MCP tools and app/agente.html. '
      + `Keep both in step and run \`${TEST_CMD}\`.`
  }
];

// Liquid (Co-Invest connector) tools that only read data or prepare a
// proposal, listed by exact name. Every other Liquid tool (orders, closes,
// cancels, mode switches, funds, link fetches, trade picks) and any tool added
// later needs the user's confirmation.
const LIQUID_SERVER = /co[-_ ]?invest/i;
const LIQUID_READ_ONLY = new Set([
  'help', '_earn_pending_status', 'paper_trading_status', 'automated_trading_status',
  'get_account', 'get_portfolio', 'get_position_history', 'get_transaction_history', 'get_news',
  'get_positioning_pulse', 'get_technical_indicators', 'get_earn_balance', 'get_staking',
  'view_open_orders', 'view_prediction_orders', 'view_prediction_positions',
  'show_chart', 'show_orderbook', 'show_market_overview', 'show_portfolio_chart', 'show_prediction_orderbook',
  'search_markets', 'search_prediction_markets', 'analyze_market', 'analyze_markets_batch',
  'leaderboard_data', 'leaderboard_rank', 'suggest_trade', 'suggest_trades_batch', 'suggest_order'
]);

function emit(event, context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: context }
  }));
}

function checkAnalyticsDir(dir) {
  if (!dir || !dir.trim()) {
    return 'FINCEPT_ANALYTICS_DIR is not set, so the fincept-quant MCP server cannot start. '
      + 'Set it to the fincept-qt/scripts/Analytics directory of a FinceptTerminal checkout '
      + '(for example in the env block of ~/.claude/settings.json) and restart Claude Code. '
      + `Until then, if a checkout exists, the CLI works through Bash: python3 <dir>/${CLI_NAME} list`;
  }
  const missing = [CLI_NAME, SERVER_REL].filter(rel => !fs.existsSync(path.join(dir, rel)));
  if (missing.length > 0) {
    return `FINCEPT_ANALYTICS_DIR=${dir} does not contain ${missing.join(' and ')}. `
      + 'Point it at fincept-qt/scripts/Analytics of a FinceptTerminal checkout that includes quant_evidence.';
  }
  return null;
}

function sessionStart(env) {
  const problem = checkAnalyticsDir(env.FINCEPT_ANALYTICS_DIR);
  if (problem) emit('SessionStart', `[fincept-quant] ${problem}`);
}

function editedPath(input) {
  const toolInput = (input && input.tool_input) || {};
  return String(toolInput.file_path || toolInput.path || '');
}

function postEdit(input) {
  const file = editedPath(input).replace(/\\/g, '/');
  if (!file) return;
  const rule = EDIT_RULES.find(r => file.endsWith(r.suffix));
  if (rule) emit('PostToolUse', `[fincept-quant] ${rule.note}`);
}

function liquidDecision(input) {
  const name = String((input && input.tool_name) || '');
  const match = name.match(/^mcp__(.+?)__(.+)$/);
  if (!LIQUID_SERVER.test(match ? match[1] : name)) return null;
  const tool = match ? match[2] : name;
  if (match && LIQUID_READ_ONLY.has(tool)) return null;
  if (input.agent_id) {
    return { permissionDecision: 'deny', permissionDecisionReason: `[fincept-quant] Liquid ${tool} is not a read-only tool. `
      + 'Subagents may only read; return the proposal to the main conversation, which asks the user to approve the exact action.' };
  }
  const toolInput = input.tool_input || {};
  const breach = capViolation(tool, toolInput, loadPolicy());
  if (breach) {
    return { permissionDecision: 'deny', permissionDecisionReason: `[fincept-quant] Liquid ${tool} blocked by the risk policy: ${breach}. `
      + 'Approval in chat cannot lift a cap; only the account owner can, by editing skills/fincept-governance/policies/risk-policy.json.' };
  }
  const what = toolInput.confirmed === true ? 'EXECUTES an action that can move money or change the account'
    : 'is not a read-only tool (a preview if it has no confirmed=true, otherwise an account change)';
  return { permissionDecision: 'ask', permissionDecisionReason: `[fincept-quant] Liquid ${tool} ${what}. `
    + 'Approve only if you already approved this exact action in the chat.' };
}

function preLiquid(input) {
  const decision = liquidDecision(input);
  if (decision) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }));
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function main(argv, env) {
  const mode = argv[2];
  try {
    if (mode === 'session-start') {
      sessionStart(env);
    } else if (mode === 'post-edit') {
      const raw = readStdin();
      postEdit(raw.trim() ? JSON.parse(raw) : {});
    } else if (mode === 'pre-liquid') {
      const raw = readStdin();
      let input = null;
      try {
        input = JSON.parse(raw);
      } catch (_) {
        // Unreadable input: ask rather than let a possible order through silently.
        input = { tool_name: 'mcp__Co-Invest__unknown' };
      }
      preLiquid(input);
    } else {
      process.stderr.write(`[fincept-quant] unknown hook mode: ${mode}\n`);
    }
  } catch (err) {
    process.stderr.write(`[fincept-quant] hook error: ${err.message}\n`);
  }
}

if (require.main === module) {
  main(process.argv, process.env);
  process.exit(0);
}

module.exports = { EDIT_RULES, LIQUID_READ_ONLY, checkAnalyticsDir, liquidDecision, postEdit, sessionStart };
