import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSessionAccess } from "@/lib/auth/guards";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRegistrationNo } from "@/lib/registrationNo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PaymentListPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  await requireSessionAccess(sessionId);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("event_sessions")
    .select("name")
    .eq("id", sessionId)
    .maybeSingle();

  const { data: registrations } = await supabase
    .from("registrations")
    .select(
      "id, registration_seq, contact_email, contact_phone, payment_status, payment_amount, payment_method, manual_transfer_last5, ecpay_trade_no, is_cancelled"
    )
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: true });

  const registrationIds = (registrations ?? []).map((r) => r.id);
  const { data: members } = registrationIds.length
    ? await supabase
        .from("registration_members")
        .select("registration_id, member_order, name")
        .in("registration_id", registrationIds)
        .order("member_order", { ascending: true })
    : { data: [] };

  const membersByRegistration = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = membersByRegistration.get(m.registration_id) ?? [];
    list.push(m.name);
    membersByRegistration.set(m.registration_id, list);
  }

  const paymentMethodLabel = (method: string | null) =>
    method === "online" ? "線上刷卡/ATM" : method === "manual" ? "人工轉帳" : "-";

  const paymentStatusClass = (status: string, cancelled: boolean) =>
    cancelled
      ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
      : status === "已完成"
        ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200"
        : status === "待繳費"
          ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
          : "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <h1 className="text-lg font-semibold">{session?.name} — 繳費核對</h1>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>編號</TableHead>
                <TableHead>聯絡人</TableHead>
                <TableHead>成員</TableHead>
                <TableHead>繳費狀態</TableHead>
                <TableHead>金額</TableHead>
                <TableHead>方式</TableHead>
                <TableHead>轉帳後五碼</TableHead>
                <TableHead>綠界交易編號</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(registrations ?? []).map((r) => (
                <TableRow key={r.id} className={r.is_cancelled ? "opacity-50" : undefined}>
                  <TableCell className="font-mono text-sm whitespace-nowrap">
                    {formatRegistrationNo(r.registration_seq)}
                  </TableCell>
                  <TableCell>
                    <div>{r.contact_email}</div>
                    <div className="text-muted-foreground text-sm">{r.contact_phone}</div>
                  </TableCell>
                  <TableCell>
                    {(membersByRegistration.get(r.id) ?? []).join("、")}
                    {r.is_cancelled && <Badge variant="destructive" className="ml-1">已取消</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={paymentStatusClass(r.payment_status, r.is_cancelled)}
                    >
                      {r.is_cancelled ? "取消" : r.payment_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.payment_amount}</TableCell>
                  <TableCell>{paymentMethodLabel(r.payment_method)}</TableCell>
                  <TableCell>{r.manual_transfer_last5 ?? "-"}</TableCell>
                  <TableCell>{r.ecpay_trade_no ?? "-"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/registrations/${sessionId}/${r.id}?view=payment`}
                      className="text-primary underline"
                    >
                      查看/核對
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(registrations ?? []).length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">尚無報名資料</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
