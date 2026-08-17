import type { APIRoute } from 'astro';
import { allConcepts, allFields, allPhenomena } from '../lib/content';

/** 목록에 넣지 않는 것: 404, /my(noindex), robots.txt, sitemap 자기 자신 */
const STATIC_PATHS = [
  '/',
  '/phenomena',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = ({ site }) => {
  const origin = site?.href.replace(/\/$/, '') ?? '';

  const paths = [
    ...STATIC_PATHS,
    ...allFields.map((field) => `/f/${field}`),
    ...allConcepts.map((concept) => `/c/${concept.slug}`),
    ...allPhenomena.map((p) => `/p/${p.slug}`),
  ];

  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
