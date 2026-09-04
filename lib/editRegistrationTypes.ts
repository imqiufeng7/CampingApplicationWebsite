// Shape returned by the fn_get_registration_for_edit RPC (see
// supabase/migrations/*_edit_token_functions.sql) — kept separate from lib/db/types.ts
// since it's a jsonb payload, not a table row.
export interface EditRegistrationMemberData {
  member_id: string;
  member_order: number;
  name: string;
  id_number: string | null;
  household_address: string | null;
  birth_year_roc: number | null;
  birth_month: number | null;
  birth_day: number | null;
  gender: string | null;
  meal_diet: string | null;
  identity_type_id: string | null;
  org_selected: string | null;
  org_other_text: string | null;
  fee_category_id: string | null;
  files: { id: string; file_type: string; storage_path: string }[];
}

export interface EditRegistrationData {
  registration_id: string;
  session_id: string;
  registration_category_id: string | null;
  registration_no: string;
  contact_email: string;
  contact_phone: string;
  is_cancelled: boolean;
  payment_status: string;
  admission_status: string;
  remaining_self_edits: number;
  members: EditRegistrationMemberData[];
}
