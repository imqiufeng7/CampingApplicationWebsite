// Mirrors the field_group CHECK constraint on public.field_permission_matrix
// (supabase/migrations/20260731090001_role_matrix_schema.sql) and the column->group
// mapping in the rewritten column-permission triggers
// (20260731090002_dynamic_column_permissions.sql). Keep these in sync.
export const FIELD_GROUPS = [
  "個人基本資料",
  "身份證明文件",
  "免付費審核結果",
  "錄取分組結果",
  "繳費狀態",
  "取消退費資訊",
  "備註",
] as const;

export type FieldGroup = (typeof FIELD_GROUPS)[number];
export type PermissionLevel = "editable" | "readonly" | "hidden";
export type FieldPermissions = Record<FieldGroup, PermissionLevel>;
