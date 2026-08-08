import type { GmailHeader, GmailMessagePart } from "./types.js";

export function asErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-access-token]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[redacted-refresh-token]");
}

export function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export function headerValue(
  headers: GmailHeader[] | null | undefined,
  name: string,
): string {
  return (
    headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

function collectMimeBodies(
  part: GmailMessagePart | null | undefined,
  texts: string[],
  html: string[],
): void {
  if (!part) return;
  const mimeType = part.mimeType?.toLowerCase();
  const data = part.body?.data;
  if (data && mimeType === "text/plain") texts.push(base64UrlDecode(data));
  if (data && mimeType === "text/html") html.push(base64UrlDecode(data));
  for (const child of part.parts ?? []) collectMimeBodies(child, texts, html);
}

export function extractMimeBodies(
  part: GmailMessagePart | null | undefined,
): { text: string; html: string } {
  const texts: string[] = [];
  const html: string[] = [];
  collectMimeBodies(part, texts, html);
  return { text: texts.join("\n\n"), html: html.join("\n\n") };
}

export function collectAttachments(
  part: GmailMessagePart | null | undefined,
): Array<{
  attachment_id: string;
  filename: string;
  mime_type: string;
  size: number;
}> {
  if (!part) return [];
  const current =
    part.filename && part.body?.attachmentId
      ? [
          {
            attachment_id: part.body.attachmentId,
            filename: part.filename,
            mime_type: part.mimeType ?? "application/octet-stream",
            size: part.body.size ?? 0,
          },
        ]
      : [];
  return [
    ...current,
    ...(part.parts ?? []).flatMap((child) => collectAttachments(child)),
  ];
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        const item = items[index];
        if (item === undefined) return;
        results[index] = await operation(item, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function assertSafeHeader(value: string, field: string): void {
  if (/\r|\n/.test(value)) {
    throw new Error(`${field} must not contain line breaks.`);
  }
}

function encodeHeader(value: string): string {
  assertSafeHeader(value, "Header");
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)!
    .join("\r\n");
}

export function buildRawEmail(input: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const recipients = [
    ["From", input.from],
    ["To", input.to.join(", ")],
    ...(input.cc?.length ? [["Cc", input.cc.join(", ")]] : []),
    ...(input.bcc?.length ? [["Bcc", input.bcc.join(", ")]] : []),
  ] as Array<[string, string]>;
  for (const [field, value] of recipients) assertSafeHeader(value, field);
  assertSafeHeader(input.inReplyTo ?? "", "In-Reply-To");
  assertSafeHeader(input.references ?? "", "References");

  const headers = [
    ...recipients.map(([field, value]) => `${field}: ${value}`),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
  ];

  if (!input.bodyHtml) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(input.bodyText),
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
    "",
  ].join("\r\n");
}
