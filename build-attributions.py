#!/usr/bin/env python3
"""Generate attributions.html from the master attribution record.

Reads ATTRIBUTIONS_COMPLETE.md (Seagate volume by default), parses the
Sketchfab credit lines and the on-volume licence file index, and writes a
searchable credits page. Re-run whenever the master file changes.
"""
import re, io, os, sys, html, json, collections, datetime

SRC = sys.argv[1] if len(sys.argv) > 1 else "/Volumes/Seagate Bac/ATTRIBUTIONS_COMPLETE.md"
OUT = "attributions.html"

if not os.path.exists(SRC):
    sys.exit("Source not found: %s\nPass the path as an argument." % SRC)

txt = io.open(SRC, encoding="utf-8", errors="replace").read()
part1, _, rest = txt.partition("# PART 2")

CREDIT = re.compile(
    r'"(?P<title>[^"]+)"\s*\((?P<url>https?://[^)]+)\)\s*by\s+(?P<author>.+?)'
    r'\s+is licensed under\s+(?P<lic>[^(]+?)\s*\((?P<licurl>https?://[^)]+)\)', re.S)

def flat(s): return " ".join(s.split())

credits = []
for m in CREDIT.finditer(part1):
    d = {k: flat(v) for k, v in m.groupdict().items()}
    credits.append(d)

# de-duplicate on title + author
seen, rows = set(), []
for c in credits:
    k = (c["title"].lower(), c["author"].lower())
    if k in seen: continue
    seen.add(k); rows.append(c)
rows.sort(key=lambda r: r["title"].lower())

SHORT = [
    ("CC Attribution-NonCommercial-ShareAlike", "CC BY-NC-SA", "review"),
    ("Creative Commons Attribution-NonCommercial", "CC BY-NC", "review"),
    ("Creative Commons Attribution-ShareAlike", "CC BY-SA", "sharealike"),
    ("Creative Commons Attribution-NoDerivs", "CC BY-ND", "review"),
    ("Creative Commons Attribution", "CC BY", "ok"),
    ("CC0", "CC0", "ok"),
]
def classify(lic):
    for full, short, kind in SHORT:
        if lic.lower().startswith(full.lower()):
            return short, kind
    return lic, "ok"

for r in rows:
    r["short"], r["kind"] = classify(r["lic"])

# NonCommercial and NoDerivatives assets are EXCLUDED, not flagged.
#
# Rex is a paid product and every shipped model is modified (decimated,
# re-textured, re-exported), so both term families are incompatible with how
# the assets are actually used. This used to render them into a "needs a
# licensing decision" panel, which published the risk instead of resolving it
# and quietly re-added the entries on every rebuild. Dropping them here is the
# only place the exclusion survives a regeneration.
excluded = [r for r in rows if r["kind"] == "review"]
rows = [r for r in rows if r["kind"] != "review"]

counts = collections.Counter(r["short"] for r in rows)
review = []

# on-volume licence file index, grouped by top-level folder
folders = collections.OrderedDict()
idx_block, _, _ = rest.partition("## Full contents")
current = None
for line in idx_block.splitlines():
    h = re.match(r"^###\s+(.+)$", line.strip())
    if h:
        current = h.group(1).strip()
        folders.setdefault(current, [])
        continue
    f = re.match(r"^-\s+`(.+)`$", line.strip())
    if f and current:
        folders[current].append(f.group(1))

def esc(s): return html.escape(s, quote=True)

card = """  <article class="row" data-lic="{short}" data-kind="{kind}" data-q="{q}">
    <div class="meta">
      <h3>{title}</h3>
      <p>by {author}</p>
    </div>
    <div class="tags">
      <span class="lic {kind}">{short}</span>
      <a href="{url}" rel="noopener nofollow" target="_blank">Source</a>
    </div>
  </article>"""

cards = "\n".join(
    card.format(short=esc(r["short"]), kind=r["kind"], title=esc(r["title"]),
                author=esc(r["author"]), url=esc(r["url"]),
                q=esc((r["title"] + " " + r["author"] + " " + r["short"]).lower()))
    for r in rows)

filters = "\n".join(
    '      <button class="chip" type="button" data-f="%s">%s <i>%d</i></button>' % (esc(k), esc(k), v)
    for k, v in counts.most_common())

review_html = "\n".join(
    '      <li><b>%s</b> by %s <span class="lic review">%s</span></li>' % (esc(r["title"]), esc(r["author"]), esc(r["short"]))
    for r in review)

folder_html = "\n".join(
    '    <details><summary>{name} <i>{n} files</i></summary><ul>{items}</ul></details>'.format(
        name=esc(name), n=len(files),
        items="".join("<li>%s</li>" % esc(f) for f in files))
    for name, files in folders.items() if files)

generated = datetime.date.today().isoformat()
tpl = io.open("attributions.template.html", encoding="utf-8").read()
out = (tpl.replace("{{CARDS}}", cards)
          .replace("{{FILTERS}}", filters)
          .replace("{{REVIEW}}", review_html)
          .replace("{{REVIEW_COUNT}}", str(len(review)))
          .replace("{{FOLDERS}}", folder_html)
          .replace("{{TOTAL}}", str(len(rows)))
          .replace("{{FILECOUNT}}", str(sum(len(v) for v in folders.values())))
          .replace("{{GENERATED}}", generated))
io.open(OUT, "w", encoding="utf-8").write(out)
print("wrote %s: %d credits, %d on-volume licence files"
      % (OUT, len(rows), sum(len(v) for v in folders.values())))
if excluded:
    print("\nEXCLUDED %d asset(s) for NonCommercial / NoDerivatives terms:" % len(excluded))
    for r in excluded:
        print("  %-12s %s by %s" % (r["short"], r["title"], r["author"]))
    print("\nThese are not credited on the page because they must not ship.")
    print("Delete the source files from the asset volume so they cannot be picked up later.")
