export type OrderStatus = "draft" | "submitted" | "closed";

export type Branch = {
  id: string;
  code: string;
  name: string;
};

export type Product = {
  id: string;
  barcode: string;
  productCode: string;
  name: string;
  spec: string;
  supplierName: string;
  unitPrice: number;
  minimumOrderQuantity?: number;
  isActive: boolean;
};

export type OrderItemProductSnapshot = {
  unitPrice?: number;
  minimumOrderQuantity?: number;
};

export type OrderItemDraft = OrderItemProductSnapshot & {
  productId?: string;
  barcode: string;
  productCode?: string;
  productName: string;
  spec: string;
  supplierName?: string;
  quantity: number;
  isUnregistered: boolean;
  memo?: string;
  orderDate?: string;
};

export type OrderTotals = {
  lineItemCount: number;
  totalQuantity: number;
  totalAmount: number;
};

export type BranchOrderStatus = {
  branchId: string;
  branchName: string;
  status: OrderStatus | "not_submitted";
  itemCount: number;
  totalQuantity: number;
  items: OrderItemDraft[];
};
