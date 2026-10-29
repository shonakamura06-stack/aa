const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const path = require('path');
const FILE = path.join(__dirname, '..', 'index.html');
const HTML = fs.readFileSync(FILE, 'utf8');

function makeDom(opts) {
  opts = opts || {};
  const errors = [], warnings = [], infos = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const m = String((e && e.message) || e);
    if (/Not implemented/i.test(m)) return;               // scrollTo / canvas en jsdom
    if (/Could not parse CSS/i.test(m)) { warnings.push('css-parse'); return; } // CSSOM de jsdom es antiguo
    errors.push(m);
  });
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
  vc.on('warn', (...a) => warnings.push(a.map(String).join(' ')));
  vc.on('info', (...a) => infos.push(a.map(String).join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'https://juego.test/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (opts.blockStorage) {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
      } else if (opts.saved !== undefined && opts.saved !== null) {
        window.localStorage.setItem('etp:v1', opts.saved);
      }
      if (opts.fixedDate) {
        const Real = window.Date;
        const iso = opts.fixedDate;
        class FakeDate extends Real {
          constructor(...args) { if (args.length === 0) super(iso); else super(...args); }
          static now() { return new Real(iso).getTime(); }
        }
        window.Date = FakeDate;
      }
      window.matchMedia = (q) => ({
        matches: /prefers-reduced-motion/.test(q) ? opts.reduceMotion !== false : false,
        media: q, onchange: null,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
      });
    }
  });
  return { dom, window: dom.window, document: dom.window.document, errors, warnings, infos };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms === undefined ? 8 : ms));

async function bootDom(opts) {
  const d = makeDom(opts);
  for (let i = 0; i < 40 && !d.window.ETP; i++) await tick(5);
  await tick(25);
  return d;
}

function stored(window) { return window.localStorage.getItem('etp:v1'); }
function state(window) { return window.ETP.getState(); }
function visible(document, id) { const el = document.getElementById(id); return !!el && !el.hidden; }

async function clickStart(window, document, mode) {
  const btn = document.querySelector('[data-action="start"][data-mode="' + (mode || 'normal') + '"]');
  assert(btn, 'existe botón de inicio para ' + mode);
  btn.click();
  await tick(12);
}

async function answer(window, document, choice) {
  const opt = document.querySelector('#options [data-choice="' + (choice || 'a') + '"]');
  assert(opt, 'hay opción ' + choice + ' para elegir');
  opt.click();
  await tick(20);
  return document.querySelector('#consequence-area .consequence');
}

async function nextBtn(window, document) {
  const btn = document.querySelector('#next-btn');
  assert(btn, 'existe el botón de siguiente');
  btn.click();
  await tick(12);
  return btn;
}

async function playRun(window, document, total, picker) {
  const choose = picker || ((i) => (i % 2 === 0 ? 'a' : 'b'));
  for (let i = 0; i < total; i++) {
    await answer(window, document, choose(i));
    await nextBtn(window, document);
  }
}

module.exports = { HTML, FILE, makeDom, bootDom, tick, stored, state, visible, clickStart, answer, nextBtn, playRun, assert };
