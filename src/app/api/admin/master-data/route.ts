import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { requireAdmin } from "@/lib/auth/admin";
import { normalizeSupplierName } from "@/lib/domain/supplier-name";
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
  business_registration_number: string | null;
  business_type: string | null;
  representative_name: string | null;
  email: string | null;
};

type SupplierDirectoryRow = {
  id: string;
  business_registration_number: string | null;
  name: string;
  representative_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
};

type ProductSupplierCountRow = {
  supplier_name: string;
};

type UploadValidationError = {
  rowNumber: number;
  reason: string;
};

type CellLike = {
  value: unknown;
};

type RowLike = {
  cellCount: number;
  actualCellCount: number;
  getCell: (cellNumber: number) => CellLike;
};

type WorksheetLike = {
  name: string;
  rowCount: number;
  getRow: (rowNumber: number) => RowLike;
};

type SheetRow = unknown[];

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const PRODUCT_PAGE_SIZE = 1000;
const MAX_PRODUCT_PAGES = 100;

// Supabase(PostgREST)는 한 번에 최대 1000행만 돌려주므로, 상품이 1000개를 넘으면
// 납품처별 상품 수가 적게 집계된다. 페이지 단위로 끝까지 읽는다.
async function loadActiveProductSuppliers(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ data: ProductSupplierCountRow[]; error: unknown }> {
  const rows: ProductSupplierCountRow[] = [];

  for (let page = 0; page < MAX_PRODUCT_PAGES; page += 1) {
    const from = page * PRODUCT_PAGE_SIZE;
    const { data, error } = await supabase
      .from("products")
      .select("supplier_name")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, from + PRODUCT_PAGE_SIZE - 1);

    if (error) {
      return { data: [], error };
    }

    const pageRows = (data ?? []) as ProductSupplierCountRow[];
    rows.push(...pageRows);

    if (pageRows.length < PRODUCT_PAGE_SIZE) {
      break;
    }
  }

  return { data: rows, error: null };
}

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

function readHeaderNames(worksheet: WorksheetLike): string[] {
  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(headerRow.cellCount, headerRow.actualCellCount);

  return Array.from({ length: columnCount }, (_, index) =>
    getCellText(headerRow.getCell(index + 1).value),
  );
}

function buildRowObject(headers: string[], row: RowLike): Record<string, string> {
  return headers.reduce<Record<string, string>>((record, header, index) => {
    if (!header) {
      return record;
    }

    record[header] = getCellText(row.getCell(index + 1).value);
    return record;
  }, {});
}

function legacyRowsToWorksheet(sheetName: string, rows: SheetRow[]): WorksheetLike {
  return {
    name: sheetName || "Sheet1",
    rowCount: rows.length,
    getRow(rowNumber: number) {
      const rowValues = rows[rowNumber - 1] ?? [];

      return {
        cellCount: rowValues.length,
        actualCellCount: rowValues.filter((value) => getCellText(value) !== "").length,
        getCell(cellNumber: number) {
          return {
            value: rowValues[cellNumber - 1] ?? "",
          };
        },
      };
    },
  };
}

async function parseLegacyWorkbook(buffer: Buffer): Promise<WorksheetLike | null> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0] ?? "";
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!worksheet) {
    return null;
  }

  const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  return legacyRowsToWorksheet(sheetName, rows);
}

function hasAnyValue(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => value.trim() !== "");
}

function missingHeaders(headers: string[], requiredHeaders: string[]): string[] {
  return requiredHeaders.filter((header) => !headers.includes(header));
}

function getMissingRowFields(row: Record<string, string>, requiredFields: string[]): string[] {
  return requiredFields.filter((field) => !row[field]?.trim());
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
    businessRegistrationNumber: row.business_registration_number ?? "",
    businessType: row.business_type ?? "",
    representativeName: row.representative_name ?? "",
    email: row.email ?? "",
  };
}

function countProductSuppliers(rows: ProductSupplierCountRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const supplierName = row.supplier_name?.trim();

    if (!supplierName) {
      continue;
    }

    counts.set(supplierName, (counts.get(supplierName) ?? 0) + 1);
  }

  return counts;
}

function mapSupplier(row: SupplierDirectoryRow, productCounts: Map<string, number>) {
  return {
    id: row.id,
    businessRegistrationNumber: row.business_registration_number ?? "",
    name: row.name,
    representativeName: row.representative_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    isActive: row.is_active,
    productCount: productCounts.get(row.name) ?? 0,
  };
}

function mapSuppliersFromProducts(productCounts: Map<string, number>) {
  return Array.from(productCounts.entries())
    .map(([name, productCount]) => ({
      id: name,
      businessRegistrationNumber: "",
      name,
      representativeName: "",
      phone: "",
      email: "",
      address: "",
      isActive: true,
      productCount,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

async function readWorkbookFromRequest(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return { error: jsonError("업로드 파일을 다시 확인해 주세요.", 400) };
  }

  const file = formData.get("file");
  const kind = formData.get("kind");

  if (kind !== "branches" && kind !== "suppliers") {
    return { error: jsonError("업로드 종류를 다시 확인해 주세요.", 400) };
  }

  if (!(file instanceof File) || !file.name) {
    return { error: jsonError("업로드할 엑셀 파일을 선택해 주세요.", 400) };
  }

  if (!isSupportedExcelFile(file)) {
    return { error: jsonError("엑셀 파일(.xlsx, .xlsm, .xls)만 업로드할 수 있습니다.", 400) };
  }

  if (file.size <= 0) {
    return { error: jsonError("비어 있는 엑셀 파일은 업로드할 수 없습니다.", 400) };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { error: jsonError("엑셀 파일은 5MB 이하만 업로드할 수 있습니다.", 400) };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let worksheet: WorksheetLike | null;

  try {
    if (isLegacyExcelFile(file)) {
      worksheet = await parseLegacyWorkbook(buffer);
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
      );
      worksheet = workbook.worksheets[0] ?? null;
    }
  } catch {
    return {
      error: jsonError(
        "엑셀 파일을 읽을 수 없습니다. 계속 실패하면 파일을 .xlsx로 다시 저장해서 업로드해 주세요.",
        400,
      ),
    };
  }

  if (!worksheet) {
    return { error: jsonError("엑셀 시트를 찾을 수 없습니다.", 400) };
  }

  return { kind, worksheet };
}

export async function GET() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  const supabase = createServiceClient();
  const [
    { data: branches, error: branchesError },
    { data: suppliers, error: suppliersError },
    { data: products, error: productsError },
  ] = await Promise.all([
      supabase
        .from("branches")
        .select(
          "id, code, name, delivery_address, recipient_name, phone, is_active, business_registration_number, business_type, representative_name, email",
        )
        .order("name", { ascending: true }),
      supabase
        .from("supplier_directory")
        .select(
          "id, business_registration_number, name, representative_name, phone, email, address, is_active",
        )
        .order("name", { ascending: true }),
      loadActiveProductSuppliers(supabase),
    ]);

  if (productsError) {
    return jsonError("마스터 정보를 불러오지 못했습니다.", 500);
  }

  const productCounts = countProductSuppliers((products ?? []) as ProductSupplierCountRow[]);

  return NextResponse.json({
    branches: branchesError ? [] : ((branches ?? []) as BranchRow[]).map(mapBranch),
    suppliers: suppliersError
      ? mapSuppliersFromProducts(productCounts)
      : ((suppliers ?? []) as SupplierDirectoryRow[]).map((supplier) =>
          mapSupplier(supplier, productCounts),
        ),
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

  const { error: directoryError } = await supabase
    .from("supplier_directory")
    .update({
      name: parsed.data.nextName,
      updated_at: new Date().toISOString(),
    })
    .eq("name", parsed.data.currentName);

  if (directoryError) {
    return jsonError(
      directoryError.code === "23505"
        ? "이미 사용 중인 납품처명입니다."
        : "납품처 정보를 저장하지 못했습니다.",
      directoryError.code === "23505" ? 409 : 500,
    );
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

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return jsonError(admin.error, admin.status);
  }

  const workbookResult = await readWorkbookFromRequest(request);

  if ("error" in workbookResult) {
    return workbookResult.error;
  }

  const { kind, worksheet } = workbookResult;
  const headers = readHeaderNames(worksheet);
  const requiredHeaders =
    kind === "branches"
      ? ["사업자등록번호", "거래처명", "거래구분", "대표자성명", "휴대폰", "이메일", "주소"]
      : ["사업자등록번호", "거래처명", "대표자성명", "휴대폰", "이메일", "주소"];
  const missing = missingHeaders(headers, requiredHeaders);

  if (missing.length > 0) {
    return jsonError(
      [
        `${kind === "branches" ? "지사" : "납품처"} 엑셀 필수 열을 찾지 못했습니다: ${missing.join(", ")}`,
        `필수 열: ${requiredHeaders.join(", ")}`,
        `현재 읽힌 열: ${summarizeHeaders(headers)}`,
        "첫 번째 행에 헤더가 있어야 합니다.",
      ].join(" / "),
      400,
    );
  }

  const validationErrors: UploadValidationError[] = [];
  const now = new Date().toISOString();

  if (kind === "branches") {
    const rowsToUpsert: Array<{
      code: string;
      name: string;
      delivery_address: string;
      recipient_name: string;
      phone: string;
      is_active: true;
      business_registration_number: string;
      business_type: string;
      representative_name: string;
      email: string;
      updated_at: string;
    }> = [];
    const seenBusinessNumbers = new Map<string, number>();
    let totalRows = 0;
    let skippedRows = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = buildRowObject(headers, worksheet.getRow(rowNumber));

      if (!hasAnyValue(row)) {
        skippedRows += 1;
        continue;
      }

      totalRows += 1;

      const businessNumber = row["사업자등록번호"]?.trim() ?? "";
      const name = row["거래처명"]?.trim() ?? "";
      const address = row["주소"]?.trim() ?? "";

      const missingFields = getMissingRowFields(row, ["사업자등록번호", "거래처명", "주소"]);

      if (missingFields.length > 0) {
        validationErrors.push({
          rowNumber,
          reason: `필수 값이 비어 있습니다: ${missingFields.join(", ")}. 해당 행의 ${missingFields.join(", ")} 열을 채워 주세요.`,
        });
        continue;
      }

      const duplicateRowNumber = seenBusinessNumbers.get(businessNumber);

      if (duplicateRowNumber) {
        validationErrors.push({
          rowNumber,
          reason: `중복된 사업자등록번호입니다. ${duplicateRowNumber}행과 같은 값입니다.`,
        });
        continue;
      }

      seenBusinessNumbers.set(businessNumber, rowNumber);
      rowsToUpsert.push({
        code: businessNumber,
        name,
        delivery_address: address,
        recipient_name: row["대표자성명"]?.trim() || `${name} 담당자`,
        phone: row["휴대폰"]?.trim() || "-",
        is_active: true,
        business_registration_number: businessNumber,
        business_type: row["거래구분"]?.trim() ?? "",
        representative_name: row["대표자성명"]?.trim() ?? "",
        email: row["이메일"]?.trim() ?? "",
        updated_at: now,
      });
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "엑셀 오류를 확인해 주세요.", errors: validationErrors },
        { status: 400 },
      );
    }

    if (rowsToUpsert.length === 0) {
      return jsonError("업로드할 지사 데이터가 없습니다.", 400);
    }

    const supabase = createServiceClient();
    const { data: importedCount, error: replaceError } = await supabase.rpc(
      "replace_branches_from_upload",
      {
        p_branches: rowsToUpsert,
      },
    );

    if (replaceError) {
      return jsonError(
        `지사 엑셀을 저장하지 못했습니다. 지사 코드나 사업자등록번호 중복을 확인해 주세요. (${replaceError.message})`,
        replaceError.code === "23505" ? 409 : 500,
      );
    }

    return NextResponse.json({
      importedCount: typeof importedCount === "number" ? importedCount : rowsToUpsert.length,
      report: {
        sheetName: worksheet.name,
        totalRows,
        importedRows: rowsToUpsert.length,
        skippedRows,
        replacedExisting: true,
      },
    });
  }

  const rowsToUpsert: Array<{
    business_registration_number: string;
    name: string;
    representative_name: string;
    phone: string;
    email: string;
    address: string;
    is_active: true;
    updated_at: string;
  }> = [];
  const seenBusinessNumbers = new Map<string, number>();
  let totalRows = 0;
  let skippedRows = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = buildRowObject(headers, worksheet.getRow(rowNumber));

    if (!hasAnyValue(row)) {
      skippedRows += 1;
      continue;
    }

    totalRows += 1;

    const businessNumber = row["사업자등록번호"]?.trim() ?? "";
    const name = normalizeSupplierName(row["거래처명"] ?? "");

    const missingFields = getMissingRowFields(row, ["사업자등록번호", "거래처명"]);

    if (missingFields.length > 0) {
      validationErrors.push({
        rowNumber,
        reason: `필수 값이 비어 있습니다: ${missingFields.join(", ")}. 해당 행의 ${missingFields.join(", ")} 열을 채워 주세요.`,
      });
      continue;
    }

    const duplicateRowNumber = seenBusinessNumbers.get(businessNumber);

    if (duplicateRowNumber) {
      validationErrors.push({
        rowNumber,
        reason: `중복된 사업자등록번호입니다. ${duplicateRowNumber}행과 같은 값입니다.`,
      });
      continue;
    }

    seenBusinessNumbers.set(businessNumber, rowNumber);
    rowsToUpsert.push({
      business_registration_number: businessNumber,
      name,
      representative_name: row["대표자성명"]?.trim() ?? "",
      phone: row["휴대폰"]?.trim() ?? "",
      email: row["이메일"]?.trim() ?? "",
      address: row["주소"]?.trim() ?? "",
      is_active: true,
      updated_at: now,
    });
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: "엑셀 오류를 확인해 주세요.", errors: validationErrors },
      { status: 400 },
    );
  }

  if (rowsToUpsert.length === 0) {
    return jsonError("업로드할 납품처 데이터가 없습니다.", 400);
  }

  const supabase = createServiceClient();
  const { data: importedCount, error: replaceError } = await supabase.rpc(
    "replace_supplier_directory_from_upload",
    {
      p_suppliers: rowsToUpsert,
    },
  );

  if (replaceError) {
    return jsonError(
      `납품처 엑셀을 저장하지 못했습니다. 엑셀 안의 사업자등록번호나 거래처명 중복을 확인해 주세요. (${replaceError.message})`,
      replaceError.code === "23505" ? 409 : 500,
    );
  }

  return NextResponse.json({
    importedCount: typeof importedCount === "number" ? importedCount : rowsToUpsert.length,
    report: {
      sheetName: worksheet.name,
      totalRows,
      importedRows: rowsToUpsert.length,
      skippedRows,
      replacedExisting: true,
    },
  });
}
