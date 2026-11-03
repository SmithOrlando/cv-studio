# CV Studio

A CV builder single-page app with a Node.js backend.

- **Catalog** (`/`): six templates rendered live as real thumbnails, filterable by style.
- **Editor** (`/editor/:templateId`): form on the left, live A4 preview on the right that updates as you type, with page-break markers, colour and typeface options, and a template switcher that keeps your data.
- **Downloads**: PDF (pixel-matched to the preview) and Word `.docx` (real, editable Word layout per template).
- Data autosaves in the browser (localStorage). No accounts, no database.
- **Three languages: English, Français, 中文.** The EN / FR / 中文 switch in the top bar translates the whole interface. It's remembered, and the first visit follows the browser's language. The CV's own headings ("Experience", "Expérience professionnelle", "工作经历", "Present" → "aujourd’hui" / "至今", language levels) follow the interface by default. In the editor, "CV language" can set them separately, for example a French interface with an English CV. Chinese text uses Noto Sans/Serif SC, which is loaded only when needed, and Microsoft YaHei / SimSun in Word.

## Translations

- Interface strings and the localized example CVs: `public/i18n.js` (one dictionary per language).
- CV headings and language-level labels: `I18N` and `LEVELS` in `shared/cv.js`. These are shared by the preview, the PDF and the Word file.

To add a language, add a dictionary in both places, plus an entry in `UI_LANGS` (`public/i18n.js`) and `LANGS` (`shared/cv.js`). Missing keys fall back to English.

On a Linux server, Chinese PDFs need a CJK font if Google Fonts can't be reached, for example `apt-get install fonts-noto-cjk`.

## Run it

Requires Node.js 18.17+.

```bash
npm install      # installs docx + puppeteer (puppeteer downloads its own Chrome, ~170 MB)
npm start        # http://localhost:3000
```

`npm run dev` restarts the server when files change.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `CHROME_PATH` | Puppeteer's bundled Chrome | Use a system Chrome/Chromium for PDF export (handy in Docker) |
| `PDF_CONCURRENCY` | `2` | Max PDFs rendered at the same time |
| `PDF_WEBFONTS` | `1` | Set `0` to skip Google Fonts in PDFs (offline servers fall back to system fonts) |

## How it fits together

```
shared/cv.js      Template engine — the 6 templates (markup + CSS), sample data, validation.
                  Loaded by the browser for the preview AND by the server for PDF, so they match.
server/index.js   node:http server: static files, SPA fallback, JSON API.
server/pdf.js     One shared headless Chrome; prints the template HTML to A4.
server/docx.js    Builds the Word file from the same data using each template's `docx` layout spec.
public/           The SPA (vanilla JS, no build step): index.html, app.js, app.css.
```

### API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/templates` | – | Template catalog metadata |
| POST | `/api/export/pdf` | `{ templateId, data, settings: { accent, font } }` | `application/pdf` |
| POST | `/api/export/docx` | same | `.docx` |
| GET | `/api/health` | – | `{ ok: true }` |

All input is normalized server-side (`CV.normalize`): unknown fields are dropped, strings are length-capped, photos must be PNG/JPEG data URLs, links are limited to http(s)/mailto/tel. PDF pages run with JavaScript disabled and can only fetch Google Fonts. Request bodies are capped at 4 MB (the client resizes photos to 480 px JPEG).

## Adding a template

Add an object to `TEMPLATES` in `shared/cv.js`:

- `id`, `name`, `category`, `blurb`, default `accent` and `font`, `photo` (whether it shows one)
- `css` — scoped under `.t-<id>`; use the CSS variables `--accent`, `--on-accent`, `--tint`, `--soft`, `--font`
- `html(d, h)` — build markup with the helpers (`h.summary`, `h.experience`, `h.skills(d, 'bars'|'dots'|'chips'|'inline'|'list')`, …)
- `bg(palette)` — page background; it repeats on every PDF page, which is how sidebars continue onto page 2
- `docx` — `{ header: 'center'|'left'|'left-light'|'band'|'split', h2: 'rule'|'bar'|'plain'|'side', columns: null | { side, width, shade: 'accent'|'tint'|null }, skills }`

It shows up in the catalog, editor and both exports automatically.

## PDF export notes

If the server can't start Chrome, `/api/export/pdf` answers 503 with a readable message and Word export keeps working. Common fixes:

- **Linux servers / Docker**: install Chrome's system libraries (`apt-get install -y chromium` and set `CHROME_PATH=/usr/bin/chromium` is the simplest route).
- **Skipped download**: if `PUPPETEER_SKIP_DOWNLOAD` was set during install, run `npx puppeteer browsers install chrome` or set `CHROME_PATH`.
