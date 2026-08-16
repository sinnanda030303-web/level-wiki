import { Fragment, useState, useId } from 'react';
import katex from 'katex';
import type { TermInfo } from '../lib/types';

/**
 * 본문 인라인 문법
 *   $...$      인라인 수식
 *   $$...$$    블록 수식
 *   [[용어]]    용어 강조 + 툴팁 (concept.terms에 등록된 것만)
 *   **강조**    굵게
 *   ![캡션](경로)  도표. 한 문단을 통째로 차지해야 한다
 *
 * 굵게 안에 수식이 들어오는 경우가 있어(예: **"$S = k_B \ln W$가 정의다"**)
 * 굵게를 먼저 가르고 그 안을 다시 훑는다.
 */
const BOLD = /(\*\*[^*\n]+?\*\*)/g;
const TOKEN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\[\[[^\]\n]+?\]\])/g;
const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

function Katex({ tex, display }: { tex: string; display: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    });
  } catch {
    // KaTeX가 끝내 못 읽는 식이면 원문을 그대로 보여준다. 빈칸보다는 낫다.
    return <code className="tex-fallback">{tex}</code>;
  }
  const Tag = display ? 'div' : 'span';
  return (
    <Tag
      className={display ? 'tex-block' : 'tex-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Term({ name, info }: { name: string; info?: TermInfo }) {
  const [open, setOpen] = useState(false);
  const popId = useId();

  // terms에 등록되지 않은 용어는 강조하지 않는다. 조용히 평문으로.
  if (!info) return <>{name}</>;

  return (
    <span
      className="term"
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-describedby={open ? popId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((o) => !o);
        } else if (e.key === 'Escape') {
          setOpen(false);
        }
      }}
    >
      <span className="term-label">{name}</span>
      {open && (
        <span className="term-pop" id={popId} role="tooltip">
          {info.brief}
          {info.slug && (
            <a className="term-link" href={`/c/${info.slug}`}>
              이 개념 보기 →
            </a>
          )}
        </span>
      )}
    </span>
  );
}

function renderAtoms(text: string, terms: Record<string, TermInfo>) {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      return <Katex key={i} tex={part.slice(2, -2).trim()} display />;
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return <Katex key={i} tex={part.slice(1, -1).trim()} display={false} />;
    }
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const name = part.slice(2, -2).trim();
      return <Term key={i} name={name} info={terms[name]} />;
    }
    return <span key={i}>{part}</span>;
  });
}

function renderInline(text: string, terms: Record<string, TermInfo>) {
  return text.split(BOLD).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{renderAtoms(part.slice(2, -2), terms)}</strong>;
    }
    return <Fragment key={i}>{renderAtoms(part, terms)}</Fragment>;
  });
}

export default function RichText({
  text,
  terms = {},
}: {
  text: string;
  terms?: Record<string, TermInfo>;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <>
      {paragraphs.map((para, i) => {
        const fig = FIGURE.exec(para.trim());
        if (fig) {
          const [, caption, src] = fig;
          return (
            <figure className="fig" key={i}>
              <img src={src} alt={caption} loading="lazy" decoding="async" />
              {caption && <figcaption>{caption}</figcaption>}
            </figure>
          );
        }

        // 블록 수식만 있는 문단은 <p> 대신 그대로 둔다 (p 안에 div가 들어가면 안 되므로)
        const isDisplayOnly = /^\$\$[\s\S]+\$\$$/.test(para.trim());
        if (isDisplayOnly) {
          return (
            <Katex key={i} tex={para.trim().slice(2, -2).trim()} display />
          );
        }
        return <p key={i}>{renderInline(para, terms)}</p>;
      })}
    </>
  );
}
