import { getDemoBoxoffice } from "./demo-fixture";
import { getKobisApiKey } from "./env";
import { fetchKobisBoxoffice, KobisError } from "./kobis";
import { isValidDate, koreaToday, type DemoScenario, type PeriodType } from "../boxoffice";

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
    const key = getKobisApiKey();
    if (!key) return failure(503, "KOBIS_NOT_CONFIGURED", "박스오피스 서비스를 일시적으로 이용할 수 없습니다.");
    try {
      return { code: 200, body: await fetchKobisBoxoffice(date, type as PeriodType, key) };
    } catch (error) {
      if (error instanceof KobisError) return failure(error.status, error.code,
        error.status === 504 ? "박스오피스 조회 시간이 초과되었습니다. 다시 시도해 주세요." : "박스오피스 데이터를 불러오지 못했습니다. 다시 시도해 주세요.");
      return failure(502, "KOBIS_UPSTREAM_ERROR", "박스오피스 데이터를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  }
  if (!["normal", "slow", "error"].includes(scenario)) return failure(400, "INVALID_SCENARIO", "올바른 데모 응답을 선택해 주세요.");
  const selected = scenario as DemoScenario;
  await new Promise((resolve) => setTimeout(resolve, selected === "slow" ? 5000 : 450));
  if (selected === "error") return failure(503, "DEMO_ERROR", "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { code: 200, body: getDemoBoxoffice(date, type as PeriodType) };
}
