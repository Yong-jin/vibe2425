import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKobisBoxoffice, KobisError, parseKobisResponse } from "../../src/lib/server/kobis";
import { serveBoxoffice } from "../../src/lib/server/boxoffice-service";

const date = "2026-09-06";
const row = {
  movieCd: "20260001", movieNm: "검증 영화", rank: "1", openDt: "2026-09-01",
  salesAmt: "9007199254740993", audiCnt: "1000", salesAcc: "9007199254740993", audiAcc: "3000",
};

function payload(type: "daily" | "weekly" | "weekend" = "daily", items: unknown[] = [row]) {
  return { boxOfficeResult: {
    showRange: type === "daily" ? "20260906~20260906" : type === "weekly" ? "20260831~20260906" : "20260904~20260906",
    [type === "daily" ? "dailyBoxOfficeList" : "weeklyBoxOfficeList"]: items,
  } };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("KOBIS response validation", () => {
  it("preserves large numeric strings and the actual daily range", () => {
    const result = parseKobisResponse(payload(), date, "daily", "2026-09-07T00:00:00Z");
    expect(result.data.items[0]).toMatchObject({ movieCd: row.movieCd, salesAmt: row.salesAmt, audiCnt: "1000", rank: 1 });
    expect(result.meta).toMatchObject({ status: "ok", mode: "live", source: "kobis", periodStart: date, periodEnd: date });
  });
  it("distinguishes a valid empty list from malformed or fault responses", () => {
    expect(parseKobisResponse(payload("daily", []), date, "daily", "now").meta.status).toBe("empty");
    expect(() => parseKobisResponse({ faultInfo: { message: "hidden" } }, date, "daily", "now")).toThrowError(KobisError);
    expect(() => parseKobisResponse({ boxOfficeResult: { showRange: "20260906~20260906" } }, date, "daily", "now")).toThrowError(KobisError);
    expect(() => parseKobisResponse(payload("daily", [{ ...row, movieCd: "" }]), date, "daily", "now")).toThrowError(KobisError);
    expect(() => parseKobisResponse(payload("daily", [row, row]), date, "daily", "now")).toThrowError(KobisError);
  });
  it("turns invalid optional values into null with warnings, not zero", () => {
    const result = parseKobisResponse(payload("daily", [{ ...row, rank: "0", openDt: "2026-02-30", salesAmt: "1.5", audiCnt: "", audiAcc: 10 }]), date, "daily", "now");
    expect(result.data.items[0]).toMatchObject({ rank: null, openDt: null, salesAmt: null, audiCnt: null, audiAcc: null });
    expect(result.meta.warnings).toHaveLength(5);
  });
  it("rejects a mismatched weekly range", () => {
    expect(() => parseKobisResponse(payload("weekly"), date, "weekly", "now")).not.toThrow();
    expect(() => parseKobisResponse(payload("weekend"), date, "weekend", "now")).not.toThrow();
    expect(() => parseKobisResponse(payload("weekly"), "2026-09-13", "weekly", "now")).toThrowError(KobisError);
  });
});

describe("KOBIS request and failure boundary", () => {
  it("maps dates and weekGb without exposing the key in responses", async () => {
    const calls: { targetDt: string | null; weekGb: string | null; keyPresent: boolean }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
      calls.push({ targetDt: input.searchParams.get("targetDt"), weekGb: input.searchParams.get("weekGb"), keyPresent: input.searchParams.has("key") });
      const type = calls.length === 1 ? "daily" : calls.length === 2 ? "weekly" : "weekend";
      return Response.json(payload(type));
    }));
    for (const type of ["daily", "weekly", "weekend"] as const) {
      const result = await fetchKobisBoxoffice(date, type, "fixture-key");
      expect(JSON.stringify(result)).not.toContain("fixture-key");
    }
    expect(calls).toEqual([
      { targetDt: "20260906", weekGb: null, keyPresent: true },
      { targetDt: "20260906", weekGb: "0", keyPresent: true },
      { targetDt: "20260906", weekGb: "1", keyPresent: true },
    ]);
  });
  it("returns safe errors for invalid JSON, HTTP failure, and live-only demo options", async () => {
    vi.stubEnv("KOBIS_API_KEY", "fixture-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    const upstream = await serveBoxoffice(new URLSearchParams({ date }), "live");
    expect(upstream.code).toBe(502);
    expect("error" in upstream.body && upstream.body.error.code).toBe("KOBIS_UPSTREAM_ERROR");
    expect(JSON.stringify(upstream.body)).not.toContain("fixture-key");
    expect((await serveBoxoffice(new URLSearchParams({ date, scenario: "error" }), "live")).code).toBe(400);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    await expect(fetchKobisBoxoffice(date, "daily", "fixture-key")).rejects.toMatchObject({ status: 502, code: "KOBIS_INVALID_RESPONSE" });
  });
  it("classifies an aborted upstream request as a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: URL, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    vi.useFakeTimers();
    const pending = fetchKobisBoxoffice(date, "daily", "fixture-key");
    const assertion = expect(pending).rejects.toMatchObject({ status: 504, code: "KOBIS_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
  });
});
