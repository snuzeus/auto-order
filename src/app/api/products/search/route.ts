import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import type { Product } from "@/lib/types";

type ProductRow = {
  id: string;
  barcode: string;
  product_code: string;
  name: string;
  spec: string;
  supplier_name: string;
  unit_price: number | string;
  is_active: boolean;
};

function escapeForIlike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    productCode: row.product_code,
    name: row.name,
    spec: row.spec,
    supplierName: row.supplier_name,
    unitPrice: Number(row.unit_price),
    isActive: row.is_active,
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ products: [] });
  }

  const supabase = createServiceClient();
  const results = new Map<string, Product>();

  const { data: exactMatches, error: barcodeError } = await supabase
    .from("products")
    .select("id, barcode, product_code, name, spec, supplier_name, unit_price, is_active")
    .eq("is_active", true)
    .eq("barcode", query)
    .order("name", { ascending: true })
    .limit(10);

  if (barcodeError) {
    return NextResponse.json(
      { error: "상품 검색 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  for (const row of exactMatches ?? []) {
    const product = mapProduct(row as ProductRow);
    results.set(product.id, product);
  }

  const { data: nameMatches, error: nameError } = await supabase
    .from("products")
    .select("id, barcode, product_code, name, spec, supplier_name, unit_price, is_active")
    .eq("is_active", true)
    .ilike("name", `%${escapeForIlike(query)}%`)
    .order("name", { ascending: true })
    .limit(20);

  if (nameError) {
    return NextResponse.json(
      { error: "상품 검색 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  for (const row of nameMatches ?? []) {
    const product = mapProduct(row as ProductRow);
    results.set(product.id, product);
  }

  return NextResponse.json({ products: Array.from(results.values()) });
}
