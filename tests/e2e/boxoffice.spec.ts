import { expect, test } from "@playwright/test";

test("filters, search and empty responses have distinct states", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(4);
  await expect(page.getByRole("columnheader")).toHaveCount(6);
  await expect(page.getByText("조회 건수: 3건 · 표시: 3건")).toBeVisible();
  await expect(page.getByText(/출처: 가상 데이터 \(fixture\) · 가상 수집 시각: .* KST/)).toBeVisible();
  await page.getByLabel("영화명 검색").fill(" 바다 ");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByText("조회 건수: 3건 · 표시: 1건")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "바다 너머의 약속" })).toBeVisible();
  await page.getByLabel("영화명 검색").fill("없는 제목");
  await expect(page.getByRole("heading", { name: "검색어와 일치하는 영화가 없습니다." })).toBeVisible();
  await expect(page.getByText(/조회된 영화 3편 중 검색어 ‘없는 제목’에 맞는 영화가 없습니다/)).toBeVisible();
  await page.getByRole("button", { name: "검색어 초기화" }).click();
  await expect(page.getByRole("row")).toHaveCount(4);
  await page.getByLabel("기간 유형").selectOption("weekly");
  await expect(page.getByText("집계 기간: 2026-09-07 ~ 2026-09-13", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "121,000,000", exact: true })).toBeVisible();
  await page.getByLabel("기간 유형").selectOption("weekend");
  await expect(page.getByText("집계 기간: 2026-09-11 ~ 2026-09-13", { exact: false })).toBeVisible();
  await page.getByLabel("조회 날짜").fill("2026-09-06");
  await expect(page.getByRole("heading", { name: "선택한 기간의 박스오피스 데이터가 없습니다." })).toBeVisible();
  await expect(page.getByText(/조회는 정상적으로 완료되었습니다/)).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("loading, error and recovery are reproducible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("데모 응답").selectOption("slow");
  await expect(page.getByRole("heading", { name: "박스오피스 데이터를 불러오는 중입니다." })).toBeVisible();
  await page.getByLabel("데모 응답").selectOption("error");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("조회 오류");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("조회 오류");
  await page.getByRole("button", { name: "정상 응답으로 복구" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("조회 날짜").fill("2026-09-06");
  await expect(page.getByRole("heading", { name: "선택한 기간의 박스오피스 데이터가 없습니다." })).toBeVisible();
  await page.waitForTimeout(5100);
  await expect(page.getByRole("heading", { name: "선택한 기간의 박스오피스 데이터가 없습니다." })).toBeVisible();
});

test("invalid API input is rejected and normal emptiness returns 200", async ({ request }) => {
  expect((await request.get("/api/boxoffice?date=2026-02-30&type=daily")).status()).toBe(400);
  const empty = await request.get("/api/boxoffice?date=2026-09-06&type=daily");
  expect(empty.status()).toBe(200);
  expect(await empty.json()).toMatchObject({ data: { items: [] }, meta: { status: "empty", source: "fixture" } });
});
