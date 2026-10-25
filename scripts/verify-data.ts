import { existsSync } from "node:fs";
import { isValidDate, koreaToday, type PeriodType } from "../src/lib/boxoffice";
import { getKobisApiKey } from "../src/lib/server/env";
import { fetchKobisBoxoffice } from "../src/lib/server/kobis";
import { readOriginalSnapshot } from "../src/lib/server/original-snapshot";
import { boxofficeDifferences, readCachedPeriod, sameBoxofficeData } from "../src/lib/server/supabase-cache";

// This command only reads the DB and local audit snapshot; it never calls the save RPC.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const date = process.argv.find((arg) => arg.startsWith("--date="))?.slice(7) ?? "";
const period = process.argv.find((arg) => arg.startsWith("--period="))?.slice(9) ?? "";
if (!isValidDate(date) || date > koreaToday() || !["daily", "weekly", "weekend"].includes(period)) {
  process.stdout.write("사용법: npm run verify:data -- --date=YYYY-MM-DD --period=daily|weekly|weekend\n");
  process.exitCode = 1;
} else {
  try {
    const type = period as PeriodType;
    const stored = await readCachedPeriod(date, type);
    if (!stored) {
      process.stdout.write("저장된 데이터가 없습니다.\n");
      process.exitCode = 2;
    } else {
      let originalMatches = false;
      let currentMatches = false;
      try {
        const original = await readOriginalSnapshot(date, type, stored.meta.fetchedAt);
        originalMatches = sameBoxofficeData(stored, original);
        process.stdout.write(`저장본 ↔ 저장 당시 원본: ${originalMatches ? "일치" : "불일치"}\n`);
      } catch {
        process.stdout.write("저장본 ↔ 저장 당시 원본: 비교 불가 (로컬 원본 기록 없음 또는 손상)\n");
      }
      const key = getKobisApiKey();
      if (!key) {
        process.stdout.write("저장본 ↔ 현재 KOBIS: 비교 불가 (서버 키 미설정)\n");
      } else {
        try {
          const current = await fetchKobisBoxoffice(date, type, key);
          currentMatches = sameBoxofficeData(stored, current);
          process.stdout.write(`저장본 ↔ 현재 KOBIS: ${currentMatches ? "일치" : "불일치"}\n`);
          if (!currentMatches) process.stdout.write(`차이 항목: ${boxofficeDifferences(stored, current).join(", ")}\n`);
        } catch {
          process.stdout.write("저장본 ↔ 현재 KOBIS: 비교 불가 (외부 조회 실패)\n");
        }
      }
      process.exitCode = originalMatches && currentMatches ? 0 : 1;
    }
  } catch {
    process.stdout.write("저장본을 읽거나 검증할 수 없습니다. 설정·DB 함수를 확인해 주세요.\n");
    process.exitCode = 1;
  }
}
