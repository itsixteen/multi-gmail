# Multi Gmail plugin package

This directory contains the Codex plugin distributed by the [Multi Gmail marketplace repository](https://github.com/itsixteen/multi-gmail). It works across several Gmail accounts while keeping Google OAuth refresh tokens in macOS Keychain.

## Capabilities

- List and health-check connected Gmail accounts.
- Search one account or all accounts with Gmail query syntax.
- Read messages in batches and read complete threads.
- List labels and unread counts.
- Archive, label, mark read/unread, move to Trash, and restore.
- Create drafts and send mail from one explicitly selected account.
- Surface per-account failures so partial results are never mistaken for complete results.

The plugin deliberately does **not** expose permanent deletion.

## Requirements

- macOS (OAuth refresh tokens are stored in Keychain).
- Node.js 20 or newer.
- A personal Google Cloud OAuth desktop client.

## 1. Create the Google OAuth client

Follow the repository's complete [Google OAuth setup guide](../../docs/google-oauth-setup.md). Use a client of type **Desktop app**, add every intended Gmail address as a test user when the app is in Testing, and never commit or share the downloaded JSON.

## 2. Build and configure

From the repository root:

```bash
node plugins/multi-gmail/dist/auth.mjs configure ~/Downloads/client_secret_....json
```

Never paste the downloaded client JSON or any token into chat.

## 3. Connect each Gmail account

```bash
node plugins/multi-gmail/dist/auth.mjs add personal
node plugins/multi-gmail/dist/auth.mjs add work
node plugins/multi-gmail/dist/auth.mjs list
node plugins/multi-gmail/dist/auth.mjs doctor
```

Each `add` command opens Google authorization in the browser. Sign into the intended Gmail account, approve access, then repeat for the next account. Aliases such as `personal` and `work` are optional but make tool calls clearer.

Account metadata and the OAuth desktop-client configuration are stored with mode `0600` under:

```text
~/Library/Application Support/Codex/Multi Gmail
```

Refresh tokens are stored separately in macOS Keychain under service `com.openai.codex.multi-gmail`.

## 4. Install in Codex

```bash
codex plugin marketplace add itsixteen/multi-gmail
codex plugin add multi-gmail@itsixteen
```

Start a new Codex task so the bundled tools and skill are loaded.

## Maintenance

```bash
cd plugins/multi-gmail
npm test
npm run build
node dist/auth.mjs doctor
```

To revoke one account locally:

```bash
node dist/auth.mjs remove personal
```

You can also revoke the OAuth grant from the Google Account permissions page.

## Security notes

- The MCP transport is local stdio; no mailbox endpoint is exposed on the network.
- Read tools may use `account="all"`; write tools require one explicit account.
- Cross-account searches report failures instead of replacing them with empty success results.
- Secrets are never written to logs or returned by MCP tools.
- Gmail writes are annotated so Codex can apply write/destructive approval policy.

Read the repository's full [security model](../../docs/security-model.md) and [privacy statement](../../PRIVACY.md).

## License and reference

This plugin is MIT licensed. The account-selection idea was informed by [navbuildz/gmail-mcp-server](https://github.com/navbuildz/gmail-mcp-server); see `THIRD_PARTY_NOTICES.md` for attribution and the differences that motivated this implementation.
