/* =========================================================================
   Trazador — plano cartesiano interactivo para planear tiros
   Sin dependencias. Todo el dibujo es Canvas 2D.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------ utilidades ------------------------------ */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var TAU = Math.PI * 2;
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); }

  function fmt(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    var p = Math.pow(10, dec == null ? 2 : dec);
    var r = Math.round(v * p) / p;
    if (Object.is(r, -0)) r = 0;
    return String(r);
  }
  function signed(v, dec) { var s = fmt(v, dec == null ? 1 : dec); return (v > 0 ? '+' : '') + s; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function withAlpha(hex, a) {
    if (!hex || hex.charAt(0) !== '#') return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return hex;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function pointSegDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    return Math.sqrt(dist2(px, py, ax + dx * t, ay + dy * t));
  }

  /* -------------------------------- estado -------------------------------- */
  var CURVE_COLORS = ['#4ade80', '#38bdf8', '#c084fc', '#fbbf24', '#fb7185', '#2dd4bf'];
  var LS_KEY = 'trazador.escena.v3';

  function defaultState() {
    return {
      view: { cx: 0, cy: 0, scale: 7 },
      showGrid: true,
      snapOn: true,
      snap: 1,
      arena: { w: 160, h: 160, show: true },
      player: { x: -55, y: -25 },
      others: [
        { id: uid(), name: 'Rival A', x: 55, y: 15, color: '#38bdf8' },
        { id: uid(), name: 'Rival B', x: 10, y: 55, color: '#c084fc' }
      ],
      obstacles: [
        { id: uid(), type: 'tri', name: 'Bloque 1', x: -15, y: -40, w: 24, h: 20 },
        { id: uid(), type: 'tri', name: 'Bloque 2', x: 10, y: 25, w: 22, h: 18 },
        { id: uid(), type: 'tri', name: 'Bloque 3', x: 40, y: -15, w: 20, h: 16 },
        { id: uid(), type: 'circle', name: 'Roca', cx: -40, cy: 20, r: 8 }
      ],
      curves: [
        { id: uid(), expr: '0.3636*x - 5', params: {}, ranges: {}, dx: 0, dy: 0, visible: true, color: CURVE_COLORS[0] }
      ],
      activeId: null,
      shot: { dir: 1, speed: 45, range: 220 }
    };
  }

  var state = loadState() || defaultState();
  if (!state.curves.length) state.curves = defaultState().curves;
  if (!curveById(state.activeId)) state.activeId = state.curves[0].id;

  function activeCurve() {
    for (var i = 0; i < state.curves.length; i++) {
      if (state.curves[i].id === state.activeId) return state.curves[i];
    }
    return state.curves[0] || null;
  }

  function curveById(id) {
    for (var i = 0; i < state.curves.length; i++) if (state.curves[i].id === id) return state.curves[i];
    return null;
  }
  function otherById(id) {
    for (var i = 0; i < state.others.length; i++) if (state.others[i].id === id) return state.others[i];
    return null;
  }
  function obstacleById(id) {
    for (var i = 0; i < state.obstacles.length; i++) if (state.obstacles[i].id === id) return state.obstacles[i];
    return null;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.curves || !s.player) return null;
      s.view = s.view || { cx: 0, cy: 0, scale: 42 };
      s.shot = s.shot || { dir: 1, speed: 14, range: 60 };
      s.others = s.others || [];
      s.obstacles = s.obstacles || [];
      s.arena = s.arena || { w: 160, h: 160, show: true };
      if (typeof s.showGrid !== 'boolean') s.showGrid = true;
      if (typeof s.snapOn !== 'boolean') s.snapOn = true;
      if (typeof s.snap !== 'number') s.snap = 0.5;
      return s;
    } catch (e) { return null; }
  }

  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* sin espacio */ }
    }, 250);
  }

  /* ------------------------------- lienzo --------------------------------- */
  var canvas = $('#board');
  var ctx = canvas.getContext('2d');
  var stage = $('#stage');
  var W = 800, H = 600, DPR = 1;
  var view = state.view;

  function resize() {
    var r = stage.getBoundingClientRect();
    W = Math.max(240, Math.round(r.width));
    H = Math.max(200, Math.round(r.height));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    needsDraw = true;
  }

  function X(x) { return W / 2 + (x - view.cx) * view.scale; }
  function Y(y) { return H / 2 - (y - view.cy) * view.scale; }
  function WX(px) { return view.cx + (px - W / 2) / view.scale; }
  function WY(py) { return view.cy - (py - H / 2) / view.scale; }

  function snapVal(v) {
    if (!state.snapOn) return Math.round(v * 100) / 100;
    return Math.round(v / state.snap) * state.snap;
  }

  /* ------------------------------ ecuaciones ------------------------------ */
  function defaultParam(name) {
    return ['b', 'c', 'd', 'h', 'k'].indexOf(String(name).toLowerCase()) >= 0 ? 0 : 1;
  }

  function autoRange(v) {
    if (!isFinite(v) || v === 0) return [-5, 5, 0.1];
    var mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
    var lo = +(v - 2 * mag).toFixed(6);
    var hi = +(v + 2 * mag).toFixed(6);
    return [lo, hi, Math.max(mag / 100, 1e-6)];
  }

  function compileCurve(c) {
    if (!c) return;
    var src = String(c.expr || '').trim().replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, '');

    if (c._src !== src || !c._compiled) {
      c._src = src;
      if (!src) {
        c._error = 'Escribe una ecuación';
        c._compiled = null;
        c._paramNames = [];
      } else {
        try {
          var r = MathEval.compile(src);
          c._compiled = r.fn;
          c._paramNames = r.params;
          c._error = null;
        } catch (e) {
          c._error = e.message || 'Expresión no válida';
          if (!c._compiled) { c._paramNames = c._paramNames || []; }
        }
      }
    }

    // sincronizar parámetros y sus rangos con los nombres presentes
    var params = {}, ranges = {};
    (c._paramNames || []).forEach(function (n) {
      var v = (c.params && typeof c.params[n] === 'number' && isFinite(c.params[n]))
        ? c.params[n] : defaultParam(n);
      params[n] = v;
      var r = c.ranges && c.ranges[n];
      if (!Array.isArray(r) || !isFinite(r[0]) || !isFinite(r[1])) {
        r = autoRange(v);
      } else if (v < r[0] || v > r[1]) {
        r = [Math.min(r[0], v), Math.max(r[1], v), r[2] || (r[1] - r[0]) / 200];
      }
      ranges[n] = r;
    });
    c.params = params;
    c.ranges = ranges;
  }

  function evalCurve(c, x) {
    if (!c || !c._compiled) return NaN;
    var v = c._compiled(x - c.dx, c.params);
    return typeof v === 'number' ? v : NaN;
  }

  state.curves.forEach(compileCurve);

  /* --------------------------- geometría / choques ------------------------- */
  function segRectT(a, b, ob) {
    var minx = Math.min(ob.x, ob.x + ob.w), maxx = Math.max(ob.x, ob.x + ob.w);
    var miny = Math.min(ob.y, ob.y + ob.h), maxy = Math.max(ob.y, ob.y + ob.h);
    var dx = b.x - a.x, dy = b.y - a.y;
    var t0 = 0, t1 = 1;

    function clip(p, q) {
      if (p === 0) return q >= 0;
      var t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    }

    if (!clip(-dx, a.x - minx)) return null;
    if (!clip(dx, maxx - a.x)) return null;
    if (!clip(-dy, a.y - miny)) return null;
    if (!clip(dy, maxy - a.y)) return null;
    return t0 <= t1 ? t0 : null;
  }

  function segCircleT(a, b, ob) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var fx = a.x - ob.cx, fy = a.y - ob.cy;
    var A = dx * dx + dy * dy;
    var B = 2 * (fx * dx + fy * dy);
    var Cc = fx * fx + fy * fy - ob.r * ob.r;
    if (A < 1e-12) return Cc <= 0 ? 0 : null;
    var disc = B * B - 4 * A * Cc;
    if (disc < 0) return null;
    var sq = Math.sqrt(disc);
    var t1 = (-B - sq) / (2 * A);
    var t2 = (-B + sq) / (2 * A);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    if (t1 < 0 && t2 > 1) return 0;
    return null;
  }

  // triángulo isósceles inscrito en su caja (ápice arriba)
  function triPoints(ob) {
    var minx = Math.min(ob.x, ob.x + ob.w), maxx = Math.max(ob.x, ob.x + ob.w);
    var miny = Math.min(ob.y, ob.y + ob.h), maxy = Math.max(ob.y, ob.y + ob.h);
    return [
      { x: (minx + maxx) / 2, y: maxy },
      { x: maxx, y: miny },
      { x: minx, y: miny }
    ];
  }

  function side(px, py, ax, ay, bx, by) {
    return (px - bx) * (ay - by) - (ax - bx) * (py - by);
  }

  function pointInTri(x, y, ob) {
    var p = triPoints(ob);
    var d1 = side(x, y, p[0].x, p[0].y, p[1].x, p[1].y);
    var d2 = side(x, y, p[1].x, p[1].y, p[2].x, p[2].y);
    var d3 = side(x, y, p[2].x, p[2].y, p[0].x, p[0].y);
    var neg = d1 < 0 || d2 < 0 || d3 < 0;
    var pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  }

  function segSegT(a, b, c, d) {
    var rx = b.x - a.x, ry = b.y - a.y;
    var sx = d.x - c.x, sy = d.y - c.y;
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    var t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
    var u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? t : null;
  }

  function segTriT(a, b, ob) {
    if (pointInTri(a.x, a.y, ob)) return 0;
    var p = triPoints(ob);
    var best = null;
    for (var i = 0; i < 3; i++) {
      var t = segSegT(a, b, p[i], p[(i + 1) % 3]);
      if (t != null && (best === null || t < best)) best = t;
    }
    return best;
  }

  function segObstacleT(a, b, ob) {
    if (ob.type === 'rect') return segRectT(a, b, ob);
    if (ob.type === 'tri') return segTriT(a, b, ob);
    return segCircleT(a, b, ob);
  }

  function pointInObstacle(x, y, ob) {
    if (ob.type === 'tri') return pointInTri(x, y, ob);
    if (ob.type === 'rect') {
      var minx = Math.min(ob.x, ob.x + ob.w), maxx = Math.max(ob.x, ob.x + ob.w);
      var miny = Math.min(ob.y, ob.y + ob.h), maxy = Math.max(ob.y, ob.y + ob.h);
      return x >= minx && x <= maxx && y >= miny && y <= maxy;
    }
    return dist2(x, y, ob.cx, ob.cy) <= ob.r * ob.r;
  }

  function obstacleUnder(x, y) {
    for (var i = state.obstacles.length - 1; i >= 0; i--) {
      if (pointInObstacle(x, y, state.obstacles[i])) return state.obstacles[i];
    }
    return null;
  }

  function obstacleBounds(ob) {
    if (ob.type === 'rect' || ob.type === 'tri') {
      return {
        minx: Math.min(ob.x, ob.x + ob.w), maxx: Math.max(ob.x, ob.x + ob.w),
        miny: Math.min(ob.y, ob.y + ob.h), maxy: Math.max(ob.y, ob.y + ob.h),
        cx: ob.x + ob.w / 2, cy: ob.y + ob.h / 2
      };
    }
    return { minx: ob.cx - ob.r, maxx: ob.cx + ob.r, miny: ob.cy - ob.r, maxy: ob.cy + ob.r, cx: ob.cx, cy: ob.cy };
  }

  /* ------------------------------ trayectoria ----------------------------- */
  var activeTraj = null;

  function buildTrajectory(c) {
    if (!c || !c._compiled) return null;
    var p = state.player;
    var dir = state.shot.dir || 1;
    var range = state.shot.range || 60;
    var N = 700;
    var x0 = p.x, x1 = p.x + dir * range;
    var samples = [];
    var total = 0, prev = null, broken = true;
    var maxJump = Math.max(20, range / 3);   // saltos mayores = discontinuidad (asíntota)

    for (var i = 0; i <= N; i++) {
      var x = x0 + (x1 - x0) * (i / N);
      var y = evalCurve(c, x);
      if (!isFinite(y) || Math.abs(y) > 1e7) { prev = null; broken = true; continue; }
      if (prev) {
        var d = Math.hypot(x - prev.x, y - prev.y);
        if (d > maxJump) { prev = null; broken = true; }
        else { total += d; }
      }
      samples.push({ x: x, y: y, d: total, gap: broken && samples.length > 0 });
      broken = false;
      prev = samples[samples.length - 1];
    }

    if (samples.length < 2) return { samples: samples, hit: null, length: total };

    var hit = null;
    for (var k = 1; k < samples.length && !hit; k++) {
      var a = samples[k - 1], b = samples[k];
      if (b.gap) continue; // no cruzar la discontinuidad
      for (var j = 0; j < state.obstacles.length; j++) {
        var t = segObstacleT(a, b, state.obstacles[j]);
        if (t != null) {
          hit = {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            dist: a.d + (b.d - a.d) * t,
            index: k,
            ob: state.obstacles[j]
          };
          break;
        }
      }
    }

    return { samples: samples, hit: hit, length: total };
  }

  function nearestRivalOnPath(tr) {
    if (!tr || !tr.samples.length || !state.others.length) return null;
    var limit = Math.min(tr.hit ? tr.hit.index : tr.samples.length, tr.samples.length);
    var best = null;
    for (var j = 0; j < state.others.length; j++) {
      var o = state.others[j];
      for (var i = 0; i < limit; i++) {
        var s = tr.samples[i];
        var d = Math.hypot(s.x - o.x, s.y - o.y);
        if (!best || d < best.d) best = { o: o, d: d };
      }
    }
    return best;
  }

  /* -------------------------------- dibujo -------------------------------- */
  var needsDraw = true;

  function drawGrid() {
    var major = niceStep(view.scale, 108);
    var minor = major / 5;
    var showMinor = minor * view.scale >= 9;
    var left = WX(0), right = WX(W), bottom = WY(H), top = WY(0);
    var i, v, px, py;

    if (showMinor) {
      ctx.beginPath();
      for (i = Math.ceil(left / minor); i * minor <= right; i++) {
        px = Math.round(X(i * minor)) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, H);
      }
      for (i = Math.ceil(bottom / minor); i * minor <= top; i++) {
        py = Math.round(Y(i * minor)) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(W, py);
      }
      ctx.strokeStyle = 'rgba(120,165,210,.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    for (i = Math.ceil(left / major); i * major <= right; i++) {
      px = Math.round(X(i * major)) + 0.5;
      ctx.moveTo(px, 0); ctx.lineTo(px, H);
    }
    for (i = Math.ceil(bottom / major); i * major <= top; i++) {
      py = Math.round(Y(i * major)) + 0.5;
      ctx.moveTo(0, py); ctx.lineTo(W, py);
    }
    ctx.strokeStyle = 'rgba(120,165,210,.14)';
    ctx.stroke();

    // ejes
    var ax = Math.round(X(0)) + 0.5, ay = Math.round(Y(0)) + 0.5;
    var axisVisibleX = ax > -1 && ax < W + 1;
    var axisVisibleY = ay > -1 && ay < H + 1;

    ctx.strokeStyle = 'rgba(150,200,240,.42)';
    ctx.lineWidth = 1.4;
    if (axisVisibleY) { ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(W, ay); ctx.stroke(); }
    if (axisVisibleX) { ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, H); ctx.stroke(); }

    // etiquetas
    ctx.font = '11px ' + MONO;
    ctx.fillStyle = 'rgba(170,205,235,.62)';

    var labelY = clamp(ay + 11, 3, H - 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = Math.ceil(left / major); i * major <= right; i++) {
      if (i === 0) continue;
      v = i * major;
      px = X(v);
      if (px < 20 || px > W - 20) continue;
      ctx.fillText(fmt(v, major < 1 ? 2 : 0), px, labelY);
    }

    var labelX = clamp(ax, 34, W - 6);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (i = Math.ceil(bottom / major); i * major <= top; i++) {
      if (i === 0) continue;
      v = i * major;
      py = Y(v);
      if (py < 12 || py > H - 8) continue;
      ctx.fillText(fmt(v, major < 1 ? 2 : 0), labelX - 6, py);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (axisVisibleY && axisVisibleX) ctx.fillText('0', ax + 5, ay + 5);
  }

  function niceStep(scale, targetPx) {
    var raw = targetPx / scale;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / p;
    var m = n >= 5 ? 5 : n >= 2 ? 2 : 1;
    return m * p;
  }

  function drawRange() {
    var r = state.shot.range * view.scale;
    if (!isFinite(r) || r < 20 || r > Math.max(W, H) * 4) return;
    var px = X(state.player.x), py = Y(state.player.y);
    ctx.save();
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = 'rgba(74,222,128,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawArena() {
    var a = state.arena;
    if (!a || !a.show) return;
    var x0 = X(-a.w / 2), x1 = X(a.w / 2);
    var y0 = Y(a.h / 2), y1 = Y(-a.h / 2);
    if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) return;

    ctx.save();
    ctx.fillStyle = 'rgba(56,189,248,.028)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(56,189,248,.34)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    ctx.restore();

    ctx.save();
    ctx.font = '600 10px ' + MONO;
    ctx.fillStyle = 'rgba(125,200,240,.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ARENA ' + fmt(a.w, 0) + ' × ' + fmt(a.h, 0), x0 + 4, y0 - 4);
    ctx.restore();
  }

  var stripes = null;
  function stripePattern() {
    if (stripes) return stripes;
    var c = document.createElement('canvas');
    c.width = 12; c.height = 12;
    var g = c.getContext('2d');
    g.strokeStyle = 'rgba(249,115,22,.30)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-3, 15); g.lineTo(15, -3);
    g.moveTo(-3, 3); g.lineTo(3, -3);
    g.moveTo(9, 15); g.lineTo(15, 9);
    g.stroke();
    stripes = ctx.createPattern(c, 'repeat');
    return stripes;
  }

  function drawObstacles() {
    for (var i = 0; i < state.obstacles.length; i++) {
      var ob = state.obstacles[i];
      var sel = selection && selection.type === 'obstacle' && selection.id === ob.id;
      var hov = hover && hover.type === 'obstacle' && hover.id === ob.id;

      ctx.save();
      if (ob.type === 'rect') {
        var x = X(ob.x), y = Y(ob.y + ob.h);
        var w = ob.w * view.scale, h = ob.h * view.scale;
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        roundRectPath(ctx, x, y, w, h, Math.min(6, w / 4, h / 4));
      } else if (ob.type === 'tri') {
        var tp = triPoints(ob);
        ctx.beginPath();
        ctx.moveTo(X(tp[0].x), Y(tp[0].y));
        ctx.lineTo(X(tp[1].x), Y(tp[1].y));
        ctx.lineTo(X(tp[2].x), Y(tp[2].y));
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.arc(X(ob.cx), Y(ob.cy), ob.r * view.scale, 0, TAU);
      }
      ctx.fillStyle = 'rgba(249,115,22,.13)';
      ctx.fill();
      ctx.fillStyle = stripePattern();
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = sel ? '#fdba74' : hov ? 'rgba(251,146,60,.8)' : 'rgba(249,115,22,.55)';
      ctx.lineWidth = sel ? 2 : 1.4;
      if (sel) ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();

      if (sel) drawHandles(ob);
    }
  }

  function drawHandles(ob) {
    var pts = handlePoints(ob);
    ctx.save();
    for (var i = 0; i < pts.length; i++) {
      roundRectPath(ctx, pts[i].x - 5, pts[i].y - 5, 10, 10, 3);
      ctx.fillStyle = '#fdba74';
      ctx.fill();
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function handlePoints(ob) {
    if (ob.type === 'rect' || ob.type === 'tri') {
      return [
        { x: X(ob.x), y: Y(ob.y) },
        { x: X(ob.x + ob.w), y: Y(ob.y) },
        { x: X(ob.x), y: Y(ob.y + ob.h) },
        { x: X(ob.x + ob.w), y: Y(ob.y + ob.h) }
      ];
    }
    return [{ x: X(ob.cx + ob.r), y: Y(ob.cy) }];
  }

  function sampleScreen(c) {
    var polys = [], cur = [];
    for (var px = -2; px <= W + 2; px += 1) {
      var y = evalCurve(c, WX(px));
      if (!isFinite(y) || Math.abs(y) > 1e6) {
        if (cur.length > 1) polys.push(cur);
        cur = [];
        continue;
      }
      var py = Y(y);
      if (py < -3000 || py > H + 3000) {
        if (cur.length > 1) polys.push(cur);
        cur = [];
        continue;
      }
      if (cur.length) {
        var last = cur[cur.length - 1];
        if (Math.abs(py - last.y) > H * 2 + 300) {
          if (cur.length > 1) polys.push(cur);
          cur = [];
        }
      }
      cur.push({ x: px, y: py });
    }
    if (cur.length > 1) polys.push(cur);
    return polys;
  }

  function drawCurves() {
    for (var i = 0; i < state.curves.length; i++) {
      var c = state.curves[i];
      if (!c.visible || !c._compiled) { c._screen = []; continue; }
      var polys = sampleScreen(c);
      c._screen = polys;
      var active = c.id === state.activeId;

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (active) {
        ctx.shadowColor = withAlpha(c.color, .5);
        ctx.shadowBlur = 10;
      }
      ctx.strokeStyle = active ? c.color : withAlpha(c.color, .42);
      ctx.lineWidth = active ? 2.4 : 1.5;
      ctx.beginPath();
      for (var p = 0; p < polys.length; p++) {
        var poly = polys[p];
        ctx.moveTo(poly[0].x, poly[0].y);
        for (var k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTrajectory() {
    var c = activeCurve();
    var tr = activeTraj;
    if (!tr || !tr.samples.length || !c || !c.visible) return;

    var limit = tr.hit ? tr.hit.index : tr.samples.length;

    ctx.save();
    ctx.strokeStyle = withAlpha(c.color, .95);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = withAlpha(c.color, .35);
    ctx.shadowBlur = 14;
    ctx.beginPath();
    var prev = null;
    for (var i = 0; i < limit && i < tr.samples.length; i++) {
      var s = tr.samples[i];
      var px = X(s.x), py = Y(s.y);
      if (!prev || s.gap) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      prev = s;
    }
    if (tr.hit) ctx.lineTo(X(tr.hit.x), Y(tr.hit.y));
    ctx.stroke();
    ctx.restore();
  }

  function drawStartConnector() {
    var tr = activeTraj;
    if (!tr || !tr.samples.length) return;
    var p = state.player, s0 = tr.samples[0];
    var dist = Math.hypot(s0.x - p.x, s0.y - p.y);
    if (dist < 0.15) return;
    var ax = X(p.x), ay = Y(p.y), bx = X(s0.x), by = Y(s0.y);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(251,191,36,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
    label(ax, ay + 16, 'la curva no pasa por ti · ' + fmt(dist, 1) + ' u', '#fbbf24');
  }

  function drawImpact() {
    var hit = activeTraj && activeTraj.hit;
    if (!hit) return;
    var px = X(hit.x), py = Y(hit.y);
    if (px < -60 || px > W + 60 || py < -60 || py > H + 60) return;

    ctx.save();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - 7, py - 7); ctx.lineTo(px + 7, py + 7);
    ctx.moveTo(px + 7, py - 7); ctx.lineTo(px - 7, py + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, TAU);
    ctx.strokeStyle = 'rgba(251,113,133,.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    label(px, py - 27, 'CHOQUE · ' + fmt(hit.dist, 1) + ' u', '#fb7185');
  }

  function label(x, y, text, color, above) {
    if (x < -120 || x > W + 120) return;
    ctx.save();
    ctx.font = '600 11px ' + MONO;
    var w = ctx.measureText(text).width + 14;
    var h = 18;
    var lx = clamp(x - w / 2, 4, Math.max(4, W - w - 4));
    var ly = (above === false ? y + 12 : y);
    ly = clamp(ly, 2, H - h - 2);

    roundRectPath(ctx, lx, ly, w, h, 6);
    ctx.fillStyle = 'rgba(7,12,18,.86)';
    ctx.fill();
    ctx.strokeStyle = withAlpha(color, .45);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + 7, ly + h / 2 + 0.5);
    ctx.restore();
  }

  function drawMarkers() {
    var p = state.player;
    var px = X(p.x), py = Y(p.y);

    // rivales
    for (var i = 0; i < state.others.length; i++) {
      var o = state.others[i];
      var ox = X(o.x), oy = Y(o.y);
      var sel = selection && selection.type === 'other' && selection.id === o.id;
      var hov = hover && hover.type === 'other' && hover.id === o.id;
      var size = sel || hov ? 9 : 7.5;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(Math.PI / 4);
      roundRectPath(ctx, -size, -size, size * 2, size * 2, 2);
      ctx.fillStyle = withAlpha(o.color, .85);
      ctx.fill();
      ctx.strokeStyle = '#05090d';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      if (sel) {
        ctx.beginPath();
        ctx.arc(ox, oy, 14, 0, TAU);
        ctx.strokeStyle = withAlpha(o.color, .5);
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      label(ox, oy - 26, o.name + ' (' + fmt(o.x, 1) + ', ' + fmt(o.y, 1) + ')', o.color);
    }

    // jugador
    var pSel = selection && selection.type === 'player';
    var insideOb = null;
    state.obstacles.forEach(function (ob) { if (pointInObstacle(p.x, p.y, ob)) insideOb = ob; });
    if (insideOb) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(251,113,133,.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pSel ? 15 : 12, 0, TAU);
    ctx.fillStyle = 'rgba(74,222,128,.13)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, TAU);
    ctx.fillStyle = '#4ade80';
    ctx.fill();
    ctx.strokeStyle = '#04140a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // dirección del disparo
    var dir = state.shot.dir >= 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(px + dir * 10, py);
    ctx.lineTo(px + dir * 17, py);
    ctx.lineTo(px + dir * 13, py - 4);
    ctx.moveTo(px + dir * 17, py);
    ctx.lineTo(px + dir * 13, py + 4);
    ctx.strokeStyle = 'rgba(74,222,128,.85)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    label(px, py - 26, 'Tú (' + fmt(p.x, 1) + ', ' + fmt(p.y, 1) + ')' + (insideOb ? ' ⚠ dentro' : ''), insideOb ? '#fb7185' : '#4ade80');
  }

  /* ------------------------------- bala ----------------------------------- */
  var bullet = { active: false, done: false, dist: 0, index: 0, hit: null, path: [], pos: null };

  function shoot() {
    var c = activeCurve();
    if (!c || !c._compiled || c._error) { toast('Revisa la ecuación antes de disparar'); return; }
    refresh();
    var tr = activeTraj;
    if (!tr || tr.samples.length < 2) { toast('La trayectoria no es válida'); return; }

    var path = tr.samples.slice(0, tr.hit ? tr.hit.index + 1 : tr.samples.length);
    if (tr.hit) {
      var last = path[path.length - 1];
      path[path.length - 1] = { x: tr.hit.x, y: tr.hit.y, d: tr.hit.dist };
      if (!last) path.push({ x: tr.hit.x, y: tr.hit.y, d: tr.hit.dist });
    }
    bullet.active = true;
    bullet.done = false;
    bullet.hit = tr.hit;
    bullet.path = path;
    bullet.dist = 0;
    bullet.index = 0;
    bullet.pos = path[0];
    needsDraw = true;
  }

  function stepBullet(dt) {
    if (!bullet.active) return;
    var path = bullet.path;
    bullet.dist += state.shot.speed * dt;
    while (bullet.index < path.length - 1 && path[bullet.index + 1].d <= bullet.dist) bullet.index++;
    var a = path[bullet.index];
    var b = path[Math.min(bullet.index + 1, path.length - 1)];
    var span = b.d - a.d;
    var t = span > 1e-9 ? clamp((bullet.dist - a.d) / span, 0, 1) : 1;
    bullet.pos = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };

    if (bullet.dist >= path[path.length - 1].d) {
      bullet.active = false;
      bullet.done = true;
      bullet.pos = path[path.length - 1];
      if (bullet.hit) {
        toast('Impacto en (' + fmt(bullet.hit.x, 1) + ', ' + fmt(bullet.hit.y, 1) + ') · ' + fmt(bullet.hit.dist, 1) + ' u');
      } else {
        toast('Recorrido completo · ' + fmt(path[path.length - 1].d, 1) + ' u');
      }
    }
    needsDraw = true;
  }

  function drawBullet() {
    if (!bullet.path.length) return;
    var upTo = bullet.index;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    var first = true;
    for (var i = 0; i <= upTo; i++) {
      var p = bullet.path[i];
      var px = X(p.x), py = Y(p.y);
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    if (bullet.pos) ctx.lineTo(X(bullet.pos.x), Y(bullet.pos.y));
    ctx.strokeStyle = 'rgba(254,240,138,.85)';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = 'rgba(254,240,138,.8)';
    ctx.shadowBlur = 12;
    ctx.stroke();

    if (bullet.pos) {
      var bx = X(bullet.pos.x), by = Y(bullet.pos.y);
      ctx.beginPath();
      ctx.arc(bx, by, 5.5, 0, TAU);
      ctx.fillStyle = '#fef08a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 11, 0, TAU);
      ctx.strokeStyle = 'rgba(254,240,138,.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ts) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.showGrid) drawGrid();
    drawRange();
    drawArena();
    drawObstacles();
    drawCurves();
    drawTrajectory();
    drawStartConnector();
    drawImpact();
    drawMarkers();
    drawBullet();
    drawSelectionRing();
  }

  function drawSelectionRing() {
    if (!selection || selection.type !== 'curve') return;
    var c = curveById(selection.id);
    if (!c || !c._screen) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < c._screen.length; i++) {
      var poly = c._screen[i];
      if (!poly.length) continue;
      ctx.moveTo(poly[0].x, poly[0].y);
      for (var k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------ interacción ----------------------------- */
  var selection = null;
  var hover = null;
  var drag = null;
  var pointer = { x: -100, y: -100 };
  var placeMode = null;

  function localPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function selectedObstacle() {
    return selection && selection.type === 'obstacle' ? obstacleById(selection.id) : null;
  }

  function handleAt(px, py) {
    var ob = selectedObstacle();
    if (!ob) return -1;
    var pts = handlePoints(ob);
    for (var i = 0; i < pts.length; i++) {
      if (dist2(px, py, pts[i].x, pts[i].y) <= 144) return i;
    }
    return -1;
  }

  function markerAt(px, py) {
    if (dist2(px, py, X(state.player.x), Y(state.player.y)) <= 220) return { type: 'player' };
    for (var i = 0; i < state.others.length; i++) {
      var o = state.others[i];
      if (dist2(px, py, X(o.x), Y(o.y)) <= 200) return { type: 'other', id: o.id };
    }
    return null;
  }

  function obstacleAtScreen(px, py) {
    var w = { x: WX(px), y: WY(py) };
    return obstacleUnder(w.x, w.y);
  }

  function curveAt(px, py) {
    var best = null, bestD = 11;
    for (var i = state.curves.length - 1; i >= 0; i--) {
      var c = state.curves[i];
      if (!c.visible || !c._screen) continue;
      for (var p = 0; p < c._screen.length; p++) {
        var poly = c._screen[p];
        for (var k = 1; k < poly.length; k++) {
          var d = pointSegDist(px, py, poly[k - 1].x, poly[k - 1].y, poly[k].x, poly[k].y);
          if (d < bestD) { bestD = d; best = c; }
        }
      }
    }
    return best;
  }

  function onPointerDown(e) {
    if (e.button === 2) return;
    var pt = localPoint(e);
    pointer.x = pt.x; pointer.y = pt.y;

    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }

    if (placeMode) {
      placeAt(placeMode, snapVal(WX(pt.x)), snapVal(WY(pt.y)));
      setPlaceMode(null);
      return;
    }

    // 1. tiradores del obstáculo seleccionado
    var hi = handleAt(pt.x, pt.y);
    if (hi >= 0) {
      var ob = selectedObstacle();
      var fixed;
      if (ob.type === 'rect' || ob.type === 'tri') {
        var fx = hi === 0 || hi === 2 ? ob.x + ob.w : ob.x;
        var fy = hi === 0 || hi === 1 ? ob.y + ob.h : ob.y;
        fixed = { x: fx, y: fy };
      } else {
        fixed = { x: ob.cx, y: ob.cy };
      }
      drag = { type: 'resize', id: ob.id, handle: hi, fixed: fixed };
      return;
    }

    // 2. marcadores
    var mk = markerAt(pt.x, pt.y);
    if (mk) {
      selection = mk.type === 'player' ? { type: 'player' } : { type: 'other', id: mk.id };
      var obj = mk.type === 'player' ? state.player : otherById(mk.id);
      drag = {
        type: mk.type === 'player' ? 'player' : 'other',
        id: mk.id,
        off: { x: obj.x - WX(pt.x), y: obj.y - WY(pt.y) }
      };
      renderLists();
      needsDraw = true;
      return;
    }

    // 3. obstáculos
    var hitOb = obstacleAtScreen(pt.x, pt.y);
    if (hitOb) {
      selection = { type: 'obstacle', id: hitOb.id };
      drag = {
        type: 'obstacle',
        id: hitOb.id,
        start: { x: WX(pt.x), y: WY(pt.y) },
        orig: hitOb.type === 'rect' ? { x: hitOb.x, y: hitOb.y } : { cx: hitOb.cx, cy: hitOb.cy }
      };
      renderLists();
      needsDraw = true;
      return;
    }

    // 4. curvas
    var c = curveAt(pt.x, pt.y);
    if (c) {
      if (c.id !== state.activeId) setActive(c.id);
      selection = { type: 'curve', id: c.id };
      drag = {
        type: 'curve',
        id: c.id,
        start: { x: WX(pt.x), y: WY(pt.y) },
        orig: { dx: c.dx, dy: c.dy }
      };
      needsDraw = true;
      return;
    }

    // 5. fondo → mover vista
    selection = null;
    renderLists();
    drag = { type: 'pan', sx: pt.x, sy: pt.y, cx: view.cx, cy: view.cy };
    canvas.style.cursor = 'grabbing';
    needsDraw = true;
  }

  function onPointerMove(e) {
    var pt = localPoint(e);
    pointer.x = pt.x; pointer.y = pt.y;
    updateCursorReadout();

    if (!drag) {
      updateHover(pt);
      return;
    }

    var wx = WX(pt.x), wy = WY(pt.y);

    if (drag.type === 'pan') {
      view.cx = drag.cx - (pt.x - drag.sx) / view.scale;
      view.cy = drag.cy + (pt.y - drag.sy) / view.scale;
      needsDraw = true;
      updateHud();
      return;
    }

    if (drag.type === 'curve') {
      var c = curveById(drag.id);
      if (!c) return;
      c.dx = drag.orig.dx + (wx - drag.start.x);
      c.dy = drag.orig.dy + (wy - drag.start.y);
      refresh();
      return;
    }

    if (drag.type === 'player') {
      state.player.x = snapVal(wx + drag.off.x);
      state.player.y = snapVal(wy + drag.off.y);
      refresh();
      return;
    }

    if (drag.type === 'other') {
      var o = otherById(drag.id);
      if (!o) return;
      o.x = snapVal(wx + drag.off.x);
      o.y = snapVal(wy + drag.off.y);
      refresh();
      return;
    }

    if (drag.type === 'obstacle') {
      var ob = obstacleById(drag.id);
      if (!ob) return;
      if (ob.type === 'rect') {
        ob.x = snapVal(drag.orig.x + (wx - drag.start.x));
        ob.y = snapVal(drag.orig.y + (wy - drag.start.y));
      } else {
        ob.cx = snapVal(drag.orig.cx + (wx - drag.start.x));
        ob.cy = snapVal(drag.orig.cy + (wy - drag.start.y));
      }
      refresh();
      return;
    }

    if (drag.type === 'resize') {
      var r = obstacleById(drag.id);
      if (!r) return;
      if (r.type === 'rect' || r.type === 'tri') {
        var x = snapVal(wx), y = snapVal(wy);
        r.x = Math.min(drag.fixed.x, x);
        r.y = Math.min(drag.fixed.y, y);
        r.w = Math.max(0.25, Math.abs(x - drag.fixed.x));
        r.h = Math.max(0.25, Math.abs(y - drag.fixed.y));
      } else {
        r.r = Math.max(0.2, Math.hypot(wx - drag.fixed.x, wy - drag.fixed.y));
      }
      refresh();
      return;
    }
  }

  function onPointerUp() {
    if (drag && drag.type === 'pan') canvas.style.cursor = 'crosshair';
    drag = null;
    save();
  }

  function updateHover(pt) {
    var prev = hover;
    hover = null;
    var mk = markerAt(pt.x, pt.y);
    if (mk) hover = mk;
    else {
      var ob = obstacleAtScreen(pt.x, pt.y);
      if (ob) hover = { type: 'obstacle', id: ob.id };
      else if (handleAt(pt.x, pt.y) >= 0) hover = { type: 'handle' };
      else {
        var c = curveAt(pt.x, pt.y);
        if (c) hover = { type: 'curve', id: c.id };
      }
    }

    var cursor = 'crosshair';
    if (hover) {
      if (hover.type === 'handle') cursor = 'nwse-resize';
      else cursor = 'grab';
    }
    canvas.style.cursor = cursor;

    var changed = JSON.stringify(prev) !== JSON.stringify(hover);
    if (changed) needsDraw = true;
  }

  function onWheel(e) {
    e.preventDefault();
    var pt = localPoint(e);
    var bx = WX(pt.x), by = WY(pt.y);
    var k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    view.scale = clamp(view.scale * k, 3, 500);
    view.cx = bx - (pt.x - W / 2) / view.scale;
    view.cy = by + (pt.y - H / 2) / view.scale;
    needsDraw = true;
    updateHud();
    save();
  }

  /* -------------------------------- colocar ------------------------------- */
  function placeAt(kind, x, y) {
    if (kind === 'player') {
      state.player.x = x; state.player.y = y;
      selection = { type: 'player' };
    } else if (kind === 'rival') {
      var colors = ['#38bdf8', '#c084fc', '#fbbf24', '#fb7185', '#2dd4bf'];
      var o = {
        id: uid(), name: 'Rival ' + (state.others.length + 1),
        x: x, y: y, color: colors[state.others.length % colors.length]
      };
      state.others.push(o);
      selection = { type: 'other', id: o.id };
      renderLists();
    } else if (kind === 'rect') {
      var ob = {
        id: uid(), type: 'rect', name: 'Muro ' + (countObstacles('rect') + 1),
        x: Math.round((x - 2) * 2) / 2, y: Math.round((y - 1.5) * 2) / 2, w: 4, h: 3
      };
      state.obstacles.push(ob);
      selection = { type: 'obstacle', id: ob.id };
      renderLists();
    } else if (kind === 'tri') {
      var ot = {
        id: uid(), type: 'tri', name: 'Bloque ' + (countObstacles('tri') + 1),
        x: Math.round(x - 9), y: Math.round(y - 7), w: 18, h: 14
      };
      state.obstacles.push(ot);
      selection = { type: 'obstacle', id: ot.id };
      renderLists();
    } else if (kind === 'circle') {
      var oc = {
        id: uid(), type: 'circle', name: 'Roca ' + (countObstacles('circle') + 1),
        cx: x, cy: y, r: 1.5
      };
      state.obstacles.push(oc);
      selection = { type: 'obstacle', id: oc.id };
      renderLists();
    }
    refresh();
  }

  function countObstacles(type) {
    var n = 0;
    state.obstacles.forEach(function (o) { if (o.type === type) n++; });
    return n;
  }

  function setPlaceMode(mode) {
    placeMode = mode;
    $$('#toolbar .tb[data-tool]').forEach(function (b) {
      b.classList.toggle('active', (b.dataset.tool === 'select' && !mode) || b.dataset.tool === mode);
    });
    var hint = $('#placeHint');
    if (!mode) { hint.hidden = true; return; }
    var txt = {
      player: 'Haz clic en el mapa para poner tu punto',
      rival: 'Haz clic para colocar un rival',
      rect: 'Haz clic para colocar un muro',
      tri: 'Haz clic para colocar un bloque triangular',
      circle: 'Haz clic para colocar una roca'
    }[mode];
    hint.textContent = txt || '';
    hint.hidden = false;
  }

  /* ------------------------------ vista / zoom ---------------------------- */
  function zoomBy(k, px, py) {
    px = px == null ? W / 2 : px;
    py = py == null ? H / 2 : py;
    var bx = WX(px), by = WY(py);
    view.scale = clamp(view.scale * k, 3, 500);
    view.cx = bx - (px - W / 2) / view.scale;
    view.cy = by + (py - H / 2) / view.scale;
    needsDraw = true;
    updateHud();
    save();
  }

  function fitArena() {
    var a = state.arena || { w: 160, h: 160 };
    var s = Math.min(W / (a.w * 1.12), H / (a.h * 1.12));
    view.scale = clamp(s, 2, 240);
    view.cx = 0;
    view.cy = 0;
    needsDraw = true;
    updateHud();
    save();
  }

  function fitView() {
    var pts = [{ x: state.player.x, y: state.player.y }];
    state.others.forEach(function (o) { pts.push({ x: o.x, y: o.y }); });
    state.obstacles.forEach(function (o) {
      var b = obstacleBounds(o);
      pts.push({ x: b.minx, y: b.miny }, { x: b.maxx, y: b.maxy });
    });

    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    pts.forEach(function (p) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
    });
    var w = Math.max(4, maxx - minx), h = Math.max(4, maxy - miny);
    var pad = 1.6;
    var s = Math.min(W / (w + pad * 2), H / (h + pad * 2));
    view.scale = clamp(s, 4, 240);
    view.cx = (minx + maxx) / 2;
    view.cy = (miny + maxy) / 2;
    needsDraw = true;
    updateHud();
    save();
  }

  /* --------------------------------- UI ---------------------------------- */
  /* Tipos de función del juego (Math Wars). Cada uno trae su forma general,
     valores iniciales razonables a escala ±80 y el rango de cada deslizador. */
  var FUNCIONES = [
    { n: 'Lineal', e: 'm*x + b', d: { m: 0.5, b: 0 }, r: { m: [-5, 5, 0.05], b: [-100, 100, 1] },
      tip: 'La única que siempre está permitida.' },
    { n: 'Cuadrático', e: 'a*x^2 + b*x + c', d: { a: 0.02, b: 0, c: 0 },
      r: { a: [-0.5, 0.5, 0.001], b: [-3, 3, 0.05], c: [-100, 100, 1] } },
    { n: 'Cúbico', e: 'a*x^3 + b*x^2 + c*x + d', d: { a: 0.0005, b: 0, c: 0, d: 0 },
      r: { a: [-0.005, 0.005, 0.00005], b: [-0.5, 0.5, 0.001], c: [-3, 3, 0.05], d: [-100, 100, 1] } },
    { n: 'Valor abs.', e: 'a*abs(x - h) + k', d: { a: 1, h: 0, k: 0 },
      r: { a: [-5, 5, 0.1], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Log', e: 'a*log(x - h) + k', d: { a: 20, h: -80, k: 0 },
      r: { a: [-100, 100, 1], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Log nat.', e: 'a*ln(x - h) + k', d: { a: 20, h: -80, k: 0 },
      r: { a: [-100, 100, 1], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Seno', e: 'a*sin(b*(x - h)) + k', d: { a: 24, b: 0.0785, h: 0, k: 0 },
      r: { a: [-60, 60, 1], b: [-0.3, 0.3, 0.002], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Coseno', e: 'a*cos(b*(x - h)) + k', d: { a: 24, b: 0.0785, h: 0, k: 0 },
      r: { a: [-60, 60, 1], b: [-0.3, 0.3, 0.002], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Exponencial', e: 'a*e^(b*(x - h)) + k', d: { a: 1, b: 0.05, h: 0, k: 0 },
      r: { a: [-60, 60, 1], b: [-0.2, 0.2, 0.002], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Raíz', e: 'a*sqrt(x - h) + k', d: { a: 10, h: -80, k: 0 },
      r: { a: [-60, 60, 1], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Seno inv.', e: 'a*asin(b*(x - h)) + k', d: { a: 20, b: 0.02, h: 0, k: 0 },
      r: { a: [-100, 100, 1], b: [-1, 1, 0.01], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Coseno inv.', e: 'a*acos(b*(x - h)) + k', d: { a: 20, b: 0.02, h: 0, k: 0 },
      r: { a: [-100, 100, 1], b: [-1, 1, 0.01], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Tan. inv.', e: 'a*atan(b*(x - h)) + k', d: { a: 30, b: 0.05, h: 0, k: 0 },
      r: { a: [-100, 100, 1], b: [-1, 1, 0.01], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Tanh', e: 'a*tanh(b*(x - h)) + k', d: { a: 30, b: 0.05, h: 0, k: 0 },
      r: { a: [-100, 100, 1], b: [-1, 1, 0.01], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Tangente', e: 'a*tan(b*(x - h)) + k', d: { a: 20, b: 0.0785, h: 0, k: 0 },
      r: { a: [-100, 100, 1], b: [-0.5, 0.5, 0.002], h: [-100, 100, 1], k: [-100, 100, 1] } },
    { n: 'Recíproco', e: 'a/(x - h) + k', d: { a: 200, h: 0, k: 0 },
      r: { a: [-2000, 2000, 5], h: [-100, 100, 1], k: [-100, 100, 1] } }
  ];

  function applyFuncion(f) {
    var c = activeCurve();
    if (!c) return;
    c.expr = f.e;
    c.params = {};
    Object.keys(f.d).forEach(function (k) { c.params[k] = f.d[k]; });
    c.ranges = {};
    if (f.r) Object.keys(f.r).forEach(function (k) { c.ranges[k] = f.r[k].slice(); });
    c.dx = 0; c.dy = 0;
    c._src = null; c._compiled = null; c._paramNames = [];
    compileCurve(c);
    renderCurves(); renderParams(); renderFunciones(); refresh();
    toast(f.n + ' · ajusta los deslizadores');
  }

  function renderFunciones() {
    var box = $('#funcGrid');
    if (!box) return;
    var c = activeCurve();
    box.innerHTML = '';
    FUNCIONES.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'func' + (c && c.expr === f.e ? ' on' : '');
      b.title = (f.tip ? f.tip + '\n' : '') + 'f(x) = ' + f.e;
      b.innerHTML = '<span>' + escapeHtml(f.n) + '</span>';
      b.addEventListener('click', function () { applyFuncion(f); });
      box.appendChild(b);
    });
  }

  /* ------------------------- ecuación final ------------------------- */
  function numText(v) {
    var s = fmt(v, 4);
    return v < 0 ? '(' + s + ')' : s;
  }

  // ecuación lista para pegar en el juego: parámetros con su valor numérico
  function effectiveExpr(c) {
    if (!c) return '';
    var src = String(c.expr || '').replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, '').trim();
    if (!src) return '';

    var names = (c._paramNames || []).slice().sort(function (a, b) { return b.length - a.length; });
    names.forEach(function (n) {
      var v = c.params ? c.params[n] : null;
      if (typeof v !== 'number' || !isFinite(v)) return;
      var safe = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      src = src.replace(new RegExp('\\b' + safe + '\\b', 'g'), numText(v));
    });

    var out = src;
    if (Math.abs(c.dx) > 1e-9) out = out.replace(/\bx\b/g, '(x - ' + numText(c.dx) + ')');
    if (Math.abs(c.dy) > 1e-9) out = out + ' + ' + numText(c.dy);
    return out;
  }

  function updateEffective() {
    var el = $('#eqEffective');
    if (!el) return;
    var c = activeCurve();
    if (!c) { el.textContent = '—'; return; }
    el.textContent = 'f(x) = ' + (effectiveExpr(c) || '…');
  }

  function renderParams() {
    var c = activeCurve();
    var box = $('#params');
    var names = c && c._paramNames ? c._paramNames : [];
    var sig = names.join(',');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = '';
      names.forEach(function (name) {
        var row = document.createElement('div');
        row.className = 'param';
        row.dataset.p = name;
        row.innerHTML =
          '<span class="pname">' + escapeHtml(name) + '</span>' +
          '<input type="range" step="0.01" aria-label="' + escapeHtml(name) + '">' +
          '<input type="number" step="0.05" aria-label="' + escapeHtml(name) + '">';
        box.appendChild(row);
      });
    }
    updateParamValues();
  }

  function updateParamValues() {
    var c = activeCurve();
    if (!c) return;
    $$('#params .param').forEach(function (row) {
      var name = row.dataset.p;
      var v = c.params[name];
      if (typeof v !== 'number') return;
      var r = (c.ranges && c.ranges[name]) || autoRange(v);
      var range = row.querySelector('input[type=range]');
      var number = row.querySelector('input[type=number]');
      var step = r[2] || (r[1] - r[0]) / 200;
      if (+range.min !== r[0]) range.min = r[0];
      if (+range.max !== r[1]) range.max = r[1];
      if (+range.step !== step) range.step = step;
      if (+number.step !== step) number.step = step;
      if (document.activeElement !== range) range.value = v;
      if (document.activeElement !== number) number.value = fmt(v, 4);
    });
  }

  function renderCurves() {
    var list = $('#curvesList');
    list.innerHTML = '';
    state.curves.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'item' + (c.id === state.activeId ? ' active' : '');
      el.dataset.id = c.id;
      el.innerHTML =
        '<button class="act" data-act="vis" title="Mostrar / ocultar">' +
          '<span class="swatch" style="background:' + c.color + ';opacity:' + (c.visible ? 1 : 0.25) + '"></span>' +
        '</button>' +
        '<div class="item-body">' +
          '<code class="exprcode" style="color:' + c.color + '">y = ' + escapeHtml(c.expr) + '</code>' +
          '<small>Δx ' + signed(c.dx) + ' · Δy ' + signed(c.dy) + (c._error ? ' · ⚠ error' : '') + '</small>' +
        '</div>' +
        '<button class="act del" data-act="del" title="Eliminar">✕</button>';
      list.appendChild(el);
    });
    $('#curveCount').textContent = state.curves.length;
  }

  function renderRivals() {
    var list = $('#rivalsList');
    list.innerHTML = '';
    state.others.forEach(function (o) {
      var d = Math.hypot(o.x - state.player.x, o.y - state.player.y);
      var ang = Math.atan2(o.y - state.player.y, o.x - state.player.x) * 180 / Math.PI;
      var el = document.createElement('div');
      el.className = 'item' + (selection && selection.type === 'other' && selection.id === o.id ? ' active' : '');
      el.dataset.id = o.id;
      el.innerHTML =
        '<span class="swatch diamond" style="background:' + o.color + '"></span>' +
        '<div class="item-body">' +
          '<input class="nm" data-field="name" value="' + escapeHtml(o.name) + '" maxlength="18">' +
          '<small class="dist">' + fmt(d, 1) + ' u · ' + fmt(ang, 0) + '°</small>' +
        '</div>' +
        '<div class="nums">' +
          '<input class="num" data-field="x" type="number" step="0.5" value="' + fmt(o.x, 2) + '">' +
          '<input class="num" data-field="y" type="number" step="0.5" value="' + fmt(o.y, 2) + '">' +
        '</div>' +
        '<button class="act aim" data-act="aim" title="Trazar una recta hasta este rival">◎</button>' +
        '<button class="act del" data-act="del" title="Eliminar">✕</button>';
      list.appendChild(el);
    });
  }

  function renderObstacles() {
    var list = $('#obstaclesList');
    list.innerHTML = '';
    state.obstacles.forEach(function (ob) {
      var el = document.createElement('div');
      el.className = 'item ob' + (selection && selection.type === 'obstacle' && selection.id === ob.id ? ' active' : '');
      el.dataset.id = ob.id;
      var isRect = ob.type === 'rect' || ob.type === 'tri';
      var fields = isRect
        ? [['x', 'X', ob.x], ['y', 'Y', ob.y], ['w', 'An', ob.w], ['h', 'Al', ob.h]]
        : [['cx', 'X', ob.cx], ['cy', 'Y', ob.cy], ['r', 'R', ob.r]];
      el.innerHTML =
        '<div class="ob-top">' +
          '<span class="swatch ' + (ob.type === 'circle' ? 'round' : ob.type === 'tri' ? 'tri' : '') + '" style="background:#f97316"></span>' +
          '<span class="ob-name">' + escapeHtml(ob.name) + '</span>' +
          '<button class="act del" data-act="del" title="Eliminar">✕</button>' +
        '</div>' +
        '<div class="ob-fields">' +
          fields.map(function (f) {
            return '<label><span>' + f[1] + '</span><input type="number" step="0.5" data-field="' + f[0] + '" value="' + fmt(f[2], 2) + '"></label>';
          }).join('') +
        '</div>';
      list.appendChild(el);
    });
    $('#obstacleCount').textContent = state.obstacles.length;
  }

  function renderLists() {
    renderCurves();
    renderRivals();
    renderObstacles();
  }

  function syncInputs() {
    var p = state.player;
    setValue($('#playerX'), fmt(p.x, 2));
    setValue($('#playerY'), fmt(p.y, 2));

    var c = activeCurve();
    setValue($('#expr'), c ? c.expr : '');
    $('#activeDot').style.background = c ? c.color : '#333';

    var speed = $('#speed');
    if (+speed.value !== state.shot.speed) speed.value = state.shot.speed;
    $('#speedVal').textContent = state.shot.speed;

    var rangeEl = $('#range');
    if (rangeEl) {
      if (+rangeEl.value !== state.shot.range) rangeEl.value = state.shot.range;
      $('#rangeVal').textContent = state.shot.range;
    }

    updateEffective();

    $('#dirBtn').textContent = state.shot.dir >= 0 ? '→' : '←';
    $('#dirBtn').title = state.shot.dir >= 0 ? 'Disparo hacia la derecha (clic para cambiar)' : 'Disparo hacia la izquierda (clic para cambiar)';

    var awEl = $('#arenaW'), ahEl = $('#arenaH');
    if (awEl) setValue(awEl, String(Math.round(state.arena.w)));
    if (ahEl) setValue(ahEl, String(Math.round(state.arena.h)));
    var arEl = $('#arenaToggle');
    if (arEl) arEl.classList.toggle('on', !!state.arena.show);

    $('#gridToggle').classList.toggle('on', state.showGrid);
    $('#snapToggle').classList.toggle('on', state.snapOn);

    // filas
    $$('#rivalsList .item').forEach(function (el) {
      var o = otherById(el.dataset.id);
      if (!o) return;
      var xi = el.querySelector('[data-field="x"]');
      var yi = el.querySelector('[data-field="y"]');
      var nm = el.querySelector('[data-field="name"]');
      if (xi && document.activeElement !== xi) xi.value = fmt(o.x, 2);
      if (yi && document.activeElement !== yi) yi.value = fmt(o.y, 2);
      if (nm && document.activeElement !== nm) nm.value = o.name;
      var d = Math.hypot(o.x - p.x, o.y - p.y);
      var ang = Math.atan2(o.y - p.y, o.x - p.x) * 180 / Math.PI;
      var distEl = el.querySelector('.dist');
      if (distEl) distEl.textContent = fmt(d, 1) + ' u · ' + fmt(ang, 0) + '°';
    });

    $$('#obstaclesList .item').forEach(function (el) {
      var ob = obstacleById(el.dataset.id);
      if (!ob) return;
      $$('[data-field]', el).forEach(function (inp) {
        if (document.activeElement === inp) return;
        var f = inp.dataset.field;
        if (typeof ob[f] === 'number') inp.value = fmt(ob[f], 2);
      });
    });

    updateHud();
  }

  function setValue(el, v) {
    if (el && document.activeElement !== el && el.value !== v) el.value = v;
  }

  function updateHud() {
    $('#hudPlayer').textContent = '(' + fmt(state.player.x, 1) + ', ' + fmt(state.player.y, 1) + ')';
    $('#zoomLabel').textContent = fmt(view.scale, 0) + ' px/u';
  }

  function updateCursorReadout() {
    var el = $('#cursorPos');
    if (!el) return;
    el.textContent = '(' + fmt(WX(pointer.x), 1) + ', ' + fmt(WY(pointer.y), 1) + ')';
  }

  var toastTimer = 0;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ------------------------------- estado UI ------------------------------ */
  function updateStatus() {
    var c = activeCurve();
    var card = $('#statusCard');
    var pill = $('#statusPill');
    var icon = $('#statusIcon');
    var title = $('#statusTitle');
    var sub = $('#statusSub');
    var p = state.player;

    card.className = 'status-card';
    pill.className = 'status-pill';

    if (!c) {
      card.classList.add('error');
      icon.textContent = '!'; title.textContent = 'Sin trayectoria';
      sub.textContent = 'Crea una ecuación para empezar.';
      pill.classList.add('error'); $('#pillIcon').textContent = '!';
      $('#pillText').textContent = 'Sin trayectoria';
      return;
    }

    if (c._error) {
      card.classList.add('error');
      icon.textContent = '!'; title.textContent = 'Ecuación con error';
      sub.textContent = c._error;
      $('#exprError').hidden = false;
      $('#exprError').textContent = c._error;
      pill.classList.add('error'); $('#pillIcon').textContent = '!';
      $('#pillText').textContent = 'Revisa la ecuación';
      return;
    }
    $('#exprError').hidden = true;

    var tr = activeTraj;
    var yAtPlayer = evalCurve(c, p.x);
    var offset = isFinite(yAtPlayer) ? Math.abs(yAtPlayer - p.y) : NaN;
    var offNote = '';
    if (isFinite(offset) && offset > 0.12) {
      offNote = 'Tu punto está a ' + fmt(offset, 1) + ' u de la curva · pulsa «Anclar a mí».';
    }

    if (!tr || !tr.samples.length) {
      card.classList.add('error');
      icon.textContent = '!'; title.textContent = 'Trayectoria no válida';
      sub.textContent = 'La ecuación no se puede dibujar en esta zona.';
      pill.classList.add('error'); $('#pillIcon').textContent = '!';
      $('#pillText').textContent = 'Trayectoria no válida';
      return;
    }

    var t = tr.length / state.shot.speed;

    if (tr.hit) {
      card.classList.add('blocked');
      icon.textContent = '✕';
      title.textContent = 'Choque con ' + tr.hit.ob.name;
      sub.innerHTML =
        'punto (' + fmt(tr.hit.x, 1) + ', ' + fmt(tr.hit.y, 1) + ') · ' + fmt(tr.hit.dist, 1) + ' u · ' + fmt(tr.hit.dist / state.shot.speed, 1) + ' s' +
        (offNote ? '<br>' + escapeHtml(offNote) : '');
      pill.classList.add('blocked');
      $('#pillIcon').textContent = '✕';
      $('#pillText').textContent = 'Choque con ' + tr.hit.ob.name + ' en (' + fmt(tr.hit.x, 1) + ', ' + fmt(tr.hit.y, 1) + ')';
    } else {
      var end = tr.samples[tr.samples.length - 1];
      var near = nearestRivalOnPath(tr);
      var nearTxt = '';
      if (near && near.d < 22) {
        nearTxt = near.d < 4
          ? '<br><b style="color:#86efac">🎯 pasa por ' + escapeHtml(near.o.name) + '</b>'
          : '<br>pasa a ' + fmt(near.d, 1) + ' u de ' + escapeHtml(near.o.name);
      }
      card.classList.add('free');
      icon.textContent = near && near.d < 4 ? '🎯' : '✓';
      title.textContent = near && near.d < 4 ? '¡Le da a ' + near.o.name + '!' : 'Camino libre';
      sub.innerHTML =
        'sale en (' + fmt(tr.samples[0].x, 1) + ', ' + fmt(tr.samples[0].y, 1) + ') → llega a (' + fmt(end.x, 1) + ', ' + fmt(end.y, 1) + ')<br>' +
        fmt(tr.length, 1) + ' u de recorrido · ' + fmt(t, 1) + ' s a ' + state.shot.speed + ' u/s' +
        nearTxt + (offNote ? '<br>' + escapeHtml(offNote) : '');
      pill.classList.add('free');
      $('#pillIcon').textContent = '✓';
      $('#pillText').textContent = 'Camino libre · ' + fmt(tr.length, 1) + ' u';
    }

    // pista del jugador
    var hint = $('#playerHint');
    var inside = null;
    state.obstacles.forEach(function (ob) {
      if (pointInObstacle(p.x, p.y, ob)) inside = ob;
    });
    if (inside) {
      hint.textContent = '⚠ Estás dentro de «' + inside.name + '». Muévete para no empezar el tiro dentro de un obstáculo.';
      hint.style.color = '#fda4af';
    } else {
      hint.style.color = '';
      var nearest = null, nd = Infinity;
      state.others.forEach(function (o) {
        var d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < nd) { nd = d; nearest = o; }
      });
      hint.textContent = nearest
        ? 'Estás en (' + fmt(p.x, 1) + ', ' + fmt(p.y, 1) + '). El rival más cercano, ' + nearest.name + ', está a ' + fmt(nd, 1) + ' u.'
        : 'Estás en (' + fmt(p.x, 1) + ', ' + fmt(p.y, 1) + ').';
    }
  }

  function refresh(opts) {
    opts = opts || {};
    var c = activeCurve();
    if (c) compileCurve(c);
    activeTraj = buildTrajectory(c);
    if (!bullet.active) { bullet.path = []; bullet.done = false; }
    updateStatus();
    syncInputs();
    if (!opts.noRenderParams) updateParamValues();
    needsDraw = true;
    if (!opts.noSave) save();
  }

  function refreshAll() {
    state.curves.forEach(compileCurve);
    renderLists();
    renderParams();
    renderFunciones();
    refresh();
  }

  function setActive(id) {
    if (state.activeId === id) return;
    state.activeId = id;
    selection = { type: 'curve', id: id };
    var c = curveById(id);
    if (c) { c._src = null; compileCurve(c); }
    $('#params').dataset.sig = '';
    renderCurves();
    renderParams();
    renderFunciones();
    refresh();
  }

  function addCurve() {
    var c = {
      id: uid(),
      expr: '0.5*x + 2',
      params: {},
      dx: 0, dy: 0,
      visible: true,
      color: CURVE_COLORS[state.curves.length % CURVE_COLORS.length]
    };
    state.curves.push(c);
    compileCurve(c);
    state.activeId = c.id;
    $('#params').dataset.sig = '';
    renderCurves();
    renderParams();
    renderFunciones();
    refresh();
    toast('Nueva trayectoria añadida');
  }

  /* ------------------------------- eventos UI ----------------------------- */
  function bindUI() {
    $('#playerX').addEventListener('input', function () {
      state.player.x = num(this.value, state.player.x);
      refresh();
    });
    $('#playerY').addEventListener('input', function () {
      state.player.y = num(this.value, state.player.y);
      refresh();
    });

    $('#expr').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); this.blur(); shoot(); }
    });

    $('#expr').addEventListener('input', function () {
      var c = activeCurve();
      if (!c) return;
      c.expr = this.value;
      compileCurve(c);
      renderParams();
      renderCurves();
      refresh({ noRenderParams: true });
    });

    $('#params').addEventListener('input', function (e) {
      var target = e.target;
      if (!target.matches('input')) return;
      var row = target.closest('.param');
      if (!row) return;
      var c = activeCurve();
      if (!c) return;
      var v = parseFloat(target.value);
      if (!isFinite(v)) return;
      var pname = row.dataset.p;
      c.params[pname] = v;
      var cur = c.ranges && c.ranges[pname];
      if (cur && (v < cur[0] || v > cur[1])) {
        c.ranges[pname] = [Math.min(cur[0], v), Math.max(cur[1], v), cur[2]];
        updateParamValues();
      }
      var other = target.type === 'range' ? row.querySelector('input[type=number]') : row.querySelector('input[type=range]');
      if (other && document.activeElement !== other) {
        if (other.type === 'number') other.value = fmt(v, 3);
        else other.value = v;
      }
      refresh({ noRenderParams: true });
    });

    $('#curvesList').addEventListener('click', function (e) {
      var row = e.target.closest('.item');
      if (!row) return;
      var c = curveById(row.dataset.id);
      if (!c) return;
      var act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'del') {
        if (state.curves.length <= 1) { toast('Necesitas al menos una trayectoria'); return; }
        state.curves = state.curves.filter(function (x) { return x.id !== c.id; });
        if (state.activeId === c.id) state.activeId = state.curves[0].id;
        selection = null;
        $('#params').dataset.sig = '';
        renderCurves(); renderParams(); refresh();
        return;
      }
      if (act && act.dataset.act === 'vis') {
        c.visible = !c.visible;
        renderCurves(); refresh();
        return;
      }
      setActive(c.id);
    });

    $('#newCurve').addEventListener('click', addCurve);

    $('#shootBtn').addEventListener('click', shoot);
    $('#dirBtn').addEventListener('click', function () {
      state.shot.dir = state.shot.dir >= 0 ? -1 : 1;
      refresh();
    });
    $('#speed').addEventListener('input', function () {
      state.shot.speed = num(this.value, 14);
      refresh();
    });
    var rangeEl = $('#range');
    if (rangeEl) rangeEl.addEventListener('input', function () {
      state.shot.range = clamp(num(this.value, 60), 5, 200);
      refresh();
    });

    $('#anchorBtn').addEventListener('click', function () {
      var c = activeCurve();
      if (!c || !c._compiled) { toast('La ecuación no es válida'); return; }
      var y0 = evalCurve(c, state.player.x);
      if (!isFinite(y0)) { toast('No se puede anclar aquí'); return; }
      c.dy += state.player.y - y0;
      renderCurves(); refresh();
      toast('Curva anclada a tu posición');
    });

    $('#resetOffsets').addEventListener('click', function () {
      var c = activeCurve();
      if (!c) return;
      c.dx = 0; c.dy = 0;
      renderCurves(); refresh();
    });

    $('#addRival').addEventListener('click', function () {
      var colors = ['#38bdf8', '#c084fc', '#fbbf24', '#fb7185', '#2dd4bf'];
      state.others.push({
        id: uid(),
        name: 'Rival ' + (state.others.length + 1),
        x: state.player.x + 6 + Math.random() * 2,
        y: state.player.y + 4,
        color: colors[state.others.length % colors.length]
      });
      renderRivals(); refresh();
    });

    $('#rivalsList').addEventListener('input', function (e) {
      var row = e.target.closest('.item');
      if (!row) return;
      var o = otherById(row.dataset.id);
      if (!o) return;
      var f = e.target.dataset.field;
      if (f === 'name') o.name = e.target.value;
      else if (f === 'x' || f === 'y') o[f] = num(e.target.value, o[f]);
      refresh();
    });
    $('#rivalsList').addEventListener('click', function (e) {
      var row = e.target.closest('.item');
      if (!row) return;
      var o = otherById(row.dataset.id);
      if (!o) return;
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'del') {
        state.others = state.others.filter(function (x) { return x.id !== o.id; });
        if (selection && selection.id === o.id) selection = null;
        renderRivals(); refresh();
      } else if (act.dataset.act === 'aim') {
        aimAt(o);
      }
    });

    $('#addTri').addEventListener('click', function () { setPlaceMode('tri'); });
    $('#addRect').addEventListener('click', function () { setPlaceMode('rect'); });
    $('#addCircle').addEventListener('click', function () { setPlaceMode('circle'); });

    $('#obstaclesList').addEventListener('input', function (e) {
      var row = e.target.closest('.item');
      if (!row) return;
      var ob = obstacleById(row.dataset.id);
      if (!ob) return;
      var f = e.target.dataset.field;
      if (!f) return;
      var v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      if (f === 'w' || f === 'h' || f === 'r') ob[f] = Math.max(0.2, v);
      else ob[f] = v;
      refresh();
    });

    $('#obstaclesList').addEventListener('click', function (e) {
      var row = e.target.closest('.item');
      if (!row) return;
      var act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'del') {
        state.obstacles = state.obstacles.filter(function (x) { return x.id !== row.dataset.id; });
        selection = null;
        renderObstacles(); refresh();
      } else {
        selection = { type: 'obstacle', id: row.dataset.id };
        renderLists(); needsDraw = true;
      }
    });

    $('#toolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('.tb[data-tool]');
      if (btn) {
        var t = btn.dataset.tool;
        setPlaceMode(t === 'select' ? null : t);
        return;
      }
    });

    $('#zoomIn').addEventListener('click', function () { zoomBy(1.25); });
    $('#zoomOut').addEventListener('click', function () { zoomBy(0.8); });
    $('#fitBtn').addEventListener('click', fitView);

    $('#gridToggle').addEventListener('click', function () {
      state.showGrid = !state.showGrid;
      syncInputs(); needsDraw = true; save();
    });
    $('#snapToggle').addEventListener('click', function () {
      state.snapOn = !state.snapOn;
      syncInputs(); save();
      toast(state.snapOn ? 'Imán activado (paso ' + state.snap + ')' : 'Movimiento libre');
    });

    $('#menuBtn').addEventListener('click', function () {
      $('#sidebar').classList.toggle('open');
      $('#scrim').classList.toggle('show', $('#sidebar').classList.contains('open'));
    });
    $('#scrim').addEventListener('click', function () {
      $('#sidebar').classList.remove('open');
      $('#scrim').classList.remove('show');
    });

    $('#helpBtn').addEventListener('click', function () { $('#helpModal').hidden = false; });
    $('#closeHelp').addEventListener('click', function () { $('#helpModal').hidden = true; });
    $('#startBtn').addEventListener('click', function () { $('#helpModal').hidden = true; });
    $('#helpModal').addEventListener('click', function (e) {
      if (e.target === this) this.hidden = true;
    });

    var aw = $('#arenaW'), ah = $('#arenaH');
    if (aw) aw.addEventListener('input', function () {
      state.arena.w = clamp(num(this.value, 160), 20, 600);
      refresh();
    });
    if (ah) ah.addEventListener('input', function () {
      state.arena.h = clamp(num(this.value, 160), 20, 600);
      refresh();
    });
    var fa = $('#fitArenaBtn');
    if (fa) fa.addEventListener('click', fitArena);
    var ar = $('#arenaToggle');
    if (ar) ar.addEventListener('click', function () {
      state.arena.show = !state.arena.show;
      this.classList.toggle('on', state.arena.show);
      needsDraw = true; save();
    });

    $('#copyEq').addEventListener('click', copyEquation);

    $('#exportBtn').addEventListener('click', exportScene);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', importScene);

    $('#resetBtn').addEventListener('click', function () {
      if (!confirm('¿Reiniciar la escena? Se perderán los cambios.')) return;
      var keepView = state.view;
      state = defaultState();
      state.view = keepView;
      state.activeId = state.curves[0].id;
      view = state.view;
      selection = null;
      $('#params').dataset.sig = '';
      refreshAll();
      toast('Escena reiniciada');
    });

    // teclado
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      var k = e.key.toLowerCase();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        setPlaceMode(null);
        selection = null;
        needsDraw = true;
      } else if (k === 'f') {
        fitView();
      } else if (k === 'g') {
        state.showGrid = !state.showGrid; syncInputs(); needsDraw = true; save();
      } else if (k === 'd') {
        shoot();
      } else if (k === 'v') {
        setPlaceMode(null);
      } else if (k === 'p') {
        setPlaceMode('player');
      } else if (e.key === '+' || e.key === '=') {
        zoomBy(1.2);
      } else if (e.key === '-' || e.key === '_') {
        zoomBy(0.83);
      } else if (e.key.indexOf('Arrow') === 0) {
        nudge(e.shiftKey ? 0.1 : (state.snapOn ? state.snap : 0.5), e.key);
        e.preventDefault();
      }
    });
  }

  function nudge(step, key) {
    var dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    var dy = key === 'ArrowUp' ? step : key === 'ArrowDown' ? -step : 0;
    if (selection && selection.type === 'player') {
      state.player.x += dx; state.player.y += dy;
    } else if (selection && selection.type === 'other') {
      var o = otherById(selection.id);
      if (o) { o.x += dx; o.y += dy; }
    } else if (selection && selection.type === 'obstacle') {
      var ob = obstacleById(selection.id);
      if (ob) {
        if (ob.type === 'rect') { ob.x += dx; ob.y += dy; }
        else { ob.cx += dx; ob.cy += dy; }
      }
    } else if (selection && selection.type === 'curve') {
      var c = curveById(selection.id);
      if (c) { c.dx += dx; c.dy += dy; renderCurves(); }
    } else {
      view.cx += dx / view.scale * 8;
      view.cy += dy / view.scale * 8;
      needsDraw = true;
      return;
    }
    refresh();
  }

  function deleteSelection() {
    if (!selection) { toast('Selecciona algo para borrar'); return; }
    if (selection.type === 'other') {
      state.others = state.others.filter(function (o) { return o.id !== selection.id; });
      selection = null;
      renderRivals(); refresh();
    } else if (selection.type === 'obstacle') {
      state.obstacles = state.obstacles.filter(function (o) { return o.id !== selection.id; });
      selection = null;
      renderObstacles(); refresh();
    } else if (selection.type === 'curve') {
      if (state.curves.length <= 1) { toast('Necesitas al menos una trayectoria'); return; }
      state.curves = state.curves.filter(function (c) { return c.id !== selection.id; });
      state.activeId = state.curves[0].id;
      selection = null;
      $('#params').dataset.sig = '';
      renderCurves(); renderParams(); refresh();
    } else {
      selection = null;
      needsDraw = true;
    }
  }

  function aimAt(o) {
    var p = state.player;
    var c = activeCurve();
    if (!c) return;
    var dx = o.x - p.x;
    if (Math.abs(dx) < 1e-6) { toast('Están en la misma vertical: usa una parábola'); return; }
    var m = (o.y - p.y) / dx;
    c.expr = fmt(m, 4) + '*(x - (' + fmt(p.x, 3) + ')) + (' + fmt(p.y, 3) + ')';
    c.dx = 0; c.dy = 0;
    c._src = null; c._compiled = null; c._paramNames = [];
    compileCurve(c);
    renderCurves(); renderParams(); renderFunciones(); refresh();
    toast('Recta trazada hacia ' + o.name);
  }

  function copyEquation() {
    var c = activeCurve();
    if (!c) return;
    var text = 'f(x) = ' + (effectiveExpr(c) || '');
    function done() { toast('Ecuación copiada'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
      } catch (e) { toast('No se pudo copiar: ' + text); }
    }
  }

  /* ------------------------------- escena IO ------------------------------ */
  function exportScene() {
    try {
      var data = JSON.stringify(state, null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'trazador-escena.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Escena guardada');
    } catch (e) { toast('No se pudo guardar'); }
  }

  function importScene(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = JSON.parse(String(reader.result));
        if (!s || !s.curves || !s.player) throw new Error('formato');
        state = s;
        state.view = state.view || { cx: 0, cy: 0, scale: 42 };
        state.shot = state.shot || { dir: 1, speed: 14, range: 60 };
        state.others = state.others || [];
        state.obstacles = state.obstacles || [];
        view = state.view;
        if (!state.curves.length) state.curves = defaultState().curves;
        if (!activeCurve()) state.activeId = state.curves[0].id;
        selection = null;
        $('#params').dataset.sig = '';
        refreshAll();
        fitView();
        toast('Escena cargada');
      } catch (err) {
        toast('El archivo no es una escena válida');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* -------------------------------- arranque ------------------------------ */
  function loop(ts) {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (bullet.active) stepBullet(dt);
    if (needsDraw) {
      draw(ts);
      needsDraw = false;
    }
    requestAnimationFrame(loop);
  }
  var lastTs = 0;

  function init() {
    resize();
    renderFunciones();
    bindUI();
    refreshAll();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', function () {
      if (!drag) { hover = null; needsDraw = true; }
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { resize(); }).observe(stage);
    }
    window.addEventListener('resize', resize);

    // encuadre inicial la primera vez: la arena entera
    if (!localStorage.getItem(LS_KEY)) {
      setTimeout(function () {
        if (state.arena && state.arena.show) fitArena();
        else fitView();
      }, 60);
    }

    if (!localStorage.getItem(LS_KEY + '.visto')) {
      setTimeout(function () {
        $('#helpModal').hidden = false;
        try { localStorage.setItem(LS_KEY + '.visto', '1'); } catch (err) { /* noop */ }
      }, 400);
    }

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
