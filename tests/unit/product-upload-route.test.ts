import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  upsertMock,
  fromMock,
  workbookLoadMock,
  worksheetState,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
  workbookLoadMock: vi.fn(),
  worksheetState: {
    current: [] as Array<{ rowCount: number; getRow: (rowNumber: number) => unknown }>,
  },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: fromMock,
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
  단가?: string;
};

function createWorksheet(
  rows: ProductMasterFixtureRow[],
  headers = ["바코드 번호", "상품코드", "상품명", "규격", "납품 거래처명", "단가"],
) {
  const allRows = [
    headers,
    ...rows.map((row) => [
      row["바코드 번호"] ?? "",
      row.상품코드 ?? "",
      row.상품명 ?? "",
      row.규격 ?? "",
      row["납품 거래처명"] ?? "",
      row.단가 ?? "",
    ]),
  ];

  return {
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
    upsertMock.mockReset();
    fromMock.mockReset();
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

  it("rejects unsupported .xls files before reading them", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    const file = createFile("product-master.xls");

    const response = await postWithFile(file);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "엑셀 파일(.xlsx, .xlsm)만 업로드할 수 있습니다.",
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
      createWorksheet([], ["바코드 번호", "상품코드", "규격", "단가"]),
    ];

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "필수 헤더가 없습니다: 상품명",
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
          단가: "1000",
        },
        {
          "바코드 번호": " 88010001 ",
          상품코드: "P-002",
          상품명: "탄산수",
          규격: "500ml",
          "납품 거래처명": "샘물유통",
          단가: "1200",
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
          reason: "중복된 바코드 번호입니다.",
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
          단가: "천원",
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

  it("upserts validated rows on success", async () => {
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
          단가: " 1,250 ",
        },
      ]),
    ];
    fromMock.mockReturnValue({
      upsert: upsertMock.mockResolvedValue({
        error: null,
      }),
    });

    const response = await postWithFile(createFile("product-master.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      importedCount: 1,
    });
    expect(fromMock).toHaveBeenCalledWith("products");
    expect(upsertMock).toHaveBeenCalledWith(
      [
        {
          barcode: "88010001",
          product_code: "P-001",
          name: "생수",
          spec: "500ml",
          supplier_name: "샘물유통",
          unit_price: 1250,
          is_active: true,
        },
      ],
      {
        onConflict: "barcode",
      },
    );
  });
});
