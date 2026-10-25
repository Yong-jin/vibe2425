import "server-only";

import { isValidDate, periodFor, validatedInteger, type BoxofficeResult, type MovieResult, type PeriodType } from "../boxoffice";

export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_OPTIONS_KEY = "itemPerPage=10;multiMovieYn=all;repNationCd=all;wideAreaCd=all";
const DB_TIMEOUT_MS = 3000;

export class CacheError extends Error {
  constructor(public readonly code: "DB_NOT_CONFIGURED" | "DB_READ_FAILED" | "DB_SAVE_FAILED") {
    super(code);
  }
}

function configuration(): { url: URL; key: string } {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!rawUrl || !key) throw new CacheError("DB_NOT_CONFIGURED");
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("invalid protocol");
    }
    return { url, key };
  } catch {
    throw new CacheError("DB_NOT_CONFIGURED");
  }
}

async function rpc(functionName: "read_box_office_period" | "save_box_office_period", body: Record<string, unknown>): Promise<unknown> {
  const { url, key } = configuration();
  const endpoint = new URL(`/rest/v1/rpc/${functionName}`, url);
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(DB_TIMEOUT_MS), cache: "no-store",
    });
    if (!response.ok) throw new Error("rpc failed");
    return await response.json();
  } catch {
    // Never forward the request, headers, database error object, or URL.
    throw new CacheError(functionName === "read_box_office_period" ? "DB_READ_FAILED" : "DB_SAVE_FAILED");
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function checkedItem(value: unknown): MovieResult | null {
  const item = object(value);
  if (!item || typeof item.movieCd !== "string" || !item.movieCd || typeof item.movieNm !== "string" || !item.movieNm ||
      !(item.openDt === null || typeof item.openDt === "string" && isValidDate(item.openDt)) ||
      !(item.rank === null || Number.isInteger(item.rank) && (item.rank as number) > 0 && (item.rank as number) <= 2147483647)) return null;
  for (const field of ["salesAmt", "audiCnt", "salesAcc", "audiAcc"] as const) {
    if (item[field] !== null && validatedInteger(item[field]) !== item[field]) return null;
  }
  return item as MovieResult;
}

export function parseStoredPeriod(value: unknown, date: string, type: PeriodType): BoxofficeResult | null {
  if (value === null) return null;
  const stored = object(value);
  const period = periodFor(date, type);
  if (!stored || stored.queryDate !== date || stored.periodType !== type ||
      stored.periodStart !== period.start || stored.periodEnd !== period.end ||
      (stored.status !== "ok" && stored.status !== "empty") ||
      typeof stored.fetchedAt !== "string" || !Number.isFinite(Date.parse(stored.fetchedAt)) ||
      typeof stored.expiresAt !== "string" || !Number.isFinite(Date.parse(stored.expiresAt)) ||
      Date.parse(stored.expiresAt) <= Date.parse(stored.fetchedAt) ||
      !Array.isArray(stored.items) || !Array.isArray(stored.warnings) ||
      !stored.warnings.every((warning) => typeof warning === "string")) {
    throw new CacheError("DB_READ_FAILED");
  }
  const items = stored.items.map(checkedItem);
  if (items.some((item) => item === null) || (stored.status === "empty") !== (items.length === 0) ||
      new Set(items.map((item) => item?.movieCd)).size !== items.length) throw new CacheError("DB_READ_FAILED");
  return {
    data: { items: items as MovieResult[] },
    meta: {
      status: stored.status, mode: "live", source: "cache", queryDate: date, periodType: type,
      periodStart: period.start, periodEnd: period.end, fetchedAt: stored.fetchedAt,
      expiresAt: stored.expiresAt, warnings: stored.warnings as string[],
    },
  };
}

export async function readCachedPeriod(date: string, type: PeriodType): Promise<BoxofficeResult | null> {
  const raw = await rpc("read_box_office_period", {
    p_period_type: type, p_query_date: date, p_schema_version: CACHE_SCHEMA_VERSION, p_options_key: CACHE_OPTIONS_KEY,
  });
  return parseStoredPeriod(raw, date, type);
}

export async function saveCachedPeriod(result: BoxofficeResult): Promise<{ saved: boolean }> {
  const raw = await rpc("save_box_office_period", {
    p_period_type: result.meta.periodType, p_query_date: result.meta.queryDate,
    p_period_start: result.meta.periodStart, p_period_end: result.meta.periodEnd,
    p_fetched_at: result.meta.fetchedAt, p_schema_version: CACHE_SCHEMA_VERSION,
    p_options_key: CACHE_OPTIONS_KEY, p_result_status: result.meta.status,
    p_items: result.data.items, p_warnings: result.meta.warnings,
  });
  const saved = object(raw)?.saved;
  if (typeof saved !== "boolean") throw new CacheError("DB_SAVE_FAILED");
  return { saved };
}

export function boxofficeDifferences(left: BoxofficeResult, right: BoxofficeResult): string[] {
  const differences: string[] = [];
  for (const field of ["status", "periodStart", "periodEnd"] as const) {
    if (left.meta[field] !== right.meta[field]) differences.push(field);
  }
  const leftItems = [...left.data.items].sort((a, b) => a.movieCd.localeCompare(b.movieCd));
  const rightItems = [...right.data.items].sort((a, b) => a.movieCd.localeCompare(b.movieCd));
  if (leftItems.length !== rightItems.length) differences.push("items.length");
  for (let index = 0; index < Math.min(leftItems.length, rightItems.length); index++) {
    for (const field of ["movieCd", "movieNm", "openDt", "rank", "salesAmt", "audiCnt", "salesAcc", "audiAcc"] as const) {
      if (leftItems[index][field] !== rightItems[index][field]) differences.push(`items[${index}].${field}`);
    }
  }
  if (JSON.stringify([...left.meta.warnings].sort()) !== JSON.stringify([...right.meta.warnings].sort())) differences.push("warnings");
  return differences;
}

export function sameBoxofficeData(left: BoxofficeResult, right: BoxofficeResult): boolean {
  return boxofficeDifferences(left, right).length === 0;
}

export function cacheIsFresh(result: BoxofficeResult, now = Date.now()): boolean {
  return result.meta.expiresAt !== null && Date.parse(result.meta.expiresAt) > now;
}

export function cacheCanBeStale(result: BoxofficeResult, now = Date.now()): boolean {
  return result.meta.status === "ok" && result.data.items.length > 0 && result.meta.expiresAt !== null &&
    now - Date.parse(result.meta.expiresAt) <= 24 * 60 * 60 * 1000;
}
