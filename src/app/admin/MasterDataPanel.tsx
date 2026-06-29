"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

type BranchForm = {
  id: string;
  code: string;
  name: string;
  deliveryAddress: string;
  recipientName: string;
  phone: string;
  isActive: boolean;
  businessRegistrationNumber: string;
  businessType: string;
  representativeName: string;
  email: string;
};

type SupplierForm = {
  id: string;
  businessRegistrationNumber: string;
  name: string;
  representativeName: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
  productCount: number;
};

type MasterDataResponse = {
  branches?: BranchForm[];
  suppliers?: SupplierForm[];
  error?: string;
};

type SaveResponse = {
  ok?: boolean;
  updatedCount?: number;
  importedCount?: number;
  error?: string;
  errors?: Array<{
    rowNumber: number;
    reason: string;
  }>;
};

function updateBranchField(
  branches: BranchForm[],
  branchId: string,
  field: keyof BranchForm,
  value: string | boolean,
) {
  return branches.map((branch) =>
    branch.id === branchId
      ? {
          ...branch,
          [field]: value,
        }
      : branch,
  );
}

export default function MasterDataPanel() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [branches, setBranches] = useState<BranchForm[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierForm[]>([]);
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const [uploadPendingKey, setUploadPendingKey] = useState("");
  const [branchUploadFile, setBranchUploadFile] = useState<File | null>(null);
  const [supplierUploadFile, setSupplierUploadFile] = useState<File | null>(null);
  const [uploadRowErrors, setUploadRowErrors] = useState<SaveResponse["errors"]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const branchFileInputRef = useRef<HTMLInputElement>(null);
  const supplierFileInputRef = useRef<HTMLInputElement>(null);

  const loadMasterData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/master-data", { signal });
      const data = (await response.json()) as MasterDataResponse;

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "마스터 정보를 불러오지 못했습니다.");
      }

      const nextBranches = data.branches ?? [];
      const nextSuppliers = data.suppliers ?? [];

      setBranches(nextBranches);
      setSuppliers(nextSuppliers);
      setSupplierDrafts(
        Object.fromEntries(nextSuppliers.map((supplier) => [supplier.name, supplier.name])),
      );
    } catch (loadError) {
      if (signal?.aborted) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : "마스터 정보를 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();

    loadMasterData(controller.signal);

    return () => controller.abort();
  }, [isOpen, loadMasterData]);

  function handleBranchChange(
    branchId: string,
    field: keyof BranchForm,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const value = field === "isActive" ? event.target.checked : event.target.value;
    setBranches((current) => updateBranchField(current, branchId, field, value));
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>, branch: BranchForm) {
    event.preventDefault();

    setPendingKey(`branch:${branch.id}`);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/master-data", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "branch",
          ...branch,
        }),
      });
      const data = (await response.json()) as SaveResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "지사 정보를 저장하지 못했습니다.");
      }

      setNotice(`${branch.name} 지사 정보가 저장되었습니다.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "지사 정보를 저장하지 못했습니다.");
    } finally {
      setPendingKey("");
    }
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>, supplier: SupplierForm) {
    event.preventDefault();

    const nextName = supplierDrafts[supplier.name]?.trim() ?? "";

    if (!nextName) {
      setError("납품처명을 입력해 주세요.");
      setNotice("");
      return;
    }

    setPendingKey(`supplier:${supplier.name}`);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/master-data", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "supplier",
          currentName: supplier.name,
          nextName,
        }),
      });
      const data = (await response.json()) as SaveResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "납품처 정보를 저장하지 못했습니다.");
      }

      setNotice(
        data.updatedCount === 0
          ? "변경된 납품처 정보가 없습니다."
          : `${supplier.name} 납품처명이 ${nextName}(으)로 저장되었습니다.`,
      );
      await loadMasterData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "납품처 정보를 저장하지 못했습니다.");
    } finally {
      setPendingKey("");
    }
  }

  async function uploadMasterFile(
    event: FormEvent<HTMLFormElement>,
    kind: "branches" | "suppliers",
  ) {
    event.preventDefault();

    const file = kind === "branches" ? branchUploadFile : supplierUploadFile;

    if (!file) {
      setError(kind === "branches" ? "전국지사현황 엑셀을 선택해 주세요." : "납품업체리스트 엑셀을 선택해 주세요.");
      setNotice("");
      setUploadRowErrors([]);
      return;
    }

    const formData = new FormData();
    formData.append("kind", kind);
    formData.append("file", file);

    setUploadPendingKey(kind);
    setError("");
    setNotice("");
    setUploadRowErrors([]);

    try {
      const response = await fetch("/api/admin/master-data", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as SaveResponse;

      if (!response.ok) {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setUploadRowErrors(data.errors);
        }

        throw new Error(data.error ?? "엑셀 업로드에 실패했습니다.");
      }

      setNotice(
        kind === "branches"
          ? `${data.importedCount ?? 0}건의 지사 정보를 반영했습니다.`
          : `${data.importedCount ?? 0}건의 납품처 정보를 반영했습니다.`,
      );

      if (kind === "branches") {
        setBranchUploadFile(null);
        if (branchFileInputRef.current) {
          branchFileInputRef.current.value = "";
        }
      } else {
        setSupplierUploadFile(null);
        if (supplierFileInputRef.current) {
          supplierFileInputRef.current.value = "";
        }
      }

      await loadMasterData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "엑셀 업로드에 실패했습니다.");
    } finally {
      setUploadPendingKey("");
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <button
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left ${FOCUS_VISIBLE_CLASS}`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div>
          <h2 className="m-0 text-xl font-bold sm:text-2xl">지사/납품처 관리</h2>
          <p className="mt-1 text-sm text-slate-600">
            지사 배송 정보와 상품 마스터의 납품처명을 수정합니다.
          </p>
        </div>
        <span className="text-sm font-bold text-slate-600">{isOpen ? "접기" : "열기"}</span>
      </button>

      {isOpen ? (
        <div className="mt-4 flex flex-col gap-4">
          {notice ? (
            <p className="m-0 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="m-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {uploadRowErrors && uploadRowErrors.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
              <h3 className="m-0 text-base font-semibold">엑셀 오류</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {uploadRowErrors.map((rowError) => (
                  <li key={`${rowError.rowNumber}-${rowError.reason}`}>
                    {rowError.rowNumber}행: {rowError.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {loading ? (
            <p className="m-0 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              마스터 정보를 불러오는 중입니다.
            </p>
          ) : null}

          {!loading ? (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                <form
                  className="rounded-lg border border-teal-200 bg-teal-50/60 p-4"
                  onSubmit={(event) => uploadMasterFile(event, "branches")}
                >
                  <h3 className="m-0 text-lg font-bold">지사 엑셀 업로드</h3>
                  <p className="mt-1 text-sm text-slate-700">
                    전국지사현황.xlsx 형식으로 지사를 추가하거나 수정합니다.
                  </p>
                  <label className="mt-3 block text-sm font-semibold text-slate-700">
                    전국지사현황 파일
                    <input
                      ref={branchFileInputRef}
                      accept=".xlsx,.xlsm"
                      className={`mt-1 block w-full rounded-lg border-2 border-teal-400 bg-white px-3 py-3 text-sm text-slate-900 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:border-slate-200 disabled:bg-slate-100 ${FOCUS_VISIBLE_CLASS}`}
                      disabled={uploadPendingKey !== ""}
                      type="file"
                      onChange={(event) => {
                        setBranchUploadFile(event.target.files?.[0] ?? null);
                        setError("");
                        setNotice("");
                        setUploadRowErrors([]);
                      }}
                    />
                  </label>
                  {branchUploadFile ? (
                    <p className="m-0 mt-2 text-sm text-slate-700">
                      선택한 파일: {branchUploadFile.name}
                    </p>
                  ) : null}
                  <button
                    className={`mt-3 min-h-12 w-full rounded-lg bg-teal-700 px-5 py-3 text-base font-bold text-white shadow-sm disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={uploadPendingKey !== "" || !branchUploadFile}
                    type="submit"
                  >
                    {uploadPendingKey === "branches" ? "반영 중..." : "지사 엑셀 반영"}
                  </button>
                </form>

                <form
                  className="rounded-lg border border-teal-200 bg-teal-50/60 p-4"
                  onSubmit={(event) => uploadMasterFile(event, "suppliers")}
                >
                  <h3 className="m-0 text-lg font-bold">납품처 엑셀 업로드</h3>
                  <p className="mt-1 text-sm text-slate-700">
                    납품업체리스트.xlsx 형식으로 납품처를 추가하거나 수정합니다.
                  </p>
                  <label className="mt-3 block text-sm font-semibold text-slate-700">
                    납품업체리스트 파일
                    <input
                      ref={supplierFileInputRef}
                      accept=".xlsx,.xlsm"
                      className={`mt-1 block w-full rounded-lg border-2 border-teal-400 bg-white px-3 py-3 text-sm text-slate-900 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:border-slate-200 disabled:bg-slate-100 ${FOCUS_VISIBLE_CLASS}`}
                      disabled={uploadPendingKey !== ""}
                      type="file"
                      onChange={(event) => {
                        setSupplierUploadFile(event.target.files?.[0] ?? null);
                        setError("");
                        setNotice("");
                        setUploadRowErrors([]);
                      }}
                    />
                  </label>
                  {supplierUploadFile ? (
                    <p className="m-0 mt-2 text-sm text-slate-700">
                      선택한 파일: {supplierUploadFile.name}
                    </p>
                  ) : null}
                  <button
                    className={`mt-3 min-h-12 w-full rounded-lg bg-teal-700 px-5 py-3 text-base font-bold text-white shadow-sm disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={uploadPendingKey !== "" || !supplierUploadFile}
                    type="submit"
                  >
                    {uploadPendingKey === "suppliers" ? "반영 중..." : "납품처 엑셀 반영"}
                  </button>
                </form>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="m-0 text-lg font-bold">지사</h3>
                  <button
                    className={`rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-sm font-semibold shadow-sm disabled:border-slate-200 disabled:bg-slate-100 ${FOCUS_VISIBLE_CLASS}`}
                    disabled={loading || pendingKey !== ""}
                    type="button"
                    onClick={() => {
                      void loadMasterData();
                    }}
                  >
                    새로고침
                  </button>
                </div>
                {branches.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    등록된 지사가 없습니다.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {branches.map((branch) => {
                      const branchPending = pendingKey === `branch:${branch.id}`;

                      return (
                        <form
                          key={branch.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/80 p-4"
                          onSubmit={(event) => saveBranch(event, branch)}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm font-semibold text-slate-700">
                              지사 코드
                              <input
                                className={`mt-1 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base shadow-sm ${FOCUS_VISIBLE_CLASS}`}
                                disabled={branchPending}
                                value={branch.code}
                                onChange={(event) => handleBranchChange(branch.id, "code", event)}
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                              사업자등록번호
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-600"
                                disabled
                                value={branch.businessRegistrationNumber || "-"}
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                              지사명
                              <input
                                className={`mt-1 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base shadow-sm ${FOCUS_VISIBLE_CLASS}`}
                                disabled={branchPending}
                                value={branch.name}
                                onChange={(event) => handleBranchChange(branch.id, "name", event)}
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                              대표자
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-600"
                                disabled
                                value={branch.representativeName || "-"}
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                              이메일
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-3 text-base text-slate-600"
                                disabled
                                value={branch.email || "-"}
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                              배송 주소
                              <input
                                className={`mt-1 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base shadow-sm ${FOCUS_VISIBLE_CLASS}`}
                                disabled={branchPending}
                                value={branch.deliveryAddress}
                                onChange={(event) =>
                                  handleBranchChange(branch.id, "deliveryAddress", event)
                                }
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                              수령인
                              <input
                                className={`mt-1 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base shadow-sm ${FOCUS_VISIBLE_CLASS}`}
                                disabled={branchPending}
                                value={branch.recipientName}
                                onChange={(event) =>
                                  handleBranchChange(branch.id, "recipientName", event)
                                }
                              />
                            </label>
                            <label className="text-sm font-semibold text-slate-700">
                              연락처
                              <input
                                className={`mt-1 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base shadow-sm ${FOCUS_VISIBLE_CLASS}`}
                                disabled={branchPending}
                                value={branch.phone}
                                onChange={(event) => handleBranchChange(branch.id, "phone", event)}
                              />
                            </label>
                          </div>
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                              <input
                                checked={branch.isActive}
                                className={`h-5 w-5 ${FOCUS_VISIBLE_CLASS}`}
                                disabled={branchPending}
                                type="checkbox"
                                onChange={(event) =>
                                  handleBranchChange(branch.id, "isActive", event)
                                }
                              />
                              주문 화면에 표시
                            </label>
                            <button
                              className={`min-h-12 rounded-lg bg-slate-900 px-5 py-3 text-base font-bold text-white shadow-sm disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                              disabled={branchPending || pendingKey !== `branch:${branch.id}` && pendingKey !== ""}
                              type="submit"
                            >
                              {branchPending ? "저장 중..." : "지사 저장"}
                            </button>
                          </div>
                        </form>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="m-0 text-lg font-bold">납품처</h3>
                <p className="mt-1 text-sm text-slate-600">
                  납품처명 변경은 상품 마스터에 반영되며, 이후 지사 주문부터 새 납품처명이 사용됩니다.
                </p>
                {suppliers.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    등록된 납품처가 없습니다.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {suppliers.map((supplier) => {
                      const supplierPending = pendingKey === `supplier:${supplier.name}`;

                      return (
                        <form
                          key={supplier.name}
                          className="rounded-lg border border-slate-200 bg-slate-50/80 p-4"
                          onSubmit={(event) => saveSupplier(event, supplier)}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <label className="flex-1 text-sm font-semibold text-slate-700">
                              납품처명
                              <input
                                className={`mt-1 w-full rounded-lg border-2 border-slate-400 bg-white px-3 py-3 text-base shadow-sm ${FOCUS_VISIBLE_CLASS}`}
                                disabled={supplierPending}
                                value={supplierDrafts[supplier.name] ?? supplier.name}
                                onChange={(event) =>
                                  setSupplierDrafts((current) => ({
                                    ...current,
                                    [supplier.name]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <button
                              className={`min-h-12 rounded-lg bg-slate-900 px-5 py-3 text-base font-bold text-white shadow-sm disabled:bg-slate-300 ${FOCUS_VISIBLE_CLASS}`}
                              disabled={
                                supplierPending ||
                                (pendingKey !== `supplier:${supplier.name}` && pendingKey !== "")
                              }
                              type="submit"
                            >
                              {supplierPending ? "저장 중..." : "납품처 저장"}
                            </button>
                          </div>
                          <p className="m-0 mt-2 text-sm text-slate-600">
                            사업자등록번호 {supplier.businessRegistrationNumber || "-"} · 대표자{" "}
                            {supplier.representativeName || "-"} · 연결 상품 {supplier.productCount}개
                          </p>
                          <p className="m-0 mt-1 text-sm text-slate-600">
                            연락처 {supplier.phone || "-"} · 이메일 {supplier.email || "-"}
                          </p>
                          <p className="m-0 mt-1 text-sm text-slate-600">
                            주소 {supplier.address || "-"}
                          </p>
                        </form>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
