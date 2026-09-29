// Shape returned by fn_get_notice_reply (supabase/migrations/*_pre_event_notice_reply.sql).
export interface NoticeReplyData {
  registration_no: string;
  session_name: string;
  location: string | null;
  date_start: string;
  date_end: string;
  theme_color: string | null;
  category_label: string | null;
  self_pitch: boolean;
  leader_name: string | null;
  member_count: number;
  group_zone: string | null;
  group_number: string | null;
  replied_at: string | null;
  plate_number: string | null;
  eligible: boolean;
}

// Fixed, data-free stand-ins for the reply page, used by test emails so clicking
// "回覆確認" in a test never writes to a real registration.
export const NOTICE_SAMPLE_TOKENS = {
  selfPitch: "sample-self",
  host: "sample-host",
} as const;

export function sampleNoticeReply(token: string): NoticeReplyData | null {
  if (token !== NOTICE_SAMPLE_TOKENS.selfPitch && token !== NOTICE_SAMPLE_TOKENS.host) return null;
  const selfPitch = token === NOTICE_SAMPLE_TOKENS.selfPitch;
  return {
    registration_no: "R000000",
    session_name: "範例場",
    location: "範例國民小學",
    date_start: "2026-10-17",
    date_end: "2026-10-18",
    theme_color: "#f3ebb4",
    category_label: selfPitch ? "自搭帳" : "主辦搭設帳",
    self_pitch: selfPitch,
    leader_name: "王小玉",
    member_count: 4,
    group_zone: selfPitch ? "A" : "B",
    group_number: "1",
    replied_at: null,
    plate_number: null,
    eligible: true,
  };
}

// Who the 行前通知 goes to, and so who is expected to reply — mirrors the eligibility
// check in fn_get_notice_reply / fn_submit_notice_reply.
export function isNoticeEligible(r: {
  is_cancelled: boolean;
  admission_status: string;
  payment_status: string;
}): boolean {
  return (
    !r.is_cancelled &&
    r.admission_status === "正取" &&
    (r.payment_status === "已完成" || r.payment_status === "無需繳費")
  );
}

export function noticeReplyUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/notice/${token}`;
}
