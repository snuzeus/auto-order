import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  createSupplierWorkbook,
  createSupplierZip,
  groupRowsBySupplier,
  type SupplierExcelRow,
} from "@/lib/excel/supplier-files";

const sampleRows: SupplierExcelRow[] = [
  {
    supplierName: "A납품처",
    branchName: "강남점",
    address: "서울 강남구",
    phone: "010-1111-2222",
    orderDate: "2026-08-17",
    productCode: "P1",
    productName: "물티슈",
    spec: "100매",
    quantity: 2,
  },
  {
    supplierName: "B납품처",
    branchName: "부산점",
    address: "부산 해운대구",
    phone: "010-3333-4444",
    orderDate: "2026-08-18",
    productCode: "P2",
    productName: "장갑",
    spec: "L",
    quantity: 1,
  },
  {
    supplierName: "A납품처",
    branchName: "대구점",
    address: "대구 수성구",
    phone: "010-5555-6666",
    orderDate: "2026-08-18",
    productCode: "P3",
    productName: "컵",
    spec: "20oz",
    quantity: 3,
  },
];

describe("groupRowsBySupplier", () => {
  it("groups rows by supplier name", () => {
    const grouped = groupRowsBySupplier(sampleRows);

    expect(grouped.get("A납품처")).toHaveLength(2);
    expect(grouped.get("B납품처")).toHaveLength(1);
  });
});

describe("createSupplierWorkbook", () => {
  it("creates a 발주서 worksheet with Korean headers and supplier rows", async () => {
    const workbookBuffer = await createSupplierWorkbook(sampleRows.slice(0, 2));
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(workbookBuffer);

    const worksheet = workbook.getWorksheet("발주서");

    expect(worksheet).toBeDefined();
    expect(worksheet?.getRow(1).values).toEqual([
      ,
      "주문지사명",
      "주소",
      "연락처",
      "상품코드",
      "상품명",
      "수량",
    ]);
    expect(worksheet?.getRow(1).font?.bold).toBe(true);
    expect(worksheet?.getRow(2).values).toEqual([
      ,
      "강남점",
      "서울 강남구",
      "010-1111-2222",
      "P1",
      "물티슈",
      2,
    ]);
  });

  it("combines the same branch and product across order dates", async () => {
    const workbookBuffer = await createSupplierWorkbook([
      sampleRows[0],
      { ...sampleRows[0], orderDate: "2026-08-18", quantity: 5 },
      {
        ...sampleRows[0],
        orderDate: "2026-08-18",
        branchName: "서초점",
        address: "서울 서초구",
        phone: "010-9999-8888",
        quantity: 4,
      },
    ]);
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(workbookBuffer);

    const worksheet = workbook.getWorksheet("발주서");

    expect(worksheet?.rowCount).toBe(3);
    expect(worksheet?.getRow(2).values).toEqual([
      ,
      "강남점",
      "서울 강남구",
      "010-1111-2222",
      "P1",
      "물티슈",
      7,
    ]);
    expect(worksheet?.getRow(3).values).toEqual([
      ,
      "서초점",
      "서울 서초구",
      "010-9999-8888",
      "P1",
      "물티슈",
      4,
    ]);
  });
});

describe("createSupplierZip", () => {
  it("creates one workbook per supplier using sanitized filenames", async () => {
    const zipBuffer = await createSupplierZip(
      [
        sampleRows[0],
        { ...sampleRows[1], supplierName: 'B/납품처:*?"<>' },
        sampleRows[2],
      ],
      "2026-06-23",
    );
    const zip = await JSZip.loadAsync(zipBuffer);

    expect(Object.keys(zip.files).sort()).toEqual([
      "A납품처_2026-06-23.xlsx",
      "B_납품처_______2026-06-23.xlsx",
    ]);
  });
});
