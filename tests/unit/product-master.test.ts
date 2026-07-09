import { describe, expect, it } from "vitest";

import { getMissingRequiredProductMasterHeaders, normalizeProductMasterRow } from "@/lib/domain/product-master";

describe("normalizeProductMasterRow", () => {
  it("maps the current product master format", () => {
    expect(
      normalizeProductMasterRow({
        상품코드: " 88010001 ",
        상품명: " 생수 ",
        납품처: " 샘물유통 ",
        계약단가: " 1,250 ",
      }),
    ).toEqual({
      barcode: "88010001",
      productCode: "88010001",
      name: "생수",
      spec: "",
      supplierName: "샘물유통",
      unitPrice: 1250,
      minimumOrderQuantity: null,
    });
  });

  it("maps the older upload format", () => {
    expect(
      normalizeProductMasterRow({
        "바코드 번호": " 88010001 ",
        상품코드: " P-001 ",
        상품명: " 생수 ",
        규격: " 500ml ",
        "납품 거래처명": " 샘물유통 ",
        공급가: " 1250.5 ",
      }),
    ).toEqual({
      barcode: "88010001",
      productCode: "P-001",
      name: "생수",
      spec: "",
      supplierName: "샘물유통",
      unitPrice: 1250.5,
      minimumOrderQuantity: null,
    });
  });

  it("maps minimum order quantity and ignores zero values", () => {
    expect(
      normalizeProductMasterRow({
        상품코드: "88010001",
        상품명: "생수",
        거래처: "샘물유통",
        공급가: "1000",
        최소발주수량: "12",
      }),
    ).toMatchObject({
      minimumOrderQuantity: 12,
    });

    expect(
      normalizeProductMasterRow({
        상품코드: "88010001",
        상품명: "생수",
        거래처: "샘물유통",
        공급가: "1000",
        최소발주수량: "0",
      }),
    ).toMatchObject({
      minimumOrderQuantity: null,
    });
  });

  it("defaults a blank supplier to an unspecified supplier", () => {
    expect(
      normalizeProductMasterRow({
        상품코드: "88010001",
        상품명: "생수",
        납품처: "   ",
        계약단가: "1000",
      }),
    ).toMatchObject({
      supplierName: "납품처 미지정",
    });
  });

  it("normalizes the circled company marker in supplier names", () => {
    expect(
      normalizeProductMasterRow({
        상품코드: "88010001",
        상품명: "생수",
        납품처: " ㈜샘물유통 ",
        계약단가: "1000",
      }),
    ).toMatchObject({
      supplierName: "(주)샘물유통",
    });
  });

  it("throws when unit price is not numeric", () => {
    expect(() =>
      normalizeProductMasterRow({
        상품코드: "88010001",
        상품명: "생수",
        납품처: "샘물유통",
        계약단가: "천원",
      }),
    ).toThrowError("단가를 숫자로 입력해 주세요.");
  });
});

describe("getMissingRequiredProductMasterHeaders", () => {
  it("accepts the current product master headers", () => {
    expect(getMissingRequiredProductMasterHeaders(["구분", "상품코드", "상품명", "납품처", "계약단가"])).toEqual([]);
  });

  it("requires product code and product name", () => {
    expect(getMissingRequiredProductMasterHeaders(["상품코드", "계약단가"])).toEqual(["상품명"]);
  });
});
