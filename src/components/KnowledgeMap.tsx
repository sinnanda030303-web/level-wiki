import { useEffect, useMemo, useState } from 'react';
import { readStore, subscribe } from '../lib/store';
import { layoutField } from '../lib/graph';
import type { GraphConcept } from '../lib/graph';
import FieldGraph from './FieldGraph';

export interface FieldGroup {
  field: string;
  label: string;
  concepts: GraphConcept[];
}

interface Props {
  fields: FieldGroup[];
}

export default function KnowledgeMap({ fields }: Props) {
  const [learned, setLearned] = useState<Set<string> | null>(null);

  useEffect(() => {
    const sync = () => setLearned(new Set(Object.keys(readStore().saved)));
    sync();
    return subscribe(sync);
  }, []);

  // 필드별 배치는 저장 목록이 바뀌어도 그래프 구조 자체는 그대로이므로,
  // fields가 바뀔 때만 다시 계산한다(learned는 색칠에만 쓰인다).
  const layouts = useMemo(
    () => fields.map((f) => ({ ...f, layout: layoutField(f.concepts) })),
    [fields]
  );

  if (learned === null) {
    return <p className="empty">불러오는 중…</p>;
  }

  return (
    <>
      {layouts.map(({ field, label, concepts, layout }) => {
        const learnedCount = concepts.filter((c) => learned.has(c.slug)).length;
        return (
          <section className="kmap-field" key={field}>
            <h2>
              <a href={`/f/${field}`}>{label}</a>
              <span className="kmap-progress">
                {learnedCount}/{concepts.length}
              </span>
            </h2>
            <FieldGraph
              layout={layout}
              hrefFor={(slug) => `/c/${slug}`}
              learned={learned}
            />
          </section>
        );
      })}
    </>
  );
}
