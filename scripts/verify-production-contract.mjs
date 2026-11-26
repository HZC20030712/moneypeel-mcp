#!/usr/bin/env node
/**
 * Verify the live MCP contract, keep a committed snapshot, and exercise the
 * behaviour a client actually relies on.
 *
 * Why this exists (2026-11-12 audit RELEASE-02/05/06, then 2026-11-26 audit
 * §5.2 CI-01..CI-10): the release-chain drift happens in the gap between what
 * the server serves and what this repository says it serves, and it is invisible
 * to a checklist. Every check below reads production or this repository; none of
 * them trusts a hand-written expectation.
 *
 * Usage:
 *   node scripts/verify-production-contract.mjs            # anonymous checks (CI)
 *   node scripts/verify-production-contract.mjs --write    # refresh the snapshot atomically
 *   node scripts/verify-production-contract.mjs --base=http://localhost:3000
 *   node scripts/verify-production-contract.mjs --authenticated   # get_usage (needs token)
 *   node scripts/verify-production-contract.mjs --authenticated --spend  # + one get_report read
 *   node scripts/verify-production-contract.mjs --self-test        # offline unit checks
 *
 * Token: MONEYPEEL_MCP_BEARER_TOKEN. The authenticated path is opt-in; CI must
 * never spend a read unless a dedicated workflow passes --authenticated --spend
 * with an explicit report slug (MONEYPEEL_REPORT_SLUG).
 *
 * Exit codes: 0 no FAIL, 1 a check FAILed, 2 the endpoint was unreachable.
 * SKIP is printed for unconfigured checks and is never counted as PASS.
 *
 * Audit mapping:
 *   CI-01 R05: exact schemaVersion const paths, any wrong const FAILs
 *   CI-02 growth fixtures: revenue_30d 7d + 30d non-empty, MRR 7d negative
 *   CI-03 search/list/compare fixtures: pagination, null MRR, same/cross basis,
 *         lang, invalid_cursor
 *   CI-04 authenticated checks live behind an explicit flag + workflow
 *   CI-05 handshake: initialize -> notifications/initialized, protocol header,
 *         AbortSignal timeouts, JSON-RPC id/error handling, no auto-retry
 *   CI-06 R08: canonical key-order-insensitive comparison, semantics vs formatting
 *   CI-07 --write: temp file + atomic rename, provenance, unapproved marker
 *   CI-08 R11: Registry status/version/remote/repository + pagination; network
 *         failure and metadata errors are reported separately
 *   CI-09 R06b: exact oauth2 scopes + anonymous/forged-token negative checks
 *   CI-10 workflow: Node 22 / actions v5 (see .github/workflows/contract-drift.yml)
 */

import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTRACTS = path.join(ROOT, 'contracts');
const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const CANONICAL_REPO = 'https://github.com/HZC20030712/moneypeel-mcp';
const CANONICAL_REMOTE = 'https://moneypeel.com/mcp';

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
const AUTHENTICATED = Boolean(arg('authenticated', false));
const AUTH_ONLY = Boolean(arg('auth-only', false));
const REQUIRE_AUTH = Boolean(arg('require-auth', false));
const SELF_TEST = Boolean(arg('self-test', false));
const TOKEN = process.env.MONEYPEEL_MCP_BEARER_TOKEN ?? null;
const REPORT_SLUG = process.env.MONEYPEEL_REPORT_SLUG ?? null;
const TIMEOUT_MS = Number(arg('timeout', 20000));
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
const GROWTH_KINDS = new Set([
  'sustained_growth',
  'spike_driven',
  'newly_observed',
  'period_over_period',
]);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const results = [];
function record(id, ok, detail, extra = {}) {
  results.push({ id, status: ok ? 'PASS' : 'FAIL', detail, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}  ${detail}`);
}
function skip(id, detail) {
  results.push({ id, status: 'SKIP', detail });
  console.log(`SKIP ${id}  ${detail}`);
}
function schemaErrors(validate) {
  return (validate.errors ?? [])
    .slice(0, 6)
    .map((entry) => `${entry.instancePath || '/'} ${entry.message}`)
    .join('; ');
}

// ---------------------------------------------------------------- canonical JSON (CI-06)
/**
 * Order-normalise a JSON value for comparison: object keys are sorted, array
 * order is preserved (an array order can be semantic: e.g. schema enum values,
 * required lists and anyOf branches have a declared order). This is what lets
 * R08 distinguish "the snapshot's keys were reordered" (representation) from
 * "the declared contract changed" (semantic).
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}
function canonicalString(value) {
  return JSON.stringify(canonical(value));
}
/** First N semantic differences as JSON-Pointer-ish paths. */
function diffJson(expected, actual, at = '$', out = [], limit = 40) {
  if (out.length >= limit) return out;
  if (Object.is(expected, actual)) return out;
  const eo = expected && typeof expected === 'object' && !Array.isArray(expected);
  const ao = actual && typeof actual === 'object' && !Array.isArray(actual);
  if (eo && ao) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      if (!(key in actual)) out.push(`${at}.${key} missing`);
      else if (!(key in expected)) out.push(`${at}.${key} unexpected`);
      else diffJson(expected[key], actual[key], `${at}.${key}`, out, limit);
      if (out.length >= limit) return out;
    }
    return out;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push(`${at} length ${expected.length} -> ${actual.length}`);
      return out;
    }
    expected.forEach((item, index) => {
      diffJson(item, actual[index], `${at}[${index}]`, out, limit);
    });
    return out;
  }
  out.push(`${at} changed`);
  return out;
}
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------- MCP client (CI-05)
function parseBody(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
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
    try {
      last = JSON.parse(data);
    } catch {
      /* an SSE comment/keepalive is not the reply */
    }
  }
  return last;
}

/**
 * Minimal MCP Streamable-HTTP client with the full handshake a real client
 * performs: initialize, notifications/initialized, then the negotiated protocol
 * header on every later request. No automatic retries: a metered tools/call
 * must never be replayed by the verifier.
 */
function createClient(token = null) {
  let nextId = 1;
  let sessionId = null;
  let protocolVersion = PROTOCOL_VERSION;
  async function post(payload) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': protocolVersion,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    const body = text ? parseBody(text) : null;
    const responseSession = response.headers.get('mcp-session-id');
    if (responseSession) sessionId = responseSession;
    if (body && Array.isArray(payload.id) === false && payload.id !== undefined) {
      if (body.id !== payload.id) {
        throw new Error(`JSON-RPC id mismatch: sent ${payload.id}, got ${body.id}`);
      }
    }
    return { status: response.status, headers: response.headers, body };
  }
  return {
    get protocolVersion() {
      return protocolVersion;
    },
    get sessionId() {
      return sessionId;
    },
    async initialize() {
      const reply = await post({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'moneypeel-release-chain-verifier', version: '2' },
        },
      });
      if (reply.body?.result?.protocolVersion) {
        protocolVersion = reply.body.result.protocolVersion;
      }
      // A notification (no id): per the spec the server MUST NOT reply. The
      // stateless production server answers -32601 to the POST, which is
      // tolerated and reported, not silently ignored.
      const initialized = await post({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      });
      return {
        reply,
        initialized: {
          status: initialized.status,
          code: initialized.body?.error?.code ?? null,
        },
      };
    },
    async rpc(method, params) {
      return post({ jsonrpc: '2.0', id: nextId++, method, params });
    },
    async callTool(name, args) {
      const reply = await post({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      });
      const result = reply.body?.result ?? null;
      return {
        status: reply.status,
        isError: result?.isError === true,
        structured: result?.structuredContent ?? null,
        error: result?.structuredContent?.error ?? reply.body?.error ?? null,
        content: result?.content ?? null,
        headers: reply.headers,
      };
    },
    async rawToolCall(name, args, overrideHeaders = {}) {
      const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': protocolVersion,
        ...overrideHeaders,
      };
      if (sessionId) headers['mcp-session-id'] = sessionId;
      const response = await fetch(`${BASE}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: nextId++,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      let body = null;
      try {
        body = text ? parseBody(text) : null;
      } catch {
        body = { raw: text.slice(0, 300) };
      }
      return { status: response.status, headers: response.headers, body, text };
    },
  };
}

async function readJson(relPath) {
  return JSON.parse(await readFile(path.join(ROOT, relPath), 'utf8'));
}

/** Walk a JSON schema and collect {path, const} for every schemaVersion const. */
function schemaVersionConsts(node, at = 'outputSchema', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((item, index) => schemaVersionConsts(item, `${at}[${index}]`, out));
    return out;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'schemaVersion')) {
    const declared = node.schemaVersion;
    if (declared && typeof declared === 'object' && 'const' in declared) {
      out.push({ path: `${at}.schemaVersion.const`, value: declared.const });
    } else if (typeof declared === 'string') {
      out.push({ path: `${at}.schemaVersion`, value: declared, notConst: true });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    schemaVersionConsts(value, `${at}.${key}`, out);
  }
  return out;
}

function validateStructured(tool, structured) {
  if (!tool?.outputSchema) return { ok: false, detail: 'tool declares no outputSchema' };
  const validate = ajv.compile(tool.outputSchema);
  const ok = validate(structured);
  return { ok, detail: ok ? 'structuredContent matches declared outputSchema' : schemaErrors(validate) };
}

// ---------------------------------------------------------------- self-test (offline)
function selfTest() {
  const problems = [];
  const eq = (label, actual, expected) => {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) problems.push(`${label}: ${left} != ${right}`);
  };
  eq('key order equal', canonicalString({ b: 1, a: { d: 2, c: 3 } }), canonicalString({ a: { c: 3, d: 2 }, b: 1 }));
  eq('array order preserved', canonicalString([1, 2]), '[1,2]');
  if (canonicalString([1, 2]) === canonicalString([2, 1])) problems.push('array order must be semantic');
  const diffs = diffJson({ a: 1, b: { c: 2 } }, { a: 1, b: { d: 3 } });
  if (!diffs.some((line) => line.includes('$.b.c missing'))) problems.push('missing path not reported');
  if (!diffs.some((line) => line.includes('$.b.d unexpected'))) problems.push('unexpected path not reported');
  const versionPaths = schemaVersionConsts({
    properties: {
      source: { properties: { schemaVersion: { const: '1.4.6' } } },
      nested: [{ schemaVersion: { const: '1.4.5' } }],
    },
  });
  eq('schemaVersion walker', versionPaths.map((entry) => [entry.path, entry.value]), [
    ['outputSchema.properties.source.properties.schemaVersion.const', '1.4.6'],
    ['outputSchema.properties.nested[0].schemaVersion.const', '1.4.5'],
  ]);
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL self-test ${problem}`);
    record('SELF canonicalisation', false, problems.join('; '));
    return false;
  }
  record('SELF canonicalisation', true, 'key order ignored, array order preserved, diff paths reported, schemaVersion walker exact');
  return true;
}

// ---------------------------------------------------------------- Registry (CI-08)
async function readRegistryLatest(version) {
  const MAX_PAGES = 5;
  let cursor = null;
  let pages = 0;
  let totalSeen = 0;
  const seen = [];
  for (;;) {
    const url = new URL(REGISTRY_URL);
    url.searchParams.set('search', 'com.moneypeel/reports');
    if (cursor) url.searchParams.set('cursor', cursor);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`Registry answered HTTP ${response.status}`);
    }
    const body = await response.json();
    pages += 1;
    const entries = Array.isArray(body?.servers) ? body.servers : [];
    totalSeen += entries.length;
    for (const entry of entries) {
      if (entry?.server?.name !== 'com.moneypeel/reports') continue;
      const official = entry?._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
      seen.push({
        version: entry.server.version ?? null,
        status: official.status ?? null,
        isLatest: official.isLatest === true,
        remotes: entry.server.remotes ?? [],
        repository: entry.server.repository?.url ?? null,
      });
    }
    const next = body?.metadata?.nextCursor ?? null;
    if (!next || pages >= MAX_PAGES) break;
    cursor = next;
  }
  const latest = seen.find((entry) => entry.isLatest) ?? null;
  return { pages, totalSeen, versions: seen.map((entry) => entry.version), latest };
}

// ---------------------------------------------------------------- main
async function main() {
  if (SELF_TEST) {
    const ok = selfTest();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  let handshake;
  try {
    const client = createClient();
    handshake = await client.initialize();
    const server = handshake.reply.body?.result?.serverInfo ?? {};
    const liveVersion = server.version ?? null;
    console.log(
      `MCP contract verifier | base=${BASE} | server=${server.name ?? '?'}@${liveVersion ?? '?'} | protocol=${client.protocolVersion}`
    );
    const handshakeOk =
      handshake.reply.status === 200 &&
      Boolean(handshake.reply.body?.result?.serverInfo) &&
      /^\d+\.\d+\.\d+$/.test(String(liveVersion));
    record(
      'R00 MCP handshake',
      handshakeOk,
      `initialize ${handshake.reply.status} -> protocol ${client.protocolVersion}; notifications/initialized ${handshake.initialized.status}${handshake.initialized.code !== null ? ` (JSON-RPC ${handshake.initialized.code} tolerated)` : ''}; session=${client.sessionId ?? 'stateless'}`
    );
    if (!handshakeOk) {
      record('R00 abort', false, 'initialize did not return a usable serverInfo');
      summarize(liveVersion);
      return;
    }

    const toolsReply = await client.rpc('tools/list', {});
    const tools = toolsReply.body?.result?.tools ?? [];
    const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
    if (AUTH_ONLY) {
      // The dedicated authenticated workflow runs only R12: it must not fail for
      // an unrelated Registry/snapshot drift, and it must never mix in a read.
      await runAuthenticated(toolByName);
      summarize(liveVersion);
      return;
    }

    // R01-R03 versions -----------------------------------------------------
    const pkg = await readJson('package.json');
    const plugin = await readJson('plugin.json');
    record('R01 server version', /^\d+\.\d+\.\d+$/.test(String(liveVersion)), `live server reports ${liveVersion}`);
    record('R02 package.json version', pkg.version === liveVersion, `package.json ${pkg.version} vs live ${liveVersion}`);
    record('R03 plugin.json version', plugin.version === liveVersion, `plugin.json ${plugin.version} vs live ${liveVersion}`);

    // R04 tool set ---------------------------------------------------------
    const names = tools.map((tool) => tool.name);
    record(
      'R04 tool set',
      names.length === EXPECTED_TOOLS.length && EXPECTED_TOOLS.every((name) => names.includes(name)),
      `${names.length} tools: ${names.join(', ')}`
    );

    // R05 exact schemaVersion consts (CI-01) ------------------------------
    const versionProblems = [];
    for (const tool of tools) {
      const consts = schemaVersionConsts(tool.outputSchema);
      if (consts.length === 0) {
        versionProblems.push(`${tool.name}: no schemaVersion const declared`);
        continue;
      }
      for (const entry of consts) {
        if (entry.notConst) versionProblems.push(`${entry.path} is a plain string, not a const`);
        else if (entry.value !== liveVersion) versionProblems.push(`${entry.path}=${entry.value} != ${liveVersion}`);
        else if (entry.value !== pkg.version) versionProblems.push(`${entry.path}=${entry.value} != package.json ${pkg.version}`);
      }
      versionProblems.push(
        ...consts
          .filter((entry) => entry.value !== liveVersion)
          .map((entry) => `${tool.name}: ${entry.path} has ${entry.value}, expected ${liveVersion}`)
      );
    }
    const uniqueProblems = [...new Set(versionProblems)];
    record(
      'R05 schemaVersion const paths',
      uniqueProblems.length === 0,
      uniqueProblems.length
        ? uniqueProblems.slice(0, 8).join('; ')
        : `${tools.length} tools, every schemaVersion path is const ${liveVersion}`
    );

    // R06 annotations ------------------------------------------------------
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

    // R06b security schemes + scopes (CI-09 part 1) -----------------------
    const securityProblems = [];
    for (const tool of tools) {
      const schemes = tool._meta?.securitySchemes ?? [];
      const expectedType = PUBLIC_TOOLS.has(tool.name) ? 'noauth' : 'oauth2';
      if (!Array.isArray(schemes) || schemes.length !== 1 || schemes[0]?.type !== expectedType) {
        securityProblems.push(`${tool.name}=${JSON.stringify(schemes)} expected one ${expectedType}`);
        continue;
      }
      if (expectedType === 'oauth2') {
        const scopes = schemes[0].scopes;
        if (!Array.isArray(scopes) || JSON.stringify(scopes) !== JSON.stringify(['openid'])) {
          securityProblems.push(`${tool.name} scopes=${JSON.stringify(scopes)} expected ["openid"]`);
        }
      } else if (schemes[0].scopes !== undefined) {
        securityProblems.push(`${tool.name} noauth must not declare scopes`);
      }
    }
    record(
      'R06b security schemes + scopes',
      securityProblems.length === 0,
      securityProblems.length ? securityProblems.join('; ') : 'four noauth tools and two oauth2 tools with exactly [openid]'
    );

    // R07 release manifest ------------------------------------------------
    let release = null;
    try {
      release = await (await fetch(`${BASE}/.well-known/mcp/release.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) })).json();
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
        ? `release.json server.version ${release.server.version}, ${release.tools?.length ?? 0} tools, metered ${(release.tools ?? []).filter((tool) => tool.metered).map((tool) => tool.name).join(',') || 'none'}`
        : 'release.json did not answer'
    );

    // R10 fixtures (CI-02/CI-03/CI-09 negative) ---------------------------
    const callStructured = async (name, args) => {
      const tool = toolByName.get(name);
      if (!tool) throw new Error(`${name} is not declared by tools/list`);
      const reply = await client.callTool(name, args);
      if (reply.status !== 200) throw new Error(`${name} answered HTTP ${reply.status}`);
      return { tool, reply };
    };
    const validateCall = async (label, name, args) => {
      try {
        const { tool, reply } = await callStructured(name, args);
        // Keep structuredContent on an isError reply: an MCP tool error carries
        // a machine-readable {error:{code,message}} that negative fixtures assert.
        if (reply.isError) return { ok: false, detail: `tool error: ${JSON.stringify(reply.error)}`, structured: reply.structured };
        const validation = validateStructured(tool, reply.structured);
        return { ok: validation.ok, detail: validation.detail, structured: reply.structured };
      } catch (error) {
        return { ok: false, detail: String(error?.message ?? error), structured: null };
      }
    };

    // CI-03 pagination + invalid_cursor (search, free)
    const page1 = await validateCall('search page1', 'search_reports', { query: 'saas', limit: 3 });
    const page2 = page1.structured?.nextCursor
      ? await validateCall('search page2', 'search_reports', {
          query: 'saas',
          limit: 3,
          cursor: page1.structured.nextCursor,
        })
      : { ok: false, detail: 'page1 returned no nextCursor', structured: null };
    const page1Slugs = (page1.structured?.results ?? []).map((row) => row.slug);
    const page2Slugs = (page2.structured?.results ?? []).map((row) => row.slug);
    const overlap = page1Slugs.filter((slug) => page2Slugs.includes(slug));
    record(
      'R10 search pagination',
      page1.ok && page2.ok && page1Slugs.length > 0 && page2Slugs.length > 0 && overlap.length === 0,
      page1.ok && page2.ok
        ? `pages=${page1Slugs.length}/${page2Slugs.length} overlap=${overlap.length} total=${page1.structured.total}`
        : `${page1.detail}; ${page2.detail}`
    );
    if (page1.structured?.nextCursor) {
      const staleCursor = await validateCall('invalid cursor', 'search_reports', {
        query: 'different-query-for-cursor',
        limit: 3,
        cursor: page1.structured.nextCursor,
      });
      const code = staleCursor.structured?.error?.code ?? null;
      record(
        'R10 invalid_cursor on changed query',
        !staleCursor.ok && code === 'invalid_cursor',
        staleCursor.ok ? 'changed query with an old cursor was accepted' : `error.code=${code ?? 'missing'}`
      );
    } else {
      skip('R10 invalid_cursor on changed query', 'page1 returned no cursor to reuse');
    }

    // CI-03 language fixture
    const en = await validateCall('lang en', 'search_reports', { query: 'ai', limit: 1, lang: 'en' });
    const zh = await validateCall('lang zh', 'search_reports', { query: 'ai', limit: 1, lang: 'zh' });
    const enText = en.structured?.results?.[0]?.description ?? '';
    const zhText = zh.structured?.results?.[0]?.description ?? '';
    record(
      'R10 lang en/zh fixture',
      en.ok && zh.ok && Boolean(enText) && Boolean(zhText) && enText !== zhText && /\p{Script=Han}/u.test(zhText),
      en.ok && zh.ok ? `en=${enText.slice(0, 48)} zh=${zhText.slice(0, 48)}` : `${en.detail}; ${zh.detail}`
    );

    // CI-03 null MRR fixture: displayMrr null but raw mrr kept, applicability not_applicable
    const listPage = await validateCall('list page', 'list_reports', { limit: 20 });
    const nullMrrRows = (listPage.structured?.results ?? []).filter((row) => row.displayMrr === null);
    if (nullMrrRows.length === 0) {
      skip('R10 null MRR fixture', 'no displayMrr:null row on the first list_reports page');
    } else {
      const nullRow = nullMrrRows[0];
      const applicability = nullRow.dataQuality?.metricApplicability?.mrr ?? null;
      const rawKept = typeof nullRow.mrr === 'number' && nullRow.mrr >= 0;
      record(
        'R10 null MRR fixture',
        listPage.ok && rawKept && applicability === 'not_applicable' && nullRow.dataQuality?.ratioStatus === 'not_comparable',
        `${nullRow.slug}: displayMrr=null rawMrr=${nullRow.mrr} applicability=${applicability} ratioStatus=${nullRow.dataQuality?.ratioStatus}`
      );
    }

    // CI-03 same-basis compare (fixed pair: subscription_charges)
    const sameBasis = await validateCall('compare same basis', 'compare_companies', {
      slugs: ['postiz', 'cometly'],
    });
    const sameAmountFields = (sameBasis.structured?.fields ?? []).filter((field) => ['mrr', 'revenue_30d'].includes(field.key));
    const sameStatuses = sameAmountFields.flatMap((field) => field.cells.map((cell) => cell.status));
    record(
      'R10 compare same basis',
      sameBasis.ok && sameAmountFields.length === 2 && sameStatuses.every((status) => status === 'comparable'),
      sameBasis.ok
        ? `mrr/revenue_30d statuses=${sameStatuses.join(',')} notes=${(sameBasis.structured.notes ?? []).length}`
        : sameBasis.detail
    );

    // CI-03 cross-basis compare (fixed pair: service_billings vs subscription_charges)
    const crossBasis = await validateCall('compare cross basis', 'compare_companies', {
      slugs: ['comp-ai', 'postiz'],
    });
    const crossAmountFields = (crossBasis.structured?.fields ?? []).filter((field) => ['mrr', 'revenue_30d'].includes(field.key));
    const crossRevenueCells = (crossAmountFields.find((field) => field.key === 'revenue_30d')?.cells ?? []);
    const mixedNote = (crossBasis.structured?.notes ?? []).some((note) => /mixes 2 economic bases/i.test(note));
    record(
      'R10 compare cross basis',
      crossBasis.ok &&
        crossRevenueCells.length === 2 &&
        crossRevenueCells.every((cell) => cell.status === 'different_basis') &&
        mixedNote,
      crossBasis.ok
        ? `revenue_30d statuses=${crossRevenueCells.map((cell) => cell.status).join(',')} mixedBasisNote=${mixedNote}`
        : crossBasis.detail
    );

    // CI-02 growth fixtures: revenue_30d 7d + 30d non-empty, MRR 7d negative
    const growth7 = await validateCall('growth 7d', 'search_growth_signals', {
      metric: 'revenue_30d',
      window: '7d',
      limit: 5,
    });
    const growth7Rows = growth7.structured?.results ?? [];
    const growth7Problems = [];
    if (!growth7.ok) growth7Problems.push(growth7.detail);
    if (growth7Rows.length === 0) growth7Problems.push('no rows');
    for (const [index, row] of growth7Rows.entries()) {
      const label = `row${index}(${row.slug})`;
      if (row.window !== '7d') growth7Problems.push(`${label} window=${row.window}`);
      if (!GROWTH_KINDS.has(row.kind)) growth7Problems.push(`${label} kind=${row.kind}`);
      if (typeof row.percentage !== 'number') growth7Problems.push(`${label} percentage missing`);
      if (typeof row.absolute !== 'number') growth7Problems.push(`${label} absolute missing`);
      if (typeof row.baseline !== 'number') growth7Problems.push(`${label} baseline missing`);
      if (typeof row.dataPoints !== 'number' || row.dataPoints < 2) growth7Problems.push(`${label} dataPoints=${row.dataPoints}`);
      if (row.windowBasis === 'daily_series' && row.dataPoints < 14) growth7Problems.push(`${label} daily_series dataPoints=${row.dataPoints}`);
      if (typeof row.windowStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.windowStart)) growth7Problems.push(`${label} windowStart=${row.windowStart}`);
    }
    record(
      'R10 growth revenue_30d 7d',
      growth7Problems.length === 0,
      growth7Problems.length ? growth7Problems.slice(0, 5).join('; ') : `rows=${growth7Rows.length} total=${growth7.structured.total} kinds=${[...new Set(growth7Rows.map((row) => row.kind))].join(',')}`
    );

    const growth30 = await validateCall('growth 30d', 'search_growth_signals', {
      metric: 'revenue_30d',
      window: '30d',
      limit: 5,
    });
    const growth30Rows = growth30.structured?.results ?? [];
    const growth30Problems = [];
    if (!growth30.ok) growth30Problems.push(growth30.detail);
    if (growth30Rows.length === 0) growth30Problems.push('no rows');
    for (const [index, row] of growth30Rows.entries()) {
      const label = `row${index}(${row.slug})`;
      if (row.window !== '30d') growth30Problems.push(`${label} window=${row.window}`);
      if (!GROWTH_KINDS.has(row.kind)) growth30Problems.push(`${label} kind=${row.kind}`);
      if (typeof row.percentage !== 'number') growth30Problems.push(`${label} percentage missing`);
      if (typeof row.baseline !== 'number') growth30Problems.push(`${label} baseline missing`);
      if (typeof row.start !== 'number' || typeof row.end !== 'number') growth30Problems.push(`${label} start/end missing`);
      if (typeof row.absolute !== 'number') growth30Problems.push(`${label} absolute missing`);
      if (row.kind === 'period_over_period') {
        if (row.dataPoints !== 2) growth30Problems.push(`${label} period_over_period dataPoints=${row.dataPoints} (expected 2)`);
        if (row.windowStart !== null || row.windowEnd !== null) growth30Problems.push(`${label} period_over_period window dates must be null`);
      }
    }
    record(
      'R10 growth revenue_30d 30d',
      growth30Problems.length === 0,
      growth30Problems.length ? growth30Problems.slice(0, 5).join('; ') : `rows=${growth30Rows.length} total=${growth30.structured.total} kinds=${[...new Set(growth30Rows.map((row) => row.kind))].join(',')}`
    );

    const growthMrr7 = await validateCall('growth mrr 7d negative', 'search_growth_signals', {
      metric: 'mrr',
      window: '7d',
      limit: 1,
    });
    const mrrNotes = (growthMrr7.structured?.notes ?? []).join(' ');
    record(
      'R10 growth mrr 7d negative fixture',
      growthMrr7.ok &&
        (growthMrr7.structured?.results ?? []).length === 0 &&
        growthMrr7.structured.total === 0 &&
        /no 7-day MRR series|not invented/i.test(mrrNotes),
      growthMrr7.ok
        ? `rows=${(growthMrr7.structured.results ?? []).length} total=${growthMrr7.structured.total} note=${mrrNotes.slice(0, 100)}`
        : growthMrr7.detail
    );

    // CI-09 part 2: anonymous + forged-token negatives (no read is spent on 401)
    const anonymousUsage = await client.rawToolCall('get_usage', {});
    const anonymousBody = anonymousUsage.body?.error ?? anonymousUsage.body?.result?.structuredContent?.error ?? null;
    const forged = await client.rawToolCall('get_usage', {}, { authorization: 'Bearer invalid-forged-token' });
    const forgedBody = forged.body?.error ?? forged.body?.result?.structuredContent?.error ?? null;
    const challenge = forged.headers.get('www-authenticate') ?? '';
    record(
      'R10 auth negatives (anonymous + forged token)',
      anonymousUsage.status === 401 &&
        anonymousBody?.code === 'auth_required' &&
        forged.status === 401 &&
        forgedBody?.code === 'auth_required' &&
        /^Bearer\b/.test(challenge) &&
        /resource_metadata=/.test(challenge),
      `anonymous=${anonymousUsage.status}/${anonymousBody?.code ?? '?'} forged=${forged.status}/${forgedBody?.code ?? '?'} challenge=${challenge.slice(0, 80)}`
    );

    // CI-04 authenticated outputs: opt-in only, never in the anonymous CI path.
    await runAuthenticated(toolByName);

    // R09 docs parity ------------------------------------------------------
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
      if (/\bfour tools\b|\b4 tools\b/i.test(text)) docGaps.push(`${file} still says "four tools"`);
    }
    const authDoc = docs['docs/auth.md'];
    for (const name of PUBLIC_TOOLS) {
      if (!authDoc.includes(name)) docGaps.push(`docs/auth.md never names anonymous ${name}`);
    }
    if (authDoc.includes('tools/call without a valid token stays 401')) {
      docGaps.push('docs/auth.md still says every tools/call needs auth');
    }
    record(
      'R09 docs parity',
      docGaps.length === 0,
      docGaps.length ? docGaps.join('; ') : 'README, SKILL and auth mirror agree on all six tools and the auth boundary'
    );

    // R11 Registry discovery (CI-08) --------------------------------------
    let registry = null;
    let registryNetworkError = null;
    try {
      registry = await readRegistryLatest(liveVersion);
    } catch (error) {
      registryNetworkError = String(error?.cause?.code ?? error?.message ?? error);
    }
    if (!registry) {
      record('R11 official Registry discovery', false, `registry network failure: ${registryNetworkError}`);
    } else if (!registry.latest) {
      record(
        'R11 official Registry discovery',
        false,
        `metadata error: no isLatest entry among ${registry.totalSeen} record(s) over ${registry.pages} page(s) (versions ${registry.versions.join(',')})`
      );
    } else {
      const latest = registry.latest;
      const remoteOk = latest.remotes.some(
        (remote) => remote?.type === 'streamable-http' && remote?.url === CANONICAL_REMOTE
      );
      const problems = [];
      if (latest.version !== liveVersion) problems.push(`version ${latest.version} != live ${liveVersion}`);
      if (latest.status !== 'active') problems.push(`status=${latest.status}`);
      if (!remoteOk) problems.push(`remote=${JSON.stringify(latest.remotes)}`);
      if (latest.repository !== CANONICAL_REPO) problems.push(`repository=${latest.repository}`);
      record(
        'R11 official Registry discovery',
        problems.length === 0,
        problems.length
          ? problems.join('; ')
          : `${latest.version} status=${latest.status} remote=${CANONICAL_REMOTE} repo=${latest.repository} (pages=${registry.pages}, seen=${registry.totalSeen})`
      );
    }

    // R08 snapshot: canonical comparison / atomic write (CI-06, CI-07) ----
    const snapshot = {
      $comment:
        'Generated from the production tools/list by scripts/verify-production-contract.mjs. Do not hand-edit: refresh with --write after a deploy (the writer uses a temp file + atomic rename and records provenance).',
      schemaVersion: liveVersion,
      capturedFrom: `${BASE}/mcp`,
      protocolVersion: client.protocolVersion,
      server,
      tools,
    };
    const target = path.join(CONTRACTS, `tools-list-${liveVersion}.json`);
    const priorFailures = results.filter((entry) => entry.status === 'FAIL').length;
    if (WRITE) {
      const approved = priorFailures === 0;
      const provenance = {
        generatedAt: new Date().toISOString(),
        base: BASE,
        protocolVersion: client.protocolVersion,
        serverVersion: liveVersion,
        checksPassed: results.filter((entry) => entry.status === 'PASS').length,
        checksFailed: priorFailures,
        approved,
        note: approved
          ? 'All checks passed before this snapshot was written.'
          : 'UNAPPROVED: other checks failed; do not commit this snapshot without resolving them.',
      };
      const payload = { ...snapshot, provenance };
      const text = `${JSON.stringify(payload, null, 2)}\n`;
      await mkdir(CONTRACTS, { recursive: true });
      const temp = path.join(CONTRACTS, `.tools-list-${liveVersion}.${process.pid}.tmp`);
      try {
        await writeFile(temp, text, 'utf8');
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        record('R08 snapshot write', false, String(error?.message ?? error));
        summarize(liveVersion);
        return;
      }
      record(
        'R08 snapshot write',
        approved,
        approved
          ? `${path.relative(ROOT, target)} written atomically (sha256 ${sha256(text).slice(0, 16)}...), approved for commit`
          : `${path.relative(ROOT, target)} written atomically but UNAPPROVED: ${priorFailures} check(s) failed; not for commit`
      );
    } else {
      let committedText = null;
      try {
        committedText = await readFile(target, 'utf8');
      } catch {
        committedText = null;
      }
      if (!committedText) {
        record(
          'R08 committed contract snapshot',
          false,
          `no contracts/tools-list-${liveVersion}.json — run --write and commit it`
        );
      } else {
        let committed = null;
        try {
          committed = JSON.parse(committedText);
        } catch {
          committed = null;
        }
        if (!committed) {
          record('R08 committed contract snapshot', false, 'snapshot is not valid JSON');
        } else {
          const strip = (value) => {
            const copy = { ...value };
            delete copy.capturedFrom;
            delete copy.provenance;
            delete copy.$comment;
            return copy;
          };
          const semanticDiffs = diffJson(strip(committed), strip(snapshot));
          const rawDiffers = committedText !== `${JSON.stringify(snapshot, null, 2)}\n`;
          const formattingOnly = semanticDiffs.length === 0 && rawDiffers;
          record(
            'R08 committed contract snapshot',
            semanticDiffs.length === 0,
            semanticDiffs.length
              ? `contracts/tools-list-${liveVersion}.json drifted: ${semanticDiffs.slice(0, 6).join('; ')}`
              : formattingOnly
                ? `contracts/tools-list-${liveVersion}.json matches semantically; difference is formatting/key order only`
                : `contracts/tools-list-${liveVersion}.json matches the live tools/list`
          );
        }
      }
    }

    summarize(liveVersion);
    return;
  } catch (error) {
    console.error(`FAIL the endpoint is unreachable: ${error?.message ?? error}`);
    process.exit(2);
  }
}

async function runAuthenticated(toolByName) {
  if (AUTHENTICATED && !TOKEN) {
    record('R12 authenticated outputs', false, '--authenticated requires MONEYPEEL_MCP_BEARER_TOKEN');
    return;
  }
  if (!TOKEN) {
    skip('R12 authenticated outputs', 'set MONEYPEEL_MCP_BEARER_TOKEN and pass --authenticated (dedicated workflow only)');
    return;
  }
  const authClient = createClient(TOKEN);
  await authClient.initialize();
  const usageTool = toolByName.get('get_usage');
  const usageReply = await authClient.callTool('get_usage', {});
  const usageValidation = usageReply.isError
    ? { ok: false, detail: `tool error ${JSON.stringify(usageReply.error)}` }
    : validateStructured(usageTool, usageReply.structured);
  record('R12 get_usage real output', usageValidation.ok, usageValidation.detail);
  if (!SPEND) {
    skip('R12 get_report real output', 'pass --spend and MONEYPEEL_REPORT_SLUG to authorize exactly one metered read');
    return;
  }
  if (!REPORT_SLUG) {
    record('R12 get_report real output', false, '--spend requires MONEYPEEL_REPORT_SLUG');
    return;
  }
  const reportTool = toolByName.get('get_report');
  const reportReply = await authClient.callTool('get_report', { slug: REPORT_SLUG });
  const reportValidation = reportReply.isError
    ? { ok: false, detail: `tool error ${JSON.stringify(reportReply.error)}` }
    : validateStructured(reportTool, reportReply.structured);
  record('R12 get_report real output', reportValidation.ok, reportValidation.detail);
}

function summarize(liveVersion) {
  const passed = results.filter((entry) => entry.status === 'PASS').length;
  const failed = results.filter((entry) => entry.status === 'FAIL').length;
  const skipped = results.filter((entry) => entry.status === 'SKIP').length;
  console.log(
    `\nsummary: pass=${passed} fail=${failed} skip=${skipped} | base=${BASE} | version=${liveVersion ?? '?'}`
  );
  if (skipped > 0) {
    console.log('skipped checks are NOT verified and are never counted as PASS:');
    for (const entry of results.filter((row) => row.status === 'SKIP')) {
      console.log(`  SKIP ${entry.id}: ${entry.detail}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`FAIL verifier crashed: ${error?.stack ?? error}`);
  process.exit(1);
});
