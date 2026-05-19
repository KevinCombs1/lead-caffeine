const TOLL_FREE_CODES = new Set(["800", "833", "844", "855", "866", "877", "888"]);

export function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length !== 14) return null;
  const areaCode = phone.replace(/^\(/, "").slice(0, 3);
  if (TOLL_FREE_CODES.has(areaCode)) return null;
  return phone;
}
