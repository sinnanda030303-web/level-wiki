import { useEffect, useMemo, useState } from 'react';
import { readStore, subscribe, unsaveConcept } from '../lib/store';
import type { SavedEntry } from '../lib/store';
import { FIELD_META, LEVEL_META, clampLevel } from '../lib/types';

/** 빌드 타임에 넘겨받는 개념 메타데이터. 저장소에는 slug만 들어 있다. */
export interface ConceptMeta {
  slug: string;
  title: string;
  summary: string;
  field: string;
}

interface Props {
  concepts: ConceptMeta[];
}

interface Row extends ConceptMeta {
  entry: SavedEntry;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function MyWiki({ concepts }: Props) {
  // localStorage는 서버에서 읽을 수 없다. 마운트 전에는 '읽는 중'으로 둔다.
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Record<string, SavedEntry>>({});

  useEffect(() => {
    const sync = () => {
      setSaved(readStore().saved);
      setLoaded(true);
    };
    sync();
    return subscribe(sync);
  }, []);

  const byField = useMemo(() => {
    const lookup = new Map(concepts.map((c) => [c.slug, c]));

    const rows: Row[] = Object.entries(saved)
      .map(([slug, entry]) => {
        const meta = lookup.get(slug);
        // 문서가 사라졌거나 slug가 바뀐 경우는 조용히 건너뛴다.
        return meta ? { ...meta, entry } : null;
      })
      .filter((r): r is Row => r !== null)
      .sort(
        (a, b) =>
          new Date(b.entry.lastStudiedAt).getTime() -
          new Date(a.entry.lastStudiedAt).getTime()
      );

    const grouped = new Map<string, Row[]>();
    for (const row of rows) {
      const list = grouped.get(row.field) ?? [];
      list.push(row);
      grouped.set(row.field, list);
    }
    return { rows, grouped };
  }, [concepts, saved]);

  const total = byField.rows.length;

  if (!loaded) {
    return <p className="empty">불러오는 중…</p>;
  }

  if (total === 0) {
    return (
      <div className="my-empty">
        <p className="my-empty-title">아직 저장한 개념이 없습니다.</p>
        <p>
          개념 페이지를 읽다가 아래쪽의 <b>＋ 내 지식에 추가</b> 버튼을 누르면 여기에
          쌓입니다. 지금 보고 있던 난이도도 함께 기록되어, 다음에 이어서 읽을 수
          있습니다.
        </p>
        <ul className="link-list">
          <li>
            <a href="/">
              <b>전체 개념 둘러보기</b>
              <span>분야와 개념 이름으로 검색할 수 있습니다.</span>
            </a>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <>
      <div className="my-stats">
        <div className="stat">
          <span className="stat-num">{total}</span>
          <span className="stat-label">저장한 개념</span>
        </div>
        <div className="stat">
          <span className="stat-num">{byField.grouped.size}</span>
          <span className="stat-label">분야</span>
        </div>
      </div>

      {[...byField.grouped.entries()].map(([field, rows]) => (
        <section className="my-field" key={field}>
          <h2>
            <a href={`/f/${field}`}>{FIELD_META[field]?.label ?? field}</a>
            <span className="my-field-count">{rows.length}개</span>
          </h2>

          <ul className="my-list">
            {rows.map((row) => {
              const level = clampLevel(row.entry.lastLevel);
              return (
                <li key={row.slug}>
                  <a className="my-item" href={`/c/${row.slug}?l=${level}`}>
                    <b>{row.title}</b>
                    <span className="my-summary">{row.summary}</span>
                    <span className="my-meta">
                      <span className="my-level">
                        {level}단계 · {LEVEL_META[level].label}
                      </span>
                      {/* 퀴즈를 안 푼 개념에는 아예 표시하지 않는다.
                          0%와 '아직 안 풂'은 전혀 다른 상태다. */}
                      {typeof row.entry.understanding === 'number' && (
                        <span
                          className="my-understanding"
                          data-weak={row.entry.understanding < 60}
                        >
                          이해도 {Math.round(row.entry.understanding)}%
                        </span>
                      )}
                      <span>{formatDate(row.entry.lastStudiedAt)}에 읽음</span>
                    </span>
                  </a>
                  <button
                    type="button"
                    className="my-remove"
                    onClick={() => unsaveConcept(row.slug)}
                    aria-label={`${row.title} 내 지식에서 빼기`}
                  >
                    빼기
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
