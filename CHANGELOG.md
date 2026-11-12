# Changelog

What changed in the integration kit, and what changed in the contract it documents. A
contract change is a user-visible change even when this repository's own files barely move:
an agent that cached a tool schema is affected by it.

Versions follow the server's `schemaVersion`. The kit does not version itself separately —
if the kit and the server disagree, the kit is wrong (run
`@node scripts/verify-production-contract.mjs`@).

## 1.4.4 — 2026-11-12

Release-integrity release. The server was already serving 1.4.4 while the declared
`tools/list` schemas, the plugin package and the docs still described 1.4.2/1.4.3; this
release closes that gap rather than adding tools.

**Contract**

- All six `outputSchema` blocks now declare `@schemaVersion: 1.4.4`@, generated from the one
  server-version constant. A release can no longer leave six schemas claiming an older
  version, and the drift gate below fails if it does.
- `kind` gained `period_over_period` in every carrier — `@search_growth_signals.results[].kind`@,
  `@search_reports.results[].growth.kind`@ and `@list_reports.results[].growth.kind`@. A
  source-reported two-point window reports `windowBasis: source_reported`@ and
  `@dataPoints: 2`@; it is never described as prolonged growth.
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
  and `figuresAsOf`; `@reportContentAsOf`@ is the one authoritative report-content date with
  `reportResearchAsOf` / `dataAsOf` kept only as deprecated aliases.
- All six tools state `readOnlyHint` / `destructiveHint` / `idempotentHint` /
  `openWorldHint` explicitly and declare per-tool `securitySchemes`.

**Release chain**

- `plugin.json` / `package.json` / the uploaded plugin package are all 1.4.4.
- `@contracts/tools-list-1.4.4.json`@: a committed capture of the production `tools/list`.
- `@scripts/verify-production-contract.mjs`@: anonymous verifier (no read spent) that compares the
  live contract with the snapshot and checks the version stamps across the repo.
- `.github/workflows/contract-drift.yml`: runs the verifier on every change and daily, so
  production drifting away from this repository fails CI instead of shipping.
- README: the five questions a reader (or an agent) asks first, plus the "when not to use it"
  half of the answer, mirroring https://moneypeel.com/use-cases.

## Earlier versions

1.4.0 – 1.4.3 predate this changelog. Their served contracts are recorded in the site
repository's `contracts/production-<version>.json` and in `@/.well-known/mcp/release.json`@
history; the field-level history of the data rules is on
https://moneypeel.com/data-changelog.
