# 로컬 개발

Node.js 22.x를 사용한다. 고정 버전은 `.node-version`에 기록한다.

```sh
npm install
npm run dev
```

http://localhost:3000 에 접속한다. 현재는 목록·인사이트의 준비 화면이며 외부 API·DB는 연결하지 않았다. 화면 확인과 빌드는 비밀키 없이 가능하다.

PowerShell에서 npm.ps1 실행 정책 오류가 나면 시스템 정책을 바꾸지 말고 `npm.cmd`로 실행한다.

필요한 외부 연결을 구현할 때 `.env.example`을 `.env.local`로 복사하고 로컬에서 값을 설정한다. `KOBIS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`는 서버 전용이며 파일을 커밋하거나 내용을 출력하지 않는다.

| 명령 | 용도 |
| --- | --- |
| `npm run lint` | ESLint, 경고도 실패 처리 |
| `npm run typecheck` | Next.js 라우트 타입 생성 후 TypeScript 검사 |
| `npm run test` | Vitest 단위 테스트, 일회 실행 |
| `npm run test:watch` | 단위 테스트 감시 |
| `npm run test:e2e` | Playwright Chromium 화면 테스트, 3100 포트 서버 자동 기동·종료 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 결과 실행 |

화면 테스트 최초 실행 전 `npx playwright install chromium`을 실행한다. 단위 테스트와 화면 테스트는 서로 다른 디렉터리로 분리한다. 생성된 빌드·테스트 결과와 로컬 도구는 Git에서 제외한다.

기존 PRD·아키텍처·AGENTS·ERD·계획 문서는 이번 뼈대 작업에서 수정하지 않았다. AGENTS.md의 명령어 미정 표와 달리 현재 실행 명령은 위 표와 package.json에 등록되어 있다. 정규화 모델 반영과 기존 문서 정합성 갱신은 별도 작업으로 남아 있다.
