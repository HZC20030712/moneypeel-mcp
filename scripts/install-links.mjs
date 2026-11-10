#!/usr/bin/env node
/**
 * Generate the client-side material this repository ships:
 *
 *   - the Cursor install deeplink (documented format, safe to publish)
 *   - the VS Code / Copilot deeplink (widely used in the wild, but the payload
 *     is NOT confirmed against a current build, so it is printed as a
 *     *candidate* and never as a link we tell people to click)
 *   - ready-to-paste config objects per client
 *
 * Usage:
 *   node scripts/install-links.mjs
 *   node scripts/install-links.mjs --base https://moneypeel.com --name moneypeel
 */

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [k, ...rest] = raw.replace(/^--/, '').split('=');
  args.set(k, rest.join('=') || 'true');
}

const BASE = (args.get('base') ?? 'https://moneypeel.com').replace(/\/$/, '');
const NAME = args.get('name') ?? 'moneypeel';
const URL_ = BASE + '/mcp';

const b64 = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

// Cursor: https://cursor.com/docs/mcp/install-links
// The config is the inner server object (the same shape an mcp.json entry has).
const cursor = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(NAME)}&config=${encodeURIComponent(b64({ url: URL_ }))}`;

// VS Code: candidate only. `vscode:mcp/install` exists and is used in the wild,
// but we have not verified the payload shape against a current build. Publishing
// an unverified deeplink costs more trust than it saves clicks.
const vscodeCandidate = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: NAME, url: URL_ }))}`;

const configs = {
  claude: { name: NAME, url: URL_, transport: 'streamable-http', auth: 'oauth2' },
  chatgpt: { name: NAME, url: URL_, authentication: 'oauth', clientId: '', clientSecret: '' },
  'claude-code': `claude mcp add --transport http --scope user ${NAME} ${URL_}`,
  codex: `codex mcp add ${NAME} --url ${URL_}`,
  json: { mcpServers: { [NAME]: { type: 'http', url: URL_ } } },
};

console.log('# MoneyPeel MCP — install material');
console.log('# endpoint: ' + URL_);
console.log('# generated: ' + new Date().toISOString());
console.log('');
console.log('## Cursor install link (verified format)');
console.log(cursor);
console.log('');
console.log('## VS Code / Copilot link (candidate — verify before publishing)');
console.log(vscodeCandidate);
console.log('');
console.log('## Configs');
for (const [key, value] of Object.entries(configs)) {
  console.log('');
  console.log('### ' + key);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
console.log('');
console.log('# Reminder: no API key exists. Auth is OAuth 2.1 + PKCE, discovered from the 401.');
