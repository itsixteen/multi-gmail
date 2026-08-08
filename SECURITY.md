# Security Policy

## Supported versions

Security fixes are provided for the latest released version.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1 | No |

## Report a vulnerability privately

Do not open a public issue for a vulnerability. Use GitHub's **Report a vulnerability** feature on the Security tab of this repository.

Include:

- affected version or commit
- impact and attack prerequisites
- minimal reproduction steps
- suggested mitigation, if known

Never include Gmail content, OAuth client JSON, access tokens, refresh tokens, Keychain output, or unrelated personal data. Use a disposable test account when a proof of concept requires Gmail access.

We aim to acknowledge a report within seven days. Please allow time for validation and a coordinated fix before public disclosure.

## Security boundaries

- The MCP server is local stdio; it does not listen on a public network port.
- OAuth refresh tokens are stored in macOS Keychain.
- OAuth uses PKCE, random state, and a loopback callback.
- Read tools may span accounts; write tools require one explicit account.
- Permanent Gmail deletion is not available.
- Tool annotations support host-side confirmation, but server-side authorization and validation remain mandatory.

Read [docs/security-model.md](docs/security-model.md) for the full threat model.
