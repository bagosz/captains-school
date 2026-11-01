# Downloads the 2024 Rules Manual text (with the FAQ and errata worked in) from the fan copy at
# https://prancingponypub.ru/mesbg2024/rules_manual/ into docs/rules/: one Markdown file per chapter, plus all.md with
# everything (for grep). Headings keep the site's anchor ids, so a rule can be linked as <chapter>/#<anchor>.
# Also converts the official FAQ PDF, if one is given, into docs/rules/faq-pdf.md.
# Usage: py -3.13 tools/fetch-rules.py [path to the FAQ PDF]
import html, os, re, sys, requests

BASE = 'https://prancingponypub.ru/mesbg2024/rules_manual/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'rules')
PAGES = ['the_rules', 'turn_sequence', 'priority_phase', 'move_phase', 'shoot_phase', 'fight_phase', 'courage_and_intelligence',
         'unit_types', 'cavalry', 'heroes', 'monsters', 'war_beasts', 'chariots', 'weapons_and_wargear', 'magic', 'special_rules',
         'advanced_rules', 'siege_engines', 'sieges', 'narrative_play', 'matched_play', 'scenarios', 'latest_faq']
# Pages outside the Rules Manual section: (address from it, file name). The six Matched Play Scenarios.
EXTRA = [('../scenarios/rules_manual', 'scenarios_rm')]

def to_md(a):
    a = re.sub(r'<img[^>]*>', '', a)
    a = re.sub(r'<h([1-6])[^>]*id="([^"]+)"[^>]*>(.*?)</h\1>', lambda m: '\n' + '#' * int(m.group(1)) + ' ' + m.group(3) + f' {{#{m.group(2)}}}\n', a, flags=re.S)
    a = re.sub(r'<h([1-6])[^>]*>(.*?)</h\1>', lambda m: '\n' + '#' * int(m.group(1)) + ' ' + m.group(2) + '\n', a, flags=re.S)
    a = re.sub(r'<li[^>]*>', '\n- ', a)
    a = re.sub(r'<(strong|b)>(.*?)</\1>', r'**\2**', a, flags=re.S)
    a = re.sub(r'<(em|i)>(.*?)</\1>', r'*\2*', a, flags=re.S)
    a = re.sub(r'<br\s*/?>', '\n', a)
    a = re.sub(r'</(p|ul|ol|table|tr|blockquote|div)>', '\n', a)
    a = re.sub(r'<t[dh][^>]*>', ' | ', a)
    a = re.sub(r'<[^>]+>', '', a)
    a = html.unescape(a).replace('¶', '')
    a = re.sub(r'[ \t]+\n', '\n', a)
    return re.sub(r'\n{3,}', '\n\n', a).strip() + '\n'

os.makedirs(OUT, exist_ok=True)
parts = []
for p, name in [(p, p) for p in PAGES] + EXTRA:
    h = requests.get(BASE + p + '/', timeout=60).text
    a = h[h.find('<article'):h.find('</article>')]
    md = f'<!-- {BASE}{p}/ -->\n' + to_md(a)
    open(os.path.join(OUT, name + '.md'), 'w', encoding='utf-8').write(md)
    parts.append(f'\n\n=== {p} ===\n' + md)
    print(f'{p}: {len(md) // 1024} KB')
open(os.path.join(OUT, 'all.md'), 'w', encoding='utf-8').write(''.join(parts))

if len(sys.argv) > 1:
    import pymupdf
    d = pymupdf.open(sys.argv[1])
    txt = '\n'.join(f'\n=== PDF page {i + 1} ===\n' + d[i].get_text() for i in range(len(d)))
    open(os.path.join(OUT, 'faq-pdf.md'), 'w', encoding='utf-8').write(f'<!-- {os.path.basename(sys.argv[1])} -->\n' + txt)
    print(f'FAQ PDF: {len(d)} pages')
