<!--
  Mirrored from https://moneypeel.com/auth.md — that URL is canonical and is
  generated from the server code, so this copy is a convenience for readers of
  the repository, not a second source of truth. If they disagree, the live one
  wins.
-->

> Live: https://moneypeel.com/auth.md
# MoneyPeel MCP authentication

How an agent obtains a token for the remote MCP at https://moneypeel.com/mcp.
One method only: OAuth 2.1 authorization code with PKCE S256.

There is no API key, no identity_assertion, no id-jag, and no REST API
to fall back on. If a document or a search result tells you to send an
API key, that document is out of date.

## Discover

1. POST JSON-RPC to https://moneypeel.com/mcp.
2. Methods that need an account and arrive without a Bearer token get
   HTTP 401. Those methods are get_report and get_usage. Everything else
   — initialize, tools/list, prompts/list, search_reports, list_reports —
   works anonymously.
3. Read the WWW-Authenticate header. It is a Bearer challenge carrying
   resource_metadata:

       Bearer realm="MCP", resource_metadata="https://moneypeel.com/.well-known/oauth-protected-resource"

4. Fetch that document. authorization_servers names this origin.
5. Fetch https://moneypeel.com/.well-known/oauth-authorization-server for the
   endpoints below.

## Register

POST https://moneypeel.com/api/auth/mcp/register — RFC 7591 dynamic client
registration. Public client, no secret, code_challenge_method S256.
Keep the client_id; it is not a secret and it appears in every
authorization URL.

## Authorize

Send the user to https://moneypeel.com/api/auth/mcp/authorize with
response_type=code, client_id, redirect_uri, scope, code_challenge and
code_challenge_method=S256. The browser signs in on this site and comes
back to redirect_uri with an authorization code. The code is valid for
ten minutes and works once.

The user does the signing in. There is nothing for them to copy.

## Exchange

POST https://moneypeel.com/api/auth/mcp/token with
grant_type=authorization_code, code, code_verifier, client_id and
redirect_uri. The response carries access_token (1 hour) and
refresh_token (7 days). Refresh with grant_type=refresh_token.

## Use

Send Authorization: Bearer <access_token> on every POST to https://moneypeel.com/mcp
except initialize and ping. tools/call without a valid token stays 401.

## Quota

Reading a full report costs one read, metered per account, per UTC month:
free 2, Starter 300, Pro 1,000, Power 3,000. Search, list and get_usage
are free. When the allowance is gone the tool returns quota_exceeded with
a sentence that names the reset date — HTTP 200, not 429, and not an
auth error. Do not re-authenticate when you see it; tell the user the
date and keep using search.

## Errors

- 401 with WWW-Authenticate: no token, expired token, or a token for a
  different resource. Re-run the authorize step.
- Tool result with isError true: you are authenticated and the call
  failed (unknown slug, invalid chapter, bad argument). Not an auth
  problem, so do not loop on the token.
- 404 on a path under /api/v1: by design. That surface is switched off.

## Do not

- Do not look for a REST API. /api/v1 answers 404 for every request.
- Do not ask the user for an API key. None can be issued.
- Do not invent report URLs. Use the preview and report URLs that
  search_reports returns.

## Revoke

The account owner can revoke a client at https://moneypeel.com/dashboard/connections.
Every token issued to that client stops working immediately.
