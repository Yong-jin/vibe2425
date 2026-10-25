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
| 서버 수신 시각 | `meta.fetchedAt` | `boxoffice_periods.fetched_at` | 응답 파싱 성공 시 UTC ISO 문자열. 이번 단계에서는 DB에 저장하지 않음 |

큰 금액·관객수는 JavaScript `Number`로 바꾸지 않고 정수 문자열로 JSON에 전달한다. 정렬·합산이 필요한 다음 단계에서는 `BigInt`를 사용한다. 실제 `"0"`은 0으로 유지하며 누락·소수·음수·숫자형 JSON 값은 `null`과 품질 경고로 구분한다. DB 도입 시 `numeric(30,0)`에 저장하고 읽을 때 다시 문자열로 직렬화한다.

## 저장 전 검증과 오류

현재는 **저장하지 않지만**, 동일한 검증을 통과한 데이터만 화면에 응답한다.

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

성공 응답은 `{ data: { items }, meta: { status, mode, source, queryDate, periodType, periodStart, periodEnd, fetchedAt, expiresAt, warnings } }`다. live의 `source`는 `kobis`, `expiresAt`은 저장 전이므로 `null`이다. 실패 응답은 `{ error: { code, message }, meta: { status: "error", mode } }`이며 URL·인증값·외부 오류 객체는 포함하지 않는다.

`DATA_MODE=demo`는 기존 fixture만 읽으며 외부 호출을 하지 않는다. 이 모드의 2026-09-06은 정상 빈 결과다. `DATA_MODE=live`는 KOBIS를 직접 호출하며 같은 날짜의 실제 자료가 조회되었다. 저장·공유 캐시·호출 제한·동시 갱신 제어는 다음 B단계 작업이다. 그 전까지 live 요청마다 KOBIS를 호출하므로 운영 배포 전에 해당 제어를 구현해야 한다.
