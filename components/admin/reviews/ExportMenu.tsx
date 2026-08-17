"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatRegistrationNo } from "@/lib/registrationNo";
import type { ReviewRow } from "@/components/admin/reviews/ReviewTable";

// 名字打碼：只留第一個字，其餘用 ○ 遮蔽（錄取名單對外流通風險較高，不應包含完整姓名）。
function maskName(name: string): string {
  if (name.length <= 1) return name;
  return name[0] + "○".repeat(name.length - 1);
}

// 電話末三碼：其餘用 * 遮蔽。
function maskPhoneKeepLast3(phone: string): string {
  if (phone.length <= 3) return phone;
  return "*".repeat(phone.length - 3) + phone.slice(-3);
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(","));
  // Leading BOM so Excel on Windows renders UTF-8 Chinese text correctly.
  return "﻿" + lines.join("\r\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportMenu({
  rows,
  registrationCategoryMap,
}: {
  rows: ReviewRow[];
  registrationCategoryMap: Map<string, string>;
}) {
  function categoryLabel(r: ReviewRow) {
    return r.registration_category_id ? (registrationCategoryMap.get(r.registration_category_id) ?? "-") : "-";
  }

  function exportFull() {
    const headers = [
      "編號", "報名時間", "聯絡Email", "聯絡電話", "報名類別", "成員", "人數",
      "審核結果", "錄取結果", "分組區域", "分組編號",
      "繳費狀態", "應繳金額", "是否取消", "取消原因", "備註",
    ];
    const data = rows.map((r) => [
      formatRegistrationNo(r.registration_seq),
      new Date(r.submitted_at).toLocaleString("zh-TW"),
      r.contact_email,
      r.contact_phone,
      categoryLabel(r),
      r.memberNames.join("、"),
      r.memberNames.length,
      r.review_status,
      r.admission_status,
      r.group_zone ?? "",
      r.group_number ?? "",
      r.payment_status,
      r.payment_amount,
      r.is_cancelled ? "是" : "否",
      r.cancel_reason ?? "",
      r.admin_note ?? "",
    ]);
    downloadCsv("完整報名資料.csv", toCsv(headers, data));
  }

  function exportReceipt() {
    const headers = ["編號", "主要聯絡人姓名", "付款金額", "電話"];
    const data = rows.map((r) => [
      formatRegistrationNo(r.registration_seq),
      r.memberNames[0] ?? "",
      r.payment_amount,
      r.contact_phone,
    ]);
    downloadCsv("收據開立用資料.csv", toCsv(headers, data));
  }

  function exportCheckin() {
    const headers = ["編號", "報名類別", "名字", "人數", "區域編號", "睡袋(墊)自備/租借", "是否繳費", "電話"];
    const data = rows.map((r) => [
      formatRegistrationNo(r.registration_seq),
      categoryLabel(r),
      r.memberNames.join("、"),
      r.memberNames.length,
      `${r.group_zone ?? ""} ${r.group_number ?? ""}`.trim(),
      `${r.sleeping_bag_own_qty} / ${r.sleeping_bag_rent_qty}`,
      r.payment_status === "已完成" || r.payment_status === "無需繳費" ? "是" : "否",
      r.contact_phone,
    ]);
    downloadCsv("報到使用資料.csv", toCsv(headers, data));
  }

  function exportAdmitted() {
    const headers = ["編號", "報名類別", "名字（打碼）", "電話末三碼"];
    const data = rows
      .filter((r) => !r.is_cancelled && r.admission_status === "正取")
      .map((r) => [
        formatRegistrationNo(r.registration_seq),
        categoryLabel(r),
        r.memberNames.map(maskName).join("、"),
        maskPhoneKeepLast3(r.contact_phone),
      ]);
    downloadCsv("錄取名單.csv", toCsv(headers, data));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        檔案下載
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={exportFull}>完整報名資料</DropdownMenuItem>
        <DropdownMenuItem onClick={exportReceipt}>收據開立用資料</DropdownMenuItem>
        <DropdownMenuItem onClick={exportCheckin}>報到使用資料</DropdownMenuItem>
        <DropdownMenuItem onClick={exportAdmitted}>錄取名單</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
