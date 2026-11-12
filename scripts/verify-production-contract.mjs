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
const PROTOCOL_VERSION = '2025-06-18';
const EXPECTED_TOOLS = [
  'search_reports',
  'list_reports',
  'get_report',
  'get_usage',
  'search_growth_signals',
  'compare_companies',
];

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

async function rpc(method, params, sessionId) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
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

  // R06: annotations are explicit on every tool (a directory reviewer reads them).
  const missingHints = tools
    .filter((tool) => {
      const meta = tool.annotations ?? {};
      return ['readOnlyHint', 'destructiveHint', 'idempotentHint'].some(
        (key) => typeof meta[key] !== 'boolean'
      );
    })
    .map((tool) => tool.name);
  record(
    'R06 annotation hints',
    missingHints.length === 0,
    missingHints.length ? `missing hints: ${missingHints.join(', ')}` : 'all six tools state the boolean hints'
  );

  // R07: the release manifest must describe the same deployment.
  let release = null;
  try {
    release = await (await fetch(`${BASE}/.well-known/mcp/release.json`)).json();
  } catch {
    release = null;
  }
  record(
    'R07 release manifest',
    Boolean(release) && release?.server?.version === liveVersion,
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
  record(
    'R09 docs parity',
    docGaps.length === 0,
    docGaps.length ? docGaps.join('; ') : 'README and SKILL name all six tools and claim no other count'
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
