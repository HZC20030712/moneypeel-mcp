---
name: moneypeel-revenue-research
description: Look up provider-reported revenue signals, MRR, growth and acquisition channels for 700+ small software products, compare them, rank their 7-day or 30-day moves, and read a full teardown of any one of them. Use when the question is "how much does X make", "what does X's growth look like", "compare X and Y", or "what can I copy from X". Connects over MCP with OAuth 2.1 (no REST API key; header-only clients can use a connection credential).
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
- Auth: OAuth 2.1 + PKCE. There is **no REST API key**; a client that can only
  send a fixed header may use a connection credential (`Authorization: Bearer
  mp_…`, issued on the connections page, accepted on `/mcp` only). A call that
  needs an account answers `401` with a `WWW-Authenticate` challenge; follow it,
  let the user sign in once in the browser, and keep the token.
- Server card: `https://moneypeel.com/.well-known/mcp/server-card.json`
- Detail: `https://moneypeel.com/auth.md`

## Which tool

1. `search_reports` — always start here. Free, no account. It returns the
   revenue figure, its own date, the pricing model, evidence labels, a quality
   flag, and a link. Structured filters: `market`, `businessModel`, MRR / 30-day
   bounds, `revenueFreshness`, `economicBasis`, `basisDetermination`,
   `dataQualityStatus`, `evidenceType`; `sortBy` takes `revenue`, `mrr`,
   `name`, `growth` or `economicBasis` (`growthWindow` 7d / 30d). There is no
   category or growth-rate parameter — do not invent one.
2. `list_reports` — browse when the user has no name in mind.
3. `search_growth_signals` — free. Ranks 7d / 30d moves on one metric (`mrr` or
   `revenue_30d`) and returns the base amount with every percentage, so a growth
   number can never travel alone.
4. `compare_companies` — free. 2–5 slugs, cell by cell, each marked
   `comparable` / `partial` / `not_available` / `different_basis`. Amounts from
   mixed economic bases are never ranked.
5. `get_report` — only when the user wants the teardown, or the summary is not
   enough to answer. **It costs one read** (a single chapter costs the same), and
   free accounts have 2 per UTC month. Do not read a report you will not use.
6. `get_usage` — free; returns plan, reads used, and the reset date.

Prompts: `report_brief` (one product), `compare_products` (several),
`find_ideas`, `find_growers`, `category_scan`. All are free.

## Dates, clocks and snapshots

- **Current revenue.** `revenueAsOf` is the date the figure describes; `mrrAsOf` /
  `revenue30dAsOf` are the per-metric dates and `asOfBasis` says where they came
  from. Dataset coverage is `dataThrough` + `dataFreshness`;
  `lastSuccessfulSyncAt` is the pipeline's write time and
  `sourceRevenueSyncedAt` the source's sync time — never quote either as the
  date of a number.
- **Report body date.** A `get_report` response has one authoritative value,
  `reportContentAsOf` (at the top level and in `source`), and the Markdown header
  uses the same date. `reportResearchAsOf` and `dataAsOf` remain only as
  **deprecated aliases** of it; if a cached older response shows a different
  value, trust `reportContentAsOf`.
- **Contract versions.** Every result's `source` carries `schemaVersion` (the
  server contract version that produced it, e.g. `1.4.2`) and `dataPolicyVersion`
  (the economic-basis classification rule version, e.g. `2026-11-10.1`); a
  `get_report` result also carries both at its top level. Quote the pair when a
  rule or field matters to the answer.
- **Chapter snapshots.** Each `chapters[]` entry carries `leadAsOf` (date of the
  figures in its `lead`, or `null`), `snapshotType` (`current` or
  `historical_research_snapshot`) and `figuresAsOf` (date the amounts or ratios
  in the lead belong to, or `null`). A lead marked
  `historical_research_snapshot` is a historical figure: quote it with its date
  and never merge it with the current KPI.

## What is actually read-only

Five tools are read-only: `search_reports`, `list_reports`,
`search_growth_signals`, `compare_companies`, `get_usage` (`readOnlyHint:
true`, `idempotentHint: true`, `destructiveHint: false`). `get_report` is
`readOnlyHint: false`, `idempotentHint: false`, `destructiveHint: false`: each
successful read changes the account's remaining reads. Never describe the
server as a whole as read-only.

## Keeping this file honest

Tool names, parameters, field names and annotations here are a snapshot of the
production `tools/list`. When they disagree, production wins — fix this file,
never the server description. Verify anonymously (spends no read):

```bash
curl -s https://moneypeel.com/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect 6 tools. The app repository ships a hard check,
`scripts/verify/mcp-contract.mjs --base=https://moneypeel.com`, which fails when
the tool count, parameter sets or annotations drift from the server.

## Quoting rules

- **Always carry the date.** Every row has `revenueAsOf` (the date the figure
  belongs to) and `dataThrough` + `dataFreshness` (what the dataset reaches).
  Never present the number as "current" or "real-time".
- **Revenue is not profit.** The server says this; repeat it if the user implies
  otherwise. `revenueBasis` tells you what the number actually measures —
  subscription charges, usage charges, service billings, platform fees, GMV,
  gross payment volume, merchant sales, one-time sales, or unknown. When
  `basisSource` is `unclassified`, call it a provider-reported amount.
- **Say how we know it.** `basisDetermination` is `human_reviewed` (a person read
  the captured monetisation description), `pricing_model_inferred` (derived from
  the public pricing model — **never** describe it as verified or checked),
  `provider_line_item_verified` (a provider line item settled it; no row carries
  it yet), or `unknown`. `basisConfidence` follows from it and is never `high`
  for an inference. Most rows are inferred; say so when the user is about to
  treat a figure as audited.
- **Refunds and tax are unknown, not "net".** `refundTreatment` and
  `taxTreatment` are `unknown` on every row, and `sourceAdjustmentKnowledge`
  says whether the provider's own field definition was read (it has not been).
  "Not disclosed" is not "not deducted" — do not tell the user a figure is net.
- **Text and structured data agree.** Each row's text form already carries the
  amount, the basis and the determination; if your client renders only text, you
  still have them. Do not re-derive a basis from `businessModel`.
- **Check `dataQuality`.** When `status` is `needs_review`, say why before
  quoting: the 30-day amount and the MRR disagree by an order of magnitude.
- **Metric evidence and report evidence are different axes.**
  `mrrEvidenceType` / `revenue30dEvidenceType` are `provider_reported` only
  when the source stamped a sync time and named the payment provider; anything
  else is `unknown`. `source.reportEvidence` describes how the report body was
  written (its own marked claims) and never upgrades a metric-level label.
- **Quote MRR from `displayMrr`.** When it is `null`, MRR is not a meaningful
  measure for that business model: say that instead of reporting the raw `mrr`.
- **`citation.capturedAt` is a real capture time or `null`.** Never substitute
  the review date or invent one.
- **Stale is not current.** `revenueEligibleForRanking` false / `revenueFreshness`
  "stale" means the amount may still be quoted as a historical, dated figure but
  not as current and not compared with a current one.
- **Never derive a recurring/one-off split** from MRR ÷ 30-day amount. It is a
  coverage indicator, not an accounting split. Say "not available" instead.
- **Link the source.** Every row carries a public preview URL and a metered
  full-report URL. Cite one.

## When the allowance is gone

The tool returns `quota_exceeded` with a sentence naming the reset date — HTTP
200, not an error. Do not retry, do not re-authenticate. Tell the user the date
and keep working from search rows, which stay free.
