import "server-only";
import type { EmailAdapter } from "@/lib/email/types";
import { ConsoleEmailAdapter } from "@/lib/email/console-adapter";
import { ResendEmailAdapter } from "@/lib/email/resend-adapter";

export function getEmailAdapter(): EmailAdapter {
  const provider = process.env.EMAIL_PROVIDER ?? "console";

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    if (!apiKey || !fromAddress) {
      throw new Error("EMAIL_PROVIDER=resend but RESEND_API_KEY/EMAIL_FROM_ADDRESS is missing");
    }
    return new ResendEmailAdapter(apiKey, fromAddress);
  }

  return new ConsoleEmailAdapter();
}

export type { EmailAdapter, EmailMessage, SendEmailResult } from "@/lib/email/types";
