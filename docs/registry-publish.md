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
