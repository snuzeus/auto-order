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
  "단가",
] as const;

export const REQUIRED_PRODUCT_MASTER_HEADERS = [
  "바코드 번호",
  "상품코드",
  "상품명",
  "납품 거래처명",
] as const;

type ProductMasterHeader = (typeof PRODUCT_MASTER_HEADERS)[number];

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

export function isEmptyProductMasterRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => cellValueToText(value) === "");
}

export function getMissingRequiredProductMasterHeaders(headers: string[]): string[] {
  return REQUIRED_PRODUCT_MASTER_HEADERS.filter((header) => !headers.includes(header));
}

export function normalizeProductMasterRow(row: Record<string, unknown>): ProductMasterUploadRow {
  for (const header of REQUIRED_PRODUCT_MASTER_HEADERS) {
    if (!cellValueToText(row[header])) {
      throw new Error(`${header} 값이 없습니다.`);
    }
  }

  return {
    barcode: cellValueToText(row["바코드 번호"]),
    productCode: cellValueToText(row["상품코드"]),
    name: cellValueToText(row["상품명"]),
    spec: cellValueToText(row["규격"]),
    supplierName: cellValueToText(row["납품 거래처명"]),
    unitPrice: parseUnitPrice(row["단가"]),
  };
}

export function normalizeProductMasterHeader(header: ProductMasterHeader): string {
  return header;
}
