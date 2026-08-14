export function formatRegistrationNo(seq: number): string {
  return `R${String(seq).padStart(6, "0")}`;
}
