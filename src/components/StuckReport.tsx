import { useEffect, useState } from 'react';
import { hasStoredSession } from '../lib/supabase';
import { LEVEL_META, clampLevel } from '../lib/types';
import type { Level } from '../lib/types';

export interface DocMeta {
  slug: string;
  title: string;
  href: string;
}

interface Props {
  docs: DocMeta[];
}

interface Row {
  slug: string;
  title: string;
  href: string;
  level: Level;
  count: number;
  lastAt: string;
}

type Phase = 'loading' | 'signed-out' | { rows: Row[] };

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function StuckReport({ docs }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hasStoredSession()) {
        if (!cancelled) setPhase('signed-out');
        return;
      }

      const { getStuckSummary } = await import('../lib/sync');
      const data = await getStuckSummary();
      if (cancelled) return;

      // 권한이 없는 경우와 아직 기록이 없는 경우 둘 다 빈 배열로 온다.
      // 일부러 구분하지 않는다. 구분해서 알려주면 그 자체가
      // "당신은 운영자가 아니다"라는 정보가 되기 때문이다.
      const lookup = new Map(docs.map((d) => [d.slug, d]));
      const rows: Row[] = (data ?? [])
        .map((r) => {
          const meta = lookup.get(r.concept_slug);
          if (!meta) return null;
          return {
            slug: r.concept_slug,
            title: meta.title,
            href: meta.href,
            level: clampLevel(r.level),
            count: r.stuck_count,
            lastAt: r.last_stuck_at,
          };
        })
        .filter((r): r is Row => r !== null);

      setPhase({ rows });
    })();

    return () => {
      cancelled = true;
    };
  }, [docs]);

  if (phase === 'loading') {
    return <p className="empty">불러오는 중…</p>;
  }

  if (phase === 'signed-out') {
    return (
      <div className="my-empty">
        <p className="my-empty-title">로그인이 필요합니다.</p>
        <p>
          이 페이지는 &lsquo;여기서 막혔어요&rsquo; 기록을 모아 보여줍니다.
          운영자 계정으로 로그인해야 내용이 보입니다.
        </p>
        <ul className="link-list">
          <li>
            <a href="/my">
              <b>로그인하러 가기</b>
              <span>내 지식 페이지에서 이메일로 로그인할 수 있습니다.</span>
            </a>
          </li>
        </ul>
      </div>
    );
  }

  const rows = phase.rows;

  if (rows.length === 0) {
    return (
      <p className="empty">
        표시할 기록이 없습니다. 아직 쌓인 신호가 없거나, 이 계정에는 접근
        권한이 없을 수 있습니다.
      </p>
    );
  }

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <>
      <div className="my-stats">
        <div className="stat">
          <span className="stat-num">{rows.length}</span>
          <span className="stat-label">막힌 지점</span>
        </div>
        <div className="stat">
          <span className="stat-num">{total}</span>
          <span className="stat-label">전체 신호 수</span>
        </div>
      </div>

      <ol className="stuck-report-list">
        {rows.map((r) => (
          <li key={`${r.slug}-${r.level}`}>
            <a className="stuck-report-item" href={`${r.href}?l=${r.level}`}>
              <span className="stuck-report-count">{r.count}</span>
              <span className="stuck-report-body">
                <b>{r.title}</b>
                <span className="stuck-report-meta">
                  <span className="my-level">
                    {r.level}단계 · {LEVEL_META[r.level].label}
                  </span>
                  <span>최근 {formatDate(r.lastAt)}</span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}
