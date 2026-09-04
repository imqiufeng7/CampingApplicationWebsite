"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReviewResultVars, MANUAL_TRANSFER_ACCOUNT_INFO } from "@/lib/email/templates/reviewResult";
import { formatDeadlineRocWithWeekday } from "@/lib/timezone";
import type { AdmissionStatus, PaymentMethod, ReviewStatus } from "@/lib/db/types";

interface LookupMember {
  name: string;
  fee_review_result: string;
  fee_category_label: string | null;
}

interface LookupResult {
  registration_id: string;
  registration_no: string;
  session_name: string;
  session_date_start: string | null;
  session_date_end: string | null;
  result_announce_at: string | null;
  fee_discount_per_person: number;
  review_status: ReviewStatus;
  admission_status: AdmissionStatus;
  waitlist_rank: number | null;
  payment_amount: number;
  payment_method: PaymentMethod | null;
  payment_deadline: string | null;
  members: LookupMember[];
}

// review_status/admission_status combinations mirror send-results' own eligibility
// filter (only 審核通過 + 正取/備取 ever gets a result email) but this page has to cover
// every other state too, since someone can look up at any point in the process, not
// just after that email went out.
function ResultDetails({ result }: { result: LookupResult }) {
  if (result.review_status === "審核中") {
    return <p className="text-sm">您的報名正在審核中，尚未公布結果，請耐心等候。</p>;
  }

  if (result.review_status === "退回補件") {
    return (
      <p className="text-sm">
        您的報名需要補充或修正資料，請透過報名確認信中的專屬修改連結完成補件，或洽詢主辦單位。
      </p>
    );
  }

  if (result.admission_status === "待確認") {
    return (
      <p className="text-sm">
        審核已通過，正備取結果尚未公布
        {result.result_announce_at
          ? `，預計於 ${formatDeadlineRocWithWeekday(result.result_announce_at)} 公布`
          : ""}
        ，請於公告後再次查詢。
      </p>
    );
  }

  const ecpayLink =
    result.admission_status === "正取" &&
    result.payment_amount > 0 &&
    result.payment_method === "online"
      ? `${window.location.origin}/api/payments/ecpay/checkout/${result.registration_id}`
      : null;

  const vars = buildReviewResultVars({
    sessionName: result.session_name,
    sessionDateStart: result.session_date_start,
    sessionDateEnd: result.session_date_end,
    admissionStatus: result.admission_status,
    members: result.members.map((m) => ({
      name: m.name,
      feeReviewResult: m.fee_review_result,
      feeCategoryLabel: m.fee_category_label,
    })),
    feeDiscountPerPerson: result.fee_discount_per_person,
    paymentAmount: result.payment_amount,
    paymentMethod: result.payment_method,
    paymentDeadline: result.payment_deadline,
    ecpayLink,
    manualTransferAccountInfo: MANUAL_TRANSFER_ACCOUNT_INFO,
  });

  // buildReviewResultVars' fallback line for anything other than 正取/備取 is a generic
  // "審核結果請見以下說明" — fine for 成員審核結果/繳費資訊 below (those already read
  // correctly for 取消), but this page can say the actual outcome plainly.
  const admissionLine = result.admission_status === "取消" ? "很抱歉，本次報名未獲錄取。" : vars.錄取結果;

  // vars.繳費資訊 embeds the checkout URL as plain text (fine for email, where mail
  // clients auto-linkify bare URLs) — this page renders it inside a plain <div>, which
  // browsers do not auto-linkify, so give online payments an actual clickable link too.
  return (
    <div className="grid gap-3 text-sm">
      <p className="font-medium">{admissionLine}</p>
      <div className="whitespace-pre-line">{vars.成員審核結果}</div>
      <div className="whitespace-pre-line">{vars.繳費資訊}</div>
      {ecpayLink && (
        <a href={ecpayLink} className="w-fit">
          <Button type="button" size="sm">
            前往線上繳費
          </Button>
        </a>
      )}
    </div>
  );
}

function LookupForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [phone, setPhone] = useState(searchParams.get("phone") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LookupResult[] | null>(null);
  const [searched, setSearched] = useState(false);
  const autoRanRef = useRef(false);

  async function runLookup(lookupEmail: string, lookupPhone: string) {
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("fn_lookup_registration_results", {
      p_email: lookupEmail.trim(),
      p_phone: lookupPhone.trim(),
    });

    setSubmitting(false);
    setSearched(true);

    if (rpcError) {
      setError(
        rpcError.message.includes("too many") ? "查詢過於頻繁，請稍後再試。" : "查詢失敗，請稍後再試。"
      );
      setResults(null);
      return;
    }

    setResults((data as unknown as LookupResult[]) ?? []);
  }

  // Lets a saved/shared lookup link (e.g. from the confirmation email, or the "複製
  // 查詢連結" button on the success screen) go straight to the result in one click
  // instead of making the registrant retype their own email and phone number.
  useEffect(() => {
    if (autoRanRef.current) return;
    const qEmail = searchParams.get("email");
    const qPhone = searchParams.get("phone");
    if (!qEmail || !qPhone) return;
    autoRanRef.current = true;
    // Deferred to a microtask so this effect doesn't itself synchronously trigger the
    // setSubmitting/setError state updates inside runLookup.
    queueMicrotask(() => {
      runLookup(qEmail, qPhone);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runLookup(email, phone);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>查詢報名結果</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="lookup-email">報名時填寫的 Email</Label>
              <Input
                id="lookup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lookup-phone">報名時填寫的聯絡電話</Label>
              <Input
                id="lookup-phone"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "查詢中..." : "查詢"}
            </Button>
          </form>

          {error && <p className="text-destructive text-sm">{error}</p>}

          {searched && !error && results?.length === 0 && (
            <p className="text-muted-foreground text-sm">
              查無報名資料，請確認 Email 與聯絡電話是否正確，或洽詢主辦單位。
            </p>
          )}

          {results && results.length > 0 && (
            <div className="grid gap-4">
              {results.length > 1 && (
                <p className="text-muted-foreground text-xs">
                  這組 Email/電話共有 {results.length} 筆報名紀錄：
                </p>
              )}
              {results.map((result) => (
                <div key={result.registration_id} className="grid gap-2 border-t pt-4">
                  <p className="text-muted-foreground text-sm">
                    {result.session_name}・{result.registration_no}
                  </p>
                  <ResultDetails result={result} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LookupPage() {
  return (
    <Suspense>
      <LookupForm />
    </Suspense>
  );
}
