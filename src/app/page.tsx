import BoxofficeList from "@/components/boxoffice-list";
import { koreaYesterday } from "@/lib/boxoffice";

export const dynamic = "force-dynamic";
export default function HomePage() {
  const mode = process.env.DATA_MODE ?? "demo";
  const initialDate = mode === "live" ? koreaYesterday() : "2026-09-13";
  return <BoxofficeList mode={mode} initialDate={initialDate} />;
}
