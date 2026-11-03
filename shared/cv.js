/*
 * CV rendering engine — shared by the browser (live preview, catalog thumbnails)
 * and the Node server (PDF export). One renderer means the PDF matches the preview.
 * UMD: window.CV in the browser, module.exports in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- fonts */
  // CJK fallbacks so Chinese text renders with a matching serif / sans face.
  const CJK_SERIF = "'Times New Roman', 'Liberation Serif', 'DejaVu Serif', 'Noto Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, serif";
  const CJK_SANS = "Roboto, 'Liberation Sans', 'DejaVu Sans', 'Noto Sans SC', 'Noto Sans CJK SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const FONTS = {
    'source-serif': { label: 'Source Serif', css: "'Source Serif 4', Georgia, " + CJK_SERIF, gf: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400', docx: 'Georgia', docxEA: 'SimSun' },
    'libre-baskerville': { label: 'Libre Baskerville', css: "'Libre Baskerville', Georgia, " + CJK_SERIF, gf: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400', docx: 'Georgia', docxEA: 'SimSun' },
    'lora': { label: 'Lora', css: "'Lora', Georgia, " + CJK_SERIF, gf: 'Lora:ital,wght@0,400;0,600;0,700;1,400', docx: 'Cambria', docxEA: 'SimSun' },
    'inter': { label: 'Inter', css: "'Inter', 'Helvetica Neue', Arial, " + CJK_SANS, gf: 'Inter:wght@300;400;500;600;700;800', docx: 'Calibri', docxEA: 'Microsoft YaHei' },
    'manrope': { label: 'Manrope', css: "'Manrope', 'Helvetica Neue', Arial, " + CJK_SANS, gf: 'Manrope:wght@400;500;600;700;800', docx: 'Calibri', docxEA: 'Microsoft YaHei' },
    'dm-sans': { label: 'DM Sans', css: "'DM Sans', 'Helvetica Neue', Arial, " + CJK_SANS, gf: 'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400', docx: 'Arial', docxEA: 'Microsoft YaHei' },
  };
  const CJK_GF = ['Noto+Sans+SC:wght@400;500;700', 'Noto+Serif+SC:wght@400;600;700'];
  function fontsHref(keys, opts = {}) {
    const fams = (keys || Object.keys(FONTS)).filter((k) => FONTS[k]).map((k) => 'family=' + FONTS[k].gf);
    if (opts.cjk) fams.push(...CJK_GF.map((g) => 'family=' + g));
    return 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=swap';
  }

  /* ---------------------------------------------------------------- color */
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 30, g: 58, b: 95 };
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  }
  function mix(hex, withHex, t) {
    const a = hexToRgb(hex), b = hexToRgb(withHex);
    return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
  }
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function normalizeHex(hex, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? hex.toLowerCase() : fallback;
  }
  /** Derived palette used by both HTML and Word output. */
  function palette(accent) {
    return {
      accent,
      onAccent: luminance(accent) > 0.42 ? '#141a22' : '#ffffff',
      tint: mix(accent, '#ffffff', 0.9),
      soft: mix(accent, '#ffffff', 0.55),
    };
  }

  /* ---------------------------------------------------------------- i18n (CV labels) */
  const LANGS = { en: 'English', fr: 'Français', zh: '中文' };
  const I18N = {
    en: { profile: 'Profile', about: 'About', hello: 'Hello', execSummary: 'Executive summary', experience: 'Experience', education: 'Education',
      projects: 'Projects', certifications: 'Certifications', skills: 'Skills', expertise: 'Expertise', languages: 'Languages', contact: 'Contact',
      present: 'Present', yourName: 'Your name', ofFive: 'of 5' },
    fr: { profile: 'Profil', about: 'À propos', hello: 'Bonjour', execSummary: 'Synthèse', experience: 'Expérience professionnelle', education: 'Formation',
      projects: 'Projets', certifications: 'Certifications', skills: 'Compétences', expertise: 'Domaines d’expertise', languages: 'Langues', contact: 'Contact',
      present: 'aujourd’hui', yourName: 'Votre nom', ofFive: 'sur 5' },
    zh: { profile: '个人简介', about: '关于我', hello: '你好', execSummary: '职业概要', experience: '工作经历', education: '教育背景',
      projects: '项目经历', certifications: '证书', skills: '专业技能', expertise: '核心能力', languages: '语言能力', contact: '联系方式',
      present: '至今', yourName: '你的姓名', ofFive: '/ 5' },
  };
  // Language levels are stored as these English keys and translated on output.
  const LEVELS = {
    Native: { fr: 'Langue maternelle', zh: '母语' }, Fluent: { fr: 'Courant', zh: '流利' },
    Professional: { fr: 'Professionnel', zh: '工作熟练' }, Intermediate: { fr: 'Intermédiaire', zh: '中级' }, Basic: { fr: 'Notions', zh: '基础' },
  };
  const LEVEL_KEYS = Object.keys(LEVELS);
  const normLang = (l) => (I18N[l] ? l : 'en');
  const t = (lang, key) => I18N[normLang(lang)][key] || I18N.en[key] || key;
  const levelLabel = (lang, v) => (LEVELS[v] && LEVELS[v][normLang(lang)]) || v;
  const hasCJK = (o) => /[\u3000-\u9fff\uff00-\uffef]/.test(JSON.stringify(o));
  let LANG = 'en'; // set for the duration of one synchronous render
  const tr = (key) => t(LANG, key);

  /* ---------------------------------------------------------------- text utils */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const has = (s) => typeof s === 'string' && s.trim().length > 0;

  /** "- did x\n- did y" → bullets; other lines → paragraphs. */
  function parseLines(text) {
    if (!has(text)) return [];
    return String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^[-*•·–]\s*(.*)$/);
      return m ? { type: 'bullet', text: m[1] } : { type: 'p', text: l };
    });
  }
  function linesHtml(text) {
    const parts = parseLines(text);
    let out = '', inList = false;
    for (const p of parts) {
      if (p.type === 'bullet' && !inList) { out += '<ul>'; inList = true; }
      if (p.type !== 'bullet' && inList) { out += '</ul>'; inList = false; }
      out += p.type === 'bullet' ? `<li>${esc(p.text)}</li>` : `<p>${esc(p.text)}</p>`;
    }
    if (inList) out += '</ul>';
    return out;
  }
  /** Only http(s)/mailto/tel links; bare domains become https. */
  function safeHref(v, kind) {
    if (!has(v)) return '';
    const s = v.trim();
    if (kind === 'email') return /^[^\s@<>"]+@[^\s@<>"]+$/.test(s) ? 'mailto:' + s : '';
    if (kind === 'phone') return 'tel:' + s.replace(/[^\d+]/g, '');
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return 'https://' + s;
    return '';
  }
  const displayUrl = (s) => String(s || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  function dateRange(it, lang) {
    const end = it.current ? t(lang || LANG, 'present') : (it.end || '').trim();
    const start = (it.start || '').trim();
    if (start && end) return `${start} – ${end}`;
    return start || end;
  }
  function isSafePhoto(p) {
    return typeof p === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(p) && p.length < 3_000_000;
  }

  /* ---------------------------------------------------------------- data */
  const EMPTY = {
    personal: { fullName: '', title: '', email: '', phone: '', location: '', website: '', linkedin: '', photo: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    projects: [],
    certifications: [],
  };
  const SAMPLE = {
    personal: {
      fullName: 'Elena Marsh', title: 'Senior Product Designer',
      email: 'elena.marsh@example.com', phone: '+1 415 555 0182', location: 'San Francisco, CA',
      website: 'elenamarsh.design', linkedin: 'linkedin.com/in/elenamarsh', photo: '',
    },
    summary: 'Product designer with 9 years of experience shaping B2B and consumer products from first sketch to scale. I pair research with fast prototyping, and I care about design systems that make whole teams faster.',
    experience: [
      { role: 'Senior Product Designer', company: 'Northwind Analytics', location: 'San Francisco', start: 'Mar 2021', end: '', current: true,
        description: '- Led the redesign of the reporting suite used by 40,000 weekly users, lifting task completion by 28%\n- Built and maintain the Northwind design system (120+ components) with two front-end engineers\n- Coach three mid-level designers and run the bi-weekly design critique' },
      { role: 'Product Designer', company: 'Fieldnote', location: 'Remote', start: 'Jun 2018', end: 'Feb 2021', current: false,
        description: '- Designed the mobile capture flow that became 60% of new sign-ups\n- Ran 50+ customer interviews and turned findings into a shared research library' },
      { role: 'UX Designer', company: 'Brightwave Studio', location: 'Portland, OR', start: 'Aug 2016', end: 'May 2018', current: false,
        description: 'Agency work for retail and healthcare clients: discovery workshops, wireframes and usability testing.' },
    ],
    education: [
      { degree: 'B.A. Interaction Design', school: 'California College of the Arts', location: 'San Francisco', start: '2012', end: '2016', details: 'Graduated with honors' },
    ],
    skills: [
      { name: 'Product strategy', level: 5 }, { name: 'Figma & prototyping', level: 5 }, { name: 'Design systems', level: 5 },
      { name: 'User research', level: 4 }, { name: 'HTML & CSS', level: 4 }, { name: 'Data visualization', level: 3 },
    ],
    languages: [{ name: 'English', level: 'Native' }, { name: 'Spanish', level: 'Professional' }, { name: 'German', level: 'Basic' }],
    projects: [
      { name: 'Open Charts Kit', link: 'github.com/elenamarsh/open-charts', description: 'Accessible chart components for Figma, used by 3,000+ designers.' },
    ],
    certifications: [{ name: 'Certified Usability Analyst', issuer: 'Human Factors International', year: '2019' }],
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /** Coerce untrusted input into the expected shape (used by the server too). */
  function normalize(input) {
    const d = clone(EMPTY);
    const src = input && typeof input === 'object' ? input : {};
    const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
    const p = src.personal || {};
    for (const k of Object.keys(d.personal)) d.personal[k] = k === 'photo' ? (isSafePhoto(p.photo) ? p.photo : '') : str(p[k], 300);
    d.summary = str(src.summary, 4000);
    const list = (arr, fields, max = 30) => (Array.isArray(arr) ? arr.slice(0, max) : []).map((it) => {
      const o = {};
      for (const [k, t] of Object.entries(fields)) {
        const v = it && it[k];
        o[k] = t === 'bool' ? !!v : t === 'num' ? Math.max(1, Math.min(5, parseInt(v, 10) || 3)) : str(v, t === 'long' ? 4000 : 300);
      }
      return o;
    });
    d.experience = list(src.experience, { role: 's', company: 's', location: 's', start: 's', end: 's', current: 'bool', description: 'long' });
    d.education = list(src.education, { degree: 's', school: 's', location: 's', start: 's', end: 's', details: 'long' });
    d.skills = list(src.skills, { name: 's', level: 'num' }, 40);
    d.languages = list(src.languages, { name: 's', level: 's' });
    d.projects = list(src.projects, { name: 's', link: 's', description: 'long' });
    d.certifications = list(src.certifications, { name: 's', issuer: 's', year: 's' });
    return d;
  }

  /* ---------------------------------------------------------------- html parts */
  const ICONS = {
    email: '<path d="M3 5.5h18v13H3z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3.5 6 8.5 7 8.5-7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    phone: '<path d="M6.6 3.5h3l1.5 4.2-2 1.3a11 11 0 0 0 5.9 5.9l1.3-2 4.2 1.5v3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    location: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/>',
    website: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5v6M8 7.6v.1M11.5 16.5v-6m0 2.6c0-1.6 1-2.6 2.4-2.6s2.1 1 2.1 2.6v3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

  function contactItems(d, opts = {}) {
    const p = d.personal;
    const rows = [
      ['email', p.email, safeHref(p.email, 'email'), p.email],
      ['phone', p.phone, safeHref(p.phone, 'phone'), p.phone],
      ['location', p.location, '', p.location],
      ['website', p.website, safeHref(p.website), displayUrl(p.website)],
      ['linkedin', p.linkedin, safeHref(p.linkedin), displayUrl(p.linkedin)],
    ].filter((r) => has(r[1]));
    if (!rows.length) return '';
    return `<ul class="contact">${rows.map(([k, , href, label]) => {
      const inner = `${opts.icons === false ? '' : icon(k)}<span>${esc(label)}</span>`;
      return `<li class="ct ct-${k}">${href ? `<a href="${esc(href)}">${inner}</a>` : inner}</li>`;
    }).join('')}</ul>`;
  }

  const sec = (title, inner, cls = '') => (inner ? `<section class="sec ${cls}"><h2>${esc(title)}</h2><div class="sec-body">${inner}</div></section>` : '');

  function itemHtml({ title, sub, date, desc }) {
    // Flex header instead of a floated date: floats stop Chrome from splitting columns across PDF pages.
    return `<article class="item"><div class="item-head"><h3>${esc(title || '')}</h3>${date ? `<div class="date">${esc(date)}</div>` : ''}</div>` +
      `${sub ? `<div class="org">${esc(sub)}</div>` : ''}${desc ? `<div class="desc">${desc}</div>` : ''}</article>`;
  }
  const joinSub = (...parts) => parts.filter(has).join(', ');

  const H = {
    contact: contactItems,
    sec,
    t: tr,
    name: (d) => (has(d.personal.fullName) ? esc(d.personal.fullName) : `<span class="ph">${esc(tr('yourName'))}</span>`),
    title: (d) => (has(d.personal.title) ? `<p class="role">${esc(d.personal.title)}</p>` : ''),
    photo: (d, cls = '') => (isSafePhoto(d.personal.photo) ? `<img class="photo ${cls}" src="${d.personal.photo}" alt="">` : ''),
    summary: (d, key = 'profile') => sec(tr(key), has(d.summary) ? `<div class="desc">${linesHtml(d.summary)}</div>` : '', 'sec-summary'),
    experience: (d) => sec(tr('experience'), d.experience.filter((e) => has(e.role) || has(e.company)).map((e) =>
      itemHtml({ title: e.role, sub: joinSub(e.company, e.location), date: dateRange(e), desc: linesHtml(e.description) })).join(''), 'sec-exp'),
    education: (d) => sec(tr('education'), d.education.filter((e) => has(e.degree) || has(e.school)).map((e) =>
      itemHtml({ title: e.degree, sub: joinSub(e.school, e.location), date: dateRange(e), desc: linesHtml(e.details) })).join(''), 'sec-edu'),
    projects: (d) => sec(tr('projects'), d.projects.filter((p) => has(p.name)).map((p) => {
      const href = safeHref(p.link);
      const link = has(p.link) ? (href ? `<a href="${esc(href)}">${esc(displayUrl(p.link))}</a>` : esc(p.link)) : '';
      return `<article class="item"><div class="item-head"><h3>${esc(p.name)}</h3></div>${link ? `<div class="org">${link}</div>` : ''}${has(p.description) ? `<div class="desc">${linesHtml(p.description)}</div>` : ''}</article>`;
    }).join(''), 'sec-proj'),
    certs: (d) => sec(tr('certifications'), d.certifications.filter((c) => has(c.name)).map((c) =>
      `<article class="item item-compact"><div class="item-head"><h3>${esc(c.name)}</h3>${has(c.year) ? `<div class="date">${esc(c.year)}</div>` : ''}</div>${has(c.issuer) ? `<div class="org">${esc(c.issuer)}</div>` : ''}</article>`).join(''), 'sec-cert'),
    skills: (d, mode = 'bars', key = 'skills') => {
      const title = tr(key);
      const s = d.skills.filter((k) => has(k.name));
      if (!s.length) return '';
      let inner;
      if (mode === 'chips') inner = `<ul class="chips">${s.map((k) => `<li>${esc(k.name)}</li>`).join('')}</ul>`;
      else if (mode === 'inline') inner = `<p class="inline-list">${s.map((k) => esc(k.name)).join('<span class="sep"> · </span>')}</p>`;
      else if (mode === 'dots') inner = `<ul class="skills dots">${s.map((k) => `<li><span>${esc(k.name)}</span><span class="lv" aria-label="${k.level} ${esc(tr('ofFive'))}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= k.level ? 'on' : ''}"></i>`).join('')}</span></li>`).join('')}</ul>`;
      else inner = `<ul class="skills bars">${s.map((k) => `<li><span>${esc(k.name)}</span><span class="bar"><i style="width:${k.level * 20}%"></i></span></li>`).join('')}</ul>`;
      return sec(title, inner, 'sec-skills');
    },
    languages: (d, mode = 'list') => {
      const l = d.languages.filter((k) => has(k.name));
      if (!l.length) return '';
      if (mode === 'inline') return sec(tr('languages'), `<p class="inline-list">${l.map((k) => esc(k.name) + (has(k.level) ? ` <span class="muted">(${esc(levelLabel(LANG, k.level))})</span>` : '')).join('<span class="sep"> · </span>')}</p>`, 'sec-lang');
      return sec(tr('languages'), `<ul class="langs">${l.map((k) => `<li><span>${esc(k.name)}</span>${has(k.level) ? `<span class="muted">${esc(levelLabel(LANG, k.level))}</span>` : ''}</li>`).join('')}</ul>`, 'sec-lang');
    },
  };

  /* ---------------------------------------------------------------- base css */
  const BASE_CSS = `
.cv{box-sizing:border-box;width:210mm;min-height:297mm;color:#1d232b;font-family:var(--font);font-size:9.5pt;line-height:1.48;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:optimizeLegibility;overflow-wrap:break-word;position:relative}
.cv *{box-sizing:border-box;margin:0;padding:0}
.cv a{color:inherit;text-decoration:none}
.cv ul{list-style:none}
.cv .ph{opacity:.35}
.cv .muted{color:#69727d}
.cv h1{line-height:1.08;font-weight:700}
.cv h2{break-after:avoid;page-break-after:avoid}
.cv h3{font-size:1.03em;font-weight:700;line-height:1.3}
.cv .sec{margin-bottom:5.5mm}
.cv .item{break-inside:avoid;page-break-inside:avoid;margin-bottom:3.6mm}
.cv .item:last-child{margin-bottom:0}
.cv .item-head{display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.cv .date{flex:none;font-size:.87em;color:#5d6670;white-space:nowrap}
.cv .org{color:#4f5862;font-size:.95em}
.cv .desc{margin-top:1.2mm}
.cv .desc p+p{margin-top:1mm}
.cv .desc ul{list-style:disc;padding-left:4.2mm}
.cv .desc li{margin:.6mm 0;padding-left:.6mm}
.cv .desc li::marker{color:var(--accent)}
.cv .contact .ct{display:flex;align-items:center;gap:1.8mm}
.cv .contact a{display:flex;align-items:center;gap:1.8mm}
.cv .contact svg{width:3.2mm;height:3.2mm;flex:none}
.cv .skills li,.cv .langs li{display:flex;justify-content:space-between;align-items:center;gap:3mm;margin-bottom:1.6mm}
.cv .bar{flex:0 0 22mm;height:1.3mm;border-radius:1mm;background:var(--track,#e3e7ec);overflow:hidden}
.cv .bar i{display:block;height:100%;background:var(--accent)}
.cv .lv{display:flex;gap:1mm;flex:none}
.cv .lv i{width:2mm;height:2mm;border-radius:50%;background:var(--track,#e3e7ec)}
.cv .lv i.on{background:var(--accent)}
.cv .chips{display:flex;flex-wrap:wrap;gap:1.6mm}
.cv .chips li{padding:.8mm 2.4mm;border-radius:1.2mm;background:var(--tint);color:#1d232b;font-size:.92em}
.cv .photo{display:block;object-fit:cover}
.cv:lang(zh) *{font-style:normal!important}
.cv:lang(zh) h1{letter-spacing:.02em}
`;

  /* ---------------------------------------------------------------- templates */
  /*
   * Each template: meta for the catalog, CSS, markup, a page background
   * (painted on every PDF page so sidebars continue), and a `docx` spec the
   * Word exporter follows so both downloads share one layout.
   */
  const TEMPLATES = [
    {
      id: 'meridian', name: 'Meridian', category: 'Classic',
      blurb: 'Centered serif header and ruled sections. Safe for law, finance and academia.',
      accent: '#1f3a5f', font: 'source-serif', photo: false,
      docx: { header: 'center', h2: 'rule', columns: null, skills: 'inline' },
      bg: () => '#ffffff',
      css: `
.t-meridian{padding:16mm 19mm 15mm}
.t-meridian header{text-align:center;margin-bottom:6mm}
.t-meridian h1{font-size:25pt;font-weight:600;letter-spacing:.01em}
.t-meridian .role{margin-top:1.4mm;font-size:11pt;font-style:italic;color:var(--accent)}
.t-meridian .contact{display:flex;flex-wrap:wrap;justify-content:center;gap:1mm 5mm;margin-top:3.2mm;font-size:8.6pt;color:#4f5862}
.t-meridian .contact svg{display:none}
.t-meridian h2{font-size:9.6pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);
  border-bottom:.7pt solid var(--accent);padding-bottom:1.1mm;margin-bottom:2.8mm}
.t-meridian .inline-list .sep{color:var(--soft)}`,
      html: (d, h) => `
<header><h1>${h.name(d)}</h1>${h.title(d)}${h.contact(d)}</header>
${h.summary(d)}${h.experience(d)}${h.education(d)}${h.projects(d)}${h.skills(d, 'inline')}${h.languages(d, 'inline')}${h.certs(d)}`,
    },
    {
      id: 'atlas', name: 'Atlas', category: 'Modern',
      blurb: 'Dark sidebar with photo, contact and skill bars. Reads fast, works for most roles.',
      accent: '#1e3a5f', font: 'inter', photo: true,
      docx: { header: 'left', h2: 'bar', columns: { side: 'left', width: 0.34, shade: 'accent' }, skills: 'bars' },
      bg: (p) => `linear-gradient(to right, ${p.accent} 0, ${p.accent} 68mm, #ffffff 68mm)`,
      css: `
.t-atlas{display:grid;grid-template-columns:68mm 1fr}
.t-atlas aside{padding:15mm 8mm 12mm 9mm;color:var(--on-accent)}
.t-atlas aside .photo{width:40mm;height:40mm;border-radius:50%;margin:0 auto 8mm;border:1.4mm solid rgba(255,255,255,.14)}
.t-atlas aside h2{font-size:9.2pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;padding-bottom:1.4mm;margin-bottom:3mm;border-bottom:.6pt solid color-mix(in srgb,var(--on-accent) 30%,transparent)}
.t-atlas aside .contact li{margin-bottom:2mm;font-size:8.7pt;word-break:break-word}
.t-atlas aside .contact svg{opacity:.75}
.t-atlas aside{--track:color-mix(in srgb,var(--on-accent) 22%,transparent)}
.t-atlas aside .bar i{background:var(--on-accent)}
.t-atlas aside .muted{color:inherit;opacity:.7}
.t-atlas aside .skills li,.t-atlas aside .langs li{font-size:8.8pt}
.t-atlas main{padding:15mm 13mm 12mm 11mm}
.t-atlas main header{margin-bottom:7mm}
.t-atlas h1{font-size:27pt;font-weight:800;letter-spacing:-.015em;color:#141a22}
.t-atlas .role{margin-top:1.6mm;font-size:11.5pt;font-weight:500;color:var(--accent)}
.t-atlas main h2{display:flex;align-items:center;gap:2.4mm;font-size:11pt;font-weight:700;color:var(--accent);margin-bottom:3mm}
.t-atlas main h2::before{content:"";width:5mm;height:.9mm;background:var(--accent);border-radius:.5mm}`,
      html: (d, h) => `
<aside>${h.photo(d)}${h.sec(h.t('contact'), h.contact(d))}${h.skills(d, 'bars')}${h.languages(d)}</aside>
<main><header><h1>${h.name(d)}</h1>${h.title(d)}</header>
${h.summary(d)}${h.experience(d)}${h.education(d)}${h.projects(d)}${h.certs(d)}</main>`,
    },
    {
      id: 'nova', name: 'Nova', category: 'Modern',
      blurb: 'Full-width color band with a narrow skills column. Confident, good for tech and product.',
      accent: '#0f766e', font: 'manrope', photo: true,
      docx: { header: 'band', h2: 'plain', columns: { side: 'right', width: 0.3, shade: null }, skills: 'chips' },
      bg: () => '#ffffff',
      css: `
/* one grid for the whole page: a nested column grid below a header gets pushed to page 2 by Chrome's print layout */
.t-nova{display:grid;grid-template-columns:1fr 54mm;column-gap:9mm;align-content:start;padding-bottom:12mm}
.t-nova .band{grid-column:1/-1}
.t-nova .body{display:contents}
.t-nova .main{padding:10mm 0 0 16mm;min-width:0}
.t-nova .side{padding:10mm 16mm 0 0;min-width:0}
.t-nova .band{background:var(--accent);color:var(--on-accent);padding:13mm 16mm 11mm;display:flex;gap:8mm;align-items:center}
.t-nova .band .photo{width:30mm;height:30mm;border-radius:3mm;flex:none}
.t-nova h1{font-size:29pt;font-weight:800;letter-spacing:-.02em}
.t-nova .role{margin-top:1.2mm;font-size:12pt;font-weight:500;opacity:.9}
.t-nova .band .contact{display:flex;flex-wrap:wrap;gap:1.4mm 6mm;margin-top:4mm;font-size:8.6pt}
.t-nova .band .contact svg{opacity:.8}
.t-nova h2{font-size:11.5pt;font-weight:800;color:var(--accent);margin-bottom:2.8mm;letter-spacing:-.005em}
.t-nova .side h2{font-size:10.5pt}
.t-nova .side .sec{margin-bottom:7mm}
.t-nova .side .langs li{font-size:9pt}`,
      html: (d, h) => `
<div class="band">${h.photo(d)}<div><h1>${h.name(d)}</h1>${h.title(d)}${h.contact(d)}</div></div>
<div class="body"><div class="main">${h.summary(d, 'about')}${h.experience(d)}${h.education(d)}${h.projects(d)}</div>
<div class="side">${h.skills(d, 'chips')}${h.languages(d)}${h.certs(d)}</div></div>`,
    },
    {
      id: 'linea', name: 'Linea', category: 'Minimal',
      blurb: 'Light type, generous whitespace, section labels in a margin column. Quietly elegant.',
      accent: '#2f5bd3', font: 'inter', photo: false,
      docx: { header: 'left-light', h2: 'side', columns: null, skills: 'inline' },
      bg: () => '#ffffff',
      css: `
.t-linea{padding:18mm 18mm 15mm}
.t-linea header{margin-bottom:9mm;padding-left:36mm}
.t-linea h1{font-size:30pt;font-weight:300;letter-spacing:-.02em}
.t-linea .role{margin-top:1.6mm;font-size:11pt;color:var(--accent);font-weight:500}
.t-linea header .contact{display:flex;flex-wrap:wrap;gap:1.2mm 6mm;margin-top:4mm;font-size:8.6pt;color:#4f5862}
.t-linea header .contact svg{color:var(--accent)}
.t-linea .sec{display:grid;grid-template-columns:30mm 1fr;gap:6mm;margin-bottom:6.5mm}
.t-linea h2{font-size:8.8pt;font-weight:600;color:var(--accent);letter-spacing:.02em;padding-top:.4mm;text-align:right}
.t-linea .item{padding-left:4mm;border-left:.6pt solid #dde2e8}
.t-linea .sec-summary .desc{margin-top:0}
.t-linea .inline-list .sep{color:var(--soft)}`,
      html: (d, h) => `
<header><h1>${h.name(d)}</h1>${h.title(d)}${h.contact(d)}</header>
${h.summary(d)}${h.experience(d)}${h.education(d)}${h.projects(d)}${h.skills(d, 'inline')}${h.languages(d, 'inline')}${h.certs(d)}`,
    },
    {
      id: 'cascade', name: 'Cascade', category: 'Creative',
      blurb: 'Tinted right column with photo and dot ratings. Friendly; suits design and marketing.',
      accent: '#b0306a', font: 'dm-sans', photo: true,
      docx: { header: 'left', h2: 'plain', columns: { side: 'right', width: 0.33, shade: 'tint' }, skills: 'dots' },
      bg: (p) => `linear-gradient(to left, ${p.tint} 0, ${p.tint} 66mm, #ffffff 66mm)`,
      css: `
.t-cascade{display:grid;grid-template-columns:1fr 66mm}
.t-cascade main{padding:16mm 11mm 12mm 16mm}
.t-cascade main header{margin-bottom:8mm}
.t-cascade h1{font-size:28pt;font-weight:700;letter-spacing:-.02em;color:var(--accent)}
.t-cascade .role{margin-top:1.4mm;font-size:12pt;color:#3a424b}
.t-cascade h2{display:flex;align-items:center;gap:2.2mm;font-size:11pt;font-weight:700;margin-bottom:3mm;color:#1d232b}
.t-cascade h2::before{content:"";width:2.4mm;height:2.4mm;border-radius:50%;background:var(--accent)}
.t-cascade aside{padding:16mm 9mm 12mm;--track:color-mix(in srgb,var(--accent) 18%,#fff)}
.t-cascade aside .photo{width:100%;aspect-ratio:1;border-radius:4mm;margin-bottom:8mm}
.t-cascade aside .contact li{margin-bottom:2mm;font-size:8.7pt;word-break:break-word}
.t-cascade aside .contact svg{color:var(--accent)}`,
      html: (d, h) => `
<main><header><h1>${h.name(d)}</h1>${h.title(d)}</header>
${h.summary(d, 'hello')}${h.experience(d)}${h.education(d)}${h.projects(d)}</main>
<aside>${h.photo(d)}${h.sec(h.t('contact'), h.contact(d))}${h.skills(d, 'dots')}${h.languages(d)}${h.certs(d)}</aside>`,
    },
    {
      id: 'regent', name: 'Regent', category: 'Classic',
      blurb: 'Executive layout: heavy rule, portrait, and a side column for credentials.',
      accent: '#1f5130', font: 'libre-baskerville', photo: true,
      docx: { header: 'split', h2: 'rule', columns: { side: 'right', width: 0.32, shade: null }, skills: 'list' },
      bg: () => '#ffffff',
      css: `
.t-regent{padding:15mm 17mm 13mm;font-size:9.1pt;display:grid;grid-template-columns:1fr 54mm;column-gap:9mm;align-content:start}
.t-regent header{grid-column:1/-1}
.t-regent .body{display:contents}
.t-regent .main{min-width:0}
.t-regent header{display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;padding-bottom:5mm;border-bottom:1.6mm solid var(--accent);margin-bottom:7mm}
.t-regent h1{font-size:26pt;font-weight:700;letter-spacing:-.01em}
.t-regent .role{margin-top:2mm;font-size:11pt;font-style:italic;color:var(--accent)}
.t-regent header .photo{width:28mm;height:34mm;border-radius:1mm}
.t-regent .side{border-left:.6pt solid #d8dde3;padding-left:7mm}
.t-regent h2{font-size:10.5pt;font-weight:700;color:var(--accent);padding-bottom:1.2mm;margin-bottom:2.8mm;border-bottom:.6pt solid #d8dde3}
.t-regent .side .contact li{margin-bottom:1.8mm;font-size:8.4pt;word-break:break-word}
.t-regent .side .contact svg{color:var(--accent)}
.t-regent .skills li{margin-bottom:1.2mm}
.t-regent .side .item-head{flex-direction:column;gap:0}`,
      html: (d, h) => `
<header><div><h1>${h.name(d)}</h1>${h.title(d)}</div>${h.photo(d)}</header>
<div class="body"><div class="main">${h.summary(d, 'execSummary')}${h.experience(d)}${h.education(d)}${h.projects(d)}</div>
<div class="side">${h.sec(h.t('contact'), h.contact(d))}${h.skills(d, 'list', 'expertise')}${h.languages(d)}${h.certs(d)}</div></div>`,
    },
  ];
  // 'list' skill mode = names only, one per line
  const _skills = H.skills;
  H.skills = (d, mode, key) => (mode === 'list'
    ? sec(tr(key || 'skills'), d.skills.some((k) => has(k.name)) ? `<ul class="skills">${d.skills.filter((k) => has(k.name)).map((k) => `<li><span>${esc(k.name)}</span></li>`).join('')}</ul>` : '', 'sec-skills')
    : _skills(d, mode, key));

  const byId = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
  function getTemplate(id) { return byId[id] || TEMPLATES[0]; }

  function resolveSettings(t, settings) {
    const s = settings || {};
    const accent = normalizeHex(s.accent, t.accent);
    const fontKey = FONTS[s.font] ? s.font : t.font;
    return { accent, fontKey, font: FONTS[fontKey], pal: palette(accent), lang: normLang(s.lang) };
  }
  function cssVars(r) {
    return `--accent:${r.pal.accent};--on-accent:${r.pal.onAccent};--tint:${r.pal.tint};--soft:${r.pal.soft};--font:${r.font.css};`;
  }

  /**
   * Render for embedding (preview / thumbnails).
   * Returns {css, html}; html is a single .cv element with its own background.
   */
  function render(templateId, data, settings) {
    const t = getTemplate(templateId);
    const d = normalize(data);
    const r = resolveSettings(t, settings);
    LANG = r.lang;
    const html = `<div class="cv t-${t.id}" lang="${r.lang === 'zh' ? 'zh-CN' : r.lang}" style="${cssVars(r)}background:${t.bg(r.pal)}">${t.html(d, H)}</div>`;
    return { css: BASE_CSS + t.css, html, template: t, resolved: r };
  }

  /** Full standalone document for PDF printing (A4, background repeats per page). */
  function renderDocument(templateId, data, settings, opts = {}) {
    const t = getTemplate(templateId);
    const d = normalize(data);
    const r = resolveSettings(t, settings);
    LANG = r.lang;
    const cjk = r.lang === 'zh' || hasCJK(d);
    const fontsLink = opts.fonts === false ? '' : `<link rel="stylesheet" href="${esc(fontsHref([r.fontKey], { cjk }))}">`;
    return `<!doctype html><html lang="${r.lang === 'zh' ? 'zh-CN' : r.lang}"><head><meta charset="utf-8"><title>${esc(d.personal.fullName || 'CV')}</title>${fontsLink}
<style>
@page{size:A4;margin:13mm 0 12mm}
@page:first{margin-top:0}
html{background:${t.bg(r.pal)};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
${BASE_CSS}${t.css}
.cv{min-height:0}
</style></head><body><div class="cv t-${t.id}" style="${cssVars(r)}">${t.html(d, H)}</div></body></html>`;
  }

  return {
    FONTS, TEMPLATES, LANGS, LEVEL_KEYS, t, levelLabel, hasCJK, SAMPLE, EMPTY, fontsHref, getTemplate, render, renderDocument,
    normalize, parseLines, palette, normalizeHex, resolveSettings, safeHref, displayUrl, dateRange, isSafePhoto, has, clone,
  };
});
