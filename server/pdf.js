'use strict';
/*
 * PDF export: prints the exact same HTML the live preview shows, using one
 * shared headless Chrome. Pages run with JavaScript off and may only fetch
 * Google Fonts — user content is never used to reach other hosts.
 */
const CV = require('../shared/cv.js');

let browserPromise = null;
let active = 0;
const MAX_CONCURRENT = Number(process.env.PDF_CONCURRENCY || 2);
const queue = [];

function getBrowser() {
  if (!browserPromise) {
    const puppeteer = require('puppeteer');
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    }).then((b) => {
      b.on('disconnected', () => { browserPromise = null; });
      return b;
    }).catch((err) => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

async function withSlot(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((res) => queue.push(res));
  active++;
  try { return await fn(); } finally { active--; const next = queue.shift(); if (next) next(); }
}

const ALLOWED = /^(data:|https:\/\/fonts\.(googleapis|gstatic)\.com\/)/;

async function buildPdf(templateId, data, settings) {
  return withSlot(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => (ALLOWED.test(req.url()) || req.url() === 'about:blank' ? req.continue() : req.abort()));
      const html = CV.renderDocument(templateId, data, settings, { fonts: process.env.PDF_WEBFONTS !== '0' });
      // Fonts are best effort: if Google Fonts is unreachable we fall back to the CSS stack.
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
      await page.evaluateHandle('document.fonts.ready').catch(() => {});
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    } finally {
      await page.close().catch(() => {});
    }
  });
}

async function closeBrowser() {
  if (browserPromise) { const b = await browserPromise.catch(() => null); if (b) await b.close(); }
}

module.exports = { buildPdf, closeBrowser };
