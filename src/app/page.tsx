import BoxofficeList from "@/components/boxoffice-list";

export const dynamic = "force-dynamic";
export default function HomePage() {
  return <BoxofficeList mode={process.env.DATA_MODE ?? "demo"} />;
}
