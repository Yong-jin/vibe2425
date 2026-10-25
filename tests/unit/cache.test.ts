import { afterEach, describe, expect, it, vi } from "vitest";
import { serveBoxoffice } from "../../src/lib/server/boxoffice-service";
import { cacheCanBeStale, cacheIsFresh, parseStoredPeriod, sameBoxofficeData } from "../../src/lib/server/supabase-cache";

vi.mock("../../src/lib/server/original-snapshot", () => ({ saveOriginalSnapshot: vi.fn(async () => {}) }));

const date = "2026-09-06";
const item = {
  movieCd: "20260001", movieNm: "검증 영화", openDt: "2026-09-01", rank: 1,
  salesAmt: "9007199254740993", audiCnt: "1000", salesAcc: "9007199254740993", audiAcc: "3000",
};
const kobisPayload = { boxOfficeResult: { showRange: "20260906~20260906", dailyBoxOfficeList: [{
  ...item, rank: "1",
}] } };

function storedRecord(fetchedAt: string, expiresAt: string, items = [item]) {
  return { status: items.length ? "ok" : "empty", queryDate: date, periodType: "daily",
    periodStart: date, periodEnd: date, fetchedAt, expiresAt, warnings: [], items };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("three-table cache flow", () => {
  it("uses KOBIS once, then the saved period without another upstream call", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-secret");
    vi.stubEnv("KOBIS_API_KEY", "fixture-kobis-key");
    let record: ReturnType<typeof storedRecord> | null = null;
    let kobisCalls = 0;
    let saves = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL, init?: RequestInit) => {
      if (input.pathname.endsWith("read_box_office_period")) return Response.json(record);
      if (input.pathname.endsWith("save_box_office_period")) {
        saves++;
        const body = JSON.parse(String(init?.body));
        record = storedRecord(body.p_fetched_at, new Date(Date.parse(body.p_fetched_at) + 86400000).toISOString());
        return Response.json({ saved: true });
      }
      kobisCalls++;
      return Response.json(kobisPayload);
    }));
    const first = await serveBoxoffice(new URLSearchParams({ date }), "live");
    const second = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(first.code).toBe(200);
    expect(first.body.meta).toMatchObject({ source: "kobis", status: "ok" });
    expect(second.body.meta).toMatchObject({ source: "cache", status: "ok" });
    expect(kobisCalls).toBe(1);
    expect(saves).toBe(1);
  });

  it("keeps valid empty results fresh for an hour, but never serves stale emptiness", () => {
    const fetched = "2026-09-06T00:00:00Z";
    const empty = parseStoredPeriod(storedRecord(fetched, "2026-09-06T01:00:00Z", []), date, "daily")!;
    expect(empty.meta.status).toBe("empty");
    expect(cacheIsFresh(empty, Date.parse("2026-09-06T00:59:59Z"))).toBe(true);
    expect(cacheIsFresh(empty, Date.parse("2026-09-06T01:00:00Z"))).toBe(false);
    expect(cacheCanBeStale(empty, Date.parse("2026-09-06T01:00:01Z"))).toBe(false);
  });

  it("uses a bounded nonempty stale copy when KOBIS fails", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-secret");
    vi.stubEnv("KOBIS_API_KEY", "fixture-kobis-key");
    const expired = new Date(Date.now() - 1000).toISOString();
    const fetched = new Date(Date.now() - 86401000).toISOString();
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => input.pathname.endsWith("read_box_office_period")
      ? Response.json(storedRecord(fetched, expired)) : new Response("unavailable", { status: 502 })));
    const result = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(result.code).toBe(200);
    if (!("data" in result.body)) throw new Error("expected cached data");
    expect(result.body.meta).toMatchObject({ source: "stale", status: "partial", expiresAt: expired });
    expect(result.body.meta.warnings.join(" ")).toContain("갱신에 실패");
  });

  it("returns KOBIS data with a warning when the DB save fails", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-secret");
    vi.stubEnv("KOBIS_API_KEY", "fixture-kobis-key");
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
      if (input.pathname.endsWith("read_box_office_period")) return Response.json(null);
      if (input.pathname.endsWith("save_box_office_period")) return new Response("failed", { status: 500 });
      return Response.json(kobisPayload);
    }));
    const result = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(result.code).toBe(200);
    if (!("data" in result.body)) throw new Error("expected KOBIS data");
    expect(result.body.meta.source).toBe("kobis");
    expect(result.body.meta.warnings.join(" ")).toContain("저장 또는 저장본 대조에 실패");
  });

  it("falls back to KOBIS on a DB read failure and reports both-service failure safely", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-secret");
    vi.stubEnv("KOBIS_API_KEY", "fixture-kobis-key");
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => input.pathname.includes("/rpc/")
      ? new Response("db unavailable", { status: 503 }) : Response.json(kobisPayload)));
    const fallback = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(fallback.code).toBe(200);
    if (!("data" in fallback.body)) throw new Error("expected fallback data");
    expect(fallback.body.meta.source).toBe("kobis");
    expect(fallback.body.meta.warnings.join(" ")).toContain("저장소를 읽지 못해");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const failed = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(failed.code).toBe(503);
    expect("error" in failed.body && failed.body.error.code).toBe("DB_AND_KOBIS_UNAVAILABLE");
    expect(JSON.stringify(failed.body)).not.toContain("fixture-secret");
  });

  it("returns a newer saved version when a late fetch loses the write race", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "fixture-secret");
    vi.stubEnv("KOBIS_API_KEY", "fixture-kobis-key");
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
      if (input.pathname.endsWith("read_box_office_period")) {
        reads++;
        return Response.json(reads === 1 ? null : storedRecord(
          new Date().toISOString(), new Date(Date.now() + 86400000).toISOString(), [{ ...item, audiCnt: "1001" }]));
      }
      if (input.pathname.endsWith("save_box_office_period")) return Response.json({ saved: false });
      return Response.json(kobisPayload);
    }));
    const result = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(result.code).toBe(200);
    if (!("data" in result.body)) throw new Error("expected newer data");
    expect(result.body.meta.source).toBe("cache");
    expect(result.body.data.items[0].audiCnt).toBe("1001");
  });

  it("rejects a malformed DB result and detects source differences", () => {
    const fetched = "2026-09-06T00:00:00Z";
    const expires = "2026-09-07T00:00:00Z";
    const baseline = parseStoredPeriod(storedRecord(fetched, expires), date, "daily")!;
    const changed = parseStoredPeriod(storedRecord(fetched, expires, [{ ...item, salesAmt: "9007199254740994" }]), date, "daily")!;
    expect(sameBoxofficeData(baseline, changed)).toBe(false);
    const reorderedItem = { audiAcc: item.audiAcc, audiCnt: item.audiCnt, movieNm: item.movieNm,
      rank: item.rank, salesAcc: item.salesAcc, salesAmt: item.salesAmt, openDt: item.openDt, movieCd: item.movieCd };
    const reordered = parseStoredPeriod(storedRecord(fetched, expires, [reorderedItem]), date, "daily")!;
    expect(sameBoxofficeData(baseline, reordered)).toBe(true);
    expect(() => parseStoredPeriod(storedRecord(fetched, expires, [{ ...item, audiCnt: "1.5" }]), date, "daily")).toThrow();
  });
});
