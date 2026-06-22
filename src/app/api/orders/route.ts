import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branchId")?.trim() ?? "";
  const orderDate = request.nextUrl.searchParams.get("orderDate")?.trim() ?? "";

  if (!branchId || !orderDate) {
    return NextResponse.json(
      { error: "branchId and orderDate are required" },
      { status: 400 },
    );
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
  const parsed = submitOrderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { branchId, orderDate, items } = parsed.data;
  const submittedItems = items.filter((item) => item.quantity > 0);
  const supabase = createServiceClient();

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("is_active", true)
    .maybeSingle();

  if (branchError) {
    return NextResponse.json({ error: branchError.message }, { status: 500 });
  }

  if (!branch) {
    return NextResponse.json({ error: "선택한 지사를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("branch_id", branchId)
    .eq("order_date", orderDate)
    .maybeSingle();

  if (existingOrderError) {
    return NextResponse.json({ error: existingOrderError.message }, { status: 500 });
  }

  if (existingOrder?.status === "closed") {
    return NextResponse.json(
      { error: "이미 마감된 주문이라 수정할 수 없습니다." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const orderPayload = {
    branch_id: branchId,
    order_date: orderDate,
    status: "submitted" as const,
    submitted_at: now,
    updated_at: now,
  };

  const { data: savedOrder, error: upsertError } = await supabase
    .from("orders")
    .upsert(orderPayload, { onConflict: "branch_id,order_date" })
    .select("id, status, branch_id, order_date")
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const order = savedOrder as OrderRow;

  const { error: deleteError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", order.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (submittedItems.length > 0) {
    const itemRows = submittedItems.map((item) => ({
      order_id: order.id,
      product_id: item.productId ?? null,
      barcode: item.barcode,
      product_code: item.productCode ?? null,
      product_name: item.productName,
      spec: item.spec,
      supplier_name: item.supplierName ?? null,
      quantity: item.quantity,
      is_unregistered: item.isUnregistered,
      memo: item.memo ?? null,
    }));

    const { error: insertError } = await supabase.from("order_items").insert(itemRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: "submitted" as const,
      branchId: order.branch_id,
      orderDate: order.order_date,
      items: submittedItems,
    },
  });
}
