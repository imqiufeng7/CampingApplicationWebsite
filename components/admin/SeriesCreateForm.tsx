"use client";

import { useActionState } from "react";
import { createSeries, type ActionState } from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/admin/SubmitButton";

const initialState: ActionState = { error: null };

export function SeriesCreateForm() {
  const [state, formAction] = useActionState(createSeries, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">活動系列名稱</Label>
        <Input id="name" name="name" required placeholder="例：114年防災教育日系列活動" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="year">年度</Label>
        <Input id="year" name="year" type="number" required defaultValue={new Date().getFullYear()} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="status">狀態</Label>
        <select
          id="status"
          name="status"
          defaultValue="draft"
          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
        >
          <option value="draft">草稿</option>
          <option value="open">開放中</option>
          <option value="closed">已截止</option>
          <option value="archived">已封存</option>
        </select>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <SubmitButton>建立</SubmitButton>
    </form>
  );
}
