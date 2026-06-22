import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
        padding: "2.5rem 1.25rem",
      }}
    >
      <div
        style={{
          maxWidth: "64rem",
          minHeight: "calc(100vh - 5rem)",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "2rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <p
            style={{
              margin: 0,
              color: "#0f766e",
              fontSize: "0.875rem",
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Auto Order
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            Auto Order
          </h1>
          <p
            style={{
              maxWidth: "42rem",
              margin: 0,
              color: "#334155",
              fontSize: "1.125rem",
              lineHeight: 1.8,
            }}
          >
            지사 주문 취합 및 납품처 발주 파일 생성 시스템.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          <Link
            href="/branch"
            style={{
              display: "flex",
              minHeight: "8rem",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.5rem",
              background: "#0f766e",
              color: "#ffffff",
              padding: "1.25rem 1.5rem",
              fontSize: "1.25rem",
              fontWeight: 600,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
            }}
          >
            지사 주문
          </Link>
          <Link
            href="/admin"
            style={{
              display: "flex",
              minHeight: "8rem",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.5rem",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              padding: "1.25rem 1.5rem",
              fontSize: "1.25rem",
              fontWeight: 600,
            }}
          >
            본사 관리자
          </Link>
        </div>
      </div>
    </main>
  );
}
