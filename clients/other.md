# Any other MCP client

The contract is the same everywhere:

- Transport: **Streamable HTTP**
- URL: `https://moneypeel.com/mcp`
- Auth: **OAuth 2.1 + PKCE**, discovered from a `401` challenge. No key.

If the client asks for a config file:

```json
{
  "mcpServers": {
    "moneypeel": {
      "type": "http",
      "url": "https://moneypeel.com/mcp"
    }
  }
}
```

If the client cannot add a remote server, it is not supported — say so instead of
inventing a wrapper.
