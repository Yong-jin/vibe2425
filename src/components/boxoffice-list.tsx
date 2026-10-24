"use client";

import { useEffect, useState } from "react";
import { formatInteger, koreaToday, type BoxofficeResult, type DemoScenario, type PeriodType } from "@/lib/boxoffice";

type Query = { date: string; type: PeriodType; scenario: DemoScenario; retry: number };
type View = { query: Query; status: "loading" } | { query: Query; status: "error"; message: string } | { query: Query; status: "ready"; result: BoxofficeResult };
const labels = { daily: "일간", weekly: "주간", weekend: "주말" };

export default function BoxofficeList({ mode }: { mode: string }) {
  const [query, setQuery] = useState<Query>({ date: "2026-09-13", type: "daily", scenario: "normal", retry: 0 });
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>({ query, status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ date: query.date, type: query.type, scenario: query.scenario });
    fetch(`/api/boxoffice?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "데이터를 불러오지 못했습니다.");
        if (!controller.signal.aborted) setView({ query, status: "ready", result: body });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setView({ query, status: "error", message: error instanceof Error ? error.message : "데이터를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [query]);

  const changeQuery = (patch: Partial<Query>) => setQuery({ ...query, ...patch });
  const loading = view.query !== query || view.status === "loading";
  const result = !loading && view.status === "ready" ? view.result : null;
  const items = result?.items.filter((movie) => movie.movieNm.includes(search.trim())) ?? [];

  return (
    <section>
      <p className="eyebrow">영화의 흐름을 한눈에</p>
      <h1>영화 박스오피스</h1>
      <div className="demo-banner">
        <strong>{mode === "demo" ? "DEMO · 가상 영화 데이터" : "데이터 모드 확인"}</strong>
        <p>샘플 기간 2026-09-07 ~ 2026-09-13 · 실제 흥행 수치가 아닙니다.</p>
      </div>
      <div className="filters">
        <label>조회 날짜<input type="date" value={query.date} max={koreaToday()} onChange={(e) => changeQuery({ date: e.target.value })} /></label>
        <label>기간 유형<select value={query.type} onChange={(e) => changeQuery({ type: e.target.value as PeriodType })}>
          <option value="daily">일간</option><option value="weekly">주간</option><option value="weekend">주말</option>
        </select></label>
        <label>영화명 검색<input type="search" placeholder="예: 바다" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label>데모 응답<select value={query.scenario} onChange={(e) => changeQuery({ scenario: e.target.value as DemoScenario })}>
          <option value="normal">정상 응답</option><option value="slow">느린 응답 (5초)</option><option value="error">오류 응답</option>
        </select></label>
      </div>
      <div aria-live="polite" aria-busy={loading} className="results">
        {loading ? <div className="state-card" role="status"><span className="spinner" /><h2>박스오피스 데이터를 불러오는 중입니다.</h2><p>조회 조건에 맞는 목록을 준비하고 있습니다.</p></div>
          : view.status === "error" ? <div className="state-card error" role="alert"><h2>조회 오류</h2><p>{view.message}</p><button onClick={() => changeQuery({ retry: query.retry + 1 })}>다시 시도</button>{query.scenario === "error" && <button className="secondary" onClick={() => changeQuery({ scenario: "normal" })}>정상 응답으로 복구</button>}</div>
          : result?.status === "empty" ? <div className="state-card"><h2>선택한 기간의 박스오피스 데이터가 없습니다.</h2><p>다른 날짜나 기간을 선택해 주세요.</p><button onClick={() => changeQuery({ date: "2026-09-13" })}>샘플 날짜로 돌아가기</button></div>
          : result && items.length === 0 ? <div className="state-card"><h2>검색어와 일치하는 영화가 없습니다.</h2><p>현재 조회 목록 안에서 검색합니다.</p><button onClick={() => setSearch("")}>검색어 초기화</button></div>
          : result ? <>
            <div className="result-summary"><h2>{labels[query.type]} 박스오피스 · 조회 성공</h2><p>집계 기간: {result.periodStart} ~ {result.periodEnd} · {items.length}편</p></div>
            <div className="table-scroll"><table>
              <caption>{result.queryDate} 기준 {labels[result.periodType]} 박스오피스 (가상 데이터)</caption>
              <thead><tr>{["순위", "영화명", "개봉일", "매출(원)", "관객수(명)", "누적 관객수(명)"].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
              <tbody>{items.map((movie) => <tr key={movie.movieCd}><td>{movie.rank}</td><th scope="row">{movie.movieNm}</th><td>{movie.openDt ?? "정보 없음"}</td><td className="number">{formatInteger(movie.salesAmt)}</td><td className="number">{formatInteger(movie.audiCnt)}</td><td className="number">{formatInteger(movie.audiAcc)}</td></tr>)}</tbody>
            </table></div>
            <p className="footnote">매출·관객수는 선택한 집계 기간의 값이며 누적 관객수는 집계 종료일 기준입니다.</p>
          </> : null}
      </div>
    </section>
  );
}
