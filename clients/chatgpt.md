# ChatGPT

Requires **Developer mode** (Settings → Connectors → Advanced).

1. **Settings → Connectors → Create**.
2. Name: `MoneyPeel`. MCP server URL: `https://moneypeel.com/mcp`.
3. Authentication: **OAuth**. Leave client id/secret empty — registration is
   dynamic.
4. Create, then authorize in the browser when a chat first calls the server.

> One-click status: **no**. ChatGPT has no URL-prefill connector link; a
> one-click button requires an app in the directory. MoneyPeel is being submitted
> to the OpenAI public directory; until it is listed, Developer mode is the way
> in. The server is registered in the official MCP Registry as
> `com.moneypeel/reports`.