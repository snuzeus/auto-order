import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  createServiceClientMock,
  workbookLoadMock,
  worksheetsRef,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  workbookLoadMock: vi.fn(),
  worksheetsRef: {
    current: [] as Array<{ rowCount: number; getRow: (rowNumber: number) => unknown }>,
  },
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock("exceljs", () => ({
  __esModule: true,
  default: {
    Workbook: class {
      worksheets = worksheetsRef.current;
      xlsx = {
        load: workbookLoadMock,
      };
    },
  },
}));

import { POST } from "@/app/api/admin/products/upload/route";

function createWorksheet(rows: Array<Record<string, string>>) {
  const headerValues = ["바코드 번호", "상품코드", "상품명", "규격", "납품 거래처명", "단가"];
  const allRows = [
    headerValues,
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

describe("POST /api/admin/products/upload", () => {
  afterEach(() => {
    requireAdminMock.mockReset();
    createServiceClientMock.mockReset();
    workbookLoadMock.mockReset();
    worksheetsRef.current = [];
  });

  it("includes a top-level Korean error message with row validation details", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });

    createServiceClientMock.mockReturnValue({
      from: vi.fn(),
    });

    workbookLoadMock.mockResolvedValue(undefined);
    worksheetsRef.current = [createWorksheet([
      {
        "바코드 번호": "88010001",
        상품코드: "P-001",
        상품명: "생수",
        규격: "500ml",
        "납품 거래처명": "",
        단가: "1000",
      },
    ])];
    const file = new File(["placeholder"], "product-master.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST({
      formData: async () => formData,
    } as Request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "행별 오류를 확인해 주세요.",
      errors: [
        {
          rowNumber: 2,
          reason: "납품 거래처명 값이 없습니다.",
        },
      ],
    });
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });
});
