import { expect, test } from "@playwright/test";
import { getDemoBoxoffice } from "../../src/lib/server/demo-fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/boxoffice?**", async (route) => {
    const url = new URL(route.request().url());
    const date = url.searchParams.get("date") ?? "";
    expect(url.searchParams.get("type")).toBe("daily");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(getDemoBoxoffice(date, "daily")) });
  });
});

test("shows exact daily observations, then keeps 14 and 30 day gaps", async ({ page }) => {
  await page.goto("/insights");
  await page.getByLabel("분석 종료일").fill("2026-09-13");
  await expect(page.getByText("7/7일 완료")).toBeVisible();
  await expect(page.getByText("정상 7", { exact: true })).toBeVisible();
  await expect(page.getByText("빈 날짜 0", { exact: true })).toBeVisible();
  await expect(page.locator(".day-list li").filter({ hasText: "2026-09-07" })).toContainText("0.25억 원");
  await expect(page.locator(".day-list li").filter({ hasText: "2026-09-08" })).toContainText("0.30억 원");
  await expect(page.getByText("관객당 관측 매출").locator("..") ).toContainText("10,000원/명");

  await page.getByRole("button", { name: "14일" }).click();
  await expect(page.getByText("14/14일 완료")).toBeVisible();
  await expect(page.getByText("정상 7", { exact: true })).toBeVisible();
  await expect(page.getByText("빈 날짜 7", { exact: true })).toBeVisible();
  await expect(page.getByText("기간 관측 매출 합계")).toHaveCount(0);
  await expect(page.getByText("모든 날짜가 정상일 때 기간별 Top 순위를 표시합니다.")).toBeVisible();

  await page.getByRole("button", { name: "30일" }).click();
  await expect(page.getByText("30/30일 완료")).toBeVisible();
  await expect(page.getByText("정상 7", { exact: true })).toBeVisible();
  await expect(page.getByText("빈 날짜 23", { exact: true })).toBeVisible();
});

test("retries only one failed date", async ({ page }) => {
  let failed = false;
  const requests: string[] = [];
  await page.unrouteAll();
  await page.route("**/api/boxoffice?**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? "";
    requests.push(date);
    if (date === "2026-09-10" && !failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(getDemoBoxoffice(date, "daily")) });
    }
  });
  await page.goto("/insights");
  await page.getByLabel("분석 종료일").fill("2026-09-13");
  await expect(page.getByText("7/7일 완료")).toBeVisible();
  await expect(page.getByText("실패 1", { exact: true })).toBeVisible();
  const previousRequests = requests.length;
  await page.getByRole("button", { name: "2026-09-10 다시 시도" }).click();
  await expect(page.getByText("실패 0", { exact: true })).toBeVisible();
  await expect(page.getByText("정상 7", { exact: true })).toBeVisible();
  expect(requests.slice(previousRequests)).toEqual(["2026-09-10"]);
});
