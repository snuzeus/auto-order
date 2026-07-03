export function normalizeSupplierName(value: string): string {
  return value.replaceAll("㈜", "(주)").replace(/\s+/g, " ").trim();
}
