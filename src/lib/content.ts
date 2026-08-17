import type { Concept, Phenomenon, QuizBank } from './types';

const modules = import.meta.glob<{ default: Concept }>(
  '../content/concepts/*.json',
  { eager: true }
);

const bySlug = new Map<string, Concept>();
for (const [path, mod] of Object.entries(modules)) {
  const concept = mod.default;
  const fileSlug = path.split('/').pop()!.replace(/\.json$/, '');
  if (concept.slug !== fileSlug) {
    throw new Error(
      `[content] 파일명과 slug가 다릅니다: ${path} (slug: "${concept.slug}")`
    );
  }
  bySlug.set(concept.slug, concept);
}

export const allConcepts: Concept[] = [...bySlug.values()].sort((a, b) =>
  a.title.localeCompare(b.title, 'ko')
);

export function getConcept(slug: string): Concept | undefined {
  return bySlug.get(slug);
}

/** 존재하지 않는 slug는 조용히 버린다. 집필 중에는 링크가 앞서 나가기 마련이라. */
export function resolveSlugs(slugs: string[] | undefined): Concept[] {
  if (!slugs) return [];
  return slugs.map((s) => bySlug.get(s)).filter((c): c is Concept => !!c);
}

export function conceptsByField(field: string): Concept[] {
  return allConcepts.filter((c) => c.field === field);
}

export const allFields: string[] = [
  ...new Set(allConcepts.map((c) => c.field)),
];

// ── 과학 현상 ──────────────────────────────────
// 개념과 같은 블록·레벨 구조를 쓰지만, 들어오는 문이 '질문'이라는 점이 다르다.

const phenomenonModules = import.meta.glob<{ default: Phenomenon }>(
  '../content/phenomena/*.json',
  { eager: true }
);

const phenomenaBySlug = new Map<string, Phenomenon>();
for (const [path, mod] of Object.entries(phenomenonModules)) {
  const phenomenon = mod.default;
  const fileSlug = path.split('/').pop()!.replace(/\.json$/, '');
  if (phenomenon.slug !== fileSlug) {
    throw new Error(
      `[content] 파일명과 slug가 다릅니다: ${path} (slug: "${phenomenon.slug}")`
    );
  }
  phenomenaBySlug.set(phenomenon.slug, phenomenon);
}

export const allPhenomena: Phenomenon[] = [...phenomenaBySlug.values()].sort(
  (a, b) => a.title.localeCompare(b.title, 'ko')
);

export function getPhenomenon(slug: string): Phenomenon | undefined {
  return phenomenaBySlug.get(slug);
}

// ── 문제 은행 ──────────────────────────────────
// 개념마다 문제 파일 하나. 없는 개념도 있고, 그런 개념은 퀴즈에 나오지 않는다.
// 콘텐츠가 늘어나는 속도와 문제가 늘어나는 속도가 다르므로 강제하지 않는다.

const quizModules = import.meta.glob<{ default: QuizBank }>(
  '../content/quiz/*.json',
  { eager: true }
);

const quizBySlug = new Map<string, QuizBank>();
for (const [path, mod] of Object.entries(quizModules)) {
  const bank = mod.default;
  const fileSlug = path.split('/').pop()!.replace(/\.json$/, '');
  if (bank.conceptSlug !== fileSlug) {
    throw new Error(
      `[content] 파일명과 conceptSlug가 다릅니다: ${path} (conceptSlug: "${bank.conceptSlug}")`
    );
  }
  // 문제가 붙을 개념이 실제로 있어야 한다. 오타를 빌드 때 잡는다.
  if (!bySlug.has(bank.conceptSlug)) {
    throw new Error(`[content] 없는 개념에 대한 문제 파일입니다: ${path}`);
  }
  for (const [i, q] of bank.questions.entries()) {
    if (q.answer < 0 || q.answer >= q.choices.length) {
      throw new Error(
        `[content] ${path} ${i + 1}번 문제의 answer가 보기 범위를 벗어났습니다`
      );
    }
  }
  quizBySlug.set(bank.conceptSlug, bank);
}

export function getQuizBank(slug: string): QuizBank | undefined {
  return quizBySlug.get(slug);
}

/** 문제가 준비된 개념 slug 목록. 퀴즈 화면에서 고를 수 있는 후보다. */
export const quizReadySlugs: string[] = [...quizBySlug.keys()];
