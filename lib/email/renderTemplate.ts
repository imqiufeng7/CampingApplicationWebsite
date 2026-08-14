// Same {{placeholder}} substitution convention as ConsentGate's renderGateText —
// used to fill vendor-editable email template text with system-computed values
// (member lists, links, payment blocks) at send time.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
