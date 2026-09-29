import { createClient } from "@/lib/supabase/server";
import { NoticeReplyForm } from "@/components/public-form/NoticeReplyForm";
import { sampleNoticeReply, type NoticeReplyData } from "@/lib/noticeReply";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Landing page for the 行前通知 email's "回覆確認" button — one link per registration
// (registrations.notice_token). Public, no login.
export default async function NoticeReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const sample = sampleNoticeReply(token);
  let data: NoticeReplyData | null = sample;
  if (!sample && UUID_RE.test(token)) {
    const supabase = await createClient();
    const { data: result } = await supabase.rpc("fn_get_notice_reply", { p_token: token });
    data = result as unknown as NoticeReplyData | null;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">連結無效</h1>
        <p className="text-muted-foreground mt-2 text-sm">請確認連結是否正確，或洽詢主辦單位。</p>
      </div>
    );
  }

  if (!data.eligible) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">此筆報名目前無法回覆</h1>
        <p className="text-muted-foreground mt-2 text-sm">如有疑問請洽詢主辦單位。</p>
      </div>
    );
  }

  return <NoticeReplyForm token={token} data={data} isSample={Boolean(sample)} />;
}
