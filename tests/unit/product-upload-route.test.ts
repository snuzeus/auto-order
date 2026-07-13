import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const {
  requireAdminMock,
  updateMock,
  notMock,
  deleteMock,
  neqMock,
  upsertMock,
  fromMock,
  rpcMock,
  workbookLoadMock,
  worksheetState,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  updateMock: vi.fn(),
  notMock: vi.fn(),
  deleteMock: vi.fn(),
  neqMock: vi.fn(),
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  workbookLoadMock: vi.fn(),
  worksheetState: {
    current: [] as Array<{
      name?: string;
      rowCount: number;
      getRow: (rowNumber: number) => unknown;
    }>,
  },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fromMock,
    rpc: rpcMock,
  }),
}));

vi.mock("exceljs", () => ({
  __esModule: true,
  default: {
    Workbook: class {
      worksheets = worksheetState.current;
      xlsx = {
        load: workbookLoadMock,
      };
    },
  },
}));

import { POST } from "@/app/api/admin/products/upload/route";

type ProductMasterFixtureRow = {
  "바코드 번호"?: string;
  상품코드?: string;
  상품명?: string;
  규격?: string;
  "납품 거래처명"?: string;
  공급가: string;
  최소발주수량?: string;
};

function createWorksheet(
  rows: ProductMasterFixtureRow[],
  headers = ["바코드 번호", "상품코드", "상품명", "규격", "납품 거래처명", "공급가", "최소발주수량"],
) {
  const allRows = [
    headers,
    ...rows.map((row) => [
      row["바코드 번호"] ?? "",
      row.상품코드 ?? "",
      row.상품명 ?? "",
      row.규격 ?? "",
      row["납품 거래처명"] ?? "",
      row.공급가 ?? "",
      row.최소발주수량 ?? "",
    ]),
  ];

  return {
    name: "Sheet1",
    rowCount: allRows.length,
    getRow(rowNumber: number) {
      const rowValues = allRows[rowNumber - 1] ?? [];

      return {
        cellCount: rowValues.length,
        actualCellCount: rowValues.length,
        getCell(cellNumber: number) {
          return {
            value: rowValues[cellNumber - 1],
          };
        },
      };
    },
  };
}

function createFile(name: string, size = 8): File {
  const file = new File([new Uint8Array(Math.max(size, 1))], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  Object.defineProperty(file, "size", {
    value: size,
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(Math.max(size, 1))),
  });

  return file;
}

function createLegacyXlsFile(rows: unknown[][]): File {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const buffer = XLSX.write(workbook, {
    bookType: "biff8",
    type: "array",
  }) as ArrayBuffer;
  const file = new File([buffer], "product-master.xls", {
    type: "application/vnd.ms-excel",
  });

  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(buffer),
  });

  return file;
}

async function postWithFile(file?: File) {
  const formData = new FormData();

  if (file) {
    formData.append("file", file);
  }

  return POST({
    formData: async () => formData,
  } as Request);
}

describe("POST /api/admin/products/upload", () => {
  afterEach(() => {
    requireAdminMock.mockReset();
    updateMock.mockReset();
    notMock.mockReset();
    deleteMock.mockReset();
    neqMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockReset();
    rpcMock.mockReset();
    workbookLoadMock.mockReset();
    worksheetState.current = [];
  });

  it("rejects when the file is missing", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });

    const response = await postWithFile();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "업로드할 엑셀 파일을 선택해 주세요.",
    });
  });

  it("rejects unsupported non-excel files before reading them", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    const file = createFile("product-master.csv");

    const response = await postWithFile(file);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "엑셀 파일(.xlsx, .xlsm, .xls)만 업로드할 수 있습니다.",
    });
    expect(workbookLoadMock).not.toHaveBeenCalled();
  });

  it("rejects zero-byte files before parsing", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    const file = createFile("product-master.xlsx", 0);

    const response = await postWithFile(file);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "비어 있는 엑셀 파일은 업로드할 수 없습니다.",
    });
    expect(workbookLoadMock).not.toHaveBeenCalled();
  });

  it("rejects files larger than 5MB before parsing", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    const file = createFile("product-master.xlsx", 5 * 1024 * 1024 + 1);

    const response = await postWithFile(file);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "엑셀 파일은 5MB 이하만 업로드할 수 있습니다.",
    });
    expect(workbookLoadMock).not.toHaveBeenCalled();
  });

  it("returns missing required headers before row parsing", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    worksheetState.current = [
      createWorksheet([], ["바코드 번호", "상품코드", "규격", "공급가"]),
    ];

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("상품마스터 필수 열을 찾지 못했습니다: 상품명");
    expect(body.error).toContain("필수 열: 상품코드, 상품명");
    expect(body.error).toContain("현재 읽힌 열: 바코드 번호, 상품코드, 규격, 공급가");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns detailed row errors for missing required values", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    worksheetState.current = [
      createWorksheet([
        {
          "바코드 번호": "88010001",
          상품코드: "",
          상품명: "",
          규격: "500ml",
          "납품 거래처명": "하나유통",
          공급가: "1000",
        },
      ]),
    ];

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "행별 오류를 확인해 주세요.",
      errors: [
        {
          rowNumber: 2,
          reason: "필수 값이 비어 있습니다: 상품명. 해당 행의 상품명 열을 채워 주세요.",
        },
      ],
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns row errors for duplicate barcodes and skips Supabase writes", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    worksheetState.current = [
      createWorksheet([
        {
          "바코드 번호": "88010001",
          상품코드: "P-001",
          상품명: "생수",
          규격: "500ml",
          "납품 거래처명": "샘물유통",
          공급가: "1000",
        },
        {
          "바코드 번호": " 88010001 ",
          상품코드: "P-002",
          상품명: "탄산수",
          규격: "500ml",
          "납품 거래처명": "샘물유통",
          공급가: "1200",
        },
      ]),
    ];

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "행별 오류를 확인해 주세요.",
      errors: [
        {
          rowNumber: 3,
          reason: "중복된 바코드 번호입니다. 2행과 같은 값입니다.",
        },
      ],
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns row errors for invalid unit prices and skips Supabase writes", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    worksheetState.current = [
      createWorksheet([
        {
          "바코드 번호": "88010001",
          상품코드: "P-001",
          상품명: "생수",
          규격: "500ml",
          "납품 거래처명": "샘물유통",
          공급가: "천원",
        },
      ]),
    ];

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "행별 오류를 확인해 주세요.",
      errors: [
        {
          rowNumber: 2,
          reason: "단가를 숫자로 입력해 주세요.",
        },
      ],
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("replaces validated rows atomically on success", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    worksheetState.current = [
      createWorksheet([
        {
          "바코드 번호": " 88010001 ",
          상품코드: " P-001 ",
          상품명: " 생수 ",
          규격: " 500ml ",
          "납품 거래처명": " 샘물유통 ",
          공급가: " 1,250 ",
          최소발주수량: "12",
        },
      ]),
    ];
    rpcMock.mockResolvedValue({
      data: 1,
      error: null,
    });

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      importedCount: 1,
      report: {
        importedRows: 1,
        replacedExisting: true,
        skippedRows: 0,
        totalRows: 1,
        sheetName: "Sheet1",
      },
    });
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("replace_product_master", {
      p_products: [
        {
          barcode: "88010001",
          product_code: "P-001",
          name: "생수",
          spec: "",
          supplier_name: "샘물유통",
          unit_price: 1250,
          minimum_order_quantity: 12,
          is_active: true,
        },
      ],
    });
  });

  it("replaces validated rows from legacy xls files", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    rpcMock.mockResolvedValue({
      data: 1,
      error: null,
    });

    const response = await postWithFile(
      createLegacyXlsFile([
        ["바코드 번호", "상품코드", "상품명", "규격", "납품 거래처명", "공급가", "최소발주수량"],
        ["88010002", "P-002", "샴푸", "", "다원(프로랑스)", "2,500", "6"],
      ]),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importedCount).toBe(1);
    expect(workbookLoadMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("replace_product_master", {
      p_products: [
        {
          barcode: "88010002",
          product_code: "P-002",
          name: "샴푸",
          spec: "",
          supplier_name: "다원(프로랑스)",
          unit_price: 2500,
          minimum_order_quantity: 6,
          is_active: true,
        },
      ],
    });
  });
});
