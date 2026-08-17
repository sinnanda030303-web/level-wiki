import { useEffect, useMemo, useState } from 'react';
import RichText from './RichText';
import { readStore, recordQuizResult, subscribe } from '../lib/store';
import type { SavedEntry } from '../lib/store';
import { grade, pickQuestions } from '../lib/quiz';
import type { PickedQuestion, QuizResult, QuizSource } from '../lib/quiz';
import { FIELD_META, LEVEL_META, clampLevel } from '../lib/types';

interface Props {
  /** 문제가 준비된 개념 전부. 이 중 사용자가 저장한 것만 화면에 오른다. */
  sources: QuizSource[];
}

const QUESTION_COUNT = 5;

/**
 * 받침 유무에 따라 조사를 고른다. '쿨롱 법칙을(를)'처럼 괄호를 다는 대신
 * 제대로 된 문장을 보여 주기 위한 것이다. 한글 음절은 유니코드에서
 * 가(0xAC00)부터 28개 종성 주기로 배열되어 있어 나머지 연산으로 판별된다.
 */
function withParticle(word: string, hasFinal: string, noFinal: string): string {
  const last = word.trim().charCodeAt(word.trim().length - 1);
  if (Number.isNaN(last) || last < 0xac00 || last > 0xd7a3) return noFinal;
  return (last - 0xac00) % 28 > 0 ? hasFinal : noFinal;
}

type Phase = 'select' | 'playing' | 'result';

export default function Quiz({ sources }: Props) {
  // 저장 목록은 localStorage에 있어 마운트 후에야 읽을 수 있다.
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Record<string, SavedEntry>>({});

  const [phase, setPhase] = useState<Phase>('select');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<PickedQuestion[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    const sync = () => {
      setSaved(readStore().saved);
      setLoaded(true);
    };
    sync();
    return subscribe(sync);
  }, []);

  /** 저장했고 문제도 있는 개념만 후보다. */
  const available = useMemo(
    () => sources.filter((s) => s.conceptSlug in saved),
    [sources, saved]
  );

  // 후보가 정해지면 전체 선택으로 시작한다. 대부분은 그대로 풀기 시작한다.
  useEffect(() => {
    if (phase !== 'select') return;
    setChosen(new Set(available.map((s) => s.conceptSlug)));
  }, [available, phase]);

  const start = () => {
    const picked = pickQuestions(
      available.filter((s) => chosen.has(s.conceptSlug)),
      (slug) => clampLevel(saved[slug]?.lastLevel ?? 1),
      QUESTION_COUNT
    );
    if (picked.length === 0) return;
    setQuestions(picked);
    setAnswers(Array(picked.length).fill(null));
    setResult(null);
    setPhase('playing');
  };

  const submit = () => {
    const scored = grade(questions, answers);
    setResult(scored);
    recordQuizResult(scored.perConcept);
    setPhase('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const restart = () => {
    setPhase('select');
    setQuestions([]);
    setAnswers([]);
    setResult(null);
  };

  if (!loaded) return <p className="empty">불러오는 중…</p>;

  // ── 개념 고르기 ────────────────────────────────
  if (phase === 'select') {
    if (available.length === 0) {
      return (
        <div className="my-empty">
          <p className="my-empty-title">아직 풀 수 있는 문제가 없습니다.</p>
          <p>
            퀴즈는 <b>저장한 개념</b> 중 문제가 준비된 것에서만 나옵니다. 개념
            페이지에서 <b>＋ 내 지식에 추가</b>를 누른 개념이 여기에 후보로
            올라옵니다.
          </p>
          <ul className="link-list">
            <li>
              <a href="/">
                <b>전체 개념 둘러보기</b>
                <span>읽고 저장한 개념부터 문제가 생깁니다.</span>
              </a>
            </li>
            <li>
              <a href="/my">
                <b>내 지식 보기</b>
                <span>지금까지 저장한 개념을 확인합니다.</span>
              </a>
            </li>
          </ul>
        </div>
      );
    }

    const allOn = chosen.size === available.length;

    return (
      <div className="quiz-select">
        <div className="quiz-select-head">
          <p>
            아래에서 문제로 낼 개념을 고르세요. 읽은 난이도에 맞춰 총{' '}
            <b>{QUESTION_COUNT}문항</b>이 나옵니다.
          </p>
          <button
            type="button"
            className="quiz-toggle-all"
            onClick={() =>
              setChosen(
                allOn ? new Set() : new Set(available.map((s) => s.conceptSlug))
              )
            }
          >
            {allOn ? '전체 해제' : '전체 선택'}
          </button>
        </div>

        <ul className="quiz-picks">
          {available.map((s) => {
            const on = chosen.has(s.conceptSlug);
            const level = clampLevel(saved[s.conceptSlug]?.lastLevel ?? 1);
            return (
              <li key={s.conceptSlug}>
                <label className="quiz-pick" data-on={on}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(chosen);
                      if (on) next.delete(s.conceptSlug);
                      else next.add(s.conceptSlug);
                      setChosen(next);
                    }}
                  />
                  <span className="quiz-pick-body">
                    <b>{s.conceptTitle}</b>
                    <span className="quiz-pick-meta">
                      {FIELD_META[s.field]?.label ?? s.field} · {level}단계까지
                      읽음
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="quiz-start"
          onClick={start}
          disabled={chosen.size === 0}
        >
          {chosen.size === 0
            ? '개념을 하나 이상 고르세요'
            : `${chosen.size}개 개념으로 문제 만들기`}
        </button>
      </div>
    );
  }

  const showAnswers = phase === 'result';
  const unanswered = answers.filter((a) => a === null).length;

  return (
    <div className="quiz-run">
      {showAnswers && result && (
        <section className="quiz-result">
          <p className="quiz-score">
            <span className="quiz-score-num">{result.percent}%</span>
            <span className="quiz-score-sub">
              {result.total}문항 중 {result.correct}문항 정답
            </span>
          </p>

          <ul className="quiz-breakdown">
            {result.perConcept.map((c) => (
              <li key={c.conceptSlug}>
                <span className="quiz-bd-name">{c.conceptTitle}</span>
                <span className="quiz-bd-bar" aria-hidden="true">
                  <span style={{ width: `${c.percent}%` }} />
                </span>
                <span className="quiz-bd-num">
                  {c.correct}/{c.total}
                </span>
              </li>
            ))}
          </ul>

          {result.weakest ? (
            <div className="quiz-advice">
              <p>
                <b>{result.weakest.conceptTitle}</b>
                {withParticle(result.weakest.conceptTitle, '을', '를')} 다시
                보는 것을 추천합니다.
              </p>
              <a
                className="quiz-relearn"
                href={`/c/${result.weakest.conceptSlug}?l=${clampLevel(
                  saved[result.weakest.conceptSlug]?.lastLevel ?? 1
                )}`}
              >
                {result.weakest.conceptTitle} 다시 학습하기 →
              </a>
            </div>
          ) : (
            <div className="quiz-advice">
              <p>전부 맞혔습니다. 난이도를 한 단계 올려 읽어 볼 때입니다.</p>
            </div>
          )}

          <p className="quiz-note">
            결과는 <b>내 지식</b>의 각 개념에 이해도로 남습니다. 다시 풀면 최근
            점수로 덮어씁니다.
          </p>
        </section>
      )}

      <ol className="quiz-questions">
        {questions.map((q, qi) => {
          const picked = answers[qi];
          const correct = picked === q.answer;

          return (
            <li className="quiz-q" key={qi} data-graded={showAnswers}>
              <div className="quiz-q-head">
                <span className="quiz-q-num">{qi + 1}</span>
                <span className="quiz-q-tag">
                  {q.conceptTitle} · {q.level}단계 {LEVEL_META[q.level].label}
                </span>
                {showAnswers && (
                  <span className="quiz-q-mark" data-correct={correct}>
                    {correct ? '정답' : '오답'}
                  </span>
                )}
              </div>

              <div className="quiz-q-text">
                <RichText text={q.question} />
              </div>

              <ul className="quiz-choices">
                {q.choices.map((choice, ci) => {
                  const isPicked = picked === ci;
                  const isAnswer = ci === q.answer;
                  return (
                    <li key={ci}>
                      <label
                        className="quiz-choice"
                        data-picked={isPicked}
                        data-answer={showAnswers && isAnswer}
                        data-wrong={showAnswers && isPicked && !isAnswer}
                      >
                        <input
                          type="radio"
                          name={`q${qi}`}
                          checked={isPicked}
                          disabled={showAnswers}
                          onChange={() => {
                            const next = [...answers];
                            next[qi] = ci;
                            setAnswers(next);
                          }}
                        />
                        <span className="quiz-choice-body">
                          <RichText text={choice} />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {showAnswers && (
                <div className="quiz-explain">
                  <RichText text={q.explanation} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {showAnswers ? (
        <div className="quiz-actions">
          <button type="button" className="quiz-start" onClick={restart}>
            다시 풀기
          </button>
        </div>
      ) : (
        <div className="quiz-actions">
          <button
            type="button"
            className="quiz-start"
            onClick={submit}
            disabled={unanswered > 0}
          >
            {unanswered > 0 ? `${unanswered}문항 남았습니다` : '채점하기'}
          </button>
          <button type="button" className="quiz-cancel" onClick={restart}>
            그만두기
          </button>
        </div>
      )}
    </div>
  );
}
