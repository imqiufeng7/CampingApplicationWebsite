"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EditableCheckbox,
  EditableNumber,
  EditableSelect,
  EditableText,
} from "@/components/admin/reviews/EditableCell";
import { ReviewStatusCell } from "@/components/admin/reviews/ReviewStatusCell";
import { MemberDocumentsDialog } from "@/components/admin/reviews/MemberDocumentsDialog";
import { ExportMenu } from "@/components/admin/reviews/ExportMenu";
import { DeleteRegistrationButton } from "@/components/admin/reviews/DeleteRegistrationButton";
import { SendSelectedResultsDialog } from "@/components/admin/reviews/SendSelectedResultsDialog";
import { updateRegistrationField, type RegistrationEditableField } from "@/app/admin/(protected)/reviews/[sessionId]/actions";
import { formatRegistrationNo } from "@/lib/registrationNo";
import { cn } from "@/lib/utils";
import { TAIPEI_TIME_ZONE } from "@/lib/timezone";
import type { FieldPermissions } from "@/lib/auth/permissions";

export type ReviewRowMember = {
  id: string;
  name: string;
  identity_type_id: string | null;
  org_selected: string | null;
  org_other_text: string | null;
  fee_category_id: string | null;
  fee_review_result: string;
  needs_resubmission: boolean;
  resubmission_note: string | null;
  birth_year_roc: number | null;
  birth_month: number | null;
  birth_day: number | null;
};

export type ReviewRowFile = { id: string; member_id: string | null; file_type: string };

export type ReviewRow = {
  id: string;
  registration_seq: number;
  submitted_at: string;
  contact_email: string;
  contact_phone: string;
  review_status: string;
  admission_status: string;
  waitlist_rank: number | null;
  group_zone: string | null;
  group_number: string | null;
  sleeping_bag_own_qty: number;
  sleeping_bag_rent_qty: number;
  payment_status: string;
  payment_amount: number;
  admin_note: string | null;
  is_cancelled: boolean;
  cancel_reason: string | null;
  duplicate_flag: boolean;
  duplicateMatches: { otherSeq: number | null; otherSessionName: string | null; memberName: string }[];
  registration_category_id: string | null;
  memberNames: string[];
  members: ReviewRowMember[];
  files: ReviewRowFile[];
};

const ADMISSION_STATUS_OPTIONS = [
  { value: "待確認", label: "待確認", colorClass: "bg-muted text-muted-foreground" },
  { value: "正取", label: "正取", colorClass: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200" },
  { value: "備取", label: "備取", colorClass: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  { value: "取消", label: "取消", colorClass: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
];

const PAYMENT_BADGE_CLASS: Record<string, string> = {
  已完成: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  待繳費: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  取消: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  無需繳費: "bg-muted text-muted-foreground",
};

// Stable color per zone name (not tied to insertion order) so the same zone always
// reads as the same color across reloads/filters.
const ZONE_COLORS = [
  "border-blue-400",
  "border-green-400",
  "border-amber-400",
  "border-purple-400",
  "border-pink-400",
  "border-cyan-400",
  "border-orange-400",
];
function zoneHash(zone: string): number {
  let hash = 0;
  for (let i = 0; i < zone.length; i++) hash = (hash * 31 + zone.charCodeAt(i)) >>> 0;
  return hash;
}
function zoneColor(zone: string): string {
  return ZONE_COLORS[zoneHash(zone) % ZONE_COLORS.length];
}

// Same hue order as ZONE_COLORS (index-aligned) but as text color, for labeling the
// zone letter itself in the summary stat block rather than a cell's left border.
const ZONE_TEXT_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-green-600 dark:text-green-400",
  "text-amber-600 dark:text-amber-400",
  "text-purple-600 dark:text-purple-400",
  "text-pink-600 dark:text-pink-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-orange-600 dark:text-orange-400",
];
function zoneTextColor(zone: string): string {
  return ZONE_TEXT_COLORS[zoneHash(zone) % ZONE_TEXT_COLORS.length];
}

// Only needed for columns whose header isn't a plain string (e.g. sleeping_bag's
// two-line header) — the "查看欄位" visibility dropdown falls back to this map
// instead of the raw column id.
const COLUMN_DISPLAY_LABELS: Record<string, string> = {
  sleeping_bag: "睡袋(墊) 自備/租借",
};

// TanStack Table v9 registers row-model factories and stateful features
// explicitly (unlike v8's useReactTable, which bundled everything). Defined at
// module scope per the library's own guidance, since re-creating it on every
// render would invalidate the table's memoized row models.
const reviewTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
});

export function ReviewTable({
  sessionId,
  data,
  identityTypeMap,
  feeCategoryMap,
  registrationCategoryMap,
  fieldPermissions,
  isVendor,
  initialSortIds,
}: {
  sessionId: string;
  data: ReviewRow[];
  identityTypeMap: Map<string, string>;
  feeCategoryMap: Map<string, string>;
  registrationCategoryMap: Map<string, string>;
  fieldPermissions: FieldPermissions;
  isVendor: boolean;
  initialSortIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [admissionFilter, setAdmissionFilter] = useState("");
  const [cancelledFilter, setCancelledFilter] = useState("");

  // 審核結果/錄取結果/備取順位/分組/睡袋/補件原因 all live in the 錄取分組結果 group; 取消狀態 is
  // its own group (取消退費資訊) since a role could edit one without the other.
  const canEditAdmission = fieldPermissions["錄取分組結果"] === "editable";
  const hideAdmission = fieldPermissions["錄取分組結果"] === "hidden";
  const canEditCancel = fieldPermissions["取消退費資訊"] === "editable";
  const hideCancel = fieldPermissions["取消退費資訊"] === "hidden";
  const canEditNote = fieldPermissions["備註"] === "editable";
  const hideNote = fieldPermissions["備註"] === "hidden";
  const canViewDocuments = fieldPermissions["身份證明文件"] !== "hidden";
  const canEditFeeReview = fieldPermissions["免付費審核結果"] === "editable";

  function saveField(registrationId: string, field: RegistrationEditableField) {
    return (value: string | number | boolean) =>
      updateRegistrationField(sessionId, registrationId, field, value);
  }

  const orderIndex = useMemo(
    () => new Map(initialSortIds.map((id, i) => [id, i])),
    [initialSortIds]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data
      .filter((r) => {
        if (reviewFilter && r.review_status !== reviewFilter) return false;
        if (admissionFilter && r.admission_status !== admissionFilter) return false;
        if (cancelledFilter === "cancelled" && !r.is_cancelled) return false;
        if (cancelledFilter === "active" && r.is_cancelled) return false;
        if (!term) return true;
        const haystack = [r.contact_email, r.contact_phone, ...r.memberNames]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
  }, [data, search, reviewFilter, admissionFilter, cancelledFilter, orderIndex]);

  // Same 區域+編號 combo used by more than one active registration in this session —
  // checked against the full session dataset (not just the filtered view) so a
  // duplicate is caught even if the other row is currently filtered out.
  const duplicateGroups = useMemo(() => {
    const byCombo = new Map<string, ReviewRow[]>();
    for (const r of data) {
      if (r.is_cancelled || !r.group_zone || !r.group_number) continue;
      const key = `${r.group_zone}|${r.group_number}`;
      const list = byCombo.get(key) ?? [];
      list.push(r);
      byCombo.set(key, list);
    }
    const conflicts = new Map<string, number[]>();
    for (const list of byCombo.values()) {
      if (list.length < 2) continue;
      for (const r of list) {
        conflicts.set(
          r.id,
          list.filter((other) => other.id !== r.id).map((other) => other.registration_seq)
        );
      }
    }
    return conflicts;
  }, [data]);

  const summary = useMemo(() => {
    const active = data.filter((r) => !r.is_cancelled);

    const zoneCounts = new Map<string, number>();
    for (const r of active) {
      if (!r.group_zone) continue;
      zoneCounts.set(r.group_zone, (zoneCounts.get(r.group_zone) ?? 0) + 1);
    }

    // Every configured category shows up even with 0 admitted so far, rather than
    // only appearing once someone's actually been admitted into it.
    const admittedByCategory = new Map<string, number>([...registrationCategoryMap.values()].map((label) => [label, 0]));
    for (const r of active) {
      if (r.admission_status !== "正取" || !r.registration_category_id) continue;
      const label = registrationCategoryMap.get(r.registration_category_id) ?? "-";
      admittedByCategory.set(label, (admittedByCategory.get(label) ?? 0) + 1);
    }

    return {
      totalCount: data.length,
      cancelledCount: data.length - active.length,
      totalPeople: active.reduce((sum, r) => sum + r.memberNames.length, 0),
      paidCount: active.filter((r) => r.payment_status === "已完成").length,
      collectedAmount: active
        .filter((r) => r.payment_status === "已完成")
        .reduce((sum, r) => sum + r.payment_amount, 0),
      zoneCounts: [...zoneCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      admittedByCategory: [...admittedByCategory.entries()],
      admittedTotal: active.filter((r) => r.admission_status === "正取").length,
      selfSuppliedBags: active.reduce((sum, r) => sum + r.sleeping_bag_own_qty, 0),
      rentedBags: active.reduce((sum, r) => sum + r.sleeping_bag_rent_qty, 0),
    };
  }, [data, registrationCategoryMap]);

  const columns = useMemo<ColumnDef<typeof reviewTableFeatures, ReviewRow, unknown>[]>(
    () => {
      const cols: ColumnDef<typeof reviewTableFeatures, ReviewRow, unknown>[] = [
        {
          id: "select",
          header: ({ table }) => (
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
              onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
            />
          ),
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} />
          ),
        },
        {
          id: "no",
          header: "編號",
          accessorFn: (r) => r.registration_seq,
          cell: ({ row }) => (
            <span className="font-mono">{formatRegistrationNo(row.original.registration_seq)}</span>
          ),
        },
        {
          id: "submitted_at",
          header: "報名時間",
          accessorFn: (r) => r.submitted_at,
          cell: ({ row }) =>
            new Date(row.original.submitted_at).toLocaleString("zh-TW", { timeZone: TAIPEI_TIME_ZONE }),
        },
        {
          id: "contact",
          header: "聯絡人",
          accessorFn: (r) => r.contact_email,
          cell: ({ row }) => (
            <div>
              <div>{row.original.contact_email}</div>
              <div className="text-muted-foreground text-sm">{row.original.contact_phone}</div>
            </div>
          ),
        },
        {
          id: "members",
          header: "成員",
          accessorFn: (r) => r.memberNames.join(" "),
          cell: ({ row }) => (
            <div className="grid">
              {row.original.memberNames.map((name, i) => (
                <span key={i}>{name}</span>
              ))}
            </div>
          ),
        },
        {
          id: "member_count",
          header: "人數",
          accessorFn: (r) => r.memberNames.length,
          cell: ({ row }) => row.original.memberNames.length,
        },
      ];

      // Sessions with no registration categories configured never show this column —
      // matches how the public form only shows the category picker step when at least
      // one category exists.
      if (registrationCategoryMap.size > 0) {
        cols.push({
          id: "registration_category",
          header: "報名類別",
          accessorFn: (r) => (r.registration_category_id ? registrationCategoryMap.get(r.registration_category_id) ?? "" : ""),
          cell: ({ row }) =>
            row.original.registration_category_id
              ? (registrationCategoryMap.get(row.original.registration_category_id) ?? "-")
              : "-",
        });
      }

      // 錄取分組結果 group: hidden entirely when the role has no access to it at all,
      // otherwise shown (editable or read-only per canEditAdmission).
      if (!hideAdmission) {
        cols.push(
          {
            id: "review_status",
            header: "審核結果",
            accessorFn: (r) => r.review_status,
            cell: ({ row }) => (
              <ReviewStatusCell reviewStatus={row.original.review_status} members={row.original.members} />
            ),
          },
          {
            id: "admission_status",
            header: "錄取結果",
            accessorFn: (r) => r.admission_status,
            cell: ({ row }) => (
              <EditableSelect
                value={row.original.admission_status}
                options={ADMISSION_STATUS_OPTIONS}
                disabled={!canEditAdmission}
                onSave={saveField(row.original.id, "admission_status")}
              />
            ),
          },
          {
            id: "waitlist_rank",
            header: "備取順位",
            accessorFn: (r) => r.waitlist_rank ?? 0,
            cell: ({ row }) => (
              <EditableNumber
                value={row.original.waitlist_rank ?? 0}
                disabled={!canEditAdmission}
                onSave={saveField(row.original.id, "waitlist_rank")}
              />
            ),
          },
          {
            id: "group",
            header: "分組",
            accessorFn: (r) => `${r.group_zone ?? ""} ${r.group_number ?? ""}`.trim(),
            cell: ({ row }) => {
              const conflicts = duplicateGroups.get(row.original.id);
              return (
                <div
                  className={
                    conflicts
                      ? "grid gap-1 rounded-md border-2 border-destructive p-1"
                      : row.original.group_zone
                        ? `grid gap-1 border-l-4 pl-1 ${zoneColor(row.original.group_zone)}`
                        : "grid gap-1"
                  }
                  title={
                    conflicts
                      ? `與 ${conflicts.map((seq) => formatRegistrationNo(seq)).join("、")} 分組重複`
                      : undefined
                  }
                >
                  <EditableText
                    value={row.original.group_zone ?? ""}
                    placeholder="區域"
                    disabled={!canEditAdmission}
                    onSave={saveField(row.original.id, "group_zone")}
                  />
                  <EditableText
                    value={row.original.group_number ?? ""}
                    placeholder="編號"
                    disabled={!canEditAdmission}
                    onSave={saveField(row.original.id, "group_number")}
                  />
                  {conflicts && (
                    <span className="text-destructive text-xs">
                      與 {conflicts.map((seq) => formatRegistrationNo(seq)).join("、")} 重複
                    </span>
                  )}
                </div>
              );
            },
          },
          {
            id: "sleeping_bag",
            header: () => (
              <span className="block leading-tight">
                睡袋(墊)
                <br />
                自備/租借
              </span>
            ),
            accessorFn: (r) => r.sleeping_bag_own_qty,
            cell: ({ row }) => (
              <span title="依成員選擇的免付費類別自動計算，不可手動修改">
                {row.original.sleeping_bag_own_qty} / {row.original.sleeping_bag_rent_qty}
              </span>
            ),
          }
        );
      }

      if (!hideCancel) {
        cols.push({
          id: "cancelled",
          header: "取消",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="grid gap-1">
              <EditableCheckbox
                checked={row.original.is_cancelled}
                disabled={!canEditCancel}
                onSave={saveField(row.original.id, "is_cancelled")}
              />
              {row.original.is_cancelled && (
                <EditableText
                  value={row.original.cancel_reason ?? ""}
                  placeholder="取消原因"
                  disabled={!canEditCancel}
                  onSave={saveField(row.original.id, "cancel_reason")}
                />
              )}
            </div>
          ),
        });
      }

      // 繳費狀態 is finance's field group — this table only ever shows it read-only,
      // never edits it here (out of scope for the review table). Sorts by amount
      // (more useful than sorting by the status string).
      cols.push({
        id: "payment",
        header: "繳費情況",
        accessorFn: (r) => r.payment_amount,
        cell: ({ row }) => (
          <div>
            <Badge variant="secondary" className={PAYMENT_BADGE_CLASS[row.original.payment_status]}>
              {row.original.payment_status}
            </Badge>
            {(row.original.payment_status === "待繳費" || row.original.payment_status === "已完成") &&
              row.original.payment_amount > 0 && (
              <div className="text-muted-foreground mt-0.5 font-mono text-xs">
                ${row.original.payment_amount.toLocaleString("zh-TW")}
              </div>
            )}
          </div>
        ),
      });

      if (canViewDocuments) {
        cols.push({
          id: "documents",
          header: "證明文件",
          enableSorting: false,
          cell: ({ row }) => (
            <MemberDocumentsDialog
              sessionId={sessionId}
              registrationId={row.original.id}
              members={row.original.members}
              files={row.original.files}
              identityTypeMap={identityTypeMap}
              feeCategoryMap={feeCategoryMap}
              canEdit={canEditFeeReview}
            />
          ),
        });
      }

      cols.push(
        {
          id: "flags",
          header: "疑似重複",
          enableSorting: false,
          cell: ({ row }) => {
            const matches = row.original.duplicateMatches;
            if (!row.original.duplicate_flag || matches.length === 0) return null;
            return (
              <div className="grid max-w-32 gap-1">
                {matches.map((m, i) => (
                  <span
                    key={i}
                    title={`成員「${m.memberName}」與 ${m.otherSeq != null ? formatRegistrationNo(m.otherSeq) : "其他場次資料"}${m.otherSessionName ? `（${m.otherSessionName}）` : ""} 重複`}
                    className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] leading-snug break-words whitespace-normal text-red-900 dark:bg-red-900/40 dark:text-red-200"
                  >
                    {m.memberName} 與 {m.otherSeq != null ? formatRegistrationNo(m.otherSeq) : "其他場次"} 重複
                  </span>
                ))}
              </div>
            );
          },
        }
      );

      if (!hideNote) {
        cols.push({
          id: "admin_note",
          header: "備註",
          enableSorting: false,
          cell: ({ row }) => (
            <EditableText
              value={row.original.admin_note ?? ""}
              disabled={!canEditNote}
              className="h-8 w-32 text-sm"
              onSave={saveField(row.original.id, "admin_note")}
            />
          ),
        });
      }

      cols.push(
        {
          id: "actions",
          header: "",
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/registrations/${sessionId}/${row.original.id}`}
                className="text-primary underline"
              >
                詳情
              </Link>
              {isVendor && (
                <DeleteRegistrationButton
                  sessionId={sessionId}
                  registrationId={row.original.id}
                  registrationSeq={row.original.registration_seq}
                />
              )}
            </div>
          ),
        }
      );

      return cols;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      sessionId,
      canEditAdmission,
      hideAdmission,
      canEditCancel,
      hideCancel,
      canEditNote,
      hideNote,
      canViewDocuments,
      canEditFeeReview,
      isVendor,
      identityTypeMap,
      feeCategoryMap,
      registrationCategoryMap,
      duplicateGroups,
    ]
  );

  const table = useTable({
    features: reviewTableFeatures,
    data: filtered,
    columns,
    getRowId: (row) => row.id,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  });

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id);

  return (
    <div className="grid gap-3">
      <div className="bg-muted/40 grid gap-2 rounded-xl border p-2.5" data-tour="review-summary">
        {registrationCategoryMap.size > 0 && (
          <div className="border-b pb-2">
            <p className="text-muted-foreground mb-1 text-xs">各類別錄取人數</p>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {summary.admittedByCategory.map(([k, v]) => (
                <span key={k} className="text-sm font-medium">
                  {k} <span className="text-base font-semibold">{v}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPair primary={{ label: "總筆數", value: summary.totalCount }} secondary={{ label: "總人數", value: summary.totalPeople }} />
          <StatPair
            primary={{ label: "已錄取", value: summary.admittedTotal }}
            secondary={{ label: "分組區域", breakdown: summary.zoneCounts, colorFn: zoneTextColor }}
          />
          <StatPair
            primary={{ label: "已繳費", value: summary.paidCount }}
            secondary={{ label: "收費總額", value: `$${summary.collectedAmount.toLocaleString("zh-TW")}` }}
          />
          <StatPair
            primary={{ label: "已取消", value: summary.cancelledCount }}
            secondary={{ label: "睡墊情況（自備/租借）", value: `${summary.selfSuppliedBags} / ${summary.rentedBags}` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-tour="review-filters">
        <Input
          placeholder="搜尋聯絡人/成員..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48"
        />
        <select
          value={reviewFilter}
          onChange={(e) => setReviewFilter(e.target.value)}
          className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="">全部審核結果</option>
          <option value="審核中">審核中</option>
          <option value="審核通過">審核通過</option>
          <option value="退回補件">退回補件</option>
        </select>
        <select
          value={admissionFilter}
          onChange={(e) => setAdmissionFilter(e.target.value)}
          className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="">全部錄取結果</option>
          {ADMISSION_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={cancelledFilter}
          onChange={(e) => setCancelledFilter(e.target.value)}
          className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="">全部狀態</option>
          <option value="active">未取消</option>
          <option value="cancelled">已取消</option>
        </select>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
            查看欄位
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                >
                  {typeof c.columnDef.header === "string"
                    ? c.columnDef.header
                    : (COLUMN_DISPLAY_LABELS[c.id] ?? c.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div data-tour="review-export">
          <ExportMenu rows={filtered} registrationCategoryMap={registrationCategoryMap} />
        </div>

        {canEditAdmission && <SendSelectedResultsDialog sessionId={sessionId} registrationIds={selectedIds} />}

        <span className="text-muted-foreground text-xs">
          點擊欄位標題排序；按住 Shift 點擊可依序加入多層排序
        </span>

        <span className="text-muted-foreground ml-auto text-sm">共 {filtered.length} 筆</span>
      </div>

      <Table data-tour="review-table">
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const sortIndex = header.column.getSortIndex();
                const showSortIndex = header.column.getIsSorted() && table.state.sorting.length > 1;
                return (
                  <TableHead
                    key={header.id}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    title={header.column.getCanSort() ? "點擊排序；按住 Shift 點擊可依序加入多層排序" : undefined}
                    className={cn(
                      "bg-muted/50 h-11 px-3 text-center",
                      header.column.getCanSort() ? "cursor-pointer select-none" : undefined
                    )}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" && " ▲"}
                    {header.column.getIsSorted() === "desc" && " ▼"}
                    {showSortIndex && (
                      <sup className="text-primary ml-0.5 font-semibold">{sortIndex + 1}</sup>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2.5 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtered.length === 0 && <p className="text-muted-foreground p-4 text-sm">尚無報名資料</p>}

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            上一頁
          </Button>
          <span className="text-muted-foreground">
            第 {table.state.pagination.pageIndex + 1} / {table.getPageCount()} 頁
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            下一頁
          </Button>
        </div>
      )}
    </div>
  );
}

type StatValue =
  | { label: string; value: string | number }
  | { label: string; breakdown: [string, number][]; colorFn?: (key: string) => string };

// Deliberately always dark regardless of the site's own light/dark theme toggle — a
// fixed high-contrast "KPI card" look the vendor asked for specifically for these four
// summary blocks. First pass used a plain near-black (zinc-900), which read as too
// heavy/high-pressure — this warm dark brown is pulled from the same family as the
// site's own terracotta primary (--primary: #b8412f in .theme-admin) rather than a
// generic neutral, and is a couple steps lighter than near-black. The 分組區域
// breakdown is the one exception: its per-zone colorFn text stays as-is (zoneTextColor
// already picks colors readable on a dark card) rather than being forced white, since
// the color coding itself is the point there.
function StatPair({ primary, secondary }: { primary: StatValue; secondary: StatValue }) {
  return (
    <div className="rounded-lg border border-[#7a4a3a] bg-[#5a3128] p-2">
      <StatLine stat={primary} size="lg" />
      <div className="my-1 border-t border-[#7a4a3a]" />
      <StatLine stat={secondary} size="sm" />
    </div>
  );
}

function StatLine({ stat, size }: { stat: StatValue; size: "lg" | "sm" }) {
  if ("breakdown" in stat) {
    return (
      <div>
        <p className="mb-0.5 text-xs text-[#e0b8a8]">{stat.label}</p>
        {stat.breakdown.length === 0 ? (
          <p className="text-sm text-[#e0b8a8]">無資料</p>
        ) : (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {stat.breakdown.map(([k, v]) => (
              <span
                key={k}
                className={cn(
                  size === "lg" ? "text-sm font-semibold" : "text-xs",
                  stat.colorFn ? stat.colorFn(k) : "text-white"
                )}
              >
                {k} {v}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="mb-0.5 text-xs text-[#e0b8a8]">{stat.label}</p>
      <p className={cn("text-white", size === "lg" ? "text-lg font-bold" : "text-sm font-medium")}>
        {stat.value}
      </p>
    </div>
  );
}
