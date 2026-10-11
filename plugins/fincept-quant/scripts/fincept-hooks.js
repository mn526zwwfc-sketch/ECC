#!/usr/bin/env node
'use strict';

/**
 * fincept-quant hooks.
 *
 *   session-start  Checks that FINCEPT_ANALYTICS_DIR points at the engine and
 *                  tells Claude how to fix it when it does not.
 *   post-edit      After an edit to the engine, reminds Claude of the
 *                  Python/JavaScript parity rule and the commands to re-run.
 *
 * Both modes only read the filesystem, never block and always exit 0.
 */

const fs = require('fs');
const path = require('path');

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

module.exports = { EDIT_RULES, checkAnalyticsDir, postEdit, sessionStart };
