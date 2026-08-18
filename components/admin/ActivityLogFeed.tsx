"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TAIPEI_TIME_ZONE } from "@/lib/timezone";

export type ActivityLogEntry = { admin_email: string | null; summary: string; created_at: string };

const PAGE_SIZE = 5;

export function ActivityLogFeed({ entries }: { entries: ActivityLogEntry[] }) {
  const [adminFilter, setAdminFilter] = useState("");
  const [expanded, setExpanded] = useState(false);

  const admins = useMemo(
    () => [...new Set(entries.map((e) => e.admin_email ?? "未知使用者"))].sort((a, b) => a.localeCompare(b)),
    [entries]
  );

  const filtered = useMemo(
    () => (adminFilter ? entries.filter((e) => (e.admin_email ?? "未知使用者") === adminFilter) : entries),
    [entries, adminFilter]
  );

  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE);

  return (
    <div className="grid gap-2">
      {admins.length > 1 && (
        <select
          value={adminFilter}
          onChange={(e) => {
            setAdminFilter(e.target.value);
            setExpanded(false);
          }}
          className="border-input h-8 w-fit rounded-lg border bg-transparent px-2 text-sm"
        >
          <option value="">全部管理員</option>
          {admins.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}
      <ul className="grid gap-2">
        {visible.map((a, i) => (
          <li key={i} className="bg-card rounded-lg border p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{a.admin_email ?? "未知使用者"}</span>
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(a.created_at).toLocaleString("zh-TW", { timeZone: TAIPEI_TIME_ZONE })}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">{a.summary}</p>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-muted-foreground text-sm">沒有符合的紀錄</li>}
      </ul>
      {!expanded && filtered.length > PAGE_SIZE && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          查看更多（還有 {filtered.length - PAGE_SIZE} 筆）
        </Button>
      )}
    </div>
  );
}
