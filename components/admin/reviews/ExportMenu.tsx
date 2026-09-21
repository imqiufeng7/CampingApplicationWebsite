"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatRegistrationNo } from "@/lib/registrationNo";
import { TAIPEI_TIME_ZONE } from "@/lib/timezone";
import { buildRosterRows, buildRosterTitle, ROSTER_HEADERS } from "@/lib/admittedRoster";
import type { ReviewRow } from "@/components/admin/reviews/ReviewTable";

// Excel auto-detects "number-ish" CSV cells and reformats them — a phone number
// starting with 09 loses its leading zero and renders as scientific notation
// (9.01E+08), and a slash-separated pair like "1/1" gets read as a date. Wrapping the
// cell in ="..." forces Excel to evaluate it as a formula that always displays the
// literal text, which is the standard workaround (plain apostrophe-prefix tricks only
// work when typed by hand, not when the value arrives via CSV import).
class ExcelText {
  constructor(public value: string) {}
}
function excelText(v: string | number): ExcelText {
  return new ExcelText(String(v ?? ""));
}

function toCsv(headers: string[], rows: (string | number | ExcelText)[][]): string {
  const escape = (v: string | number | ExcelText) => {
    if (v instanceof ExcelText) {
      return `"=""${v.value.replace(/"/g, '""')}"""`;
    }
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

// Styled to match the roster layout the organizers circulate: merged title row, then a
// red-on-grey header row, centered bordered cells. exceljs is large, so it's only
// pulled in when this download is actually clicked.
async function downloadRosterXlsx(filename: string, title: string, headers: string[], data: (string | number)[][]) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("錄取名單");
  const colCount = headers.length;
  const border = {
    top: { style: "thin" as const, color: { argb: "FFBFBFBF" } },
    left: { style: "thin" as const, color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin" as const, color: { argb: "FFBFBFBF" } },
    right: { style: "thin" as const, color: { argb: "FFBFBFBF" } },
  };
  const center = { horizontal: "center" as const, vertical: "middle" as const };

  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "微軟正黑體", size: 14, bold: true };
  titleCell.alignment = center;
  sheet.getRow(1).height = 30;

  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "微軟正黑體", size: 12, bold: true, color: { argb: "FFC00000" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.alignment = center;
    cell.border = border;
  });
  headerRow.height = 24;

  data.forEach((values, r) => {
    const row = sheet.getRow(r + 3);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.font = { name: "微軟正黑體", size: 12 };
      cell.alignment = center;
      cell.border = border;
      if (typeof v === "string") cell.numFmt = "@";
    });
    row.height = 22;
  });

  [8, 18, 14, 14, 16, 20].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
  sessionName,
  sessionDateStart,
  sessionDateEnd,
}: {
  rows: ReviewRow[];
  registrationCategoryMap: Map<string, string>;
  sessionName: string;
  sessionDateStart: string | null;
  sessionDateEnd: string | null;
}) {
  function categoryLabel(r: ReviewRow) {
    return r.registration_category_id ? (registrationCategoryMap.get(r.registration_category_id) ?? "-") : "-";
  }

  function exportFull() {
    const headers = [
      "編號", "報名時間", "聯絡Email", "聯絡電話", "報名類別", "成員", "人數",
      "審核結果", "錄取結果", "分組區域", "分組編號", "福慧床借用",
      "繳費狀態", "應繳金額", "是否取消", "取消原因", "備註",
    ];
    const data = rows.map((r) => [
      formatRegistrationNo(r.registration_seq),
      new Date(r.submitted_at).toLocaleString("zh-TW", { hour12: false, timeZone: TAIPEI_TIME_ZONE }),
      r.contact_email,
      excelText(r.contact_phone),
      categoryLabel(r),
      r.memberNames.join("、"),
      r.memberNames.length,
      r.review_status,
      r.admission_status,
      r.group_zone ?? "",
      excelText(r.group_number ?? ""),
      r.comfort_bed_needed,
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
      excelText(r.contact_phone),
    ]);
    downloadCsv("收據開立用資料.csv", toCsv(headers, data));
  }

  function exportCheckin() {
    const headers = ["編號", "報名類別", "名字", "人數", "區域編號", "睡袋(墊)自備/租借", "福慧床借用", "是否繳費", "電話"];
    const data = rows.map((r) => [
      formatRegistrationNo(r.registration_seq),
      categoryLabel(r),
      r.memberNames.join("、"),
      r.memberNames.length,
      excelText(`${r.group_zone ?? ""} ${r.group_number ?? ""}`.trim()),
      excelText(`${r.sleeping_bag_own_qty} / ${r.sleeping_bag_rent_qty}`),
      r.comfort_bed_needed,
      r.payment_status === "已完成" || r.payment_status === "無需繳費" ? "是" : "否",
      excelText(r.contact_phone),
    ]);
    downloadCsv("報到使用資料.csv", toCsv(headers, data));
  }

  function exportAdmitted() {
    const admitted = rows.filter((r) => !r.is_cancelled && r.admission_status === "正取");
    void downloadRosterXlsx(
      "錄取名單.xlsx",
      buildRosterTitle(sessionName, sessionDateStart, sessionDateEnd),
      ROSTER_HEADERS,
      buildRosterRows(admitted, [...registrationCategoryMap.keys()], registrationCategoryMap)
    );
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
