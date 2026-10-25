import { afterEach, describe, expect, it, vi } from "vitest";
import { formatInteger, isValidDate, validatedInteger } from "../../src/lib/boxoffice";
import { getDemoBoxoffice } from "../../src/lib/server/demo-fixture";
import { serveBoxoffice } from "../../src/lib/server/boxoffice-service";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("demo fixture", () => {
  it("provides all seven days and ranks by sales", () => {
    for (let day = 7; day <= 13; day++) {
      const result = getDemoBoxoffice(`2026-09-${String(day).padStart(2, "0")}`, "daily");
      expect(result.meta.status).toBe("ok");
      expect(result.data.items).toHaveLength(3);
      expect(result.data.items.map((movie) => movie.rank)).toEqual([1, 2, 3]);
    }
    expect(getDemoBoxoffice("2026-09-13", "daily").data.items[0].movieNm).toBe("서울의 별빛");
  });
  it("calculates weekly and weekend totals without adding cumulative values", () => {
    const weekly = getDemoBoxoffice("2026-09-07", "weekly");
    const sea = weekly.data.items.find((movie) => movie.movieCd === "DEMO001")!;
    expect([weekly.meta.periodStart, weekly.meta.periodEnd]).toEqual(["2026-09-07", "2026-09-13"]);
    expect(sea.salesAmt).toBe("121000000");
    expect(sea.audiCnt).toBe("12100");
    expect(sea.audiAcc).toBe("22100");
    const weekend = getDemoBoxoffice("2026-09-09", "weekend");
    expect([weekend.meta.periodStart, weekend.meta.periodEnd]).toEqual(["2026-09-11", "2026-09-13"]);
    expect(weekend.data.items.find((movie) => movie.movieCd === "DEMO001")!.salesAmt).toBe("75000000");
  });
  it("returns a normal empty result outside the fixture period for every type", () => {
    for (const type of ["daily", "weekly", "weekend"] as const) {
      expect(getDemoBoxoffice("2026-09-06", type).data.items).toEqual([]);
      expect(getDemoBoxoffice("2026-09-06", type).meta.status).toBe("empty");
    }
  });
  it("marks the fixture source and fictional collection time", () => {
    const result = getDemoBoxoffice("2026-09-13", "daily");
    expect(result.meta).toMatchObject({ source: "fixture", fetchedAt: "2026-09-14T00:00:00+09:00", expiresAt: null });
  });
});

describe("numeric strings and dates", () => {
  it("preserves exact integers and distinguishes invalid values from zero", () => {
    expect(validatedInteger("0")).toBe("0");
    for (const value of ["", "abc", "1.5", "-1", 100, "1".repeat(31)]) expect(validatedInteger(value)).toBeNull();
    expect(formatInteger("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(formatInteger(null)).toBe("정보 없음");
    expect(BigInt(validatedInteger("900")!) + BigInt(validatedInteger("1000")!)).toBe(1900n);
    expect(isValidDate("2026-02-30")).toBe(false);
  });
});

describe("server mode boundary", () => {
  it("uses fixtures only and makes no outbound fetch calls, including live mode", async () => {
    vi.useFakeTimers();
    const outbound = vi.fn(() => { throw new Error("Outbound calls prohibited"); });
    vi.stubGlobal("fetch", outbound);
    const params = new URLSearchParams({ date: "2026-09-13", type: "daily" });
    const pending = serveBoxoffice(params, "demo");
    await vi.runAllTimersAsync();
    expect((await pending).body.meta.status).toBe("ok");
    expect((await serveBoxoffice(params, "live")).code).toBe(501);
    expect((await serveBoxoffice(params, "invalid")).code).toBe(500);
    expect(outbound).not.toHaveBeenCalled();
  });
  it("distinguishes successful emptiness, simulated errors, and invalid input", async () => {
    vi.useFakeTimers();
    const empty = serveBoxoffice(new URLSearchParams({ date: "2026-09-06" }), "demo");
    const error = serveBoxoffice(new URLSearchParams({ date: "2026-09-13", scenario: "error" }), "demo");
    await vi.runAllTimersAsync();
    expect((await empty).body.meta.status).toBe("empty");
    expect((await empty).code).toBe(200);
    expect((await error).body.meta.status).toBe("error");
    expect((await error).code).toBe(503);
    const invalidParams: Record<string, string>[] = [{ date: "2026-02-30" }, { date: "2099-01-01" }, { date: "2026-09-13", type: "invalid" }];
    for (const params of invalidParams) {
      expect((await serveBoxoffice(new URLSearchParams(params), "demo")).code).toBe(400);
    }
  });
});
