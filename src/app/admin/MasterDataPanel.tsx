"use client";

import { useRef, useState, type FormEvent } from "react";

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

type SaveResponse = {
  importedCount?: number;
  report?: {
    sheetName?: string;
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    replacedExisting?: boolean;
  };
  error?: string;
  errors?: Array<{
    rowNumber: number;
    reason: string;
  }>;
};

export default function MasterDataPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadPendingKey, setUploadPendingKey] = useState("");
  const [branchUploadFile, setBranchUploadFile] = useState<File | null>(null);
  const [supplierUploadFile, setSupplierUploadFile] = useState<File | null>(null);
  const [uploadRowErrors, setUploadRowErrors] = useState<SaveResponse["errors"]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const branchFileInputRef = useRef<HTMLInputElement>(null);
  const supplierFileInputRef = useRef<HTMLInputElement>(null);

  async function uploadMasterFile(
    event: FormEvent<HTMLFormElement>,
    kind: "branches" | "suppliers",
  ) {
    event.preventDefault();

    const file = kind === "branches" ? branchUploadFile : supplierUploadFile;

    if (!file) {
      setError(
        kind === "branches"
          ? "전국지사현황 엑셀을 선택해 주세요."
          : "납품업체리스트 엑셀을 선택해 주세요.",
      );
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

      const reportText = data.report
        ? ` 시트: ${data.report.sheetName ?? "-"}, 읽은 행: ${data.report.totalRows ?? 0}, 건너뜀: ${data.report.skippedRows ?? 0}.`
        : "";
      setNotice(
        kind === "branches"
          ? `${data.importedCount ?? 0}건의 지사 정보를 반영했습니다.${reportText}`
          : `${data.importedCount ?? 0}건의 납품처 정보를 반영했습니다.${reportText}`,
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
          <h2 className="m-0 text-xl font-bold sm:text-2xl">지사/납품처 엑셀 관리</h2>
          <p className="mt-1 text-sm text-slate-600">
            전국지사현황.xlsx와 납품업체리스트.xlsx 파일로만 추가/수정합니다.
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
                  accept=".xlsx,.xlsm,.xls"
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
                  accept=".xlsx,.xlsm,.xls"
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
        </div>
      ) : null}
    </section>
  );
}
