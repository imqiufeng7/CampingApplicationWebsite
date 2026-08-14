"use client";

import { useActionState } from "react";
import { updateSeries, type ActionState } from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function SeriesEditForm({
  series,
}: {
  series: Database["public"]["Tables"]["event_series"]["Row"];
}) {
  const action = updateSeries.bind(null, series.id);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">活動系列名稱</Label>
        <Input id="name" name="name" required defaultValue={series.name} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="year">年度</Label>
        <Input id="year" name="year" type="number" required defaultValue={series.year} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="status">狀態</Label>
        <select
          id="status"
          name="status"
          defaultValue={series.status}
          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
        >
          <option value="draft">草稿</option>
          <option value="open">開放中</option>
          <option value="closed">已截止</option>
          <option value="archived">已封存</option>
        </select>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
