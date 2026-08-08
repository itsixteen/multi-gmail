#!/usr/bin/env node

// src/auth.ts
import { execFile as execFile2 } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync as readFileSync2 } from "node:fs";
import { createServer } from "node:http";
import { homedir as homedir2 } from "node:os";
import { resolve } from "node:path";
import { promisify as promisify2 } from "node:util";

// src/utils.ts
function asErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-access-token]").replace(/1\/\/[A-Za-z0-9._-]+/g, "[redacted-refresh-token]");
}
function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}
function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}
function headerValue(headers, name) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function collectMimeBodies(part, texts, html) {
  if (!part) return;
  const mimeType = part.mimeType?.toLowerCase();
  const data = part.body?.data;
  if (data && mimeType === "text/plain") texts.push(base64UrlDecode(data));
  if (data && mimeType === "text/html") html.push(base64UrlDecode(data));
  for (const child of part.parts ?? []) collectMimeBodies(child, texts, html);
}
function extractMimeBodies(part) {
  const texts = [];
  const html = [];
  collectMimeBodies(part, texts, html);
  return { text: texts.join("\n\n"), html: html.join("\n\n") };
}
function collectAttachments(part) {
  if (!part) return [];
  const current = part.filename && part.body?.attachmentId ? [
    {
      attachment_id: part.body.attachmentId,
      filename: part.filename,
      mime_type: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0
    }
  ] : [];
  return [
    ...current,
    ...(part.parts ?? []).flatMap((child) => collectAttachments(child))
  ];
}
async function mapLimit(items, limit, operation) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        const item = items[index];
        if (item === void 0) return;
        results[index] = await operation(item, index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}
function assertSafeHeader(value, field) {
  if (/\r|\n/.test(value)) {
    throw new Error(`${field} must not contain line breaks.`);
  }
}
function encodeHeader(value) {
  assertSafeHeader(value, "Header");
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}
function wrapBase64(value) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g).join("\r\n");
}
function buildRawEmail(input) {
  const recipients = [
    ["From", input.from],
    ["To", input.to.join(", ")],
    ...input.cc?.length ? [["Cc", input.cc.join(", ")]] : [],
    ...input.bcc?.length ? [["Bcc", input.bcc.join(", ")]] : []
  ];
  for (const [field, value] of recipients) assertSafeHeader(value, field);
  assertSafeHeader(input.inReplyTo ?? "", "In-Reply-To");
  assertSafeHeader(input.references ?? "", "References");
  const headers = [
    ...recipients.map(([field, value]) => `${field}: ${value}`),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    ...input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : [],
    ...input.references ? [`References: ${input.references}`] : []
  ];
  if (!input.bodyHtml) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(input.bodyText)
    ].join("\r\n");
  }
  const boundary = `multi-gmail-${crypto.randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.bodyText),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(input.bodyHtml),
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

// src/storage.ts
import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var KEYCHAIN_SERVICE = "com.openai.codex.multi-gmail";
function dataDir() {
  return process.env.MULTI_GMAIL_DATA_DIR ?? join(homedir(), "Library", "Application Support", "Codex", "Multi Gmail");
}
function ensureDataDir() {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true, mode: 448 });
  chmodSync(dir, 448);
  return dir;
}
function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 448 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}
`, {
    encoding: "utf8",
    mode: 384
  });
  renameSync(temporary, path);
  chmodSync(path, 384);
}
function configPath() {
  return join(ensureDataDir(), "oauth-client.json");
}
function accountsPath() {
  return join(ensureDataDir(), "accounts.json");
}
function saveOAuthConfig(config) {
  atomicWriteJson(configPath(), config);
}
function loadOAuthConfig() {
  const path = configPath();
  if (!existsSync(path)) {
    throw new Error(
      `OAuth client is not configured. Run: npm run auth -- configure /path/to/client_secret.json`
    );
  }
  return readJson(path, { clientId: "", clientSecret: "" });
}
function listAccounts() {
  return readJson(accountsPath(), { accounts: [] }).accounts;
}
function upsertAccount(account) {
  const accounts = listAccounts().filter(
    (existing) => existing.email.toLowerCase() !== account.email.toLowerCase()
  );
  accounts.push(account);
  accounts.sort((left, right) => left.email.localeCompare(right.email));
  atomicWriteJson(accountsPath(), { accounts });
}
function removeAccountRecord(email) {
  const current = listAccounts();
  const accounts = current.filter(
    (account) => account.email.toLowerCase() !== email.toLowerCase()
  );
  if (accounts.length === current.length) return false;
  atomicWriteJson(accountsPath(), { accounts });
  return true;
}
function resolveAccount(selector) {
  const normalized = selector.trim().toLowerCase();
  const matches = listAccounts().filter(
    (account) => account.email.toLowerCase() === normalized || account.alias?.toLowerCase() === normalized
  );
  if (matches.length === 1) return matches[0];
  const available = listAccounts().map(
    (account) => account.alias ? `${account.alias} (${account.email})` : account.email
  ).join(", ");
  throw new Error(
    `Gmail account "${selector}" is not connected. Available accounts: ${available || "none"}.`
  );
}
function requireMacOSKeychain() {
  if (process.platform !== "darwin") {
    throw new Error(
      "Multi Gmail currently stores OAuth refresh tokens in macOS Keychain and requires macOS."
    );
  }
}
async function saveRefreshToken(email, token) {
  requireMacOSKeychain();
  await execFileAsync("/usr/bin/security", [
    "add-generic-password",
    "-U",
    "-a",
    email.toLowerCase(),
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    token
  ]);
}
async function getRefreshToken(email) {
  requireMacOSKeychain();
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-a",
      email.toLowerCase(),
      "-s",
      KEYCHAIN_SERVICE,
      "-w"
    ]);
    const token = stdout.trim();
    if (!token) throw new Error("empty token");
    return token;
  } catch {
    throw new Error(
      `No OAuth refresh token found for ${email}. Re-authorize it with the Multi Gmail auth command.`
    );
  }
}
async function deleteRefreshToken(email) {
  requireMacOSKeychain();
  try {
    await execFileAsync("/usr/bin/security", [
      "delete-generic-password",
      "-a",
      email.toLowerCase(),
      "-s",
      KEYCHAIN_SERVICE
    ]);
  } catch {
  }
}

// src/gmail-api.ts
var GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var RESERVED_LABELS = /* @__PURE__ */ new Set([
  "CHAT",
  "DRAFT",
  "IMPORTANT",
  "INBOX",
  "SENT",
  "SPAM",
  "STARRED",
  "TRASH",
  "UNREAD",
  "CATEGORY_FORUMS",
  "CATEGORY_PERSONAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_UPDATES"
]);
var tokenCache = /* @__PURE__ */ new Map();
async function parseJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : body.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`Gmail API request failed: ${message}`);
  }
  return body;
}
async function refreshAccessToken(account, config) {
  const refreshToken = await getRefreshToken(account.email);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(3e4)
  });
  const body = await parseJsonResponse(response);
  if (!body.access_token) {
    throw new Error(`Google did not return an access token for ${account.email}.`);
  }
  const entry = {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1e3
  };
  tokenCache.set(account.email.toLowerCase(), entry);
  return entry;
}
async function accessToken(account) {
  const key = account.email.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 6e4) return cached.accessToken;
  return (await refreshAccessToken(account, loadOAuthConfig())).accessToken;
}
async function gmailRequest(account, path, options = {}) {
  const url = new URL(`${GMAIL_BASE}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== void 0) url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken(account)}`,
      ...options.body === void 0 ? {} : { "Content-Type": "application/json" }
    },
    body: options.body === void 0 ? void 0 : JSON.stringify(options.body),
    signal: AbortSignal.timeout(6e4)
  });
  return parseJsonResponse(response);
}
function parseMessage(message) {
  const payload = message.payload;
  const headers = payload?.headers;
  const bodies = extractMimeBodies(payload);
  const internalDate = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
  return {
    id: message.id ?? "",
    thread_id: message.threadId ?? "",
    subject: headerValue(headers, "Subject"),
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    cc: headerValue(headers, "Cc"),
    bcc: headerValue(headers, "Bcc"),
    date: headerValue(headers, "Date"),
    internal_date: internalDate,
    snippet: message.snippet ?? "",
    label_ids: message.labelIds ?? [],
    message_id_header: headerValue(headers, "Message-ID"),
    references: headerValue(headers, "References"),
    body_text: bodies.text,
    body_html: bodies.html,
    attachments: collectAttachments(payload),
    size_estimate: message.sizeEstimate ?? 0
  };
}
function summaryFromMessage(message) {
  const parsed = parseMessage(message);
  return {
    id: parsed.id,
    thread_id: parsed.thread_id,
    subject: parsed.subject,
    from: parsed.from,
    to: parsed.to,
    date: parsed.date,
    internal_date: parsed.internal_date,
    snippet: parsed.snippet,
    label_ids: parsed.label_ids
  };
}
var GmailApi = class {
  constructor(account) {
    this.account = account;
  }
  account;
  async profile() {
    const profile = await gmailRequest(this.account, "/profile");
    return {
      email: profile.emailAddress ?? this.account.email,
      messages_total: profile.messagesTotal ?? 0,
      threads_total: profile.threadsTotal ?? 0
    };
  }
  async searchEmails(input) {
    const listed = await gmailRequest(this.account, "/messages", {
      query: {
        q: input.query,
        maxResults: input.maxResults,
        pageToken: input.pageToken
      }
    });
    const messages = listed.messages ?? [];
    const emails = await mapLimit(messages, 10, async (item) => {
      if (!item.id) throw new Error("Gmail returned a message without an id.");
      const message = await gmailRequest(
        this.account,
        `/messages/${encodeURIComponent(item.id)}`,
        {
          query: {
            format: "metadata",
            metadataHeaders: void 0
          }
        }
      );
      return summaryFromMessage(message);
    });
    return {
      emails,
      next_page_token: listed.nextPageToken ?? null,
      result_size_estimate: listed.resultSizeEstimate ?? emails.length
    };
  }
  async readEmail(messageId) {
    const message = await gmailRequest(
      this.account,
      `/messages/${encodeURIComponent(messageId)}`,
      { query: { format: "full" } }
    );
    return parseMessage(message);
  }
  async readThread(threadId) {
    const thread = await gmailRequest(
      this.account,
      `/threads/${encodeURIComponent(threadId)}`,
      { query: { format: "full" } }
    );
    const messages = (thread.messages ?? []).map(parseMessage).sort(
      (left, right) => (left.internal_date ?? "").localeCompare(right.internal_date ?? "")
    );
    return {
      thread_id: thread.id ?? threadId,
      history_id: thread.historyId ?? null,
      messages
    };
  }
  async listLabels() {
    const response = await gmailRequest(
      this.account,
      "/labels"
    );
    return (response.labels ?? []).filter((label) => label.id && label.name).map((label) => ({
      id: label.id,
      name: label.name,
      type: label.type ?? "unknown",
      messages_total: label.messagesTotal ?? 0,
      messages_unread: label.messagesUnread ?? 0,
      threads_total: label.threadsTotal ?? 0,
      threads_unread: label.threadsUnread ?? 0
    })).sort((left, right) => left.name.localeCompare(right.name));
  }
  async resolveLabelIds(names, createMissing) {
    const labels = await this.listLabels();
    const byName = new Map(labels.map((label) => [label.name.toLowerCase(), label.id]));
    const ids = [];
    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) continue;
      const existing = byName.get(name.toLowerCase());
      if (existing) {
        ids.push(existing);
        continue;
      }
      const uppercase = name.toUpperCase();
      if (RESERVED_LABELS.has(uppercase)) {
        ids.push(uppercase);
        continue;
      }
      if (!createMissing) throw new Error(`Gmail label "${name}" does not exist.`);
      const created = await gmailRequest(this.account, "/labels", {
        method: "POST",
        body: {
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show"
        }
      });
      if (!created.id) throw new Error(`Gmail did not return an id for label "${name}".`);
      byName.set(name.toLowerCase(), created.id);
      ids.push(created.id);
    }
    return [...new Set(ids)];
  }
  async modifyEmails(input) {
    const addLabelIds = await this.resolveLabelIds(
      input.addLabels,
      input.createMissingLabels
    );
    const removeLabelIds = await this.resolveLabelIds(input.removeLabels, false);
    await gmailRequest(this.account, "/messages/batchModify", {
      method: "POST",
      body: {
        ids: input.messageIds,
        addLabelIds,
        removeLabelIds
      }
    });
  }
  async trashEmails(messageIds) {
    await mapLimit(
      messageIds,
      10,
      (id) => gmailRequest(this.account, `/messages/${encodeURIComponent(id)}/trash`, {
        method: "POST"
      })
    );
  }
  async untrashEmails(messageIds) {
    await mapLimit(
      messageIds,
      10,
      (id) => gmailRequest(this.account, `/messages/${encodeURIComponent(id)}/untrash`, {
        method: "POST"
      })
    );
  }
  async rawOutgoing(message) {
    const profile = await this.profile();
    return base64UrlEncode(
      buildRawEmail({
        from: profile.email,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        bodyText: message.body_text,
        bodyHtml: message.body_html,
        inReplyTo: message.in_reply_to,
        references: message.references
      })
    );
  }
  async createDraft(message, threadId) {
    const response = await gmailRequest(this.account, "/drafts", {
      method: "POST",
      body: {
        message: {
          raw: await this.rawOutgoing(message),
          ...threadId ? { threadId } : {}
        }
      }
    });
    return {
      draft_id: response.id ?? "",
      message_id: response.message?.id ?? "",
      thread_id: response.message?.threadId ?? threadId ?? ""
    };
  }
  async sendEmail(message, threadId) {
    const response = await gmailRequest(this.account, "/messages/send", {
      method: "POST",
      body: {
        raw: await this.rawOutgoing(message),
        ...threadId ? { threadId } : {}
      }
    });
    return {
      message_id: response.id ?? "",
      thread_id: response.threadId ?? threadId ?? "",
      label_ids: response.labelIds ?? []
    };
  }
};

// src/auth.ts
var execFileAsync2 = promisify2(execFile2);
var SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.modify"
];
function help() {
  process.stdout.write(`Multi Gmail authorization

Usage:
  npm run auth -- configure /path/to/client_secret.json
  npm run auth -- add [alias]
  npm run auth -- list
  npm run auth -- remove <email-or-alias>
  npm run auth -- doctor
  npm run auth -- data-dir

Use a Google OAuth client of type "Desktop app". The gmail.modify scope can
read, label, archive, draft, and send, but cannot permanently delete mail.
Refresh tokens are stored in macOS Keychain; only account metadata and the
OAuth desktop-client configuration are stored in ${dataDir()}.
`);
}
function expandedPath(input) {
  return resolve(input.startsWith("~/") ? `${homedir2()}/${input.slice(2)}` : input);
}
function configure(credentialsPath) {
  if (!credentialsPath) throw new Error("Provide the downloaded client_secret.json path.");
  const raw = JSON.parse(readFileSync2(expandedPath(credentialsPath), "utf8"));
  if (!raw.installed) {
    throw new Error(
      'This is not a Google OAuth "Desktop app" credential file. Create a Desktop app client and download its JSON.'
    );
  }
  if (!raw.installed.client_id || !raw.installed.client_secret) {
    throw new Error("The OAuth credential file is missing client_id or client_secret.");
  }
  saveOAuthConfig({
    clientId: raw.installed.client_id,
    clientSecret: raw.installed.client_secret,
    projectId: raw.installed.project_id
  });
  process.stdout.write(`OAuth desktop client saved securely in ${dataDir()}
`);
}
async function openBrowser(url) {
  if (process.platform === "darwin") {
    try {
      await execFileAsync2("/usr/bin/open", [url]);
      return;
    } catch {
    }
  }
  process.stdout.write(`Open this URL in your browser:
${url}
`);
}
async function addAccount(alias) {
  const config = loadOAuthConfig();
  if (alias && listAccounts().some((account) => account.alias?.toLowerCase() === alias.toLowerCase())) {
    throw new Error(`Alias "${alias}" is already in use.`);
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let finish;
  let fail;
  const callback = new Promise((resolvePromise, rejectPromise) => {
    finish = resolvePromise;
    fail = rejectPromise;
  });
  const server = createServer((request, response) => {
    const address2 = server.address();
    if (!address2 || typeof address2 === "string") {
      response.writeHead(500).end("OAuth callback server is unavailable.");
      fail?.(new Error("OAuth callback server is unavailable."));
      return;
    }
    const redirectUri2 = `http://127.0.0.1:${address2.port}/oauth/callback`;
    const url = new URL(request.url ?? "/", redirectUri2);
    if (url.pathname !== "/oauth/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (returnedState !== state) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Authorization failed: state mismatch. You can close this tab.");
      fail?.(new Error("OAuth state mismatch."));
      return;
    }
    if (error || !code) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Authorization was cancelled or failed. You can close this tab.");
      fail?.(new Error(`Google OAuth failed: ${error ?? "authorization code missing"}`));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><meta charset=utf-8><title>Multi Gmail connected</title><h2>Gmail \u5DF2\u8FDE\u63A5</h2><p>\u53EF\u4EE5\u5173\u95ED\u8FD9\u4E2A\u9875\u9762\uFF0C\u8FD4\u56DE\u7EC8\u7AEF\u3002</p>"
    );
    finish?.({ code, redirectUri: redirectUri2 });
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start OAuth callback server.");
  const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  process.stdout.write("Opening Google authorization in your browser\u2026\n");
  await openBrowser(authorizationUrl.toString());
  const timeout = setTimeout(() => fail?.(new Error("OAuth authorization timed out after 5 minutes.")), 3e5);
  try {
    const authorization = await callback;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: authorization.code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: authorization.redirectUri
      }),
      signal: AbortSignal.timeout(3e4)
    });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.access_token || !tokenBody.refresh_token) {
      throw new Error(
        tokenBody.error_description ?? tokenBody.error ?? "Google did not return both access and refresh tokens."
      );
    }
    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(3e4)
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.email || user.email_verified === false) {
      throw new Error("Google did not return a verified account email address.");
    }
    await saveRefreshToken(user.email, tokenBody.refresh_token);
    upsertAccount({ email: user.email, alias, addedAt: (/* @__PURE__ */ new Date()).toISOString() });
    process.stdout.write(
      `Connected ${user.email}${alias ? ` as alias "${alias}"` : ""}. Refresh token saved in macOS Keychain.
`
    );
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}
function showAccounts() {
  const accounts = listAccounts();
  if (accounts.length === 0) {
    process.stdout.write("No Gmail accounts connected.\n");
    return;
  }
  for (const account of accounts) {
    process.stdout.write(
      `${account.email}${account.alias ? `	alias=${account.alias}` : ""}	added=${account.addedAt}
`
    );
  }
}
async function removeAccount(selector) {
  if (!selector) throw new Error("Provide an email address or alias to remove.");
  const account = resolveAccount(selector);
  await deleteRefreshToken(account.email);
  removeAccountRecord(account.email);
  process.stdout.write(`Removed ${account.email} from Multi Gmail and macOS Keychain.
`);
}
async function doctor() {
  loadOAuthConfig();
  const accounts = listAccounts();
  if (accounts.length === 0) throw new Error("OAuth client is configured, but no accounts are connected.");
  let failed = false;
  for (const account of accounts) {
    try {
      const profile = await new GmailApi(account).profile();
      process.stdout.write(`OK	${profile.email}
`);
    } catch (error) {
      failed = true;
      process.stdout.write(`FAIL	${account.email}	${asErrorMessage(error)}
`);
    }
  }
  if (failed) process.exitCode = 1;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "configure":
      configure(args[0]);
      break;
    case "add":
      await addAccount(args[0]);
      break;
    case "list":
      showAccounts();
      break;
    case "remove":
      await removeAccount(args[0]);
      break;
    case "doctor":
      await doctor();
      break;
    case "data-dir":
      process.stdout.write(`${dataDir()}
`);
      break;
    case "help":
    case "--help":
    case "-h":
    case void 0:
      help();
      break;
    default:
      throw new Error(`Unknown command "${command}". Run with --help for usage.`);
  }
}
main().catch((error) => {
  process.stderr.write(`Multi Gmail auth error: ${asErrorMessage(error)}
`);
  process.exitCode = 1;
});
//# sourceMappingURL=auth.mjs.map
