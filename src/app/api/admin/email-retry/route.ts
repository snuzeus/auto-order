import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { sendSupplierOrderEmails } from "@/lib/email/supplier-order-email";
import { supplierEmailRetrySchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return jsonError(admin.error, admin.status);

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("재발송 정보를 다시 확인해 주세요.", 400); }

  const parsed = supplierEmailRetrySchema.safeParse(body);
  if (!parsed.success) return jsonError("재발송 정보를 다시 확인해 주세요.", 400);

  const { orderDate, supplierName } = parsed.data;
  const supabase = createServiceClient();
  const { data: failedLog, error: failedLogError } = await supabase
    .from("supplier_email_logs").select("id").eq("order_date", orderDate)
    .eq("supplier_name", supplierName).eq("status", "failed").limit(1).maybeSingle();

  if (failedLogError) return jsonError("메일 발송 이력을 확인하지 못했습니다.", 500);
  if (!failedLog) return jsonError("재발송할 실패 이력이 없습니다.", 409);

  const { data: closedOrder, error: closedOrderError } = await supabase
    .from("orders").select("id").eq("order_date", orderDate)
    .eq("status", "closed").limit(1).maybeSingle();

  if (closedOrderError) return jsonError("마감 상태를 확인하지 못했습니다.", 500);
  if (!closedOrder) return jsonError("마감된 주문만 재발송할 수 있습니다.", 409);

  return NextResponse.json({
    emailResult: await sendSupplierOrderEmails(supabase, orderDate, { supplierName }),
  });
}
