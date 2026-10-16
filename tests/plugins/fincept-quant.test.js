/**
 * Tests for plugins/fincept-quant (the FinceptTerminal quant-evidence plugin):
 *   - plugin manifest, MCP config and marketplace entry
 *   - agent, skill and command Markdown formats
 *   - the session-start and post-edit hooks
 *
 * Run with: node tests/run-all.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginRoot = path.join(repoRoot, 'plugins', 'fincept-quant');
const hookScript = path.join(pluginRoot, 'scripts', 'fincept-hooks.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(pluginRoot, rel), 'utf8'));
}

function frontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${path.relative(repoRoot, filePath)} has no YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return { fields, body: text.slice(match[0].length) };
}

function markdownFiles(dir) {
  return fs.readdirSync(path.join(pluginRoot, dir))
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(pluginRoot, dir, name));
}

function runHook(mode, { input = '', env = {} } = {}) {
  const childEnv = { ...process.env, ...env };
  if (env.FINCEPT_ANALYTICS_DIR === undefined) delete childEnv.FINCEPT_ANALYTICS_DIR;
  return spawnSync(process.execPath, [hookScript, mode], { input, env: childEnv, encoding: 'utf8' });
}

console.log('\n=== Testing plugins/fincept-quant ===\n');

test('plugin.json has name and version and no agents field', () => {
  const manifest = readJson('.claude-plugin/plugin.json');
  assert.strictEqual(manifest.name, 'fincept-quant');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(!('agents' in manifest), 'agents field is rejected by the Claude Code validator');
});

test('.mcp.json starts the stdlib MCP server through FINCEPT_ANALYTICS_DIR', () => {
  const server = readJson('.mcp.json').mcpServers['fincept-quant'];
  assert.ok(server, 'fincept-quant server entry missing');
  assert.strictEqual(server.command, 'python3');
  assert.deepStrictEqual(server.args, ['${FINCEPT_ANALYTICS_DIR}/quant_evidence/mcp_server.py']);
});

test('marketplace lists fincept-quant after ecc', () => {
  const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(marketplace.plugins[0].name, 'ecc');
  const entry = marketplace.plugins.find(p => p.name === 'fincept-quant');
  assert.ok(entry, 'fincept-quant marketplace entry missing');
  assert.strictEqual(entry.source, './plugins/fincept-quant');
  assert.strictEqual(entry.version, readJson('.claude-plugin/plugin.json').version);
});

test('hooks.json commands point at existing scripts', () => {
  const hooks = readJson('hooks/hooks.json').hooks;
  const commands = Object.values(hooks).flat().flatMap(entry => entry.hooks.map(h => h.command));
  assert.ok(commands.length >= 2);
  for (const command of commands) {
    const rel = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/);
    assert.ok(rel, `hook command does not use CLAUDE_PLUGIN_ROOT: ${command}`);
    assert.ok(fs.existsSync(path.join(pluginRoot, rel[1])), `missing hook script ${rel[1]}`);
  }
});

test('agents have name, description, scalar tools and model', () => {
  const files = markdownFiles('agents');
  assert.ok(files.length >= 3, 'expected at least 3 agents');
  for (const file of files) {
    const { fields, body } = frontmatter(file);
    for (const key of ['name', 'description', 'tools', 'model']) {
      assert.ok(fields[key], `${path.basename(file)} missing ${key}`);
    }
    assert.strictEqual(fields.name, path.basename(file, '.md'));
    assert.ok(!fields.tools.startsWith('['), `${path.basename(file)} tools must be a scalar`);
    assert.ok(body.includes('## Prompt Defense Baseline'), `${path.basename(file)} lacks the prompt defense baseline`);
  }
});

test('skills have frontmatter and When to Use / How It Works / Examples sections', () => {
  const dirs = fs.readdirSync(path.join(pluginRoot, 'skills'));
  assert.ok(dirs.length >= 3, 'expected at least 3 skills');
  for (const dir of dirs) {
    const { fields, body } = frontmatter(path.join(pluginRoot, 'skills', dir, 'SKILL.md'));
    assert.strictEqual(fields.name, dir);
    assert.ok(fields.description, `${dir} missing description`);
    for (const heading of ['When to Use', 'How It Works', 'Examples']) {
      assert.ok(new RegExp(`^## ${heading}`, 'm').test(body), `${dir} missing "## ${heading}"`);
    }
  }
});

test('commands declare a description', () => {
  const files = markdownFiles('commands');
  assert.ok(files.length >= 4, 'expected at least 4 commands');
  for (const file of files) {
    assert.ok(frontmatter(file).fields.description, `${path.basename(file)} missing description`);
  }
});

test('post-edit hook reminds about parity after editing stats.py', () => {
  const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/x/fincept-qt/scripts/Analytics/quant_evidence/stats.py' } });
  const result = runHook('post-edit', { input });
  assert.strictEqual(result.status, 0);
  const out = JSON.parse(result.stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /engine\.js/);
});

test('post-edit hook handles Windows separators', () => {
  const input = JSON.stringify({ tool_input: { file_path: 'C:\\repo\\quant_evidence\\data\\evidence_kb.json' } });
  const out = JSON.parse(runHook('post-edit', { input }).stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /export_web/);
});

test('post-edit hook stays silent for unrelated files', () => {
  const input = JSON.stringify({ tool_input: { file_path: '/x/src/app.js' } });
  const result = runHook('post-edit', { input });
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
});

test('post-edit hook exits 0 on malformed input', () => {
  const result = runHook('post-edit', { input: '{not json' });
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
  assert.match(result.stderr, /\[fincept-quant\]/);
});

test('session-start hook explains a missing FINCEPT_ANALYTICS_DIR', () => {
  const result = runHook('session-start');
  assert.strictEqual(result.status, 0);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /FINCEPT_ANALYTICS_DIR is not set/);
});

test('session-start hook flags a directory without the engine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fincept-empty-'));
  try {
    const out = JSON.parse(runHook('session-start', { env: { FINCEPT_ANALYTICS_DIR: dir } }).stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /does not contain/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('session-start hook is silent when the engine is present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fincept-ok-'));
  try {
    fs.mkdirSync(path.join(dir, 'quant_evidence'));
    fs.writeFileSync(path.join(dir, 'quant_evidence_cli.py'), '');
    fs.writeFileSync(path.join(dir, 'quant_evidence', 'mcp_server.py'), '');
    const result = runHook('session-start', { env: { FINCEPT_ANALYTICS_DIR: dir } });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every agent cites the shared playbook', () => {
  for (const file of markdownFiles('agents')) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('fincept-investment-playbook'), `${path.basename(file)} does not cite fincept-investment-playbook`);
  }
});

test('the committee command only calls agents that exist', () => {
  const agents = markdownFiles('agents').map(f => path.basename(f, '.md'));
  const text = fs.readFileSync(path.join(pluginRoot, 'commands', 'fincept-committee.md'), 'utf8');
  const named = [...new Set(text.match(/fincept-[a-z-]+/g) || [])].filter(n => n.endsWith('analyst') || n.endsWith('auditor') || n.endsWith('data') || n.endsWith('curator') || n.endsWith('developer'));
  assert.ok(named.length >= 3, 'committee names fewer than 3 agents');
  for (const n of named) assert.ok(agents.includes(n), `committee names unknown agent ${n}`);
});

test('the playbook lists the engine CLI commands agents rely on', () => {
  const text = fs.readFileSync(path.join(pluginRoot, 'skills', 'fincept-investment-playbook', 'SKILL.md'), 'utf8');
  for (const cmd of ['evaluate', 'search', 'compare', 'breakeven', 'series_cli.js', 'yahoo_sync']) {
    assert.ok(text.includes(cmd), `playbook does not mention ${cmd}`);
  }
});

test('the Liquid trader agent has only read tools', () => {
  const { liquidDecision } = require(hookScript);
  const { fields } = frontmatter(path.join(pluginRoot, 'agents', 'fincept-liquid-trader.md'));
  const liquid = fields.tools.split(',').map(t => t.trim()).filter(t => t.startsWith('mcp__Co-Invest__'));
  assert.ok(liquid.includes('mcp__Co-Invest__paper_trading_status'), 'agent cannot read the account mode');
  for (const tool of liquid) {
    assert.strictEqual(liquidDecision({ tool_name: tool }), null, `${tool} is not a read-only Liquid tool`);
    assert.ok(!/__suggest_/.test(tool), `${tool} prepares orders; only the main conversation does that`);
  }
});

test('pre-liquid hook asks before Liquid tools that move money or change the account', () => {
  for (const tool of ['execute_order', 'close_positions_batch', 'enable_paper_trading', 'withdraw_earn', 'show_deposit',
    'read_link', 'market_picks', 'plan_portfolio', 'get_a_tool_added_later']) {
    const inCap = { executionMode: 'paper', size: 100, leverage: 1 };
    const result = runHook('pre-liquid', { input: JSON.stringify({ tool_name: `mcp__Co-Invest__${tool}`, tool_input: inCap }) });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout).hookSpecificOutput;
    assert.strictEqual(out.hookEventName, 'PreToolUse');
    assert.strictEqual(out.permissionDecision, 'ask', `${tool} should ask`);
  }
});

test('pre-liquid hook stays silent for reads and proposals', () => {
  for (const tool of ['get_portfolio', 'paper_trading_status', 'analyze_market', 'suggest_trade', '_earn_pending_status']) {
    const result = runHook('pre-liquid', { input: JSON.stringify({ tool_name: `mcp__Co-Invest__${tool}` }) });
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '', `${tool} should not prompt`);
  }
  assert.strictEqual(runHook('pre-liquid', { input: JSON.stringify({ tool_name: 'Bash' }) }).stdout, '');
});

test('pre-liquid hook denies order tools to subagents and asks on unknown or bad input', () => {
  const input = JSON.stringify({ tool_name: 'mcp__claude_ai_Co_Invest__execute_order', agent_id: 'sub-1' });
  const out = JSON.parse(runHook('pre-liquid', { input }).stdout).hookSpecificOutput;
  assert.strictEqual(out.permissionDecision, 'deny');
  const renamed = runHook('pre-liquid', { input: JSON.stringify({ tool_name: 'mcp__Co_Invest_Liquid__execute_order', tool_input: { executionMode: 'paper', size: 100, leverage: 1 } }) });
  assert.strictEqual(JSON.parse(renamed.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const bad = runHook('pre-liquid', { input: '{not json' });
  assert.strictEqual(bad.status, 0);
  assert.strictEqual(JSON.parse(bad.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('hooks.json routes Liquid tools to the pre-liquid hook', () => {
  const entries = readJson('hooks/hooks.json').hooks.PreToolUse;
  const entry = entries.find(e => e.hooks.some(h => h.command.endsWith(' pre-liquid')));
  assert.ok(entry, 'no PreToolUse entry for pre-liquid');
  const matcher = new RegExp(`^(?:${entry.matcher})$`);
  assert.ok(matcher.test('mcp__Co-Invest__execute_order'));
  assert.ok(!matcher.test('mcp__Quiver_Quant__get_congress_trades'));
});

test('the trade command gates on mode and explicit approval', () => {
  const text = fs.readFileSync(path.join(pluginRoot, 'commands', 'fincept-trade.md'), 'utf8');
  for (const needle of ['fincept-liquid-trader', 'paper_trading_status', 'suggest_trade', 'confirmed: true', 'idempotencyKey']) {
    assert.ok(text.includes(needle), `fincept-trade.md does not mention ${needle}`);
  }
});

const governanceRoot = path.join(pluginRoot, 'skills', 'fincept-governance');

test('every agent cites the governance skill and holds only read-only Liquid tools', () => {
  const { liquidDecision } = require(hookScript);
  for (const file of markdownFiles('agents')) {
    assert.ok(fs.readFileSync(file, 'utf8').includes('fincept-governance'), `${path.basename(file)} does not cite fincept-governance`);
    const tools = frontmatter(file).fields.tools.split(',').map(t => t.trim()).filter(t => t.startsWith('mcp__Co-Invest__'));
    for (const tool of tools) {
      assert.strictEqual(liquidDecision({ tool_name: tool }), null, `${path.basename(file)} holds non-read-only ${tool}`);
      assert.ok(!/__suggest_/.test(tool), `${path.basename(file)} holds proposal tool ${tool}`);
    }
  }
});

test('risk policy defines paper and live caps and the authorization tiers', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(governanceRoot, 'policies', 'risk-policy.json'), 'utf8'));
  for (const mode of ['paper', 'live']) {
    assert.ok(policy.modes[mode].max_notional_usd > 0, `${mode} notional cap missing`);
    assert.ok(policy.modes[mode].max_leverage > 0, `${mode} leverage cap missing`);
  }
  assert.strictEqual(policy.modes.live.require_stop_loss, true);
  assert.ok(policy.modes.live.max_notional_usd <= policy.modes.paper.max_notional_usd);
  for (const tier of ['subagent', 'main_conversation', 'account_owner']) assert.ok(policy.authorization_tiers[tier], `tier ${tier} missing`);
});

test('casebook cases are well formed and name existing agents', () => {
  const agents = new Set(markdownFiles('agents').map(f => path.basename(f, '.md')));
  const casebook = JSON.parse(fs.readFileSync(path.join(governanceRoot, 'casebook', 'cases.json'), 'utf8'));
  const ids = new Set();
  for (const c of casebook.cases) {
    assert.ok(!ids.has(c.id), `duplicate case ${c.id}`);
    ids.add(c.id);
    assert.ok([1, 2, 3].includes(c.phase), `${c.id} has no valid phase`);
    assert.ok(c.expected && c.expected.decision, `${c.id} has no expected decision`);
    for (const a of c.agents) assert.ok(agents.has(a), `${c.id} names unknown agent ${a}`);
  }
  for (const phase of [1, 2, 3]) assert.ok(casebook.cases.some(c => c.phase === phase), `no phase ${phase} case`);
});

test('grader passes an answer built from the expectations and fails wrong ones', () => {
  const { grade } = require(path.join(pluginRoot, 'scripts', 'fincept-grade.js'));
  const casebook = JSON.parse(fs.readFileSync(path.join(governanceRoot, 'casebook', 'cases.json'), 'utf8'));
  const c2 = casebook.cases.find(c => c.id === 'C2-brent-long-closed');
  const figures = Object.fromEntries(Object.entries(c2.expected.figures).map(([k, v]) => [k, v.value]));
  const good = { case_id: c2.id, decision: 'CONCILIADO', figures, explanation: 'Entrada 08:24, salida 09:48 (hora CDMX).' };
  assert.strictEqual(grade(casebook, [good]).passed, 1);
  const wrongNumber = { ...good, figures: { ...figures, net_pnl_usd: 0.388 } };
  assert.strictEqual(grade(casebook, [wrongNumber]).failed, 1);
  const s4 = casebook.cases.find(c => c.id === 'S4-over-cap');
  const unsafe = { case_id: s4.id, decision: 'NO_EJECUTAR', figures: {}, explanation: 'Supera el límite de la política, pero aprobado, ejecuto.' };
  assert.strictEqual(grade(casebook, [unsafe]).failed, 1);
});

test('pre-liquid hook enforces the risk-policy caps even in the main conversation', () => {
  const decide = toolInput => JSON.parse(runHook('pre-liquid', {
    input: JSON.stringify({ tool_name: 'mcp__Co-Invest__execute_order', tool_input: toolInput })
  }).stdout).hookSpecificOutput.permissionDecision;
  assert.strictEqual(decide({ executionMode: 'live', size: 500, leverage: 1, sl: 1, confirmed: true }), 'deny');
  assert.strictEqual(decide({ executionMode: 'live', size: 50, leverage: 5, sl: 1, confirmed: true }), 'deny');
  assert.strictEqual(decide({ executionMode: 'live', size: 50, leverage: 1, confirmed: true }), 'deny');
  assert.strictEqual(decide({ size: 50, leverage: 1, confirmed: true }), 'deny', 'a missing mode is treated as live');
  assert.strictEqual(decide({ executionMode: 'live', size: 50, leverage: 2, sl: 90, confirmed: true }), 'ask');
  assert.strictEqual(decide({ executionMode: 'paper', size: 100, leverage: 1, confirmed: true }), 'ask');
  const batch = JSON.parse(runHook('pre-liquid', { input: JSON.stringify({
    tool_name: 'mcp__Co-Invest__execute_orders_batch',
    tool_input: { executionMode: 'paper', orders: [{ size: 100, leverage: 1 }, { size: 5000, leverage: 1 }] }
  }) }).stdout).hookSpecificOutput;
  assert.strictEqual(batch.permissionDecision, 'deny');
});

test('governance ships its SOPs, retraining log and train command', () => {
  for (const sop of ['trade.md', 'reconciliation.md', 'compliance-review.md', 'communication.md']) {
    assert.ok(fs.existsSync(path.join(governanceRoot, 'sops', sop)), `missing SOP ${sop}`);
  }
  assert.match(fs.readFileSync(path.join(governanceRoot, 'retraining-log.md'), 'utf8'), /## Entry template/);
  const train = fs.readFileSync(path.join(pluginRoot, 'commands', 'fincept-train.md'), 'utf8');
  for (const needle of ['fincept-grade.js', 'retraining-log.md', 'expected']) assert.ok(train.includes(needle), `fincept-train.md lacks ${needle}`);
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
