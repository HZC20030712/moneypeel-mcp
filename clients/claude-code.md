# Claude Code

```bash
claude mcp add --transport http --scope user moneypeel https://moneypeel.com/mcp
```

Then, in a session:

1. `/mcp`
2. pick `moneypeel`
3. **Authenticate** — the browser opens, sign in, done.

Verify: `/mcp` should list six tools (`search_reports`, `list_reports`, `search_growth_signals`, `compare_companies`, `get_report`, `get_usage`). Try
`search_reports` with `{"query": "postiz", "limit": 2}`.
