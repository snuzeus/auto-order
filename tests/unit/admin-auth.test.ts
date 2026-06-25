import { afterEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("server-only", () => ({}), { virtual: true });

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

describe("requireAdmin", () => {
  afterEach(() => {
    createClientMock.mockReset();
    vi.resetModules();
  });

  it("returns a server error when auth lookup fails", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "auth failed" },
        }),
      },
    });

    const { requireAdmin } = await import("@/lib/auth/admin");

    await expect(requireAdmin()).resolves.toEqual({
      ok: false,
      error: "관리자 로그인 정보를 확인하지 못했습니다.",
      status: 500,
    });
  });

  it("returns an auth error when there is no signed-in user", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const { requireAdmin } = await import("@/lib/auth/admin");

    await expect(requireAdmin()).resolves.toEqual({
      ok: false,
      error: "관리자 로그인이 필요합니다.",
      status: 401,
    });
  });

  it("returns a server error when admin permission lookup fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission failed" },
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-user-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle,
            }),
          }),
        }),
      }),
    });

    const { requireAdmin } = await import("@/lib/auth/admin");

    await expect(requireAdmin()).resolves.toEqual({
      ok: false,
      error: "관리자 권한을 확인하지 못했습니다.",
      status: 500,
    });
  });

  it("returns a permission error when the user is not an admin", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-user-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle,
            }),
          }),
        }),
      }),
    });

    const { requireAdmin } = await import("@/lib/auth/admin");

    await expect(requireAdmin()).resolves.toEqual({
      ok: false,
      error: "관리자 권한이 없습니다.",
      status: 403,
    });
  });

  it("returns auth and admin identifiers for an admin user", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "admin-user-1" },
      error: null,
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-user-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle,
            }),
          }),
        }),
      }),
    });

    const { requireAdmin } = await import("@/lib/auth/admin");

    await expect(requireAdmin()).resolves.toEqual({
      ok: true,
      userId: "auth-user-1",
      adminId: "admin-user-1",
    });
  });
});
