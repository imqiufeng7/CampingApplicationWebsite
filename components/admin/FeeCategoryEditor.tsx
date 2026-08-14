"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";
import {
  createFeeCategory,
  deleteFeeCategory,
  reorderFeeCategories,
  setFeeCategoryActive,
  updateFeeCategory,
  type ActionState,
} from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

type FeeCategory = Database["public"]["Tables"]["session_fee_categories"]["Row"];

function FeeCategoryActiveToggle({
  seriesId,
  sessionId,
  id,
  isActive,
}: {
  seriesId: string;
  sessionId: string;
  id: string;
  isActive: boolean;
}) {
  const [checked, setChecked] = useState(isActive);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => {
          const value = Boolean(next);
          setChecked(value);
          setPending(true);
          setFeeCategoryActive(seriesId, sessionId, id, value)
            .then((result) => {
              if (result.error) {
                setChecked(!value);
                toast.error(result.error);
              }
            })
            .finally(() => setPending(false));
        }}
      />
      <span className="text-muted-foreground text-sm">{checked ? "啟用中" : "已停用"}</span>
    </div>
  );
}

function FeeCategoryRow({
  seriesId,
  sessionId,
  category,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  seriesId: string;
  sessionId: string;
  category: FeeCategory;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragOver: boolean;
}) {
  const action = updateFeeCategory.bind(null, seriesId, sessionId, category.id);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        isDragOver
          ? "grid gap-3 rounded-lg border-2 border-primary border-dashed p-3"
          : "grid gap-3 rounded-lg border p-3"
      }
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          draggable={draggable}
          onDragStart={onDragStart}
          className="text-muted-foreground hover:text-foreground mt-1 cursor-grab active:cursor-grabbing"
          aria-label="拖曳調整順序"
        >
          <GripVertical className="size-4" />
        </button>
        <form action={formAction} className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`fc-code-${category.id}`}>代碼</Label>
            <Input id={`fc-code-${category.id}`} name="code" defaultValue={category.code ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`fc-label-${category.id}`}>類別名稱</Label>
            <Input id={`fc-label-${category.id}`} name="label" required defaultValue={category.label} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`fc-applies-${category.id}`}>類型</Label>
            <select
              id={`fc-applies-${category.id}`}
              name="applies_to"
              defaultValue={category.applies_to}
              className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="免付費">免付費</option>
              <option value="減免">減免</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`fc-discount-${category.id}`}>減免金額</Label>
            <Input
              id={`fc-discount-${category.id}`}
              name="discount_amount"
              type="number"
              step="0.01"
              defaultValue={category.discount_amount}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`fc-doc-${category.id}`}>應檢附證明文件</Label>
            <Input
              id={`fc-doc-${category.id}`}
              name="required_document_type"
              defaultValue={category.required_document_type ?? ""}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id={`fc-auto-approve-${category.id}`}
              name="auto_approve"
              defaultChecked={category.auto_approve}
            />
            <Label htmlFor={`fc-auto-approve-${category.id}`} className="font-normal">
              選取後不需審核，錄取後自動免繳費（例：自備帳篷/睡袋者）
            </Label>
            {category.auto_approve && (
              <Badge variant="secondary" className="ml-1">
                自動免審核
              </Badge>
            )}
          </div>
          {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
          <div className="flex items-center gap-3 sm:col-span-2">
            <SubmitButton>儲存</SubmitButton>
            <FeeCategoryActiveToggle
              seriesId={seriesId}
              sessionId={sessionId}
              id={category.id}
              isActive={category.is_active}
            />
          </div>
        </form>
      </div>
      <form action={deleteFeeCategory.bind(null, seriesId, sessionId, category.id)} className="pl-6">
        <Button type="submit" variant="ghost" size="sm">
          刪除類別
        </Button>
      </form>
    </div>
  );
}

export function FeeCategoryEditor({
  seriesId,
  sessionId,
  feeCategories,
}: {
  seriesId: string;
  sessionId: string;
  feeCategories: FeeCategory[];
}) {
  const action = createFeeCategory.bind(null, seriesId, sessionId);
  const [state, formAction] = useActionState(action, initialState);

  const [orderedIds, setOrderedIds] = useState(() => feeCategories.map((fc) => fc.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Re-sync after any server revalidation (create/update/delete/reorder all pass a
  // new feeCategories array) so the list always reflects the DB's current
  // sort_order — adjusted during render rather than an effect, per React's own
  // guidance for resetting derived state when a prop changes.
  const [prevFeeCategories, setPrevFeeCategories] = useState(feeCategories);
  if (feeCategories !== prevFeeCategories) {
    setPrevFeeCategories(feeCategories);
    setOrderedIds(feeCategories.map((fc) => fc.id));
  }

  const byId = new Map(feeCategories.map((fc) => [fc.id, fc]));
  const orderedCategories = orderedIds.map((id) => byId.get(id)).filter((fc): fc is FeeCategory => !!fc);

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const next = [...orderedIds];
    const fromIndex = next.indexOf(draggingId);
    const toIndex = next.indexOf(targetId);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, draggingId);
    setOrderedIds(next);
    setDraggingId(null);
    setDragOverId(null);
    reorderFeeCategories(seriesId, sessionId, next).then((result) => {
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {orderedCategories.map((fc) => (
          <FeeCategoryRow
            key={fc.id}
            seriesId={seriesId}
            sessionId={sessionId}
            category={fc}
            draggable
            onDragStart={() => setDraggingId(fc.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverId !== fc.id) setDragOverId(fc.id);
            }}
            onDrop={() => handleDrop(fc.id)}
            isDragOver={dragOverId === fc.id && draggingId !== fc.id}
          />
        ))}
        {feeCategories.length === 0 && (
          <p className="text-muted-foreground text-sm">尚未設定免付費/減免類別</p>
        )}
      </div>

      <form action={formAction} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="fc-code">代碼</Label>
          <Input id="fc-code" name="code" placeholder="例：(一)" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fc-label">類別名稱</Label>
          <Input id="fc-label" name="label" required placeholder="例：低收入戶" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fc-applies-to">類型</Label>
          <select
            id="fc-applies-to"
            name="applies_to"
            defaultValue="減免"
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="免付費">免付費</option>
            <option value="減免">減免</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fc-discount">減免金額</Label>
          <Input id="fc-discount" name="discount_amount" type="number" step="0.01" defaultValue={0} />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="fc-doc">應檢附證明文件</Label>
          <Input id="fc-doc" name="required_document_type" placeholder="例：低收入戶證明" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="fc-auto-approve" name="auto_approve" />
          <Label htmlFor="fc-auto-approve" className="font-normal">
            選取後不需審核，錄取後自動免繳費（例：自備帳篷/睡袋者）
          </Label>
        </div>
        {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
        <div className="sm:col-span-2">
          <SubmitButton>新增類別</SubmitButton>
        </div>
      </form>
    </div>
  );
}
