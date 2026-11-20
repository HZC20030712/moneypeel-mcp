#!/usr/bin/env node
/**
 * Verify the live MCP contract, and keep a committed snapshot of it.
 *
 * Why this exists (2026-11-12 audit, RELEASE-02 / RELEASE-05 / RELEASE-06):
 * the first release-chain audit found the runtime at 1.4.4 while the declared
 * `tools/list` schema, the plugin package and the docs each described an older
 * contract. A checklist cannot catch that: the drift happens in the gap between
 * what the server serves and what everyone else believes it serves. This script
 * closes the gap by reading the live endpoint, comparing it byte-for-byte with a
 * snapshot committed here, and checking that every version stamp in this
 * repository agrees with the running server.
 *
 * Usage:
 *   node scripts/verify-production-contract.mjs            # check (CI default)
 *   node scripts/verify-production-contract.mjs --write    # refresh the snapshot
 *   node scripts/verify-production-contract.mjs --base=http://localhost:3000
 *
 * Exit codes: 0 all checks PASS, 1 a check FAILed, 2 the endpoint was unreachable.
 * The check is read-only and never spends a read: initialize + tools/list only.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTRACTS = path.join(ROOT, 'contracts');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const value = hit.split('=')[1];
  return value === undefined ? true : value;
};
const BASE = String(arg('base', 'https://moneypeel.com')).replace(/\/$/, '');
const WRITE = Boolean(arg('write', false));
const SPEND = Boolean(arg('spend', false));
const TOKEN = process.env.MONEYPEEL_MCP_BEARER_TOKEN ?? null;
const PROTOCOL_VERSION = '2025-06-18';
const EXPECTED_TOOLS = [
  'search_reports',
  'list_reports',
  'get_report',
  'get_usage',
  'search_growth_signals',
  'compare_companies',
];
const PUBLIC_TOOLS = new Set([
  'search_reports',
  'list_reports',
  'search_growth_signals',
  'compare_companies',
]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}  ${detail}`);
}

function parseBody(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('event:') && !trimmed.startsWith('data:')) {
    return JSON.parse(trimmed);
  }
  let last = null;
  for (const block of trimmed.split(/\n\n/)) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    last = JSON.parse(data);
  }
  return last;
}

async function rpc(method, params, sessionId, token = null) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`${method} answered HTTP ${res.status}`);
  }
  const body = parseBody(await res.text());
  return { body, sessionId: res.headers.get('mcp-session-id') ?? sessionId };
}

function schemaErrors(validate) {
  return (validate.errors ?? [])
    .slice(0, 4)
    .map((entry) => `${entry.instancePath || '/'} ${entry.message}`)
    .join('; ');
}

async function callAndValidate(tool, args, sessionId, token = null) {
  const response = await rpc(
    'tools/call',
    { name: tool.name, arguments: args },
    sessionId,
    token
  );
  const result = response.body?.result;
  if (!result || result.isError === true) {
    return { ok: false, detail: result?.content?.[0]?.text ?? 'missing result' };
  }
  const validate = ajv.compile(tool.outputSchema);
  const ok = validate(result.structuredContent);
  return {
    ok,
    detail: ok
      ? `real tools/call structuredContent matches ${tool.name}.outputSchema`
      : schemaErrors(validate),
    structuredContent: result.structuredContent,
  };
}

async function readJson(relPath) {
  return JSON.parse(await readFile(path.join(ROOT, relPath), 'utf8'));
}

async function main() {
  let init;
  let list;
  try {
    init = await rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'moneypeel-release-chain-verifier', version: '1' },
    });
    list = await rpc('tools/list', {}, init.sessionId);
  } catch (error) {
    console.error(`FAIL the endpoint is unreachable: ${error.message}`);
    process.exit(2);
  }

  const server = init.body?.result?.serverInfo ?? {};
  const tools = list.body?.result?.tools ?? [];
  const liveVersion = server.version ?? null;

  // RELEASE-06: one version across the server, the package and the plugin.
  const pkg = await readJson('package.json');
  const plugin = await readJson('plugin.json');
  record(
    'R01 server version',
    /^\d+\.\d+\.\d+$/.test(String(liveVersion)),
    `live server reports ${liveVersion ?? 'nothing'}`
  );
  record(
    'R02 package.json version',
    pkg.version === liveVersion,
    `package.json ${pkg.version} vs live ${liveVersion}`
  );
  record(
    'R03 plugin.json version',
    plugin.version === liveVersion,
    `plugin.json ${plugin.version} vs live ${liveVersion}`
  );

  // C02/C03: the declared tool set is the one that is served.
  const names = tools.map((tool) => tool.name);
  record(
    'R04 tool set',
    names.length === EXPECTED_TOOLS.length &&
      EXPECTED_TOOLS.every((name) => names.includes(name)),
    `${names.length} tools: ${names.join(', ')}`
  );
  for (const tool of tools) {
    const text = JSON.stringify(tool);
    record(
      `R05 ${tool.name} output schema`,
      Boolean(tool.outputSchema?.properties) && text.includes(liveVersion),
      tool.outputSchema?.properties
        ? `declares ${Object.keys(tool.outputSchema.properties).length} output fields, schemaVersion const ${liveVersion}`
        : 'no outputSchema declared'
    );
  }

  // R06: annotations and auth are explicit on every tool (a directory reviewer reads them).
  const missingHints = tools
    .filter((tool) => {
      const meta = tool.annotations ?? {};
      return ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'].some(
        (key) => typeof meta[key] !== 'boolean'
      );
    })
    .map((tool) => tool.name);
  record(
    'R06 annotation hints',
    missingHints.length === 0,
    missingHints.length ? `missing hints: ${missingHints.join(', ')}` : 'all six tools state all four boolean hints'
  );
  const securityGaps = tools.flatMap((tool) => {
    const schemes = tool._meta?.securitySchemes ?? [];
    const expected = PUBLIC_TOOLS.has(tool.name) ? 'noauth' : 'oauth2';
    return schemes.length === 1 && schemes[0]?.type === expected
      ? []
      : [`${tool.name}=${JSON.stringify(schemes)} expected ${expected}`];
  });
  record(
    'R06b security schemes',
    securityGaps.length === 0,
    securityGaps.length ? securityGaps.join('; ') : 'four noauth tools and two oauth2 tools'
  );

  // R07: the release manifest must describe the same deployment.
  let release = null;
  try {
    release = await (await fetch(`${BASE}/.well-known/mcp/release.json`)).json();
  } catch {
    release = null;
  }
  const releaseTools = release?.tools ?? [];
  const releaseNames = releaseTools.map((tool) => tool.name);
  const releaseExact =
    release?.server?.version === liveVersion &&
    releaseNames.length === EXPECTED_TOOLS.length &&
    EXPECTED_TOOLS.every((name) => releaseNames.includes(name)) &&
    releaseTools.filter((tool) => tool.metered).map((tool) => tool.name).join(',') === 'get_report' &&
    releaseTools.every((tool) => tool.annotations?.openWorldHint === false);
  record(
    'R07 release manifest',
    Boolean(release) && releaseExact,
    release
      ? `release.json server.version ${release.server.version}, ${release.tools?.length ?? 0} tools, metered ${(release.tools ?? []).filter((t) => t.metered).map((t) => t.name).join(',') || 'none'}`
      : 'release.json did not answer'
  );

  const snapshot = {
    $comment:
      'Generated from the production tools/list by scripts/verify-production-contract.mjs. Do not hand-edit: refresh with --write after a deploy.',
    schemaVersion: liveVersion,
    capturedFrom: `${BASE}/mcp`,
    protocolVersion: init.body?.result?.protocolVersion ?? null,
    server,
    tools,
  };
  const target = path.join(CONTRACTS, `tools-list-${liveVersion}.json`);

  if (WRITE) {
    await mkdir(CONTRACTS, { recursive: true });
    await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    record('R08 snapshot written', true, path.relative(ROOT, target));
  } else {
    let committed = null;
    try {
      committed = JSON.parse(await readFile(target, 'utf8'));
    } catch {
      committed = null;
    }
    if (!committed) {
      record(
        'R08 committed contract snapshot',
        false,
        `no contracts/tools-list-${liveVersion}.json — run --write and commit it`
      );
    } else {
      const strip = (value) => JSON.stringify({ ...value, capturedFrom: undefined });
      const same = strip(committed) === strip(snapshot);
      record(
        'R08 committed contract snapshot',
        same,
        same
          ? `contracts/tools-list-${liveVersion}.json matches the live tools/list`
          : `contracts/tools-list-${liveVersion}.json differs from production — the declared contract drifted`
      );
    }
  }

  // R09: the two documents an agent reads must name the served tool set. This is the
  // cheap half of "docs parity": a human still judges whether the words are right, but a
  // document that quietly lists four tools fails here.
  const docs = {
    'README.md': await readFile(path.join(ROOT, 'README.md'), 'utf8'),
    'SKILL.md': await readFile(path.join(ROOT, 'SKILL.md'), 'utf8'),
    'docs/auth.md': await readFile(path.join(ROOT, 'docs/auth.md'), 'utf8'),
  };
  const docGaps = [];
  for (const [file, text] of Object.entries(docs)) {
    for (const name of EXPECTED_TOOLS) {
      if (!text.includes(name)) docGaps.push(`${file} never mentions ${name}`);
    }
    if (/\bfour tools\b|\b4 tools\b/i.test(text)) {
      docGaps.push(`${file} still says "four tools"`);
    }
  }
  const auth = docs['docs/auth.md'];
  for (const name of PUBLIC_TOOLS) {
    if (!auth.includes(name)) docGaps.push(`docs/auth.md never names anonymous ${name}`);
  }
  if (auth.includes('tools/call without a valid token stays 401')) {
    docGaps.push('docs/auth.md still says every tools/call needs auth');
  }
  record(
    'R09 docs parity',
    docGaps.length === 0,
    docGaps.length ? docGaps.join('; ') : 'README, SKILL and auth mirror agree on all six tools and the auth boundary'
  );

  // R10: schemas are executable contracts, not decorations. Exercise every
  // anonymous tool with real production output and validate structuredContent.
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const calls = {};
  calls.search_reports = await callAndValidate(
    byName.get('search_reports'),
    { query: 'ai', limit: 2 },
    list.sessionId
  );
  calls.list_reports = await callAndValidate(
    byName.get('list_reports'),
    { limit: 2 },
    list.sessionId
  );
  calls.search_growth_signals = await callAndValidate(
    byName.get('search_growth_signals'),
    { metric: 'mrr', window: '7d', limit: 1 },
    list.sessionId
  );
  const slugs = (calls.list_reports.structuredContent?.results ?? [])
    .map((row) => row.slug)
    .filter(Boolean)
    .slice(0, 2);
  calls.compare_companies = slugs.length === 2
    ? await callAndValidate(
        byName.get('compare_companies'),
        { slugs },
        list.sessionId
      )
    : { ok: false, detail: 'list_reports did not return two slugs for compare fixture' };
  for (const name of PUBLIC_TOOLS) {
    record(`R10 ${name} real output`, calls[name].ok, calls[name].detail);
  }

  // Authenticated validation is opt-in. CI must never spend a report read.
  if (TOKEN) {
    const usage = await callAndValidate(byName.get('get_usage'), {}, list.sessionId, TOKEN);
    record('R10 get_usage real output', usage.ok, usage.detail);
    if (SPEND) {
      const slug = process.env.MONEYPEEL_REPORT_SLUG;
      if (!slug) {
        record('R10 get_report real output', false, '--spend requires MONEYPEEL_REPORT_SLUG');
      } else {
        const report = await callAndValidate(
          byName.get('get_report'),
          { slug },
          list.sessionId,
          TOKEN
        );
        record('R10 get_report real output', report.ok, report.detail);
      }
    } else {
      console.log('SKIP R10 get_report real output  pass --spend and a slug to authorize one metered read');
    }
  } else {
    console.log('SKIP R10 authenticated outputs  set MONEYPEEL_MCP_BEARER_TOKEN (and --spend for get_report)');
  }

  // R11: discovery must lead a client to this public integration kit, not the
  // private application source repository that older Registry releases named.
  let registry = null;
  try {
    registry = await (
      await fetch(
        'https://registry.modelcontextprotocol.io/v0.1/servers?search=' +
          encodeURIComponent('com.moneypeel/reports')
      )
    ).json();
  } catch {
    registry = null;
  }
  const latest = (registry?.servers ?? []).find(
    (entry) =>
      entry?.server?.name === 'com.moneypeel/reports' &&
      entry?._meta?.['io.modelcontextprotocol.registry/official']?.isLatest === true
  );
  record(
    'R11 official Registry discovery',
    latest?.server?.version === liveVersion &&
      latest?.server?.repository?.url ===
        'https://github.com/HZC20030712/moneypeel-mcp',
    latest
      ? `${latest.server.name}@${latest.server.version} -> ${latest.server.repository?.url}`
      : 'no latest official Registry record found'
  );

  const failed = results.filter((entry) => !entry.ok);
  console.log(
    `\nsummary: pass=${results.length - failed.length} fail=${failed.length} | base=${BASE} | version=${liveVersion}`
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`FAIL verifier crashed: ${error.stack ?? error}`);
  process.exit(1);
});
