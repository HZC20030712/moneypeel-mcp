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
- `server.json` here is **1.4.6**; the 1.4.6 record is published by the workflow once the
  secret exists (or by hand with the commands above). Until then the verifier's R11 check
  reports the 1.4.5 record — that is the expected state, not a contract bug.
