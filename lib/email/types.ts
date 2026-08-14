import type { EmailType } from "@/lib/db/types";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  status: "sent" | "failed";
  errorMessage?: string;
}

// Swap-in point: replace console-adapter.ts's export in index.ts's factory with
// resend-adapter.ts once RESEND_API_KEY is available. Every call site only depends on
// this interface, so that's a one-file change.
export interface EmailAdapter {
  sendEmail(message: EmailMessage): Promise<SendEmailResult>;
}

export interface QueuedEmail {
  registrationId: string;
  type: EmailType;
  message: EmailMessage;
}
