import { z } from "zod";
import type { Database } from "@/lib/db/types";

type IdentityType = Database["public"]["Tables"]["session_identity_types"]["Row"];
type FeeCategory = Database["public"]["Tables"]["session_fee_categories"]["Row"];

export interface SessionFormConfig {
  maxMembers: number;
  identityTypes: IdentityType[];
  feeCategories: FeeCategory[];
}

const fileRefSchema = z.object({
  file_type: z.string(),
  storage_path: z.string(),
});

export type FileRef = z.infer<typeof fileRefSchema>;

// Built at render time (not a static top-level schema) because required fields are
// entirely driven by session data: which identity types exist, whether each requires
// an org field, which fee categories require a document, and the member count cap.
export function buildRegistrationSchema(config: SessionFormConfig) {
  const memberSchema = z
    .object({
      name: z.string().min(1, "請填寫姓名"),
      id_number: z
        .string()
        .min(1, "請填寫身分證字號")
        .regex(/^[A-Za-z][12]\d{8}$/, "身分證字號格式錯誤"),
      household_address: z.string().min(1, "請填寫戶籍地址"),
      birth_year_roc: z.coerce.number("請填寫出生年（民國）").int().min(1, "請填寫出生年（民國）"),
      birth_month: z.coerce
        .number("請填寫出生月份")
        .int()
        .min(1, "月份需為 01-12")
        .max(12, "月份需為 01-12"),
      birth_day: z.coerce
        .number("請填寫出生日期")
        .int()
        .min(1, "日期需為 01-31")
        .max(31, "日期需為 01-31"),
      gender: z.enum(["男", "女", "跨性別"], "請選擇生理性別"),
      // Replaces a standalone "身分別" picker: identity_type_id (which drives the
      // 所屬單位 field) is derived from this checkbox in RegistrationForm's onSubmit,
      // not chosen directly — most sessions only distinguish 工作人員 vs 民眾, and
      // showing that as its own unexplained dropdown confused registrants.
      is_staff: z.boolean().default(false),
      org_selected: z.string().optional(),
      org_other_text: z.string().optional(),
      fee_category_id: z.string().optional(),
      files: z.array(fileRefSchema).default([]),
    })
    .superRefine((member, ctx) => {
      if (member.is_staff) {
        if (!member.org_selected) {
          ctx.addIssue({ code: "custom", message: "請選擇所屬單位", path: ["org_selected"] });
        } else if (member.org_selected === "民間團體" && !member.org_other_text?.trim()) {
          ctx.addIssue({ code: "custom", message: "請填寫團體全名", path: ["org_other_text"] });
        }
      }

      const feeCategory = config.feeCategories.find((fc) => fc.id === member.fee_category_id);
      if (feeCategory?.required_document_type) {
        const hasDoc = member.files.some((f) => f.file_type === feeCategory.required_document_type);
        if (!hasDoc) {
          ctx.addIssue({
            code: "custom",
            message: `請上傳${feeCategory.required_document_type}`,
            path: ["files"],
          });
        }
      }
    });

  return z.object({
    contact_email: z.email("請輸入有效的 Email"),
    contact_phone: z.string().min(1, "請填寫聯絡電話"),
    members: z
      .array(memberSchema)
      .min(1, "至少需要一位成員")
      .max(config.maxMembers, `此場次每筆報名最多 ${config.maxMembers} 人`),
    // z.boolean().refine() (not z.literal(true)) so the field can hold `false` while
    // the checkbox is unchecked — a literal(true) schema's input type would be `true`
    // only, which can't model an unchecked checkbox's runtime state.
    agree_rules: z.boolean().refine((v) => v === true, "請詳讀並勾選已同意活動辦法/注意事項"),
    agree_privacy: z.boolean().refine((v) => v === true, "請勾選同意個資蒐集告知事項"),
  });
}

export type RegistrationSchema = ReturnType<typeof buildRegistrationSchema>;
// What react-hook-form actually holds while the user is editing (pre-parse: e.g.
// birth_year_roc as whatever the number input produced, agree_* as plain booleans).
export type RegistrationFormInput = z.input<RegistrationSchema>;
// What onSubmit receives after zodResolver has parsed/coerced the input.
export type RegistrationFormOutput = z.output<RegistrationSchema>;

// Given a member's is_staff flag, which session_identity_types row it maps to. Most
// sessions define exactly one identity type that requires an org field (工作人員) and
// one that doesn't (民眾); this picks the first match of each.
export function resolveIdentityTypeId(
  isStaff: boolean,
  identityTypes: IdentityType[]
): string | null {
  const match = isStaff
    ? identityTypes.find((it) => it.requires_org_field)
    : (identityTypes.find((it) => !it.requires_org_field) ?? identityTypes[0]);
  return match?.id ?? null;
}

export function emptyMember(): RegistrationFormInput["members"][number] {
  return {
    name: "",
    id_number: "",
    household_address: "",
    birth_year_roc: "" as unknown as number,
    birth_month: "" as unknown as number,
    birth_day: "" as unknown as number,
    gender: "" as unknown as "男" | "女" | "跨性別",
    is_staff: false,
    org_selected: "",
    org_other_text: "",
    fee_category_id: "",
    files: [],
  };
}
