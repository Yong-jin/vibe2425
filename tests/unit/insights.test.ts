import { describe, expect, it } from "vitest";
import { getDemoBoxoffice } from "../../src/lib/server/demo-fixture";
import { calculateInsights, datesEndingAt, formatHundredMillionWon, formatThousandPeople,
  formatWonPerPerson, parseDailyObservation, type DayObservation } from "../../src/lib/insights";

function demoDay(date: string) {
  return parseDailyObservation(getDemoBoxoffice(date, "daily"), date);
}

describe("F2 observed Top 10 calculations", () => {
  it("matches a two-day hand calculation before changing display units", () => {
    const september7 = demoDay("2026-09-07");
    const september8 = demoDay("2026-09-08");
    const result = calculateInsights([september7, september8]);
    // 9/7: (1,000 + 900 + 600) × 10,000 = 25,000,000원; 2,500명.
    // 9/8: (1,100 + 1,200 + 650) × 10,000 = 29,500,000원; 2,950명.
    expect(result.series.map((point) => point.salesAmt)).toEqual([25_000_000n, 29_500_000n]);
    expect(result.series.map((point) => point.audiCnt)).toEqual([2_500n, 2_950n]);
    expect(result.salesAmt).toBe(54_500_000n);
    expect(result.audiCnt).toBe(5_450n);
    expect(result.revenuePerAudience).toBe(10_000n);
    expect(result.movies.map((movie) => [movie.movieCd, movie.salesAmt])).toEqual([
      ["DEMO001", 21_000_000n], ["DEMO002", 21_000_000n], ["DEMO003", 12_500_000n],
    ]);
    expect(formatHundredMillionWon(result.salesAmt!)).toBe("0.55억 원");
    expect(formatThousandPeople(result.audiCnt!)).toBe("5.5천 명");
    expect(formatWonPerPerson(result.revenuePerAudience)).toBe("10,000원/명");
  });

  it("leaves demo dates outside the seven-day fixture as gaps in 14 and 30 days", () => {
    for (const length of [14, 30] as const) {
      const dates = datesEndingAt("2026-09-13", length);
      const result = calculateInsights(dates.map(demoDay));
      expect(dates[0]).toBe(length === 14 ? "2026-08-31" : "2026-08-15");
      expect(result.counts).toEqual({ ok: 7, empty: length - 7, error: 0, loading: 0 });
      expect(result.series.filter((point) => point.salesAmt === null)).toHaveLength(length - 7);
      expect(result.complete).toBe(false);
      expect(result.salesAmt).toBeNull();
      expect(result.movies).toEqual([]);
    }
  });

  it("does not sum cumulative figures or invent zero for a missing movie", () => {
    const days: DayObservation[] = [
      { date: "2026-09-07", status: "ok", items: [
        { movieCd: "A", movieNm: "같은 제목", salesAmt: "900", audiCnt: "90" },
        { movieCd: "B", movieNm: "같은 제목", salesAmt: "1000", audiCnt: "100" },
      ] },
      { date: "2026-09-08", status: "ok", items: [
        { movieCd: "A", movieNm: "새 이름", salesAmt: "1000", audiCnt: "100" },
      ] },
    ];
    const result = calculateInsights(days);
    expect(result.salesAmt).toBe(2900n);
    expect(result.movies).toEqual([
      { movieCd: "A", movieNm: "새 이름", salesAmt: 1900n, audiCnt: 190n },
      { movieCd: "B", movieNm: "같은 제목", salesAmt: 1000n, audiCnt: 100n },
    ]);
    expect(result.series[1].salesAmt).toBe(1000n);
  });

  it("breaks equal-sales ties by audience and then movie code", () => {
    const result = calculateInsights([{ date: "2026-09-07", status: "ok", items: [
      { movieCd: "B", movieNm: "영화", salesAmt: "1000", audiCnt: "100" },
      { movieCd: "C", movieNm: "영화", salesAmt: "1000", audiCnt: "200" },
      { movieCd: "A", movieNm: "영화", salesAmt: "1000", audiCnt: "200" },
    ] }]);
    expect(result.movies.map((movie) => movie.movieCd)).toEqual(["A", "C", "B"]);
  });

  it("hides period totals for empty, failed, or loading days and handles zero audience", () => {
    const valid = demoDay("2026-09-07");
    const partial = calculateInsights([valid, { date: "2026-09-08", status: "error" }, { date: "2026-09-09", status: "empty" }]);
    expect(partial.counts).toEqual({ ok: 1, empty: 1, error: 1, loading: 0 });
    expect(partial.series.map((point) => point.salesAmt)).toEqual([25_000_000n, null, null]);
    expect(partial.movies).toEqual([]);
    expect(partial.revenuePerAudience).toBeNull();
    const zeroAudience = calculateInsights([{ date: "2026-09-07", status: "ok", items: [
      { movieCd: "A", movieNm: "A", salesAmt: "9007199254740993", audiCnt: "0" },
    ] }]);
    expect(zeroAudience.salesAmt).toBe(9007199254740993n);
    expect(zeroAudience.revenuePerAudience).toBeNull();
    expect(formatWonPerPerson(zeroAudience.revenuePerAudience)).toBe("—");
  });

  it("rejects stale, weekly, and invalid numeric responses for the daily insight", () => {
    const daily = getDemoBoxoffice("2026-09-07", "daily");
    expect(() => parseDailyObservation(getDemoBoxoffice("2026-09-07", "weekly"), "2026-09-07")).toThrow();
    expect(parseDailyObservation({ ...daily, meta: { ...daily.meta, status: "partial" } }, "2026-09-07").status).toBe("error");
    const invalid = { ...daily, data: { items: [{ ...daily.data.items[0], salesAmt: "1.5" }] } };
    expect(() => parseDailyObservation(invalid, "2026-09-07")).toThrow();
  });
});
