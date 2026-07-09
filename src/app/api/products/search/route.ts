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
  minimum_order_quantity: number | string | null;
  is_active: boolean;
};

function escapeForIlike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function formatDashedBarcodePrefix(value: string): string | null {
  const digits = value.replaceAll(/\D/g, "");

  if (digits.length !== value.length || digits.length <= 3) {
    return null;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function buildCodeSearchFilter(query: string): string {
  const searchPrefixes = new Set([escapeForIlike(query)]);
  const dashedPrefix = formatDashedBarcodePrefix(query);

  if (dashedPrefix) {
    searchPrefixes.add(escapeForIlike(dashedPrefix));
  }

  return Array.from(searchPrefixes)
    .flatMap((prefix) => [`barcode.ilike.${prefix}%`, `product_code.ilike.${prefix}%`])
    .join(",");
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
    minimumOrderQuantity:
      row.minimum_order_quantity === null || row.minimum_order_quantity === undefined
        ? undefined
        : Number(row.minimum_order_quantity),
    isActive: row.is_active,
  };
}

function searchError() {
  return NextResponse.json(
    { error: "상품 검색 중 오류가 발생했습니다." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ products: [] });
  }

  const supabase = createServiceClient();
  const results = new Map<string, Product>();
  const selectColumns =
    "id, barcode, product_code, name, spec, supplier_name, unit_price, minimum_order_quantity, is_active";

  const { data: exactMatches, error: barcodeError } = await supabase
    .from("products")
    .select(selectColumns)
    .eq("is_active", true)
    .eq("barcode", query)
    .order("name", { ascending: true })
    .limit(10);

  if (barcodeError) {
    return searchError();
  }

  for (const row of exactMatches ?? []) {
    const product = mapProduct(row as ProductRow);
    results.set(product.id, product);
  }

  const escapedQuery = escapeForIlike(query);

  const { data: codeMatches, error: codeError } = await supabase
    .from("products")
    .select(selectColumns)
    .eq("is_active", true)
    .or(buildCodeSearchFilter(query))
    .order("name", { ascending: true })
    .limit(20);

  if (codeError) {
    return searchError();
  }

  for (const row of codeMatches ?? []) {
    const product = mapProduct(row as ProductRow);
    results.set(product.id, product);
  }

  const { data: nameMatches, error: nameError } = await supabase
    .from("products")
    .select(selectColumns)
    .eq("is_active", true)
    .ilike("name", `%${escapedQuery}%`)
    .order("name", { ascending: true })
    .limit(20);

  if (nameError) {
    return searchError();
  }

  for (const row of nameMatches ?? []) {
    const product = mapProduct(row as ProductRow);
    results.set(product.id, product);
  }

  return NextResponse.json({ products: Array.from(results.values()) });
}
