import { describe, expect, it } from "vitest";

import { normalizeProductMasterRow } from "@/lib/domain/product-master";

describe("normalizeProductMasterRow", () => {
  it("maps Korean headers to product fields and trims string values", () => {
    expect(
      normalizeProductMasterRow({
        "바코드 번호": " 88010001 ",
        상품코드: " P-001 ",
        상품명: " 생수 ",
        규격: " 500ml ",
        "납품 거래처명": " 샘물유통 ",
        단가: " 1250.5 ",
      }),
    ).toEqual({
      barcode: "88010001",
      productCode: "P-001",
      name: "생수",
      spec: "500ml",
      supplierName: "샘물유통",
      unitPrice: 1250.5,
    });
  });

  it("defaults an empty unit price to zero", () => {
    expect(
      normalizeProductMasterRow({
        "바코드 번호": "88010001",
        상품코드: "P-001",
        상품명: "생수",
        규격: "",
        "납품 거래처명": "샘물유통",
        단가: "   ",
      }),
    ).toEqual({
      barcode: "88010001",
      productCode: "P-001",
      name: "생수",
      spec: "",
      supplierName: "샘물유통",
      unitPrice: 0,
    });
  });

  it("throws when a required field is blank", () => {
    expect(() =>
      normalizeProductMasterRow({
        "바코드 번호": "88010001",
        상품코드: "P-001",
        상품명: "생수",
        규격: "500ml",
        "납품 거래처명": "   ",
        단가: "1000",
      }),
    ).toThrowError("납품 거래처명 값이 없습니다.");
  });

  it("throws when unit price is not numeric", () => {
    expect(() =>
      normalizeProductMasterRow({
        "바코드 번호": "88010001",
        상품코드: "P-001",
        상품명: "생수",
        규격: "500ml",
        "납품 거래처명": "샘물유통",
        단가: "천원",
      }),
    ).toThrowError("단가를 숫자로 입력해 주세요.");
  });
});
