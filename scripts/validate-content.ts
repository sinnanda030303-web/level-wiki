/**
 * 콘텐츠 무결성 검사.
 *   npm run validate
 *
 * 집필하다 보면 오타보다 구조가 먼저 어긋난다.
 * 존재하지 않는 레벨 키, 죽은 [[용어]], 끊긴 prereq 링크를 여기서 잡는다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'src', 'content', 'concepts');

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

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const concepts = new Map<string, any>();

for (const file of files) {
  const raw = readFileSync(join(DIR, file), 'utf8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    errors.push(`${file}: JSON 파싱 실패 — ${(e as Error).message}`);
    continue;
  }
  concepts.set(file.replace(/\.json$/, ''), data);
}

for (const [fileSlug, c] of concepts) {
  const at = (msg: string) => `${fileSlug}.json: ${msg}`;

  if (c.slug !== fileSlug) {
    errors.push(at(`slug "${c.slug}"가 파일명과 다릅니다`));
  }
  for (const key of ['title', 'field', 'summary'] as const) {
    if (typeof c[key] !== 'string' || !c[key].trim()) {
      errors.push(at(`${key}가 비어 있습니다`));
    }
  }
  if (!Array.isArray(c.blocks) || c.blocks.length === 0) {
    errors.push(at('blocks가 비어 있습니다'));
    continue;
  }

  const hasOneline = c.blocks.some((b: any) => b.type === 'oneline');
  if (!hasOneline) errors.push(at('oneline 블록이 없습니다'));

  const termKeys = new Set(Object.keys(c.terms ?? {}));
  const usedTerms = new Set<string>();
  const coveredLevels = new Set<number>();

  for (const [i, block] of c.blocks.entries()) {
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
    if (levels.length === 0) {
      errors.push(at(`${where}: byLevel이 비어 있습니다`));
    }
    for (const l of levels) {
      if (!Number.isInteger(l) || l < 1 || l > 5) {
        errors.push(at(`${where}: 레벨 키 "${l}"은 1~5가 아닙니다`));
      }
      coveredLevels.add(l);
    }

    const min = block.minLevel ?? 1;
    const max = block.maxLevel ?? 5;
    if (min > max) {
      errors.push(at(`${where}: minLevel(${min}) > maxLevel(${max})`));
    }
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
  for (const [term, info] of Object.entries(c.terms ?? {}) as [string, any][]) {
    if (info.slug && !concepts.has(info.slug)) {
      warnings.push(at(`terms."${term}".slug "${info.slug}" 문서가 아직 없습니다`));
    }
  }

  for (const key of ['prereq', 'next'] as const) {
    for (const slug of c[key] ?? []) {
      if (!concepts.has(slug)) {
        warnings.push(at(`${key}의 "${slug}" 문서가 아직 없습니다`));
      }
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

console.log(`\n검사한 문서: ${concepts.size}개\n`);

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
