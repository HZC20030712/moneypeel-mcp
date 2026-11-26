# Production contract snapshots

One file per released server version: `tools-list-<version>.json`, captured from the live
`tools/list`. Generated, never hand-written.

Current: `tools-list-1.4.7.json` (2026-11-26). Historical snapshots stay immutable.

## Why

The 2026-11-12 release-chain audit found the same failure mode that produced this
directory: the runtime served contract 1.4.4 while the declared `outputSchema` blocks, the
plugin package and the docs each still described 1.4.2/1.4.3. Nothing in a checklist can
catch that, because the drift lives between what the server actually serves and what every
other artefact believes it serves.

A committed snapshot makes the served contract reviewable after the fact — tool names,
descriptions, input parameters, declared output fields, annotations and per-tool
`securitySchemes` — and gives `scripts/verify-production-contract.mjs --check` something
exact to compare against, so a silent contract change fails CI instead of shipping.

## Generate (after a deploy)

`bash
node scripts/verify-production-contract.mjs --write
`

Then commit the new file together with the version bump in `package.json` / `plugin.json`.

## Check (what CI runs)

`bash
node scripts/verify-production-contract.mjs
`

It reads the live endpoint (initialize + tools/list only — it never spends a read) and fails
when:

- the server, `package.json` and `plugin.json` disagree on the version;
- the tool set is not the six documented tools;
- any tool's declared `outputSchema` is missing, or its `schemaVersion` const does not
  equal the version the server reports;
- the four annotation booleans or per-tool security schemes are not stated correctly;
- `.well-known/mcp/release.json` describes a different version or tool count;
- the committed snapshot differs from production (contract drift);
- `README.md`, `SKILL.md` or `docs/auth.md` stop agreeing on tools and auth;
- real anonymous `tools/call` output fails its declared JSON Schema;
- the official Registry latest record points at another version or repository.

## Notes

- The snapshot is a factual capture of a public endpoint, not a licence grant. The
  repository's MIT licence covers the code; the data the server returns stays closed.
- Never edit a snapshot by hand. If it is wrong, the generator is wrong — fix the generator.
- Do not delete an old snapshot. It is the record of what was published under that version.
