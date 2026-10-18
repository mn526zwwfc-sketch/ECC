/**
 * Tests for scripts/install-recommended-skills.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'install-recommended-skills.js');

function run(args = []) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-rec-skills-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function makeExternalRepos(root) {
  const skills = [
    ['agent-reach', 'agent_reach/skill'],
    ['gs-quant', 'gs_quant/skills/gs-quant-overview'],
  ];
  for (const [repo, subdir] of skills) {
    const dir = path.join(root, repo, subdir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${repo}\n---\n`);
  }
}

const TEST_CASES = [
  ['dry run lists every skill without writing', () => {
    withTempDir(dir => {
      const target = path.join(dir, 'skills');
      const result = run(['--dry-run', '--no-external', '--target', target]);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.match(result.stdout, /install {2}strategic-compact/);
      assert.match(result.stdout, /install {2}deep-research/);
      assert.match(result.stdout, /13 planned/);
      assert.strictEqual(fs.existsSync(target), false);
    });
  }],
  ['installs ECC and external skills with provenance', () => {
    withTempDir(dir => {
      const target = path.join(dir, 'skills');
      const external = path.join(dir, 'external');
      makeExternalRepos(external);
      const result = run(['--target', target, '--external-dir', external]);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.match(result.stdout, /15 installed/);
      assert.ok(fs.existsSync(path.join(target, 'skill-stocktake', 'scripts', 'scan.sh')));
      const provenance = JSON.parse(fs.readFileSync(path.join(target, 'agent-reach', '.provenance.json'), 'utf8'));
      assert.strictEqual(provenance.license, 'MIT');
      assert.ok(fs.existsSync(path.join(target, 'gs-quant-overview', 'SKILL.md')));
    });
  }],
  ['skips existing skills unless --force', () => {
    withTempDir(dir => {
      const target = path.join(dir, 'skills');
      const mine = path.join(target, 'git-workflow');
      fs.mkdirSync(mine, { recursive: true });
      fs.writeFileSync(path.join(mine, 'SKILL.md'), 'user-owned');

      const skipped = run(['--no-external', '--target', target]);
      assert.strictEqual(skipped.status, 0, skipped.stderr);
      assert.match(skipped.stdout, /skip {5}git-workflow/);
      assert.strictEqual(fs.readFileSync(path.join(mine, 'SKILL.md'), 'utf8'), 'user-owned');

      const forced = run(['--no-external', '--force', '--target', target]);
      assert.strictEqual(forced.status, 0, forced.stderr);
      assert.notStrictEqual(fs.readFileSync(path.join(mine, 'SKILL.md'), 'utf8'), 'user-owned');
    });
  }],
  ['fails when an external skill is missing SKILL.md', () => {
    withTempDir(dir => {
      const external = path.join(dir, 'external');
      fs.mkdirSync(external);
      const result = run(['--dry-run', '--target', path.join(dir, 'skills'), '--external-dir', external]);
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /Missing SKILL\.md/);
    });
  }],
  ['prints help and rejects unknown arguments', () => {
    const help = run(['--help']);
    assert.strictEqual(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: node scripts\/install-recommended-skills\.js/);

    const bad = run(['--bogus']);
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /Unknown argument/);
  }],
];

function main() {
  console.log('\n=== Testing install-recommended-skills.js ===\n');

  const passed = TEST_CASES.filter(([name, fn]) => test(name, fn)).length;
  const failed = TEST_CASES.length - passed;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
