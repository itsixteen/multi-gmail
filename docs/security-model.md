# Security model

## Protected assets

- Gmail message content and metadata;
- OAuth refresh and access tokens;
- the OAuth desktop-client secret;
- the identity of connected accounts.

## Trust boundaries

Multi Gmail trusts the local macOS user, Codex's local plugin process, Google OAuth endpoints, and the Gmail API. It does not run an HTTP mailbox service and does not accept remote MCP clients.

The temporary HTTP listener used during authorization binds only to `127.0.0.1`, chooses an ephemeral port, validates a cryptographically random OAuth state, uses PKCE, and closes after the flow.

## Credential handling

- Refresh tokens are stored in macOS Keychain under service `com.openai.codex.multi-gmail`.
- Account metadata and the OAuth desktop-client configuration are written with mode `0600` in a mode-`0700` directory.
- Access tokens exist only in process memory while a request is running.
- Tools never return credentials, OAuth responses, or Keychain output.
- CI and repository checks reject common OAuth credential filenames and token patterns.

OAuth desktop-client secrets are not considered confidential by Google in the same way server secrets are, but this project still treats the downloaded JSON and stored configuration as private local material.

## Authorization boundaries

`gmail.modify` is the only Gmail scope. It supports the advertised read, draft, send, label, archive, and trash behavior but not immediate permanent deletion.

Read operations may intentionally span all connected accounts. Write operations require a single explicit account so an ambiguous instruction cannot modify multiple inboxes. Sending mail is marked as a write operation; moving mail to Trash is marked destructive.

## Deliberate exclusions

- no public HTTP or SSE endpoint;
- no cloud token database;
- no service-account or domain-wide delegation support;
- no permanent-delete tool;
- no automatic forwarding of message content to third parties;
- no background polling or analytics.

## Residual risks

- Any local process running as the same macOS user may be able to request Keychain access depending on Keychain policy.
- A compromised Codex/plugin process could act within the granted Gmail scope.
- Email content is untrusted input and may contain prompt-injection attempts; users should review proposed writes and sends.
- An unverified personal Google OAuth app can show warnings, encounter user caps, or require periodic reauthorization while in Testing.

Use a dedicated Google Cloud project, connect only necessary accounts, review write operations, and revoke access when the plugin is no longer needed.

Report vulnerabilities according to [SECURITY.md](../SECURITY.md).
