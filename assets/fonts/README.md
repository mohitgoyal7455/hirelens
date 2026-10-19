# Fonts

HireLens self-hosts two variable fonts from Google Fonts, both under the SIL Open Font License 1.1 (see `OFL.txt` in this folder).

| File (exact name)            | Family               | Used for | Weights |
| ---------------------------- | -------------------- | -------- | ------- |
| `bricolage-grotesque.woff2`  | Bricolage Grotesque  | Headings | 200–800 |
| `figtree.woff2`              | Figtree              | Body     | 300–900 |

Both files live directly in `assets/fonts/`. `css/styles.css` loads them with `@font-face` and `font-display: swap`, and `index.html` preloads them.

## Where to get them

1. Bricolage Grotesque: https://fonts.google.com/specimen/Bricolage+Grotesque
2. Figtree: https://fonts.google.com/specimen/Figtree

Google Fonts downloads ship as `.ttf`. To get a single Latin variable `.woff2` for each family, either:

- use [google-webfonts-helper](https://gwfh.mranftl.com/fonts), pick the **latin** subset and the variable/regular style, then rename the files to the names above, or
- convert the variable `.ttf` yourself:

```bash
pip install fonttools brotli
pyftsubset BricolageGrotesque-VariableFont_opsz,wdth,wght.ttf --unicodes="U+0000-00FF,U+2013-2014,U+2018-201D,U+2026,U+20B9" --flavor=woff2 --output-file=bricolage-grotesque.woff2
pyftsubset Figtree-VariableFont_wght.ttf --unicodes="U+0000-00FF,U+2013-2014,U+2018-201D,U+2026,U+20B9" --flavor=woff2 --output-file=figtree.woff2
```

The subset includes `U+20B9` so the rupee sign renders in the brand fonts.

## Without the files

The site still looks right. The CSS declares metric-adjusted local fallbacks (`Heading Fallback`, `Body Fallback`) built on Arial/Helvetica/Roboto, followed by the system UI stack, so layout shift is minimal when the real fonts arrive. The service worker caches the font files only if they exist, so a missing font never breaks offline install.
