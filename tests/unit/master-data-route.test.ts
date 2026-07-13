import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  rpcMock,
  fromMock,
  workbookLoadMock,
  worksheetState,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
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

import { POST } from "@/app/api/admin/master-data/route";

function createWorksheet(headers: string[], rows: string[][]) {
  const allRows = [headers, ...rows];

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

function createFile(name: string): File {
  const file = new File([new Uint8Array(8)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  });

  return file;
}

async function postWithFile(kind: "branches" | "suppliers") {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", createFile(`${kind}.xlsx`));

  return POST({
    formData: async () => formData,
  } as never);
}

describe("POST /api/admin/master-data", () => {
  afterEach(() => {
    requireAdminMock.mockReset();
    rpcMock.mockReset();
    fromMock.mockReset();
    workbookLoadMock.mockReset();
    worksheetState.current = [];
  });

  it("replaces branch master data through a transactional RPC", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    rpcMock.mockResolvedValue({ data: 1, error: null });
    worksheetState.current = [
      createWorksheet(
        ["사업자등록번호", "거래처명", "거래구분", "대표자성명", "휴대폰", "이메일", "주소"],
        [["123-45-67890", "강남점", "지사", "김대표", "010-1111-2222", "gangnam@example.com", "서울 강남구"]],
      ),
    ];

    const response = await postWithFile("branches");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importedCount).toBe(1);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("replace_branches_from_upload", {
      p_branches: [
        expect.objectContaining({
          code: "123-45-67890",
          name: "강남점",
          delivery_address: "서울 강남구",
          recipient_name: "김대표",
          phone: "010-1111-2222",
          is_active: true,
          business_registration_number: "123-45-67890",
          business_type: "지사",
          representative_name: "김대표",
          email: "gangnam@example.com",
        }),
      ],
    });
  });

  it("replaces supplier master data through a transactional RPC", async () => {
    requireAdminMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      adminId: "admin-1",
    });
    workbookLoadMock.mockResolvedValue(undefined);
    rpcMock.mockResolvedValue({ data: 1, error: null });
    worksheetState.current = [
      createWorksheet(
        ["사업자등록번호", "거래처명", "대표자성명", "휴대폰", "이메일", "주소"],
        [["987-65-43210", "㈜아이코스화장품", "박대표", "010-3333-4444", "supplier@example.com", "경기 성남시"]],
      ),
    ];

    const response = await postWithFile("suppliers");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.importedCount).toBe(1);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("replace_supplier_directory_from_upload", {
      p_suppliers: [
        expect.objectContaining({
          business_registration_number: "987-65-43210",
          name: "(주)아이코스화장품",
          representative_name: "박대표",
          phone: "010-3333-4444",
          email: "supplier@example.com",
          address: "경기 성남시",
          is_active: true,
        }),
      ],
    });
  });
});
