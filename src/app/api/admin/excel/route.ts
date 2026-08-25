import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { createSupplierZip, type SupplierExcelRow } from "@/lib/excel/supplier-files";
import { closeDateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

type BranchInfoRow = {
  name: string | null;
  delivery_address: string | null;
  phone: string | null;
};

type OrderItemRow = {
  product_code: string | null;
  product_name: string;
  spec: string | null;
  supplier_name: string | null;
  quantity: number | null;
};

type ClosedOrderRow = {
  order_date: string;
  branches: BranchInfoRow | BranchInfoRow[] | null;
  order_items: OrderItemRow[] | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mapSupplierRows(orders: ClosedOrderRow[]): SupplierExcelRow[] {
  return orders.flatMap((order) => {
    const branch = Array.isArray(order.branches) ? order.branches[0] : order.branches;
    const branchName = branch?.name?.trim() ?? "";
    const address = branch?.delivery_address?.trim() ?? "";
    const phone = branch?.phone?.trim() ?? "";

    return (order.order_items ?? [])
      .filter((item) => (item.quantity ?? 0) > 0)
      .map((item) => ({
        supplierName: item.supplier_name?.trim() ?? "",
        orderDate: order.order_date,
        branchName,
        address,
        phone,
        productCode: item.product_code?.trim() ?? "",
        productName: item.product_name,
        spec: item.spec ?? "",
        quantity: item.quantity ?? 0,
      }))
      .filter((row) => row.supplierName.length > 0);
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  const orderDate = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  const parsed = closeDateSchema.safeParse({ orderDate });

  if (!parsed.success) {
    return jsonError("다운로드 날짜를 다시 확인해 주세요.", 400);
  }

  const supabase = createServiceClient();
  const { data: closingBatch, error: closingBatchError } = await supabase
    .from("closing_batches")
    .select("id")
    .eq("order_date", parsed.data.orderDate)
    .eq("status", "closed")
    .maybeSingle();

  if (closingBatchError) {
    return jsonError("마감 묶음을 확인하지 못했습니다.", 500);
  }

  if (!closingBatch) {
    return jsonError("다운로드할 마감 묶음이 없습니다.", 404);
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_date, branches(name, delivery_address, phone), order_items(product_code, product_name, spec, supplier_name, quantity)",
    )
    .eq("closing_batch_id", closingBatch.id)
    .eq("status", "closed");

  if (error) {
    return jsonError("납품처 주문 데이터를 불러오지 못했습니다.", 500);
  }

  const rows = mapSupplierRows((data ?? []) as ClosedOrderRow[]);

  if (rows.length === 0) {
    return jsonError("다운로드할 납품처 주문이 없습니다.", 404);
  }

  try {
    const zip = await createSupplierZip(rows, parsed.data.orderDate);
    const body = Uint8Array.from(zip).buffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="supplier-orders-${parsed.data.orderDate}.zip"`,
      },
    });
  } catch {
    return jsonError("납품처 ZIP 파일을 생성하지 못했습니다.", 500);
  }
}
