# Multi Gmail

[![CI](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml)
[![CodeQL](https://github.com/itsixteen/multi-gmail/actions/workflows/codeql.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/codeql.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Securely work across multiple Gmail accounts from one Codex task.

[简体中文](README.zh-CN.md)

Multi Gmail is a local Codex plugin and MCP server for searching, reading, triaging, labeling, archiving, drafting, and sending email across multiple explicitly connected Gmail accounts. It keeps OAuth refresh tokens in macOS Keychain and never exposes a mailbox endpoint on the public internet.

## Why this exists

Most Gmail integrations assume one connected account. Multi Gmail treats account identity as part of every operation:

- Read tools can query one account or `account="all"`.
- Write tools require one explicit email address or alias.
- Cross-account results report per-account failures instead of presenting partial data as complete.
- Permanent deletion is intentionally not available.

## Security-first defaults

| Concern | Design |
| --- | --- |
| OAuth refresh tokens | Stored in macOS Keychain |
| OAuth client configuration | Local file with mode `0600` |
| MCP transport | Local stdio only |
| Cross-account writes | Rejected; one account is always required |
| Destructive actions | Trash is marked destructive and remains reversible |
| Permanent deletion | Not exposed |

Read [the security model](docs/security-model.md) and [privacy policy](PRIVACY.md) before connecting an account.

## Supported environments

- macOS
- Node.js 20 or newer
- Codex in the ChatGPT desktop app or Codex CLI

ChatGPT mobile currently does not support plugins. Codex Remote can still run a task on a connected Mac from a phone; see the [official OpenAI plugin availability documentation](https://learn.chatgpt.com/docs/plugins).

## Quick start

### 1. Clone this marketplace

```bash
git clone https://github.com/itsixteen/multi-gmail.git
cd multi-gmail
```

### 2. Create a Google OAuth desktop client

Follow [Google OAuth setup](docs/google-oauth-setup.md). You will enable the Gmail API, configure the three required scopes, add every Gmail account as a test user when applicable, create a **Desktop app** OAuth client, and download its JSON file.

### 3. Connect your Gmail accounts

The committed `dist/` bundle has no runtime npm dependency installation step.

```bash
node plugins/multi-gmail/dist/auth.mjs configure ~/Downloads/client_secret_....json
node plugins/multi-gmail/dist/auth.mjs add personal
node plugins/multi-gmail/dist/auth.mjs add work
node plugins/multi-gmail/dist/auth.mjs list
node plugins/multi-gmail/dist/auth.mjs doctor
```

Each `add` command opens Google authorization in your browser. Choose the intended account for that alias.

Never paste an OAuth client JSON, access token, refresh token, or Keychain output into chat or a GitHub issue.

### 4. Install the plugin

```bash
codex plugin marketplace add itsixteen/multi-gmail
codex plugin add multi-gmail@itsixteen
```

Start a new Codex task so the plugin tools and skill are loaded.

## Example prompts

- “Summarize unread issue notifications from all Gmail accounts for the last 7 days.”
- “Find invoices in every connected account, grouped by account.”
- “Archive these messages in `personal` and label them `Receipts`.”
- “Draft a reply from `work`; do not send it.”

## Available tools

- `list_accounts`
- `search_emails`
- `read_email`
- `batch_read_emails`
- `read_thread`
- `list_labels`
- `modify_emails`
- `trash_emails`
- `untrash_emails`
- `create_draft`
- `send_email`

## Local data

Account metadata and the OAuth desktop-client configuration are stored under:

```text
~/Library/Application Support/Codex/Multi Gmail
```

Refresh tokens are stored in macOS Keychain under service:

```text
com.openai.codex.multi-gmail
```

To remove one local grant:

```bash
node plugins/multi-gmail/dist/auth.mjs remove personal
```

You can also revoke the grant from your Google Account permissions page.

## Development

```bash
cd plugins/multi-gmail
npm ci
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and the [roadmap](ROADMAP.md).

## Project status

Multi Gmail is an early open-source release. Its local security boundaries are deliberate, but setup still requires a personal Google Cloud project. Please use [GitHub Issues](https://github.com/itsixteen/multi-gmail/issues) for reproducible bugs and feature requests; use private vulnerability reporting for security issues.

## Acknowledgments

The account-selection idea was informed by [`navbuildz/gmail-mcp-server`](https://github.com/navbuildz/gmail-mcp-server). Multi Gmail is a separate implementation with a local stdio transport, macOS Keychain storage, PKCE, random OAuth state, explicit safety annotations, and per-account failure reporting. See [THIRD_PARTY_NOTICES.md](plugins/multi-gmail/THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE) © 2026 我是十六 / itsixteen.
