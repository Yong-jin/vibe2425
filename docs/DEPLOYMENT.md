# 배포 준비·절차·검증 기록

확인일: **2026-10-25 (한국 시간)**. 제안 서비스는 **Vercel Hobby + Supabase Free**다. 이 문서는 배포 실행 절차와 현재 확인 범위를 기록한다. **아직 배포하지 않았으며 배포 주소도 없다.** [인수 기준 점검](./ACCEPTANCE.md)의 AC 15가 실패한 상태라 live 공개 배포를 중단한다.

## 1. 공식 무료 조건과 배포 중단 조건

| 서비스 | 2026-10-25에 확인한 공식 조건 | 현재 판단 |
| --- | --- | --- |
| Vercel Hobby | [공식 Hobby 설명](https://vercel.com/docs/plans/hobby): 무료, **개인·비상업적 용도**. 포함 사용량에는 월 100만 함수 호출, 100GB Fast Data Transfer 등이 있으며 한도 초과 시 기능 이용이 제한될 수 있다. [Node.js 버전 안내](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)는 22.x 지원을 명시한다. | 프로젝트는 Node 22.x와 맞는다. 실제 서비스 목적이 개인·비상업적 범위에 드는지 사용자가 확인해야 한다. |
| Supabase Free | [공식 요금표](https://supabase.com/pricing): 무료 활성 프로젝트 2개, DB 500MB, 5GB egress, 1주 비활동 후 프로젝트 일시 중지. [일시 중지 안내](https://supabase.com/docs/guides/platform/free-project-pausing)도 확인했다. | 사용량·휴면 중지를 운영 제약으로 수용할지 결정해야 한다. 실제 프로젝트 사용량은 확인하지 않았다. |
| KOBIS Open API | [공식 이용안내](https://www.kobis.or.kr/kobisopenapi/homepg/board/findServiceGuideList.do): 회원 가입과 발급 키가 필요하다. [공식 이용약관 제6조](https://www.kobis.or.kr/kobisopenapi/homepg/board/findProvisionInfo.do)는 제공 결과의 복제·저장을 금지한다. 제공 결과의 출처 표기도 요구한다. | **배포 중단.** 현재 `saveCachedPeriod`와 Supabase 테이블이 API 결과를 저장한다. 이 배포 방식에 대한 별도 이용 허락을 확인하거나 저장하지 않는 설계로 변경해야 한다. 계정별 호출 한도도 아직 확인하지 못했다. |

Vercel/Supabase의 무료 조건만 충족해도 KOBIS 조건이 해결되지 않으면 live 배포를 진행하지 않는다. 기존 DB에 저장된 자료의 처리도 허락 범위 확인 후 결정한다. 이 문서는 약관 허락이나 배포 승인을 대신하지 않는다.

## 2. 실제 배포 절차 — 중단 조건 해소 후 순서대로

다음은 실행할 순서다. **[직접]**은 계정 소유자가 로그인하거나 비밀값을 다루어야 하는 단계다. 현재 상태에서는 5단계의 공개 배포를 실행하지 않는다.

| 순서 | 실행할 일 | 완료 확인 |
| --- | --- | --- |
| **0. 중단 조건 해소** | **[직접]** KOBIS에 현재 저장·분석 방식의 이용 가능 여부를 확인하고 근거를 남긴다. 불가하면 DB 저장 경로를 제거하는 설계 변경과 AC 재검증을 먼저 한다. Vercel Hobby 사용 목적과 Supabase Free 용량·휴면 조건도 확인한다. `AGENTS.md`의 배포용 비밀값 주입 규칙 변경안을 검토·승인한다. | AC 15 통과 및 배포 대상·설정 승인. 현재 **미완료**. |
| **1. 계정 인증·DB 준비** | **[직접]** GitHub, Vercel, Supabase에 로그인한다. 허락받은 저장 설계를 사용할 경우 Supabase 프로젝트를 준비하고, 새 프로젝트에 한해 `supabase/migrations/202610250001_box_office_cache.sql`을 검토한 뒤 적용한다. 기존 프로젝트에 다시 실행하지 않는다. SQL Editor를 사용하면 [Supabase 공식 안내](https://supabase.com/docs/guides/deployment/database-migrations)대로 CLI migration 이력과 별도임을 기록한다. | 올바른 프로젝트와 DB 스키마·권한을 확인한다. |
| **2. 배포 대상 연결** | **[직접]** Vercel에서 GitHub 저장소 `Yong-jin/vibe2425`를 가져온다. Production Branch를 `main`, Root Directory를 저장소 루트(`./`)로 선택한다. Git 연동은 [Vercel 공식 안내](https://vercel.com/docs/git/vercel-for-github)를 따른다. | 대상 저장소·브랜치·계정이 정확하다. |
| **3. 빌드 설정** | Framework Preset **Next.js**, Node.js **22.x**, Install Command `npm ci`, Build Command `npm run build`, Output Directory는 Next.js 기본값을 사용한다. [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build)에서 확인한다. | 빌드가 Node 22.x에서 성공한다. |
| **4. 환경변수 설정** | **[직접]** 아래 표의 이름을 Vercel 프로젝트 **Production** 환경변수에 등록한다. 실제 값은 Vercel 설정 화면에만 입력한다. Preview를 쓸 경우 환경을 별도로 지정한다. [Vercel 환경변수 안내](https://vercel.com/docs/environment-variables)에 따르면 설정 변경은 새 배포에만 적용된다. | 이름·대상 환경을 확인하고 값은 문서·로그에 남기지 않는다. |
| **5. 배포** | **[직접 또는 명시적 배포 승인 후 담당자]** Vercel에서 배포를 실행한다. `main` 연결 후 푸시하면 새 배포가 자동 생성될 수 있으므로 0~4단계를 먼저 끝낸다. 빌드가 실패하면 공개 주소를 정상이라고 보고하지 않는다. | Production 배포 상태가 Ready이고 URL을 기록한다. 현재 **미실행**. |
| **6. 배포 주소 확인** | 아래 검증표의 목록·인사이트·오류 복구·키 경계·DB 캐시를 실제 URL에서 확인한다. | 각 항목에 관찰 시각·결과·근거를 기록한다. 현재 **미실행**. |

### 환경변수 저장 위치

| 이름 | 로컬 | 배포 환경 | 브라우저 사용 |
| --- | --- | --- | --- |
| `DATA_MODE` | `.env.local`에서 `demo` 또는 `live` | Vercel Production에서 배포 목적에 맞는 모드 | 모드 표시는 가능하나 설정값을 직접 비밀값처럼 다루지 않는다. |
| `KOBIS_API_KEY` | `.env.local`만 | live 허락 후 Vercel의 **서버 환경변수** | **금지** |
| `SUPABASE_URL` | `.env.local` | 승인된 저장 설계에서 Vercel 서버 환경변수 | 이 프로젝트는 서버에서만 사용 |
| `SUPABASE_SECRET_KEY` | `.env.local`만 | 승인된 저장 설계에서 Vercel의 **서버 환경변수** | **금지** |

현재 [AGENTS.md](../AGENTS.md)는 비밀값을 프로젝트 파일 중 `.env.local`에만 두도록 규정하며, 호스팅 주입은 **배포 전에 별도로 결정**하도록 한다. 위 Vercel 서버 환경변수 방식은 그 결정에 대한 구체적 제안이며, 규칙 변경·배포 승인이 완료됐다는 뜻이 아니다. `.env.local` 자체는 업로드하지 않는다. `.env.example`에는 이름과 빈 값만 둔다. Git, README/이 문서, 소스·테스트 fixture, 브라우저 코드·번들·요청·응답, 배포 로그, 이슈·채팅에는 실제 값을 절대 넣지 않는다. `NEXT_PUBLIC_`를 비밀값 이름에 붙이지 않는다.

## 3. 배포 주소 검증표

이 표는 **배포 URL에서의 실제 관찰**만 기록한다. 로컬 통과를 배포 통과로 바꾸지 않는다.

| 항목 | 판정 | 현재 근거 또는 미실행 이유 |
| --- | --- | --- |
| 배포 주소 `/`가 열리고 일간·주간·주말 목록과 실제 집계 기간이 맞음 | **미실행** | 배포 주소가 없고 실제 KOBIS 주간·주말 대조도 남았다. |
| 영화명 검색과 정상 빈 결과·검색 결과 없음·오류가 구별됨 | **미실행** | 로컬 demo 브라우저 테스트만 통과했다. |
| `/insights`의 7/14/30일 진행률·결측·Top·보조 수치가 맞음 | **미실행** | 로컬 demo fixture 검산만 통과했다. |
| 같은 live 날짜 첫 조회 `kobis`, 재조회 `cache`와 실제 DB 읽기 확인 | **미실행** | 과거 로컬 실연동 기록은 있으나 배포 URL 검증이 없고 KOBIS 저장 약관 해결 전에는 live 저장을 실행하지 않는다. |
| 오류 복구·재시도와 비밀값 비노출·서버 로그 확인 | **미실행** | 배포 URL·배포 로그가 없다. |
| 무료 조건·약관·운영 한도 적합성 | **실패** | 현재 KOBIS 저장 약관과 캐시 설계가 충돌한다. |

관련 로컬 근거는 [ACCEPTANCE.md](./ACCEPTANCE.md)에 따로 있다. 배포 후에는 위 **미실행** 항목을 실제 URL·확인 시각·기대값·관찰값으로 갱신한다.

## 4. 변경·복구 절차

- **환경변수 변경:** **[직접]** 제공처에서 값을 교체하고 Vercel의 해당 환경(Production/Preview) 값을 바꾼 뒤 새 배포를 만든다. [Vercel 공식 안내](https://vercel.com/docs/environment-variables)는 이전 배포에 새 값이 적용되지 않는다고 설명한다. 새 배포 URL에서 정상 조회와 비노출을 다시 확인한다.
- **배포 롤백:** Vercel Dashboard에서 이전 정상 Production 배포로 Instant Rollback한다. [공식 롤백 안내](https://vercel.com/docs/instant-rollback)에 따르면 Hobby는 **바로 이전** 배포로만 롤백할 수 있다. 롤백은 DB 내용·스키마를 되돌리지 않고 환경변수도 자동으로 갱신하지 않는다. 되돌린 버전과 DB 계약·키 유효성을 확인하고 도메인 자동 배포 재개 상태도 확인한다.
- **키 노출:** 노출된 값을 다시 출력하지 않는다. 노출 위치·범위를 기록하고 해당 제공처에서 키를 폐기·재발급한다. **[직접]** 로컬 `.env.local` 및 승인된 호스팅 비밀값을 교체하고 새 배포를 만든다. 오래된 배포 URL은 이전 키를 계속 사용할 수 있으므로 접근과 로그를 확인한다. [Vercel 키 교체 안내](https://vercel.com/docs/environment-variables/rotating-secrets)를 따른다. Git에 포함됐다면 해당 키는 즉시 폐기하고 이력 처리 범위를 별도로 결정한다.

## 5. 다른 컴퓨터에서 재현하는 절차와 이번 확인 범위

새 컴퓨터에서는 [README.md](../README.md)의 Node 22.x 준비 → `git clone` → `npm ci` → `.env.example`을 `.env.local`로 복사 → `DATA_MODE=demo` → `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `npm run dev` 순서로 확인한다. Playwright Chromium 설치가 필요하면 README의 도구 설치 단계를 먼저 수행한다. 샘플 2026-09-13의 목록 3건과 `/insights` 7일 정상 7건, 2026-09-06의 정상 빈 결과를 확인한다. 비밀키 없이 이 단계까지 가능하다. live 재현에는 적법한 이용 조건, 서버 키, 허락된 DB 설정과 실제 KOBIS·Supabase 접근이 필요하다.

**이번에 실제 확인한 범위:** 같은 Windows PC의 별도 폴더에 현재 커밋을 새로 복제했다. `.env.local`이 복사되지 않은 것을 확인하고 **Node 22.23.4**로 `npm ci`, `npm run test`(28개), `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`(9개)를 모두 통과했다. 그 빌드의 `/`, `/insights`는 HTTP 200, demo API는 2026-09-13에 3건/ok, 2026-09-06에 0건/empty였다. 검증용 폴더와 서버는 이후 삭제·중지했다. 중첩 체크아웃 때문에 Next.js가 상위 저장소의 lockfile을 무시했다는 경고는 있었지만 빌드는 성공했다.

**확인하지 못한 범위:** 실제 다른 PC·운영체제, 새 GitHub 계정 권한, Vercel 빌드와 배포 URL, 새 Supabase 프로젝트의 스키마 적용·RLS, live 키 주입·KOBIS 조건 적합성이다. 이를 로컬 demo 성공으로 대체하지 않는다.
