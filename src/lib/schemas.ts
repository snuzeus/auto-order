import { z } from "zod";

function isValidYmdDate(value: string): boolean {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(value);

  if (!match?.groups) {
    return false;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);

  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10) === value;
}

const requiredTrimmedText = (fieldName: string) =>
  z.string().trim().min(1, { message: `${fieldName} is required` });

const optionalTrimmedText = () =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const ymdDateSchema = z
  .string()
  .refine(isValidYmdDate, { message: "Invalid calendar date" });

export const orderItemDraftSchema = z.object({
  productId: z.string().uuid().optional(),
  barcode: requiredTrimmedText("barcode"),
  productCode: optionalTrimmedText(),
  productName: requiredTrimmedText("productName"),
  spec: z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? ""),
  supplierName: optionalTrimmedText(),
  quantity: z.number().int().min(0),
  isUnregistered: z.boolean(),
  memo: optionalTrimmedText(),
});

export const submitOrderSchema = z.object({
  branchId: z.string().uuid(),
  orderDate: ymdDateSchema,
  items: z.array(orderItemDraftSchema),
});

export const closeDateSchema = z.object({
  orderDate: ymdDateSchema,
});
