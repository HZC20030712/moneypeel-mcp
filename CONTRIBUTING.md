# Contributing

Thanks for helping. This repository is deliberately small, and the fastest way to get a change
merged is to keep it that way.

## What belongs here

| Accepted | Not accepted |
|---|---|
| A client configuration that does not work, with the fix | Server code, database schemas, report content |
| Corrections to `@SKILL.md`@ / `@README.md`@ that match production | Wording changes that make a claim the server does not support |
| Improvements to the verifier, install scripts or docs | New tools or fields — those ship on the server first |
| A failing case the verifier misses | Requests to scrape more data or lift the free quota |

## The one rule that matters

**Production wins.** This kit describes what https://moneypeel.com/mcp actually serves. When the
two disagree, the page here is wrong — never "fix" the server to match the docs, and never
describe a field, filter or enum that a live `@tools/list`@ does not contain.

## Before you open a pull request

`@bash
node scripts/verify-production-contract.mjs
`@

It is anonymous, spends no read, and checks the version stamps, the tool set, each declared
`outputSchema`, the annotations, the release manifest, the committed snapshot and whether
`README.md`@ / `SKILL.md`@ still name all six tools. A pull request that changes the contract
description without a green run here will not be merged.

If your change touches the contract itself (a new field, a changed enum), it has to happen in
this order:

1. the server ships it and `@.well-known/mcp/release.json`@ reports the new version;
2. `@node scripts/verify-production-contract.mjs --write`@ refreshes
   `@contracts/tools-list-<version>.json`@, and it is committed;
3. `README.md`@, `@SKILL.md`@ and the client docs are updated to match;
4. `package.json`@ and `plugin.json`@ move to the same version.

## Style

- English in the main body, a matching 中文 section where the README already has one.
- Say what a number measures, not how impressive it is. "Provider-reported amount" is correct;
  "company revenue" is not.
- Every claim about a field, filter or limit should be checkable in a live response. If it is
  not, it does not go in.

No CLA. Contributions are MIT, same as the repository.
