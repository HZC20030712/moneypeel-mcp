# Publishing the kit to the official MCP Registry

The repository carries the Registry manifest in `server.json`, so the entry no longer
lives only in someone's shell history. The manifest must match the live server:
same `name` (`com.moneypeel/reports`), same `version` as `release.json` `server.version`,
same `repository` (`HZC20030712/moneypeel-mcp`) and the public
`streamable-http` remote.

## What the Registry needs

1. A namespace claim for `com.moneypeel`. This repository has used the **HTTP well-known**
   method: the site serves `/.well-known/mcp-registry-auth` with a signed record.
   The alternative is a DNS TXT record for the domain; the publisher prompts for whichever
   method is used.
2. The **private key seed** (64 hex characters) that corresponds to the published record.
   It is not in this repository. In CI it is the `MCP_REGISTRY_PRIVATE_KEY` secret;
   locally it is the key file outside the working tree.

## Local publish

```bash
cd repos/moneypeel-mcp
npx --yes mcp-publisher validate      # or a downloaded mcp-publisher binary
mcp-publisher login http --domain moneypeel.com --private-key <seed-hex>
mcp-publisher publish
```

The login token lives for about five minutes, so **log in and publish back to back**;
a login from a previous shell usually comes back as `invalid claims: token is expired`.

For the DNS route the login step becomes `mcp-publisher login dns --domain moneypeel.com` and the
matching TXT record has to exist first.

## CI publish

`.github/workflows/publish-registry.yml` runs on a published GitHub release, or by hand
(`workflow_dispatch`). It validates `server.json`, logs in with the secret and publishes.
When `MCP_REGISTRY_PRIVATE_KEY` is not configured the job prints a notice and **skips** —
a missing secret is never a red build.

## Verify

```bash
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.moneypeel%2Freports" | \
  python -c "import json,sys; j=json.load(sys.stdin); print([(s['server']['version'], s['_meta']['io.modelcontextprotocol.registry/official']['isLatest']) for s in j['servers']])"
```

The latest record must show the version in `server.json` and the kit repository. The contract
verifier checks the same thing as R11, so a version bump that skips the Registry shows up as
a single failing check instead of silent drift.

## Status: **BLOCKED** — 1.4.7 Registry record not published (2026-11-26)

**The only blocker:** the namespace signing key was rotated on 2026-11-20 for the 1.4.5
correction. The live well-known record is `p=id/w2fc6YfL6Zl8U3LcwLbg4HDeXr3GzEntQa1xXVGU=`;
the seed kept in `.local-secrets/mcp-registry-key.local` is the **pre-rotation** seed
(`p=ldokdF6kysF9XUcTlP/iZvvx1zVpsLpJ8F1XE7sokt8=`). Logging in with it returns
`signature verification failed (tried published key ed25519:id/w2fc6)`, so no publish is possible from
this checkout. Do **not** report the 1.4.7 record as live: the Registry still lists 1.4.5.

**Required from the owner:** provide the **current** Ed25519 seed (64 hex) that matches
the live record, either as the repository secret `MCP_REGISTRY_PRIVATE_KEY` or in
`.local-secrets/mcp-registry-key.local`. (Rotating the pair instead requires changing
`app/src/lib/mcp-registry-auth.ts` and deploying it — a production change, not part of this repo.)

**Steps once the seed exists**

1. Set the secret: GitHub → Settings → Secrets and variables → Actions →
   `MCP_REGISTRY_PRIVATE_KEY` = the 64-hex seed (or keep it local only).
2. Publish — dispatch the workflow (Actions → publish registry → Run workflow), or run locally:

```bash
cd repos/moneypeel-mcp
npx --yes mcp-publisher validate
mcp-publisher login http --domain moneypeel.com --private-key <current-seed>
mcp-publisher publish
```

3. Verify the record (the same query R11 uses):

```bash
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.moneypeel%2Freports" | \
  python -c "import json,sys; j=json.load(sys.stdin); print([(s['server']['version'], s['_meta']['io.modelcontextprotocol.registry/official']['isLatest']) for s in j['servers']])"
```

   Expected: latest tuple = `('1.4.7', True)`, status `active`, remote
   `https://moneypeel.com/mcp`, repository `HZC20030712/moneypeel-mcp`.
4. Refresh the snapshot so its provenance flips to approved, then commit it:

```bash
npm run snapshot      # approved only when every check passes
```

5. Re-run `npm run verify:mcp`; R11 turns PASS and the contract-drift workflow goes
   green on the next push/schedule.

## Current state (2026-11-26)

- Registry latest: `com.moneypeel/reports@1.4.5` → `HZC20030712/moneypeel-mcp`.
- `server.json` here is **1.4.7**; publishing it is the only failing check in
  `npm run verify:mcp` (R11).
- **Blocker:** the namespace key was rotated on 2026-11-20 (the live record is
  `p=v id/w2fc6…`, the pre-rotation seed only signs for `p=ldokdF6k…`), so a login
  with the old seed fails `signature verification failed (tried published key id/w2fc6)`.
  Publishing needs the **current private seed** (or a new pair plus a re-deploy of
  `/.well-known/mcp-registry-auth`, which is a production change and out of scope here).
- Fix path once the seed exists: set the `MCP_REGISTRY_PRIVATE_KEY` repository secret and
  run the workflow, or export it locally and run the commands above, then re-run
  `npm run snapshot` so the snapshot's provenance flips to approved.
