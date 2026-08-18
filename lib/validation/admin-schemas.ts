import { z } from "zod";

export const seriesSchema = z.object({
  name: z.string().min(1, "請輸入活動系列名稱"),
  year: z.coerce.number().int().min(2000).max(2100),
  status: z.enum(["draft", "open", "closed", "archived"]),
});

export type SeriesFormValues = z.infer<typeof seriesSchema>;

const optionalDateTime = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v : null));

// z.coerce.number() on an empty string coerces to 0 (Number("") === 0), not undefined —
// which would silently turn a blank "選填" number field into a real 0 on every save
// (e.g. capacity_total: 0 would make a session look permanently full). Transform blank
// to null explicitly instead, same "leave it unset" semantics as optionalText.
export const optionalInt = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? Number(v) : null));

export const sessionSchema = z.object({
  name: z.string().min(1, "請輸入場次名稱"),
  location: z.string().optional(),
  date_start: z.string().optional(),
  date_end: z.string().optional(),
  capacity_total: optionalInt,
  admission_quota: optionalInt,
  registration_open_at: optionalDateTime,
  registration_close_at: optionalDateTime,
  result_announce_at: optionalDateTime,
  cancel_deadline_at: optionalDateTime,
  payment_deadline_at: optionalDateTime,
  fee_base: z.coerce.number().min(0).default(0),
  fee_discount_per_person: z.coerce.number().min(0).default(0),
  max_members_per_registration: z.coerce.number().int().min(1).default(1),
  managing_org: z.string().optional(),
  status: z.enum(["draft", "open", "closed", "archived"]),
  consent_gate_text: optionalText,
  intro_content: optionalText,
  schedule_content: optionalText,
  registration_process_content: optionalText,
  fee_waiver_content: optionalText,
  rules_text: optionalText,
  privacy_consent_text: optionalText,
  submit_reminder_text: optionalText,
  success_message_text: optionalText,
  redirect_url: optionalText,
  redirect_label: optionalText,
  theme_color: optionalText,
});

export type SessionFormValues = z.infer<typeof sessionSchema>;

export const identityTypeSchema = z.object({
  name: z.string().min(1, "請輸入身分別名稱"),
  requires_org_field: z.boolean().default(false),
  org_options: z.array(z.string().min(1)).default([]),
  sort_order: z.coerce.number().int().default(0),
});

export type IdentityTypeFormValues = z.infer<typeof identityTypeSchema>;

export const feeCategorySchema = z.object({
  code: z.string().optional(),
  label: z.string().min(1, "請輸入類別名稱"),
  discount_amount: z.coerce.number().min(0).default(0),
  required_document_type: z.string().optional(),
  applies_to: z.enum(["免付費", "減免"]),
  auto_approve: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

export type FeeCategoryFormValues = z.infer<typeof feeCategorySchema>;

export const registrationCategorySchema = z.object({
  label: z.string().min(1, "請輸入報名類別名稱"),
  max_members: z.coerce.number().int().min(1).default(1),
  capacity_total: optionalInt,
  admission_quota: optionalInt,
  is_free: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

export type RegistrationCategoryFormValues = z.infer<typeof registrationCategorySchema>;
