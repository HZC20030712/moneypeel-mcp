# MoneyPeel MCP

The open integration kit for the **MoneyPeel MCP server** — a remote Model Context
Protocol server that answers questions about how small software businesses
actually make money.

- **Endpoint**: `https://moneypeel.com/mcp` (Streamable HTTP)
- **Auth**: OAuth 2.1 with PKCE. **No API key, nothing to paste.**
- **Transport**: stateless — every POST carries its own token
- **Server card**: `https://moneypeel.com/.well-known/mcp/server-card.json`
- **Agent-facing auth doc**: `https://moneypeel.com/auth.md`

> 中文说明见本文件下半部分。This is the integration layer, not the server: the
> data and the service stay closed. What is open here is *how to connect* and
> *what the contract is*, so a client author, a directory reviewer or another
> agent can check both without asking us.

## What it is for

Ask for revenue signals, MRR, growth, pricing models and acquisition channels for
700+ small software products — inside Claude, ChatGPT, Cursor, Codex or any
MCP-capable client — and get a structured answer with the date the number
belongs to, instead of a guess.

## Tools

| Tool | Account | Cost | What it returns |
|---|---|---|---|
| `search_reports` | no | free | summary rows: revenue, MRR, growth, model, data date, preview + full-report URLs |
| `list_reports` | no | free | the same rows, paged and filterable |
| `get_report` | yes | **1 read** | one full report, or one chapter |
| `get_usage` | yes | free | plan, reads used this UTC month, reset date |

Free accounts get **2 full-report reads per UTC month**. Search and listing are
free and need no account.

## Prompts

`report_brief` (a one-report teardown) and `compare_products` (two or more
products side by side). Both are free.

## Connect

Per-client step-by-step notes live in [`clients/`](clients/):

| Client | File | One-click? |
|---|---|---|
| Claude (web / Desktop) | [clients/claude-web.md](clients/claude-web.md) | connector settings page |
| Claude Code | [clients/claude-code.md](clients/claude-code.md) | CLI |
| ChatGPT | [clients/chatgpt.md](clients/chatgpt.md) | manual connector |
| Codex | [clients/codex.md](clients/codex.md) | CLI |
| Cursor | [clients/cursor.md](clients/cursor.md) | **install deep link** |
| VS Code / Copilot | [clients/vscode.md](clients/vscode.md) | see caveat in the file |
| anything else | [clients/other.md](clients/other.md) | copy the prompt |

Generate the links and config snippets yourself:

```bash
node scripts/install-links.mjs --base https://moneypeel.com
```

## Skill

```bash
npx skills add moneypeel/moneypeel-mcp
```

[`SKILL.md`](SKILL.md) teaches an agent when to reach for this server, which tool
to pick, and how to cite a number without misquoting it.

## Licence

- **Code, scripts, configuration in this repository: MIT** (see [LICENSE](LICENSE)).
- **Data returned by the server is not part of this repository** and is not
  licensed by it. The ranking dataset published separately is CC BY 4.0:
  [moneypeel-rankings](https://github.com/HZC20030712/moneypeel-rankings).

## Related

- Site: https://moneypeel.com
- Ranking dataset (CC BY 4.0): https://github.com/HZC20030712/moneypeel-rankings
- Auth walkthrough, mirrored for readers: [docs/auth.md](docs/auth.md)
- Quickstart page: https://moneypeel.com/mcp-quickstart

---

# MoneyPeel MCP（中文）

MoneyPeel MCP 服务器的**开放接入套件**。远端 MCP 服务，回答「小型软件生意到底怎么赚钱」。

- **地址**：`https://moneypeel.com/mcp`（Streamable HTTP）
- **鉴权**：OAuth 2.1 + PKCE。**没有 API 密钥，没有要粘贴的东西。**
- **服务卡**：`https://moneypeel.com/.well-known/mcp/server-card.json`
- **给 agent 的鉴权说明**：`https://moneypeel.com/auth.md`

这里开放的是**怎么接**和**契约是什么**，不是服务端实现，也不是数据本身。

四个工具：`search_reports`、`list_reports`（免费、无需账户），`get_report`（读一份报告 = 1 次额度），`get_usage`（免费，查额度）。免费账户每 UTC 月 2 次完整阅读。

两个提示词：`report_brief`（拆一篇）、`compare_products`（横向比）。

各客户端步骤见 [`clients/`](clients/)，链接与配置片段用
`node scripts/install-links.mjs` 生成。

数据仓（CC BY 4.0）：https://github.com/HZC20030712/moneypeel-rankings
