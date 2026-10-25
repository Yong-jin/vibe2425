import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoxofficeResult, PeriodType } from "../boxoffice";

function snapshotPath(date: string, period: PeriodType, fetchedAt: string): string {
  const timestamp = Date.parse(fetchedAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp)) throw new Error("Invalid snapshot identifier");
  return join(process.cwd(), ".data", "boxoffice-originals", `${date}_${period}_${timestamp}.json`);
}

export async function saveOriginalSnapshot(result: BoxofficeResult): Promise<void> {
  const path = snapshotPath(result.meta.queryDate, result.meta.periodType, result.meta.fetchedAt);
  await mkdir(join(process.cwd(), ".data", "boxoffice-originals"), { recursive: true });
  try {
    await writeFile(path, JSON.stringify(result), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

export async function readOriginalSnapshot(date: string, period: PeriodType, fetchedAt: string): Promise<BoxofficeResult> {
  const content = await readFile(snapshotPath(date, period, fetchedAt), "utf8");
  return JSON.parse(content) as BoxofficeResult;
}
