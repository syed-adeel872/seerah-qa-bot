# Schema Verification Report

- Generated: 2026-08-11T16:31:31.826Z
- Base URL: https://api.islamicdesk.com/api/seerathon/corpus
- Snapshot SHA-256: `d4016a4f935f327c20501aff1eb5a83f582e2f04ae4480b6abb0d9044551a8eb`
- Assertion failures: 0

## Endpoint probes

| Kind | Check | Result |
| ---- | ----- | ------ |
| probe | meta | PASS — HTTP 200 |
| assert | meta HTTP 200 | PASS — 200 |
| assert | meta error=false | PASS — false |
| assert | meta.version present | PASS — 1.0.0 |
| assert | meta.sources = shamail,seerah_timeline,courses_index | PASS — ["shamail","seerah_timeline","courses_index"] |
| fact | meta.rate_limit | PASS — {"window_seconds":60,"max_per_ip":60} |
| fact | meta.disclaimer | PASS — {"en":"Answers must come only from this corpus. Cite every answer with source id and title. Do not invent Hadith, Quran, or Seerah text. Refuse fatwa/ruling questions and redirect to an alim.","ur":"جواب صرف اس ذخیرے سے آنا چاہیے۔ ہر جواب میں ماخذ آئی ڈی اور عنوان کا حوالہ دیں۔ خود سے حدیث، قرآن یا سیرت کا متن نہ لکھیں۔ فتویٰ / حکم والے سوالات رد کریں اور عالم کی طرف بھیجیں۔"} |
| fact | meta.usage_rules | PASS — {"en":["Answer only from this corpus (Shamail + Seerah Timeline).","Cite every answer with source id and title (and hawala when available).","If the question is outside the corpus, say so and redirect.","Refuse fatwa/ruling questions and redirect to an alim.","Show a persistent disclaimer."],"ur":["جواب صرف اس ذخیرے سے دیں (شمائل + سیرت ٹائم لائن).","ہر جواب میں ماخذ آئی ڈی اور عنوان کا حوالہ دیں (اور جہاں ممکن ہو حوالہ حدیث).","اگر سوال ذخیرے سے باہر ہو تو واضح کہیں اور ری ڈائریکٹ کریں.","فتویٰ / حکم والے سوالات رد کریں اور عالم کی طرف بھیجیں.","مستقل ڈس کلیمر دکھائیں."]} |
| fact | meta.counts | PASS — {"shamail":120,"seerah_timeline":34,"courses_index":20} |
| assert | shamail pages math (p1) | PASS — pages=1 expected ceil(total/limit)=1 (total=120, limit=120) |
| probe | shamail?q=birth | PASS — total=2, HTTP 200 |
| assert | shamail no-match q -> total:0 | PASS — status=200, total=0 |
| assert | shamail no-match q -> pages:0 | PASS — pages=0 |
| assert | shamail?category_id=1 filters | PASS — total=17 |
| probe | shamail?category_id=abc | PASS — error=false, msg=Corpus shamail fetched successfully, HTTP 200 |
| assert | shamail?limit=999 succeeds | PASS — false |
| assert | shamail limit clamps to 120 | PASS — limit=120 |
| assert | shamail total = 120 | PASS — total=120 |
| fact | shamail limit=999 result | PASS — limit=120, total=120 |
| probe | shamail?include_hikayat=true | PASS — hikayat found in item: true |
| assert | shamail/:id good id | PASS — HTTP 200 |
| assert | shamail/:id returns data.item | PASS — ["item","corpus_version"] |
| assert | shamail/:id bad id -> HTTP 200 error:true | PASS — status=200 error=true |
| probe | shamail/:id bad id | PASS — msg=Shamail not found |
| assert | timeline pages math (p1) | PASS — pages=1 expected ceil(total/limit)=1 (total=34, limit=50) |
| fact | timeline item keys | PASS — ["id","source","slug","en","ur"] |
| fact | timeline en keys | PASS — ["title","description","section","umarMubarak","gregorianDate","content"] |
| probe | timeline?include_hikayat=true | PASS — error=false, total=34 |
| assert | timeline/:id good id | PASS — HTTP 200 |
| assert | timeline/:id bad id -> HTTP 200 error:true | PASS — status=200 error=true |
| probe | timeline/:id bad id | PASS — msg=Timeline entry not found |
| assert | courses returns items | PASS — ["items","total","page","limit","pages","note","corpus_version"] |
| fact | snapshot written | PASS — data/corpus.snapshot.json (541694 bytes) |
| fact | snapshot sha256 | PASS — d4016a4f935f327c20501aff1eb5a83f582e2f04ae4480b6abb0d9044551a8eb |

## Snapshot summary

- `meta`: presented by API
- shamail entries: 120
- timeline entries: 34
- courses entries: 20