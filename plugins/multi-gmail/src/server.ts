#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GmailApi, gmailError } from "./gmail-api.js";
import {
  listAccounts,
  resolveAccount,
  resolveAccounts,
} from "./storage.js";
import type { OutgoingMessage } from "./types.js";
import { mapLimit } from "./utils.js";

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function accountName(email: string): string {
  const account = listAccounts().find(
    (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
  );
  return account?.alias ? `${account.alias} (${account.email})` : email;
}

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const server = new McpServer({
  name: "multi-gmail",
  version: "0.1.0",
});

server.registerTool(
  "list_accounts",
  {
    title: "List connected Gmail accounts",
    description:
      "List every Gmail account connected to this local plugin. Returns explicit per-account health instead of silently omitting failures.",
    inputSchema: {
      check_health: z
        .boolean()
        .default(true)
        .describe("Verify each account by reading its Gmail profile."),
    },
    annotations: readAnnotations,
  },
  async ({ check_health }) => {
    const accounts = listAccounts();
    const results = await mapLimit(accounts, 4, async (account) => {
      if (!check_health) return { ...account, healthy: null };
      try {
        const profile = await new GmailApi(account).profile();
        return { ...account, healthy: true, profile };
      } catch (error) {
        return { ...account, healthy: false, error: gmailError(error) };
      }
    });
    return jsonResult({
      connected_account_count: accounts.length,
      accounts: results,
      usage_hint: 'Use an email address or alias as "account", or use "all" on read tools.',
    });
  },
);

server.registerTool(
  "search_emails",
  {
    title: "Search Gmail accounts",
    description:
      "Search one Gmail account or all connected accounts using Gmail query syntax. Results are grouped by account and include partial-failure status and pagination tokens.",
    inputSchema: {
      account: z
        .string()
        .default("all")
        .describe('Email address, configured alias, or "all".'),
      query: z
        .string()
        .optional()
        .describe('Gmail query such as "in:inbox newer_than:7d is:unread".'),
      max_results_per_account: z.number().int().min(1).max(100).default(20),
      page_token: z
        .string()
        .optional()
        .describe("Pagination token for a single-account search only."),
    },
    annotations: readAnnotations,
  },
  async ({ account, query, max_results_per_account, page_token }) => {
    const accounts = resolveAccounts(account);
    if (accounts.length > 1 && page_token) {
      throw new Error("page_token can only be used when searching one specific account.");
    }
    const results = await mapLimit(accounts, 4, async (current) => {
      try {
        const result = await new GmailApi(current).searchEmails({
          query,
          maxResults: max_results_per_account,
          pageToken: page_token,
        });
        return {
          account: current.email,
          alias: current.alias ?? null,
          success: true,
          ...result,
        };
      } catch (error) {
        return {
          account: current.email,
          alias: current.alias ?? null,
          success: false,
          emails: [],
          next_page_token: null,
          result_size_estimate: 0,
          error: gmailError(error),
        };
      }
    });
    return jsonResult({
      query: query ?? "",
      requested_account: account,
      complete: results.every((result) => result.success),
      searched_account_count: accounts.length,
      total_returned: results.reduce((total, result) => total + result.emails.length, 0),
      results,
    });
  },
);

server.registerTool(
  "read_email",
  {
    title: "Read a Gmail message",
    description:
      "Read one full Gmail message, including plain text, HTML, headers needed for replies, labels, and attachment metadata.",
    inputSchema: {
      account: z.string().describe("Email address or configured alias."),
      message_id: z.string().min(1).describe("Gmail message id from search results."),
    },
    annotations: readAnnotations,
  },
  async ({ account, message_id }) => {
    const current = resolveAccount(account);
    const email = await new GmailApi(current).readEmail(message_id);
    return jsonResult({ account: current.email, alias: current.alias ?? null, email });
  },
);

server.registerTool(
  "batch_read_emails",
  {
    title: "Read several Gmail messages",
    description:
      "Read up to 50 messages across different connected Gmail accounts. Each reference must carry its own account so results cannot cross account boundaries accidentally.",
    inputSchema: {
      messages: z
        .array(
          z.object({
            account: z.string(),
            message_id: z.string().min(1),
          }),
        )
        .min(1)
        .max(50),
    },
    annotations: readAnnotations,
  },
  async ({ messages }) => {
    const results = await mapLimit(messages, 8, async (reference) => {
      try {
        const current = resolveAccount(reference.account);
        const email = await new GmailApi(current).readEmail(reference.message_id);
        return { account: current.email, success: true, email };
      } catch (error) {
        return {
          account: reference.account,
          message_id: reference.message_id,
          success: false,
          error: gmailError(error),
        };
      }
    });
    return jsonResult({
      complete: results.every((result) => result.success),
      results,
    });
  },
);

server.registerTool(
  "read_thread",
  {
    title: "Read a Gmail thread",
    description:
      "Read every message in one Gmail conversation in chronological order.",
    inputSchema: {
      account: z.string().describe("Email address or configured alias."),
      thread_id: z.string().min(1).describe("Gmail thread id from search or email results."),
    },
    annotations: readAnnotations,
  },
  async ({ account, thread_id }) => {
    const current = resolveAccount(account);
    const thread = await new GmailApi(current).readThread(thread_id);
    return jsonResult({ account: current.email, alias: current.alias ?? null, ...thread });
  },
);

server.registerTool(
  "list_labels",
  {
    title: "List Gmail labels",
    description:
      "List labels and unread/total counts for one Gmail account or all connected accounts.",
    inputSchema: {
      account: z.string().default("all").describe('Email, alias, or "all".'),
    },
    annotations: readAnnotations,
  },
  async ({ account }) => {
    const accounts = resolveAccounts(account);
    const results = await mapLimit(accounts, 4, async (current) => {
      try {
        return {
          account: current.email,
          alias: current.alias ?? null,
          success: true,
          labels: await new GmailApi(current).listLabels(),
        };
      } catch (error) {
        return {
          account: current.email,
          alias: current.alias ?? null,
          success: false,
          labels: [],
          error: gmailError(error),
        };
      }
    });
    return jsonResult({ complete: results.every((result) => result.success), results });
  },
);

server.registerTool(
  "modify_emails",
  {
    title: "Archive, label, or change read state",
    description:
      "Modify up to 1000 messages in one explicitly selected Gmail account. Can add/remove labels, archive, and mark read or unread. Never accepts account=all for writes.",
    inputSchema: {
      account: z.string().describe("One email address or configured alias; not all."),
      message_ids: z.array(z.string().min(1)).min(1).max(1000),
      add_labels: z.array(z.string()).default([]),
      remove_labels: z.array(z.string()).default([]),
      archive: z.boolean().default(false).describe("Remove the INBOX label."),
      read_state: z.enum(["unchanged", "read", "unread"]).default("unchanged"),
      create_missing_labels: z.boolean().default(true),
    },
    annotations: { ...writeAnnotations, idempotentHint: true },
  },
  async ({
    account,
    message_ids,
    add_labels,
    remove_labels,
    archive,
    read_state,
    create_missing_labels,
  }) => {
    const current = resolveAccount(account);
    const add = [...add_labels];
    const remove = [...remove_labels];
    if (archive) remove.push("INBOX");
    if (read_state === "read") remove.push("UNREAD");
    if (read_state === "unread") add.push("UNREAD");
    if (add.length === 0 && remove.length === 0) {
      throw new Error("No modifications were requested.");
    }
    await new GmailApi(current).modifyEmails({
      messageIds: message_ids,
      addLabels: add,
      removeLabels: remove,
      createMissingLabels: create_missing_labels,
    });
    return jsonResult({
      success: true,
      account: current.email,
      account_label: accountName(current.email),
      modified_count: message_ids.length,
      added_labels: [...new Set(add)],
      removed_labels: [...new Set(remove)],
    });
  },
);

server.registerTool(
  "trash_emails",
  {
    title: "Move Gmail messages to Trash",
    description:
      "Move up to 100 messages to Trash in one explicitly selected Gmail account. This is reversible with untrash_emails, but should be confirmed as a destructive action.",
    inputSchema: {
      account: z.string().describe("One email address or configured alias; not all."),
      message_ids: z.array(z.string().min(1)).min(1).max(100),
    },
    annotations: { ...writeAnnotations, destructiveHint: true },
  },
  async ({ account, message_ids }) => {
    const current = resolveAccount(account);
    await new GmailApi(current).trashEmails(message_ids);
    return jsonResult({ success: true, account: current.email, trashed_count: message_ids.length });
  },
);

server.registerTool(
  "untrash_emails",
  {
    title: "Restore Gmail messages from Trash",
    description: "Restore up to 100 messages from Trash in one Gmail account.",
    inputSchema: {
      account: z.string().describe("One email address or configured alias; not all."),
      message_ids: z.array(z.string().min(1)).min(1).max(100),
    },
    annotations: { ...writeAnnotations, idempotentHint: true },
  },
  async ({ account, message_ids }) => {
    const current = resolveAccount(account);
    await new GmailApi(current).untrashEmails(message_ids);
    return jsonResult({ success: true, account: current.email, restored_count: message_ids.length });
  },
);

const outgoingSchema = {
  account: z.string().describe("One email address or configured alias; not all."),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).default([]),
  bcc: z.array(z.string().email()).default([]),
  subject: z.string(),
  body_text: z.string(),
  body_html: z.string().optional(),
  thread_id: z.string().optional(),
  in_reply_to: z
    .string()
    .optional()
    .describe("RFC Message-ID header, including angle brackets when present."),
  references: z.string().optional(),
};

function outgoing(input: {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_text: string;
  body_html?: string;
  in_reply_to?: string;
  references?: string;
}): OutgoingMessage {
  return {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body_text: input.body_text,
    body_html: input.body_html,
    in_reply_to: input.in_reply_to,
    references: input.references,
  };
}

server.registerTool(
  "create_draft",
  {
    title: "Create a Gmail draft",
    description:
      "Create a draft in one explicitly selected Gmail account. Use thread_id plus reply headers when drafting a reply.",
    inputSchema: outgoingSchema,
    annotations: writeAnnotations,
  },
  async (input) => {
    const current = resolveAccount(input.account);
    const draft = await new GmailApi(current).createDraft(outgoing(input), input.thread_id);
    return jsonResult({ success: true, account: current.email, recipients: input.to, subject: input.subject, draft });
  },
);

server.registerTool(
  "send_email",
  {
    title: "Send Gmail email",
    description:
      "Send an email from one explicitly selected Gmail account. This is an external side effect and must only be used after the user clearly asks to send.",
    inputSchema: outgoingSchema,
    annotations: writeAnnotations,
  },
  async (input) => {
    const current = resolveAccount(input.account);
    const sent = await new GmailApi(current).sendEmail(outgoing(input), input.thread_id);
    return jsonResult({ success: true, account: current.email, recipients: input.to, subject: input.subject, sent });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
