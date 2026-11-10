# Cursor

**One-click install link** (Cursor deeplink, same format as `mcp.json`):

```
cursor://anysphere.cursor-deeplink/mcp/install?name=moneypeel&config=<base64>
```

Generate the exact link:

```bash
node scripts/install-links.mjs --base https://moneypeel.com
```

Where `<base64>` is `btoa(JSON.stringify({ "url": "https://moneypeel.com/mcp" }))`.

Cursor shows an install confirmation, then the server appears under MCP. The
first call that needs an account starts the OAuth flow.

Manual alternative: **Settings → MCP → Add**, transport `http`, URL as above.
