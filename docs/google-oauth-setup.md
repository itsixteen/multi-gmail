# Google OAuth setup

Multi Gmail uses your own Google Cloud project and a **Desktop app** OAuth client. The project never receives your credential file or tokens.

## Before you begin

You need:

- a Google account that can create a Google Cloud project;
- every Gmail account you want to connect;
- macOS and Node.js 20 or newer.

The plugin requests only these scopes:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/gmail.modify
```

Google documents `gmail.modify` as allowing read, compose, send, and mailbox changes while excluding immediate permanent deletion. Multi Gmail does not expose permanent deletion at all.

## 1. Create a project and enable Gmail API

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project, or select one used only for this integration.
3. Open **APIs & Services → Library**.
4. Search for **Gmail API**, open it, and select **Enable**.

## 2. Configure the Google Auth Platform

Open **Google Auth Platform** for the project.

### Branding

Use a recognizable name such as `Multi Gmail (personal)`, choose your support email, and complete the required contact details.

### Audience

- For ordinary Gmail accounts, choose **External**.
- Choose **Internal** only when every account belongs to the same Google Workspace organization and the option is available to you.

While the external app is in **Testing**, add every Gmail address you intend to connect under **Audience → Test users**. A missing address is the usual cause of:

```text
Access blocked: <app name> has not completed the Google verification process
```

After adding a test user, save the change and retry authorization in a new browser tab.

### Data access

Add the Gmail scope:

```text
https://www.googleapis.com/auth/gmail.modify
```

The plugin also requests OpenID and email identity scopes so it can record which Gmail address was actually authorized.

## 3. Choose Testing or In production

For an external OAuth app, the two practical choices are:

| Status | Best for | Important behavior |
| --- | --- | --- |
| Testing | Initial setup | Only listed test users can connect. Because `gmail.modify` is requested, refresh tokens normally expire after 7 days. |
| In production | Long-running personal use | Google may display an unverified-app warning until verification is completed. Unverified apps are also subject to Google's user cap. |

For two or a few Gmail accounts you personally control, start in **Testing** to prove the setup. If you want the connection to remain usable beyond seven days, move the app to **In production** and follow Google's current warning or verification flow.

Publishing the source code does **not** publish your Google OAuth client. Every installer should create their own Google Cloud project and keep their client JSON private.

## 4. Create a Desktop app credential

1. Open **Google Auth Platform → Clients**.
2. Select **Create client**.
3. Choose application type **Desktop app**.
4. Name it, create it, and download the JSON file.

The JSON must contain an `installed` object. A **Web application** credential will not work with Multi Gmail's loopback callback.

Do not rename or move the downloaded file into this repository. Do not paste it into chat or a GitHub issue.

## 5. Configure Multi Gmail

From the cloned repository:

```bash
node plugins/multi-gmail/dist/auth.mjs configure ~/Downloads/client_secret_....json
```

This extracts the OAuth client configuration into a mode-`0600` local file under:

```text
~/Library/Application Support/Codex/Multi Gmail
```

The original download is not needed by the plugin after configuration. Store it securely or delete it.

## 6. Connect every Gmail account

Run one command per account, using any unique alias you prefer:

```bash
node plugins/multi-gmail/dist/auth.mjs add personal
node plugins/multi-gmail/dist/auth.mjs add work
node plugins/multi-gmail/dist/auth.mjs list
node plugins/multi-gmail/dist/auth.mjs doctor
```

Each `add` opens a Google authorization page. Check the account shown in the top-right corner before approving. The refresh token is then stored in macOS Keychain, not in the repository.

## Troubleshooting

### “Access blocked”

Confirm all four items:

1. Gmail API is enabled in the same project as the downloaded client.
2. The app audience is External (or correctly configured Internal).
3. The address being authorized appears under **Test users** while status is Testing.
4. `gmail.modify` appears in Data access and matches the scope requested by the plugin.

### Google displays “500. That’s an error.”

This is commonly a stale Google authorization session rather than a Multi Gmail server error. Close the failed tab, run `add` again, and open the new URL in a private window. Also verify that the Desktop app client belongs to the intended project and that the account is an allowed test user.

If it persists, remove the site's cookies for `accounts.google.com`, avoid reusing an old callback URL, and retry. The loopback port is randomly selected on every run, so an old authorization URL cannot be reused.

### Authorization succeeds, then fails after seven days

That is expected for an External app in Testing when it requests Gmail access. Re-authorize the account, or move the OAuth app to In production after reviewing Google's current requirements.

### “This is not a Google OAuth Desktop app credential file”

Create a new OAuth client with application type **Desktop app**. Do not use a service account or Web application client.

### `doctor` reports a missing refresh token

Re-authorize the affected account:

```bash
node plugins/multi-gmail/dist/auth.mjs add personal
```

If needed, first remove the old local record:

```bash
node plugins/multi-gmail/dist/auth.mjs remove personal
```

## Official references

- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Manage app audience](https://support.google.com/cloud/answer/15549945)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Unverified apps](https://support.google.com/cloud/answer/7454865)
