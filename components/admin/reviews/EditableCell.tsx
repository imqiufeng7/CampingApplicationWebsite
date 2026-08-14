"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type SaveResult = { error: string | null };
export type ColorSelectOption = { value: string; label: string; colorClass?: string };

function useCommit<T>(value: T, onSave: (value: T) => Promise<SaveResult>) {
  const [localValue, setLocalValue] = useState(value);
  const [pending, startTransition] = useTransition();

  function commit(next: T) {
    const previous = localValue;
    setLocalValue(next);
    startTransition(async () => {
      const result = await onSave(next);
      if (result.error) {
        setLocalValue(previous);
        toast.error(result.error);
      }
    });
  }

  return { localValue, setLocalValue, commit, pending };
}

export function EditableSelect({
  value,
  options,
  onSave,
  disabled,
}: {
  value: string;
  options: ColorSelectOption[];
  onSave: (value: string) => Promise<SaveResult>;
  disabled?: boolean;
}) {
  const { localValue, commit, pending } = useCommit(value, onSave);
  const selected = options.find((o) => o.value === localValue);

  if (disabled) {
    return (
      <span className={selected?.colorClass ? cn("rounded px-1.5 py-0.5", selected.colorClass) : undefined}>
        {selected?.label ?? localValue}
      </span>
    );
  }

  return (
    <select
      value={localValue}
      onChange={(e) => commit(e.target.value)}
      disabled={pending}
      className={cn(
        "border-input h-8 rounded-lg border px-2 text-sm",
        selected?.colorClass ?? "bg-transparent"
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-background text-foreground">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EditableText({
  value,
  onSave,
  disabled,
  placeholder,
  className,
}: {
  value: string;
  onSave: (value: string) => Promise<SaveResult>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { localValue, setLocalValue, commit, pending } = useCommit(value, onSave);

  if (disabled) {
    return <span className={className}>{localValue || "-"}</span>;
  }

  return (
    <Input
      value={localValue}
      placeholder={placeholder}
      disabled={pending}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => {
        if (localValue !== value) commit(localValue);
      }}
      className={className ?? "h-8 w-24 text-sm"}
    />
  );
}

export function EditableNumber({
  value,
  onSave,
  disabled,
  className,
}: {
  value: number;
  onSave: (value: number) => Promise<SaveResult>;
  disabled?: boolean;
  className?: string;
}) {
  const { localValue, setLocalValue, commit, pending } = useCommit(value, onSave);

  if (disabled) {
    return <span className={className}>{localValue}</span>;
  }

  return (
    <Input
      type="number"
      value={localValue}
      disabled={pending}
      onChange={(e) => setLocalValue(e.target.valueAsNumber || 0)}
      onBlur={() => {
        if (localValue !== value) commit(localValue);
      }}
      className={className ?? "h-8 w-16 text-sm"}
    />
  );
}

export function EditableCheckbox({
  checked,
  onSave,
  disabled,
}: {
  checked: boolean;
  onSave: (value: boolean) => Promise<SaveResult>;
  disabled?: boolean;
}) {
  const { localValue, commit, pending } = useCommit(checked, onSave);

  if (disabled) {
    return checked ? <span>已取消</span> : null;
  }

  return (
    <Checkbox checked={localValue} disabled={pending} onCheckedChange={(v) => commit(Boolean(v))} />
  );
}
