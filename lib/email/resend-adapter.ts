import type { EmailAdapter, EmailMessage, SendEmailResult } from "@/lib/email/types";

// Not wired in by default (see index.ts) — the user has no Resend API key yet.
// Same EmailAdapter interface as ConsoleEmailAdapter, so switching EMAIL_PROVIDER to
// "resend" once RESEND_API_KEY is set is the only change needed.
export class ResendEmailAdapter implements EmailAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string
  ) {}

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!res.ok) {
      const errorMessage = await res.text().catch(() => res.statusText);
      return { status: "failed", errorMessage };
    }

    return { status: "sent" };
  }
}
