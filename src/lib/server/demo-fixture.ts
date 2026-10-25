import { periodFor, validatedInteger, type BoxofficeResult, type MovieResult, type PeriodType } from "../boxoffice";

// KOBIS-shaped numeric strings; these are fictional, not real box-office figures.
export const DEMO_START = "2026-09-07";
export const DEMO_END = "2026-09-13";
// A fictional collection time for the fixture, not a KOBIS fetch time.
export const DEMO_FETCHED_AT = "2026-09-14T00:00:00+09:00";
const movies = [
  { movieCd: "DEMO001", movieNm: "바다 너머의 약속", openDt: "2026-09-02", audiences: [1000, 1100, 1200, 1300, 2000, 3000, 2500], prior: 10000 },
  { movieCd: "DEMO002", movieNm: "서울의 별빛", openDt: "2026-09-03", audiences: [900, 1200, 1300, 1000, 1800, 2200, 2600], prior: 8000 },
  { movieCd: "DEMO003", movieNm: "작은 정원의 기적", openDt: "2026-09-04", audiences: [600, 650, 700, 750, 1000, 1500, 1400], prior: 5000 },
];

export const dailyFixture = Array.from({ length: 7 }, (_, day) => ({
  date: `2026-09-${String(day + 7).padStart(2, "0")}`,
  items: movies.map((movie) => {
    const audiCnt = movie.audiences[day];
    const cumulative = movie.prior + movie.audiences.slice(0, day + 1).reduce((a, b) => a + b, 0);
    return {
      movieCd: movie.movieCd, movieNm: movie.movieNm, openDt: movie.openDt,
      salesAmt: String(audiCnt * 10000), audiCnt: String(audiCnt),
      salesAcc: String(cumulative * 10000), audiAcc: String(cumulative),
    };
  }),
}));

function requiredInteger(value: unknown): bigint {
  const parsed = validatedInteger(value);
  if (parsed === null) throw new Error("Invalid fixture integer");
  return BigInt(parsed);
}

export function getDemoBoxoffice(date: string, type: PeriodType): BoxofficeResult {
  const period = periodFor(date, type);
  const days = date < DEMO_START || date > DEMO_END ? [] : dailyFixture.filter((day) => day.date >= period.start && day.date <= period.end);
  const byMovie = new Map<string, MovieResult>();
  for (const day of days) {
    for (const raw of day.items) {
      const previous = byMovie.get(raw.movieCd);
      byMovie.set(raw.movieCd, {
        ...raw,
        rank: 0,
        salesAmt: (requiredInteger(previous?.salesAmt ?? "0") + requiredInteger(raw.salesAmt)).toString(),
        audiCnt: (requiredInteger(previous?.audiCnt ?? "0") + requiredInteger(raw.audiCnt)).toString(),
        salesAcc: requiredInteger(raw.salesAcc).toString(),
        audiAcc: requiredInteger(raw.audiAcc).toString(),
      });
    }
  }
  const items = [...byMovie.values()].sort((a, b) => {
    const sales = requiredInteger(b.salesAmt) - requiredInteger(a.salesAmt);
    const audience = requiredInteger(b.audiCnt) - requiredInteger(a.audiCnt);
    return sales !== 0n ? (sales > 0n ? 1 : -1) : audience !== 0n ? (audience > 0n ? 1 : -1) : a.movieCd.localeCompare(b.movieCd);
  }).map((movie, index) => ({ ...movie, rank: index + 1 }));
  return {
    data: { items },
    meta: {
      status: items.length ? "ok" : "empty", mode: "demo", source: "fixture",
      queryDate: date, periodType: type, periodStart: period.start, periodEnd: period.end,
      fetchedAt: DEMO_FETCHED_AT, expiresAt: null, warnings: [],
    },
  };
}
