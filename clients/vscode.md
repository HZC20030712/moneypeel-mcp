# VS Code / GitHub Copilot

```json
{
  "servers": {
    "moneypeel": { "type": "http", "url": "https://moneypeel.com/mcp" }
  }
}
```

Put it in `.vscode/mcp.json` (workspace) or run **MCP: Add Server** from the
command palette and paste the URL.

> One-click status: **unverified**. VS Code supports a `vscode:mcp/install`
> deeplink and it is used widely in the wild, but we have not confirmed the exact
> payload against a current build, so this repository does not publish one yet.
> `scripts/install-links.mjs` prints it under "candidates" for exactly this
> reason. Verify before shipping it anywhere.
