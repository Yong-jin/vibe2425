# KOBIS 박스오피스 API 연동 가이드

확인일: 2026-10-25. [KOBIS 공식 Open API 제공 서비스](https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do)의 [일별](https://www.kobis.or.kr/kobisopenapi/homepg/apiservice/searchServiceInfo.do?serviceId=searchDailyBoxOffice)·[주간/주말](https://www.kobis.or.kr/kobisopenapi/homepg/apiservice/searchServiceInfo.do?serviceId=searchWeeklyBoxOffice) 서비스를 사용한다. 세부 파라미터와 응답 기간은 실제 2026-09-06 요청으로 확인했다. 내부 요청은 `GET /api/boxoffice?date=YYYY-MM-DD&type=daily|weekly|weekend`다.

## 요청과 응답

| 내부 유형 | KOBIS REST 경로 | `targetDt` | `weekGb` | 응답 목록 |
| --- | --- | --- | --- | --- |
| `daily` | `/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json` | 선택일 `YYYYMMDD` | 보내지 않음 | `boxOfficeResult.dailyBoxOfficeList` |
| `weekly` | `/kobisopenapi/webservice/rest/boxoffice/searchWeeklyBoxOfficeList.json` | 선택일이 속한 주의 일요일 `YYYYMMDD` | `0` (월~일) | `boxOfficeResult.weeklyBoxOfficeList` |
| `weekend` | 같은 주간/주말 경로 | 선택일이 속한 주의 일요일 `YYYYMMDD` | `1` (금~일) | `boxOfficeResult.weeklyBoxOfficeList` |

| KOBIS 파라미터 | 사용 방식 | 이유 |
| --- | --- | --- |
| `key` | 서버의 `KOBIS_API_KEY`를 요청 시에만 주입 | 인증. 브라우저·응답·로그·문서에 값을 내보내지 않음 |
| `targetDt` | 위 표의 8자리 날짜 | 내부의 `YYYY-MM-DD`를 변환. 주간·주말은 일요일로 고정해 같은 주의 요청을 일치시킴 |
| `itemPerPage` | `10` | 상위 10편 조회 |
| `weekGb` | 주간 `0`, 주말 `1` | 주중 `2`는 서비스 범위 밖 |
| `multiMovieYn`, `repNationCd`, `wideAreaCd` | 보내지 않음 | 영화·국적·지역 필터 없이 전체 목록 요청 |

성공 JSON은 `boxOfficeResult.showRange`에 `YYYYMMDD~YYYYMMDD` 집계 기간을, 위 표의 목록에 영화별 행을 담는다. `showRange`는 서버가 계산한 기대 범위와 대조한다. KOBIS의 `faultInfo`는 HTTP 200이어도 오류다. 정상 빈 목록 `[]`만 내부 `200`/`meta.status=empty`로 반환한다.

실제 확인: 2026-09-06 요청에서 일간은 `2026-09-06~2026-09-06`, 주간은 `2026-08-31~2026-09-06`, 주말은 `2026-09-04~2026-09-06`을 반환했고, 각 목록에 10건이 있었다. 이는 당시 응답에 대한 확인이며 향후 데이터 정정 가능성은 별도 캐시 단계에서 다룬다.

## ERD 컬럼 매핑

| KOBIS 필드 | 내부 응답 | ERD.md 컬럼 | 검증·변환 |
| --- | --- | --- | --- |
| `movieCd` | `movieCd` | `movies.movie_cd`, `boxoffice_results.movie_cd` | 비어 있지 않은 문자열. 숫자형으로 변환하지 않음 |
| `movieNm` | `movieNm` | `movies.movie_nm` | 비어 있지 않은 문자열. 앞뒤 공백 제거 |
| `openDt` | `openDt` | `movies.open_dt` | 유효한 `YYYY-MM-DD`면 사용, 빈 값이면 `null`, 잘못된 값이면 `null`과 경고 |
| `rank` | `rank` | `boxoffice_results.rank` | 양의 정수 문자열·Postgres integer 범위 확인 후 number. 잘못된 값은 `null`과 경고 |
| `salesAmt` | `salesAmt` | `boxoffice_results.sales_amt` | 0 이상, 최대 30자리 정수 문자열 검증 후 정규화. 잘못된 값은 `null`과 경고 |
| `audiCnt` | `audiCnt` | `boxoffice_results.audi_cnt` | 위와 동일 |
| `salesAcc` | `salesAcc` | `boxoffice_results.sales_acc` | 위와 동일. 날짜별로 합산하지 않음 |
| `audiAcc` | `audiAcc` | `boxoffice_results.audi_acc` | 위와 동일. 날짜별로 합산하지 않음 |
| `showRange` | `meta.periodStart`, `meta.periodEnd` | `boxoffice_periods.period_start`, `period_end` | 날짜 형식과 요청 기간의 일치 여부 확인 |
| 서버 수신 시각 | `meta.fetchedAt` | `boxoffice_periods.fetched_at` | 응답 파싱 성공 시 UTC ISO 문자열. 저장 RPC가 같은 키의 이전 시각과 비교 |

큰 금액·관객수는 JavaScript `Number`로 바꾸지 않고 정수 문자열로 JSON에 전달한다. 정렬·합산에는 `BigInt`를 사용한다. 실제 `"0"`은 0으로 유지하며 누락·소수·음수·숫자형 JSON 값은 `null`과 품질 경고로 구분한다. DB의 `numeric(30,0)`에 저장하고 읽을 때 다시 문자열로 직렬화한다.

## 저장 전 검증과 오류

같은 검증을 통과한 데이터만 화면에 응답하거나 DB에 저장한다.

1. 내부 날짜가 실제 달력 날짜이고 한국 날짜 기준 미래가 아닌지, 유형이 세 값 중 하나인지 확인한다. `scenario`는 demo 전용이며 live에서는 거부한다.
2. 외부 HTTP 성공 여부와 JSON 구조를 확인한다. `faultInfo`, 목록 누락, 잘못된 `showRange`, 10건 초과, 중복 `movieCd`는 정상 빈 응답으로 취급하지 않는다.
3. 각 행의 필수 영화 코드·이름을 확인한다. 잘못되면 전체 응답을 거부한다.
4. 순위·수치·개봉일은 위 표대로 검사한다. 일부 필드만 잘못되면 해당 값을 `null`로 두고 `meta.warnings`에 영화 코드와 필드 이름을 기록한다. 원본 값은 경고에 기록하지 않는다.
5. 주간·주말은 실제 `showRange`가 요청 주의 월~일 또는 금~일과 일치하는지 대조한다.

| 상황 | 내부 HTTP | `error.code` | 처리 |
| --- | --- | --- | --- |
| 잘못된 날짜·유형·live의 demo 옵션 | 400 | `INVALID_DATE`, `INVALID_PERIOD_TYPE`, `INVALID_SCENARIO` | 외부 호출 없이 입력 안내 |
| `KOBIS_API_KEY` 미설정 | 503 | `KOBIS_NOT_CONFIGURED` | 안전한 이용 불가 안내 |
| KOBIS HTTP 실패·네트워크 실패·`faultInfo` | 502 | `KOBIS_UPSTREAM_ERROR` | 재시도 안내, 원본 오류 비노출 |
| JSON·필수 구조·식별자·집계 기간 오류 | 502 | `KOBIS_INVALID_RESPONSE` | 잘못된 자료를 성공 또는 빈 결과로 제공하지 않음 |
| 외부 호출 4초 초과 | 504 | `KOBIS_TIMEOUT` | 요청 중단 후 시간 초과 안내 |
| 정상 빈 목록 | 200 | 오류 없음, `meta.status=empty` | 날짜·기간 변경 안내 |

성공 응답은 `{ data: { items }, meta: { status, mode, source, queryDate, periodType, periodStart, periodEnd, fetchedAt, expiresAt, warnings } }`다. live의 `source`는 `kobis | cache | stale`이며 저장에 성공하면 `expiresAt`을 표시한다. 실패 응답은 `{ error: { code, message }, meta: { status: "error", mode } }`이며 URL·인증값·외부 오류 객체는 포함하지 않는다.

`DATA_MODE=demo`는 기존 fixture만 읽으며 외부 호출을 하지 않는다. 이 모드의 2026-09-06은 정상 빈 결과다. `DATA_MODE=live`는 저장소의 유효 캐시를 먼저 읽고 누락·만료 시 KOBIS를 호출한다. 같은 날짜에 실제 자료가 있음을 B단계 이전의 직접 호출로 확인했다. 아래 DB 검증은 Supabase 설정 완료 후 수행한다.

## Supabase 저장·캐시 (B단계)

마이그레이션: [`supabase/migrations/202610250001_box_office_cache.sql`](../supabase/migrations/202610250001_box_office_cache.sql). 업무 데이터 기준은 **세 테이블뿐**이다. `movies`는 영화 코드·이름·개봉일, `boxoffice_periods`는 유형·기준일·실제 기간·상태·조회/만료 시각, `boxoffice_results`는 해당 기간의 영화별 순위·매출·관객 수치를 보관한다. 컬럼 이름과 타입은 ERD.md를 따른다.

| SQL 부분 | 하는 일 |
| --- | --- |
| PK·FK·UNIQUE·CHECK | 한 기간의 영화가 중복되지 않게 하고 유효하지 않은 상태·음수 수치·잘못된 날짜 순서를 막는다. |
| RLS·권한 회수 | 공개 `anon`·`authenticated` 사용자의 테이블 접근과 함수 실행을 차단한다. 서버의 `service_role`만 RPC를 호출한다. |
| `save_box_office_period` | 같은 키에 트랜잭션 잠금을 건 뒤 영화 → 기간 → 실적 순서로 저장한다. 기존 실적을 모두 지우고 새 목록을 넣는다. 어느 단계든 오류가 나면 함수 호출 전체가 롤백된다. 저장된 `fetched_at`보다 오래되거나 같은 요청은 변경하지 않는다. |
| `read_box_office_period` | 유형·기준일·스키마 버전·옵션 키로 기간과 영화·실적을 한 번에 읽고 `numeric(30,0)`을 정수 문자열로 돌려준다. 저장본이 없으면 `null`이다. |

캐시 키는 `(schema_version=1, period_type, query_date, options_key)`이며 현재 `options_key`는 `itemPerPage=10;multiMovieYn=all;repNationCd=all;wideAreaCd=all`이다. 정상 데이터는 **24시간**, 정상 빈 목록은 **1시간** 유효하다. 저장 RPC가 `expires_at`을 계산한다. 새 결과가 정상 빈 목록이면 기존 실적도 0행으로 교체한다. 저장 실패나 KOBIS 오류로 만료 시각을 연장하지 않는다. DB의 같은 키 잠금과 시각 비교가 저장 순서 역전을 막는다. 다중 서버의 **외부 호출 자체**를 하나로 합치는 분산 갱신 임대는 아직 없으므로 배포 전 호출 제한과 함께 추가 검증해야 한다.

| 상황 | 내부 응답·화면 안내 |
| --- | --- |
| 유효 캐시 | `200`, `source: cache`. 외부 호출 없이 저장된 결과와 마지막 성공 시각 표시 |
| 캐시 없음·만료 | KOBIS 조회·검증 → 저장 RPC → 읽기 RPC 대조. 성공 시 첫 요청은 `source: kobis`, 다음 요청은 `source: cache` |
| DB 읽기 실패 | KOBIS를 직접 조회해 `source: kobis`와 읽기 실패 경고 표시. KOBIS도 실패하면 `503 DB_AND_KOBIS_UNAVAILABLE` |
| DB 저장·저장본 대조 실패 | 검증된 KOBIS 결과를 `200/source: kobis`와 저장 실패 경고로 반환. 기존 정상 저장본은 트랜잭션으로 보호 |
| KOBIS 실패 + 만료 후 24시간 이내의 비어 있지 않은 캐시 | `200/partial`, `source: stale`. 마지막 성공 시각·갱신 실패 표시. 기존 만료 시각 유지 |
| KOBIS 실패 + 사용 가능한 캐시 없음 | 기존 502/504 오류와 재시도. 정상 빈 캐시는 stale로 제공하지 않음 |

저장 후 읽기 결과가 원본과 일치하면 검증용 **정규화 원본 응답**을 `.data/boxoffice-originals/`에 따로 기록한다. 이 로컬 기록은 서비스 응답의 기준이 아니고 Git에서도 제외된다. 서버리스 배포에서는 로컬 파일이 인스턴스 사이에 공유되거나 오래 보존되지 않으므로 `verify:data`의 첫 비교는 같은 로컬 환경에서 저장한 자료에만 가능하다. 영구적인 배포 후 검증에는 별도 외부 감사 저장소가 필요하지만, 업무 테이블과 중복 원본 캐시로 운영하지 않는다.

### 설정 순서

1. [Supabase 프로젝트를 준비](https://supabase.com/docs/guides/getting-started)한다. 개발·검증용 프로젝트를 먼저 사용한다.
2. 위 migration SQL을 검토해 적용한다. 버전 관리에는 [Supabase migration 절차](https://supabase.com/docs/guides/deployment/database-migrations)를 사용한다. 초기 1회 수동 적용이라면 SQL Editor에서 전체 파일을 실행하고 이후 migration 이력과 중복 실행하지 않는다.
3. `.gitignore`에서 `.env.local` 제외를 확인하고, `.env.local`의 **`SUPABASE_URL`**, **`SUPABASE_SECRET_KEY`**를 설정한다. `KOBIS_API_KEY`와 `DATA_MODE=live`도 서버에서 읽는다. 실제 값은 화면·문서·로그·Git에 넣지 않는다. [Supabase secret key 안내](https://supabase.com/docs/guides/getting-started/api-keys)
4. 개발 서버를 재시작한 뒤 같은 날짜·유형을 두 번 조회한다. 첫 응답의 `meta.source=kobis`, 둘째 응답의 `meta.source=cache`를 확인한다. `2026-09-06` 일간을 예시로 쓸 수 있다. 기존 저장본이 있으면 첫 요청부터 cache일 수 있으므로 새 날짜를 쓰거나 만료를 기다린다.
5. `npm run verify:data -- --date=2026-09-06 --period=daily`를 실행한다. 명령은 DB **읽기 RPC만** 호출하고, 로컬 원본 기록과 KOBIS에 **한 번 새로 조회한 결과**를 각각 비교한다. `0`은 두 비교 모두 일치, `1`은 불일치·비교 불가, `2`는 DB에 해당 기간이 없다는 뜻이다. KOBIS가 과거 실적을 정정하면 현재 결과와 저장 당시 원본이 달라 `1`이 정상적으로 나올 수 있다.

설정 후 확인 결과(2026-10-25): `2026-09-04` 일간의 첫 조회는 `source: kobis` 10건, 같은 요청의 두 번째 조회는 `source: cache` 10건이었다. `verify:data`에서 저장본 ↔ 저장 당시 원본, 저장본 ↔ 현재 KOBIS가 모두 일치해 종료 코드 `0`을 확인했다. `2026-09-06`은 초기 저장본 대조 구현의 키 순서 오류로 로컬 원본 기록이 남지 않아 첫 비교를 수행할 수 없다. 필드별 비교로 수정한 뒤 새 날짜에서 재검증했다. SQL의 RLS 공개 접근 차단과 중간 실패 시 롤백은 격리 DB에서 별도 확인해야 한다. demo의 2026-09-06은 빈 fixture, live의 같은 날짜는 저장된 실제 10건으로 확인했다.
