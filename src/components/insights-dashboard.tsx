"use client";

import { useEffect, useRef, useState } from "react";
import { isValidDate, koreaToday } from "@/lib/boxoffice";
import { calculateInsights, datesEndingAt, formatHundredMillionWon, formatThousandPeople, formatWonPerPerson,
  parseDailyObservation, type DayObservation } from "@/lib/insights";

type Duration = 7 | 14 | 30;
type Selection = { endDate: string; days: Duration };

function pendingDays(selection: Selection): Record<string, DayObservation> {
  return Object.fromEntries(datesEndingAt(selection.endDate, selection.days).map((date) => [date, { date, status: "loading" }]));
}

async function fetchDay(date: string, signal: AbortSignal): Promise<DayObservation> {
  try {
    const response = await fetch(`/api/boxoffice?date=${date}&type=daily`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("일간 데이터를 불러오지 못했습니다.");
    return parseDailyObservation(await response.json(), date);
  } catch (error) {
    return { date, status: "error", reason: error instanceof Error ? error.message : "일간 데이터를 불러오지 못했습니다." };
  }
}

function SalesLineChart({ series }: { series: ReturnType<typeof calculateInsights>["series"] }) {
  const values = series.map((point) => point.salesAmt);
  const max = values.reduce<bigint>((highest, value) => value !== null && value > highest ? value : highest, 0n);
  const safeMax = max > 0n ? max : 1n;
  const coordinate = (value: bigint, index: number) => ({
    x: 48 + index * (664 / Math.max(1, series.length - 1)),
    y: 216 - Number(value * 160n / safeMax),
  });
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    } else {
      const { x, y } = coordinate(value, index);
      current.push(`${current.length === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
  });
  if (current.length > 1) segments.push(current.join(" "));

  return <svg className="sales-chart" viewBox="0 0 760 280" role="img" aria-label="일별 Top 10 관측 매출 합계 추이. 빈 날짜와 실패 날짜는 선이 끊깁니다.">
    <line x1="48" y1="216" x2="712" y2="216" className="chart-axis" />
    <line x1="48" y1="56" x2="48" y2="216" className="chart-axis" />
    <text x="48" y="42" className="chart-label">{formatHundredMillionWon(max)}</text>
    <text x="48" y="240" className="chart-label">{series[0]?.date.slice(5)}</text>
    <text x="712" y="240" textAnchor="end" className="chart-label">{series.at(-1)?.date.slice(5)}</text>
    {segments.map((path, index) => <path key={index} d={path} className="chart-line" />)}
    {series.map((point, index) => {
      const x = 48 + index * (664 / Math.max(1, series.length - 1));
      if (point.salesAmt === null) return <circle key={point.date} cx={x} cy="216" r="4" className="chart-gap" />;
      const { y } = coordinate(point.salesAmt, index);
      return <circle key={point.date} cx={x} cy={y} r="4" className="chart-point"><title>{point.date}: {formatHundredMillionWon(point.salesAmt)}</title></circle>;
    })}
  </svg>;
}

export default function InsightsDashboard({ mode, initialDate }: { mode: string; initialDate: string }) {
  const [selection, setSelection] = useState<Selection>({ endDate: initialDate, days: 7 });
  const [records, setRecords] = useState<Record<string, DayObservation>>(() => pendingDays({ endDate: initialDate, days: 7 }));
  const [topCount, setTopCount] = useState<5 | 10>(5);
  const retryControllers = useRef(new Map<string, AbortController>());
  const currentKey = useRef(`${initialDate}:7`);

  useEffect(() => {
    let active = true;
    const key = `${selection.endDate}:${selection.days}`;
    const controllers = new Set<AbortController>();
    const retries = retryControllers.current;
    const dates = datesEndingAt(selection.endDate, selection.days);
    let next = 0;
    async function worker() {
      while (active && next < dates.length) {
        const date = dates[next++];
        const controller = new AbortController();
        controllers.add(controller);
        const observation = await fetchDay(date, controller.signal);
        controllers.delete(controller);
        if (active && currentKey.current === key) setRecords((previous) => ({ ...previous, [date]: observation }));
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, dates.length) }, () => worker()));
    return () => {
      active = false;
      controllers.forEach((controller) => controller.abort());
      retries.forEach((controller) => controller.abort());
      retries.clear();
    };
  }, [selection]);

  function changeSelection(next: Selection) {
    if (!isValidDate(next.endDate) || next.endDate > koreaToday()) return;
    currentKey.current = `${next.endDate}:${next.days}`;
    setSelection(next);
    setRecords(pendingDays(next));
  }

  async function retryDay(date: string) {
    retryControllers.current.get(date)?.abort();
    const controller = new AbortController();
    retryControllers.current.set(date, controller);
    const key = currentKey.current;
    setRecords((previous) => ({ ...previous, [date]: { date, status: "loading" } }));
    const observation = await fetchDay(date, controller.signal);
    if (!controller.signal.aborted && currentKey.current === key) {
      setRecords((previous) => ({ ...previous, [date]: observation }));
    }
    if (retryControllers.current.get(date) === controller) retryControllers.current.delete(date);
  }

  const dates = datesEndingAt(selection.endDate, selection.days);
  const days = dates.map((date) => records[date] ?? { date, status: "loading" as const });
  const insight = calculateInsights(days);
  const finished = selection.days - insight.counts.loading;
  const firstDate = dates[0];
  const hasMissing = insight.counts.empty + insight.counts.error > 0;
  const allEmpty = insight.counts.empty === selection.days;
  const allFailed = insight.counts.error === selection.days;
  const largest = insight.movies[0]?.salesAmt ?? 0n;

  return <section className="insights-page">
    <p className="eyebrow">흥행 추이 살펴보기</p>
    <h1>박스오피스 인사이트</h1>
    <p className="insight-notice"><strong>일별 Top 10 관측 데이터 기준</strong>입니다. 전체 영화 시장 통계가 아니며, 순위 밖 영화의 매출·관객수를 0으로 추정하지 않습니다.</p>
    {mode === "demo" && <p className="demo-banner">DEMO · 가상 데이터 기간은 2026-09-07 ~ 2026-09-13입니다. 14일·30일을 선택하면 샘플 밖 날짜가 정상 빈 날짜로 표시됩니다.</p>}
    <div className="insight-controls">
      <label>분석 종료일<input type="date" value={selection.endDate} max={koreaToday()} onChange={(event) => changeSelection({ ...selection, endDate: event.target.value })} /></label>
      <fieldset><legend>조회 기간</legend><div className="choice-row">{([7, 14, 30] as const).map((count) =>
        <button key={count} type="button" aria-pressed={selection.days === count} className={selection.days === count ? "" : "secondary"} onClick={() => changeSelection({ ...selection, days: count })}>{count}일</button>)}</div></fieldset>
    </div>
    <p className="insight-range">분석 기간: {firstDate} ~ {selection.endDate} · 일간 응답 {selection.days}개</p>
    <section className="progress-panel" aria-label="날짜별 조회 진행 상황">
      <div className="progress-heading"><h2>조회 진행률</h2><strong>{finished}/{selection.days}일 완료</strong></div>
      <progress value={finished} max={selection.days}>{finished}/{selection.days}</progress>
      <div className="status-counts" aria-live="polite">
        <span>정상 {insight.counts.ok}</span><span>빈 날짜 {insight.counts.empty}</span>
        <span>실패 {insight.counts.error}</span><span>조회 중 {insight.counts.loading}</span>
      </div>
    </section>
    {allEmpty && <div className="state-card"><h2>선택한 분석 기간에 표시할 데이터가 없습니다.</h2><p>모든 날짜의 조회는 정상적으로 완료됐지만 목록이 비어 있습니다.</p></div>}
    {allFailed && <div className="state-card error" role="alert"><h2>분석 기간을 불러오지 못했습니다.</h2><p>실패한 날짜를 아래에서 각각 다시 시도해 주세요.</p></div>}
    {hasMissing && !allEmpty && !allFailed && <p className="partial-note">부분 집계: 정상 {insight.counts.ok}일, 제외 {insight.counts.empty + insight.counts.error}일입니다. 빈 날짜와 실패 날짜는 차트에서 끊어 표시하고 기간 합계·Top 순위는 숨깁니다.</p>}
    <div className="insight-charts">
      <section className="insight-panel">
        <h2>일별 Top 10 관측 매출 합계 추이</h2>
        <p>날짜별 흥행 규모 변화를 봅니다. 빈 날짜·실패 날짜·조회 중인 날짜는 선을 잇지 않습니다.</p>
        <SalesLineChart series={insight.series} />
        <p className="chart-key">● 정상 관측일　○ 빈 날짜·실패·조회 중</p>
        {insight.complete && insight.salesAmt !== null && <p className="chart-total">기간 관측 매출 합계: <strong>{formatHundredMillionWon(insight.salesAmt)}</strong></p>}
      </section>
      <section className="insight-panel">
        <div className="top-heading"><h2>영화별 일별 Top 10 관측 매출 합계 Top {topCount}</h2>
          <label>표시 개수<select value={topCount} onChange={(event) => setTopCount(Number(event.target.value) as 5 | 10)}><option value={5}>Top 5</option><option value={10}>Top 10</option></select></label>
        </div>
        <p>관측된 영화별 기여를 비교합니다. 영화 코드를 기준으로 묶으며 순위 밖 날짜는 0으로 채우지 않습니다.</p>
        {insight.complete ? <ol className="bar-chart">{insight.movies.slice(0, topCount).map((movie) =>
          <li key={movie.movieCd}><div className="bar-label"><strong>{movie.movieNm}</strong><span>{formatHundredMillionWon(movie.salesAmt)}</span></div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${largest > 0n ? Number(movie.salesAmt * 100n / largest) : 0}%` }} /></div></li>)}</ol>
          : <div className="chart-placeholder">모든 날짜가 정상일 때 기간별 Top 순위를 표시합니다.</div>}
      </section>
    </div>
    <div className="insight-metrics">
      <section className="metric-card"><h2>일별 Top 10 관측 관객 합계</h2><strong>{insight.complete && insight.audiCnt !== null ? formatThousandPeople(insight.audiCnt) : "—"}</strong><p>기간에 관측된 관객 규모를 보여줍니다.</p></section>
      <section className="metric-card"><h2>관객당 관측 매출</h2><strong>{insight.complete ? formatWonPerPerson(insight.revenuePerAudience) : "—"}</strong><p>매출 합계를 관객 합계로 나눕니다. 관객이 0명이면 계산하지 않습니다.</p></section>
    </div>
    <section className="insight-panel day-panel">
      <h2>날짜별 상태</h2>
      <p>정상 날짜의 값은 일별 Top 10 목록 안에서 관측한 합계입니다. 실패한 날짜만 다시 조회할 수 있습니다.</p>
      <ul className="day-list">{days.map((day) => {
        const total = day.status === "ok" ? insight.series.find((point) => point.date === day.date)?.salesAmt : null;
        const label = { loading: "조회 중", ok: "정상", empty: "빈 날짜", error: "실패" }[day.status];
        return <li key={day.date}><span>{day.date}</span><strong className={`day-${day.status}`}>{label}</strong>
          <span>{total !== null && total !== undefined ? formatHundredMillionWon(total) : day.reason ?? "—"}</span>
          {day.status === "error" && <button type="button" onClick={() => void retryDay(day.date)} aria-label={`${day.date} 다시 시도`}>그날만 다시 시도</button>}</li>;
      })}</ul>
    </section>
  </section>;
}
