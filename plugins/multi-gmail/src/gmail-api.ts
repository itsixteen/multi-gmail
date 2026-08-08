import type {
  AccountRecord,
  GmailMessageDetail,
  GmailMessageResource,
  GmailMessageSummary,
  OAuthConfig,
  OutgoingMessage,
} from "./types.js";
import {
  asErrorMessage,
  base64UrlEncode,
  buildRawEmail,
  collectAttachments,
  extractMimeBodies,
  headerValue,
  mapLimit,
} from "./utils.js";
import { getRefreshToken, loadOAuthConfig } from "./storage.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const RESERVED_LABELS = new Set([
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
  "CATEGORY_UPDATES",
]);

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

interface GmailListResponse {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailThreadResponse {
  id?: string;
  historyId?: string;
  messages?: GmailMessageResource[];
}

interface GmailLabel {
  id?: string;
  name?: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string } | string;
  } & T;
  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`Gmail API request failed: ${message}`);
  }
  return body;
}

async function refreshAccessToken(
  account: AccountRecord,
  config: OAuthConfig,
): Promise<TokenCacheEntry> {
  const refreshToken = await getRefreshToken(account.email);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await parseJsonResponse<{
    access_token?: string;
    expires_in?: number;
  }>(response);
  if (!body.access_token) {
    throw new Error(`Google did not return an access token for ${account.email}.`);
  }
  const entry = {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  tokenCache.set(account.email.toLowerCase(), entry);
  return entry;
}

async function accessToken(account: AccountRecord): Promise<string> {
  const key = account.email.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.accessToken;
  return (await refreshAccessToken(account, loadOAuthConfig())).accessToken;
}

async function gmailRequest<T>(
  account: AccountRecord,
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(`${GMAIL_BASE}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken(account)}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(60_000),
  });
  return parseJsonResponse<T>(response);
}

export function parseMessage(message: GmailMessageResource): GmailMessageDetail {
  const payload = message.payload;
  const headers = payload?.headers;
  const bodies = extractMimeBodies(payload);
  const internalDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null;
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
    size_estimate: message.sizeEstimate ?? 0,
  };
}

function summaryFromMessage(message: GmailMessageResource): GmailMessageSummary {
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
    label_ids: parsed.label_ids,
  };
}

export class GmailApi {
  constructor(readonly account: AccountRecord) {}

  async profile(): Promise<{ email: string; messages_total: number; threads_total: number }> {
    const profile = await gmailRequest<{
      emailAddress?: string;
      messagesTotal?: number;
      threadsTotal?: number;
    }>(this.account, "/profile");
    return {
      email: profile.emailAddress ?? this.account.email,
      messages_total: profile.messagesTotal ?? 0,
      threads_total: profile.threadsTotal ?? 0,
    };
  }

  async searchEmails(input: {
    query?: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<{
    emails: GmailMessageSummary[];
    next_page_token: string | null;
    result_size_estimate: number;
  }> {
    const listed = await gmailRequest<GmailListResponse>(this.account, "/messages", {
      query: {
        q: input.query,
        maxResults: input.maxResults,
        pageToken: input.pageToken,
      },
    });
    const messages = listed.messages ?? [];
    const emails = await mapLimit(messages, 10, async (item) => {
      if (!item.id) throw new Error("Gmail returned a message without an id.");
      const message = await gmailRequest<GmailMessageResource>(
        this.account,
        `/messages/${encodeURIComponent(item.id)}`,
        {
          query: {
            format: "metadata",
            metadataHeaders: undefined,
          },
        },
      );
      return summaryFromMessage(message);
    });
    return {
      emails,
      next_page_token: listed.nextPageToken ?? null,
      result_size_estimate: listed.resultSizeEstimate ?? emails.length,
    };
  }

  async readEmail(messageId: string): Promise<GmailMessageDetail> {
    const message = await gmailRequest<GmailMessageResource>(
      this.account,
      `/messages/${encodeURIComponent(messageId)}`,
      { query: { format: "full" } },
    );
    return parseMessage(message);
  }

  async readThread(threadId: string): Promise<{
    thread_id: string;
    history_id: string | null;
    messages: GmailMessageDetail[];
  }> {
    const thread = await gmailRequest<GmailThreadResponse>(
      this.account,
      `/threads/${encodeURIComponent(threadId)}`,
      { query: { format: "full" } },
    );
    const messages = (thread.messages ?? [])
      .map(parseMessage)
      .sort((left, right) =>
        (left.internal_date ?? "").localeCompare(right.internal_date ?? ""),
      );
    return {
      thread_id: thread.id ?? threadId,
      history_id: thread.historyId ?? null,
      messages,
    };
  }

  async listLabels(): Promise<Array<{
    id: string;
    name: string;
    type: string;
    messages_total: number;
    messages_unread: number;
    threads_total: number;
    threads_unread: number;
  }>> {
    const response = await gmailRequest<{ labels?: GmailLabel[] }>(
      this.account,
      "/labels",
    );
    return (response.labels ?? [])
      .filter((label) => label.id && label.name)
      .map((label) => ({
        id: label.id!,
        name: label.name!,
        type: label.type ?? "unknown",
        messages_total: label.messagesTotal ?? 0,
        messages_unread: label.messagesUnread ?? 0,
        threads_total: label.threadsTotal ?? 0,
        threads_unread: label.threadsUnread ?? 0,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private async resolveLabelIds(
    names: string[],
    createMissing: boolean,
  ): Promise<string[]> {
    const labels = await this.listLabels();
    const byName = new Map(labels.map((label) => [label.name.toLowerCase(), label.id]));
    const ids: string[] = [];
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
      const created = await gmailRequest<GmailLabel>(this.account, "/labels", {
        method: "POST",
        body: {
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      if (!created.id) throw new Error(`Gmail did not return an id for label "${name}".`);
      byName.set(name.toLowerCase(), created.id);
      ids.push(created.id);
    }
    return [...new Set(ids)];
  }

  async modifyEmails(input: {
    messageIds: string[];
    addLabels: string[];
    removeLabels: string[];
    createMissingLabels: boolean;
  }): Promise<void> {
    const addLabelIds = await this.resolveLabelIds(
      input.addLabels,
      input.createMissingLabels,
    );
    const removeLabelIds = await this.resolveLabelIds(input.removeLabels, false);
    await gmailRequest<Record<string, never>>(this.account, "/messages/batchModify", {
      method: "POST",
      body: {
        ids: input.messageIds,
        addLabelIds,
        removeLabelIds,
      },
    });
  }

  async trashEmails(messageIds: string[]): Promise<void> {
    await mapLimit(messageIds, 10, (id) =>
      gmailRequest(this.account, `/messages/${encodeURIComponent(id)}/trash`, {
        method: "POST",
      }),
    );
  }

  async untrashEmails(messageIds: string[]): Promise<void> {
    await mapLimit(messageIds, 10, (id) =>
      gmailRequest(this.account, `/messages/${encodeURIComponent(id)}/untrash`, {
        method: "POST",
      }),
    );
  }

  private async rawOutgoing(message: OutgoingMessage): Promise<string> {
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
        references: message.references,
      }),
    );
  }

  async createDraft(
    message: OutgoingMessage,
    threadId?: string,
  ): Promise<{ draft_id: string; message_id: string; thread_id: string }> {
    const response = await gmailRequest<{
      id?: string;
      message?: { id?: string; threadId?: string };
    }>(this.account, "/drafts", {
      method: "POST",
      body: {
        message: {
          raw: await this.rawOutgoing(message),
          ...(threadId ? { threadId } : {}),
        },
      },
    });
    return {
      draft_id: response.id ?? "",
      message_id: response.message?.id ?? "",
      thread_id: response.message?.threadId ?? threadId ?? "",
    };
  }

  async sendEmail(
    message: OutgoingMessage,
    threadId?: string,
  ): Promise<{ message_id: string; thread_id: string; label_ids: string[] }> {
    const response = await gmailRequest<{
      id?: string;
      threadId?: string;
      labelIds?: string[];
    }>(this.account, "/messages/send", {
      method: "POST",
      body: {
        raw: await this.rawOutgoing(message),
        ...(threadId ? { threadId } : {}),
      },
    });
    return {
      message_id: response.id ?? "",
      thread_id: response.threadId ?? threadId ?? "",
      label_ids: response.labelIds ?? [],
    };
  }
}

export function gmailError(error: unknown): string {
  return asErrorMessage(error);
}
