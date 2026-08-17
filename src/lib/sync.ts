/**
 * 로컬 저장과 Supabase를 맞추는 층.
 *
 * 설계 원칙: **로컬이 화면의 기준이다.**
 * 화면은 언제나 localStorage를 동기적으로 읽어 즉시 그린다. 서버 통신은
 * 뒤에서 일어나며, 실패해도 사용자는 막히지 않는다. 로그인하지 않은 사람은
 * 이 파일 자체가 로드되지 않는다.
 */
import { getClient } from './supabase';
import { applyRemoteSnapshot, readStore } from './store';
import type { SavedEntry } from './store';
import { clampLevel } from './types';
import type { Level } from './types';

interface Row {
  concept_slug: string;
  saved_at: string | null;
  last_level: number;
  last_studied_at: string;
}

export interface SyncResult {
  state: 'synced' | 'signed-out' | 'unconfigured' | 'error';
  count?: number;
  email?: string;
  message?: string;
}

function rowToEntry(row: Row): SavedEntry {
  return {
    savedAt: row.saved_at ?? row.last_studied_at,
    lastLevel: clampLevel(row.last_level),
    lastStudiedAt: row.last_studied_at,
  };
}

function entryToRow(userId: string, slug: string, entry: SavedEntry) {
  return {
    user_id: userId,
    concept_slug: slug,
    saved_at: entry.savedAt,
    last_level: entry.lastLevel,
    last_studied_at: entry.lastStudiedAt,
  };
}

function isNewer(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
}

/** 단건 변경을 서버에 반영한다. store.ts가 저장 직후에 부른다. */
export async function pushChange(
  action: 'upsert' | 'delete' | 'stuck',
  payload: { slug: string; entry?: SavedEntry; level?: Level }
): Promise<void> {
  const client = await getClient();
  if (!client) return;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;

  if (action === 'upsert' && payload.entry) {
    await client
      .from('user_concepts')
      .upsert(entryToRow(user.id, payload.slug, payload.entry), {
        onConflict: 'user_id,concept_slug',
      });
    return;
  }

  if (action === 'delete') {
    await client
      .from('user_concepts')
      .delete()
      .eq('user_id', user.id)
      .eq('concept_slug', payload.slug);
    return;
  }

  if (action === 'stuck' && payload.level) {
    await client.from('stuck_events').insert({
      user_id: user.id,
      concept_slug: payload.slug,
      level: payload.level,
    });
  }
}

/**
 * 서버와 전체를 맞춘다.
 *
 * 이 계정으로 처음 맞추는 기기라면 로컬과 서버를 **합친다.** 로그인 전에
 * 쌓아 둔 기록을 잃지 않기 위해서다. 한 번 맞춘 뒤로는 이 기기의 변경이
 * 그때그때 서버로 갔으므로 **서버를 기준으로 삼는다.** 그래야 다른 기기에서
 * 지운 항목이 되살아나지 않는다.
 */
export async function syncNow(): Promise<SyncResult> {
  const client = await getClient();
  if (!client) return { state: 'unconfigured' };

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { state: 'signed-out' };

  const local = readStore();
  const firstSyncForAccount = local.lastSync?.userId !== user.id;

  const { data, error } = await client
    .from('user_concepts')
    .select('concept_slug, saved_at, last_level, last_studied_at')
    .eq('user_id', user.id);

  if (error) return { state: 'error', message: error.message };

  const remote = new Map<string, SavedEntry>(
    (data as Row[]).map((row) => [row.concept_slug, rowToEntry(row)])
  );

  const merged: Record<string, SavedEntry> = {};
  const toUpsert: ReturnType<typeof entryToRow>[] = [];

  if (firstSyncForAccount) {
    // 로컬에만 있거나 로컬이 더 최근인 것은 서버로 올린다.
    for (const [slug, entry] of Object.entries(local.saved)) {
      const other = remote.get(slug);
      if (!other || isNewer(entry.lastStudiedAt, other.lastStudiedAt)) {
        merged[slug] = entry;
        toUpsert.push(entryToRow(user.id, slug, entry));
      } else {
        merged[slug] = other;
      }
    }
    for (const [slug, entry] of remote) {
      if (!merged[slug]) merged[slug] = entry;
    }
  } else {
    for (const [slug, entry] of remote) merged[slug] = entry;
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await client
      .from('user_concepts')
      .upsert(toUpsert, { onConflict: 'user_id,concept_slug' });
    if (upsertError) return { state: 'error', message: upsertError.message };
  }

  applyRemoteSnapshot(merged, {
    userId: user.id,
    at: new Date().toISOString(),
  });

  return {
    state: 'synced',
    count: Object.keys(merged).length,
    email: user.email ?? undefined,
  };
}

export async function getCurrentEmail(): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.email ?? null;
}

export async function sendMagicLink(email: string): Promise<{ error?: string }> {
  const client = await getClient();
  if (!client) return { error: '로그인 설정이 아직 되어 있지 않습니다.' };

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/my` },
  });
  return error ? { error: error.message } : {};
}

export async function signOut(): Promise<void> {
  const client = await getClient();
  if (!client) return;
  await client.auth.signOut();
}
