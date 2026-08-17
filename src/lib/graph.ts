/**
 * 개념의 prereq 관계로부터 층별(위상) 배치를 계산한다.
 *
 * 힘 시뮬레이션(force-directed) 없이, 위상 정렬로 얻은 깊이를 그대로 행(row)으로
 * 쓰는 정적 배치다. 라이브러리 없이 순수 함수로 짜서, 실제 좌표는 화면 쪽에서
 * DOM을 실측해 정한다(카드 크기가 텍스트 길이에 따라 달라지기 때문).
 */

export interface GraphConcept {
  slug: string;
  title: string;
  prereq: string[];
}

export interface GraphNode {
  slug: string;
  title: string;
  row: number;
  col: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface FieldLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rowCount: number;
}

export function layoutField(concepts: GraphConcept[]): FieldLayout {
  const bySlug = new Map(concepts.map((c) => [c.slug, c]));
  const depth = new Map<string, number>();

  function getDepth(slug: string, seen: Set<string>): number {
    const cached = depth.get(slug);
    if (cached !== undefined) return cached;
    // 순환 참조는 있어서는 안 되지만, 데이터 오류로 생기더라도 무한루프에
    // 빠지지 않도록 방어한다.
    if (seen.has(slug)) return 0;
    seen.add(slug);

    const concept = bySlug.get(slug);
    const prereqs = (concept?.prereq ?? []).filter((p) => bySlug.has(p));
    const d =
      prereqs.length === 0
        ? 0
        : 1 + Math.max(...prereqs.map((p) => getDepth(p, seen)));
    depth.set(slug, d);
    return d;
  }

  for (const c of concepts) getDepth(c.slug, new Set());

  const rowCount =
    concepts.length === 0
      ? 0
      : Math.max(...concepts.map((c) => depth.get(c.slug)!)) + 1;

  const rows: GraphConcept[][] = Array.from({ length: rowCount }, () => []);
  for (const c of concepts) rows[depth.get(c.slug)!]!.push(c);

  // 같은 행 안의 순서: 부모(선수 개념)의 평균 열 위치(barycenter)로 정렬해
  // 위에서 아래로 잇는 선이 최대한 덜 꼬이게 한다. 첫 행은 원래 순서(가나다) 유지.
  const col = new Map<string, number>();

  rows.forEach((row, r) => {
    const barycenter = (c: GraphConcept): number => {
      const parents = (c.prereq ?? []).filter((p) => col.has(p));
      if (parents.length === 0) return concepts.indexOf(c);
      return (
        parents.reduce((sum, p) => sum + col.get(p)!, 0) / parents.length
      );
    };

    const ordered =
      r === 0
        ? row
        : [...row].sort((a, b) => {
            const diff = barycenter(a) - barycenter(b);
            return diff !== 0 ? diff : concepts.indexOf(a) - concepts.indexOf(b);
          });

    ordered.forEach((c, i) => col.set(c.slug, i));
  });

  const nodes: GraphNode[] = concepts.map((c) => ({
    slug: c.slug,
    title: c.title,
    row: depth.get(c.slug)!,
    col: col.get(c.slug)!,
  }));

  const edges: GraphEdge[] = [];
  for (const c of concepts) {
    for (const p of c.prereq ?? []) {
      if (bySlug.has(p)) edges.push({ from: p, to: c.slug });
    }
  }

  return { nodes, edges, rowCount };
}
