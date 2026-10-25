export type PeriodType = "daily" | "weekly" | "weekend";
export type DemoScenario = "normal" | "slow" | "error";
export type MovieResult = {
  movieCd: string;
  movieNm: string;
  openDt: string | null;
  rank: number | null;
  salesAmt: string | null;
  audiCnt: string | null;
  salesAcc: string | null;
  audiAcc: string | null;
};
export type BoxofficeResult = {
  data: { items: MovieResult[] };
  meta: {
    status: "ok" | "empty";
    mode: "demo" | "live";
    source: "fixture" | "kobis";
    queryDate: string;
    periodType: PeriodType;
    periodStart: string;
    periodEnd: string;
    fetchedAt: string;
    expiresAt: null;
    warnings: string[];
  };
};

export function validatedInteger(value: unknown): string | null {
  return typeof value === "string" && /^\d{1,30}$/.test(value)
    ? BigInt(value).toString()
    : null;
}

export function formatInteger(value: string | null): string {
  const validated = validatedInteger(value);
  return validated === null ? "정보 없음" : BigInt(validated).toLocaleString("ko-KR");
}

export function koreaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function koreaYesterday(): string {
  return koreaToday(new Date(Date.now() - 86400000));
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function periodFor(date: string, type: PeriodType) {
  if (type === "daily") return { start: date, end: date };
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  if (type === "weekend") start.setUTCDate(start.getUTCDate() + 4);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
