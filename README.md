# MoneyPeel MCP

**Ask "how much does this software company actually make?" inside Claude, ChatGPT,
Cursor or Codex — and get an answer with a date on it.**

MoneyPeel is a remote [Model Context Protocol](https://modelcontextprotocol.io)
server with structured business intelligence on 700+ small software products:
provider-verified revenue signals, MRR bands, growth, pricing models, how each
one acquires customers, and a written teardown per product.

This repository is the **integration kit**: skills, per-client setup, install
links and troubleshooting. It is not the server — the data and the service stay
closed, and what is open here is exactly what a client author, a directory
reviewer or another agent needs to check.

[![mcp: remote](https://img.shields.io/badge/mcp-remote-1f2937)](https://moneypeel.com/mcp-quickstart)
[![auth: OAuth 2.1](https://img.shields.io/badge/auth-OAuth_2.1-0e7490)](https://moneypeel.com/auth.md)
[![REST API key: none](https://img.shields.io/badge/REST_API_key-none-15803d)](https://moneypeel.com/auth.md)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)
[![server: 1.4.4](https://img.shields.io/badge/server-1.4.4-1f2937)](https://moneypeel.com/.well-known/mcp/release.json)
[![registry: published](https://img.shields.io/badge/registry-com.moneypeel%2Freports-0e7490)](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.moneypeel%2Freports)
[![basis rules: 2026-11-10.1](https://img.shields.io/badge/basis_rules-2026--11--10.1-6b7280)](https://moneypeel.com/method)

**English** · [简体中文](#中文)

> **Synced with server `1.4.4` / economic-basis rules `2026-11-10.1`** (2026-11-12).
> When the server's contract changes, this kit and the dataset READMEs have to change
> with it — the list of files and the check order lives in
> `MCP 增长数据开源计划/07-开源同步清单.md` on the site repo. If the two badges above
> are older than `release.json`, this kit is stale.

---

## What you get

| Tool | Account | Cost | Returns |
|---|---|---|---|
| `search_reports` | no | free | summary rows: revenue, MRR, growth, pricing model, data date, evidence labels, preview + full-report URLs |
| `list_reports` | no | free | the same rows, paged and filterable |
| `search_growth_signals` | no | free | 7d / 30d moves on one metric: baseline, absolute change, percentage, data points, window dates, methodology |
| `compare_companies` | no | free | 2–5 products cell by cell, each `comparable` / `partial` / `not_available` / `different_basis` |
| `get_report` | yes | **1 read** | one full report, or a single chapter |
| `get_usage` | yes | free | plan, reads used this UTC month, reset date |

Free accounts get **2 full-report reads per UTC month**. Search and listing never
cost anything and never need an account — that is deliberate: an agent should be
able to find out whether we have the answer before anyone signs in.

Five prompts ship with the server: `report_brief` (one product, one teardown),
`compare_products` (two or more, side by side), `find_ideas`, `find_growers`
and `category_scan`. All are free.

## Endpoint

| | |
|---|---|
| URL | `https://moneypeel.com/mcp` |
| Transport | Streamable HTTP, stateless |
| Auth | OAuth 2.1 + PKCE (discovered from a `401` challenge) |
| Server card | `https://moneypeel.com/.well-known/mcp/server-card.json` |
| Agent auth doc | `https://moneypeel.com/auth.md` |
| Registry listing | `com.moneypeel/reports` on the [official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.moneypeel%2Freports) |
| Humans | `https://moneypeel.com/mcp-quickstart` |

There is **no REST API key**: `/api/v1/*` answers 404. A client that can only
send a fixed header may use a **connection credential** (`Authorization: Bearer
mp_…`) issued on the connections page — it is accepted on `/mcp` only and
carries the same account, allowance and revocation as OAuth. An OAuth client
never pastes anything. If a document tells you to send any other key, that
document is out of date.

## Install

| Client | How | One-click | Notes |
|---|---|---|---|
| **Claude Code** | `claude mcp add --transport http --scope user moneypeel https://moneypeel.com/mcp` | CLI | then `/mcp` → Authenticate |
| **Codex** | `codex mcp add moneypeel --url https://moneypeel.com/mcp` | CLI | then `codex mcp login moneypeel` |
| **Cursor** | [install deeplink](clients/cursor.md) | **yes** | `cursor://…/mcp/install?name=…&config=…` |
| **Claude web / Desktop** | Settings → Connectors → Add custom connector | no | Anthropic has no prefill link for custom connectors |
| **ChatGPT** | Settings → Connectors → Create (Developer mode) | no | authentication: OAuth, leave client id/secret empty; directory submission is in progress, so use Developer mode until it is listed |
| **VS Code / Copilot** | `.vscode/mcp.json` | unverified | see the caveat in [clients/vscode.md](clients/vscode.md) |
| **Anything else** | Streamable HTTP + OAuth | — | [clients/other.md](clients/other.md) |

Generate every link and snippet yourself:

```bash
node scripts/install-links.mjs --base https://moneypeel.com
```

The one-click column is honest on purpose: only Cursor has a documented deeplink
format we could verify. We would rather show "no" than ship a button that opens
nothing.

## Skill

```bash
npx skills add moneypeel/moneypeel-mcp
```

[SKILL.md](SKILL.md) is what an agent reads before calling: when to reach for the
server, which tool to pick, and how to quote a number without misrepresenting it.

## Try it

```
search_reports { "query": "postiz", "limit": 3 }
```

> which social media schedulers make real money?

```
compare_companies { "slugs": ["postiz", "chatbase"] }
```

> compare a $100K+ open-source scheduler with a $100K+ AI chatbot

```
search_growth_signals { "metric": "revenue_30d", "window": "30d", "minBaseline": 1000, "sort": "absolute", "limit": 5 }
```

> who added the most 30-day amount in the last month, with base and percentage

```
get_report { "slug": "postiz", "chapter": 2 }
```

> how does it actually get customers? (costs 1 read)

## Quota

| Plan | Reads / UTC month | Reads / day |
|---|---:|---:|
| Free | 2 | 2 |
| Starter | 300 | 100 |
| Pro | 1,000 | 300 |
| Power | 3,000 | 1,000 |

One full report — or one chapter of it — is one read. Search, list and
`get_usage` are free. Running out is a **tool-level message with the reset date**,
HTTP 200, not a dropped connection: tell the user the date, keep using search, do
not retry.

## Reading the numbers (the part most tools get wrong)

- **Every figure carries a date.** `revenueAsOf` is the day the number belongs
  to; `dataThrough` is how far the dataset reaches; `dataFreshness` is how far
  behind the daily schedule that is. Never call it "current".
- **Revenue is not profit.** A figure can be provider-verified and still be a GMV
  total. `revenueBasis` says what it measures (subscription charges, usage
  charges, service billings, platform fee, GMV, gross payment volume, merchant
  sales, one-time sales, unknown).
- **`dataQuality` is per row, and growth rows carry it too.** When it is
  `needs_review`, the 30-day amount and the MRR disagree by an order of magnitude —
  say so before quoting. A growth signal row adds a ready-made `quoteCaveat` for
  exactly that case, and it is printed before the numbers: `provider_reported`
  evidence and a `current` freshness do not clear a quality warning.
- **A 30-day growth move is `period_over_period`.** The source reports two
  amounts, so `windowBasis` is `source_reported` and `dataPoints` is 2; the
  window dates are `null` rather than invented. Only a 7-day daily series can be
  `sustained_growth` or `spike_driven`. Each result names the rule set in
  `source.growthRuleVersion`.
- **Every marked claim is addressable.** `get_report` returns `claims[]` with a
  stable `claimId`, its `claimType`, the `language` the line is actually in and a
  `fallback` flag. A `fact` line that asserts causation, profit or cash flow is
  downgraded to `interpretation` at read time — keep the label you were given.
- **`basisDetermination` says how we know it.** `human_reviewed` = a person read the
  captured monetisation description; `pricing_model_inferred` = derived from the
  public pricing model, never to be described as verified; `provider_line_item_verified`
  = a provider line item settled it (no row carries it yet); `unknown` = nothing did.
  `basisConfidence` follows from it and is never `high` for an inference.
- **Refunds and tax are unknown.** `refundTreatment` / `taxTreatment` are `unknown` on
  every row and `sourceAdjustmentKnowledge` records that the provider's field
  definition has not been read. Do not call a figure net.
- **Evidence is two-level, and the levels never merge.** `mrrEvidenceType` /
  `revenue30dEvidenceType` are `provider_reported` only when the source stamped
  a sync time and named the payment provider; anything else is `unknown`. The
  report-level `source.reportEvidence` describes how the report body was
  written (the distribution of its own marked claims) and **never** upgrades a
  metric-level label.
- **Quote MRR from `displayMrr`.** It is `null` when MRR is not a meaningful
  measure for that business model; the raw `mrr` is kept for transparency and
  must not be quoted as a run-rate.
- **`citation.capturedAt` is the real capture time** of the cited source, or
  `null` when no capture time was recorded. Do not substitute the review date.
- **Stale rows stay readable but are not current.** `revenueEligibleForRanking`
  false / `revenueFreshness` "stale" means the amount must not be quoted as a
  current figure or compared with a current one.
- **Filters and sorting are fixed.** `search_reports` accepts text plus
  `businessModel`, `market`, MRR / 30-day bounds, `revenueFreshness`,
  `economicBasis`, `basisDetermination`, `dataQualityStatus`, `evidenceType`,
  and sorts by `revenue`, `mrr`, `name`, `growth` or `economicBasis`
  (`growthWindow` 7d/30d). There is no category or growth-rate parameter; do
  not invent one.
- **Never derive a recurring/one-off split** from MRR ÷ 30-day amount. It is a
  coverage indicator, not an accounting split. Return "not available".

## Troubleshooting

**401 loop.** The challenge has to be followed: read `WWW-Authenticate`, fetch
`/.well-known/oauth-protected-resource`, then the authorization-server metadata.
Hard-coding an authorize URL skips the dynamic registration step.

**Connected but no tools.** Call `initialize`, then `tools/list`. If the client
caches the tool list across a token refresh, restart the session.

**Quota exhausted on the first read.** The account already spent its two reads
this UTC month — check `get_usage`, which is free.

**Search returns nothing for a company you know exists.** Try the domain
(`postiz.io`) or the product name without spaces; the index is smaller than the
web.

## FAQ

**Is this a REST API?**
No. `/api/v1` answers `404` by design. The only surface is `/mcp`.

**Do you support clients without OAuth?**
Only in the narrow sense that a client which cannot run a browser flow may send
a **connection credential** (`Authorization: Bearer mp_…`) issued on the
connections page. It is not a REST API key, it works on `/mcp` only, and it
carries the same account, allowance and revocation as OAuth. There is still no
REST surface and no key to paste into a generic "API key" field.

**Can I self-host it?**
No — the data is the product. The integration kit here is MIT; the server and the
dataset are not.

**Is there an open dataset?**
Yes: [moneypeel-rankings](https://github.com/HZC20030712/moneypeel-rankings) —
738 products by revenue band, trend, pricing and category, CC BY 4.0, weekly.

## Repository layout

```
clients/            one file per client, in install order
docs/auth.md        the agent-facing auth walkthrough (mirror of /auth.md)
scripts/            install-links.mjs — deeplinks and configs
SKILL.md            what an agent reads before calling
```

## Related

- Site: https://moneypeel.com
- Open dataset (CC BY 4.0): https://github.com/HZC20030712/moneypeel-rankings
- MCP Registry: `com.moneypeel/reports` — https://registry.modelcontextprotocol.io/v0.1/servers?search=com.moneypeel%2Freports
- Auth walkthrough, mirrored for readers: [docs/auth.md](docs/auth.md)

## Licence

MIT — see [LICENSE](LICENSE). Covers the code, scripts and configuration in this
repository. It does not cover the data the server returns or the reports on
moneypeel.com.

---

## 中文

**在 Claude、ChatGPT、Cursor 或 Codex 里直接问「这家软件公司到底赚多少」，答案是带日期的。**

MoneyPeel 是一个远端 MCP 服务，收录 700+ 家小型软件产品的结构化商业情报：支付商验证的收入信号、MRR 区间、增长、收费模式、获客渠道，以及每个产品一份写好的拆解。

这个仓库是**接入套件**：技能、各客户端步骤、安装链接、排错。它不是服务端——数据和服
务仍然闭源，这里公开的恰好是客户端作者、目录审核方或另一个 agent 需要核对的东西。

- 地址：`https://moneypeel.com/mcp`（Streamable HTTP）
- 鉴权：OAuth 2.1 + PKCE，**没有 REST API 密钥**；只能发固定 header 的客户端可用连接页签发的连接凭据（只对 `/mcp` 生效，同身份/额度/吊销）
- 服务卡：`https://moneypeel.com/.well-known/mcp/server-card.json`
- 给 agent 的鉴权说明：`https://moneypeel.com/auth.md`
- MCP Registry：`com.moneypeel/reports`（[官方 Registry 可查](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.moneypeel%2Freports)）

六个工具：`search_reports`、`list_reports`、`search_growth_signals`、`compare_companies`（四个都免费、无需账户），`get_report`（读一份 = 1 次额度），`get_usage`（免费查额度）。免费账户每 UTC 月 2 次完整阅读。

`search_growth_signals` 按 7 天 / 30 天窗口排某个指标的变动，每行带基数、绝对增量、百分比与数据点数；`compare_companies` 比 2–5 家，逐格标 `comparable` / `partial` / `not_available` / `different_basis`，不同经济口径之间不排名。

增长行自带 `dataQuality`；`needs_review` 的行还会带 `quoteCaveat`，**引用时先把这句警告放在数字前面**——`provider_reported` 和 `current` 都不能抵消质量警告。30 天变化来自源报告的两期金额（`windowBasis=source_reported`、`dataPoints=2`、窗口日期为 `null`），因此只能是 `period_over_period`；只有 7 天逐日序列才可能被判成 `sustained_growth` 或 `spike_driven`。规则集版本在 `source.growthRuleVersion`。

`get_report` 返回的 `claims[]` 每条都有稳定的 `claimId`、`claimType`、该行实际语言的 `language` 与 `fallback` 标记；标成「事实」但属于因果/利润/现金流断言的句子，读取时已降级为 `interpretation`，不要自行升格。

五个提示词：`report_brief`（拆一篇）、`compare_products`（横向比）、`find_ideas`、`find_growers`、`category_scan`。

各客户端步骤见 [`clients/`](clients/)，链接与配置片段用
`node scripts/install-links.mjs` 生成。

**引用时的四条铁律**：数字必须带日期；收入不等于利润（看 `revenueBasis`）；`basisDetermination` 说这是人工读过还是按收费模式推断（推断不许说成已核实，置信度也不会是 `high`）；退款与税费每行都是 `unknown`——「未披露」不等于「未扣除」，不要把金额说成净额。`dataQuality` 是 `needs_review` 时先说明原因再引用。

另外两条容易被忽略：指标级证据（`mrrEvidenceType` / `revenue30dEvidenceType`）只有 `provider_reported` 和 `unknown`，报告级 `source.reportEvidence` 描述的是报告正文的写作方式，**不会**把指标级证据升级；MRR 只引用 `displayMrr`，为 `null` 时说明该模式不适用，不要把原始 `mrr` 当 run-rate。

数据仓（CC BY 4.0）：https://github.com/HZC20030712/moneypeel-rankings
