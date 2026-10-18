#!/usr/bin/env python3
"""Structural HTML checks with the standard library: python3 src/check_html.py"""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
# Elements whose end tag may be omitted; we always close them, so treat strictly anyway.
FORM_CONTROLS = {"input", "select", "textarea"}


class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors, self.ids = [], [], {}
        self.label_depth = 0
        self.label_for = set()
        self.controls = []
        self.jsonld = []
        self._in_ld = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        if "id" in a:
            if a["id"] in self.ids:
                self.errors.append(f"line {line}: duplicate id '{a['id']}'")
            self.ids[a["id"]] = line
        if tag == "label":
            self.label_depth += 1
            if "for" in a:
                self.label_for.add(a["for"])
        if tag in FORM_CONTROLS and a.get("type") not in ("hidden", "submit", "button"):
            in_tpl = "template" in self.stack
            self.controls.append((line, a.get("id"), self.label_depth > 0, "aria-label" in a or "aria-labelledby" in a, in_tpl))
        if tag == "img" and "alt" not in a:
            self.errors.append(f"line {line}: img without alt")
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld, self._buf = True, []
        if tag == "script" and "src" in a:
            self.errors.append(f"line {line}: external script {a['src']}")
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        if tag in VOID:
            self.errors.append(f"line {line}: end tag for void element </{tag}>")
            return
        if not self.stack:
            self.errors.append(f"line {line}: stray </{tag}>")
            return
        if self.stack[-1] != tag:
            self.errors.append(f"line {line}: </{tag}> closes <{self.stack[-1]}> (stack {self.stack[-4:]})")
            if tag in self.stack:
                while self.stack and self.stack.pop() != tag:
                    pass
            return
        self.stack.pop()
        if tag == "label":
            self.label_depth -= 1
        if tag == "script" and self._in_ld:
            self._in_ld = False
            self.jsonld.append("".join(self._buf))

    def handle_data(self, data):
        if self._in_ld:
            self._buf.append(data)


def check(path):
    text = path.read_text(encoding="utf-8")
    c = Checker()
    c.feed(text)
    c.close()
    errs = list(c.errors)
    if c.stack:
        errs.append(f"unclosed elements at end: {c.stack}")
    if not text.lstrip().lower().startswith("<!doctype html>"):
        errs.append("missing doctype")
    for line, cid, wrapped, aria, in_tpl in c.controls:
        if not (wrapped or aria or (cid and cid in c.label_for)):
            errs.append(f"line {line}: form control without a label")
    for blob in c.jsonld:
        try:
            json.loads(blob)
        except ValueError as e:
            errs.append(f"JSON-LD does not parse: {e}")
    for ref in re.findall(r'href="#([^"]+)"', text):
        if ref not in c.ids:
            errs.append(f"in-page link to missing id #{ref}")
    for tag in ("<title>", 'name="description"', 'rel="canonical"', 'property="og:title"', 'name="viewport"', 'lang="en"'):
        if tag not in text:
            errs.append(f"missing {tag}")
    return errs, len(c.jsonld)


def main():
    bad = 0
    for rel in ("index.html", "christmas-gift-budget/index.html"):
        errs, nld = check(ROOT / rel)
        status = "ok  " if not errs else "FAIL"
        print(f"{status} {rel} (JSON-LD blocks: {nld})")
        for e in errs:
            print("     " + e)
        bad += len(errs)
    try:
        tree = ET.parse(ROOT / "sitemap.xml")
        locs = [e.text for e in tree.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        assert all(l.startswith("https://zebonsa-cyber.github.io/income-lab-sites/") for l in locs)
        print(f"ok   sitemap.xml ({len(locs)} urls)")
    except Exception as e:  # noqa: BLE001
        print("FAIL sitemap.xml", e)
        bad += 1
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
