import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import RichText from './RichText';
import {
  BLOCK_META,
  LEVELS,
  LEVEL_META,
  clampLevel,
  isVisibleAt,
  resolveText,
  sortBlocks,
  visibleSources,
} from '../lib/types';
import type { Concept, Level } from '../lib/types';

export interface ConceptLink {
  slug: string;
  title: string;
  summary: string;
}

interface Props {
  concept: Concept;
  prereq: ConceptLink[];
  next: ConceptLink[];
}

const STUCK_KEY = 'level-wiki:stuck';

// 서버 렌더링 중에는 useLayoutEffect가 경고를 낸다
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 높이를 실측해 직접 애니메이션한다.
 *
 * grid-template-rows: 0fr → 1fr 트릭으로도 여닫이는 되지만, 이미 열린 블록의
 * 본문이 레벨 변경으로 길어지거나 짧아질 때 높이가 툭 튄다. fr끼리는 보간할
 * 값이 없기 때문이다. 실측 방식은 그 경우에도 새 높이로 이어서 움직인다.
 *
 * 측정 전(SSR·JS 미실행)에는 인라인 높이를 주지 않아 CSS 기본값이 살아 있게 둔다.
 */
function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="block-clip"
      style={height === null ? undefined : { height: open ? height : 0 }}
    >
      <div className="block-measure" ref={ref}>
        {children}
      </div>
    </div>
  );
}

/** 막힌 지점을 남긴다. 지금은 로컬에만 쌓지만, 나중에 이 로그가 집필 우선순위가 된다. */
function recordStuck(slug: string, level: Level) {
  try {
    const raw = window.localStorage.getItem(STUCK_KEY);
    const log: unknown = raw ? JSON.parse(raw) : [];
    const entries = Array.isArray(log) ? log : [];
    entries.push({ slug, level, at: new Date().toISOString() });
    window.localStorage.setItem(STUCK_KEY, JSON.stringify(entries.slice(-200)));
  } catch {
    // 시크릿 모드 등에서 localStorage가 막혀 있어도 읽기를 방해하진 않는다.
  }
}

export default function ConceptReader({ concept, prereq, next }: Props) {
  const [level, setLevel] = useState<Level>(1);
  const [stuck, setStuck] = useState(false);
  const [copied, setCopied] = useState(false);

  const blocks = useMemo(() => sortBlocks(concept.blocks), [concept.blocks]);
  const sources = useMemo(
    () => visibleSources(concept.sources, level),
    [concept.sources, level]
  );

  // URL의 ?l= 를 읽어 초기 레벨을 맞춘다.
  // 서버는 항상 L1로 그리므로, 하이드레이션 이후에 보정한다.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('l');
    if (param !== null) setLevel(clampLevel(param));
  }, []);

  // 레벨이 바뀌면 주소도 따라간다. 공유된 링크가 그 레벨 그대로 열리도록.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (level === 1) url.searchParams.delete('l');
    else url.searchParams.set('l', String(level));
    window.history.replaceState(null, '', url);
    setCopied(false);
  }, [level]);

  const onStuck = useCallback(() => {
    setStuck(true);
    recordStuck(concept.slug, level);
  }, [concept.slug, level]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  // 슬라이더를 한 칸 올리면 무엇이 새로 생기는지 미리 알려준다.
  // 이 문구가 슬라이더를 당기게 만드는 유일한 장치다.
  const nextAdditions = useMemo(() => {
    if (level >= 5) return [];
    const up = (level + 1) as Level;
    return blocks
      .filter((b) => !isVisibleAt(b, level) && isVisibleAt(b, up))
      .map((b) => BLOCK_META[b.type].label)
      .filter((l): l is string => !!l);
  }, [blocks, level]);

  return (
    <article className="reader">
      <header className="reader-head">
        <a className="field-tag" href={`/f/${concept.field}`}>
          {concept.field === 'thermodynamics' ? '열역학' : concept.field}
        </a>
        <h1>{concept.title}</h1>
      </header>

      <div className="slider-dock">
        <div className="slider-wrap">
          <input
            className="slider"
            type="range"
            min={1}
            max={5}
            step={1}
            value={level}
            aria-label="설명 난이도"
            aria-valuetext={`${level}단계 ${LEVEL_META[level].label}`}
            onChange={(e) => setLevel(clampLevel(e.target.value))}
            style={{ ['--pct' as string]: `${((level - 1) / 4) * 100}%` }}
          />
          <div className="ticks">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                className="tick"
                data-active={l === level}
                data-passed={l < level}
                onClick={() => setLevel(l)}
                aria-pressed={l === level}
              >
                {LEVEL_META[l].label}
              </button>
            ))}
          </div>
        </div>
        <p className="slider-hint">
          <span className="hint-now">{LEVEL_META[level].hint}</span>
          {nextAdditions.length > 0 && (
            <span className="hint-next">
              한 칸 올리면 <b>{nextAdditions.join(' · ')}</b> 항목이 열립니다
            </span>
          )}
        </p>
      </div>

      <div className="blocks">
        {blocks.map((block, i) => {
          const visible = isVisibleAt(block, level);
          const text = resolveText(block, level);
          const meta = BLOCK_META[block.type];
          return (
            <section
              key={`${block.type}-${i}`}
              className="block"
              data-type={block.type}
              data-visible={visible}
              aria-hidden={!visible}
            >
              <Collapsible open={visible}>
                {meta.label && <h2 className="block-label">{meta.label}</h2>}
                {/* key에 level을 넣어 내용이 바뀔 때마다 페이드인시킨다 */}
                <div className="block-body" key={level}>
                  {text && <RichText text={text} terms={concept.terms} />}
                </div>
              </Collapsible>
            </section>
          );
        })}
      </div>

      <footer className="reader-foot">
        <div className="foot-actions">
          {!stuck ? (
            <button type="button" className="btn-stuck" onClick={onStuck}>
              여기서 막혔어요
            </button>
          ) : (
            <div className="stuck-panel" role="status">
              <p className="stuck-title">
                {LEVEL_META[level].label} 단계에서 막혔다고 기록했습니다.
              </p>
              {prereq.length > 0 ? (
                <>
                  <p className="stuck-sub">먼저 이것부터 보면 풀릴 수 있습니다.</p>
                  <ul className="link-list">
                    {prereq.map((c) => (
                      <li key={c.slug}>
                        <a href={`/c/${c.slug}`}>
                          <b>{c.title}</b>
                          <span>{c.summary}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="stuck-sub">
                  이 개념은 선수 개념이 없습니다. 한 단계 낮춰서 다시 읽어 보세요.
                </p>
              )}
              {level > 1 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setLevel((level - 1) as Level)}
                >
                  한 단계 낮추기
                </button>
              )}
            </div>
          )}

          <button type="button" className="btn-ghost" onClick={onCopy}>
            {copied ? '복사됨' : '이 레벨 링크 복사'}
          </button>
        </div>

        {sources.length > 0 && (
          <div className="foot-sources">
            <h2 className="foot-label">참고 자료</h2>
            <ol className="source-list">
              {sources.map((s, i) => (
                <li key={i}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  ) : (
                    <span>{s.label}</span>
                  )}
                  {s.detail && <em>{s.detail}</em>}
                </li>
              ))}
            </ol>
            <p className="source-note">
              본문은 위 자료를 바탕으로 새로 쓴 것이며, 오류가 있다면 이 사이트의
              책임입니다.
            </p>
          </div>
        )}

        {next.length > 0 && (
          <div className="foot-next">
            <h2 className="foot-label">이 개념 위에 쌓이는 것</h2>
            <ul className="link-list">
              {next.map((c) => (
                <li key={c.slug}>
                  <a href={`/c/${c.slug}`}>
                    <b>{c.title}</b>
                    <span>{c.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </footer>
    </article>
  );
}
