export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  projectId?: string;
}

export interface AccountRecord {
  email: string;
  alias?: string;
  addedAt: string;
}

export interface AccountsFile {
  accounts: AccountRecord[];
}

export interface GmailHeader {
  name?: string | null;
  value?: string | null;
}

export interface GmailMessagePart {
  partId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  headers?: GmailHeader[] | null;
  body?: {
    attachmentId?: string | null;
    size?: number | null;
    data?: string | null;
  } | null;
  parts?: GmailMessagePart[] | null;
}

export interface GmailMessageResource {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: GmailMessagePart | null;
  sizeEstimate?: number | null;
}

export interface GmailMessageSummary {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  internal_date: string | null;
  snippet: string;
  label_ids: string[];
}

export interface GmailAttachmentSummary {
  attachment_id: string;
  filename: string;
  mime_type: string;
  size: number;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  cc: string;
  bcc: string;
  message_id_header: string;
  references: string;
  body_text: string;
  body_html: string;
  attachments: GmailAttachmentSummary[];
  size_estimate: number;
}

export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_text: string;
  body_html?: string;
  in_reply_to?: string;
  references?: string;
}
