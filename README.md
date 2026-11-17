# Auto Order

지사 주문 취합 및 납품처 발주 자동화 MVP입니다.

## Stack

- Next.js
- Supabase
- Vercel
- Vitest
- ExcelJS

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill Supabase environment variables.
3. Install dependencies with `npm install`.
4. Run `npm run dev`.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
RESEND_API_KEY=
ORDER_EMAIL_FROM=
```

`ORDER_EMAIL_FROM`은 Resend에서 인증된 도메인의 발신 주소를 사용합니다. 예: `orders@your-domain.com`.

## Main Routes

- `/branch`: 지사용 PWA 주문 화면
- `/admin`: 본사 관리자 화면

## Deployment Notes

1. Supabase SQL Editor에서 `supabase/migrations`의 마이그레이션을 번호순으로 실행합니다.
2. Vercel 환경변수에 위 값을 모두 등록한 뒤 재배포합니다.
3. 자동 마감은 Vercel Cron이 `/api/admin/auto-close`를 호출하고, `CRON_SECRET`으로 보호됩니다.
4. 상품/지사/납품처 엑셀 업로드는 DB RPC로 교체 반영됩니다. 중간 실패 시 전체 작업이 롤백됩니다.
5. `.xls` 파일 지원을 위해 `xlsx` 패키지를 함께 사용합니다. 관리자 전용 업로드, 5MB 제한, 필수 헤더/행 검증으로 노출 범위를 줄였습니다. 가능하면 원본 파일을 `.xlsx`로 저장해 업로드하는 것을 권장합니다.

## Operations Notes

- 자동 마감 Cron(`vercel.json`)은 UTC 05:00 = 한국 시간 14:00에 실행됩니다. Vercel Hobby 플랜은 지정한 시각이 아니라 해당 시간대(14:00~14:59) 안에서 실행될 수 있습니다.
- 마감·메일 재발송 API는 납품처별로 메일을 순차 발송하므로 `maxDuration = 60`으로 설정되어 있습니다.
- `main` 브랜치에 push/merge 하면 Vercel이 자동으로 운영 배포합니다. 빌드가 실패하면 기존 배포가 그대로 유지됩니다.
- 실제 거래처·상품 엑셀(`*.xlsx`, `*.xls`)은 `.gitignore`로 제외되어 있습니다. 이 저장소는 공개 저장소이므로 커밋하지 마세요.

## Verification

```bash
npm test
npm run build
```
