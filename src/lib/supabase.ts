import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트를 필요할 때만 불러온다.
 *
 * SDK가 40KB 남짓이라 개념 페이지 53개 전부에 얹으면 아깝다. 로그인하지 않은
 * 사람은 SDK를 아예 받지 않도록, 세션 흔적이 있을 때만 동적으로 import한다.
 *
 * 환경변수가 없으면 클라이언트를 만들지 않는다. 이 경우 사이트는 로그인 없이
 * 브라우저 저장만으로 그대로 동작한다.
 */
const URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(URL && KEY);

function projectRef(): string | null {
  if (!URL) return null;
  const matched = /^https:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec(URL);
  return matched ? matched[1]! : null;
}

/** supabase-js가 세션을 넣어 두는 localStorage 키 */
const AUTH_STORAGE_KEY = projectRef() ? `sb-${projectRef()}-auth-token` : null;

/** SDK를 불러오지 않고 로그인 흔적만 싸게 확인한다. */
export function hasStoredSession(): boolean {
  if (typeof window === 'undefined' || !AUTH_STORAGE_KEY) return false;
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getClient(): Promise<SupabaseClient | null> {
  if (!isConfigured || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) =>
        createClient(URL!, KEY!, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            // 매직 링크로 돌아왔을 때 주소에 담긴 토큰을 자동으로 처리한다
            detectSessionInUrl: true,
          },
        })
      )
      .catch(() => null);
  }
  return clientPromise;
}
