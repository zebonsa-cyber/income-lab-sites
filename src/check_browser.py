#!/usr/bin/env python3
"""Render checks in headless Chromium (playwright): python3 src/check_browser.py [shots_dir]

- no horizontal scroll at 375px (empty and with the example list), light and dark
- no console errors, no network requests outside file://
- adding, removing, persisting across reload, CSV download, keyboard focus
- with localStorage blocked, the page still works
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOL = (ROOT / "christmas-gift-budget" / "index.html").as_uri()
HOME = (ROOT / "index.html").as_uri()
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
fails = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        fails.append(msg)


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


with sync_playwright() as p:
    browser = p.chromium.launch()
    for scheme in ("light", "dark"):
        ctx = browser.new_context(viewport={"width": 375, "height": 800}, color_scheme=scheme, accept_downloads=True)
        page = ctx.new_page()
        errors, external = [], []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: not r.url.startswith(("file:", "data:", "blob:")) and external.append(r.url))

        page.goto(HOME)
        check(overflow(page) <= 0, f"[{scheme}] home: no horizontal scroll at 375px")
        if SHOTS:
            page.screenshot(path=str(SHOTS / f"home-375-{scheme}.png"), full_page=True)

        page.goto((ROOT / "privacy" / "index.html").as_uri())
        check(overflow(page) <= 0, f"[{scheme}] privacy: no horizontal scroll at 375px")
        page.goto(TOOL)
        page.evaluate("localStorage.clear()")
        page.reload()
        check(overflow(page) <= 0, f"[{scheme}] tool empty: no horizontal scroll at 375px")
        page.click("#load-example")
        page.fill("#budget", "600")
        page.locator('#people [data-f="spent"]').first.fill("212.40")
        page.locator('#people [data-f="idea"]').first.fill("Cashmere scarf, a very long gift idea to test wrapping in the narrow column")
        check(overflow(page) <= 0, f"[{scheme}] tool with 7 people: no horizontal scroll at 375px")
        planned = page.evaluate("""() => {
            const t = s => Number(s.replace(/[^0-9.]/g, ''));
            const rows = [...document.querySelectorAll('#people .o-plan strong')].map(e => t(e.textContent));
            return { sum: rows.reduce((a, b) => a + b, 0), n: rows.length };
        }""")
        check(planned["n"] == 7, f"[{scheme}] example list has 7 rows")
        lbl = page.locator('#people [data-f="spent"]').first.get_attribute("aria-label")
        check(lbl == "Spent for Grandma Rose", f"[{scheme}] contextual aria-label ({lbl})")
        ph = page.evaluate("getComputedStyle(document.getElementById('add-name'), '::placeholder').color")
        mu = page.evaluate("(() => { const s = document.createElement('span'); s.style.color = 'var(--muted)'; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; })()")
        check(ph == mu, f"[{scheme}] placeholder uses muted token ({ph})")
        extras = page.evaluate("Number(document.getElementById('bar-r').textContent.replace(/[^0-9.]/g,''))")
        check(abs(planned["sum"] + extras - 600) < 0.001, f"[{scheme}] rows {planned['sum']} + extras {extras} = 600")
        if SHOTS:
            page.screenshot(path=str(SHOTS / f"tool-375-{scheme}.png"), full_page=True)

        # persistence
        page.reload()
        check(page.locator("#people > li").count() == 7, f"[{scheme}] list persists after reload")
        check(page.input_value("#budget") in ("600", "600.00"), f"[{scheme}] budget persists after reload")

        # over budget
        page.locator('#people [data-f="spent"]').nth(1).fill("500")
        check("Over budget" in page.text_content("#s-left-l"), f"[{scheme}] over-budget state shows")

        # keyboard: add a person with Enter, focus returns to name
        page.focus("#add-name")
        page.keyboard.type("Auntie June")
        page.keyboard.press("Enter")
        check(page.locator("#people > li").count() == 8, f"[{scheme}] Enter in add form adds a person")
        check(page.evaluate("document.activeElement.id") == "add-name", f"[{scheme}] focus returns to name field")
        outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        page.keyboard.press("Tab")
        page.keyboard.press("Shift+Tab")
        outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
        check(outline not in ("none", ""), f"[{scheme}] visible focus outline on keyboard focus ({outline})")

        # remove via button
        page.locator('#people [data-act="del"]').last.click()
        check(page.locator("#people > li").count() == 7, f"[{scheme}] remove button works")

        # CSV
        with page.expect_download() as dl:
            page.click("#export")
        d = dl.value
        csv = pathlib.Path(d.path()).read_text(encoding="utf-8-sig")
        check(d.suggested_filename == "christmas-gift-budget.csv" and csv.startswith("Name,Group,Priority"), f"[{scheme}] CSV export downloads")

        # print layout renders the sheet
        page.emulate_media(media="print")
        check(page.is_visible("#print-sheet") and not page.is_visible("#tool"), f"[{scheme}] print view shows only the sheet")
        if SHOTS and scheme == "light":
            page.pdf(path=str(SHOTS / "print.pdf"), format="Letter")
        page.emulate_media(media="screen")

        check(not errors, f"[{scheme}] no console errors {errors[:3]}")
        check(not external, f"[{scheme}] no external requests {external[:3]}")
        ctx.close()

    # wide layout
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(TOOL)
    page.click("#load-example")
    check(overflow(page) <= 0, "desktop 1280: no horizontal scroll")
    if SHOTS:
        page.screenshot(path=str(SHOTS / "tool-1280.png"), full_page=True)
    ctx.close()

    # storage blocked
    ctx = browser.new_context(viewport={"width": 375, "height": 800})
    ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(TOOL)
    page.click("#load-example")
    check(not errs and page.locator("#people > li").count() == 7, "works with localStorage blocked")
    check("not letting the page save" in page.text_content("#store-note"), "blocked storage is explained to the user")
    ctx.close()
    browser.close()

print(f"\n{'all browser checks passed' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
