import { isValidDate, validatedInteger, type BoxofficeResult } from "./boxoffice";

export type DayObservation = {
  date: string;
  status: "loading" | "ok" | "empty" | "error";
  items?: Array<{ movieCd: string; movieNm: string; salesAmt: string; audiCnt: string }>;
  reason?: string;
};

export type InsightMovie = { movieCd: string; movieNm: string; salesAmt: bigint; audiCnt: bigint };

export function datesEndingAt(endDate: string, days: 7 | 14 | 30): string[] {
  if (!isValidDate(endDate)) throw new Error("Invalid analysis date");
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

export function parseDailyObservation(value: unknown, date: string): DayObservation {
  if (value === null || typeof value !== "object") throw new Error("Invalid daily response");
  const result = value as BoxofficeResult;
  if (!result.meta || result.meta.periodType !== "daily" || result.meta.queryDate !== date ||
      result.meta.periodStart !== date || result.meta.periodEnd !== date || !Array.isArray(result.data?.items)) {
    throw new Error("Invalid daily response");
  }
  if (result.meta.status === "partial") return { date, status: "error", reason: "이전 저장 자료라 집계에서 제외했습니다." };
  if (result.meta.status === "empty" && result.data.items.length === 0) return { date, status: "empty" };
  if (result.meta.status !== "ok" || result.data.items.length === 0 || result.data.items.length > 10) {
    throw new Error("Invalid daily response");
  }
  const codes = new Set<string>();
  const items = result.data.items.map((item) => {
    if (typeof item.movieCd !== "string" || !item.movieCd || typeof item.movieNm !== "string" || !item.movieNm ||
        validatedInteger(item.salesAmt) === null || validatedInteger(item.audiCnt) === null || codes.has(item.movieCd)) {
      throw new Error("필수 매출·관객 값이 없어 집계에서 제외했습니다.");
    }
    codes.add(item.movieCd);
    return { movieCd: item.movieCd, movieNm: item.movieNm,
      salesAmt: validatedInteger(item.salesAmt)!, audiCnt: validatedInteger(item.audiCnt)! };
  });
  return { date, status: "ok", items };
}

export function summarizeDay(day: DayObservation): { salesAmt: bigint; audiCnt: bigint } | null {
  if (day.status !== "ok" || !day.items) return null;
  return day.items.reduce((total, item) => ({
    salesAmt: total.salesAmt + BigInt(item.salesAmt),
    audiCnt: total.audiCnt + BigInt(item.audiCnt),
  }), { salesAmt: 0n, audiCnt: 0n });
}

export function calculateInsights(days: DayObservation[]) {
  const counts = { ok: 0, empty: 0, error: 0, loading: 0 };
  const series = days.map((day) => {
    counts[day.status]++;
    const totals = summarizeDay(day);
    return { date: day.date, status: day.status, salesAmt: totals?.salesAmt ?? null, audiCnt: totals?.audiCnt ?? null };
  });
  const complete = days.length > 0 && counts.ok === days.length;
  if (!complete) return { counts, series, complete, salesAmt: null, audiCnt: null, revenuePerAudience: null, movies: [] as InsightMovie[] };

  const byCode = new Map<string, InsightMovie>();
  let salesAmt = 0n;
  let audiCnt = 0n;
  for (const day of days) {
    for (const item of day.items ?? []) {
      const sales = BigInt(item.salesAmt);
      const audience = BigInt(item.audiCnt);
      const previous = byCode.get(item.movieCd);
      byCode.set(item.movieCd, {
        movieCd: item.movieCd, movieNm: item.movieNm,
        salesAmt: (previous?.salesAmt ?? 0n) + sales,
        audiCnt: (previous?.audiCnt ?? 0n) + audience,
      });
      salesAmt += sales;
      audiCnt += audience;
    }
  }
  const movies = [...byCode.values()].sort((a, b) =>
    a.salesAmt !== b.salesAmt ? (a.salesAmt > b.salesAmt ? -1 : 1) :
    a.audiCnt !== b.audiCnt ? (a.audiCnt > b.audiCnt ? -1 : 1) :
    a.movieCd < b.movieCd ? -1 : a.movieCd > b.movieCd ? 1 : 0);
  return { counts, series, complete, salesAmt, audiCnt,
    revenuePerAudience: audiCnt > 0n ? (salesAmt + audiCnt / 2n) / audiCnt : null, movies };
}

function fixedUnit(value: bigint, unit: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const scaled = (value * scale + unit / 2n) / unit;
  const whole = (scaled / scale).toLocaleString("ko-KR");
  if (decimals === 0) return whole;
  return `${whole}.${(scaled % scale).toString().padStart(decimals, "0")}`;
}

export function formatHundredMillionWon(value: bigint): string {
  return `${fixedUnit(value, 100_000_000n, 2)}억 원`;
}

export function formatThousandPeople(value: bigint): string {
  return `${fixedUnit(value, 1_000n, 1)}천 명`;
}

export function formatWonPerPerson(value: bigint | null): string {
  return value === null ? "—" : `${value.toLocaleString("ko-KR")}원/명`;
}
