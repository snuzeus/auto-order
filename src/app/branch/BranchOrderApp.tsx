"use client";

import { useEffect, useMemo, useState } from "react";

import { calculateOrderTotals } from "@/lib/domain/order-totals";
import { upsertOrderItem } from "@/lib/domain/branch-order-state";
import type { Branch, OrderItemDraft, OrderStatus, Product } from "@/lib/types";

type BranchResponse = {
  branches?: Branch[];
  error?: string;
};

type ProductSearchResponse = {
  products?: Product[];
  error?: string;
};

type OrderResponse = {
  order?: {
    id: string;
    status: OrderStatus;
    branchId: string;
    orderDate: string;
    items: OrderItemDraft[];
  } | null;
  error?: string;
};

const BRANCH_STORAGE_KEY = "auto-order-branch-id";

function todayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const date = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function draftStorageKey(branchId: string, orderDate: string): string {
  return `auto-order-branch-draft:${branchId}:${orderDate}`;
}

function hasActiveItems(items: OrderItemDraft[]): boolean {
  return items.some((item) => item.quantity > 0);
}

export default function BranchOrderApp() {
  const orderDate = todayYmd();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [items, setItems] = useState<OrderItemDraft[]>([]);
  const [syncedItems, setSyncedItems] = useState<OrderItemDraft[]>([]);
  const [orderStatus, setOrderStatus] = useState<"not_submitted" | OrderStatus>("not_submitted");
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchTouched, setSearchTouched] = useState(false);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [manualName, setManualName] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [manualSpec, setManualSpec] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualMemo, setManualMemo] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitNotice, setSubmitNotice] = useState("");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  useEffect(() => {
    const storedBranchId = window.localStorage.getItem(BRANCH_STORAGE_KEY) ?? "";
    if (storedBranchId) {
      setSelectedBranchId(storedBranchId);
    }

    const controller = new AbortController();

    async function loadBranches() {
      setBranchesLoading(true);
      setBranchesError("");

      try {
        const response = await fetch("/api/branches", {
          signal: controller.signal,
        });
        const data = (await response.json()) as BranchResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "지사 목록을 불러오지 못했습니다.");
        }

        setBranches(data.branches ?? []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setBranchesError(
          error instanceof Error ? error.message : "지사 목록을 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setBranchesLoading(false);
        }
      }
    }

    loadBranches();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedBranchId) {
      setItems([]);
      setSyncedItems([]);
      setOrderStatus("not_submitted");
      setOrderError("");
      return;
    }

    const controller = new AbortController();

    async function loadOrder() {
      setOrderLoading(true);
      setOrderError("");
      setSubmitNotice("");

      try {
        const response = await fetch(
          `/api/orders?branchId=${encodeURIComponent(selectedBranchId)}&orderDate=${encodeURIComponent(orderDate)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as OrderResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "주문 정보를 불러오지 못했습니다.");
        }

        const serverItems = data.order?.items ?? [];
        setSyncedItems(serverItems);

        const localDraftRaw = window.localStorage.getItem(draftStorageKey(selectedBranchId, orderDate));
        let localDraft: OrderItemDraft[] | null = null;

        if (localDraftRaw) {
          try {
            const parsedDraft = JSON.parse(localDraftRaw) as unknown;
            localDraft = Array.isArray(parsedDraft) ? (parsedDraft as OrderItemDraft[]) : null;
          } catch {
            localDraft = null;
          }
        }

        if (localDraft && Array.isArray(localDraft) && localDraft.length > 0) {
          setItems(localDraft);
          setOrderStatus(data.order?.status ?? "not_submitted");
        } else {
          setItems(serverItems);
          setOrderStatus(data.order?.status ?? "not_submitted");
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setOrderError(
          error instanceof Error ? error.message : "주문 정보를 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setOrderLoading(false);
        }
      }
    }

    loadOrder();

    return () => controller.abort();
  }, [orderDate, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      return;
    }

    if (items.length === 0) {
      window.localStorage.removeItem(draftStorageKey(selectedBranchId, orderDate));
      return;
    }

    window.localStorage.setItem(
      draftStorageKey(selectedBranchId, orderDate),
      JSON.stringify(items),
    );
  }, [items, orderDate, selectedBranchId]);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();

    async function searchProducts() {
      setSearchLoading(true);
      setSearchError("");

      try {
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as ProductSearchResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "상품 검색에 실패했습니다.");
        }

        setSearchResults(data.products ?? []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSearchError(
          error instanceof Error ? error.message : "상품 검색에 실패했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }

    searchProducts();

    return () => controller.abort();
  }, [query]);

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const totals = useMemo(() => calculateOrderTotals(items), [items]);
  const hasPendingDraft = hasActiveItems(items);
  const isDirty = JSON.stringify(items) !== JSON.stringify(syncedItems);
  const isClosed = orderStatus === "closed";
  const canSubmit =
    Boolean(selectedBranchId) &&
    hasPendingDraft &&
    isDirty &&
    !submitPending &&
    !isClosed &&
    !orderLoading;
  const showManualForm =
    searchTouched && query.trim() !== "" && !searchLoading && !searchError && searchResults.length === 0;

  function handleBranchChange(nextBranchId: string) {
    if (nextBranchId === selectedBranchId) {
      return;
    }

    if (hasPendingDraft && isDirty) {
      const confirmed = window.confirm(
        "아직 제출하지 않은 주문 항목이 있습니다. 지사를 변경할까요?",
      );

      if (!confirmed) {
        return;
      }
    }

    setItems([]);
    setSyncedItems([]);
    setOrderStatus("not_submitted");
    setOrderError("");
    setSubmitError("");
    setSubmitNotice("");
    setConfirmingSubmit(false);
    setQuery("");
    setSearchResults([]);
    setSearchTouched(false);
    setManualBarcode("");
    setManualName("");
    setManualSpec("");
    setManualMemo("");
    setSelectedBranchId(nextBranchId);
    window.localStorage.setItem(BRANCH_STORAGE_KEY, nextBranchId);
  }

  function addRegisteredProduct(product: Product) {
    const quantity = Math.max(1, Math.floor(productQuantities[product.id] ?? 1));
    const nextItem: OrderItemDraft = {
      productId: product.id,
      barcode: product.barcode,
      productCode: product.productCode,
      productName: product.name,
      spec: product.spec,
      supplierName: product.supplierName,
      quantity,
      isUnregistered: false,
    };

    setItems((currentItems) => upsertOrderItem(currentItems, nextItem));
    setSubmitError("");
    setSubmitNotice("");
  }

  function addManualItem() {
    const trimmedBarcode = manualBarcode.trim();
    const trimmedName = manualName.trim();
    const trimmedSpec = manualSpec.trim();
    const trimmedMemo = manualMemo.trim();

    if (!trimmedBarcode) {
      setSubmitError("수기 바코드 또는 식별값을 입력해 주세요.");
      return;
    }

    if (!trimmedName) {
      setSubmitError("수기 상품명은 반드시 입력해야 합니다.");
      return;
    }

    const nextItem: OrderItemDraft = {
      barcode: trimmedBarcode,
      productName: trimmedName,
      spec: trimmedSpec,
      quantity: Math.max(1, Math.floor(manualQuantity)),
      isUnregistered: true,
      memo: trimmedMemo || undefined,
    };

    setItems((currentItems) => upsertOrderItem(currentItems, nextItem));
    setQuery("");
    setSearchResults([]);
    setSearchTouched(false);
    setManualBarcode("");
    setManualName("");
    setManualSpec("");
    setManualQuantity(1);
    setManualMemo("");
    setSubmitError("");
    setSubmitNotice("");
  }

  function updateItemQuantity(barcode: string, quantity: number) {
    const item = items.find((entry) => entry.barcode === barcode);
    if (!item) {
      return;
    }

    setItems((currentItems) =>
      upsertOrderItem(currentItems, {
        ...item,
        quantity: Math.max(0, Math.floor(quantity)),
      }),
    );
    setSubmitError("");
    setSubmitNotice("");
  }

  async function submitOrder() {
    if (!selectedBranchId) {
      setSubmitError("먼저 지사를 선택해 주세요.");
      return;
    }

    setSubmitPending(true);
    setSubmitError("");
    setSubmitNotice("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId: selectedBranchId,
          orderDate,
          items,
        }),
      });

      const data = (await response.json()) as OrderResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "주문 제출에 실패했습니다.");
      }

      const submittedItems = data.order?.items ?? items.filter((item) => item.quantity > 0);
      setItems(submittedItems);
      setSyncedItems(submittedItems);
      setOrderStatus("submitted");
      setConfirmingSubmit(false);
      setSubmitNotice("주문이 제출되었습니다.");
      window.localStorage.removeItem(draftStorageKey(selectedBranchId, orderDate));
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "주문 제출에 실패했습니다.",
      );
    } finally {
      setSubmitPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="rounded-lg bg-teal-700 px-5 py-6 text-white">
          <p className="m-0 text-sm font-semibold">지사 주문 PWA</p>
          <h1 className="mt-2 text-3xl font-bold">오늘 주문 입력</h1>
          <p className="mt-3 text-base text-teal-50">주문일 {orderDate}</p>
          <p className="mt-2 text-xl font-semibold">
            {selectedBranch ? selectedBranch.name : "지사를 선택해 주세요"}
          </p>
          <p className="mt-2 text-sm text-teal-50">
            상태:{" "}
            {orderStatus === "closed"
              ? "마감됨"
              : orderStatus === "submitted"
                ? "제출됨"
                : "미제출"}
          </p>
        </header>

        <div className="rounded-lg bg-white p-5 shadow-sm">
          <label className="mb-2 block text-base font-semibold" htmlFor="branch-select">
            지사 선택
          </label>
          <select
            id="branch-select"
            className="w-full border border-slate-300 px-4 py-4 text-lg focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            disabled={branchesLoading}
            value={selectedBranchId}
            onChange={(event) => handleBranchChange(event.target.value)}
          >
            <option value="">지사를 선택해 주세요</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {branchesLoading ? <p className="mt-3 text-sm text-slate-600">지사 목록을 불러오는 중입니다.</p> : null}
          {!branchesLoading && branches.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">활성 지사가 없습니다.</p>
          ) : null}
          {branchesError ? <p className="mt-3 text-sm text-red-700">{branchesError}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="m-0 text-sm text-slate-600">상품 줄 수</p>
            <p className="mt-2 text-3xl font-bold">{totals.lineItemCount}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="m-0 text-sm text-slate-600">총 수량</p>
            <p className="mt-2 text-3xl font-bold">{totals.totalQuantity}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="m-0 text-sm text-slate-600">수기 상품</p>
            <p className="mt-2 text-3xl font-bold">{totals.unregisteredItemCount}</p>
          </div>
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm">
          <label className="mb-2 block text-base font-semibold" htmlFor="product-search">
            바코드 또는 상품명 검색
          </label>
          <input
            id="product-search"
            className="w-full border border-slate-300 px-4 py-4 text-lg focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            disabled={!selectedBranchId || isClosed}
            placeholder="예: 8801234567890 또는 생수"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setManualBarcode(event.target.value);
              setSearchTouched(true);
              setSubmitError("");
            }}
          />
          <p className="mt-2 text-sm text-slate-600">
            등록 상품이 없으면 아래에서 수기 상품으로 바로 추가할 수 있습니다.
          </p>
          {isClosed ? <p className="mt-3 text-sm text-red-700">이미 마감된 주문은 수정할 수 없습니다.</p> : null}
          {orderLoading ? <p className="mt-3 text-sm text-slate-600">기존 주문을 불러오는 중입니다.</p> : null}
          {orderError ? <p className="mt-3 text-sm text-red-700">{orderError}</p> : null}
          {searchLoading ? <p className="mt-3 text-sm text-slate-600">상품을 찾는 중입니다.</p> : null}
          {searchError ? <p className="mt-3 text-sm text-red-700">{searchError}</p> : null}

          {searchResults.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {searchResults.map((product) => (
                <div
                  key={product.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <p className="m-0 text-lg font-semibold">{product.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    바코드 {product.barcode} · 규격 {product.spec || "-"} · 납품처 {product.supplierName}
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="text-sm font-medium" htmlFor={`qty-${product.id}`}>
                      수량
                    </label>
                    <input
                      id={`qty-${product.id}`}
                      className="w-full border border-slate-300 px-4 py-3 text-lg sm:w-28"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      type="number"
                      value={productQuantities[product.id] ?? 1}
                      onChange={(event) =>
                        setProductQuantities((current) => ({
                          ...current,
                          [product.id]: Number(event.target.value) || 1,
                        }))
                      }
                    />
                    <button
                      className="w-full bg-teal-700 px-5 py-4 text-lg font-semibold text-white focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-300 sm:w-auto"
                      disabled={!selectedBranchId || isClosed}
                      type="button"
                      onClick={() => addRegisteredProduct(product)}
                    >
                      상품 추가
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {showManualForm ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h2 className="m-0 text-lg font-bold">등록되지 않은 상품</h2>
              <p className="mt-2 text-sm text-slate-700">
                검색 결과가 없어 수기 상품으로 추가할 수 있습니다.
              </p>
              <div className="mt-4 grid gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="manual-barcode">
                    바코드 또는 식별값
                  </label>
                  <input
                    id="manual-barcode"
                    className="w-full border border-slate-300 px-4 py-4 text-lg"
                    value={manualBarcode}
                    onChange={(event) => setManualBarcode(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="manual-name">
                    상품명
                  </label>
                  <input
                    id="manual-name"
                    className="w-full border border-slate-300 px-4 py-4 text-lg"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="manual-spec">
                    규격 또는 메모
                  </label>
                  <input
                    id="manual-spec"
                    className="w-full border border-slate-300 px-4 py-4 text-lg"
                    value={manualSpec}
                    onChange={(event) => setManualSpec(event.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="manual-qty">
                    수량
                  </label>
                  <input
                    id="manual-qty"
                    className="w-full border border-slate-300 px-4 py-4 text-lg"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    type="number"
                    value={manualQuantity}
                    onChange={(event) => setManualQuantity(Number(event.target.value) || 1)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="manual-memo">
                    추가 메모
                  </label>
                  <textarea
                    id="manual-memo"
                    className="w-full border border-slate-300 px-4 py-4 text-lg"
                    rows={3}
                    value={manualMemo}
                    onChange={(event) => setManualMemo(event.target.value)}
                  />
                </div>
                <button
                  className="w-full bg-amber-500 px-5 py-4 text-lg font-semibold text-slate-950 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-300"
                  disabled={!selectedBranchId || isClosed}
                  type="button"
                  onClick={addManualItem}
                >
                  수기 상품 추가
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="m-0 text-xl font-bold">주문 목록</h2>
          {!hasActiveItems(items) ? (
            <p className="mt-3 text-slate-600">아직 담은 상품이 없습니다.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {items
                .filter((item) => item.quantity > 0)
                .map((item) => (
                  <div
                    key={item.barcode}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="m-0 text-lg font-semibold">{item.productName}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.isUnregistered ? "수기 상품" : "등록 상품"} · {item.spec || "규격 없음"}
                        </p>
                        {item.memo ? <p className="mt-1 text-sm text-slate-600">메모: {item.memo}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          aria-label={`${item.productName} 수량 줄이기`}
                          className="min-h-12 min-w-12 border border-slate-300 bg-white px-4 py-3 text-xl font-bold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-100"
                          disabled={isClosed}
                          type="button"
                          onClick={() => updateItemQuantity(item.barcode, item.quantity - 1)}
                        >
                          -
                        </button>
                        <span className="min-w-16 text-center text-2xl font-bold">{item.quantity}</span>
                        <button
                          aria-label={`${item.productName} 수량 늘리기`}
                          className="min-h-12 min-w-12 border border-slate-300 bg-white px-4 py-3 text-xl font-bold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-100"
                          disabled={isClosed}
                          type="button"
                          onClick={() => updateItemQuantity(item.barcode, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-5 shadow-sm">
          {submitError ? <p className="m-0 text-red-700">{submitError}</p> : null}
          {submitNotice ? <p className="m-0 text-teal-700">{submitNotice}</p> : null}

          {confirmingSubmit ? (
            <div className="flex flex-col gap-3">
              <h2 className="m-0 text-xl font-bold">제출 전 최종 확인</h2>
              <p className="m-0 text-slate-700">
                지사: {selectedBranch?.name ?? "-"} / 상품 {totals.lineItemCount}종 / 총 수량 {totals.totalQuantity}
              </p>
              {totals.unregisteredItemCount > 0 ? (
                <p className="m-0 text-amber-700">
                  수기 상품 {totals.unregisteredItemCount}건이 포함되어 있습니다.
                </p>
              ) : null}
              <ul className="m-0 list-disc pl-5 text-slate-700">
                {items
                  .filter((item) => item.quantity > 0)
                  .map((item) => (
                    <li key={`${item.barcode}-confirm`}>
                      {item.productName} {item.quantity}개
                    </li>
                  ))}
              </ul>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className="w-full border border-slate-300 bg-white px-5 py-4 text-lg font-semibold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-100 sm:w-auto"
                  disabled={submitPending}
                  type="button"
                  onClick={() => setConfirmingSubmit(false)}
                >
                  다시 보기
                </button>
                <button
                  className="w-full bg-teal-700 px-5 py-4 text-lg font-semibold text-white focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-300 sm:w-auto"
                  disabled={!canSubmit}
                  type="button"
                  onClick={submitOrder}
                >
                  {submitPending ? "제출 중입니다..." : orderStatus === "submitted" ? "주문 다시 제출" : "최종 제출"}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full bg-teal-700 px-5 py-4 text-lg font-semibold text-white focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-slate-300"
              disabled={!canSubmit}
              type="button"
              onClick={() => setConfirmingSubmit(true)}
            >
              {isClosed
                ? "마감된 주문입니다"
                : submitPending
                  ? "제출 중입니다..."
                  : orderStatus === "submitted"
                    ? "수정한 주문 다시 제출하기"
                    : "주문 확인 후 제출하기"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
