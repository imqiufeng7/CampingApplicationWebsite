// Shared between the client-side FileUploadField (instant feedback before any network
// call) and the signed-upload API route (the real, authoritative check) — kept in a
// plain lib file rather than exported from the route itself so this never risks
// pulling server-only route code into the client bundle.
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
