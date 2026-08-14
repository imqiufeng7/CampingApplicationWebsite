import nodemailer from "nodemailer";
import type { EmailAdapter, EmailMessage, SendEmailResult } from "@/lib/email/types";

// Sends through Gmail's own SMTP relay under the organizer's existing Gmail address —
// used instead of ResendEmailAdapter when there's no custom domain to verify with
// Resend. `appPassword` must be a Google "App Password" (requires 2-Step
// Verification), not the account's normal login password.
export class GmailEmailAdapter implements EmailAdapter {
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(
    private readonly gmailUser: string,
    appPassword: string
  ) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: appPassword },
    });
  }

  async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    try {
      await this.transporter.sendMail({
        from: this.gmailUser,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      return { status: "sent" };
    } catch (error) {
      return { status: "failed", errorMessage: error instanceof Error ? error.message : String(error) };
    }
  }
}
