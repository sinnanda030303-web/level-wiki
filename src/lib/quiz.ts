/**
 * 문제 뽑기와 채점.
 *
 * 문제는 미리 써 둔 것을 고르기만 한다. 그래서 이 파일은 전부 순수 함수이고,
 * 서버도 네트워크도 필요 없다. 화면 컴포넌트에서 바로 호출한다.
 */
import type { Level } from './types';
import { clampLevel } from './types';

/** 화면에 넘길 때 어느 개념 문제인지 함께 들고 다녀야 채점 후 분석이 된다. */
export interface PickedQuestion {
  conceptSlug: string;
  conceptTitle: string;
  level: Level;
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
}

/** 빌드 타임에 astro가 넘겨 주는, 한 개념의 문제 묶음 */
export interface QuizSource {
  conceptSlug: string;
  conceptTitle: string;
  field: string;
  summary: string;
  questions: {
    level: Level;
    question: string;
    choices: string[];
    answer: number;
    explanation: string;
  }[];
}

export interface ConceptScore {
  conceptSlug: string;
  conceptTitle: string;
  correct: number;
  total: number;
  /** 0~100 */
  percent: number;
}

export interface QuizResult {
  correct: number;
  total: number;
  percent: number;
  perConcept: ConceptScore[];
  /** 정답률이 가장 낮은 개념. 만점이면 없다. */
  weakest?: ConceptScore;
}

/** Fisher–Yates. 원본을 건드리지 않는다. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * 그 사람이 읽은 단계에 맞는 문제를 고른다.
 *
 * 3단계까지 읽은 사람에게 5단계 문제를 내면 시험이 아니라 함정이다.
 * 읽은 단계 이하만 후보로 두되, 그 범위에 문제가 하나도 없으면
 * (예: 1단계만 읽었는데 문제가 전부 2단계 이상) 가장 낮은 단계를 내준다.
 */
function eligible(source: QuizSource, upTo: Level) {
  const within = source.questions.filter((q) => q.level <= upTo);
  if (within.length > 0) return within;

  const lowest = Math.min(...source.questions.map((q) => q.level));
  return source.questions.filter((q) => q.level === lowest);
}

/**
 * 선택한 개념들에서 총 count문항을 뽑는다.
 *
 * 개념 수와 문항 수가 딱 나누어떨어지는 경우가 드물어서, 균등하게 한 바퀴씩
 * 돌며 뽑는 방식을 쓴다(라운드 로빈). 개념이 문항 수보다 많으면 앞쪽 개념만
 * 뽑히므로, 시작 전에 개념 순서를 한 번 섞어 매번 같은 개념만 나오는 것을 막는다.
 */
export function pickQuestions(
  sources: QuizSource[],
  levelOf: (slug: string) => Level,
  count: number
): PickedQuestion[] {
  const pools = shuffled(sources).map((source) => ({
    source,
    remaining: shuffled(eligible(source, clampLevel(levelOf(source.conceptSlug)))),
  }));

  const picked: PickedQuestion[] = [];
  let exhausted = false;

  while (picked.length < count && !exhausted) {
    exhausted = true;
    for (const pool of pools) {
      if (picked.length >= count) break;
      const q = pool.remaining.pop();
      if (!q) continue;
      exhausted = false;
      picked.push({
        conceptSlug: pool.source.conceptSlug,
        conceptTitle: pool.source.conceptTitle,
        ...q,
      });
    }
  }

  // 같은 개념 문제가 연달아 나오지 않도록 마지막에 한 번 더 섞는다.
  return shuffled(picked);
}

/** answers[i]는 i번 문제에서 고른 보기 인덱스. 안 골랐으면 null. */
export function grade(
  questions: PickedQuestion[],
  answers: (number | null)[]
): QuizResult {
  const buckets = new Map<string, ConceptScore>();

  let correct = 0;
  for (const [i, q] of questions.entries()) {
    const hit = answers[i] === q.answer;
    if (hit) correct += 1;

    const bucket = buckets.get(q.conceptSlug) ?? {
      conceptSlug: q.conceptSlug,
      conceptTitle: q.conceptTitle,
      correct: 0,
      total: 0,
      percent: 0,
    };
    bucket.total += 1;
    if (hit) bucket.correct += 1;
    buckets.set(q.conceptSlug, bucket);
  }

  const perConcept = [...buckets.values()]
    .map((b) => ({ ...b, percent: Math.round((b.correct / b.total) * 100) }))
    .sort((a, b) => a.percent - b.percent);

  const weakest = perConcept.find((c) => c.percent < 100);

  return {
    correct,
    total: questions.length,
    percent: questions.length
      ? Math.round((correct / questions.length) * 100)
      : 0,
    perConcept,
    weakest,
  };
}
