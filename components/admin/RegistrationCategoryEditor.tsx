"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  createRegistrationCategory,
  deleteRegistrationCategory,
  updateRegistrationCategory,
  type ActionState,
} from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

type RegistrationCategory = Database["public"]["Tables"]["session_registration_categories"]["Row"];

function RegistrationCategoryRow({
  seriesId,
  sessionId,
  category,
}: {
  seriesId: string;
  sessionId: string;
  category: RegistrationCategory;
}) {
  const action = updateRegistrationCategory.bind(null, seriesId, sessionId, category.id);
  const [state, formAction] = useActionState(action, initialState);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteRegistrationCategory(seriesId, sessionId, category.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已刪除類別");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`rc-label-${category.id}`}>類別名稱</Label>
          <Input id={`rc-label-${category.id}`} name="label" required defaultValue={category.label} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`rc-min-${category.id}`}>每筆報名人數下限</Label>
          <Input
            id={`rc-min-${category.id}`}
            name="min_members"
            type="number"
            min={1}
            defaultValue={category.min_members}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`rc-max-${category.id}`}>每筆報名人數上限</Label>
          <Input
            id={`rc-max-${category.id}`}
            name="max_members"
            type="number"
            min={1}
            defaultValue={category.max_members}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`rc-capacity-${category.id}`}>此類別開放報名上限（選填）</Label>
          <Input
            id={`rc-capacity-${category.id}`}
            name="capacity_total"
            type="number"
            defaultValue={category.capacity_total ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`rc-quota-${category.id}`}>此類別錄取名額（選填）</Label>
          <Input
            id={`rc-quota-${category.id}`}
            name="admission_quota"
            type="number"
            defaultValue={category.admission_quota ?? ""}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id={`rc-free-${category.id}`} name="is_free" defaultChecked={category.is_free} />
          <Label htmlFor={`rc-free-${category.id}`} className="font-normal">
            此類別整組免費（報名表單不顯示免付費類別選單與證明文件上傳）
          </Label>
        </div>
        {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
        <div className="sm:col-span-2">
          <SubmitButton>儲存</SubmitButton>
        </div>
      </form>
      <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={handleDelete}>
        {deleting ? "刪除中..." : "刪除類別"}
      </Button>
    </div>
  );
}

export function RegistrationCategoryEditor({
  seriesId,
  sessionId,
  registrationCategories,
}: {
  seriesId: string;
  sessionId: string;
  registrationCategories: RegistrationCategory[];
}) {
  const action = createRegistrationCategory.bind(null, seriesId, sessionId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        沒有設定報名類別時，報名表單維持單一步驟、用場次本身的開放報名上限/錄取名額/人數上限；一旦新增類別，公開表單會先讓民眾選類別，之後改用各類別各自的設定。
      </p>
      <div className="grid gap-2">
        {registrationCategories.map((rc) => (
          <RegistrationCategoryRow key={rc.id} seriesId={seriesId} sessionId={sessionId} category={rc} />
        ))}
        {registrationCategories.length === 0 && (
          <p className="text-muted-foreground text-sm">尚未設定報名類別</p>
        )}
      </div>

      <form action={formAction} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="rc-new-label">類別名稱</Label>
          <Input id="rc-new-label" name="label" required placeholder="例：自搭帳篷" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rc-new-min">每筆報名人數下限</Label>
          <Input id="rc-new-min" name="min_members" type="number" min={1} defaultValue={1} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rc-new-max">每筆報名人數上限</Label>
          <Input id="rc-new-max" name="max_members" type="number" min={1} defaultValue={1} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rc-new-capacity">此類別開放報名上限（選填）</Label>
          <Input id="rc-new-capacity" name="capacity_total" type="number" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rc-new-quota">此類別錄取名額（選填）</Label>
          <Input id="rc-new-quota" name="admission_quota" type="number" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="rc-new-free" name="is_free" />
          <Label htmlFor="rc-new-free" className="font-normal">
            此類別整組免費（報名表單不顯示免付費類別選單與證明文件上傳）
          </Label>
        </div>
        {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
        <div className="sm:col-span-2">
          <SubmitButton>新增報名類別</SubmitButton>
        </div>
      </form>
    </div>
  );
}
