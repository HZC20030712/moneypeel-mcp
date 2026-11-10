# Claude (web and Desktop)

1. Open **Settings → Connectors** (or `claude.ai/customize/connectors`).
2. **Add custom connector**.
3. Name: `MoneyPeel`. URL: `https://moneypeel.com/mcp`.
4. Save, then sign in and authorize when the browser opens.

There is no key to copy. If you are on the free plan, the same flow works
through a custom connector — the connector is not gated by plan, but Claude may
ask you to add it under "Customize".

> One-click status: **no**. Anthropic has no documented deep link that pre-fills
> a custom connector (the request exists upstream: anthropics/claude-code#105428).
> A true "Install" button only exists inside the plugin directory.
