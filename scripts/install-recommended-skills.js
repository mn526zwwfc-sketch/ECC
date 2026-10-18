#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

const ECC_SKILLS = [
  'strategic-compact',
  'context-budget',
  'search-first',
  'verification-loop',
  'tdd-workflow',
  'git-workflow',
  'skill-stocktake',
  'python-patterns',
  'python-testing',
  'cpp-coding-standards',
  'cpp-testing',
  'llm-trading-agent-security',
  'deep-research',
];

const EXTERNAL_SKILLS = [
  {
    name: 'agent-reach',
    repo: 'agent-reach',
    url: 'https://github.com/mn526zwwfc-sketch/Agent-Reach',
    subdir: 'agent_reach/skill',
    license: 'MIT',
  },
  {
    name: 'gs-quant-overview',
    repo: 'gs-quant',
    url: 'https://github.com/mn526zwwfc-sketch/gs-quant',
    subdir: 'gs_quant/skills/gs-quant-overview',
    license: 'Apache-2.0',
  },
];

function showHelp() {
  process.stdout.write(`
Usage: node scripts/install-recommended-skills.js [options]

Copy the recommended skill bundle (docs/recommended-skills/) into the Claude
Code skills directory. Existing skill directories are skipped unless --force.

Options:
  --target <dir>        Destination (default: ~/.claude/skills)
  --external-dir <dir>  Use pre-cloned external repos (<dir>/agent-reach,
                        <dir>/gs-quant) instead of cloning them
  --no-external         Install only the ECC skills
  --force               Overwrite existing skill directories
  --dry-run             Print the plan without writing anything
  --help, -h            Show this help
`);
}

function parseArgs(argv) {
  const parsed = {
    target: path.join(os.homedir(), '.claude', 'skills'),
    externalDir: null,
    external: true,
    force: false,
    dryRun: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target' || arg === '--external-dir') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      parsed[arg === '--target' ? 'target' : 'externalDir'] = path.resolve(value);
      i += 1;
    } else if (arg === '--no-external') {
      parsed.external = false;
    } else if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function cloneRepo(url, dest) {
  const result = spawnSync('git', ['clone', '--quiet', '--depth', '1', url, dest], {
    encoding: 'utf8',
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`git clone ${url} failed: ${(result.stderr || '').trim()}`);
  }
}

function installSkill(source, name, options, provenance) {
  const dest = path.join(options.target, name);

  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    throw new Error(`Missing SKILL.md in ${source}`);
  }

  if (fs.existsSync(dest) && !options.force) {
    console.log(`  skip     ${name} (already exists, use --force to overwrite)`);
    return 'skipped';
  }

  console.log(`  install  ${name} -> ${dest}`);
  if (options.dryRun) {
    return 'planned';
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(options.target, { recursive: true });
  fs.cpSync(source, dest, { recursive: true });
  if (provenance) {
    fs.writeFileSync(path.join(dest, '.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  }
  return 'installed';
}

function run(options) {
  const counts = { installed: 0, planned: 0, skipped: 0 };

  console.log(`Target: ${options.target}${options.dryRun ? ' (dry run)' : ''}\n`);
  console.log('ECC skills:');
  for (const name of ECC_SKILLS) {
    counts[installSkill(path.join(REPO_ROOT, 'skills', name), name, options)] += 1;
  }

  if (options.external) {
    console.log('\nExternal skills:');
    const tempDir = options.externalDir ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-skills-'));
    try {
      for (const skill of EXTERNAL_SKILLS) {
        const repoDir = path.join(options.externalDir || tempDir, skill.repo);
        if (!options.externalDir) {
          cloneRepo(skill.url, repoDir);
        }
        const provenance = { source: skill.url, path: skill.subdir, license: skill.license };
        counts[installSkill(path.join(repoDir, skill.subdir), skill.name, options, provenance)] += 1;
      }
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  console.log(`\nDone: ${counts.installed} installed, ${counts.planned} planned, ${counts.skipped} skipped.`);
  console.log('Headroom (context compression) is a CLI, not a skill: uv tool install "headroom-ai[all]" && headroom wrap claude');
}

function main() {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      showHelp();
      return;
    }
    run(options);
  } catch (error) {
    console.error(`[install-recommended-skills] ${error.message}`);
    process.exitCode = 1;
  }
}

main();
