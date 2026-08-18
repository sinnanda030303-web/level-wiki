export const LEVELS = [1, 2, 3, 4, 5] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_META: Record<Level, { label: string; hint: string }> = {
  1: { label: '감만 잡기', hint: '비유로만, 수식 없음' },
  2: { label: '교과서', hint: '정의와 대표 예시' },
  3: { label: '전공 입문', hint: '수식과 성립 조건' },
  4: { label: '전공 심화', hint: '유도 과정과 예외' },
  5: { label: '연구자', hint: '미해결 쟁점' },
};

export type BlockType =
  | 'oneline'
  | 'analogy'
  | 'core'
  | 'math'
  | 'misconception'
  | 'application'
  | 'frontier';

/** 블록별 기본 등장 구간. JSON에서 minLevel/maxLevel로 덮어쓸 수 있다. */
export const BLOCK_META: Record<
  BlockType,
  { label: string | null; min: Level; max: Level; order: number }
> = {
  oneline: { label: null, min: 1, max: 5, order: 0 },
  analogy: { label: '비유', min: 1, max: 3, order: 1 },
  core: { label: '핵심', min: 1, max: 5, order: 2 },
  math: { label: '수식', min: 3, max: 5, order: 3 },
  misconception: { label: '흔한 오해', min: 2, max: 5, order: 4 },
  application: { label: '어디에 쓰이나', min: 2, max: 5, order: 5 },
  frontier: { label: '아직 안 풀린 문제', min: 5, max: 5, order: 6 },
};

export interface Block {
  type: BlockType;
  minLevel?: Level;
  maxLevel?: Level;
  /** 레벨별 본문. 비어 있는 레벨은 아래 레벨 것을 그대로 쓴다(fallback). */
  byLevel: Partial<Record<`${Level}`, string>>;
}

export interface TermInfo {
  brief: string;
  /** 이 용어가 독립 개념 문서를 가진 경우 그 slug */
  slug?: string;
}

export interface Source {
  /** 저자와 책·논문 제목 */
  label: string;
  /** 판·권·연도 등 */
  detail?: string;
  url?: string;
  /** 이 레벨 이상에서만 노출. 논문 출처는 상위 레벨에만 띄운다. */
  minLevel?: Level;
}

export interface Concept {
  slug: string;
  title: string;
  field: string;
  /** 목록 카드에 쓰는 한 줄. 항상 L1 톤으로 쓴다. */
  summary: string;
  blocks: Block[];
  terms?: Record<string, TermInfo>;
  sources?: Source[];
  /** 이 개념을 이해하기 위해 먼저 필요한 개념 slug */
  prereq?: string[];
  /** 이 개념 위에 쌓이는 개념 slug */
  next?: string[];
}

/**
 * 외부에서 가져온 사진. 출처 표시 의무가 있으므로 필드를 선택이 아닌 필수로 둔다.
 * 직접 그린 SVG 도표에는 쓰지 않는다(그쪽은 본문에 ![캡션](경로)로 넣는다).
 */
export interface ImageCredit {
  /** /photos/ 아래의 파일 경로 */
  src: string;
  /** 화면에 보이지 않는 대체 텍스트 */
  alt: string;
  /** 사진 아래에 보이는 설명 */
  caption: string;
  author: string;
  /** 예: "CC BY-SA 4.0", "퍼블릭 도메인" */
  license: string;
  licenseUrl?: string;
  /** 원본 파일 페이지 주소 */
  sourceUrl: string;
}

/**
 * 과학 현상. 개념과 같은 다섯 단계 블록 구조를 쓰되,
 * 들어오는 문이 '질문'이라는 점이 다르다.
 */
export interface Phenomenon {
  slug: string;
  /** 목록과 제목에 쓰는 질문. 예: "하늘은 왜 파랄까?" */
  title: string;
  /** 목록 카드에 쓰는 한 줄 답. 항상 L1 톤으로. */
  summary: string;
  /** 맨 위에 걸리는 사진 */
  hero?: ImageCredit;
  blocks: Block[];
  terms?: Record<string, TermInfo>;
  sources?: Source[];
  /** 이 현상을 설명하는 데 쓰이는 개념 문서 slug */
  relatedConcepts?: string[];
}

/**
 * 미리 써 둔 객관식 문제 하나.
 *
 * AI로 실시간 생성하지 않고 콘텐츠로 저장한다. 그래서 서버도, API 키도,
 * 호출 상한도 필요 없다. 문제는 개념 본문과 같은 급의 정적 자산이고,
 * 채점은 브라우저에서 즉시 끝난다.
 */
export interface QuizQuestion {
  /** 이 문제가 겨냥하는 난이도. 사용자가 그 개념을 읽은 단계에 맞춰 뽑는다. */
  level: Level;
  question: string;
  /** 보기 4개. 순서는 화면에서 섞지 않는다(해설이 순서를 언급할 수 있으므로). */
  choices: string[];
  /** choices의 인덱스 */
  answer: number;
  /** 채점 후에 보여 줄 해설. 왜 틀렸는지까지 짚는다. */
  explanation: string;
}

export interface QuizBank {
  /** 대상 개념의 slug. 파일명과 같아야 한다. */
  conceptSlug: string;
  questions: QuizQuestion[];
}

export const FIELD_META: Record<string, { label: string; blurb: string }> = {
  thermodynamics: {
    label: '열역학',
    blurb: '에너지가 어디로 가는지, 그리고 왜 되돌아오지 않는지에 관한 학문.',
  },
  mechanics: {
    label: '역학',
    blurb: '물체가 왜 그렇게 움직이는지, 힘과 운동을 잇는 가장 오래된 물리학.',
  },
  electromagnetism: {
    label: '전자기학',
    blurb: '전하와 자석이 서로를 밀고 당기는 방식, 그리고 그 둘이 결국 하나였다는 사실.',
  },
  'quantum-mechanics': {
    label: '양자역학',
    blurb: '더 이상 쪼갤 수 없는 세계에서, 확률과 파동이 규칙을 다시 쓰는 방식.',
  },
  chemistry: {
    label: '화학',
    blurb: '원자가 서로 만나고 갈라서는 규칙, 그리고 그 규칙이 만드는 물질의 세계.',
  },
  /** 현상 문서는 field가 없으므로, 퀴즈 화면에서 분야 대신 이 라벨을 쓴다. */
  phenomena: {
    label: '과학 현상',
    blurb: '일상에서 마주치는 질문에서 시작해 개념으로 이어지는 이야기.',
  },
};

export function blockRange(block: Block): { min: Level; max: Level } {
  const meta = BLOCK_META[block.type];
  return { min: block.minLevel ?? meta.min, max: block.maxLevel ?? meta.max };
}

export function isVisibleAt(block: Block, level: Level): boolean {
  const { min, max } = blockRange(block);
  return level >= min && level <= max;
}

/**
 * 현재 레벨에 해당하는 본문을 고른다.
 * 정확히 그 레벨의 글이 없으면 가장 가까운 아래 레벨 것을 쓰고,
 * 아래가 전부 비어 있으면 가장 낮은 레벨 것을 쓴다.
 */
export function resolveText(block: Block, level: Level): string | null {
  const keys = Object.keys(block.byLevel)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (keys.length === 0) return null;

  let chosen = keys[0]!;
  for (const k of keys) {
    if (k <= level) chosen = k;
  }
  return block.byLevel[`${chosen}` as `${Level}`] ?? null;
}

export function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort(
    (a, b) => BLOCK_META[a.type].order - BLOCK_META[b.type].order
  );
}

export function visibleSources(
  sources: Source[] | undefined,
  level: Level
): Source[] {
  return (sources ?? []).filter((s) => level >= (s.minLevel ?? 1));
}

export function clampLevel(n: unknown): Level {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(5, Math.max(1, v)) as Level;
}
