#!/usr/bin/env node

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

for (const item of cases) {
  console.log(`PASS ${item.id} ${item.expectedTool ?? 'refuse'} — ${item.prompt}`);
}
console.log(`\nsummary: cases=${cases.length} fail=${failures.length}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
