# Changelog

What changed in the integration kit, and what changed in the contract it documents. A
contract change is a user-visible change even when this repository's own files barely move:
an agent that cached a tool schema is affected by it.

Versions follow the server's `schemaVersion`. The kit does not version itself separately —
if the kit and the server disagree, the kit is wrong (run
`node scripts/verify-production-contract.mjs`).

## 1.4.7 — 2026-11-26

MRR-basis and description-provenance release. Three served contracts changed
(verified by diffing the committed 1.4.6 → 1.4.7 snapshots), and the tool
output stops pitching plans.

**Contract**

- `search_reports` gains an `mrrBasis` input parameter: `quotable` (default — reads
  `displayMrr`) or `provider` (reads the raw stored `mrr`). `minMrr` / `maxMrr` now
  say they filter on the quotable MRR.
- Row results gain `mrrValueKind` (`value` / `zero` / `missing` / `not_applicable` /
  `unknown` — an unattributable stored $0 is not zero revenue), `descriptionLanguage`
  (`en` / `zh` / `mixed` / null) and `descriptionSource` (`provider_capture` /
  `moneypeel_translation` / `provider_capture_fallback` / null — a translation is never an
  independent MoneyPeel finding).
- `compare_companies` cells' `source` gains required `pageKind` (`moneypeel_page`) and
  `externalUrl` (URI or null). A null `externalUrl` means no third-party source is
  recorded; the MoneyPeel page is never presented as external proof.
- `tools-list-1.4.7.json` captures the production contract; all six `outputSchema` blocks
  stamp `const: 1.4.7`.

**Output copy**

- `quota_exceeded` responses no longer carry `upgradeUrl` or a plan-upgrade sentence.
  The live `initialize` instructions now state that the tools are not a sales
  channel: explain an existing allowance when asked, but never pitch a plan, link a
  checkout or recommend an upgrade (verified against production).

**Kit**

- `package.json`, `plugin.json`, `.cursor-plugin/plugin.json`, `package-lock.json`,
  the README badge/sync line and `docs/auth.md` report 1.4.7.
- `server.json` moves to 1.4.7 for the official Registry; the record itself is
  published by `.github/workflows/publish-registry.yml` once the signing secret is
  configured (see `docs/registry-publish.md`).
- Cleaned stray `@` characters that had been inserted after inline-code backticks in
  this changelog, `contracts/README.md` and `CONTRIBUTING.md`.

## 1.4.6 — 2026-11-26

Version-alignment release. The server already served 1.4.6 while this kit and its
recorded contract still said 1.4.5. No tool, parameter or field shape changed
between the two versions: the committed snapshots differ only in the version
stamps.

**Contract**

- `contracts/tools-list-1.4.6.json` captures the production `tools/list`; all six
  `outputSchema` blocks now stamp `const: 1.4.6`. A field-by-field diff against
  `tools-list-1.4.5.json` shows only the `schemaVersion` constants changed.
- `package.json`, `plugin.json`, `.cursor-plugin/plugin.json`, `package-lock.json`,
  the README badge/sync line and `docs/auth.md` all report 1.4.6, matching
  `release.json` `server.version` and `mcp-capabilities.json` `schemaVersion`.

**Release chain**

- `server.json` describes `com.moneypeel/reports` at 1.4.6 for the official MCP
  Registry, with `repository` pointing at `HZC20030712/moneypeel-mcp` and the
  `streamable-http` remote at `https://moneypeel.com/mcp`.
- `.github/workflows/publish-registry.yml` publishes that manifest after a
  release or on demand; when the signing secret is absent it records an explicit
  SKIP instead of failing.
- `docs/registry-publish.md` documents the publish commands, the required secret or
  DNS TXT record, and the verification query.
- The contract verifier caught the stale manifests before the bump (R02/R03 failed
  against live 1.4.6) and now passes 19 of its 20 checks; the remaining one is the
  official Registry record, which still says 1.4.5 until the publish workflow runs
  with credentials.

## 1.4.5 — 2026-11-20

Public-discovery and citation-integrity release.

- `.cursor-plugin/plugin.json` declares `assets/logo.png`, and that file now exists: the
  Cursor listing had a relative logo path that returned 404 (2026-11-20 Grok audit, F3).

- Official Registry `com.moneypeel/reports@1.4.5` points at the canonical public
  integration kit, `HZC20030712/moneypeel-mcp`, rather than the application source.
- `auth.md` names all four anonymous research tools and limits Bearer requirements to
  `get_report` and `get_usage`.
- `dataQuality.status=ok` no longer carries `mrr_missing` as if it were a failure reason;
  `ratioStatus` and `metricApplicability.mrr` remain the diagnosis.
- `spike_driven` rows carry a quote caveat that forbids describing a short-lived jump as
  sustained growth.
- The production verifier now checks all four annotation booleans, exact security schemes,
  release-manifest parity, Registry metadata, the auth mirror, and real `tools/call` output
  for all four anonymous tools against executable JSON Schemas.
- `evals/agent-recommendation-cases.json` adds 16 positive/negative recommendation cases;
  `npm run verify:evals` validates the corpus and corresponding agent guardrails.
- `contracts/tools-list-1.4.5.json` is the production snapshot.

## 1.4.4 — 2026-11-12

Release-integrity release. The server was already serving 1.4.4 while the declared
`tools/list` schemas, the plugin package and the docs still described 1.4.2/1.4.3; this
release closes that gap rather than adding tools.

**Contract**

- All six `outputSchema` blocks now declare `schemaVersion: 1.4.4`, generated from the one
  server-version constant. A release can no longer leave six schemas claiming an older
  version, and the drift gate below fails if it does.
- `kind` gained `period_over_period` in every carrier — `search_growth_signals.results[].kind`,
  `search_reports.results[].growth.kind` and `list_reports.results[].growth.kind`. A
  source-reported two-point window reports `windowBasis: source_reported` and
  `dataPoints: 2`; it is never described as prolonged growth.
- Growth rows carry a typed `eligibilityDecision` (`eligible`, `rule`, `thresholds`,
  `observed`, `growthPct`, `growthThresholdPct`), plus `comparisonStart`/`comparisonEnd`,
  `currentStart`/`currentEnd` and `observationSpanDays`.
- The legacy `eligibility` string and the `eligibilityRule` / `eligibilityThreshold` /
  `eligibilityBaseline` / `eligibilityThresholds` / `eligibilityBaselines` fields are marked
  `deprecated` in the declared schema. `eligibilityDecision` is authoritative; both forms are
  generated from one decision object, so they cannot disagree.
- Growth rows carry row-level `dataQuality` (`status`, `reasons`, `ratio`) and a ready-made
  `quoteCaveat` sentence for the needs-review case.
- `get_report`: `claims[]` entries carry a stable `claimId`, `claimType`, `language` and
  `fallback` flag; every chapter carries `leadAsOf`, `snapshotType`, `snapshotTypeDetail`
  and `figuresAsOf`; `reportContentAsOf` is the one authoritative report-content date with
  `reportResearchAsOf` / `dataAsOf` kept only as deprecated aliases.
- All six tools state `readOnlyHint` / `destructiveHint` / `idempotentHint` /
  `openWorldHint` explicitly and declare per-tool `securitySchemes`.

**Release chain**

- `plugin.json` / `package.json` / the uploaded plugin package are all 1.4.4.
- `contracts/tools-list-1.4.4.json`: a committed capture of the production `tools/list`.
- `scripts/verify-production-contract.mjs`: anonymous verifier (no read spent) that compares the
  live contract with the snapshot and checks the version stamps across the repo.
- `.github/workflows/contract-drift.yml`: runs the verifier on every change and daily, so
  production drifting away from this repository fails CI instead of shipping.
- README: the five questions a reader (or an agent) asks first, plus the "when not to use it"
  half of the answer, mirroring https://moneypeel.com/use-cases.

## Earlier versions

1.4.0 – 1.4.3 predate this changelog. Their served contracts are recorded in the site
repository's `contracts/production-<version>.json` and in `/.well-known/mcp/release.json`
history; the field-level history of the data rules is on
https://moneypeel.com/data-changelog.
