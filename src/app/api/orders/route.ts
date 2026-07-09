import { NextRequest, NextResponse } from "next/server";

import { buildSubmitBranchOrderItems } from "@/lib/domain/branch-order-draft";
import { submitOrderSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import type { OrderItemDraft, OrderStatus } from "@/lib/types";

type OrderRow = {
  id: string;
  status: OrderStatus;
  branch_id: string;
  order_date: string;
  order_items?: OrderItemRow[] | null;
};

type OrderItemRow = {
  product_id: string | null;
  barcode: string;
  product_code: string | null;
  product_name: string;
  spec: string;
  supplier_name: string | null;
  products?: {
    unit_price: number | string | null;
    minimum_order_quantity: number | null;
  } | null;
  quantity: number;
  is_unregistered: boolean;
  memo: string | null;
};

type SubmitBranchOrderRpcRow = {
  order_id: string;
  status: OrderStatus;
  branch_id: string;
  order_date: string;
};

const ORDER_ERROR_MESSAGES = {
  invalidJson: "요청 본문은 올바른 JSON 형식이어야 합니다.",
  invalidInput: "주문 입력값이 올바르지 않습니다.",
  invalidItems: "주문 항목 형식이 올바르지 않습니다.",
  emptySubmittedItems: "수량이 0보다 큰 주문 항목을 하나 이상 입력해 주세요.",
  branchNotFound: "선택한 지점을 찾을 수 없습니다.",
  closedDate: "마감된 주문 날짜는 제출하거나 수정할 수 없습니다.",
  loadFailed: "주문 정보를 불러오지 못했습니다.",
  saveFailed: "주문 저장 중 오류가 발생했습니다.",
  saveResultMissing: "주문 저장 결과를 확인할 수 없습니다.",
  queryMissing: "지점과 주문일을 함께 보내 주세요.",
} as const;

const ORDER_RPC_ERRORS = {
  branchNotFound: "BRANCH_NOT_FOUND",
  closedDate: "ORDER_DATE_CLOSED",
  emptySubmittedItems: "ORDER_ITEMS_EMPTY",
  invalidItems: "ORDER_ITEMS_INVALID",
} as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mapOrderItem(row: OrderItemRow): OrderItemDraft {
  return {
    productId: row.product_id ?? undefined,
    barcode: row.barcode,
    productCode: row.product_code ?? undefined,
    productName: row.product_name,
    spec: row.spec,
    supplierName: row.supplier_name ?? undefined,
    unitPrice:
      row.products?.unit_price === null || row.products?.unit_price === undefined
        ? undefined
        : Number(row.products.unit_price),
    minimumOrderQuantity:
      row.products?.minimum_order_quantity === null ||
      row.products?.minimum_order_quantity === undefined
        ? undefined
        : row.products.minimum_order_quantity,
    quantity: row.quantity,
    isUnregistered: row.is_unregistered,
    memo: row.memo ?? undefined,
  };
}

function mapOrderRpcError(message: string | undefined): {
  message: string;
  status: number;
} {
  if (!message) {
    return {
      message: ORDER_ERROR_MESSAGES.saveFailed,
      status: 500,
    };
  }

  if (message.includes(ORDER_RPC_ERRORS.branchNotFound)) {
    return {
      message: ORDER_ERROR_MESSAGES.branchNotFound,
      status: 404,
    };
  }

  if (message.includes(ORDER_RPC_ERRORS.closedDate)) {
    return {
      message: ORDER_ERROR_MESSAGES.closedDate,
      status: 409,
    };
  }

  if (message.includes(ORDER_RPC_ERRORS.invalidItems)) {
    return {
      message: ORDER_ERROR_MESSAGES.invalidItems,
      status: 400,
    };
  }

  if (message.includes(ORDER_RPC_ERRORS.emptySubmittedItems)) {
    return {
      message: ORDER_ERROR_MESSAGES.emptySubmittedItems,
      status: 400,
    };
  }

  return {
    message: ORDER_ERROR_MESSAGES.saveFailed,
    status: 500,
  };
}

async function validateMinimumOrderQuantities(
  supabase: ReturnType<typeof createServiceClient>,
  items: OrderItemDraft[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const submittedItems = items.filter((item) => item.quantity > 0 && item.productId);
  const productIds = Array.from(new Set(submittedItems.map((item) => item.productId as string)));

  if (productIds.length === 0) {
    return { ok: true };
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, name, minimum_order_quantity")
    .in("id", productIds);

  if (error) {
    return { ok: false, message: ORDER_ERROR_MESSAGES.saveFailed };
  }

  const productsById = new Map(
    ((data ?? []) as Array<{
      id: string;
      name: string;
      minimum_order_quantity: number | null;
    }>).map((product) => [product.id, product]),
  );

  for (const item of submittedItems) {
    const product = productsById.get(item.productId as string);
    const minimumOrderQuantity = product?.minimum_order_quantity ?? null;

    if (minimumOrderQuantity && item.quantity < minimumOrderQuantity) {
      return {
        ok: false,
        message: `${product?.name ?? item.productName} 최소발주수량은 ${minimumOrderQuantity}개입니다.`,
      };
    }
  }

  return { ok: true };
}

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
  const orderDate = request.nextUrl.searchParams.get("orderDate")?.trim() ?? "";

  if (!branchId || !orderDate) {
    return jsonError(ORDER_ERROR_MESSAGES.queryMissing, 400);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, branch_id, order_date, order_items(product_id, barcode, product_code, product_name, spec, supplier_name, quantity, is_unregistered, memo, products(unit_price, minimum_order_quantity))",
    )
    .eq("branch_id", branchId)
    .eq("order_date", orderDate)
    .maybeSingle();

  if (error) {
    return jsonError(ORDER_ERROR_MESSAGES.loadFailed, 500);
  }

  const order = data as OrderRow | null;

  return NextResponse.json({
    order: order
      ? {
          id: order.id,
          status: order.status,
          branchId: order.branch_id,
          orderDate: order.order_date,
          items: (order.order_items ?? []).map(mapOrderItem),
        }
      : null,
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(ORDER_ERROR_MESSAGES.invalidJson, 400);
  }

  const parsed = submitOrderSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(ORDER_ERROR_MESSAGES.invalidInput, 400);
  }

  const { branchId, orderDate, items } = parsed.data;
  const submittedItems = items.filter((item) => item.quantity > 0);

  if (submittedItems.length === 0) {
    return jsonError(ORDER_ERROR_MESSAGES.emptySubmittedItems, 400);
  }

  const supabase = createServiceClient();
  const minimumQuantityValidation = await validateMinimumOrderQuantities(supabase, items);

  if (!minimumQuantityValidation.ok) {
    return jsonError(minimumQuantityValidation.message, 400);
  }

  const rpcItems = buildSubmitBranchOrderItems(items);
  const { data, error } = await supabase.rpc("submit_branch_order", {
    p_branch_id: branchId,
    p_order_date: orderDate,
    p_items: rpcItems,
  });

  if (error) {
    const mappedError = mapOrderRpcError(error.message);

    return jsonError(mappedError.message, mappedError.status);
  }

  const savedOrder = (Array.isArray(data) ? data[0] : data) as SubmitBranchOrderRpcRow | null;

  if (!savedOrder) {
    return jsonError(ORDER_ERROR_MESSAGES.saveResultMissing, 500);
  }

  return NextResponse.json({
    order: {
      id: savedOrder.order_id,
      status: savedOrder.status,
      branchId: savedOrder.branch_id,
      orderDate: savedOrder.order_date,
      items: submittedItems,
    },
  });
}
