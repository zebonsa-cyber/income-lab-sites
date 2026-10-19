# income-lab-sites

Free holiday planning tools by Zebonsa, served with GitHub Pages.

- `index.html`: landing page
- `christmas-gift-budget/`: Christmas Gift Budget Calculator (single file, inline CSS and JS, works offline)

Pages are generated from `src/`. Edit there, then:

```
python3 src/build.py          # writes the pages, sitemap.xml, robots.txt, .nojekyll
node src/test-core.js         # allocation and rounding tests on the built page's JS
python3 src/check_html.py     # structure, labels, JSON-LD, sitemap
python3 src/check_browser.py  # playwright: 375px overflow, keyboard, storage, CSV, print
```

`{{PLANNER_URL}}` and `{{SAMPLER_URL}}` are replaced at publish time.
Font: Fraunces (SIL OFL 1.1), Latin subset in `assets/fonts/`; body text uses the system font stack.
