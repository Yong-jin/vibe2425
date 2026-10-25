import { getDemoBoxoffice } from "./demo-fixture";
import { isValidDate, koreaToday, type DemoScenario, type PeriodType } from "../boxoffice";

export async function serveBoxoffice(params: URLSearchParams, mode = process.env.DATA_MODE ?? "demo") {
  const failure = (code: number, errorCode: string, message: string) => ({
    code, body: { error: { code: errorCode, message }, meta: { status: "error" as const, mode } },
  });
  // No live adapter or outbound network path is present in this stage.
  if (mode === "live") return failure(501, "LIVE_NOT_IMPLEMENTED", "live 모드는 아직 지원하지 않습니다. DATA_MODE=demo로 실행해 주세요.");
  if (mode !== "demo") return failure(500, "INVALID_MODE", "DATA_MODE 설정을 확인해 주세요.");
  const date = params.get("date") ?? "";
  const type = params.get("type") ?? "daily";
  const scenario = params.get("scenario") ?? "normal";
  if (!isValidDate(date) || date > koreaToday()) return failure(400, "INVALID_DATE", "미래가 아닌 올바른 조회 날짜를 선택해 주세요.");
  if (!["daily", "weekly", "weekend"].includes(type)) return failure(400, "INVALID_PERIOD_TYPE", "올바른 기간 유형을 선택해 주세요.");
  if (!["normal", "slow", "error"].includes(scenario)) return failure(400, "INVALID_SCENARIO", "올바른 데모 응답을 선택해 주세요.");
  const selected = scenario as DemoScenario;
  await new Promise((resolve) => setTimeout(resolve, selected === "slow" ? 5000 : 450));
  if (selected === "error") return failure(503, "DEMO_ERROR", "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { code: 200, body: getDemoBoxoffice(date, type as PeriodType) };
}
