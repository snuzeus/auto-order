import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireAdmin } from "@/lib/auth/admin";
import {
  getMissingRequiredProductMasterHeaders,
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
  minimum_order_quantity: number | null;
  is_active: true;
};

type ParsedProductSheet = {
  sheetName: string;
  headers: string[];
  missingHeaders: string[];
  rows: Array<{ rowNumber: number; rowObject: Record<string, unknown> }>;
};

type SheetRow = unknown[];

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const PRODUCT_MASTER_REQUIRED_HEADER_HELP =
  "필수 열: 상품코드, 상품명. 사용 가능한 열 이름 예: 바코드 번호/바코드, 상품코드, 상품명, 납품 거래처명, 공급가, 최소발주수량";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function summarizeHeaders(headers: string[]): string {
  const visibleHeaders = headers.filter(Boolean);

  if (visibleHeaders.length === 0) {
    return "읽힌 열 없음";
  }

  return visibleHeaders.slice(0, 20).join(", ");
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

function isSupportedExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();

  return name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls");
}

function isLegacyExcelFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".xls");
}

function readHeaderNamesAtRow(worksheet: ExcelJS.Worksheet, rowNumber: number): string[] {
  const headerRow = worksheet.getRow(rowNumber);
  const columnCount = Math.max(headerRow.cellCount, headerRow.actualCellCount);

  return Array.from({ length: columnCount }, (_, index) =>
    getCellText(headerRow.getCell(index + 1).value),
  );
}

function findProductMasterHeader(worksheet: ExcelJS.Worksheet): {
  headers: string[];
  headerRowNumber: number;
  missingHeaders: string[];
} {
  let fallbackHeaders = readHeaderNamesAtRow(worksheet, 1);
  let fallbackMissingHeaders = getMissingRequiredProductMasterHeaders(fallbackHeaders);
  let fallbackHeaderRowNumber = 1;

  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const headers = readHeaderNamesAtRow(worksheet, rowNumber);
    const missingHeaders = getMissingRequiredProductMasterHeaders(headers);

    if (missingHeaders.length < fallbackMissingHeaders.length) {
      fallbackHeaders = headers;
      fallbackMissingHeaders = missingHeaders;
      fallbackHeaderRowNumber = rowNumber;
    }

    if (missingHeaders.length === 0) {
      return {
        headers,
        headerRowNumber: rowNumber,
        missingHeaders,
      };
    }
  }

  return {
    headers: fallbackHeaders,
    headerRowNumber: fallbackHeaderRowNumber,
    missingHeaders: fallbackMissingHeaders,
  };
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

function findProductMasterHeaderInRows(rows: SheetRow[]): {
  headers: string[];
  headerRowNumber: number;
  missingHeaders: string[];
} {
  let fallbackHeaders = rows[0]?.map((value) => getCellText(value)) ?? [];
  let fallbackMissingHeaders = getMissingRequiredProductMasterHeaders(fallbackHeaders);
  let fallbackHeaderRowNumber = 1;

  for (let rowIndex = 0; rowIndex < Math.min(10, rows.length); rowIndex += 1) {
    const headers = rows[rowIndex]?.map((value) => getCellText(value)) ?? [];
    const missingHeaders = getMissingRequiredProductMasterHeaders(headers);

    if (missingHeaders.length < fallbackMissingHeaders.length) {
      fallbackHeaders = headers;
      fallbackMissingHeaders = missingHeaders;
      fallbackHeaderRowNumber = rowIndex + 1;
    }

    if (missingHeaders.length === 0) {
      return {
        headers,
        headerRowNumber: rowIndex + 1,
        missingHeaders,
      };
    }
  }

  return {
    headers: fallbackHeaders,
    headerRowNumber: fallbackHeaderRowNumber,
    missingHeaders: fallbackMissingHeaders,
  };
}

function buildRowObjectFromSheetRow(
  headers: string[],
  row: SheetRow | undefined,
): Record<string, unknown> {
  return headers.reduce<Record<string, unknown>>((record, header, index) => {
    if (!header) {
      return record;
    }

    record[header] = getCellText(row?.[index]);
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
    minimum_order_quantity: row.minimumOrderQuantity,
    is_active: true,
  };
}

function missingRequiredProductValues(row: Record<string, unknown>): string[] {
  const missing: string[] = [];

  if (!getCellText(row["상품코드"]) && !getCellText(row["바코드 번호"]) && !getCellText(row["바코드"])) {
    missing.push("상품코드");
  }

  if (!getCellText(row["상품명"])) {
    missing.push("상품명");
  }

  return missing;
}

async function parseOpenXmlProductSheet(buffer: Buffer): Promise<ParsedProductSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
  );

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return {
      sheetName: "",
      headers: [],
      missingHeaders: getMissingRequiredProductMasterHeaders([]),
      rows: [],
    };
  }

  const { headers, headerRowNumber, missingHeaders } = findProductMasterHeader(worksheet);
  const rows = Array.from({ length: worksheet.rowCount - headerRowNumber }, (_, index) => {
    const rowNumber = headerRowNumber + index + 1;

    return {
      rowNumber,
      rowObject: buildRowObject(headers, worksheet.getRow(rowNumber)),
    };
  });

  return {
    sheetName: worksheet.name || "Sheet1",
    headers,
    missingHeaders,
    rows,
  };
}

function parseLegacyProductSheet(buffer: Buffer): ParsedProductSheet {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0] ?? "";
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!worksheet) {
    return {
      sheetName: "",
      headers: [],
      missingHeaders: getMissingRequiredProductMasterHeaders([]),
      rows: [],
    };
  }

  const sheetRows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  const { headers, headerRowNumber, missingHeaders } = findProductMasterHeaderInRows(sheetRows);
  const rows = sheetRows.slice(headerRowNumber).map((row, index) => ({
    rowNumber: headerRowNumber + index + 1,
    rowObject: buildRowObjectFromSheetRow(headers, row),
  }));

  return {
    sheetName,
    headers,
    missingHeaders,
    rows,
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

  if (!isSupportedExcelFile(file)) {
    return jsonError("엑셀 파일(.xlsx, .xlsm, .xls)만 업로드할 수 있습니다.", 400);
  }

  if (file.size <= 0) {
    return jsonError("비어 있는 엑셀 파일은 업로드할 수 없습니다.", 400);
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return jsonError("엑셀 파일은 5MB 이하만 업로드할 수 있습니다.", 400);
  }

  let parsedSheet: ParsedProductSheet;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsedSheet = isLegacyExcelFile(file)
      ? parseLegacyProductSheet(buffer)
      : await parseOpenXmlProductSheet(buffer);
  } catch {
    return jsonError(
      "엑셀 파일을 읽을 수 없습니다. 계속 실패하면 파일을 .xlsx로 다시 저장해서 업로드해 주세요.",
      400,
    );
  }

  if (!parsedSheet.sheetName) {
    return jsonError("엑셀 시트를 찾을 수 없습니다.", 400);
  }

  if (parsedSheet.missingHeaders.length > 0) {
    return jsonError(
      [
        `상품마스터 필수 열을 찾지 못했습니다: ${parsedSheet.missingHeaders.join(", ")}`,
        `시트: ${parsedSheet.sheetName || "-"}`,
        PRODUCT_MASTER_REQUIRED_HEADER_HELP,
        `현재 읽힌 열: ${summarizeHeaders(parsedSheet.headers)}`,
        "엑셀 상단 10행 안에 헤더 행이 있어야 합니다.",
      ].join(" / "),
      400,
    );
  }

  const validationErrors: UploadValidationError[] = [];
  const rowsToUpsert: ProductUpsertRow[] = [];
  const seenBarcodes = new Map<string, number>();
  let totalRows = 0;
  let skippedRows = 0;

  for (const { rowNumber, rowObject } of parsedSheet.rows) {
    if (isEmptyProductMasterRow(rowObject)) {
      skippedRows += 1;
      continue;
    }

    totalRows += 1;

    try {
      const missingValues = missingRequiredProductValues(rowObject);

      if (missingValues.length > 0) {
        validationErrors.push({
          rowNumber,
          reason: `필수 값이 비어 있습니다: ${missingValues.join(", ")}. 해당 행의 ${missingValues.join(", ")} 열을 채워 주세요.`,
        });
        continue;
      }

      const normalizedRow = normalizeProductMasterRow(rowObject);

      const duplicateRowNumber = seenBarcodes.get(normalizedRow.barcode);

      if (duplicateRowNumber) {
        validationErrors.push({
          rowNumber,
          reason: `중복된 바코드 번호입니다. ${duplicateRowNumber}행과 같은 값입니다.`,
        });
        continue;
      }

      seenBarcodes.set(normalizedRow.barcode, rowNumber);
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
  const { error: clearOrderItemProductsError } = await supabase
    .from("order_items")
    .update({ product_id: null })
    .not("product_id", "is", null);

  if (clearOrderItemProductsError) {
    return jsonError("상품 마스터 저장 중 기존 주문 상품 연결 정리에 실패했습니다.", 500);
  }

  const { error: deleteProductsError } = await supabase
    .from("products")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteProductsError) {
    return jsonError("상품 마스터 저장 중 기존 상품 정리에 실패했습니다.", 500);
  }

  const { error } = await supabase.from("products").upsert(rowsToUpsert, {
    onConflict: "barcode",
  });

  if (error) {
    return jsonError("상품 마스터 저장 중 오류가 발생했습니다.", 500);
  }

  const supplierRows = Array.from(
    new Set(rowsToUpsert.map((row) => row.supplier_name.trim()).filter(Boolean)),
  ).map((name) => ({
    name,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  if (supplierRows.length > 0) {
    await supabase.from("supplier_directory").upsert(supplierRows, {
      onConflict: "name",
    });
  }

  return NextResponse.json({
    importedCount: rowsToUpsert.length,
    report: {
      sheetName: parsedSheet.sheetName,
      totalRows,
      importedRows: rowsToUpsert.length,
      skippedRows,
      replacedExisting: true,
    },
  });
}
