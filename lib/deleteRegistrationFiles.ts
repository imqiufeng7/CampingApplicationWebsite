import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

const BUCKET = "registration-files";

// registration_files rows cascade away automatically when a registration is deleted,
// but that only removes the DB *pointer* to the uploaded file — the actual blob (an ID
// photo, a certificate scan) stays in Supabase Storage forever unless removed
// explicitly. Call this with the registration id(s) *before* the DB delete happens
// (once the registration is gone, so are the registration_files rows that list which
// paths to remove). Best-effort: a storage removal failure is swallowed rather than
// blocking the caller, since the DB deletion is what actually gates data access.
export async function deleteRegistrationStorageFiles(
  admin: SupabaseClient<Database>,
  registrationIds: string[]
): Promise<void> {
  if (registrationIds.length === 0) return;

  const { data: files } = await admin
    .from("registration_files")
    .select("storage_path")
    .in("registration_id", registrationIds);

  const paths = (files ?? []).map((f) => f.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;

  await admin.storage.from(BUCKET).remove(paths);
}
