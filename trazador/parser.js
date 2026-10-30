/* =========================================================================
   parser.js — Evaluador de expresiones matemáticas (seguro, sin eval libre)
   Soporta: + - * / ^ paréntesis, funciones trigonométricas, logaritmos,
   raíces, valor absoluto, constantes (pi, e) y MULTIPLICACIÓN IMPLÍCITA:
       2x   ·   3(x+1)   ·   x(x-2)   ·   4 sin(x)
   Cualquier identificador desconocido se trata como PARÁMETRO ajustable.
   ========================================================================= */
(function (global) {
  'use strict';

  var FUNCS = {
    sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
    asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', atan2: 'Math.atan2',
    sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
    sqrt: 'Math.sqrt', cbrt: 'Math.cbrt', abs: 'Math.abs',
    ln: 'Math.log', log: 'Math.log10', log2: 'Math.log2', exp: 'Math.exp',
    floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round', sign: 'Math.sign',
    min: 'Math.min', max: 'Math.max', pow: 'Math.pow'
  };

  var CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isAlpha(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }

  /* ---------------------------- tokenizador ---------------------------- */
  function tokenize(src) {
    var out = [], i = 0;
    while (i < src.length) {
      var ch = src[i];

      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

      if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1]))) {
        var j = i, dot = false;
        while (j < src.length) {
          if (isDigit(src[j])) { j++; continue; }
          if (src[j] === '.' && !dot) { dot = true; j++; continue; }
          break;
        }
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)), raw: src.slice(i, j) });
        i = j;
        continue;
      }

      if (isAlpha(ch)) {
        var k = i;
        while (k < src.length && (isAlpha(src[k]) || isDigit(src[k]))) k++;
        out.push({ t: 'id', v: src.slice(i, k) });
        i = k;
        continue;
      }

      if (ch === '*' && src[i + 1] === '*') { out.push({ t: '^' }); i += 2; continue; }
      if ('+-*/^(),'.indexOf(ch) >= 0) { out.push({ t: ch }); i++; continue; }

      throw new Error('No entiendo el símbolo «' + ch + '»');
    }
    return out;
  }

  /* ------------------------------ parser ------------------------------- */
  function parse(tokens) {
    var pos = 0;

    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function expect(t) {
      var tk = next();
      if (!tk || tk.t !== t) throw new Error(t === ')' ? 'Falta cerrar un paréntesis' : 'Expresión incompleta');
    }
    function startsFactor(tk) {
      return tk && (tk.t === 'num' || tk.t === 'id' || tk.t === '(');
    }

    function expression() {
      var node = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        var op = next().t;
        node = { t: 'bin', op: op, a: node, b: term() };
      }
      return node;
    }

    function term() {
      var node = unary();
      for (;;) {
        var tk = peek();
        if (!tk) break;
        if (tk.t === '*' || tk.t === '/') {
          next();
          node = { t: 'bin', op: tk.t, a: node, b: unary() };
        } else if (startsFactor(tk)) {
          // multiplicación implícita: 2x, 3(x+1), x sin(x)
          node = { t: 'bin', op: '*', a: node, b: unary() };
        } else break;
      }
      return node;
    }

    function unary() {
      var tk = peek();
      if (tk && (tk.t === '-' || tk.t === '+')) {
        next();
        var operand = unary();
        return tk.t === '-' ? { t: 'neg', a: operand } : operand;
      }
      return power();
    }

    function power() {
      var base = atom();
      if (peek() && peek().t === '^') {
        next();
        return { t: 'pow', a: base, b: unary() }; // asociativa a la derecha
      }
      return base;
    }

    function atom() {
      var tk = next();
      if (!tk) throw new Error('Expresión incompleta');

      if (tk.t === 'num') {
        if (!isFinite(tk.v)) throw new Error('Número no válido');
        return { t: 'num', v: tk.v };
      }

      if (tk.t === 'id') {
        var name = tk.v.toLowerCase();

        if (Object.prototype.hasOwnProperty.call(FUNCS, name)) {
          if (!peek() || peek().t !== '(') {
            throw new Error('Escribe ' + name + '(x), con paréntesis');
          }
          next(); // (
          var args = [];
          if (peek() && peek().t !== ')') {
            args.push(expression());
            while (peek() && peek().t === ',') { next(); args.push(expression()); }
          }
          expect(')');
          if (!args.length) throw new Error('Faltan argumentos en ' + name + '()');
          return { t: 'call', fn: FUNCS[name], name: name, args: args };
        }

        if (Object.prototype.hasOwnProperty.call(CONSTS, name)) {
          return { t: 'num', v: CONSTS[name] };
        }

        if (name === 'x') return { t: 'var' };

        // parámetro ajustable (m, b, a, k...)
        if (name.length > 1 && !/^[a-z][a-z0-9]*$/.test(name)) {
          throw new Error('Nombre no válido: ' + tk.v);
        }
        return { t: 'param', name: tk.v };
      }

      if (tk.t === '(') {
        var inner = expression();
        expect(')');
        return inner;
      }

      throw new Error('Símbolo inesperado: ' + tk.t);
    }

    if (!tokens.length) throw new Error('Escribe una ecuación');

    var ast = expression();
    if (pos < tokens.length) {
      var rest = tokens[pos];
      if (rest.t === ',') throw new Error('Usa punto decimal (0.5), no coma');
      throw new Error('Sobra «' + (rest.v !== undefined ? rest.v : rest.t) + '»');
    }
    return ast;
  }

  /* --------------------------- AST -> JavaScript ------------------------ */
  function toJS(n) {
    switch (n.t) {
      case 'num': return '(' + n.v + ')';
      case 'var': return 'x';
      case 'param': return 'p[' + JSON.stringify(n.name) + ']';
      case 'neg': return '(-' + toJS(n.a) + ')';
      case 'bin': return '(' + toJS(n.a) + n.op + toJS(n.b) + ')';
      case 'pow': return 'Math.pow(' + toJS(n.a) + ',' + toJS(n.b) + ')';
      case 'call': return n.fn + '(' + n.args.map(toJS).join(',') + ')';
      default: throw new Error('Nodo desconocido');
    }
  }

  function collectParams(n, out) {
    if (!n) return out;
    switch (n.t) {
      case 'param': if (out.indexOf(n.name) < 0) out.push(n.name); break;
      case 'neg': collectParams(n.a, out); break;
      case 'bin': case 'pow': collectParams(n.a, out); collectParams(n.b, out); break;
      case 'call': n.args.forEach(function (a) { collectParams(a, out); }); break;
    }
    return out;
  }

  /* ------------------------------- API -------------------------------- */
  function compile(src) {
    var tokens = tokenize(String(src == null ? '' : src));
    var ast = parse(tokens);
    var params = collectParams(ast, []);
    var js = toJS(ast);
    var fn;
    try {
      fn = new Function('x', 'p', 'return (' + js + ');');
    } catch (e) {
      throw new Error('Expresión no válida');
    }
    return {
      fn: function (x, p) { return fn(x, p || {}); },
      params: params,
      source: js
    };
  }

  var api = { compile: compile, FUNCS: FUNCS, CONSTS: CONSTS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.MathEval = api;
})(typeof window !== 'undefined' ? window : globalThis);
