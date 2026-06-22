import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import {
  isEmptyProductMasterRow,
  normalizeProductMasterRow,
  type ProductMasterUploadRow,
} from "@/lib/domain/product-master";
import { createServiceClient } from "@/lib/supabase/service";

type UploadValidationError = {
  rowNumber: number;
  reason: string;
};

type ProductUpsertRow = {
  barcode: string;
  product_code: string;
  name: string;
  spec: string;
  supplier_name: string;
  unit_price: number;
  is_active: true;
};

const PRODUCT_MASTER_HEADERS = [
  "바코드 번호",
  "상품코드",
  "상품명",
  "규격",
  "납품 거래처명",
  "단가",
] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString().trim();
  }

  if (typeof value === "object") {
    const richValue = value as {
      richText?: Array<{ text?: string }>;
      text?: string;
      result?: unknown;
      hyperlink?: string;
    };

    if (Array.isArray(richValue.richText)) {
      return richValue.richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }

    if (typeof richValue.text === "string") {
      return richValue.text.trim();
    }

    if ("result" in richValue) {
      return getCellText(richValue.result);
    }

    if (typeof richValue.hyperlink === "string") {
      return richValue.hyperlink.trim();
    }
  }

  return String(value).trim();
}

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();

  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xlsm") ||
    name.endsWith(".xls")
  );
}

function readHeaderNames(worksheet: ExcelJS.Worksheet): string[] {
  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(headerRow.cellCount, headerRow.actualCellCount);

  return Array.from({ length: columnCount }, (_, index) =>
    getCellText(headerRow.getCell(index + 1).value),
  );
}

function buildRowObject(headers: string[], row: ExcelJS.Row): Record<string, unknown> {
  return headers.reduce<Record<string, unknown>>((record, header, index) => {
    if (!header) {
      return record;
    }

    record[header] = row.getCell(index + 1).value;
    return record;
  }, {});
}

function mapProductRow(row: ProductMasterUploadRow): ProductUpsertRow {
  return {
    barcode: row.barcode,
    product_code: row.productCode,
    name: row.name,
    spec: row.spec,
    supplier_name: row.supplierName,
    unit_price: row.unitPrice,
    is_active: true,
  };
}

export async function POST(request: Request) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError("업로드 파일을 다시 확인해 주세요.", 400);
  }

  const file = formData.get("file");

  if (!(file instanceof File) || !file.name) {
    return jsonError("업로드할 엑셀 파일을 선택해 주세요.", 400);
  }

  if (!isExcelFile(file)) {
    return jsonError("엑셀 파일(.xlsx)만 업로드할 수 있습니다.", 400);
  }

  const workbook = new ExcelJS.Workbook();

  try {
    const buffer = (await file.arrayBuffer()) as unknown as Parameters<
      ExcelJS.Workbook["xlsx"]["load"]
    >[0];
    await workbook.xlsx.load(buffer);
  } catch {
    return jsonError("엑셀 파일을 읽을 수 없습니다.", 400);
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return jsonError("엑셀 시트를 찾을 수 없습니다.", 400);
  }

  const headers = readHeaderNames(worksheet);
  const hasKnownHeader = PRODUCT_MASTER_HEADERS.some((header) => headers.includes(header));

  if (!hasKnownHeader) {
    return jsonError("엑셀 헤더를 다시 확인해 주세요.", 400);
  }

  const validationErrors: UploadValidationError[] = [];
  const rowsToUpsert: ProductUpsertRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const rowObject = buildRowObject(headers, worksheetRow);

    if (isEmptyProductMasterRow(rowObject)) {
      continue;
    }

    try {
      const normalizedRow = normalizeProductMasterRow(rowObject);
      rowsToUpsert.push(mapProductRow(normalizedRow));
    } catch (error) {
      validationErrors.push({
        rowNumber,
        reason: error instanceof Error ? error.message : "행 데이터를 확인해 주세요.",
      });
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "행별 오류를 확인해 주세요.", errors: validationErrors },
      { status: 400 },
    );
  }

  if (rowsToUpsert.length === 0) {
    return jsonError("업로드할 상품 데이터가 없습니다.", 400);
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("products").upsert(rowsToUpsert, {
    onConflict: "barcode",
  });

  if (error) {
    return jsonError("상품 마스터 저장 중 오류가 발생했습니다.", 500);
  }

  return NextResponse.json({ importedCount: rowsToUpsert.length });
}
