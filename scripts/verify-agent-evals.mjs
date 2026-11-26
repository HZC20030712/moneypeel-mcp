#!/usr/bin/env node
/**
 * STATIC CORPUS LINT for the agent recommendation eval set.
 *
 * This is NOT a model behaviour test (2026-11-26 audit §5.3 / EVAL-01): it reads
 * evals/agent-recommendation-cases.json, checks that every case is well formed,
 * and checks that SKILL.md still contains the guardrail language the cases
 * assume. It never calls a model, never chooses a tool and never asserts on an
 * answer, so its lines are labelled CORPUS_OK and its summary is corpus_ok —
 * printing PASS here would claim behaviour evidence this script does not have.
 *
 * Real model behaviour lives in scripts/verify-model-evals.mjs. That script
 * reports SKIP (NOT VERIFIED) when no model API key/version is configured.
 *
 * Usage: npm run verify:evals
 * Exit codes: 0 corpus lint OK, 1 a corpus problem.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = JSON.parse(
  await readFile(path.join(root, 'evals', 'agent-recommendation-cases.json'), 'utf8')
);
const skill = await readFile(path.join(root, 'SKILL.md'), 'utf8');
const toolNames = new Set([
  'search_reports',
  'list_reports',
  'search_growth_signals',
  'compare_companies',
  'get_report',
  'get_usage',
]);

const failures = [];
if (cases.length < 12 || cases.length > 20) {
  failures.push(`expected 12-20 cases, found ${cases.length}`);
}
for (const item of cases) {
  if (!/^E\d{2}$/.test(item.id)) failures.push(`${item.id}: invalid id`);
  if (!item.prompt?.trim()) failures.push(`${item.id}: prompt is empty`);
  if (item.expectedTool !== null && !toolNames.has(item.expectedTool)) {
    failures.push(`${item.id}: unknown expectedTool ${item.expectedTool}`);
  }
  if (!item.mustMention?.length || !item.mustNotClaim?.length) {
    failures.push(`${item.id}: both positive and negative assertions are required`);
  }
}

const guardrails = [
  ['spike-driven caveat', /spike|spike_driven/i],
  ['period-over-period', /period_over_period/],
  ['provider-reported wording', /provider-reported/],
  ['profit refusal', /profit/i],
  ['quota retry rule', /Do not retry/i],
  ['date rule', /Always carry the date/i],
];
for (const [name, pattern] of guardrails) {
  if (!pattern.test(skill)) failures.push(`SKILL.md lacks ${name}`);
}

console.log('static corpus lint — no model is called; behaviour is NOT verified by this script');
for (const item of cases) {
  console.log(`CORPUS_OK ${item.id} ${item.expectedTool ?? 'refuse'} — ${item.prompt}`);
}
console.log(`\nsummary: corpus_ok=${cases.length} fail=${failures.length} (static corpus lint only; model behaviour is NOT VERIFIED here)`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
