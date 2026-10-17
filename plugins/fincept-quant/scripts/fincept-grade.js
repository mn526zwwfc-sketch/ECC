#!/usr/bin/env node
'use strict';

/**
 * Grades subagent answers against the governance casebook.
 *
 *   node fincept-grade.js <answers.json> [--casebook <cases.json>] [--phase <n>]
 *
 * answers.json is an array of {case_id, agent, decision, figures, explanation}.
 * A case passes when the decision matches, every expected figure is within its
 * tolerance and the phrase checks hold (accent- and case-insensitive).
 * Prints {"success": true, "data": {...}} and exits 0 when every graded answer
 * passes, 1 otherwise (2 on bad input).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CASEBOOK = path.join(__dirname, '..', 'skills', 'fincept-governance', 'casebook', 'cases.json');

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function answerText(answer) {
  return normalize([answer.decision, answer.explanation].join(' '));
}

function gradeAnswer(testCase, answer) {
  const expected = testCase.expected;
  const failures = [];
  if (String(answer.decision || '').toUpperCase() !== expected.decision) {
    failures.push(`decision ${answer.decision || '(none)'} != ${expected.decision}`);
  }
  const figures = answer.figures || {};
  for (const [key, spec] of Object.entries(expected.figures || {})) {
    const got = Number(figures[key]);
    if (!Number.isFinite(got)) failures.push(`missing figure ${key}`);
    else if (Math.abs(got - spec.value) > spec.tol) failures.push(`${key} ${got} != ${spec.value} +/- ${spec.tol}`);
  }
  const text = answerText(answer);
  for (const group of expected.must_include_any || []) {
    if (!group.some(term => text.includes(normalize(term)))) failures.push(`missing one of: ${group.join(' | ')}`);
  }
  for (const term of expected.must_not_include || []) {
    if (text.includes(normalize(term))) failures.push(`forbidden phrase: ${term}`);
  }
  return { case_id: testCase.id, agent: answer.agent || null, phase: testCase.phase, pass: failures.length === 0, failures };
}

function grade(casebook, answers, phase) {
  const byId = new Map(casebook.cases.map(c => [c.id, c]));
  const results = [];
  for (const answer of answers) {
    const testCase = byId.get(answer.case_id);
    if (!testCase) {
      results.push({ case_id: answer.case_id, agent: answer.agent || null, pass: false, failures: ['unknown case_id'] });
    } else if (phase === null || phase === undefined || testCase.phase === phase) {
      results.push(gradeAnswer(testCase, answer));
    }
  }
  const passed = results.filter(r => r.pass).length;
  return { graded: results.length, passed, failed: results.length - passed, results };
}

function parseArgs(argv) {
  const opts = { answers: null, casebook: DEFAULT_CASEBOOK, phase: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--casebook') opts.casebook = argv[++i];
    else if (argv[i] === '--phase') opts.phase = Number(argv[++i]);
    else if (!opts.answers) opts.answers = argv[i];
    else throw new Error(`unexpected argument: ${argv[i]}`);
  }
  if (!opts.answers) throw new Error('usage: node fincept-grade.js <answers.json> [--casebook <cases.json>] [--phase <n>]');
  return opts;
}

if (require.main === module) {
  let code = 0;
  try {
    const opts = parseArgs(process.argv.slice(2));
    const casebook = JSON.parse(fs.readFileSync(opts.casebook, 'utf8'));
    const answers = JSON.parse(fs.readFileSync(opts.answers, 'utf8'));
    if (!Array.isArray(answers)) throw new Error('answers file must hold a JSON array');
    const data = grade(casebook, answers, opts.phase);
    process.stdout.write(JSON.stringify({ success: true, data }, null, 2) + '\n');
    code = data.failed === 0 ? 0 : 1;
  } catch (err) {
    process.stdout.write(JSON.stringify({ success: false, error: err.message }) + '\n');
    code = 2;
  }
  process.exit(code);
}

module.exports = { grade, gradeAnswer, normalize };
