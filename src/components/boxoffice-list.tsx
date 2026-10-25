"use client";

import { useEffect, useState } from "react";
import { formatInteger, koreaToday, type BoxofficeResult, type DemoScenario, type PeriodType } from "@/lib/boxoffice";

type Query = { date: string; type: PeriodType; scenario: DemoScenario; retry: number };
type View = { query: Query; status: "loading" } | { query: Query; status: "error"; message: string } | { query: Query; status: "ready"; result: BoxofficeResult };
const labels = { daily: "일간", weekly: "주간", weekend: "주말" };

function formatCollectedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export default function BoxofficeList({ mode, initialDate }: { mode: string; initialDate: string }) {
  const [query, setQuery] = useState<Query>({ date: initialDate, type: "daily", scenario: "normal", retry: 0 });
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>({ query, status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ date: query.date, type: query.type });
    if (mode === "demo") params.set("scenario", query.scenario);
    fetch(`/api/boxoffice?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "데이터를 불러오지 못했습니다.");
        if (!controller.signal.aborted) setView({ query, status: "ready", result: body });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setView({ query, status: "error", message: error instanceof Error ? error.message : "데이터를 불러오지 못했습니다." });
      });
    return () => controller.abort();
  }, [query, mode]);

  const changeQuery = (patch: Partial<Query>) => setQuery({ ...query, ...patch });
  const loading = view.query !== query || view.status === "loading";
  const result = !loading && view.status === "ready" ? view.result : null;
  const items = result?.data.items.filter((movie) => movie.movieNm.includes(search.trim())) ?? [];

  return (
    <section>
      <p className="eyebrow">영화의 흐름을 한눈에</p>
      <h1>영화 박스오피스</h1>
      {mode === "demo" ? <div className="demo-banner">
        <strong>DEMO · 가상 영화 데이터</strong>
        <p>샘플 기간 2026-09-07 ~ 2026-09-13 · 실제 흥행 수치가 아닙니다.</p>
      </div> : <div className="demo-banner"><strong>LIVE · KOBIS 박스오피스</strong><p>영화진흥위원회 공개 API의 자료를 조회합니다.</p></div>}
      <div className="filters">
        <label>조회 날짜<input type="date" value={query.date} max={koreaToday()} onChange={(e) => changeQuery({ date: e.target.value })} /></label>
        <label>기간 유형<select value={query.type} onChange={(e) => changeQuery({ type: e.target.value as PeriodType })}>
          <option value="daily">일간</option><option value="weekly">주간</option><option value="weekend">주말</option>
        </select></label>
        <label>영화명 검색<input type="search" placeholder="예: 바다" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {mode === "demo" && <label>데모 응답<select value={query.scenario} onChange={(e) => changeQuery({ scenario: e.target.value as DemoScenario })}>
          <option value="normal">정상 응답</option><option value="slow">느린 응답 (5초)</option><option value="error">오류 응답</option>
        </select></label>}
      </div>
      <div aria-live="polite" aria-busy={loading} className="results">
        {loading ? <div className="state-card" role="status"><span className="spinner" /><h2>박스오피스 데이터를 불러오는 중입니다.</h2><p>조회 조건에 맞는 목록을 준비하고 있습니다.</p></div>
          : view.status === "error" ? <div className="state-card error" role="alert"><h2>조회 오류</h2><p>{view.message}</p><button onClick={() => changeQuery({ retry: query.retry + 1 })}>다시 시도</button>{query.scenario === "error" && <button className="secondary" onClick={() => changeQuery({ scenario: "normal" })}>정상 응답으로 복구</button>}</div>
          : result?.meta.status === "empty" ? <div className="state-card"><h2>선택한 기간의 박스오피스 데이터가 없습니다.</h2><p>조회는 정상적으로 완료되었습니다. 해당 기간에 등록된 영화가 없습니다. 다른 날짜나 기간을 선택해 주세요.</p>{mode === "demo" && <button onClick={() => changeQuery({ date: "2026-09-13" })}>샘플 날짜로 돌아가기</button>}</div>
          : result && items.length === 0 ? <div className="state-card"><h2>검색어와 일치하는 영화가 없습니다.</h2><p>조회된 영화 {result.data.items.length}편 중 검색어 ‘{search.trim()}’에 맞는 영화가 없습니다. 검색어를 바꾸거나 초기화해 주세요.</p><button onClick={() => setSearch("")}>검색어 초기화</button></div>
          : result ? <>
            <div className="result-summary">
              <h2>{labels[result.meta.periodType]} 박스오피스 · {result.meta.source === "stale" ? "이전 자료" : "조회 성공"}</h2>
              <div className="result-meta">
                <p>집계 기간: {result.meta.periodStart} ~ {result.meta.periodEnd}</p>
                <p>조회 건수: {result.data.items.length}건 · 표시: {items.length}건</p>
                <p>출처: {{ fixture: "가상 데이터 (fixture)", kobis: "KOBIS", cache: "저장된 데이터", stale: "이전 저장 데이터" }[result.meta.source]} · {result.meta.source === "fixture" ? "가상 수집 시각" : "마지막 성공 시각"}: {formatCollectedAt(result.meta.fetchedAt)} KST</p>
                {result.meta.warnings.length > 0 && <div role="status" className="result-warnings"><strong>조회 안내</strong><ul>{result.meta.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
              </div>
            </div>
            <div className="table-scroll"><table>
              <caption>{result.meta.queryDate} 기준 {labels[result.meta.periodType]} 박스오피스 ({result.meta.source === "fixture" ? "가상 데이터" : "KOBIS"})</caption>
              <thead><tr>{["순위", "영화명", "개봉일", "매출(원)", "관객수(명)", "누적 관객수(명)"].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
              <tbody>{items.map((movie) => <tr key={movie.movieCd}><td>{movie.rank ?? "정보 없음"}</td><th scope="row">{movie.movieNm}</th><td>{movie.openDt ?? "정보 없음"}</td><td className="number">{formatInteger(movie.salesAmt)}</td><td className="number">{formatInteger(movie.audiCnt)}</td><td className="number">{formatInteger(movie.audiAcc)}</td></tr>)}</tbody>
            </table></div>
            <p className="footnote">매출·관객수는 선택한 집계 기간의 값이며 누적 관객수는 집계 종료일 기준입니다.</p>
          </> : null}
      </div>
    </section>
  );
}
