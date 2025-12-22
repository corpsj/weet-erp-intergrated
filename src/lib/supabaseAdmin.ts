import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseAdmin = (() => {
  // 빌드 시점에 환경변수가 없을 경우 에러를 던지지 않고 null을 반환하거나 
  // 실제 호출 시점에 체크하도록 변경하여 빌드 중단을 방지합니다.
  if (typeof window === 'undefined') { // 서버 사이드에서만 체크
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("경고: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. 런타임 에러가 발생할 수 있습니다.");
      return null as any;
    }
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
})();

