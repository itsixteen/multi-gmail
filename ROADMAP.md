# Roadmap

Multi Gmail starts deliberately small: secure local multi-account Gmail access for Codex on macOS.

## Near term

- Improve first-run diagnostics for missing Google OAuth configuration.
- Add more fixtures around MIME edge cases and reply threading.
- Add exportable, privacy-preserving diagnostic reports.
- Document Codex Remote workflows for phone-driven tasks.

## Later

- Evaluate secure Keychain alternatives for Linux and Windows.
- Explore a user-owned remote deployment without weakening per-user authorization.
- Add optional dry-run plans for large triage operations.
- Add localization for setup and error messages.

## Explicit non-goals

- Permanent Gmail deletion.
- A shared unauthenticated public MCP endpoint.
- Automatic cross-account writes.
- Storing user refresh tokens in this repository or in an author-operated service.

Roadmap items are intentions, not commitments. Please open a feature request with the user problem before proposing a large implementation.
