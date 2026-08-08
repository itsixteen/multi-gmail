#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { GmailApi } from "./gmail-api.js";
import {
  dataDir,
  deleteRefreshToken,
  listAccounts,
  loadOAuthConfig,
  removeAccountRecord,
  resolveAccount,
  saveOAuthConfig,
  saveRefreshToken,
  upsertAccount,
} from "./storage.js";
import { asErrorMessage } from "./utils.js";

const execFileAsync = promisify(execFile);
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.modify",
];

function help(): void {
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

function expandedPath(input: string): string {
  return resolve(input.startsWith("~/") ? `${homedir()}/${input.slice(2)}` : input);
}

function configure(credentialsPath: string | undefined): void {
  if (!credentialsPath) throw new Error("Provide the downloaded client_secret.json path.");
  const raw = JSON.parse(readFileSync(expandedPath(credentialsPath), "utf8")) as {
    installed?: {
      client_id?: string;
      client_secret?: string;
      project_id?: string;
    };
    web?: unknown;
  };
  if (!raw.installed) {
    throw new Error(
      'This is not a Google OAuth "Desktop app" credential file. Create a Desktop app client and download its JSON.',
    );
  }
  if (!raw.installed.client_id || !raw.installed.client_secret) {
    throw new Error("The OAuth credential file is missing client_id or client_secret.");
  }
  saveOAuthConfig({
    clientId: raw.installed.client_id,
    clientSecret: raw.installed.client_secret,
    projectId: raw.installed.project_id,
  });
  process.stdout.write(`OAuth desktop client saved securely in ${dataDir()}\n`);
}

async function openBrowser(url: string): Promise<void> {
  if (process.platform === "darwin") {
    try {
      await execFileAsync("/usr/bin/open", [url]);
      return;
    } catch {
      // Fall through and print the URL.
    }
  }
  process.stdout.write(`Open this URL in your browser:\n${url}\n`);
}

async function addAccount(alias?: string): Promise<void> {
  const config = loadOAuthConfig();
  if (alias && listAccounts().some((account) => account.alias?.toLowerCase() === alias.toLowerCase())) {
    throw new Error(`Alias "${alias}" is already in use.`);
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  let finish: ((value: { code: string; redirectUri: string }) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  const callback = new Promise<{ code: string; redirectUri: string }>((resolvePromise, rejectPromise) => {
    finish = resolvePromise;
    fail = rejectPromise;
  });

  const server = createServer((request, response) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      response.writeHead(500).end("OAuth callback server is unavailable.");
      fail?.(new Error("OAuth callback server is unavailable."));
      return;
    }
    const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
    const url = new URL(request.url ?? "/", redirectUri);
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
      "<!doctype html><meta charset=utf-8><title>Multi Gmail connected</title><h2>Gmail 已连接</h2><p>可以关闭这个页面，返回终端。</p>",
    );
    finish?.({ code, redirectUri });
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
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
    code_challenge_method: "S256",
  }).toString();

  process.stdout.write("Opening Google authorization in your browser…\n");
  await openBrowser(authorizationUrl.toString());

  const timeout = setTimeout(() => fail?.(new Error("OAuth authorization timed out after 5 minutes.")), 300_000);
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
        redirect_uri: authorization.redirectUri,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const tokenBody = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokenBody.access_token || !tokenBody.refresh_token) {
      throw new Error(
        tokenBody.error_description ??
          tokenBody.error ??
          "Google did not return both access and refresh tokens.",
      );
    }

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const user = (await userResponse.json()) as { email?: string; email_verified?: boolean };
    if (!userResponse.ok || !user.email || user.email_verified === false) {
      throw new Error("Google did not return a verified account email address.");
    }

    await saveRefreshToken(user.email, tokenBody.refresh_token);
    upsertAccount({ email: user.email, alias, addedAt: new Date().toISOString() });
    process.stdout.write(
      `Connected ${user.email}${alias ? ` as alias "${alias}"` : ""}. Refresh token saved in macOS Keychain.\n`,
    );
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}

function showAccounts(): void {
  const accounts = listAccounts();
  if (accounts.length === 0) {
    process.stdout.write("No Gmail accounts connected.\n");
    return;
  }
  for (const account of accounts) {
    process.stdout.write(
      `${account.email}${account.alias ? `\talias=${account.alias}` : ""}\tadded=${account.addedAt}\n`,
    );
  }
}

async function removeAccount(selector: string | undefined): Promise<void> {
  if (!selector) throw new Error("Provide an email address or alias to remove.");
  const account = resolveAccount(selector);
  await deleteRefreshToken(account.email);
  removeAccountRecord(account.email);
  process.stdout.write(`Removed ${account.email} from Multi Gmail and macOS Keychain.\n`);
}

async function doctor(): Promise<void> {
  loadOAuthConfig();
  const accounts = listAccounts();
  if (accounts.length === 0) throw new Error("OAuth client is configured, but no accounts are connected.");
  let failed = false;
  for (const account of accounts) {
    try {
      const profile = await new GmailApi(account).profile();
      process.stdout.write(`OK\t${profile.email}\n`);
    } catch (error) {
      failed = true;
      process.stdout.write(`FAIL\t${account.email}\t${asErrorMessage(error)}\n`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function main(): Promise<void> {
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
      process.stdout.write(`${dataDir()}\n`);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      help();
      break;
    default:
      throw new Error(`Unknown command "${command}". Run with --help for usage.`);
  }
}

main().catch((error) => {
  process.stderr.write(`Multi Gmail auth error: ${asErrorMessage(error)}\n`);
  process.exitCode = 1;
});
