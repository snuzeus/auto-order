import ExcelJS from "exceljs";
import JSZip from "jszip";

export type SupplierExcelRow = {
  supplierName: string;
  branchName: string;
  address: string;
  phone: string;
  productCode: string;
  productName: string;
  spec: string;
  quantity: number;
};

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

function sanitizeSupplierNameForFilename(supplierName: string): string {
  const sanitized = supplierName
    .trim()
    .replace(INVALID_FILENAME_CHARS, "_")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "");

  return sanitized || "supplier";
}

export function groupRowsBySupplier(rows: SupplierExcelRow[]): Map<string, SupplierExcelRow[]> {
  return rows.reduce((grouped, row) => {
    const supplierRows = grouped.get(row.supplierName) ?? [];

    supplierRows.push(row);
    grouped.set(row.supplierName, supplierRows);

    return grouped;
  }, new Map<string, SupplierExcelRow[]>());
}

export async function createSupplierWorkbook(rows: SupplierExcelRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("발주서");

  worksheet.columns = [
    { header: "주문지사명", key: "branchName", width: 18 },
    { header: "주소", key: "address", width: 36 },
    { header: "연락처", key: "phone", width: 18 },
    { header: "상품코드", key: "productCode", width: 16 },
    { header: "상품명", key: "productName", width: 28 },
    { header: "수량", key: "quantity", width: 10 },
  ];

  for (const row of rows) {
    worksheet.addRow({
      branchName: row.branchName,
      address: row.address,
      phone: row.phone,
      productCode: row.productCode,
      productName: row.productName,
      quantity: row.quantity,
    });
  }

  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

export async function createSupplierZip(
  rows: SupplierExcelRow[],
  orderDate: string,
): Promise<Uint8Array> {
  const grouped = groupRowsBySupplier(rows);

  if (grouped.size === 0) {
    throw new Error("ZIP으로 만들 납품처 주문이 없습니다.");
  }

  const zip = new JSZip();
  const usedFileNames = new Set<string>();

  for (const [supplierName, supplierRows] of grouped) {
    const workbook = await createSupplierWorkbook(supplierRows);
    const safeSupplierName = sanitizeSupplierNameForFilename(supplierName);
    let fileName = `${safeSupplierName}_${orderDate}.xlsx`;
    let collisionIndex = 2;

    while (usedFileNames.has(fileName)) {
      fileName = `${safeSupplierName}_${orderDate}_${collisionIndex}.xlsx`;
      collisionIndex += 1;
    }

    usedFileNames.add(fileName);
    zip.file(fileName, workbook);
  }

  return zip.generateAsync({ type: "uint8array" });
}
