import type { Concept } from './types';

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
