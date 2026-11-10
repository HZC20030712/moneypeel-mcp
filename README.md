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
[![api key: none](https://img.shields.io/badge/api_key-none-15803d)](https://moneypeel.com/auth.md)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-lightgrey)](LICENSE)

**English** · [简体中文](#中文)

---

## What you get

| Tool | Account | Cost | Returns |
|---|---|---|---|
| `search_reports` | no | free | summary rows: revenue, MRR, growth, pricing model, data date, preview + full-report URLs |
| `list_reports` | no | free | the same rows, paged and filterable |
| `get_report` | yes | **1 read** | one full report, or a single chapter |
| `get_usage` | yes | free | plan, reads used this UTC month, reset date |

Free accounts get **2 full-report reads per UTC month**. Search and listing never
cost anything and never need an account — that is deliberate: an agent should be
able to find out whether we have the answer before anyone signs in.

Two prompts ship with the server: `report_brief` (one product, one teardown) and
`compare_products` (two or more, side by side). Both are free.

## Endpoint

| | |
|---|---|
| URL | `https://moneypeel.com/mcp` |
| Transport | Streamable HTTP, stateless |
| Auth | OAuth 2.1 + PKCE (discovered from a `401` challenge) |
| Server card | `https://moneypeel.com/.well-known/mcp/server-card.json` |
| Agent auth doc | `https://moneypeel.com/auth.md` |
| Humans | `https://moneypeel.com/mcp-quickstart` |

There is **no API key**. Nothing to copy, nothing to paste. If a document tells
you to send an API key, that document is out of date.

## Install

| Client | How | One-click | Notes |
|---|---|---|---|
| **Claude Code** | `claude mcp add --transport http --scope user moneypeel https://moneypeel.com/mcp` | CLI | then `/mcp` → Authenticate |
| **Codex** | `codex mcp add moneypeel --url https://moneypeel.com/mcp` | CLI | then `codex mcp login moneypeel` |
| **Cursor** | [install deeplink](clients/cursor.md) | **yes** | `cursor://…/mcp/install?name=…&config=…` |
| **Claude web / Desktop** | Settings → Connectors → Add custom connector | no | Anthropic has no prefill link for custom connectors |
| **ChatGPT** | Settings → Connectors → Create (Developer mode) | no | authentication: OAuth, leave client id/secret empty |
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
compare_products { "products": "postiz, chatbase" }
```

> compare a $100K+ open-source scheduler with a $100K+ AI chatbot

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
- **`dataQuality` is per row.** When it is `needs_review`, the 30-day amount and
  the MRR disagree by an order of magnitude — say so before quoting.
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
No. There is no key path, and we do not intend to add one: a key in a config file
is a secret the user has to manage, and this whole integration exists so they
never have to.

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
- 鉴权：OAuth 2.1 + PKCE，**没有 API 密钥**
- 服务卡：`https://moneypeel.com/.well-known/mcp/server-card.json`
- 给 agent 的鉴权说明：`https://moneypeel.com/auth.md`

四个工具：`search_reports`、`list_reports`（免费、无需账户），`get_report`（读一份 = 1 次额度），`get_usage`（免费查额度）。免费账户每 UTC 月 2 次完整阅读。

两个提示词：`report_brief`（拆一篇）、`compare_products`（横向比）。

各客户端步骤见 [`clients/`](clients/)，链接与配置片段用
`node scripts/install-links.mjs` 生成。

**引用的三条铁律**：数字必须带日期；收入不等于利润（看 `revenueBasis`）；`dataQuality` 是 `needs_review` 时先说明原因再引用。

数据仓（CC BY 4.0）：https://github.com/HZC20030712/moneypeel-rankings
