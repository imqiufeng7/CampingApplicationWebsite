import type { EmailAdapter, EmailMessage, SendEmailResult } from "@/lib/email/types";

// Default adapter while no real email provider is configured. Logs to the server
// console and reports success immediately, so the rest of the send-results pipeline
// (email_logs bookkeeping, batch flow) can be built and exercised end-to-end before a
// Resend API key exists.
export class ConsoleEmailAdapter implements EmailAdapter {
  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    // message.body is HTML now (see EmailBodyEditor) — logged as-is, readable enough
    // for local debugging without a real provider configured.
    console.log(
      `[email:console] to=${message.to} subject=${message.subject}\n${message.body}`
    );
    return { status: "sent" };
  }
}
