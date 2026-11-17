import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { sendSupplierOrderEmails } from "@/lib/email/supplier-order-email";
import { supplierEmailRetrySchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

// 납품처별 메일을 순차 발송하므로 기본 실행 시간(짧은 플랜은 10초)을 넘길 수 있다.
export const maxDuration = 60;

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
  const { data: closingBatch, error: closingBatchError } = await supabase
    .from("closing_batches").select("id").eq("order_date", orderDate)
    .eq("status", "closed").maybeSingle();

  if (closingBatchError) return jsonError("마감 묶음을 확인하지 못했습니다.", 500);
  if (!closingBatch) return jsonError("재발송할 마감 묶음이 없습니다.", 409);

  const { data: failedLog, error: failedLogError } = await supabase
    .from("supplier_email_logs").select("id, created_at").eq("closing_batch_id", closingBatch.id)
    .eq("supplier_name", supplierName).eq("status", "failed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (failedLogError) return jsonError("메일 발송 이력을 확인하지 못했습니다.", 500);
  if (!failedLog) return jsonError("재발송할 실패 이력이 없습니다.", 409);

  // 실패 이후 이미 발송에 성공했다면 같은 발주서를 중복으로 보내지 않는다.
  const { data: sentAfterFailure, error: sentAfterFailureError } = await supabase
    .from("supplier_email_logs").select("id").eq("closing_batch_id", closingBatch.id)
    .eq("supplier_name", supplierName).eq("status", "sent")
    .gt("created_at", failedLog.created_at).limit(1).maybeSingle();

  if (sentAfterFailureError) return jsonError("메일 발송 이력을 확인하지 못했습니다.", 500);
  if (sentAfterFailure) return jsonError("이미 재발송에 성공한 납품처입니다.", 409);

  const { data: closedOrder, error: closedOrderError } = await supabase
    .from("orders").select("id").eq("closing_batch_id", closingBatch.id)
    .eq("status", "closed").limit(1).maybeSingle();

  if (closedOrderError) return jsonError("마감 상태를 확인하지 못했습니다.", 500);
  if (!closedOrder) return jsonError("마감된 주문만 재발송할 수 있습니다.", 409);

  return NextResponse.json({
    emailResult: await sendSupplierOrderEmails(
      supabase,
      closingBatch.id,
      orderDate,
      { supplierName },
    ),
  });
}
