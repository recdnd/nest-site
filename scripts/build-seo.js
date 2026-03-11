#!/usr/bin/env node
// SEO static build: from site.json + packs/manifest.json generates
// /pack/<id>/, /art/<slug>/, /tag/<slug>/ static HTML, sitemap.xml, robots.txt.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-seo');
const SITE_BASE = 'https://nest.rec.ooo';
const SITE_NAME = '死の巣の劇';

const GENERIC_SUFFIXES = new Set([
  'signed', 'out', 'ext', 'pf-ext', 'pf', 'crop', 'final', 'ver2', 'v2',
  'qq-ext', 'x-ext', 'line'
]);

function normalizeFileStem(originalFile) {
  if (!originalFile) return '';
  const name = originalFile.split('/').pop() || '';
  return name.replace(/\.[^/.]+$/, '');
}

function extractSemanticSlug(originalFile) {
  const stem = normalizeFileStem(originalFile);
  if (!stem) return 'art';
  const parts = stem.split('__');
  if (parts.length === 1) return stem.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'art';
  const dateLike = /^\d{8}$/;
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (i === 0 && dateLike.test(lower)) continue;
    if (GENERIC_SUFFIXES.has(lower)) continue;
    return lower.replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'art';
  }
  return 'art';
}

function shortHash(input, len) {
  let h = 0;
  const str = String(input || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  let n = Math.abs(h);
  let out = n.toString(36);
  if (out.length < len) out = out.padStart(len, '0');
  return out.slice(0, len);
}

function buildArtId(originalFile, usedIds) {
  const baseSlug = extractSemanticSlug(originalFile);
  const key = originalFile || baseSlug;
  let length = 4;
  let candidate = '';
  while (length <= 8) {
    const suffix = shortHash(key, length);
    candidate = `${baseSlug}-${suffix}`;
    if (!usedIds.has(candidate)) return candidate;
    length += 1;
  }
  let counter = 0;
  while (true) {
    const suffix = shortHash(key + ':' + counter, 8);
    candidate = `${baseSlug}-${suffix}`;
    if (!usedIds.has(candidate)) return candidate;
    counter += 1;
  }
}

function slugifyTag(tag) {
  const t = String(tag).trim();
  const slug = t.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'tag-' + shortHash(t, 6);
}

function dateFromFile(file) {
  const m = (file || '').match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Load data ----------
const sitePath = path.join(ROOT, 'site.json');
const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));

const packs = [];
const allItems = [];
const usedArtIds = new Set();
const tagToSlug = new Map();
const slugToTag = new Map();
const artByTagSlug = new Map();

for (const packMeta of site.packs || []) {
  const packId = packMeta.id;
  const label = packMeta.label || packId;
  const manifestPath = path.join(ROOT, 'packs', packId, 'manifest.json');
  if (!fs.existsSync(manifestPath)) continue;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sets = manifest.sets || {};
  let items = manifest.items || [];

  const orderPath = path.join(ROOT, 'packs', packId, 'order.txt');
  if (fs.existsSync(orderPath)) {
    const orderLines = fs.readFileSync(orderPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    const orderMap = new Map(orderLines.map((f, i) => [f, i]));
    items = [...items].sort((a, b) => {
      const oa = orderMap.has(a.file) ? orderMap.get(a.file) : 1e9;
      const ob = orderMap.has(b.file) ? orderMap.get(b.file) : 1e9;
      return oa - ob;
    });
  }

  const packItems = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const setData = item.set && sets[item.set] ? sets[item.set] : null;
    const resolvedTitle = item.title ?? setData?.title ?? null;
    const setTags = (setData && setData.tags) ? setData.tags : [];
    const itemTags = item.tags || [];
    const tagSet = new Set();
    const resolvedTags = [];
    setTags.forEach(t => { if (!tagSet.has(t)) { tagSet.add(t); resolvedTags.push(t); } });
    itemTags.forEach(t => { if (!tagSet.has(t)) { tagSet.add(t); resolvedTags.push(t); } });

    const artId = buildArtId(item.file, usedArtIds);
    usedArtIds.add(artId);

    const date = dateFromFile(item.file);
    const year = date ? date.slice(0, 4) : '';

    resolvedTags.forEach(t => {
      const slug = slugifyTag(t);
      if (!tagToSlug.has(t)) tagToSlug.set(t, slug);
      if (!slugToTag.has(slug)) slugToTag.set(slug, t);
      if (!artByTagSlug.has(slug)) artByTagSlug.set(slug, []);
      if (!artByTagSlug.get(slug).some(a => a.artId === artId)) {
        artByTagSlug.get(slug).push({ artId, packId, label, file: item.file, resolvedTitle, date });
      }
    });

    const imageUrl = SITE_BASE + '/' + encodeURIComponent(packId) + '/' + item.file.split('/').map(encodeURIComponent).join('/');
    const canonicalUrl = `${SITE_BASE}/art/${artId}/`;

    const fallbackTitle = resolvedTags.length
      ? (resolvedTags.slice(0, 3).join(' / ') + ' fanart')
      : (label + ' artwork');

    const norm = {
      packId,
      packLabel: label,
      file: item.file,
      imageUrl,
      rawTitle: item.title,
      resolvedTitle,
      rawTags: item.tags,
      resolvedTags,
      tagSlugs: [...new Set(resolvedTags.map(t => slugifyTag(t)))],
      set: item.set,
      crop: item.crop,
      date,
      year,
      artId,
      canonicalUrl,
      description: (resolvedTitle || fallbackTitle) + ' – ' + label + ' | Fanart on ' + SITE_NAME,
      altText: resolvedTitle || (resolvedTags.slice(0, 5).join(', ') || label + ' artwork'),
      _orderIndex: i
    };
    packItems.push(norm);
    allItems.push(norm);
  }

  packs.push({
    packId,
    label,
    items: packItems,
    firstImage: packItems[0] ? packItems[0].imageUrl : null
  });
}

// ---------- Ensure output dirs ----------
function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
mkdirp(OUT);
mkdirp(path.join(OUT, 'pack'));
mkdirp(path.join(OUT, 'art'));
mkdirp(path.join(OUT, 'tag'));

// ---------- HTML page helpers ----------
function htmlDoc(opts) {
  const { title, description, canonical, ogImage, jsonLd, body } = opts;
  const canonicalTag = canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '';
  const og = ogImage
    ? `  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical || '')}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`
    : '';
  const twitter = ogImage
    ? `  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">`
    : '';
  const ld = jsonLd ? `<script type="application/ld+json">\n${JSON.stringify(jsonLd)}\n</script>` : '';
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${canonicalTag}
${og}
${twitter}
${ld}
  <style>
    body { font-family: system-ui, sans-serif; background: #0d0d0d; color: #ddd; margin: 0; padding: 1rem 2rem; line-height: 1.5; }
    a { color: #ff5a5a; }
    a:hover { color: #fff; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .card { background: #1a1a1a; padding: 8px; border-radius: 6px; }
    .card img { width: 100%; height: auto; display: block; border-radius: 4px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .meta { font-size: 0.875rem; color: #888; margin-top: 0.5rem; }
    .tags { font-size: 0.8rem; color: #aaa; margin-top: 4px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------- Generate /art/<artSlug>/index.html ----------
for (const it of allItems) {
  const packItems = packs.find(p => p.packId === it.packId).items;
  const idxInPack = packItems.findIndex(i => i.artId === it.artId);
  const prevInPack = idxInPack > 0 ? packItems[idxInPack - 1] : null;
  const nextInPack = idxInPack >= 0 && idxInPack < packItems.length - 1 ? packItems[idxInPack + 1] : null;

  const titleText = it.resolvedTitle || (it.resolvedTags.slice(0, 2).join(' / ') || it.packLabel) + ' – ' + SITE_NAME;
  const pageTitle = `${titleText} | ${it.packLabel} | ${SITE_NAME}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: it.resolvedTitle || it.altText,
    image: it.imageUrl,
    url: it.canonicalUrl,
    keywords: it.resolvedTags.join(', '),
    dateCreated: it.date || undefined,
    description: it.description
  };

  let nav = '<p><a href="' + SITE_BASE + '/">← 首頁</a> · <a href="' + SITE_BASE + '/pack/' + encodeURIComponent(it.packId) + '/">' + escapeHtml(it.packLabel) + '</a></p>';
  if (prevInPack) nav += ' <a href="' + SITE_BASE + '/art/' + encodeURIComponent(prevInPack.artId) + '/">上一張</a>';
  if (nextInPack) nav += ' <a href="' + SITE_BASE + '/art/' + encodeURIComponent(nextInPack.artId) + '/">下一張</a>';

  const body = `
  <header>${nav}</header>
  <h1>${escapeHtml(it.resolvedTitle || it.altText)}</h1>
  <p><img src="${escapeHtml(it.imageUrl)}" alt="${escapeHtml(it.altText)}" width="800"></p>
  <p class="meta">${escapeHtml(it.packLabel)}${it.date ? ' · ' + it.date : ''} · #${escapeHtml(it.artId)}</p>
  <p class="tags">${it.resolvedTags.map(t => '<a href="' + SITE_BASE + '/tag/' + encodeURIComponent(slugifyTag(t)) + '/">' + escapeHtml(t) + '</a>').join(' ')}</p>
`;
  const dir = path.join(OUT, 'art', it.artId);
  mkdirp(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), htmlDoc({
    title: pageTitle,
    description: it.description,
    canonical: it.canonicalUrl,
    ogImage: it.imageUrl,
    jsonLd,
    body
  }), 'utf8');
}

// ---------- Generate /pack/<packId>/index.html ----------
for (const pack of packs) {
  const url = `${SITE_BASE}/pack/${encodeURIComponent(pack.packId)}/`;
  const title = `${pack.label} | ${SITE_NAME}`;
  const description = `Artwork pack: ${pack.label}. ${pack.items.length} pieces on ${SITE_NAME}.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: pack.label,
    url,
    description,
    numberOfItems: pack.items.length
  };
  const cards = pack.items.slice(0, 100).map(it =>
    `<div class="card"><a href="${SITE_BASE}/art/${encodeURIComponent(it.artId)}/"><img src="${escapeHtml(it.imageUrl)}" alt="${escapeHtml(it.altText)}" loading="lazy"></a><p class="meta">${escapeHtml(it.resolvedTitle || it.artId)}${it.date ? ' · ' + it.date : ''}</p><p class="tags">${it.resolvedTags.slice(0, 4).map(t => escapeHtml(t)).join(', ')}</p></div>`
  ).join('\n');
  const body = `
  <p><a href="${SITE_BASE}/">← 首頁</a></p>
  <h1>${escapeHtml(pack.label)}</h1>
  <p>${pack.items.length} 件作品</p>
  <div class="grid">${cards}</div>
`;
  const dir = path.join(OUT, 'pack', pack.packId);
  mkdirp(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), htmlDoc({
    title,
    description,
    canonical: url,
    ogImage: pack.firstImage,
    jsonLd,
    body
  }), 'utf8');
}

// ---------- Generate /tag/<tagSlug>/index.html ----------
for (const [slug, arts] of artByTagSlug) {
  const tagName = slugToTag.get(slug) || slug;
  const url = `${SITE_BASE}/tag/${encodeURIComponent(slug)}/`;
  const title = `${tagName} | Tags | ${SITE_NAME}`;
  const description = `Artwork archive tagged with ${tagName} on ${SITE_NAME}. ${arts.length} pieces.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Tag: ${tagName}`,
    url,
    description,
    numberOfItems: arts.length
  };
  const firstImage = arts[0] ? (SITE_BASE + '/' + encodeURIComponent(arts[0].packId) + '/' + arts[0].file.split('/').map(encodeURIComponent).join('/')) : null;
  const cards = arts.slice(0, 80).map(a =>
    `<div class="card"><a href="${SITE_BASE}/art/${encodeURIComponent(a.artId)}/"><img src="${SITE_BASE}/${encodeURIComponent(a.packId)}/${a.file.split('/').map(encodeURIComponent).join('/')}" alt="${escapeHtml(a.resolvedTitle || a.artId)}" loading="lazy"></a><p class="meta">${escapeHtml(a.resolvedTitle || a.artId)} · ${escapeHtml(a.label)}${a.date ? ' · ' + a.date : ''}</p></div>`
  ).join('\n');
  const body = `
  <p><a href="${SITE_BASE}/">← 首頁</a></p>
  <h1># ${escapeHtml(tagName)}</h1>
  <p>${arts.length} 件作品</p>
  <div class="grid">${cards}</div>
`;
  const dir = path.join(OUT, 'tag', slug);
  mkdirp(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), htmlDoc({
    title,
    description,
    canonical: url,
    ogImage: firstImage,
    jsonLd,
    body
  }), 'utf8');
}

// ---------- sitemap.xml ----------
const urls = [
  SITE_BASE + '/',
  ...packs.map(p => `${SITE_BASE}/pack/${encodeURIComponent(p.packId)}/`),
  ...allItems.map(a => `${SITE_BASE}/art/${encodeURIComponent(a.artId)}/`),
  ...[...artByTagSlug.keys()].map(s => `${SITE_BASE}/tag/${encodeURIComponent(s)}/`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escapeHtml(u)}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap, 'utf8');

// ---------- robots.txt ----------
const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_BASE}/sitemap.xml
`;
fs.writeFileSync(path.join(OUT, 'robots.txt'), robots, 'utf8');

// ---------- Optional indices (machine-readable) ----------
mkdirp(path.join(OUT, 'seo'));
fs.writeFileSync(path.join(OUT, 'seo', 'art-index.json'), JSON.stringify(allItems.map(a => ({
  artId: a.artId,
  packId: a.packId,
  canonicalUrl: a.canonicalUrl,
  resolvedTitle: a.resolvedTitle,
  resolvedTags: a.resolvedTags,
  date: a.date
})), 'utf8'));
fs.writeFileSync(path.join(OUT, 'seo', 'tag-index.json'), JSON.stringify([...artByTagSlug.entries()].map(([slug, arts]) => ({
  slug,
  tagName: slugToTag.get(slug),
  count: arts.length,
  url: `${SITE_BASE}/tag/${encodeURIComponent(slug)}/`
})), 'utf8'));
fs.writeFileSync(path.join(OUT, 'seo', 'pack-index.json'), JSON.stringify(packs.map(p => ({
  packId: p.packId,
  label: p.label,
  count: p.items.length,
  url: `${SITE_BASE}/pack/${encodeURIComponent(p.packId)}/`
})), 'utf8'));

console.log('SEO build done:');
console.log('  packs:', packs.length);
console.log('  arts:', allItems.length);
console.log('  tags:', artByTagSlug.size);
console.log('  out:', OUT);
