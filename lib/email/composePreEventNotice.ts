import "server-only";
import { wrapEmailLayout, EVENT_EYEBROW } from "@/lib/email/emailLayout";
import {
  buildPreEventNoticeBody,
  preEventNoticeSubject,
  type PreEventNoticeInput,
} from "@/lib/email/templates/preEventNotice";

export function composePreEventNotice(input: PreEventNoticeInput, accentColor?: string | null) {
  return {
    subject: preEventNoticeSubject(input),
    html: wrapEmailLayout({
      eyebrow: EVENT_EYEBROW,
      heading: "行前通知／報到通知書",
      subheading: `${input.sessionName}・${input.selfPitch ? "自搭帳" : "主辦搭設帳"}`,
      accentColor,
      bodyHtml: buildPreEventNoticeBody(input),
      ctaLabel: "回覆確認",
      ctaUrl: input.replyUrl,
      footerLine: "本信件同時為報到通知書，活動當天可出示本信件報到。如有任何問題，請直接回覆本信聯繫主辦單位。",
    }),
  };
}
