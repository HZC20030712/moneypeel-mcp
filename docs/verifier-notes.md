# Verifier notes (release-chain + audit §5.2 CI-01..CI-10)

This repository is the public integration kit. `scripts/verify-production-contract.mjs`
is the release-chain verifier: it reads production, compares it with the committed
snapshot and the manifests in this repo, and exercises the behaviour a client relies on.
`scripts/verify-agent-evals.mjs` is a static corpus lint; `scripts/verify-model-evals.mjs`
is the real (model-calling) behaviour eval.

Status words are strict:

- **PASS** — observed from production or computed from a real file in this repo.
- **FAIL** — the observation contradicts the declaration (or the check could not be made).
- **SKIP** — not executed because a credential/input is absent. **SKIP is NOT VERIFIED and is
  never counted as PASS.** The summary prints every skipped check with its reason.

## Commands

```bash
npm ci
npm run verify:mcp          # contract + fixtures against production, read-only and free
npm run verify:evals        # static corpus lint only (prints CORPUS_OK, not PASS)
npm run snapshot            # refresh contracts/tools-list-<live-version>.json (atomic write)
node scripts/verify-model-evals.mjs   # real model evals; SKIP (NOT VERIFIED) without a key

node scripts/verify-production-contract.mjs --self-test   # offline unit checks for CI-06
```

The verifier never spends a metered read by itself: initialize/tools/list and the free
tools only. `--authenticated` adds `get_usage`; `--authenticated --spend` additionally
performs exactly one `get_report` read and requires `MONEYPEEL_REPORT_SLUG`.
`--auth-only` runs only the opt-in authenticated checks (used by the dedicated workflow).

## Check map (2026-11-26 audit §5.2)

| Audit item | Check id | What it now does |
|---|---|---|
| CI-01 | R05 | Walks the declared outputSchema for every `schemaVersion` path and requires a strict `const` equal to both the live server version and `package.json`. A wrong const, a plain string, or a missing const FAILs; it no longer does `text.includes(version)`. |
| CI-02 | R10 growth fixtures | `revenue_30d` window 7d and 30d must return non-empty rows; each row is validated against the live outputSchema and checked for `window`, the growth-kind enum, `baseline/start/end/absolute/percentage`, `dataPoints`, and for 30d `period_over_period` rows `dataPoints=2` with null window dates. `metric=mrr&window=7d` is kept as a negative fixture: empty rows + the "no 7-day MRR series" note. |
| CI-03 | R10 fixtures | Search pagination (limit/cursor) with schema validation and no overlap; reusing a cursor with a changed query must return `invalid_cursor`; en/zh language fixture; null-MRR fixture asserts `displayMrr=null`, raw `mrr` kept and `metricApplicability.mrr=not_applicable`; same-basis compare (postiz/cometly) must be `comparable`; cross-basis compare (comp-ai/postiz) must mark `revenue_30d` cells `different_basis` with the mixed-basis note. |
| CI-04 | R12 + authenticated.yml | Authenticated outputs are opt-in (`--authenticated`), and a separate workflow runs `--auth-only --authenticated --spend` with a dedicated account. Without the secret the workflow writes "SKIP (NOT VERIFIED)" to the job summary instead of claiming PASS. |
| CI-05 | R00 + client | Full handshake: `initialize` -> `notifications/initialized`, negotiated `mcp-protocol-version` on later requests, `AbortSignal.timeout`, response `mcp-session-id` reuse, JSON-RPC id mismatch detection and error surfacing. No automatic retries anywhere: a metered call is never replayed by the verifier. |
| CI-06 | R08 | Snapshot comparison is canonical (object keys sorted, array order kept) and reports JSON paths for semantic differences. A key-order/format-only difference is PASS with "formatting/key order only"; a semantic change is FAIL with the differing paths. |
| CI-07 | R08 write | `--write` runs after the other checks, writes a temp file and atomically renames it, records `provenance` (generatedAt, base, server version, checksPassed/checksFailed, approved). If any other check failed the snapshot is written with `approved:false` and the R08 row FAILs — it must not be committed. The verifier never commits. |
| CI-08 | R11 | Registry lookup supports pagination (`metadata.nextCursor`, up to 5 pages), requires the `isLatest` record to be `status=active`, version == live version, canonical streamable-http remote `https://moneypeel.com/mcp`, and canonical repository. Network failure, missing isLatest (metadata error) and field mismatches are reported separately. |
| CI-09 | R06b + R10 auth negatives | `oauth2` tools must declare exactly `scopes: ["openid"]`; `noauth` tools must not declare scopes. Anonymous and forged-token `get_usage` calls must both answer 401 with `error.code=auth_required` and a `WWW-Authenticate: Bearer ... resource_metadata=...` challenge. No real account is used. |
| CI-10 | workflows | `contract-drift.yml` uses `actions/checkout@v5` + `actions/setup-node@v5` with Node 22 and adds the model-eval step. Branch protection/ruleset is a manual repository setting; see the TODO below. |

## EVAL-01: static lint vs real behaviour

- `scripts/verify-agent-evals.mjs` only validates the corpus JSON and SKILL.md guardrail
  regexes. It prints `CORPUS_OK` per case and `summary: corpus_ok=...`; it never claims a
  model passed anything.
- `scripts/verify-model-evals.mjs` calls a pinned model through an OpenAI-compatible
  `chat/completions` endpoint, gives it the live MCP tool definitions, executes only the
  four free tools, records the tool trace and the final answer, and checks the corpus
  rubric (expected tool, required wording, forbidden claims).
  - Required: `MONEYPEEL_MODEL_EVAL_API_KEY`, `MONEYPEEL_MODEL_EVAL_MODEL` (exact pinned id).
  - Optional: `MONEYPEEL_MODEL_EVAL_BASE_URL`, `MONEYPEEL_MODEL_EVAL_LIMIT`,
    `MONEYPEEL_MODEL_EVAL_MAX_TURNS`, `MONEYPEEL_MODEL_EVAL_TEMPERATURE`.
  - Without a key it prints SKIP, lists what is required, and reports
    `model_evals pass=0 fail=0 skip=N (NOT VERIFIED)`. It never fabricates a PASS.
  - Metered tools (`get_report`, `get_usage`) are never executed; if the model requests one
    the case is SKIPped with that reason. Cost of a real run is one model call per turn per
    case; pin the model and use `MONEYPEEL_MODEL_EVAL_LIMIT` while iterating.

## Snapshot discipline (CI-07)

- Snapshots live in `contracts/tools-list-<version>.json`. Existing 1.4.4/1.4.5 files are
  untouched; a new version's snapshot is added with `npm run snapshot` after all checks pass.
- The writer never edits a file in place: temp file + `rename`, with `provenance` recorded.
- An unapproved snapshot (`approved:false`) exists only to make the failure inspectable; do
  not commit it and do not delete the previous version's snapshot.

## Manual TODO (cannot be done from this repository)

- Enable main-branch protection / a ruleset that requires the `contract drift` workflow and
  the authenticated workflow before merge. Repository settings and GitHub rulesets are
  maintained in GitHub, not in this file tree; this note is the tracked manual step.
- Configure the repository secrets for `authenticated.yml`
  (`MONEYPEEL_MCP_BEARER_TOKEN`, `MONEYPEEL_REPORT_SLUG`) and the optional model-eval
  secrets/variables (`MONEYPEEL_MODEL_EVAL_API_KEY`, `MONEYPEEL_MODEL_EVAL_MODEL`).
- Registry publication (version bump) is owned by the release job; R11 stays FAIL until the
  Registry latest record matches the deployed server version.

## Known release-line dependencies

R02/R03 (package/plugin version), R08 (snapshot for the live version) and R11 (Registry
latest) intentionally FAIL while a release is in progress. They are not SKIPped and not
weakened: the release owner must bump the manifests, capture the snapshot and publish the
Registry record.
