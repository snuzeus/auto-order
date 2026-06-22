export type OrderStatus = "draft" | "submitted" | "closed";

export type Branch = {
  id: string;
  code: string;
  name: string;
  deliveryAddress: string;
  recipientName: string;
  phone: string;
  isActive: boolean;
};

export type Product = {
  id: string;
  barcode: string;
  productCode: string;
  name: string;
  spec: string;
  supplierName: string;
  unitPrice: number;
  isActive: boolean;
};

export type OrderItemDraft = {
  productId?: string;
  barcode: string;
  productCode?: string;
  productName: string;
  spec: string;
  supplierName?: string;
  quantity: number;
  isUnregistered: boolean;
  memo?: string;
};

export type OrderTotals = {
  lineItemCount: number;
  totalQuantity: number;
  unregisteredItemCount: number;
};

export type BranchOrderStatus = {
  branchId: string;
  branchName: string;
  status: OrderStatus | "not_submitted";
  itemCount: number;
  totalQuantity: number;
};
