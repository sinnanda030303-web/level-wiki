/**
 * 브라우저에만 저장되는 학습 기록.
 *
 * Phase 4에서 계정과 DB가 붙으면 이 모듈의 함수 본문만 서버 호출로 바꾸고
 * 화면 쪽 코드는 그대로 두는 것을 목표로 한다. 그래서 저장 형태를 처음부터
 * 버전이 붙은 하나의 객체로 두고, 읽고 쓰는 통로를 여기로만 제한한다.
 *
 * 서버에서도 import되므로 모든 함수는 window가 없는 환경을 견뎌야 한다.
 */
import type { Level } from './types';
import { hasStoredSession } from './supabase';

export const STORE_KEY = 'level-wiki:v1';

/** v1 이전에 쓰던 키. 처음 읽을 때 한 번 흡수하고 지운다. */
const LEGACY_STUCK_KEY = 'level-wiki:stuck';

/** 저장이 바뀌었을 때 같은 탭 안의 다른 컴포넌트에 알리는 이벤트 */
export const CHANGE_EVENT = 'level-wiki:change';

export interface SavedEntry {
  /** 처음 저장한 시각 (ISO) */
  savedAt: string;
  /** 마지막으로 읽은 난이도 */
  lastLevel: Level;
  /** 마지막으로 읽은 시각 (ISO) */
  lastStudiedAt: string;
  /** 마지막 퀴즈 정답률 0~100. 아직 풀지 않았으면 없다. */
  understanding?: number;
}

export interface StuckEntry {
  slug: string;
  level: number;
  at: string;
}

/** 마지막으로 서버와 맞춘 기록. 계정이 바뀌면 처음부터 다시 합친다. */
export interface SyncMark {
  userId: string;
  at: string;
}

export interface Store {
  version: 1;
  saved: Record<string, SavedEntry>;
  stuck: StuckEntry[];
  lastSync?: SyncMark;
}

const EMPTY: Store = { version: 1, saved: {}, stuck: [] };

function clone(store: Store): Store {
  return {
    version: 1,
    saved: { ...store.saved },
    stuck: [...store.stuck],
    lastSync: store.lastSync,
  };
}

/** 저장된 값이 우리가 기대하는 모양인지 확인한다. 손상된 값은 통째로 버린다. */
function parse(raw: string | null): Store | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;

    const candidate = data as Partial<Store>;
    if (candidate.version !== 1) return null;

    const saved: Record<string, SavedEntry> = {};
    for (const [slug, entry] of Object.entries(candidate.saved ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Partial<SavedEntry>;
      if (typeof e.savedAt !== 'string') continue;
      saved[slug] = {
        savedAt: e.savedAt,
        lastLevel: (typeof e.lastLevel === 'number' ? e.lastLevel : 1) as Level,
        lastStudiedAt:
          typeof e.lastStudiedAt === 'string' ? e.lastStudiedAt : e.savedAt,
        understanding:
          typeof e.understanding === 'number' ? e.understanding : undefined,
      };
    }

    const stuck = Array.isArray(candidate.stuck)
      ? candidate.stuck.filter(
          (s): s is StuckEntry =>
            !!s && typeof s === 'object' && typeof (s as StuckEntry).slug === 'string'
        )
      : [];

    const mark = candidate.lastSync;
    const lastSync =
      mark && typeof mark.userId === 'string' && typeof mark.at === 'string'
        ? { userId: mark.userId, at: mark.at }
        : undefined;

    return { version: 1, saved, stuck, lastSync };
  } catch {
    return null;
  }
}

/** v1 이전 형식(배열로만 저장된 막힘 기록)을 끌어온다. */
function migrateLegacy(): StuckEntry[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_STUCK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is StuckEntry =>
        !!s && typeof s === 'object' && typeof s.slug === 'string'
    );
  } catch {
    return [];
  }
}

export function readStore(): Store {
  if (typeof window === 'undefined') return EMPTY;

  try {
    const existing = parse(window.localStorage.getItem(STORE_KEY));
    if (existing) return existing;

    // 첫 실행이거나 값이 손상된 경우. 예전 기록이 있으면 살려 온다.
    const legacy = migrateLegacy();
    const fresh: Store = { version: 1, saved: {}, stuck: legacy };
    if (legacy.length > 0) {
      writeStore(fresh);
      window.localStorage.removeItem(LEGACY_STUCK_KEY);
    }
    return fresh;
  } catch {
    // 시크릿 모드 등에서 localStorage 접근이 막혀도 읽기를 방해하지 않는다.
    return EMPTY;
  }
}

function writeStore(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // 저장 용량 초과나 접근 차단. 화면은 계속 동작하게 둔다.
  }
}

function update(mutate: (store: Store) => void): Store {
  const next = clone(readStore());
  mutate(next);
  writeStore(next);
  return next;
}

/**
 * 서버로 변경을 밀어 보낸다.
 *
 * 로그인하지 않았으면 SDK를 부르지도 않는다. 화면은 이미 로컬 저장으로
 * 갱신된 뒤이므로, 전송이 실패해도 사용자 경험은 그대로다.
 * 다음 로그인 때 다시 맞춰진다.
 */
let suppressPush = false;

function pushRemote(
  action: 'upsert' | 'delete' | 'stuck',
  payload: { slug: string; entry?: SavedEntry; level?: Level }
): void {
  if (suppressPush) return;
  if (typeof window === 'undefined') return;
  if (!hasStoredSession()) return;

  import('./sync')
    .then((m) => m.pushChange(action, payload))
    .catch(() => {
      // 네트워크나 로딩 실패. 로컬 기록은 이미 남았으므로 조용히 넘어간다.
    });
}

/**
 * 서버에서 받아온 내용을 로컬에 반영한다.
 * 이 경로로 들어온 변경은 다시 서버로 밀어 보내지 않는다(메아리 방지).
 */
export function applyRemoteSnapshot(
  saved: Record<string, SavedEntry>,
  mark: SyncMark
): Store {
  suppressPush = true;
  try {
    return update((store) => {
      store.saved = saved;
      store.lastSync = mark;
    });
  } finally {
    suppressPush = false;
  }
}

export function getSyncMark(): SyncMark | undefined {
  return readStore().lastSync;
}

export function clearSyncMark(): void {
  update((store) => {
    store.lastSync = undefined;
  });
}

export function isSaved(slug: string): boolean {
  return slug in readStore().saved;
}

export function saveConcept(slug: string, level: Level): Store {
  const next = update((store) => {
    const now = new Date().toISOString();
    store.saved[slug] = {
      savedAt: store.saved[slug]?.savedAt ?? now,
      lastLevel: level,
      lastStudiedAt: now,
      // 이미 풀어 둔 이해도가 있으면 유지한다.
      understanding: store.saved[slug]?.understanding,
    };
  });
  pushRemote('upsert', { slug, entry: next.saved[slug] });
  return next;
}

export function unsaveConcept(slug: string): Store {
  const next = update((store) => {
    delete store.saved[slug];
  });
  pushRemote('delete', { slug });
  return next;
}

/**
 * 이미 저장한 개념을 읽고 있을 때만 진도를 갱신한다.
 * 저장하지 않은 개념까지 기록하면 사용자가 요청하지 않은 열람 이력이 쌓인다.
 */
export function touchConcept(slug: string, level: Level): void {
  const store = readStore();
  const entry = store.saved[slug];
  if (!entry) return;
  if (entry.lastLevel === level) return;

  const next = update((store) => {
    const target = store.saved[slug];
    if (!target) return;
    store.saved[slug] = {
      ...target,
      lastLevel: level,
      lastStudiedAt: new Date().toISOString(),
    };
  });
  pushRemote('upsert', { slug, entry: next.saved[slug] });
}

/**
 * 퀴즈 결과를 이해도로 남긴다.
 *
 * 누적 평균이 아니라 **마지막 점수로 덮어쓴다.** 다시 공부하고 다시 풀었을 때
 * 올라간 실력이 곧바로 보여야 "약한 개념 → 복습 → 확인"이 한 바퀴로 돌기
 * 때문이다. 평균을 내면 과거의 낮은 점수가 오래 발목을 잡는다.
 */
export function recordQuizResult(
  scores: { conceptSlug: string; percent: number }[]
): void {
  const touched: string[] = [];

  const next = update((store) => {
    for (const score of scores) {
      const entry = store.saved[score.conceptSlug];
      // 저장을 뺀 개념의 점수는 남기지 않는다. 목록에 안 보이는 값이 된다.
      if (!entry) continue;
      store.saved[score.conceptSlug] = {
        ...entry,
        understanding: score.percent,
      };
      touched.push(score.conceptSlug);
    }
  });

  for (const slug of touched) {
    pushRemote('upsert', { slug, entry: next.saved[slug] });
  }
}

export function recordStuck(slug: string, level: Level): void {
  update((store) => {
    store.stuck.push({ slug, level, at: new Date().toISOString() });
    // 오래된 기록은 버린다. 용량 한도에 부딪히지 않기 위함.
    if (store.stuck.length > 200) {
      store.stuck = store.stuck.slice(-200);
    }
  });
  pushRemote('stuck', { slug, level });
}

export function savedCount(): number {
  return Object.keys(readStore().saved).length;
}

/** 저장 변경과 다른 탭에서의 변경을 함께 구독한다. */
export function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORE_KEY) listener();
  };

  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
