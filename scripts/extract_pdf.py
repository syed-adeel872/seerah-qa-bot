import sys
from pypdf import PdfReader

src = "Developers, AI Engineer Brief.pdf"
out = "data/brief_extracted.txt"
r = PdfReader(src)
with open(out, "w", encoding="utf-8") as f:
    for i, page in enumerate(r.pages):
        f.write(f"\n===== PAGE {i+1} =====\n")
        f.write(page.extract_text() or "")
print("pages:", len(r.pages), "->", out)