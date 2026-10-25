import "server-only";

import { isValidDate, periodFor, validatedInteger, type BoxofficeResult, type MovieResult, type PeriodType } from "../boxoffice";

const KOBIS_ORIGIN = "https://www.kobis.or.kr";
const REQUEST_TIMEOUT_MS = 4000;

export class KobisError extends Error {
  constructor(public readonly status: 502 | 504, public readonly code: string) {
    super(code);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parseShowRange(value: unknown): { start: string; end: string } | null {
  if (typeof value !== "string" || !/^\d{8}~\d{8}$/.test(value)) return null;
  const normalize = (day: string) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const start = normalize(value.slice(0, 8));
  const end = normalize(value.slice(9));
  return isValidDate(start) && isValidDate(end) && start <= end ? { start, end } : null;
}

function optionalInteger(value: unknown, field: string, movieCd: string, warnings: string[]): string | null {
  const normalized = validatedInteger(value);
  if (normalized === null) warnings.push(`${movieCd}.${field}: 유효하지 않은 정수 문자열`);
  return normalized;
}

function parseMovie(value: unknown, warnings: string[]): MovieResult {
  const row = record(value);
  if (!row || typeof row.movieCd !== "string" || !row.movieCd.trim() || row.movieCd.length > 64 ||
      typeof row.movieNm !== "string" || !row.movieNm.trim()) {
    throw new KobisError(502, "KOBIS_INVALID_RESPONSE");
  }
  const movieCd = row.movieCd.trim();
  const rankText = validatedInteger(row.rank);
  const rankValue = rankText === null ? null : BigInt(rankText);
  const rank = rankValue !== null && rankValue > 0n && rankValue <= 2147483647n ? Number(rankValue) : null;
  if (rank === null) warnings.push(`${movieCd}.rank: 유효하지 않은 순위`);

  let openDt: string | null = null;
  if (row.openDt !== "" && row.openDt !== null && row.openDt !== undefined) {
    if (typeof row.openDt === "string" && isValidDate(row.openDt)) openDt = row.openDt;
    else warnings.push(`${movieCd}.openDt: 유효하지 않은 개봉일`);
  }
  return {
    movieCd, movieNm: row.movieNm.trim(), openDt, rank,
    salesAmt: optionalInteger(row.salesAmt, "salesAmt", movieCd, warnings),
    audiCnt: optionalInteger(row.audiCnt, "audiCnt", movieCd, warnings),
    salesAcc: optionalInteger(row.salesAcc, "salesAcc", movieCd, warnings),
    audiAcc: optionalInteger(row.audiAcc, "audiAcc", movieCd, warnings),
  };
}

export function parseKobisResponse(payload: unknown, queryDate: string, periodType: PeriodType, fetchedAt: string): BoxofficeResult {
  const root = record(payload);
  if (!root || root.faultInfo !== undefined) throw new KobisError(502, "KOBIS_UPSTREAM_ERROR");
  const result = record(root.boxOfficeResult);
  const period = periodFor(queryDate, periodType);
  const showRange = parseShowRange(result?.showRange);
  const listName = periodType === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList";
  if (!showRange || showRange.start !== period.start || showRange.end !== period.end || !Array.isArray(result?.[listName]) || result[listName].length > 10) {
    throw new KobisError(502, "KOBIS_INVALID_RESPONSE");
  }
  const warnings: string[] = [];
  const items = result[listName].map((row) => parseMovie(row, warnings));
  if (new Set(items.map((item) => item.movieCd)).size !== items.length) throw new KobisError(502, "KOBIS_INVALID_RESPONSE");
  return {
    data: { items },
    meta: {
      status: items.length === 0 ? "empty" : "ok", mode: "live", source: "kobis",
      queryDate, periodType, periodStart: showRange.start, periodEnd: showRange.end,
      fetchedAt, expiresAt: null, warnings,
    },
  };
}

export async function fetchKobisBoxoffice(queryDate: string, periodType: PeriodType, key: string): Promise<BoxofficeResult> {
  const daily = periodType === "daily";
  const endpoint = daily ? "searchDailyBoxOfficeList" : "searchWeeklyBoxOfficeList";
  const url = new URL(`/kobisopenapi/webservice/rest/boxoffice/${endpoint}.json`, KOBIS_ORIGIN);
  url.searchParams.set("key", key);
  url.searchParams.set("targetDt", (daily ? queryDate : periodFor(queryDate, periodType).end).replaceAll("-", ""));
  url.searchParams.set("itemPerPage", "10");
  if (!daily) url.searchParams.set("weekGb", periodType === "weekly" ? "0" : "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // The URL contains a secret. Never log the request, response body, or caught error.
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new KobisError(502, "KOBIS_UPSTREAM_ERROR");
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new KobisError(502, "KOBIS_INVALID_RESPONSE"); }
    return parseKobisResponse(payload, queryDate, periodType, new Date().toISOString());
  } catch (error) {
    if (controller.signal.aborted) throw new KobisError(504, "KOBIS_TIMEOUT");
    if (error instanceof KobisError) throw error;
    throw new KobisError(502, "KOBIS_UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }
}
