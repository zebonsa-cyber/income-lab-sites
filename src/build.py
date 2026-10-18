#!/usr/bin/env python3
"""Build the static site from src/. Re-runnable: python3 src/build.py

Edit BRAND / SITE here; every page, the sitemap and robots.txt are regenerated.
{{PLANNER_URL}} and {{SAMPLER_URL}} are left in place for the publish step.
"""
import datetime
import html
import pathlib
import urllib.parse

BRAND = "Winterwick Studio"
SITE = "https://zebonsa-cyber.github.io/income-lab-sites/"
LASTMOD = datetime.date(2026, 10, 18).isoformat()

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

GROUPS = [("family", "Family"), ("friends", "Friends"), ("work", "Work"), ("kids", "Kids"), ("other", "Other")]
PRIORITIES = [("1", "1 – Top"), ("2", "2 – Middle"), ("3", "3 – Small")]

# A small sprig: evergreen leaves and two cranberries.
LOGO = (
    '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">'
    '<path d="M16 3c-4 5-4 11 0 15 4-4 4-10 0-15z" fill="#2f6b50"/>'
    '<path d="M4 14c4 0 9 2 11 6-5 1-9-1-11-6z" fill="#1f4d3a"/>'
    '<path d="M28 14c-4 0-9 2-11 6 5 1 9-1 11-6z" fill="#1f4d3a"/>'
    '<circle cx="13" cy="24" r="4" fill="#9b1d36"/><circle cx="20" cy="25" r="3.4" fill="#b8293f"/>'
    '<circle cx="12" cy="22.6" r="1" fill="#fff" opacity=".55"/></svg>'
)
FAVICON = "data:image/svg+xml," + urllib.parse.quote(
    LOGO.replace(' aria-hidden="true" focusable="false"', ' xmlns="http://www.w3.org/2000/svg"'), safe=":/=,#. \"'"
).replace("#", "%23")


def options(pairs, selected):
    return "".join(
        f'<option value="{v}"{" selected" if v == selected else ""}>{html.escape(t)}</option>' for v, t in pairs
    )


def footer(root):
    year = 2026
    return f"""<footer class="site-foot">
  <div class="wrap">
    <a class="brand" href="{root}">{LOGO}<span>{html.escape(BRAND)}</span></a>
    <nav aria-label="Footer"><p><a href="{root}christmas-gift-budget/">Christmas Gift Budget Calculator</a></p></nav>
    <p>&copy; {year} {html.escape(BRAND)}. Free tools for a calmer holiday. Nothing you type is sent anywhere.</p>
  </div>
</footer>"""


def render(template, root, extra=None):
    text = (SRC / template).read_text(encoding="utf-8")
    css = (SRC / "base.css").read_text(encoding="utf-8").replace("%%ROOT%%", root)
    subs = {
        "%%BASE_CSS%%": css,
        "%%FOOTER%%": footer(root),
        "%%LOGO%%": LOGO,
        "%%FAVICON%%": FAVICON,
        "%%BRAND%%": html.escape(BRAND),
        "%%SITE%%": SITE,
    }
    subs.update(extra or {})
    for k, v in subs.items():
        text = text.replace(k, v)
    assert "%%" not in text, f"unreplaced token in {template}"
    return text


def write(rel, text):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    print("wrote", rel)


def main():
    tool = render(
        "tool.html",
        "../",
        {
            "%%GROUP_OPTIONS%%": options(GROUPS, "family"),
            "%%PRI_OPTIONS%%": options(PRIORITIES, "2"),
            "%%CORE_JS%%": (SRC / "budget-core.js").read_text(encoding="utf-8").strip(),
            "%%APP_JS%%": (SRC / "app.js").read_text(encoding="utf-8").strip(),
        },
    )
    write("christmas-gift-budget/index.html", tool)
    write("index.html", render("home.html", ""))

    urls = [(SITE, "1.0"), (SITE + "christmas-gift-budget/", "0.9")]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, pr in urls:
        sitemap.append(f"  <url><loc>{u}</loc><lastmod>{LASTMOD}</lastmod><priority>{pr}</priority></url>")
    sitemap.append("</urlset>")
    write("sitemap.xml", "\n".join(sitemap) + "\n")
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n")
    write(".nojekyll", "")


if __name__ == "__main__":
    main()
