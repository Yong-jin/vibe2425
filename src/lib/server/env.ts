import "server-only";

// Read lazily so the scaffold can build without external-service credentials.
export function getServerEnvironment() {
  const kobisApiKey = process.env.KOBIS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!kobisApiKey || !supabaseUrl || !supabaseSecretKey) {
    throw new Error("서버 환경변수가 설정되지 않았습니다.");
  }
  return { kobisApiKey, supabaseUrl, supabaseSecretKey };
}

export function getKobisApiKey(): string | null {
  return process.env.KOBIS_API_KEY?.trim() || null;
}
