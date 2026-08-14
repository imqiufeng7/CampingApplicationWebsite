"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
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
import { MemberDocumentsDialog } from "@/components/admin/reviews/MemberDocumentsDialog";
import { updateRegistrationField, type RegistrationEditableField } from "@/app/admin/(protected)/reviews/[sessionId]/actions";
import { formatRegistrationNo } from "@/lib/registrationNo";
import type { FieldPermissions } from "@/lib/auth/permissions";

export type ReviewRowMember = {
  id: string;
  name: string;
  identity_type_id: string | null;
  org_selected: string | null;
  org_other_text: string | null;
  fee_category_id: string | null;
  fee_review_result: string;
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
  memberNames: string[];
  members: ReviewRowMember[];
  files: ReviewRowFile[];
};

const REVIEW_STATUS_OPTIONS = [
  { value: "審核中", label: "審核中", colorClass: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  { value: "審核通過", label: "審核通過", colorClass: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200" },
  { value: "退回補件", label: "退回補件", colorClass: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
];

const ADMISSION_STATUS_OPTIONS = [
  { value: "未抽籤", label: "未抽籤", colorClass: "bg-muted text-muted-foreground" },
  { value: "正取", label: "正取", colorClass: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200" },
  { value: "備取", label: "備取", colorClass: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  { value: "取消", label: "取消", colorClass: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
];

const PAYMENT_BADGE_CLASS: Record<string, string> = {
  已完成: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  待繳費: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
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
function zoneColor(zone: string): string {
  let hash = 0;
  for (let i = 0; i < zone.length; i++) hash = (hash * 31 + zone.charCodeAt(i)) >>> 0;
  return ZONE_COLORS[hash % ZONE_COLORS.length];
}

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
});

export function ReviewTable({
  sessionId,
  data,
  identityTypeMap,
  feeCategoryMap,
  fieldPermissions,
  initialSortIds,
}: {
  sessionId: string;
  data: ReviewRow[];
  identityTypeMap: Map<string, string>;
  feeCategoryMap: Map<string, string>;
  fieldPermissions: FieldPermissions;
  initialSortIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [admissionFilter, setAdmissionFilter] = useState("");
  const [cancelledFilter, setCancelledFilter] = useState("");

  // 審核結果/錄取結果/備取順位/分組/睡袋 all live in the 錄取分組結果 group; 取消狀態 is its
  // own group (取消退費資訊) since a role could edit one without the other.
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
    return {
      totalCount: data.length,
      cancelledCount: data.length - active.length,
      totalPeople: active.reduce((sum, r) => sum + r.memberNames.length, 0),
      paidCount: active.filter((r) => r.payment_status === "已完成").length,
      collectedAmount: active
        .filter((r) => r.payment_status === "已完成")
        .reduce((sum, r) => sum + r.payment_amount, 0),
      zoneCount: new Set(active.map((r) => r.group_zone).filter(Boolean)).size,
      selfSuppliedBags: active.reduce((sum, r) => sum + r.sleeping_bag_own_qty, 0),
      rentedBags: active.reduce((sum, r) => sum + r.sleeping_bag_rent_qty, 0),
    };
  }, [data]);

  const columns = useMemo<ColumnDef<typeof reviewTableFeatures, ReviewRow, unknown>[]>(
    () => {
      const cols: ColumnDef<typeof reviewTableFeatures, ReviewRow, unknown>[] = [
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
          cell: ({ row }) => new Date(row.original.submitted_at).toLocaleString("zh-TW"),
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
          accessorFn: (r) => r.memberNames.length,
          cell: ({ row }) => (
            <span>
              {row.original.memberNames.join("、")}
              <span className="text-muted-foreground ml-1">({row.original.memberNames.length} 人)</span>
            </span>
          ),
        },
      ];

      // 錄取分組結果 group: hidden entirely when the role has no access to it at all,
      // otherwise shown (editable or read-only per canEditAdmission).
      if (!hideAdmission) {
        cols.push(
          {
            id: "review_status",
            header: "審核結果",
            accessorFn: (r) => r.review_status,
            cell: ({ row }) => (
              <EditableSelect
                value={row.original.review_status}
                options={REVIEW_STATUS_OPTIONS}
                disabled={!canEditAdmission}
                onSave={saveField(row.original.id, "review_status")}
              />
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
            header: "睡袋 自備/租借",
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
          header: "取消狀態",
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
            {row.original.payment_amount > 0 && (
              <span className="ml-1 font-mono">${row.original.payment_amount.toLocaleString("zh-TW")}</span>
            )}
          </div>
        ),
      });

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
          header: "狀態",
          enableSorting: false,
          cell: ({ row }) =>
            row.original.duplicate_flag ? <Badge variant="secondary">疑似重複</Badge> : null,
        },
        {
          id: "actions",
          header: "",
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }) => (
            <Link
              href={`/admin/registrations/${sessionId}/${row.original.id}`}
              className="text-primary underline"
            >
              詳情
            </Link>
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
      identityTypeMap,
      feeCategoryMap,
      duplicateGroups,
    ]
  );

  const table = useTable({
    features: reviewTableFeatures,
    data: filtered,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
  });

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <SummaryStat label="總筆數" value={summary.totalCount} />
        <SummaryStat label="總人數" value={summary.totalPeople} />
        <SummaryStat label="已繳費" value={summary.paidCount} />
        <SummaryStat label="收費總額" value={`$${summary.collectedAmount.toLocaleString("zh-TW")}`} />
        <SummaryStat label="分組區域數" value={summary.zoneCount} />
        <SummaryStat label="自備/租借睡袋" value={`${summary.selfSuppliedBags} / ${summary.rentedBags}`} />
        <SummaryStat label="已取消" value={summary.cancelledCount} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          {REVIEW_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
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
            欄位
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
                  {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground ml-auto text-sm">共 {filtered.length} 筆</span>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={
                    header.column.getCanSort()
                      ? header.column.getToggleSortingHandler()
                      : undefined
                  }
                  className={header.column.getCanSort() ? "cursor-pointer select-none" : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === "asc" && " ▲"}
                  {header.column.getIsSorted() === "desc" && " ▼"}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
