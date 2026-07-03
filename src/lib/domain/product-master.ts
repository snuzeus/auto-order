import { normalizeSupplierName } from "@/lib/domain/supplier-name";

export type ProductMasterUploadRow = {
  barcode: string;
  productCode: string;
  name: string;
  spec: string;
  supplierName: string;
  unitPrice: number;
};

export const PRODUCT_MASTER_HEADERS = [
  "바코드 번호",
  "상품코드",
  "상품명",
  "규격",
  "납품 거래처명",
  "입수량",
  "공급가",
  "납품처",
  "계약단가",
] as const;

export const REQUIRED_PRODUCT_MASTER_FIELDS = ["상품코드", "상품명"] as const;

const HEADER_ALIASES = {
  barcode: ["바코드 번호", "바코드", "상품코드"],
  productCode: ["상품코드", "바코드 번호", "바코드"],
  name: ["상품명"],
  spec: ["규격", "입수량"],
  supplierName: ["납품 거래처명", "납품처", "거래처명", "공급처"],
  unitPrice: ["공급가", "계약단가", "단가"],
} as const;

type RichTextValue = {
  richText?: Array<{ text?: string }>;
  text?: string;
  result?: unknown;
  hyperlink?: string;
};

function cellValueToText(value: unknown): string {
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
    const richValue = value as RichTextValue;

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
      return cellValueToText(richValue.result);
    }

    if (typeof richValue.hyperlink === "string") {
      return richValue.hyperlink.trim();
    }
  }

  return String(value).trim();
}

function parseUnitPrice(value: unknown): number {
  const text = cellValueToText(value);

  if (!text) {
    return 0;
  }

  const normalized = text.replaceAll(",", "");
  const unitPrice = Number(normalized);

  if (!Number.isFinite(unitPrice)) {
    throw new Error("단가를 숫자로 입력해 주세요.");
  }

  return unitPrice;
}

function readFirstValue(row: Record<string, unknown>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = cellValueToText(row[alias]);

    if (value) {
      return value;
    }
  }

  return "";
}

function hasHeader(headers: string[], aliases: readonly string[]): boolean {
  return aliases.some((alias) => headers.includes(alias));
}

export function isEmptyProductMasterRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => cellValueToText(value) === "");
}

export function getMissingRequiredProductMasterHeaders(headers: string[]): string[] {
  return REQUIRED_PRODUCT_MASTER_FIELDS.filter((field) => {
    if (field === "상품코드") {
      return !hasHeader(headers, HEADER_ALIASES.productCode);
    }

    return !hasHeader(headers, HEADER_ALIASES.name);
  });
}

export function normalizeProductMasterRow(row: Record<string, unknown>): ProductMasterUploadRow {
  const productCode = readFirstValue(row, HEADER_ALIASES.productCode);
  const name = readFirstValue(row, HEADER_ALIASES.name);

  if (!productCode) {
    throw new Error("상품코드 값이 없습니다.");
  }

  if (!name) {
    throw new Error("상품명 값이 없습니다.");
  }

  const barcode = readFirstValue(row, HEADER_ALIASES.barcode) || productCode;
  const supplierName = normalizeSupplierName(
    readFirstValue(row, HEADER_ALIASES.supplierName) || "납품처 미지정",
  );

  return {
    barcode,
    productCode,
    name,
    spec: "",
    supplierName,
    unitPrice: parseUnitPrice(readFirstValue(row, HEADER_ALIASES.unitPrice)),
  };
}

export function normalizeProductMasterHeader(header: string): string {
  return header;
}
