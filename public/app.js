/* CV Studio — single-page app: template catalog + editor with live preview. */
import { t, setLang, getLang, detectLang, UI_LANGS, sampleFor } from './i18n.js';

const CV = window.CV;
const app = document.getElementById('app');
const MM = 96 / 25.4;               // CSS px per mm
const SHEET_W = 210 * MM;            // 793.7px
const PAGE_H = 297 * MM;             // 1122.5px

/* ================================================================ storage */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem('cvstudio:' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('cvstudio:' + key, JSON.stringify(value)); return true; } catch { return false; } },
};
setLang(detectLang());
const state = {
  data: CV.normalize(store.get('data', sampleFor(getLang()))),
  settings: store.get('settings', {}), // { [templateId]: { accent, font } }
};
let saveTimer;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = store.set('data', state.data) && store.set('settings', state.settings);
    const el = document.querySelector('.saved');
    if (el) el.textContent = ok ? t('ed.saved') : t('ed.saveFailed');
  }, 400);
}
/** The CV's own language follows the interface until the user picks one in the editor. */
const cvLang = () => store.get('cvLang', null) || getLang();
const settingsFor = (id) => ({ ...(state.settings[id] || {}), lang: cvLang() });

/* ================================================================ helpers */
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  up: '<path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2"/>',
  down: '<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7m-7 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2"/>',
  back: '<path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10v6m-3-3 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  word: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8.5 11 1.3 5 2.2-5 2.2 5 1.3-5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  person: '<circle cx="12" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.4-3.6 4.2-5 7.5-5s6.1 1.4 7.5 5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, isError ? 6000 : 3000);
}

/** Chinese web fonts are large, so they load only once Chinese is in use. */
let cjkLoaded = false;
function ensureFonts(data) {
  if (cjkLoaded || !(getLang() === 'zh' || cvLang() === 'zh' || CV.hasCJK(data || state.data))) return;
  cjkLoaded = true;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: CV.fontsHref([], { cjk: true }) }));
}

/** Render a CV into a shadow root so template CSS never leaks into the app. */
function paint(host, templateId, data, settings) {
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const { css, html } = CV.render(templateId, data, settings);
  root.innerHTML = `<style>:host{display:block}${css}</style>${html}`;
  return root.querySelector('.cv');
}
function thumb(templateId, data, settings) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-thumb';
  const scale = document.createElement('div');
  scale.className = 'scale';
  wrap.append(scale);
  paint(scale, templateId, data, settings);
  new ResizeObserver(() => { scale.style.transform = `scale(${wrap.clientWidth / SHEET_W})`; }).observe(wrap);
  return wrap;
}

const langSwitch = () => `<div class="lang-switch" role="group" aria-label="${h(t('lang.switch'))}">${UI_LANGS.map((l) =>
  `<button type="button" data-ui-lang="${l.code}" aria-pressed="${l.code === getLang()}" lang="${l.html}" title="${h(l.label)}">${h(l.short)}</button>`).join('')}</div>`;
const brand = () => `<a class="brand" href="/" data-link><span class="brand-mark" aria-hidden="true"></span>CV Studio</a>`;

/* ================================================================ router */
function navigate(path) {
  if (path === location.pathname) return;
  history.pushState(null, '', path);
  route();
}
document.addEventListener('click', (e) => {
  const langBtn = e.target.closest('[data-ui-lang]');
  if (langBtn) {
    if (langBtn.dataset.uiLang === getLang()) return;
    // A CV that is still the untouched example follows the new language too.
    const wasSample = JSON.stringify(state.data) === JSON.stringify(CV.normalize(sampleFor(getLang())));
    setLang(langBtn.dataset.uiLang);
    if (wasSample) { state.data = CV.normalize(sampleFor(getLang())); saveSoon(); }
    route({ keepScroll: true });
    app.querySelector(`[data-ui-lang="${getLang()}"]`)?.focus();
    return;
  }
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  const go = () => navigate(a.getAttribute('href'));
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(go);
  else go();
});
window.addEventListener('popstate', () => route());

let cleanup = () => {};
function route(opts = {}) {
  cleanup(); cleanup = () => {};
  document.querySelector('.skip').textContent = t('skip');
  ensureFonts();
  const y = scrollY;
  const m = location.pathname.match(/^\/editor\/([\w-]+)\/?$/);
  if (location.pathname === '/' || location.pathname === '') renderCatalog();
  else if (m && CV.TEMPLATES.some((x) => x.id === m[1])) renderEditor(m[1]);
  else renderNotFound();
  window.scrollTo(0, opts.keepScroll ? y : 0);
}

/* ================================================================ catalog */
function renderCatalog() {
  document.title = t('doc.catalog');
  const cats = ['All', ...new Set(CV.TEMPLATES.map((x) => x.category))];
  const lastUsed = store.get('lastTemplate', null);
  app.innerHTML = `
  <header class="topbar">${brand()}<span class="spacer"></span>${langSwitch()}</header>
  <main class="catalog">
    <section class="hero">
      <div>
        <h1>${h(t('hero.title'))}</h1>
        <p>${h(t('hero.text'))}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#templates">${h(t('hero.browse'))}</a>
          ${lastUsed ? `<a class="btn" href="/editor/${h(lastUsed)}" data-link>${h(t('hero.continue'))}</a>` : ''}
        </div>
      </div>
      <div class="fan" aria-hidden="true"></div>
    </section>
    <section id="templates" aria-labelledby="tpl-h">
      <div class="cat-head">
        <div><h2 id="tpl-h">${h(t('cat.title'))}</h2><p>${h(t('cat.count', { n: CV.TEMPLATES.length }))}</p></div>
        <div class="filters" role="group" aria-label="${h(t('cat.filter'))}">
          ${cats.map((c, i) => `<button type="button" aria-pressed="${i === 0}" data-cat="${h(c)}">${h(t(c === 'All' ? 'cat.all' : 'cat.' + c))}</button>`).join('')}
        </div>
      </div>
      <div class="grid"></div>
    </section>
  </main>`;

  const sample = sampleFor(getLang());
  const fan = app.querySelector('.fan');
  ['meridian', 'cascade', 'atlas'].forEach((id) => fan.append(thumb(id, sample, { lang: getLang() })));

  const grid = app.querySelector('.grid');
  const preview = CV.normalize(state.data.personal.fullName ? state.data : sample);
  for (const tpl of CV.TEMPLATES) {
    const blurb = t('tpl.' + tpl.id);
    const a = document.createElement('a');
    a.className = 'card';
    a.href = `/editor/${tpl.id}`;
    a.dataset.link = '';
    a.dataset.cat = tpl.category;
    a.setAttribute('aria-label', t('cat.useAria', { name: tpl.name, blurb }));
    a.append(thumb(tpl.id, preview, settingsFor(tpl.id)));
    a.insertAdjacentHTML('beforeend', `
      <div class="card-meta"><h3>${h(tpl.name)}</h3><span class="cat">${h(t('cat.' + tpl.category))}${tpl.photo ? ' · ' + h(t('cat.photo')) : ''}</span></div>
      <p>${h(blurb)}</p><span class="use"><span>${h(t('cat.use', { name: tpl.name }))}</span></span>`);
    grid.append(a);
  }
  app.querySelector('.filters').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (!b) return;
    app.querySelectorAll('.filters button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    grid.querySelectorAll('.card').forEach((c) => { c.hidden = b.dataset.cat !== 'All' && c.dataset.cat !== b.dataset.cat; });
  });
}

function renderNotFound() {
  document.title = t('doc.notFound');
  app.innerHTML = `<header class="topbar">${brand()}<span class="spacer"></span>${langSwitch()}</header>
  <main class="not-found"><h1>${h(t('nf.title'))}</h1><p>${h(t('nf.text'))}</p>
  <a class="btn btn-primary" href="/" data-link>${h(t('nf.cta'))}</a></main>`;
}

/* ================================================================ editor schema */
// Field tuples: [dataKey, labelKey, options]; option ph/labels are translation keys.
const LISTS = {
  experience: {
    label: (it) => it.role || t('new.experience'), sub: (it) => it.company,
    blank: { role: '', company: '', location: '', start: '', end: '', current: false, description: '' },
    fields: [['role', 'f.role'], ['company', 'f.company'], ['start', 'f.start', { ph: 'f.startPh' }], ['end', 'f.end', { ph: 'f.endPh' }],
      ['current', 'f.current', { type: 'check' }], ['location', 'f.jobLocation'],
      ['description', 'f.description', { type: 'area', full: true, ph: 'f.descriptionPh' }]],
  },
  education: {
    label: (it) => it.degree || t('new.education'), sub: (it) => it.school,
    blank: { degree: '', school: '', location: '', start: '', end: '', details: '' },
    fields: [['degree', 'f.degree', { full: true }], ['school', 'f.school'], ['location', 'f.jobLocation'], ['start', 'f.start'], ['end', 'f.end'],
      ['details', 'f.details', { type: 'area', full: true, ph: 'f.detailsPh' }]],
  },
  projects: {
    label: (it) => it.name || t('new.projects'),
    blank: { name: '', link: '', description: '' },
    fields: [['name', 'f.project'], ['link', 'f.link'], ['description', 'f.projDesc', { type: 'area', full: true }]],
  },
  certifications: {
    label: (it) => it.name || t('new.certifications'), sub: (it) => it.issuer,
    blank: { name: '', issuer: '', year: '' },
    fields: [['name', 'f.cert', { full: true }], ['issuer', 'f.issuer'], ['year', 'f.year']],
  },
};
const PRESETS = ['#1e3a5f', '#23408e', '#0f766e', '#1f5130', '#7c3aed', '#b0306a', '#9a3412', '#334155'];
const skillLabel = (n) => t('skill.' + n);

const fieldHtml = (path, label, value, o = {}) => {
  const id = 'f-' + path.replace(/\./g, '-');
  const ph = o.ph ? t(o.ph) : '';
  if (o.type === 'check') return `<label class="check ${o.full ? 'full' : ''}"><input type="checkbox" data-path="${path}" ${value ? 'checked' : ''}> ${h(label)}</label>`;
  const ctrl = o.type === 'area'
    ? `<textarea id="${id}" data-path="${path}" rows="${o.rows || 4}" placeholder="${h(ph)}">${h(value)}</textarea>`
    : `<input id="${id}" type="${o.input || 'text'}" data-path="${path}" value="${h(value)}" placeholder="${h(ph)}" autocomplete="${o.ac || 'off'}" ${o.disabled ? 'disabled' : ''}>`;
  return `<div class="field ${o.full ? 'full' : ''}"><span><label for="${id}">${h(label)}</label></span>${ctrl}</div>`;
};

function setPath(path, value) {
  const keys = path.split('.');
  let o = state.data;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys.at(-1)] = value;
}

/* ================================================================ editor */
function renderEditor(templateId) {
  const tpl = CV.getTemplate(templateId);
  store.set('lastTemplate', templateId);
  document.title = `${tpl.name} — CV Studio`;
  const s = () => settingsFor(templateId);

  app.innerHTML = `
  <div class="editor">
    <header class="topbar">
      <a class="btn btn-ghost" href="/" data-link aria-label="${h(t('ed.backAria'))}">${icon('back')}<span class="dl-label">${h(t('ed.back'))}</span></a>
      <a class="brand" href="/" data-link><span class="brand-mark" aria-hidden="true"></span><span class="visually-hidden">CV Studio</span></a>
      <div class="tpl-pick"><label for="tpl">${h(t('ed.template'))}</label>
        <select id="tpl">${CV.TEMPLATES.map((x) => `<option value="${x.id}" ${x.id === templateId ? 'selected' : ''}>${h(x.name)} (${h(t('cat.' + x.category))})</option>`).join('')}</select></div>
      <span class="spacer"></span>
      ${langSwitch()}
      <button class="btn" type="button" data-export="docx">${icon('word')}<span>${h(t('ed.word'))}<span class="dl-label"> (.docx)</span></span></button>
      <button class="btn btn-primary" type="button" data-export="pdf">${icon('pdf')}<span>${h(t('ed.pdf'))}</span></button>
    </header>
    <div class="mobile-tabs" role="tablist">
      <button role="tab" aria-selected="true" data-view="form">${h(t('ed.tabEdit'))}</button><button role="tab" aria-selected="false" data-view="preview">${h(t('ed.tabPreview'))}</button>
    </div>
    <div class="workspace" data-view="form">
      <section class="pane-form" aria-label="${h(t('ed.details'))}">
        <div class="form-head"><h1>${h(t('ed.details'))}</h1><span class="saved">${h(t('ed.saved'))}</span></div>
        <div class="form-tools">
          <button class="btn btn-ghost" type="button" data-act="example">${h(t('ed.example'))}</button>
          <button class="btn btn-ghost" type="button" data-act="clear">${h(t('ed.blank'))}</button>
        </div>
        <form id="cvform" autocomplete="off" novalidate></form>
      </section>
      <section class="pane-preview" aria-label="${h(t('ed.tabPreview'))}">
        <div class="preview-bar">
          <div class="style-ctrl"><span class="ctrl-label">${h(t('ed.colour'))}</span><div class="swatches"></div></div>
          <div class="style-ctrl"><label for="font">${h(t('ed.font'))}</label>
            <select id="font">${Object.entries(CV.FONTS).map(([k, f]) => `<option value="${k}">${h(f.label)}</option>`).join('')}</select></div>
          <div class="style-ctrl"><label for="cvlang">${h(t('ed.cvLang'))}</label>
            <select id="cvlang">${Object.entries(CV.LANGS).map(([k, l]) => `<option value="${k}" ${k === cvLang() ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></div>
          <span class="pages-info" aria-live="polite"></span>
        </div>
        <div class="desk"><div class="paper-wrap"><div class="paper"></div></div></div>
      </section>
    </div>
  </div>`;

  const form = app.querySelector('#cvform');
  const paper = app.querySelector('.paper');
  const wrap = app.querySelector('.paper-wrap');
  const desk = app.querySelector('.desk');
  const pagesInfo = app.querySelector('.pages-info');
  const workspace = app.querySelector('.workspace');

  /* ---------- preview */
  let scale = 1, frame = 0;
  function layout() {
    const cvEl = paper.shadowRoot?.querySelector('.cv');
    const contentH = cvEl ? cvEl.offsetHeight : PAGE_H;
    // Match the PDF's @page margins: page 1 keeps 12mm at the bottom, later pages 13mm top + 12mm bottom.
    const first = PAGE_H - 12 * MM, rest = PAGE_H - 25 * MM;
    const pages = contentH <= first + 2 ? 1 : 1 + Math.ceil((contentH - first) / rest);
    const avail = desk.clientWidth - (innerWidth < 900 ? 32 : 48);
    scale = Math.min(1.1, Math.max(0.3, avail / SHEET_W));
    paper.style.transform = `scale(${scale})`;
    wrap.style.width = SHEET_W * scale + 'px';
    wrap.style.height = Math.max(contentH, PAGE_H) * scale + 'px';
    wrap.querySelectorAll('.page-mark').forEach((m) => m.remove());
    for (let p = 1; p < pages; p++) {
      const m = document.createElement('div');
      m.className = 'page-mark';
      m.style.top = (first + (p - 1) * rest) * scale + 'px';
      m.innerHTML = `<span>${h(t('ed.pageN', { n: p + 1 }))}</span>`;
      wrap.append(m);
    }
    pagesInfo.textContent = t(pages > 1 ? 'ed.pagesN' : 'ed.pages', { n: pages });
  }
  function refresh() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { ensureFonts(); paint(paper, templateId, state.data, s()); layout(); });
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(desk);
  cleanup = () => ro.disconnect();

  /* ---------- style controls */
  const sw = app.querySelector('.swatches');
  const fontSel = app.querySelector('#font');
  function renderStyleControls() {
    const accent = s().accent || tpl.accent;
    const colours = [tpl.accent, ...PRESETS.filter((c) => c !== tpl.accent)].slice(0, 7);
    sw.innerHTML = colours.map((c, i) => `<button type="button" class="sw" style="background:${c}" data-accent="${c}" aria-pressed="${c === accent}" aria-label="${h(i === 0 ? t('ed.colourDefault') : t('ed.colourN', { c }))}"></button>`).join('') +
      `<label class="sw sw-custom" aria-pressed="${!colours.includes(accent)}" title="${h(t('ed.colourCustom'))}"><span class="visually-hidden">${h(t('ed.colourCustom'))}</span><input type="color" value="${accent}"></label>`;
    fontSel.value = s().font || tpl.font;
  }
  function setSetting(k, v) {
    state.settings[templateId] = { ...(state.settings[templateId] || {}), [k]: v };
    saveSoon(); refresh();
  }
  sw.addEventListener('click', (e) => { const b = e.target.closest('[data-accent]'); if (b) { setSetting('accent', b.dataset.accent); renderStyleControls(); } });
  sw.addEventListener('input', (e) => { if (e.target.type === 'color') { setSetting('accent', e.target.value); sw.querySelectorAll('.sw').forEach((x) => x.setAttribute('aria-pressed', String(x.classList.contains('sw-custom')))); } });
  fontSel.addEventListener('change', () => setSetting('font', fontSel.value));
  app.querySelector('#cvlang').addEventListener('change', (e) => { store.set('cvLang', e.target.value); refresh(); });
  app.querySelector('#tpl').addEventListener('change', (e) => navigate('/editor/' + e.target.value));

  /* ---------- form */
  const openState = new Set(['personal', 'summary', 'experience']);
  const collapsed = new WeakSet();
  function renderForm() {
    const d = state.data;
    const p = d.personal;
    const section = (key, count, body) => `<details class="fs" data-sec="${key}" ${openState.has(key) ? 'open' : ''}>
      <summary>${h(t('sec.' + key))}${count ? `<span class="count">${count}</span>` : ''}</summary><div class="fs-body">${body}</div></details>`;

    const photo = `<div class="photo-field">
      <div class="ph ${p.photo ? 'has' : ''}" style="${p.photo ? `background-image:url(${p.photo})` : ''}">${p.photo ? '' : icon('person')}</div>
      <div><div class="actions"><label class="btn" style="height:34px">${h(t(p.photo ? 'photo.change' : 'photo.add'))}<input type="file" accept="image/*" data-act="photo" hidden></label>
      ${p.photo ? `<button type="button" class="btn btn-ghost" style="height:34px" data-act="rm-photo">${h(t('photo.remove'))}</button>` : ''}</div>
      <div class="note">${h(tpl.photo ? t('photo.hint') : t('photo.notShown', { name: tpl.name }))}</div></div></div>`;

    const personal = `<div class="fields">${photo}
      ${fieldHtml('personal.fullName', t('f.fullName'), p.fullName, { ac: 'name' })}${fieldHtml('personal.title', t('f.title'), p.title, { ac: 'organization-title', ph: 'f.titlePh' })}
      ${fieldHtml('personal.email', t('f.email'), p.email, { input: 'email', ac: 'email' })}${fieldHtml('personal.phone', t('f.phone'), p.phone, { input: 'tel', ac: 'tel' })}
      ${fieldHtml('personal.location', t('f.location'), p.location)}${fieldHtml('personal.website', t('f.website'), p.website, { ph: 'f.websitePh' })}
      ${fieldHtml('personal.linkedin', t('f.linkedin'), p.linkedin, { ph: 'f.linkedinPh', full: true })}</div>`;

    const summary = `<p class="hint">${h(t('f.summaryHint'))}</p>${fieldHtml('summary', t('sec.summary'), d.summary, { type: 'area', full: true, rows: 5 })}`;

    const listSection = (key) => {
      const L = LISTS[key];
      const items = d[key].map((it, i) => {
        const body = L.fields.map(([f, label, o = {}]) => fieldHtml(`${key}.${i}.${f}`, t(label), it[f], { ...o, disabled: f === 'end' && it.current })).join('');
        return `<div class="it ${collapsed.has(it) ? 'collapsed' : ''}" data-list="${key}" data-i="${i}">
          <div class="it-head"><span class="t" data-act="toggle" title="${h(t('it.toggle'))}">${itemTitle(L, it)}</span>
          ${moveBtns(key, i, d[key].length)}</div>
          <div class="it-body"><div class="fields">${body}</div></div></div>`;
      }).join('');
      return section(key, d[key].length, `<div class="items">${items}</div>
        <button type="button" class="btn add" data-act="add" data-list="${key}">${icon('plus')}${h(t('add.' + key))}</button>`);
    };

    const skills = d.skills.map((k, i) => `<div class="it it-row" data-list="skills" data-i="${i}">
      <input type="text" data-path="skills.${i}.name" value="${h(k.name)}" placeholder="${h(t('f.skill'))}" aria-label="${h(t('f.skillN', { n: i + 1 }))}">
      <div class="level"><input type="range" min="1" max="5" step="1" data-path="skills.${i}.level" value="${k.level}" aria-label="${h(t('f.levelFor', { name: k.name || t('f.skillN', { n: i + 1 }) }))}" aria-valuetext="${h(skillLabel(k.level))}"><output>${h(skillLabel(k.level))}</output></div>
      <div>${moveBtns('skills', i, d.skills.length)}</div></div>`).join('');
    const langs = d.languages.map((k, i) => `<div class="it it-row" data-list="languages" data-i="${i}">
      <input type="text" data-path="languages.${i}.name" value="${h(k.name)}" placeholder="${h(t('f.language'))}" aria-label="${h(t('f.languageN', { n: i + 1 }))}">
      <select data-path="languages.${i}.level" aria-label="${h(t('f.level'))}">${['', ...CV.LEVEL_KEYS].map((l) => `<option value="${l}" ${l === k.level ? 'selected' : ''}>${h(l ? t('lvl.' + l) : t('f.level'))}</option>`).join('')}
        ${k.level && !CV.LEVEL_KEYS.includes(k.level) ? `<option selected>${h(k.level)}</option>` : ''}</select>
      <div>${moveBtns('languages', i, d.languages.length)}</div></div>`).join('');

    form.innerHTML = section('personal', 0, personal) + section('summary', 0, summary) +
      listSection('experience') + listSection('education') +
      section('skills', d.skills.length, `<p class="hint">${h(t('f.skillsHint'))}</p><div class="items">${skills}</div>
        <button type="button" class="btn add" data-act="add" data-list="skills">${icon('plus')}${h(t('add.skills'))}</button>`) +
      section('languages', d.languages.length, `<div class="items">${langs}</div>
        <button type="button" class="btn add" data-act="add" data-list="languages">${icon('plus')}${h(t('add.languages'))}</button>`) +
      listSection('projects') + listSection('certifications');
  }
  const itemTitle = (L, it) => `${h(L.label(it))}${L.sub && L.sub(it) ? `<small>${h(L.sub(it))}</small>` : ''}`;
  const moveBtns = (key, i, n) => `
    <button type="button" class="icon-btn" data-act="up" data-list="${key}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${h(t('it.up'))}">${icon('up')}</button>
    <button type="button" class="icon-btn" data-act="down" data-list="${key}" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="${h(t('it.down'))}">${icon('down')}</button>
    <button type="button" class="icon-btn" data-act="remove" data-list="${key}" data-i="${i}" aria-label="${h(t('it.remove'))}">${icon('trash')}</button>`;

  function rerenderForm(focusSelector) {
    renderForm();
    if (focusSelector) form.querySelector(focusSelector)?.focus();
  }

  form.addEventListener('toggle', (e) => {
    const sec = e.target.closest?.('details[data-sec]');
    if (sec) sec.open ? openState.add(sec.dataset.sec) : openState.delete(sec.dataset.sec);
  }, true);

  form.addEventListener('input', (e) => {
    const el = e.target;
    const path = el.dataset.path;
    if (!path) return;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    setPath(path, v);
    if (el.type === 'range') { el.nextElementSibling.textContent = skillLabel(v); el.setAttribute('aria-valuetext', skillLabel(v)); }
    if (path.endsWith('.current')) { const end = form.querySelector(`[data-path="${path.replace('current', 'end')}"]`); if (end) end.disabled = v; }
    // keep the item header label in sync without re-rendering the form
    const it = el.closest('.it[data-list]');
    const L = it && LISTS[it.dataset.list];
    if (L) it.querySelector('.it-head .t').innerHTML = itemTitle(L, state.data[it.dataset.list][it.dataset.i]);
    saveSoon(); refresh();
  });

  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.dataset.act === 'photo') return;
    const { act, list } = b.dataset;
    const i = Number(b.dataset.i);
    const arr = list && state.data[list];
    if (act === 'toggle') {
      const it = b.closest('.it'); const item = state.data[it.dataset.list][it.dataset.i];
      it.classList.toggle('collapsed'); it.classList.contains('collapsed') ? collapsed.add(item) : collapsed.delete(item);
      return;
    }
    if (act === 'add') {
      const blank = list === 'skills' ? { name: '', level: 3 } : list === 'languages' ? { name: '', level: '' } : CV.clone(LISTS[list].blank);
      arr.push(blank);
      openState.add(list);
      rerenderForm(`.it[data-list="${list}"][data-i="${arr.length - 1}"] input`);
    } else if (act === 'remove') {
      const removed = arr.splice(i, 1)[0];
      rerenderForm();
      toast(t('it.removed', { name: (LISTS[list]?.label(removed)) || removed.name || t('it.item') }));
    } else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      rerenderForm(`[data-act="${act}"][data-list="${list}"][data-i="${j}"]`);
    } else if (act === 'rm-photo') {
      state.data.personal.photo = '';
      rerenderForm();
    } else return;
    saveSoon(); refresh();
  });

  form.addEventListener('change', async (e) => {
    if (e.target.dataset.act !== 'photo') return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      state.data.personal.photo = await toSquareJpeg(file, 480);
      rerenderForm(); saveSoon(); refresh();
    } catch { toast(t('photo.bad'), true); }
  });

  app.querySelector('.form-tools').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'example') {
      if (!confirm(t('ed.confirmExample'))) return;
      state.data = CV.normalize(sampleFor(cvLang()));
    } else if (act === 'clear') {
      if (!confirm(t('ed.confirmBlank'))) return;
      state.data = CV.normalize({ ...CV.EMPTY, experience: [CV.clone(LISTS.experience.blank)], education: [CV.clone(LISTS.education.blank)] });
    } else return;
    rerenderForm(); saveSoon(); refresh();
  });

  /* ---------- mobile tabs */
  app.querySelector('.mobile-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    workspace.dataset.view = b.dataset.view;
    app.querySelectorAll('.mobile-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    layout();
  });

  /* ---------- export */
  app.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', async () => {
    const kind = btn.dataset.export;
    const label = btn.querySelector('span').innerHTML;
    btn.disabled = true;
    btn.querySelector('span').textContent = t(kind === 'pdf' ? 'dl.preparingPdf' : 'dl.preparingWord');
    try {
      let res;
      try {
        res = await fetch(`/api/export/${kind}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, data: state.data, settings: s() }),
        });
      } catch { throw new Error(t('err.network')); }
      if (!res.ok) throw new Error(t(res.status === 413 ? 'err.tooLarge' : res.status === 503 ? 'err.pdfUnavailable' : 'err.generic'));
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = star ? decodeURIComponent(star[1]) : (/filename="([^"]+)"/.exec(cd)?.[1] || `CV.${kind}`);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(t('dl.done', { name }));
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false; btn.querySelector('span').innerHTML = label;
    }
  }));

  renderStyleControls();
  renderForm();
  refresh();
  // re-measure once web fonts arrive (they change line breaks and page count)
  document.fonts?.ready.then(() => layout());
}

/** Center-crop to a square JPEG so photos stay small and work in Word too. */
function toSquareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = Math.min(size, side);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/* ================================================================ boot */
// Load the Latin CV typefaces once so the preview matches the PDF.
document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: CV.fontsHref() }));
route();
