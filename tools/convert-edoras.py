# Converts the scanned "The War of the Rohirrim - Battle of Edoras: Scenarios & Profiles" booklet (PDF with an OCR text
# layer) into docs/edoras/: one Markdown file per section, all.md with everything (for grep), and PNG pictures of the
# pages with maps and diagrams in docs/edoras/img/. Headings carry anchors ({#scenario-3-torch-the-city}) and every page
# starts with "=== PDF page N ===", so a rule can be cited as "Battle of Edoras, Torch the City, p. 10".
# The page numbers here are PDF pages (the booklet's own TOC uses the same numbers).
# The OCR text is cleaned of scanner noise but not proof-read: check numbers (profiles, distances) against the picture.
# docs/edoras/ is copyrighted text: it is in .gitignore and must never be pushed anywhere.
# Usage: py -3.13 tools/convert-edoras.py [path to the PDF]
import os, re, sys
import pymupdf

PDF = os.environ.get('EDORAS_PDF', '')   # default PDF path when none is given on the command line
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'edoras')
# (file, title, first PDF page, last PDF page, render pages as pictures)
SECTIONS = [
    ('heroes', 'Heroes of Rohan & Heroes of the Hill Tribes', 2, 2, True),
    ('welcome', 'Welcome to Middle-earth (and Rohan terrain)', 3, 5, True),
    ('scenario-1', '1. The First Assault', 6, 7, True),
    ('scenario-2', '2. The Gates Fall', 8, 9, True),
    ('scenario-3', '3. Torch the City', 10, 11, True),
    ('scenario-4', '4. Last Stand of the Princes', 12, 13, True),
    ('profiles-good', 'Good Profiles: Haleth, Hama, Warrior of Rohan', 14, 15, True),
    ('profiles-evil', 'Evil Profiles: Wulf, General Targg, Hill Tribesman', 16, 17, True),
    ('next-steps', 'Next Steps on Your Middle-earth Journey', 18, 18, False),
    ('construction', 'Construction Guides (models and Rohan Houses)', 19, 47, False),
    ('gameplay-summary', 'Gameplay Summary', 48, 48, True),
]


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def junk(line):
    """Scanner noise: borders read as KRKEKR, single letters, stray symbols."""
    s = line.strip()
    if not s:
        return False
    if re.search(r'\d', s) and len(s) <= 40:
        return False                                   # keep stat lines and page numbers
    letters = re.sub(r'[^A-Za-z]', '', s)
    if len(letters) < 3:
        return True
    if re.fullmatch(r'[RKEXBAGLSNYI \-|]+', s) and len(set(letters)) <= 6 and len(letters) >= 4:
        return True                                   # decorative border
    words = re.findall(r'[A-Za-z]{2,}', s)
    vowels = sum(c in 'aeiouyAEIOUY' for c in letters)
    return len(words) == 0 or vowels / len(letters) < .15


def clean(text):
    out = []
    for line in text.split('\n'):
        if not junk(line):
            out.append(line.rstrip())
    t = '\n'.join(out)
    t = re.sub(r'(\w)-\n(\w)', r'\1\2', t)           # words split at line end
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else PDF
    d = pymupdf.open(pdf)
    os.makedirs(os.path.join(OUT, 'img'), exist_ok=True)
    src = f'<!-- {os.path.basename(pdf)} -->\n'
    index = [src, '# Battle of Edoras booklet\n',
             'Scanned starter booklet; OCR text cleaned of noise but not proof-read. Cite as "Battle of Edoras, <section>, p. N" '
             '(PDF page). Pictures of map and diagram pages are in img/.\n']
    parts = []
    for name, title, a, b, pics in SECTIONS:
        md = [src, f'# {title} {{#{slug(title)}}}\n']
        for i in range(a, b + 1):
            md.append(f'\n=== PDF page {i} ===\n')
            if pics:
                img = f'img/p{i:02d}.png'
                d[i - 1].get_pixmap(dpi=100).save(os.path.join(OUT, img))
                md.append(f'[picture: {img}]\n')
            md.append(clean(d[i - 1].get_text()) + '\n')
        text = '\n'.join(md)
        open(os.path.join(OUT, name + '.md'), 'w', encoding='utf-8').write(text)
        parts.append(f'\n\n=== {name} ===\n' + text)
        index.append(f'- [{title}]({name}.md): PDF pages {a}-{b}')
        print(f'{name}: pages {a}-{b}, {len(text) // 1024} KB')
    open(os.path.join(OUT, 'all.md'), 'w', encoding='utf-8').write(''.join(parts))
    open(os.path.join(OUT, 'README.md'), 'w', encoding='utf-8').write('\n'.join(index) + '\n')


main()
