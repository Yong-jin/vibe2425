import { expect, test } from "@playwright/test";

test("visitors can navigate between the two dashboard screens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "영화 박스오피스", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "인사이트", exact: true }).click();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.getByRole("heading", { name: "박스오피스 인사이트", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "박스오피스", exact: true }).click();
  await expect(page.getByRole("heading", { name: "영화 박스오피스", exact: true })).toBeVisible();
});
