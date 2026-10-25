import { getDemoBoxoffice } from "./demo-fixture";
import { getKobisApiKey } from "./env";
import { fetchKobisBoxoffice, KobisError } from "./kobis";
import { cacheCanBeStale, cacheIsFresh, readCachedPeriod, sameBoxofficeData, saveCachedPeriod } from "./supabase-cache";
import { saveOriginalSnapshot } from "./original-snapshot";
import { isValidDate, koreaToday, type BoxofficeResult, type DemoScenario, type PeriodType } from "../boxoffice";

function addWarnings(result: BoxofficeResult, ...warnings: string[]): BoxofficeResult {
  return { ...result, meta: { ...result.meta, warnings: [...result.meta.warnings, ...warnings.filter(Boolean)] } };
}

export async function serveBoxoffice(params: URLSearchParams, mode = process.env.DATA_MODE ?? "demo") {
  const failure = (code: number, errorCode: string, message: string) => ({
    code, body: { error: { code: errorCode, message }, meta: { status: "error" as const, mode } },
  });
  if (mode !== "demo" && mode !== "live") return failure(500, "INVALID_MODE", "DATA_MODE 설정을 확인해 주세요.");
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "daily";
  const scenario = params.get("scenario") ?? "normal";
  if (!isValidDate(date) || date > koreaToday()) return failure(400, "INVALID_DATE", "미래가 아닌 올바른 조회 날짜를 선택해 주세요.");
  if (!["daily", "weekly", "weekend"].includes(type)) return failure(400, "INVALID_PERIOD_TYPE", "올바른 기간 유형을 선택해 주세요.");
  if (mode === "live") {
    if (params.has("scenario")) return failure(400, "INVALID_SCENARIO", "live 모드에서는 데모 응답 옵션을 사용할 수 없습니다.");
    const periodType = type as PeriodType;
    let cached: BoxofficeResult | null = null;
    let readWarning = "";
    try {
      cached = await readCachedPeriod(date, periodType);
      if (cached && cacheIsFresh(cached)) return { code: 200, body: cached };
    } catch {
      readWarning = "저장소를 읽지 못해 KOBIS에서 다시 조회했습니다.";
    }
    const key = getKobisApiKey();
    if (!key) return failure(503, "KOBIS_NOT_CONFIGURED", "박스오피스 서비스를 일시적으로 이용할 수 없습니다.");
    let fresh: BoxofficeResult;
    try {
      fresh = await fetchKobisBoxoffice(date, periodType, key);
    } catch (error) {
      if (cached && cacheCanBeStale(cached)) {
        return { code: 200, body: {
          ...cached, meta: { ...cached.meta, status: "partial" as const, source: "stale" as const,
            warnings: [...cached.meta.warnings, "KOBIS 갱신에 실패하여 이전 자료를 표시합니다. 마지막 성공 시각을 확인해 주세요."] },
        } };
      }
      if (readWarning) return failure(503, "DB_AND_KOBIS_UNAVAILABLE", "저장소와 박스오피스 서비스를 일시적으로 이용할 수 없습니다.");
      if (error instanceof KobisError) return failure(error.status, error.code,
        error.status === 504 ? "박스오피스 조회 시간이 초과되었습니다. 다시 시도해 주세요." : "박스오피스 데이터를 불러오지 못했습니다. 다시 시도해 주세요.");
      return failure(502, "KOBIS_UPSTREAM_ERROR", "박스오피스 데이터를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
    try {
      const save = await saveCachedPeriod(fresh);
      const stored = await readCachedPeriod(date, periodType);
      if (!stored) throw new Error("missing saved period");
      if (!save.saved) return { code: 200, body: addWarnings(stored, "더 최신 저장본을 표시합니다.") };
      if (!sameBoxofficeData(fresh, stored)) throw new Error("saved period differs");
      const savedResult = { ...fresh, meta: { ...fresh.meta, expiresAt: stored.meta.expiresAt } };
      try { await saveOriginalSnapshot(fresh); }
      catch { return { code: 200, body: addWarnings(savedResult, "로컬 원본 대조 기록을 남기지 못했습니다.") }; }
      return { code: 200, body: readWarning ? addWarnings(savedResult, readWarning) : savedResult };
    } catch {
      return { code: 200, body: addWarnings(fresh, readWarning || "", "저장 또는 저장본 대조에 실패하여 방금 확인한 KOBIS 자료를 표시합니다.") };
    }
  }
  if (!["normal", "slow", "error"].includes(scenario)) return failure(400, "INVALID_SCENARIO", "올바른 데모 응답을 선택해 주세요.");
  const selected = scenario as DemoScenario;
  await new Promise((resolve) => setTimeout(resolve, selected === "slow" ? 5000 : 450));
  if (selected === "error") return failure(503, "DEMO_ERROR", "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { code: 200, body: getDemoBoxoffice(date, type as PeriodType) };
}
