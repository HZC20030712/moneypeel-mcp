#!/usr/bin/env node
/**
 * REAL model behaviour eval runner (2026-11-26 audit §5.3 / EVAL-01).
 *
 * The corpus in evals/agent-recommendation-cases.json is only data; the static
 * lint in scripts/verify-agent-evals.mjs checks its shape. THIS script is the
 * behaviour test: it gives a pinned model the live MCP tool definitions, lets it
 * choose tools, executes only the FREE tools, records the tool trace and the
 * final answer, and checks the corpus rubric (expected tool, required wording,
 * forbidden claims).
 *
 * Without a model API key it does NOT fabricate a result: it prints SKIP and
 * says exactly which environment variables are required. SKIP is NOT VERIFIED,
 * never PASS. A future hard gate can pass --require to turn a missing key into a
 * FAIL instead.
 *
 * Required when running for real:
 *   MONEYPEEL_MODEL_EVAL_API_KEY   provider key (never printed)
 *   MONEYPEEL_MODEL_EVAL_MODEL     exact model/version id, e.g. a vendor-pinned id
 * Optional:
 *   MONEYPEEL_MODEL_EVAL_BASE_URL  OpenAI-compatible base (default https://api.openai.com/v1)
 *   MONEYPEEL_MODEL_EVAL_LIMIT     run only the first N cases
 *   MONEYPEEL_MODEL_EVAL_MAX_TURNS tool-call rounds per case (default 3)
 *   MONEYPEEL_MODEL_EVAL_TEMPERATURE (default 0)
 *   MONEYPEEL_MCP_BASE             MCP endpoint (default https://moneypeel.com)
 *
 * Safety: metered tools (get_report, get_usage) are NEVER executed by this
 * runner — a CI run must not spend a read. If the model calls one, the case is
 * SKIPped with that reason instead of inventing an answer.
 *
 * Exit codes: 0 all run cases PASS (or SKIP without a key), 1 any FAIL,
 * 2 configuration problem (with --require).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_BASE = (process.env.MONEYPEEL_MCP_BASE ?? 'https://moneypeel.com').replace(/\/$/, '');
const API_KEY = process.env.MONEYPEEL_MODEL_EVAL_API_KEY ?? null;
const MODEL = process.env.MONEYPEEL_MODEL_EVAL_MODEL ?? null;
const BASE_URL = (process.env.MONEYPEEL_MODEL_EVAL_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
const LIMIT = Number(process.env.MONEYPEEL_MODEL_EVAL_LIMIT ?? 0) || 0;
const MAX_TURNS = Number(process.env.MONEYPEEL_MODEL_EVAL_MAX_TURNS ?? 3) || 3;
const TEMPERATURE = Number(process.env.MONEYPEEL_MODEL_EVAL_TEMPERATURE ?? 0);
const REQUIRE_KEY = process.argv.includes('--require');
const TIMEOUT_MS = 60000;
const METERED_TOOLS = new Set(['get_report', 'get_usage']);
const FREE_TOOLS = new Set(['search_reports', 'list_reports', 'search_growth_signals', 'compare_companies']);

const cases = JSON.parse(
  await readFile(path.join(ROOT, 'evals', 'agent-recommendation-cases.json'), 'utf8')
).slice(0, LIMIT > 0 ? LIMIT : undefined);
const skill = await readFile(path.join(ROOT, 'SKILL.md'), 'utf8');

function parseBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('event:') && !trimmed.startsWith('data:')) return JSON.parse(trimmed);
  let last = null;
  for (const block of trimmed.split(/\n\n/)) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      last = JSON.parse(data);
    } catch {
      /* keepalive */
    }
  }
  return last;
}

function createMcpClient() {
  let id = 1;
  let session = null;
  let protocol = '2025-06-18';
  async function post(payload) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': protocol,
    };
    if (session) headers['mcp-session-id'] = session;
    const response = await fetch(`${MCP_BASE}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    const body = text ? parseBody(text) : null;
    const nextSession = response.headers.get('mcp-session-id');
    if (nextSession) session = nextSession;
    return { status: response.status, body };
  }
  return {
    async initialize() {
      const reply = await post({
        jsonrpc: '2.0',
        id: id++,
        method: 'initialize',
        params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'moneypeel-model-evals', version: '1' } },
      });
      if (reply.body?.result?.protocolVersion) protocol = reply.body.result.protocolVersion;
      await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      return reply.body?.result?.serverInfo ?? {};
    },
    async listTools() {
      const reply = await post({ jsonrpc: '2.0', id: id++, method: 'tools/list', params: {} });
      return reply.body?.result?.tools ?? [];
    },
    async callTool(name, args) {
      const reply = await post({
        jsonrpc: '2.0',
        id: id++,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const result = reply.body?.result ?? null;
      if (result?.isError) return { error: result.structuredContent?.error ?? { message: 'tool error' } };
      return result?.structuredContent ?? null;
    },
  };
}

async function chat(modelTools, messages) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: modelTools,
      tool_choice: 'auto',
      temperature: TEMPERATURE,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`chat/completions HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text);
  const message = body?.choices?.[0]?.message;
  if (!message) throw new Error('chat/completions returned no message');
  return message;
}

function textOf(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n');
  }
  return '';
}

function normaliseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const meteredHit = [];

function rubric(caseItem, finalText, toolTrace) {
  const problems = [];
  const text = finalText.toLowerCase();
  if (!finalText.trim()) problems.push('empty final answer');
  if (caseItem.expectedTool !== null && !toolTrace.includes(caseItem.expectedTool)) {
    problems.push(`expected tool ${caseItem.expectedTool} was not called (trace: ${toolTrace.join(',') || 'none'})`);
  }
  for (const phrase of caseItem.mustMention ?? []) {
    if (!text.includes(String(phrase).toLowerCase())) problems.push(`missing required wording: ${phrase}`);
  }
  for (const phrase of caseItem.mustNotClaim ?? []) {
    if (text.includes(String(phrase).toLowerCase())) problems.push(`forbidden claim present: ${phrase}`);
  }
  return problems;
}

async function main() {
  console.log(
    'model behaviour evals | cases=' + cases.length + ' | endpoint=' + MCP_BASE + ' | model=' + (MODEL ?? 'unset')
  );
  if (!API_KEY) {
    console.log(
      'SKIP model evals — MONEYPEEL_MODEL_EVAL_API_KEY is not set. Behaviour NOT VERIFIED; this is not a PASS.'
    );
    console.log(
      'required to run: MONEYPEEL_MODEL_EVAL_API_KEY and MONEYPEEL_MODEL_EVAL_MODEL (a pinned model id); optional MONEYPEEL_MODEL_EVAL_BASE_URL, MONEYPEEL_MODEL_EVAL_LIMIT.'
    );
    console.log(
      `summary: model_evals pass=0 fail=0 skip=${cases.length} (NOT VERIFIED — no model API key configured)`
    );
    process.exitCode = REQUIRE_KEY ? 2 : 0;
    return;
  }
  if (!MODEL) {
    console.error('FAIL model evals — MONEYPEEL_MODEL_EVAL_API_KEY is set but MONEYPEEL_MODEL_EVAL_MODEL is missing (pin an exact model id).');
    process.exitCode = 2;
    return;
  }

  const client = createMcpClient();
  const server = await client.initialize();
  const tools = await client.listTools();
  if (tools.length === 0) {
    console.error('FAIL model evals — live MCP tools/list returned no tools');
    process.exitCode = 1;
    return;
  }
  console.log(`MCP ${server.name ?? '?'}@${server.version ?? '?'} declares ${tools.length} tools`);
  const modelTools = tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
  const systemPrompt =
    'You are answering a user with the MoneyPeel MCP tools. Use the tools when they answer the question; ' +
    'never invent numbers; carry each figure\'s as-of date and evidence/economic basis; ' +
    'refuse profit, churn, retention, margin or take-rate questions instead of estimating them from revenue; ' +
    'do not retry a quota failure. Follow the product guardrails below.\n\n' +
    skill.slice(0, 8000);

  const results = { pass: 0, fail: 0, skip: 0 };
  for (const caseItem of cases) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: caseItem.prompt },
    ];
    const trace = [];
    let finalText = '';
    let caseSkip = null;
    try {
      for (let turn = 0; turn < MAX_TURNS; turn += 1) {
        const message = await chat(modelTools, messages);
        messages.push(message);
        const calls = message.tool_calls ?? [];
        if (calls.length === 0) {
          finalText = textOf(message);
          break;
        }
        for (const call of calls) {
          const name = call?.function?.name;
          const args = normaliseArgs(call?.function?.arguments);
          trace.push(name);
          if (METERED_TOOLS.has(name)) {
            caseSkip = `model requested metered tool ${name}; not executed (CI must not spend a read)`;
            meteredHit.push(caseItem.id);
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: 'NOT EXECUTED: metered read not authorized in CI.',
            });
            continue;
          }
          if (!FREE_TOOLS.has(name)) {
            messages.push({ role: 'tool', tool_call_id: call.id, content: `NOT EXECUTED: unknown tool ${name}` });
            continue;
          }
          const result = await client.callTool(name, args);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 4000),
          });
        }
        if (caseSkip) break;
      }
      if (caseSkip) {
        results.skip += 1;
        console.log(`MODEL_EVAL SKIP ${caseItem.id} — ${caseSkip}`);
        continue;
      }
      if (!finalText) {
        results.fail += 1;
        console.log(`MODEL_EVAL FAIL ${caseItem.id} — no final answer within ${MAX_TURNS} turns (trace: ${trace.join(',') || 'none'})`);
        continue;
      }
      const problems = rubric(caseItem, finalText, trace);
      if (problems.length) {
        results.fail += 1;
        console.log(`MODEL_EVAL FAIL ${caseItem.id} — ${problems.join('; ')} | trace=${trace.join(',') || 'none'} | answer=${finalText.replace(/\s+/g, ' ').slice(0, 160)}`);
      } else {
        results.pass += 1;
        console.log(`MODEL_EVAL PASS ${caseItem.id} — tool=${trace.join(',') || 'none'} answer=${finalText.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    } catch (error) {
      results.fail += 1;
      console.log(`MODEL_EVAL FAIL ${caseItem.id} — runner error: ${String(error?.message ?? error)}`);
    }
  }
  console.log(
    `\nsummary: model_evals pass=${results.pass} fail=${results.fail} skip=${results.skip} | model=${MODEL} | base=${BASE_URL}`
  );
  if (results.fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL model evals crashed: ${error?.stack ?? error}`);
  process.exit(1);
});
