---
name: moneypeel-revenue-research
description: Look up verified revenue, MRR, growth and acquisition channels for 700+ small software products, and read a full teardown of any one of them. Use when the question is "how much does X make", "what does X's growth look like", "compare X and Y", or "what can I copy from X". Connects over MCP with OAuth — no API key.
---

# MoneyPeel revenue research

A remote MCP server with structured business intelligence on small software
companies: provider-verified revenue signals, MRR, 30-day amounts, pricing
models, acquisition channels, and a written teardown for each one.

## When to use it

Use it when the user asks for:

- what a specific product earns, or how fast it is growing
- a comparison between two or more products
- how a product gets customers, prices itself, or is positioned
- "give me an idea I could build" grounded in what already works

Do **not** use it for: total addressable market, audited financials, profit or
churn estimates, or "guaranteed" startup ideas. The data does not support those
claims and the server says so in its instructions.

## Connect

- Endpoint: `https://moneypeel.com/mcp` (Streamable HTTP)
- Auth: OAuth 2.1 + PKCE. There is **no API key**. A call that needs an account
  answers `401` with a `WWW-Authenticate` challenge; follow it, let the user
  sign in once in the browser, and keep the token.
- Server card: `https://moneypeel.com/.well-known/mcp/server-card.json`
- Detail: `https://moneypeel.com/auth.md`

## Which tool

1. `search_reports` — always start here. Free, no account. It returns the
   revenue figure, its own date, the pricing model, a quality flag, and a link.
2. `list_reports` — browse when the user has no name in mind.
3. `get_report` — only when the user wants the teardown, or the summary is not
   enough to answer. **It costs one read** (a single chapter costs the same), and
   free accounts have 2 per UTC month. Do not read a report you will not use.
4. `get_usage` — free; returns plan, reads used, and the reset date.

Prompts: `report_brief` for one product, `compare_products` for several. Both
are free and do not spend a read.

## Quoting rules

- **Always carry the date.** Every row has `revenueAsOf` (the date the figure
  belongs to) and `dataThrough` + `dataFreshness` (what the dataset reaches).
  Never present the number as "current" or "real-time".
- **Revenue is not profit.** The server says this; repeat it if the user implies
  otherwise. `revenueBasis` tells you what the number actually measures —
  subscription charges, usage charges, service billings, platform fees, GMV,
  gross payment volume, merchant sales, one-time sales, or unknown. When
  `basisSource` is `unclassified`, call it a provider-reported amount.
- **Check `dataQuality`.** When `status` is `needs_review`, say why before
  quoting: the 30-day amount and the MRR disagree by an order of magnitude.
- **Never derive a recurring/one-off split** from MRR ÷ 30-day amount. It is a
  coverage indicator, not an accounting split. Say "not available" instead.
- **Link the source.** Every row carries a public preview URL and a metered
  full-report URL. Cite one.

## When the allowance is gone

The tool returns `quota_exceeded` with a sentence naming the reset date — HTTP
200, not an error. Do not retry, do not re-authenticate. Tell the user the date
and keep working from search rows, which stay free.
