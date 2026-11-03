'use strict';
/*
 * Word (.docx) export. Each template carries a `docx` spec (header style,
 * heading style, optional side column) so the Word file mirrors the layout
 * the user picked, using real Word structures (tables, bullets, tab stops)
 * that stay editable.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, AlignmentType, TabStopType, LevelFormat, ImageRun, ExternalHyperlink, VerticalAlign,
  TableLayoutType,
} = require('docx');
const CV = require('../shared/cv.js');

const PAGE_W = 11906; // A4 in twips
const PAGE_H = 16838;
const hex = (c) => c.replace('#', '').toUpperCase();
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const CELL_NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const has = CV.has;

function build(templateId, rawData, settings) {
  const t = CV.getTemplate(templateId);
  const d = CV.normalize(rawData);
  const r = CV.resolveSettings(t, settings);
  const spec = t.docx;
  const fontName = r.font.docx;
  const font = { ascii: fontName, hAnsi: fontName, cs: fontName, eastAsia: r.font.docxEA || 'Microsoft YaHei' };
  const KEYS = { Profile: 'profile', About: 'about', Hello: 'hello', 'Executive summary': 'execSummary', Experience: 'experience', Education: 'education',
    Projects: 'projects', Certifications: 'certifications', Skills: 'skills', Expertise: 'expertise', Languages: 'languages', Contact: 'contact' };
  const L = (title) => CV.t(r.lang, KEYS[title] || title); // section titles in the CV's language
  const lvl = (v) => CV.levelLabel(r.lang, v);
  const pal = r.pal;
  const A = hex(pal.accent);
  const TEXT = '1D232B';
  const MUTED = '5D6670';

  const margin = spec.columns && spec.columns.shade ? 560 : 1000;
  const contentW = PAGE_W - margin * 2;

  /* ---------- primitives (ctx = colours/width of the column we're writing into) */
  const run = (text, o = {}) => new TextRun({ text, font, size: o.size || 19, color: o.color || TEXT, bold: o.bold, italics: o.italics && r.lang !== 'zh' });
  const P = (children, o = {}) => new Paragraph({ children, spacing: { after: o.after ?? 60, before: o.before ?? 0, line: o.line ?? 264 }, alignment: o.align, tabStops: o.tabStops, border: o.border, numbering: o.numbering, keepNext: o.keepNext, indent: o.indent });

  function heading(title, ctx) {
    const color = ctx.headColor || A;
    const opts = { before: 200, after: 90, keepNext: true };
    if (spec.h2 === 'rule' || ctx.onShade) opts.border = { bottom: { style: BorderStyle.SINGLE, size: ctx.onShade ? 4 : 6, color: ctx.onShade ? ctx.ruleColor : (spec.h2 === 'rule' ? A : 'D8DDE3'), space: 2 } };
    const upper = spec.h2 === 'rule' && t.id === 'meridian' || ctx.onShade;
    const prefix = spec.h2 === 'bar' && !ctx.onShade ? [run('▬  ', { color: A, size: 16 })] : [];
    title = L(title);
    return P([...prefix, run(upper ? title.toUpperCase() : title, { bold: true, color, size: upper ? 18 : 22 })], opts);
  }

  function descParas(text, ctx) {
    return CV.parseLines(text).map((l) => l.type === 'bullet'
      ? P([run(l.text, { color: ctx.text })], { after: 30, numbering: { reference: 'cv-bullets', level: 0 } })
      : P([run(l.text, { color: ctx.text })], { after: 50 }));
  }

  function item({ title, sub, date, desc }, ctx) {
    const out = [];
    const dateInline = !ctx.narrow && has(date);
    const head = [];
    if (has(title)) head.push(run(title, { bold: true, color: ctx.text, size: 20 }));
    if (dateInline) head.push(run('\t' + date, { color: ctx.muted, size: 17 }));
    if (head.length) out.push(P(head, { after: 10, before: 80, keepNext: true, tabStops: [{ type: TabStopType.RIGHT, position: ctx.width - 40 }] }));
    if (ctx.narrow && has(date)) out.push(P([run(date, { color: ctx.muted, size: 16 })], { after: 10, keepNext: true }));
    if (has(sub)) out.push(P([run(sub, { color: ctx.muted, size: 18 })], { after: 40, keepNext: !!desc }));
    if (desc) out.push(...descParas(desc, ctx));
    return out;
  }

  const sub = (...p) => p.filter(has).join(', ');
  const range = (e) => CV.dateRange(e, r.lang);

  /* ---------- content blocks */
  function contactRows() {
    const p = d.personal;
    return [
      [p.email, CV.safeHref(p.email, 'email')], [p.phone, ''], [p.location, ''],
      [CV.displayUrl(p.website), CV.safeHref(p.website)], [CV.displayUrl(p.linkedin), CV.safeHref(p.linkedin)],
    ].filter(([v]) => has(v));
  }
  const linkOrRun = (label, href, o) => (href ? new ExternalHyperlink({ link: href, children: [run(label, o)] }) : run(label, o));

  function contactLine(o) {
    const rows = contactRows();
    const kids = [];
    rows.forEach(([v, href], i) => {
      if (i) kids.push(run('   |   ', { ...o, color: o.sep || o.color }));
      kids.push(linkOrRun(v, href, o));
    });
    return kids.length ? [P(kids, { align: o.align, after: 60 })] : [];
  }
  function contactStack(ctx) {
    const rows = contactRows();
    if (!rows.length) return [];
    return [heading('Contact', ctx), ...rows.map(([v, href]) => P([linkOrRun(v, href, { color: ctx.text, size: 17 })], { after: 40 }))];
  }

  function summary(ctx, title) { return has(d.summary) ? [heading(title, ctx), ...descParas(d.summary, ctx)] : []; }
  function experience(ctx) {
    const xs = d.experience.filter((e) => has(e.role) || has(e.company));
    return xs.length ? [heading('Experience', ctx), ...xs.flatMap((e) => item({ title: e.role, sub: sub(e.company, e.location), date: range(e), desc: e.description }, ctx))] : [];
  }
  function education(ctx) {
    const xs = d.education.filter((e) => has(e.degree) || has(e.school));
    return xs.length ? [heading('Education', ctx), ...xs.flatMap((e) => item({ title: e.degree, sub: sub(e.school, e.location), date: range(e), desc: e.details }, ctx))] : [];
  }
  function projects(ctx) {
    const xs = d.projects.filter((p) => has(p.name));
    return xs.length ? [heading('Projects', ctx), ...xs.flatMap((p) => item({ title: p.name, sub: CV.displayUrl(p.link), desc: p.description }, ctx))] : [];
  }
  function certs(ctx) {
    const xs = d.certifications.filter((c) => has(c.name));
    return xs.length ? [heading('Certifications', ctx), ...xs.flatMap((c) => item({ title: c.name, sub: c.issuer, date: c.year }, ctx))] : [];
  }
  function skills(ctx, mode, title = 'Skills') {
    const xs = d.skills.filter((k) => has(k.name));
    if (!xs.length) return [];
    const head = heading(title, ctx);
    if (mode === 'inline' || mode === 'chips') {
      return [head, P([run(xs.map((k) => k.name).join(mode === 'chips' ? '  •  ' : '  ·  '), { color: ctx.text })], { after: 60 })];
    }
    if (mode === 'list') return [head, ...xs.map((k) => P([run(k.name, { color: ctx.text, size: 18 })], { after: 30 }))];
    const filled = mode === 'dots' ? '●' : '■';
    const empty = mode === 'dots' ? '○' : '□';
    return [head, ...xs.map((k) => P([
      run(k.name, { color: ctx.text, size: 18 }),
      run('\t' + filled.repeat(k.level), { color: ctx.barColor || A, size: 14 }),
      run(empty.repeat(5 - k.level), { color: ctx.barEmpty || 'C9CFD6', size: 14 }),
    ], { after: 40, tabStops: [{ type: TabStopType.RIGHT, position: ctx.width - 60 }] }))];
  }
  function languages(ctx, mode) {
    const xs = d.languages.filter((k) => has(k.name));
    if (!xs.length) return [];
    if (mode === 'inline') return [heading('Languages', ctx), P([run(xs.map((k) => k.name + (has(k.level) ? ` (${lvl(k.level)})` : '')).join('  ·  '), { color: ctx.text })])];
    return [heading('Languages', ctx), ...xs.map((k) => P([run(k.name, { color: ctx.text, size: 18 }), run(has(k.level) ? '\t' + lvl(k.level) : '', { color: ctx.muted, size: 17 })],
      { after: 40, tabStops: [{ type: TabStopType.RIGHT, position: ctx.width - 60 }] }))];
  }

  function photo(w, h) {
    const p = d.personal.photo;
    if (!CV.isSafePhoto(p)) return null;
    const m = p.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    return new ImageRun({ type: m[1] === 'png' ? 'png' : 'jpg', data: Buffer.from(m[2], 'base64'), transformation: { width: w, height: h } });
  }

  const nameRun = (o) => run(has(d.personal.fullName) ? d.personal.fullName : CV.t(r.lang, 'yourName'), { bold: o.bold !== false, size: o.size || 52, color: o.color || TEXT });
  const titleRun = (o) => (has(d.personal.title) ? [P([run(d.personal.title, { size: 23, color: o.color || A, italics: o.italics })], { after: 120 })] : []);

  /* ---------- contexts */
  const mainCtx = (width) => ({ width, text: TEXT, muted: MUTED });
  function sideCtx(width) {
    const shade = spec.columns.shade;
    if (shade === 'accent') {
      const on = hex(pal.onAccent);
      return { width, narrow: true, onShade: true, text: on, muted: on, headColor: on, ruleColor: on === 'FFFFFF' ? '8A9BB0' : '6B7380', barColor: on, barEmpty: on === 'FFFFFF' ? '6B7F99' : '9AA3AD' };
    }
    return { width, narrow: true, text: TEXT, muted: MUTED };
  }

  const cell = (children, width, o = {}) => new TableCell({
    children: children.length ? children : [P([])],
    width: { size: width, type: WidthType.DXA },
    borders: CELL_NO_BORDERS,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: o.margins || { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: o.vAlign,
  });
  const table = (cells, widths) => new Table({
    rows: [new TableRow({ children: cells })], width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths, borders: NO_BORDERS, layout: TableLayoutType.FIXED,
  });

  /* ---------- assemble */
  const body = [];
  const H = spec.header;

  function headerBlock(width) {
    if (H === 'center') {
      return [P([nameRun({ size: 50, bold: false })], { align: AlignmentType.CENTER, after: 40 }),
        ...(has(d.personal.title) ? [P([run(d.personal.title, { size: 22, color: A, italics: true })], { align: AlignmentType.CENTER, after: 80 })] : []),
        ...contactLine({ align: AlignmentType.CENTER, size: 17, color: MUTED, sep: 'B5BCC4' }), P([], { after: 80 })];
    }
    if (H === 'left-light') {
      return [P([nameRun({ size: 58, bold: false })], { after: 40 }), ...titleRun({}), ...contactLine({ size: 17, color: MUTED, sep: 'B5BCC4' }), P([], { after: 120 })];
    }
    return [P([nameRun({ size: 54, color: t.id === 'cascade' ? A : TEXT })], { after: 40 }), ...titleRun({ color: t.id === 'cascade' ? '3A424B' : A })];
  }

  const sideW = spec.columns ? Math.round(contentW * spec.columns.width) : 0;
  const gap = spec.columns ? (spec.columns.shade ? 0 : 400) : 0;
  const mainW = contentW - sideW - gap;
  const pad = 300; // inner padding for shaded columns

  if (H === 'band') {
    const on = hex(pal.onAccent);
    const img = photo(96, 96);
    const text = [P([nameRun({ size: 56, color: on })], { after: 30 }),
      ...(has(d.personal.title) ? [P([run(d.personal.title, { size: 23, color: on })], { after: 100 })] : []),
      ...contactLine({ size: 17, color: on })];
    const cells = img
      ? [cell([P([img])], 1900, { fill: A, margins: { top: 360, bottom: 360, left: 360, right: 120 }, vAlign: VerticalAlign.CENTER }),
        cell(text, contentW - 1900, { fill: A, margins: { top: 360, bottom: 300, left: 120, right: 360 }, vAlign: VerticalAlign.CENTER })]
      : [cell(text, contentW, { fill: A, margins: { top: 360, bottom: 300, left: 400, right: 400 } })];
    body.push(table(cells, img ? [1900, contentW - 1900] : [contentW]), P([], { after: 120 }));
  } else if (H === 'split') {
    const img = photo(90, 110);
    body.push(table([cell(headerBlock(contentW), contentW - 1900, { vAlign: VerticalAlign.BOTTOM }), cell(img ? [P([img], { align: AlignmentType.RIGHT })] : [], 1900, { vAlign: VerticalAlign.BOTTOM })], [contentW - 1900, 1900]));
    body.push(P([], { after: 200, border: { bottom: { style: BorderStyle.THICK, size: 36, color: A, space: 1 } } }));
  }

  if (!spec.columns) {
    const ctx = mainCtx(contentW);
    if (spec.h2 === 'side') {
      // Linea: section label in a margin column, content beside it
      body.push(...headerBlock(contentW));
      const labelW = 1700, restW = contentW - labelW;
      const rctx = mainCtx(restW - 240);
      const sections = [
        ['Profile', () => (has(d.summary) ? descParas(d.summary, rctx) : [])],
        ['Experience', () => experience(rctx).slice(1)],
        ['Education', () => education(rctx).slice(1)],
        ['Projects', () => projects(rctx).slice(1)],
        ['Skills', () => skills(rctx, 'inline').slice(1)],
        ['Languages', () => languages(rctx, 'inline').slice(1)],
        ['Certifications', () => certs(rctx).slice(1)],
      ];
      for (const [label, fn] of sections) {
        const content = fn();
        if (!content.length) continue;
        body.push(table([
          cell([P([run(L(label), { bold: true, color: A, size: 17 })], { align: AlignmentType.RIGHT, before: 80 })], labelW, { margins: { top: 0, bottom: 0, left: 0, right: 240 } }),
          cell(content, restW, { margins: { top: 0, bottom: 0, left: 240, right: 0 } }),
        ], [labelW, restW]), P([], { after: 140 }));
      }
    } else {
      body.push(...headerBlock(contentW), ...summary(ctx, 'Profile'), ...experience(ctx), ...education(ctx), ...projects(ctx),
        ...skills(ctx, spec.skills), ...languages(ctx, 'inline'), ...certs(ctx));
    }
  } else {
    const sCtx = sideCtx(sideW - (spec.columns.shade ? pad * 2 : (spec.columns.side === 'right' ? 300 : 0)));
    const mCtx = mainCtx(mainW - (spec.columns.shade ? pad * 2 : 0));
    const sumTitle = { atlas: 'Profile', nova: 'About', cascade: 'Hello', regent: 'Executive summary' }[t.id] || 'Profile';
    const mainKids = [
      ...(H === 'left' ? headerBlock(mainW) : []),
      ...summary(mCtx, sumTitle), ...experience(mCtx), ...education(mCtx), ...projects(mCtx),
    ];
    const sideKids = [];
    if (H === 'left') {
      const img = photo(t.id === 'atlas' ? 140 : 170, t.id === 'atlas' ? 140 : 170);
      if (img) sideKids.push(P([img], { align: AlignmentType.CENTER, after: 200 }));
    }
    if (H !== 'band') sideKids.push(...contactStack(sCtx));
    sideKids.push(...skills(sCtx, spec.skills, t.id === 'regent' ? 'Expertise' : 'Skills'), ...languages(sCtx));
    if (t.id !== 'atlas') sideKids.push(...certs(sCtx));
    else mainKids.push(...certs(mCtx));

    const fill = spec.columns.shade === 'accent' ? A : spec.columns.shade === 'tint' ? hex(pal.tint) : undefined;
    const sideMargins = fill ? { top: 500, bottom: 400, left: pad, right: pad } : { top: 0, bottom: 0, left: spec.columns.side === 'right' ? 300 : 0, right: 0 };
    const mainMargins = fill ? { top: 500, bottom: 400, left: pad, right: pad } : { top: 0, bottom: 0, left: 0, right: 0 };
    const sideCell = cell(sideKids, sideW, { fill, margins: sideMargins });
    const mainCell = cell(mainKids, mainW, { margins: mainMargins });
    if (spec.columns.side === 'left') body.push(table([sideCell, mainCell], [sideW, mainW]));
    else if (gap) body.push(table([mainCell, cell([], gap), sideCell], [mainW, gap, sideW]));
    else body.push(table([mainCell, sideCell], [mainW, sideW]));
  }

  const doc = new Document({
    creator: 'CV Studio',
    title: (d.personal.fullName || 'CV') + ' – CV',
    styles: { default: { document: { run: { font, size: 19, color: TEXT, language: { value: { en: 'en-GB', fr: 'fr-FR', zh: 'zh-CN' }[r.lang], eastAsia: 'zh-CN' } } } } },
    numbering: {
      config: [{
        reference: 'cv-bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 300, hanging: 220 } }, run: { color: A } } }],
      }],
    },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: H === 'band' ? 500 : margin, bottom: margin, left: margin, right: margin } } },
      children: body,
    }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildDocx: build };
