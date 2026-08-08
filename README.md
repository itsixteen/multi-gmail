# Multi Gmail

[![CI](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/ci.yml)
[![CodeQL](https://github.com/itsixteen/multi-gmail/actions/workflows/codeql.yml/badge.svg)](https://github.com/itsixteen/multi-gmail/actions/workflows/codeql.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Let Codex work safely across multiple Gmail accounts in one task.

[简体中文](README.zh-CN.md)

Search, read, triage, label, archive, draft, and send across explicitly connected accounts. OAuth refresh tokens stay in your macOS Keychain and never pass through a server operated by the project author.

## Install

Requires macOS, Node.js 20+, and Codex. You do not need to install npm dependencies or build the project.

> With Option 2, Google sign-in and consent are normally the only actions that require your personal confirmation. Let Codex handle the commands and diagnostics. Share only the OAuth JSON's local path, never its contents.

### Option 1: Standard installation

**1. Download and install the plugin**

```bash
git clone https://github.com/itsixteen/multi-gmail.git
cd multi-gmail
codex plugin marketplace add itsixteen/multi-gmail
codex plugin add multi-gmail@itsixteen
```

**2. Create a Google OAuth client**

Open the [Google OAuth setup guide](docs/google-oauth-setup.md) and complete only these required actions:

- enable the Gmail API;
- add every Gmail address as a test user while the app is in Testing;
- create a **Desktop app** OAuth client;
- download its JSON file.

**3. Connect Gmail**

Replace the first path with the downloaded JSON. `personal` and `work` are example aliases; choose any unique names.

```bash
node plugins/multi-gmail/dist/auth.mjs configure ~/Downloads/client_secret_....json
node plugins/multi-gmail/dist/auth.mjs add personal
node plugins/multi-gmail/dist/auth.mjs add work
node plugins/multi-gmail/dist/auth.mjs doctor
```

Each `add` command opens Google authorization. Select the intended account and approve access.

Finally, start a new Codex task so the newly installed plugin is loaded.

### Option 2: Paste this into Codex (recommended)

Open a Codex task on your Mac and paste the entire prompt below:

```text
Help me install and configure Multi Gmail on this Mac:
https://github.com/itsixteen/multi-gmail

Goal: connect the Gmail accounts I select and verify every account with the doctor command.

First read the repository's latest README and docs/google-oauth-setup.md, then do as much as possible for me:
1. Check macOS, Git, Node.js 20+, and the Codex CLI.
2. Clone the repository into an appropriate persistent directory. If it already exists, update it safely without overwriting my changes.
3. Add the itsixteen/multi-gmail marketplace and install multi-gmail@itsixteen.
4. Guide or assist me through Gmail API, Audience/Test users, and Desktop app OAuth client setup in Google Cloud.
5. Ask for the OAuth JSON's local path and an alias for each Gmail account, then run auth configure and auth add.
6. Run auth list, auth doctor, and relevant safety checks.
7. When finished, tell me to start a new Codex task and give me one prompt that verifies multi-account access.

Run terminal commands directly when you have permission; do not make me copy commands you can run yourself. Pause only when Google requires me to sign in, confirm, or authorize, or when you need the OAuth JSON's local path and my account aliases.

Security requirements: never display the OAuth JSON contents, client secret, access token, refresh token, or Keychain output in chat or logs; never commit credentials to Git; pass only the OAuth JSON's local path to the project's auth configure command.
```

Codex can handle cloning, installation, terminal commands, and diagnostics. Google sign-in and account consent still require your confirmation. Start a new task after installation because the current task does not hot-load newly installed plugin tools.

## Example prompts

- “Summarize unread issue notifications from all Gmail accounts for the last 7 days.”
- “Find invoices in every connected account without modifying mail.”
- “Archive these messages in `personal` and label them `Receipts`.”
- “Draft a reply from `work`; do not send it.”

Read tools can query one account or `account="all"`. Every write requires one explicit account. Permanent deletion is intentionally unavailable.

## Security and privacy

- Refresh tokens stay in macOS Keychain.
- MCP uses local stdio; there is no public mailbox endpoint.
- Per-account failures remain visible instead of being presented as complete results.
- Trash is reversible; permanent deletion is unavailable.
- Every user creates their own Google OAuth client, so the project author receives no mailbox data or credentials.

Never paste OAuth JSON, tokens, or Keychain output into chat or a GitHub issue. Read the [security model](docs/security-model.md), [privacy policy](PRIVACY.md), and [OAuth troubleshooting guide](docs/google-oauth-setup.md#troubleshooting).

## Development and contributing

```bash
cd plugins/multi-gmail
npm ci
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/architecture.md), and the [roadmap](ROADMAP.md). Use [GitHub Issues](https://github.com/itsixteen/multi-gmail/issues) for reproducible bugs and feature requests; use private vulnerability reporting for security issues.

The account-selection model was informed by [`navbuildz/gmail-mcp-server`](https://github.com/navbuildz/gmail-mcp-server). Multi Gmail is a separate implementation; see [THIRD_PARTY_NOTICES.md](plugins/multi-gmail/THIRD_PARTY_NOTICES.md).

[MIT](LICENSE) © 2026 我是十六 / itsixteen.
