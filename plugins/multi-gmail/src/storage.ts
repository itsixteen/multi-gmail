import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { AccountRecord, AccountsFile, OAuthConfig } from "./types.js";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "com.openai.codex.multi-gmail";

export function dataDir(): string {
  return (
    process.env.MULTI_GMAIL_DATA_DIR ??
    join(homedir(), "Library", "Application Support", "Codex", "Multi Gmail")
  );
}

function ensureDataDir(): string {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

function configPath(): string {
  return join(ensureDataDir(), "oauth-client.json");
}

function accountsPath(): string {
  return join(ensureDataDir(), "accounts.json");
}

export function saveOAuthConfig(config: OAuthConfig): void {
  atomicWriteJson(configPath(), config);
}

export function loadOAuthConfig(): OAuthConfig {
  const path = configPath();
  if (!existsSync(path)) {
    throw new Error(
      `OAuth client is not configured. Run: npm run auth -- configure /path/to/client_secret.json`,
    );
  }
  return readJson<OAuthConfig>(path, { clientId: "", clientSecret: "" });
}

export function listAccounts(): AccountRecord[] {
  return readJson<AccountsFile>(accountsPath(), { accounts: [] }).accounts;
}

export function upsertAccount(account: AccountRecord): void {
  const accounts = listAccounts().filter(
    (existing) => existing.email.toLowerCase() !== account.email.toLowerCase(),
  );
  accounts.push(account);
  accounts.sort((left, right) => left.email.localeCompare(right.email));
  atomicWriteJson(accountsPath(), { accounts } satisfies AccountsFile);
}

export function removeAccountRecord(email: string): boolean {
  const current = listAccounts();
  const accounts = current.filter(
    (account) => account.email.toLowerCase() !== email.toLowerCase(),
  );
  if (accounts.length === current.length) return false;
  atomicWriteJson(accountsPath(), { accounts } satisfies AccountsFile);
  return true;
}

export function resolveAccount(selector: string): AccountRecord {
  const normalized = selector.trim().toLowerCase();
  const matches = listAccounts().filter(
    (account) =>
      account.email.toLowerCase() === normalized ||
      account.alias?.toLowerCase() === normalized,
  );
  if (matches.length === 1) return matches[0]!;
  const available = listAccounts()
    .map((account) =>
      account.alias ? `${account.alias} (${account.email})` : account.email,
    )
    .join(", ");
  throw new Error(
    `Gmail account "${selector}" is not connected. Available accounts: ${available || "none"}.`,
  );
}

export function resolveAccounts(selector: string): AccountRecord[] {
  if (selector.trim().toLowerCase() === "all") {
    const accounts = listAccounts();
    if (accounts.length === 0) {
      throw new Error("No Gmail accounts are connected. Run the Multi Gmail auth setup first.");
    }
    return accounts;
  }
  return [resolveAccount(selector)];
}

function requireMacOSKeychain(): void {
  if (process.platform !== "darwin") {
    throw new Error(
      "Multi Gmail currently stores OAuth refresh tokens in macOS Keychain and requires macOS.",
    );
  }
}

export async function saveRefreshToken(email: string, token: string): Promise<void> {
  requireMacOSKeychain();
  await execFileAsync("/usr/bin/security", [
    "add-generic-password",
    "-U",
    "-a",
    email.toLowerCase(),
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    token,
  ]);
}

export async function getRefreshToken(email: string): Promise<string> {
  requireMacOSKeychain();
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password",
      "-a",
      email.toLowerCase(),
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ]);
    const token = stdout.trim();
    if (!token) throw new Error("empty token");
    return token;
  } catch {
    throw new Error(
      `No OAuth refresh token found for ${email}. Re-authorize it with the Multi Gmail auth command.`,
    );
  }
}

export async function deleteRefreshToken(email: string): Promise<void> {
  requireMacOSKeychain();
  try {
    await execFileAsync("/usr/bin/security", [
      "delete-generic-password",
      "-a",
      email.toLowerCase(),
      "-s",
      KEYCHAIN_SERVICE,
    ]);
  } catch {
    // Removing an already-missing credential is idempotent.
  }
}

export function resetTestData(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetTestData is only available during tests.");
  }
  rmSync(dataDir(), { recursive: true, force: true });
}
