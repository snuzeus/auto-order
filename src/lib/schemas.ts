import { z } from "zod";

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const orderItemDraftSchema = z.object({
  productId: z.string().uuid().optional(),
  barcode: z.string().min(1),
  productCode: z.string().optional(),
  productName: z.string().min(1),
  spec: z.string().default(""),
  supplierName: z.string().optional(),
  quantity: z.number().int().min(0),
  isUnregistered: z.boolean(),
  memo: z.string().optional(),
});

export const submitOrderSchema = z.object({
  branchId: z.string().uuid(),
  orderDate: ymdDateSchema,
  items: z.array(orderItemDraftSchema),
});

export const closeDateSchema = z.object({
  orderDate: ymdDateSchema,
});
