import type { Metadata } from "next";
import { LookupForm } from "@/components/public-form/LookupForm";

// Overrides the root layout's generic "報名系統 / 客製化活動報名系統" — that's what a
// link preview (LINE, etc.) would otherwise show for this page, which doesn't tell
// anyone what the link actually is. Static since this page isn't tied to one session.
export const metadata: Metadata = {
  title: "夜宿報名結果查詢",
  description: "查詢您的夜宿活動報名審核結果與繳費資訊",
};

export default function LookupPage() {
  return <LookupForm />;
}
