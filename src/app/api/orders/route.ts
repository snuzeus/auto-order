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
    quantity: row.quantity,
    isUnregistered: row.is_unregistered,
    memo: row.memo ?? undefined,
  };
}

function formatOrderApiError(message: string | undefined, fallback: string): string {
  if (!message) {
    return fallback;
  }

  if (
    message.includes("선택한 지사를 찾을 수 없습니다.") ||
    message.includes("이미 마감된 주문이라 수정할 수 없습니다.") ||
    message.includes("주문 항목 형식이 올바르지 않습니다.")
  ) {
    return message;
  }

  return fallback;
}

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
  const orderDate = request.nextUrl.searchParams.get("orderDate")?.trim() ?? "";

  if (!branchId || !orderDate) {
    return jsonError("지사와 주문일을 함께 보내 주세요.", 400);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, branch_id, order_date, order_items(product_id, barcode, product_code, product_name, spec, supplier_name, quantity, is_unregistered, memo)",
    )
    .eq("branch_id", branchId)
    .eq("order_date", orderDate)
    .maybeSingle();

  if (error) {
    return jsonError("주문 정보를 불러오지 못했습니다.", 500);
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

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("요청 본문이 올바른 JSON 형식이 아닙니다.", 400);
  }

  const parsed = submitOrderSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("주문 입력값이 올바르지 않습니다.", 400);
  }

  const { branchId, orderDate, items } = parsed.data;
  const submittedItems = items.filter((item) => item.quantity > 0);
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("submit_branch_order", {
    p_branch_id: branchId,
    p_order_date: orderDate,
    p_items: buildSubmitBranchOrderItems(items),
  });

  if (error) {
    const normalizedError = formatOrderApiError(
      error.message,
      "주문 저장 중 오류가 발생했습니다.",
    );

    if (normalizedError === "선택한 지사를 찾을 수 없습니다.") {
      return jsonError(normalizedError, 404);
    }

    if (normalizedError === "이미 마감된 주문이라 수정할 수 없습니다.") {
      return jsonError(normalizedError, 409);
    }

    if (normalizedError === "주문 항목 형식이 올바르지 않습니다.") {
      return jsonError(normalizedError, 400);
    }

    return jsonError(normalizedError, 500);
  }

  const savedOrder = (Array.isArray(data) ? data[0] : data) as SubmitBranchOrderRpcRow | null;

  if (!savedOrder) {
    return jsonError("주문 저장 결과를 확인할 수 없습니다.", 500);
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
