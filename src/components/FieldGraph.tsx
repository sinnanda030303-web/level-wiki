import { useLayoutEffect, useRef, useState } from 'react';
import type { FieldLayout, GraphNode } from '../lib/graph';

interface Props {
  layout: FieldLayout;
  hrefFor: (slug: string) => string;
  learned: Set<string>;
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bothLearned: boolean;
}

export default function FieldGraph({ layout, hrefFor, learned }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLAnchorElement>());
  // 처음 그릴 때는 아직 실측 전이라 선을 안 그린다. 카드가 배치된 뒤 잇는다.
  const [lines, setLines] = useState<Line[]>([]);
  // 필드 하나가 좁은 화면 폭보다 넓으면 .kmap-graph가 가로로 스크롤된다.
  // SVG를 width:100%로 두면 '보이는 폭'만큼만 잡혀서, 스크롤해도 화면에
  // 고정된 채 카드만 움직여 선이 어긋난다. 그래서 실제 콘텐츠 전체 크기
  // (scrollWidth/scrollHeight)를 재서 SVG 크기 자체를 그만큼 지정한다.
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const measure = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const next: Line[] = [];
      for (const edge of layout.edges) {
        const fromEl = nodeRefs.current.get(edge.from);
        const toEl = nodeRefs.current.get(edge.to);
        if (!fromEl || !toEl) continue;
        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();
        next.push({
          x1: fr.left + fr.width / 2 - wrapRect.left,
          y1: fr.bottom - wrapRect.top,
          x2: tr.left + tr.width / 2 - wrapRect.left,
          y2: tr.top - wrapRect.top,
          bothLearned: learned.has(edge.from) && learned.has(edge.to),
        });
      }
      setLines(next);
      setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [layout, learned]);

  const rows: GraphNode[][] = Array.from({ length: layout.rowCount }, () => []);
  for (const node of layout.nodes) rows[node.row]!.push(node);
  for (const row of rows) row.sort((a, b) => a.col - b.col);

  return (
    <div className="kmap-graph" ref={wrapRef}>
      <svg
        className="kmap-lines"
        aria-hidden="true"
        width={size.w}
        height={size.h}
      >
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            data-active={l.bothLearned}
          />
        ))}
      </svg>

      {rows.map((row, r) => (
        <div className="kmap-row" key={r}>
          {row.map((node) => {
            const isLearned = learned.has(node.slug);
            return (
              <a
                key={node.slug}
                ref={(el) => {
                  if (el) nodeRefs.current.set(node.slug, el);
                  else nodeRefs.current.delete(node.slug);
                }}
                className="kmap-node"
                data-learned={isLearned}
                href={hrefFor(node.slug)}
              >
                {isLearned && (
                  <span className="kmap-check" aria-hidden="true">
                    ✓{' '}
                  </span>
                )}
                {node.title}
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}
