/**
 * Phase 0 — API schema verifier + corpus snapshot generator.
 * Zero dependencies. Uses Node native fetch (Node >= 20).
 *
 * Verifies the live IslamicDesk Seerathon corpus API against the spec in
 * "Developers, AI Engineer Brief.pdf", builds data/corpus.snapshot.json
 * (the grounding source of truth for the app) and writes data/SchemaReport.md.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://api.islamicdesk.com/api/seerathon/corpus';

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------
const results = [];
let failures = 0;

function record(kind, name, detail, ok = true) {
  results.push({ kind, name, detail, ok });
  if (!ok) failures += 1;
}

function assert(cond, name, detail) {
  record('assert', name, detail, !!cond);
  return !!cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path, { timeoutMs = 45000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(BASE + path, {
        headers: { Accept: 'application/json' },
        signal: ac.signal,
      });
      const headers = Object.fromEntries([...res.headers]);
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON (4xx HTML) */
      }
      return { status: res.status, headers, json, raw: text };
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
    await sleep(250); // polite pacing toward 60 req/min
  }
  throw new Error(`GET ${path} failed after retries: ${lastErr?.message}`);
}

function sha256(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

const pageMath = (total, limit) => (total === 0 ? 0 : Math.ceil(total / limit));

// ---------------------------------------------------------------------------
// 1. meta
// ---------------------------------------------------------------------------
const metaRes = await getJson('/meta');
const meta = metaRes.json?.data;
record('probe', 'meta', `HTTP ${metaRes.status}`);
assert(metaRes.status === 200, 'meta HTTP 200', String(metaRes.status));
assert(metaRes.json && metaRes.json.error === false, 'meta error=false', String(metaRes.json?.error));
assert(meta && typeof meta.version === 'string', 'meta.version present', meta?.version || '-');
const sourcesOk =
  Array.isArray(meta?.sources) && meta.sources.join(',') === 'shamail,seerah_timeline,courses_index';
assert(sourcesOk, 'meta.sources = shamail,seerah_timeline,courses_index', JSON.stringify(meta?.sources));
record(
  'fact',
  'meta.rate_limit',
  JSON.stringify(meta?.rate_limit)
);
record('fact', 'meta.disclaimer', JSON.stringify(meta?.disclaimer));
record('fact', 'meta.usage_rules', JSON.stringify(meta?.usage_rules));
record('fact', 'meta.counts', JSON.stringify(meta?.counts));

// ---------------------------------------------------------------------------
// helpers for list endpoints
// ---------------------------------------------------------------------------
async function fetchAll(path, pageSize, label, extra = '') {
  const collected = [];
  let page = 1;
  let total = null;
  for (let i = 0; i < 30; i++) {
    const res = await getJson(`${path}?limit=${pageSize}&page=${page}${extra}`);
    const d = res.json?.data;
    if (!d || !Array.isArray(d.items)) {
      record('probe', `${label} page ${page}`, `HTTP ${res.status}, no items array: ${String(res.json?.msg || res.raw.slice(0, 60))}`, false);
      break;
    }
    collected.push(...d.items);
    total = d.total;
    const expectedPages = pageMath(d.total, d.limit);
    assert(
      d.pages === expectedPages,
      `${label} pages math (p${page})`,
      `pages=${d.pages} expected${d.total === 0 ? '' : ' ceil(total/limit)'}=${expectedPages} (total=${d.total}, limit=${d.limit})`
    );
    if (page >= d.pages || d.pages === 0) break;
    page += 1;
  }
  return { collected, total };
}

// ---------------------------------------------------------------------------
// 2. shamail list + filters
// ---------------------------------------------------------------------------
const shamailAll = await fetchAll('/shamail', 120, 'shamail', '&include_hikayat=true');
getJson('/shamail?limit=999').then((r) => {
  const d = r.json?.data;
  assert(r.json?.error === false, 'shamail?limit=999 succeeds', String(r.json?.error));
  assert(d && d.limit === 120, 'shamail limit clamps to 120', `limit=${d?.limit}`);
  assert(!!d && d.total === 120, 'shamail total = 120', `total=${d?.total}`);
  record('fact', 'shamail limit=999 result', `limit=${d?.limit}, total=${d?.total}`);
}).catch(() => record('assert', 'shamail?limit=999 succeeds', 'request error', false));

// full-text search
const qRes = await getJson('/shamail?q=birth');
record('probe', 'shamail?q=birth', `total=${qRes.json?.data?.total}, HTTP ${qRes.status}`);
const qNoRes = await getJson('/shamail?q=zzzzzznone');
assert(qNoRes.status === 200 && qNoRes.json?.data?.total === 0, 'shamail no-match q -> total:0', `status=${qNoRes.status}, total=${qNoRes.json?.data?.total}`);
assert(qNoRes.json?.data?.pages === 0, 'shamail no-match q -> pages:0', `pages=${qNoRes.json?.data?.pages}`);

// category filter
const catRes = await getJson('/shamail?category_id=1&limit=120');
assert(catRes.status === 200 && catRes.json?.data?.total > 0, 'shamail?category_id=1 filters', `total=${catRes.json?.data?.total}`);
const catBadRes = await getJson('/shamail?category_id=abc');
record('probe', 'shamail?category_id=abc', `error=${catBadRes.json?.error}, msg=${catBadRes.json?.msg}, HTTP ${catBadRes.status}`);

// include_hikayat added to shamail items
const hikRes = await getJson('/shamail?include_hikayat=true&limit=120');
const hikItem = hikRes.json?.data?.items?.find((i) => i?.ur?.hikayat || i?.en?.hikayat);
record('probe', 'shamail?include_hikayat=true', `hikayat found in item: ${!!hikItem}`);

// ---------------------------------------------------------------------------
// 3. shamail by id
// ---------------------------------------------------------------------------
const firstShamail = shamailAll.collected[0];
const oneRes = await getJson(`/shamail/${firstShamail?.id}`);
assert(oneRes.status === 200 && oneRes.json?.error === false, 'shamail/:id good id', `HTTP ${oneRes.status}`);
assert(oneRes.json?.data?.item && oneRes.json.data.item.id === firstShamail?.id, 'shamail/:id returns data.item', JSON.stringify(oneRes.json?.data && Object.keys(oneRes.json.data)));
const badRes = await getJson('/shamail/not-a-real-id');
assert(badRes.status === 200 && badRes.json?.error === true, 'shamail/:id bad id -> HTTP 200 error:true', `status=${badRes.status} error=${badRes.json?.error}`);
record('probe', 'shamail/:id bad id', `msg=${badRes.json?.msg}`);

// ---------------------------------------------------------------------------
// 4. timeline list
// ---------------------------------------------------------------------------
const timelineAll = await fetchAll('/timeline', 50, 'timeline');
const tlFirst = timelineAll.collected[0];
record('fact', 'timeline item keys', JSON.stringify(tlFirst && Object.keys(tlFirst)));
record('fact', 'timeline en keys', JSON.stringify(tlFirst?.en && Object.keys(tlFirst.en)));

// timeline ignores include_hikayat (plan spec)
const tlHik = await getJson('/timeline?include_hikayat=true&limit=50');
record('probe', 'timeline?include_hikayat=true', `error=${tlHik.json?.error}, total=${tlHik.json?.data?.total}`);

// ---------------------------------------------------------------------------
// 5. timeline by id
// ---------------------------------------------------------------------------
const tlOne = await getJson(`/timeline/${tlFirst?.id}`);
assert(tlOne.status === 200 && tlOne.json?.error === false && tlOne.json?.data?.item?.id === tlFirst?.id, 'timeline/:id good id', `HTTP ${tlOne.status}`);
const tlBad = await getJson('/timeline/not-a-real-id');
assert(tlBad.status === 200 && tlBad.json?.error === true, 'timeline/:id bad id -> HTTP 200 error:true', `status=${tlBad.status} error=${tlBad.json?.error}`);
record('probe', 'timeline/:id bad id', `msg=${tlBad.json?.msg}`);

// ---------------------------------------------------------------------------
// 6. courses index
// ---------------------------------------------------------------------------
const coursesRes = await getJson('/courses');
const courses = coursesRes.json?.data?.items;
assert(coursesRes.json?.error === false && Array.isArray(courses), 'courses returns items', JSON.stringify(coursesRes.json?.data && Object.keys(coursesRes.json.data)));

// ---------------------------------------------------------------------------
// Build snapshot
// ---------------------------------------------------------------------------
const snapshot = {
  meta: meta
    ? {
        version: meta.version,
        sources: meta.sources,
        disclaimer: meta.disclaimer,
        rate_limit: meta.rate_limit,
        counts: meta.counts,
      }
    : null,
  shamail: shamailAll.collected,
  timeline: timelineAll.collected,
  courses,
  generatedAt: new Date().toISOString(),
  corpus_version: meta?.version ?? 'unknown',
  schema_verified: failures === 0,
};
snapshot.sha256 = sha256({
  corpus_version: snapshot.corpus_version,
  shamail: snapshot.shamail,
  timeline: snapshot.timeline,
  courses: snapshot.courses,
});

mkdirSync('data', { recursive: true });
writeFileSync('data/corpus.snapshot.json', JSON.stringify(snapshot, null, 2));
record('fact', 'snapshot written', `data/corpus.snapshot.json (${Buffer.byteLength(JSON.stringify(snapshot))} bytes)`);
record('fact', 'snapshot sha256', snapshot.sha256);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const lines = [];
lines.push('# Schema Verification Report');
lines.push('');
lines.push(`- Generated: ${snapshot.generatedAt}`);
lines.push(`- Base URL: ${BASE}`);
lines.push(`- Snapshot SHA-256: \`${snapshot.sha256}\``);
lines.push(`- Assertion failures: ${failures}`);
lines.push('');
lines.push('## Endpoint probes');
lines.push('');
lines.push('| Kind | Check | Result |');
lines.push('| ---- | ----- | ------ |');
for (const r of results) {
  lines.push(`| ${r.kind} | ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} — ${r.detail} |`);
}
lines.push('');
lines.push('## Snapshot summary');
lines.push('');
lines.push('- `meta`: presented by API');
lines.push(`- ` + escape('shamail entries: ' + shamailAll.collected.length));
lines.push(`- ` + escape('timeline entries: ' + timelineAll.collected.length));
lines.push(`- ` + escape('courses entries: ' + (courses?.length ?? '-')));

function escape(s) {
  return s.replace(/\|/g, '\\|');
}

writeFileSync('data/SchemaReport.md', lines.join('\n'));

// ---------------------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------------------
console.log('=== Phase 0 schema verification ===');
console.log(`Assertions: ${results.filter((r) => r.kind === 'assert').length}, failures: ${failures}`);
console.log(`Snapshot: ${snapshot.shamail.length} shamail, ${snapshot.timeline.length} timeline, ${courses?.length ?? '?'} courses`);
console.log(`SHA-256: ${snapshot.sha256}`);
process.exit(failures === 0 ? 0 : 1);