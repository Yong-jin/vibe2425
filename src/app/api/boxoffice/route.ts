import "server-only";
import { serveBoxoffice } from "@/lib/server/boxoffice-service";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const result = await serveBoxoffice(new URL(request.url).searchParams);
  return Response.json(result.body, { status: result.code, headers: { "Cache-Control": "no-store" } });
}
