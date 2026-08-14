// Hand-written to match supabase/migrations/*.sql. Once the project is linked to a
// real Supabase project, regenerate with:
//   npx supabase gen types typescript --linked > lib/db/types.ts
// and reconcile any drift.

import type { FieldGroup, PermissionLevel } from "@/lib/auth/permissions";

export type EventSeriesStatus = "draft" | "open" | "closed" | "archived";
export type EventSessionStatus = "draft" | "open" | "closed" | "archived";
export type ReviewStatus = "審核中" | "審核通過" | "退回補件";
export type AdmissionStatus = "未抽籤" | "正取" | "備取" | "取消";
export type PaymentStatus = "無需繳費" | "待繳費" | "已完成";
export type PaymentMethod = "online" | "manual";
export type RefundStatus = "待退" | "已退";
export type FeeReviewResult = "審核中" | "審核通過" | "需繳費" | "無需繳費";
export type FeeAppliesTo = "免付費" | "減免";
// No longer a closed literal union — roles are rows in admin_roles now, vendor
// created them freely. This is an opaque role id (uuid), not a role name.
export type AdminRole = string;
export type EmailType = "審核結果" | "付款通知" | "場次資訊" | "報到QR" | "遞補通知" | "報名確認";
export type EmailStatus = "pending" | "sent" | "failed";

export interface Database {
  public: {
    Tables: {
      event_series: {
        Row: {
          id: string;
          name: string;
          year: number;
          status: EventSeriesStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["event_series"]["Row"], "id" | "created_at" | "updated_at">> & {
          name: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["event_series"]["Insert"]>;
        Relationships: [];
      };
      event_sessions: {
        Row: {
          id: string;
          series_id: string;
          name: string;
          location: string | null;
          date_start: string | null;
          date_end: string | null;
          capacity_total: number | null;
          admission_quota: number | null;
          registration_open_at: string | null;
          registration_close_at: string | null;
          result_announce_at: string | null;
          cancel_deadline_at: string | null;
          fee_base: number;
          fee_discount_per_person: number;
          max_members_per_registration: number;
          managing_org: string | null;
          status: EventSessionStatus;
          banner_image_path: string | null;
          consent_gate_text: string | null;
          intro_content: string | null;
          schedule_content: string | null;
          registration_process_content: string | null;
          fee_waiver_content: string | null;
          rules_text: string | null;
          privacy_consent_text: string | null;
          submit_reminder_text: string | null;
          success_message_text: string | null;
          redirect_url: string | null;
          redirect_label: string | null;
          theme_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["event_sessions"]["Row"], "id" | "created_at" | "updated_at">> & {
          series_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_sessions"]["Insert"]>;
        Relationships: [];
      };
      session_identity_types: {
        Row: {
          id: string;
          session_id: string;
          name: string;
          requires_org_field: boolean;
          org_options: string[];
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["session_identity_types"]["Row"], "id" | "created_at">> & {
          session_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_identity_types"]["Insert"]>;
        Relationships: [];
      };
      session_fee_categories: {
        Row: {
          id: string;
          session_id: string;
          code: string | null;
          label: string;
          discount_amount: number;
          required_document_type: string | null;
          applies_to: FeeAppliesTo;
          auto_approve: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["session_fee_categories"]["Row"], "id" | "created_at">> & {
          session_id: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_fee_categories"]["Insert"]>;
        Relationships: [];
      };
      registrations: {
        Row: {
          id: string;
          session_id: string;
          contact_email: string;
          contact_phone: string;
          submitted_at: string;
          review_status: ReviewStatus;
          admission_status: AdmissionStatus;
          waitlist_rank: number | null;
          payment_status: PaymentStatus;
          payment_amount: number;
          payment_method: PaymentMethod | null;
          ecpay_trade_no: string | null;
          ecpay_link: string | null;
          ecpay_merchant_trade_no: string | null;
          manual_transfer_last5: string | null;
          manual_transfer_note: string | null;
          group_zone: string | null;
          group_number: string | null;
          tent_type: string | null;
          sleeping_bag_own_qty: number;
          sleeping_bag_rent_qty: number;
          is_cancelled: boolean;
          cancelled_at: string | null;
          cancel_reason: string | null;
          refund_amount: number | null;
          refund_status: RefundStatus | null;
          duplicate_flag: boolean;
          duplicate_note: string | null;
          checkin_at: string | null;
          checkin_by: string | null;
          qr_token: string;
          registration_seq: number;
          edit_token: string;
          admin_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // rows are created only via fn_submit_registration
        Update: Partial<
          Pick<
            Database["public"]["Tables"]["registrations"]["Row"],
            | "review_status"
            | "admission_status"
            | "waitlist_rank"
            | "payment_status"
            | "payment_amount"
            | "payment_method"
            | "ecpay_trade_no"
            | "ecpay_link"
            | "ecpay_merchant_trade_no"
            | "manual_transfer_last5"
            | "manual_transfer_note"
            | "group_zone"
            | "group_number"
            | "tent_type"
            | "sleeping_bag_own_qty"
            | "sleeping_bag_rent_qty"
            | "is_cancelled"
            | "cancelled_at"
            | "cancel_reason"
            | "refund_amount"
            | "refund_status"
            | "duplicate_flag"
            | "duplicate_note"
            | "admin_note"
          >
        >;
        Relationships: [];
      };
      registration_members: {
        Row: {
          id: string;
          registration_id: string;
          member_order: number;
          name: string;
          household_address: string | null;
          birth_year_roc: number | null;
          birth_month: number | null;
          birth_day: number | null;
          gender: string | null;
          identity_type_id: string | null;
          org_selected: string | null;
          org_other_text: string | null;
          fee_category_id: string | null;
          fee_review_result: FeeReviewResult;
          ocr_extracted_text: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: never; // rows are created only via fn_submit_registration
        Update: Partial<
          Pick<
            Database["public"]["Tables"]["registration_members"]["Row"],
            "identity_type_id" | "org_selected" | "org_other_text" | "fee_category_id" | "fee_review_result"
          >
        >;
        Relationships: [];
      };
      registration_files: {
        Row: {
          id: string;
          registration_id: string;
          member_id: string | null;
          file_type: string;
          storage_path: string;
          uploaded_at: string;
          ocr_status: string | null;
          ocr_result: Record<string, unknown> | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          role_id: string;
          managed_session_ids: string[];
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["admin_users"]["Row"], "created_at">> & {
          id: string;
          email: string;
          role_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      admin_roles: {
        Row: {
          id: string;
          key: string;
          label: string;
          is_system: boolean;
          created_at: string;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["admin_roles"]["Row"], "id" | "created_at">> & {
          key: string;
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_roles"]["Insert"]>;
        Relationships: [];
      };
      field_permission_matrix: {
        Row: {
          id: string;
          role_id: string;
          field_group: FieldGroup;
          permission: PermissionLevel;
        };
        Insert: Partial<Omit<Database["public"]["Tables"]["field_permission_matrix"]["Row"], "id">> & {
          role_id: string;
          field_group: FieldGroup;
        };
        Update: Partial<Database["public"]["Tables"]["field_permission_matrix"]["Insert"]>;
        Relationships: [];
      };
      email_logs: {
        Row: {
          id: string;
          registration_id: string;
          type: EmailType;
          status: EmailStatus;
          sent_at: string | null;
          error_message: string | null;
          subject: string | null;
          body: string | null;
          created_at: string;
        };
        // Only ever inserted via the service-role client (email batch job) — there's
        // no RLS INSERT policy for anon/authenticated, so this stays reachable from
        // TypeScript's perspective but is denied at the database layer for anyone else.
        Insert: Partial<Omit<Database["public"]["Tables"]["email_logs"]["Row"], "id" | "created_at">> & {
          registration_id: string;
          type: EmailType;
        };
        Update: never;
        Relationships: [];
      };
      duplicate_matches: {
        Row: {
          id: string;
          registration_id_a: string;
          registration_id_b: string;
          matched_by: string | null;
          diff_summary: Record<string, unknown> | null;
          resolved: boolean;
          resolved_note: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_submit_registration: {
        Args: { payload: Record<string, unknown> };
        Returns: { registration_id: string; registration_no: string; edit_token: string }[];
      };
      fn_get_registration_member_id_number: {
        Args: { p_member_id: string };
        Returns: string | null;
      };
      fn_get_registration_for_edit: {
        Args: { p_token: string };
        Returns: Record<string, unknown> | null;
      };
      fn_update_registration_via_token: {
        Args: { p_token: string; payload: Record<string, unknown> };
        Returns: undefined;
      };
      current_admin_role: {
        Args: Record<string, never>;
        Returns: AdminRole | null;
      };
      current_admin_role_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      field_permission: {
        Args: { p_field_group: FieldGroup };
        Returns: PermissionLevel;
      };
      current_field_permissions: {
        Args: Record<string, never>;
        Returns: { field_group: FieldGroup; permission: PermissionLevel }[];
      };
      current_admin_managed_sessions: {
        Args: Record<string, never>;
        Returns: string[] | null;
      };
    };
  };
}
