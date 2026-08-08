# Privacy

Multi Gmail is a local, self-configured plugin. The project author does not operate a server that receives your Gmail credentials or mailbox data.

## Data the plugin stores

- Google OAuth desktop client configuration in `~/Library/Application Support/Codex/Multi Gmail`, with file mode `0600`.
- Connected account email addresses, optional aliases, and connection timestamps in the same local application-support directory.
- OAuth refresh tokens in macOS Keychain under service `com.openai.codex.multi-gmail`.

## Data the plugin accesses

The plugin requests:

- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/gmail.modify`

These permissions allow the local plugin to identify the selected account and read, compose, send, and modify Gmail data. The plugin does not expose Gmail permanent deletion.

## Data flows

1. The local MCP server exchanges a Keychain-stored refresh token with Google for a short-lived access token.
2. The local MCP server calls the Gmail API for the tool operation requested in Codex.
3. Relevant tool results are returned to the Codex host and may be processed under the privacy terms of the ChatGPT or API account you are using.
4. No mailbox data is sent to a server operated by the Multi Gmail author.

## Logs

The plugin does not intentionally log access tokens, refresh tokens, OAuth client secrets, or full mailbox results. Users should still inspect any diagnostics before sharing them publicly.

## Removing data

Run:

```bash
node plugins/multi-gmail/dist/auth.mjs remove <email-or-alias>
```

You may also revoke the OAuth grant in your Google Account. To remove all local metadata, delete the `Multi Gmail` application-support directory after removing the associated Keychain items.

## Scope

This privacy statement describes the open-source local plugin. A future hosted service would require a separate privacy policy and is not covered here.
