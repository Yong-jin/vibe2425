import InsightsDashboard from "@/components/insights-dashboard";
import { koreaYesterday } from "@/lib/boxoffice";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const mode = process.env.DATA_MODE ?? "demo";
  const initialDate = mode === "live" ? koreaYesterday() : "2026-09-13";
  return <InsightsDashboard mode={mode} initialDate={initialDate} />;
}
