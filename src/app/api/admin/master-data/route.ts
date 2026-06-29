import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { adminMasterDataUpdateSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase/service";

type BranchRow = {
  id: string;
  code: string;
  name: string;
  delivery_address: string;
  recipient_name: string;
  phone: string;
  is_active: boolean;
};

type ProductSupplierRow = {
  supplier_name: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function mapBranch(row: BranchRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    deliveryAddress: row.delivery_address,
    recipientName: row.recipient_name,
    phone: row.phone,
    isActive: row.is_active,
  };
}

function mapSuppliers(rows: ProductSupplierRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const supplierName = row.supplier_name?.trim();

    if (!supplierName) {
      continue;
    }

    counts.set(supplierName, (counts.get(supplierName) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, productCount]) => ({ name, productCount }))
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

export async function GET() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  const supabase = createServiceClient();
  const [{ data: branches, error: branchesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, code, name, delivery_address, recipient_name, phone, is_active")
        .order("name", { ascending: true }),
      supabase.from("products").select("supplier_name").eq("is_active", true),
    ]);

  if (branchesError || productsError) {
    return jsonError("마스터 정보를 불러오지 못했습니다.", 500);
  }

  return NextResponse.json({
    branches: ((branches ?? []) as BranchRow[]).map(mapBranch),
    suppliers: mapSuppliers((products ?? []) as ProductSupplierRow[]),
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("요청 내용을 다시 확인해 주세요.", 400);
  }

  const parsed = adminMasterDataUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("입력값을 다시 확인해 주세요.", 400);
  }

  const supabase = createServiceClient();

  if (parsed.data.type === "branch") {
    const { error } = await supabase
      .from("branches")
      .update({
        code: parsed.data.code,
        name: parsed.data.name,
        delivery_address: parsed.data.deliveryAddress,
        recipient_name: parsed.data.recipientName,
        phone: parsed.data.phone,
        is_active: parsed.data.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id);

    if (error) {
      return jsonError(
        error.code === "23505" ? "이미 사용 중인 지사 코드입니다." : "지사 정보를 저장하지 못했습니다.",
        error.code === "23505" ? 409 : 500,
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (parsed.data.currentName === parsed.data.nextName) {
    return NextResponse.json({ ok: true, updatedCount: 0 });
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      supplier_name: parsed.data.nextName,
      updated_at: new Date().toISOString(),
    })
    .eq("supplier_name", parsed.data.currentName)
    .select("id");

  if (error) {
    return jsonError("납품처 정보를 저장하지 못했습니다.", 500);
  }

  return NextResponse.json({ ok: true, updatedCount: data?.length ?? 0 });
}
