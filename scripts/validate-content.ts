/**
 * 콘텐츠 무결성 검사.
 *   npm run validate
 *
 * 집필하다 보면 오타보다 구조가 먼저 어긋난다.
 * 존재하지 않는 레벨 키, 죽은 [[용어]], 끊긴 링크, 없는 이미지를 여기서 잡는다.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CONCEPT_DIR = join(ROOT, 'src', 'content', 'concepts');
const PHENOMENA_DIR = join(ROOT, 'src', 'content', 'phenomena');
const PUBLIC_DIR = join(ROOT, 'public');

const BLOCK_TYPES = [
  'oneline',
  'analogy',
  'core',
  'math',
  'misconception',
  'application',
  'frontier',
];

const errors: string[] = [];
const warnings: string[] = [];

function load(dir: string): Map<string, any> {
  const docs = new Map<string, any>();
  if (!existsSync(dir)) return docs;

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      docs.set(file.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, file), 'utf8')));
    } catch (e) {
      errors.push(`${file}: JSON 파싱 실패 — ${(e as Error).message}`);
    }
  }
  return docs;
}

const concepts = load(CONCEPT_DIR);
const phenomena = load(PHENOMENA_DIR);

/** public/ 아래 실제로 있는 파일인지 확인한다. */
function assetExists(webPath: string): boolean {
  if (!webPath.startsWith('/')) return false;
  return existsSync(join(PUBLIC_DIR, webPath.slice(1)));
}

/** 개념과 현상이 공유하는 본문 구조 검사 */
function validateDoc(
  fileSlug: string,
  doc: any,
  opts: { requiredKeys: string[] }
): void {
  const at = (msg: string) => `${fileSlug}.json: ${msg}`;

  if (doc.slug !== fileSlug) {
    errors.push(at(`slug "${doc.slug}"가 파일명과 다릅니다`));
  }
  for (const key of opts.requiredKeys) {
    if (typeof doc[key] !== 'string' || !doc[key].trim()) {
      errors.push(at(`${key}가 비어 있습니다`));
    }
  }
  if (!Array.isArray(doc.blocks) || doc.blocks.length === 0) {
    errors.push(at('blocks가 비어 있습니다'));
    return;
  }
  if (!doc.blocks.some((b: any) => b.type === 'oneline')) {
    errors.push(at('oneline 블록이 없습니다'));
  }

  const termKeys = new Set(Object.keys(doc.terms ?? {}));
  const usedTerms = new Set<string>();
  const coveredLevels = new Set<number>();

  for (const [i, block] of doc.blocks.entries()) {
    const where = `blocks[${i}] (${block.type})`;

    if (!BLOCK_TYPES.includes(block.type)) {
      errors.push(at(`${where}: 알 수 없는 블록 타입`));
      continue;
    }
    if (!block.byLevel || typeof block.byLevel !== 'object') {
      errors.push(at(`${where}: byLevel이 없습니다`));
      continue;
    }

    const levels = Object.keys(block.byLevel).map(Number);
    if (levels.length === 0) errors.push(at(`${where}: byLevel이 비어 있습니다`));

    for (const l of levels) {
      if (!Number.isInteger(l) || l < 1 || l > 5) {
        errors.push(at(`${where}: 레벨 키 "${l}"은 1~5가 아닙니다`));
      }
      coveredLevels.add(l);
    }

    const min = block.minLevel ?? 1;
    const max = block.maxLevel ?? 5;
    if (min > max) errors.push(at(`${where}: minLevel(${min}) > maxLevel(${max})`));

    // 등장하지도 않는 레벨의 원고는 영원히 화면에 뜨지 않는다
    for (const l of levels) {
      if (l < min || l > max) {
        warnings.push(
          at(`${where}: 레벨 ${l} 원고는 등장 구간(${min}~${max}) 밖이라 표시되지 않습니다`)
        );
      }
    }

    for (const text of Object.values(block.byLevel) as string[]) {
      if (typeof text !== 'string') {
        errors.push(at(`${where}: 본문이 문자열이 아닙니다`));
        continue;
      }
      for (const m of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const term = m[1]!.trim();
        usedTerms.add(term);
        if (!termKeys.has(term)) {
          errors.push(at(`${where}: [[${term}]]이 terms에 없습니다`));
        }
      }
      // 본문에서 참조한 도표가 실제로 있는지
      for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const src = m[1]!;
        if (!assetExists(src)) {
          errors.push(at(`${where}: 이미지 ${src} 파일이 public/에 없습니다`));
        }
      }
      // $ 개수가 홀수면 수식 구간이 어긋난 것
      const dollars = (text.match(/(?<!\$)\$(?!\$)/g) ?? []).length;
      if (dollars % 2 !== 0) {
        errors.push(at(`${where}: 인라인 수식의 $ 개수가 홀수입니다`));
      }
    }
  }

  for (const term of termKeys) {
    if (!usedTerms.has(term)) {
      warnings.push(at(`terms."${term}"는 본문에서 쓰이지 않습니다`));
    }
  }
  for (const [term, info] of Object.entries(doc.terms ?? {}) as [string, any][]) {
    if (info.slug && !concepts.has(info.slug)) {
      warnings.push(at(`terms."${term}".slug "${info.slug}" 문서가 아직 없습니다`));
    }
  }

  for (const l of [1, 2, 3, 4, 5]) {
    if (!coveredLevels.has(l)) {
      warnings.push(
        at(`레벨 ${l} 전용 원고가 하나도 없습니다 (아래 레벨 원고로 대체됩니다)`)
      );
    }
  }
}

// ── 개념 ────────────────────────────────────────
for (const [fileSlug, c] of concepts) {
  validateDoc(fileSlug, c, { requiredKeys: ['title', 'field', 'summary'] });

  const at = (msg: string) => `${fileSlug}.json: ${msg}`;
  for (const key of ['prereq', 'next'] as const) {
    for (const slug of c[key] ?? []) {
      if (!concepts.has(slug)) {
        warnings.push(at(`${key}의 "${slug}" 문서가 아직 없습니다`));
      }
    }
  }
}

// ── 과학 현상 ───────────────────────────────────
const CREDIT_KEYS = ['src', 'alt', 'caption', 'author', 'license', 'sourceUrl'];

for (const [fileSlug, p] of phenomena) {
  validateDoc(fileSlug, p, { requiredKeys: ['title', 'summary'] });

  const at = (msg: string) => `phenomena/${fileSlug}.json: ${msg}`;

  // 사진은 출처 표시가 라이선스 의무다. 빠지면 오류로 잡는다.
  if (p.hero) {
    for (const key of CREDIT_KEYS) {
      if (typeof p.hero[key] !== 'string' || !p.hero[key].trim()) {
        errors.push(at(`hero.${key}가 비어 있습니다 (사진 출처는 필수)`));
      }
    }
    if (p.hero.src && !assetExists(p.hero.src)) {
      errors.push(at(`hero 이미지 ${p.hero.src} 파일이 public/에 없습니다`));
    }
  } else {
    warnings.push(at('대표 사진(hero)이 없습니다'));
  }

  for (const slug of p.relatedConcepts ?? []) {
    if (!concepts.has(slug)) {
      warnings.push(at(`relatedConcepts의 "${slug}" 개념 문서가 없습니다`));
    }
  }
}

console.log(`\n개념 ${concepts.size}개 · 현상 ${phenomena.size}개 검사\n`);

if (warnings.length) {
  console.log(`경고 ${warnings.length}건`);
  for (const w of warnings) console.log(`  · ${w}`);
  console.log('');
}

if (errors.length) {
  console.error(`오류 ${errors.length}건`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

console.log('오류 없음.\n');
