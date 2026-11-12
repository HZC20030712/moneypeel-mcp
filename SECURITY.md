# Security policy

## What is in scope here

This repository is the **integration kit**: client configuration, the OAuth walkthrough,
`SKILL.md`, install links and the contract verifier. Reports about any of them are in scope —
for example a snippet that sends a credential somewhere it should not, an install link that
can be hijacked, or a verifier that passes when the contract has actually drifted.

The server, the database and the dataset are **not** in this repository. A vulnerability in
the endpoint itself (auth bypass, quota bypass, data exposure) is still worth reporting — it
just cannot be fixed here, and this document will not pretend otherwise.

## How to report

Use GitHub's private vulnerability reporting on this repository (Security → Report a
vulnerability). If that is unavailable, open an issue that contains **no** exploit details and
say you have a private report to send; we will open a private channel.

Do not paste any of the following into an issue or a pull request:

- OAuth access tokens, refresh tokens, authorization codes, or a connection credential
  (`mp_…`)
- account ids, email addresses or billing details
- the contents of a paid report (`get_report` output is metered; a pasted copy is both a
  licence problem and a quota problem)

## What to expect

We aim to acknowledge a report as soon as we can, usually within five business days, and to
tell you plainly whether it is in scope, fixed, or a known limitation. There is no bug bounty.
Credit in the fix notes if you want it.

## Supported versions

The kit documents the **current** server contract only. There is no long-term support branch:
if you are on an older schema, the fix is to reconnect, not to patch this repository.

## Known, documented limitations

These are design decisions, not vulnerabilities — please read them before reporting:

- Free accounts get a small number of reads per UTC month; search, listing, growth and
  comparison never spend one. Quota is enforced per account, and guest web reads are bound to
  a device and an address (see https://moneypeel.com/privacy).
- Revenue figures are provider-reported signals, not audited financial statements, and revenue
  is not profit. The documented refusals are on https://moneypeel.com/use-cases.
