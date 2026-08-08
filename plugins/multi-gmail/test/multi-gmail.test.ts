import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { parseMessage } from "../src/gmail-api.js";
import {
  listAccounts,
  resetTestData,
  resolveAccount,
  resolveAccounts,
  upsertAccount,
} from "../src/storage.js";
import { base64UrlEncode, buildRawEmail, mapLimit } from "../src/utils.js";

process.env.NODE_ENV = "test";
process.env.MULTI_GMAIL_DATA_DIR = mkdtempSync(join(tmpdir(), "multi-gmail-test-"));

after(() => resetTestData());

test("resolves account by email, alias, and all", () => {
  upsertAccount({ email: "one@example.com", alias: "personal", addedAt: "2026-01-01T00:00:00Z" });
  upsertAccount({ email: "two@example.com", alias: "work", addedAt: "2026-01-02T00:00:00Z" });

  assert.equal(resolveAccount("PERSONAL").email, "one@example.com");
  assert.equal(resolveAccount("two@example.com").alias, "work");
  assert.equal(resolveAccounts("all").length, 2);
  assert.equal(listAccounts().length, 2);
});

test("parses nested MIME bodies and attachment metadata", () => {
  const parsed = parseMessage({
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "hello",
    internalDate: "1767225600000",
    sizeEstimate: 123,
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "Subject", value: "测试" },
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "one@example.com" },
      ],
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: base64UrlEncode("Plain body") } },
            { mimeType: "text/html", body: { data: base64UrlEncode("<p>HTML body</p>") } },
          ],
        },
        {
          mimeType: "application/pdf",
          filename: "issue.pdf",
          body: { attachmentId: "a1", size: 42 },
        },
      ],
    },
  });

  assert.equal(parsed.subject, "测试");
  assert.equal(parsed.body_text, "Plain body");
  assert.equal(parsed.body_html, "<p>HTML body</p>");
  assert.deepEqual(parsed.attachments, [
    { attachment_id: "a1", filename: "issue.pdf", mime_type: "application/pdf", size: 42 },
  ]);
});

test("builds UTF-8 multipart email and rejects header injection", () => {
  const raw = buildRawEmail({
    from: "one@example.com",
    to: ["two@example.com"],
    subject: "你好",
    bodyText: "正文",
    bodyHtml: "<p>正文</p>",
  });
  assert.match(raw, /Content-Type: multipart\/alternative/);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.throws(
    () =>
      buildRawEmail({
        from: "one@example.com",
        to: ["safe@example.com\r\nBcc: attacker@example.com"],
        subject: "x",
        bodyText: "x",
      }),
    /line breaks/,
  );
});

test("mapLimit preserves input order", async () => {
  const output = await mapLimit([3, 1, 2], 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value));
    return value * 2;
  });
  assert.deepEqual(output, [6, 2, 4]);
});
