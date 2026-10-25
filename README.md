# 영화 박스오피스 인사이트 대시보드

KOBIS 일간·주간·주말 박스오피스 목록과 최근 7/14/30일의 **일별 Top 10 관측 데이터** 추이를 보는 Next.js 프로젝트다. 로그인 없이 목록 검색과 인사이트 화면을 사용할 수 있다. 처음에는 비밀키가 필요 없는 **demo 모드**로 실행할 수 있다.

## 필요한 환경

- Node.js **22.x** (`.node-version`은 `22.23.4`), npm, Git
- 화면 자동 테스트를 실행할 경우 Playwright Chromium
- 프레임워크: Next.js App Router **16.4.3**, React **19.3.0**, TypeScript 5 계열

## 처음 실행 — 키 없이 demo 모드

```sh
git clone https://github.com/Yong-jin/vibe2425.git
cd vibe2425
npm ci
```

`.env.example`을 `.env.local`로 복사한다. Windows PowerShell은 `Copy-Item .env.example .env.local`, macOS/Linux는 `cp .env.example .env.local`을 사용한다. 파일의 `DATA_MODE=demo`를 유지하고 나머지 키는 빈 값으로 둔다. 실제 키는 넣을 필요가 없다.

```sh
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다. 목록은 2026-09-07~13의 가상 영화 3편을 보여준다. 2026-09-06 조회는 **정상 빈 결과**다. `/insights`에서 종료일 2026-09-13을 선택하면 7일은 정상 7건, 14일은 정상 7·빈 날짜 7건, 30일은 정상 7·빈 날짜 23건이다.

## 등록된 명령

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 로컬 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 후 프로덕션 서버 |
| `npm run lint` | ESLint 검사 |
| `npm run typecheck` | Next.js 타입 생성 및 TypeScript 검사 |
| `npm run test` | Vitest 단위 테스트 |
| `npm run test:e2e` | Playwright 화면 테스트 (기본 demo 서버를 3100번 포트에 시작) |
| `npm run verify:data -- --date=YYYY-MM-DD --period=daily` | 저장본·원본·KOBIS 읽기 전용 비교. live 설정과 기존 저장본이 필요함 |

처음 화면 테스트를 실행할 때 Chromium이 없으면 `npx playwright install chromium`으로 설치한다. 기본 `test:e2e`는 자체 demo 개발 서버를 띄우므로 같은 저장소에서 실행 중인 `npm run dev`를 먼저 종료한다. 검사는 `npm run test` → `npm run lint` → `npm run typecheck` → `npm run build` → `npm run test:e2e` 순으로 실행할 수 있다.

## 환경변수 이름과 보안

`.env.example`에 실제 이름과 빈 값이 있다.

| 이름 | 의미 |
| --- | --- |
| `DATA_MODE` | `demo`는 가상 자료, `live`는 실제 KOBIS·DB 경로 |
| `KOBIS_API_KEY` | live 서버의 KOBIS 호출용 비밀키 |
| `SUPABASE_URL` | live 서버의 Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | live 서버의 DB 접근용 비밀키 |

로컬 비밀값은 Git에서 제외된 `.env.local`에만 둔다. 키를 브라우저 코드·`NEXT_PUBLIC_` 변수·Git·문서·로그·이슈에 넣지 않는다. 서버가 내부 API를 통해 KOBIS와 DB에 접근한다. `.env.local` 내용을 화면이나 지원 요청에 붙여 넣지 않는다.

**live 공개 배포는 현재 보류 중이다.** [AC 점검](./docs/ACCEPTANCE.md)에서 KOBIS 공식 약관의 결과 저장 금지 문구와 현재 DB 캐시 방식의 충돌을 확인했다. 저장 방식의 이용 허락 또는 설계 변경과 재검증이 필요하다. 배포 준비 순서, 무료 조건, 수동 설정 단계, 검증표는 [배포 문서](./docs/DEPLOYMENT.md)를 따른다.

프로젝트의 요구사항은 [PRD](./PRD.md), 처리 구조는 [ARCHITECTURE](./ARCHITECTURE.md), API·캐시 설명은 [API 안내](./docs/API_GUIDE.md)에 있다.
