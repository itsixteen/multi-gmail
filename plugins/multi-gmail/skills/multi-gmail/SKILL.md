---
name: multi-gmail
description: Search, read, triage, label, archive, draft, and send across multiple explicitly selected Gmail accounts through the local Multi Gmail MCP server.
---

# Multi Gmail

- Start any mailbox-wide request with `list_accounts`. State which accounts are healthy and in scope before presenting a supposedly complete cross-account result.
- Use `account: "all"` only on read tools. Every write must name one email address or configured alias. Never infer an account from Gmail browser `/u/0/` or `/u/1/` slots.
- `search_emails` returns message summaries grouped by account. Use `batch_read_emails` for a shortlist and `read_thread` when conversation context affects classification, a reply, or a recipient decision.
- Treat `complete: false` or any per-account `success: false` as an incomplete cross-account result. Report the failed account rather than silently presenting partial results as complete.
- Continue a single-account search with its `next_page_token`. Do not apply one account's token to another account.
- For inbox triage, default to `in:inbox` plus a clear timeframe. Use Gmail query syntax for sender, date, label, attachment, and read state filters.

## Writes

- Archive, label, mark read/unread, Trash, restore, draft, or send only when the user clearly requested that state change.
- Inspect and shortlist before bulk modifications. Use `modify_emails` for archive/label/read-state changes and keep each call within one account.
- Treat moving mail to Trash as destructive even though it can be restored. Never permanently delete mail; this plugin intentionally does not expose permanent deletion.
- `create_draft` creates a saved Gmail draft; never imply it was sent. `send_email` sends immediately and requires an explicit send request.
- Preserve recipients, subject, dates, quoted facts, links, `thread_id`, `in_reply_to`, and `references` when replying. Disambiguate competing threads or recipient identities before writing.
- After a write, report the account, operation, count, and user-meaningful subject or sender context. Do not expose raw Gmail message, thread, or draft identifiers in the final answer.

## Setup failures

- If no accounts are connected or OAuth is unhealthy, direct the user to the plugin source directory and run `npm run auth -- --help`, then `npm run auth -- doctor`.
- OAuth refresh tokens live in macOS Keychain. Never ask the user to paste a refresh token, access token, client secret, or Keychain output into chat.
