'use strict';

/* =============================================================
   STATE
   ============================================================= */
const state = {
  currentVal:   0n,   // integer part – always unsigned BigInt
  prevVal:      0n,
  fracVal:      0,    // fractional part 0 ≤ f < 1 (Number)
  prevFracVal:  0,
  hasFrac:      false,
  prevHasFrac:  false,
  fracBuf:      '',   // digits after '.' as the user typed them
  operator:     null, // '+' '-' '*' '/' 'AND' 'OR' 'XOR' 'NAND' 'NOR' 'SHL' 'SHR'
  newInput:     true,
  inputBuf:     '0',  // full display string (what appears in prog-display)
  inputBase:    10,   // 2 | 8 | 10 | 16
  bitWidth:     32,   // 8 | 16 | 32 | 64
  signed:       true,
  expr:         '',
};

const BITWISE_OPS = new Set(['AND','OR','XOR','NAND','NOR','SHL','SHR']);

/* =============================================================
   BIT / MATH HELPERS
   ============================================================= */
function bigMask(bits) { return (1n << BigInt(bits)) - 1n; }

function maskVal(val, bits) {
  const m = 1n << BigInt(bits);
  return ((val % m) + m) % m;
}

function toSigned(uval, bits) {
  const sign = 1n << BigInt(bits - 1);
  return uval >= sign ? uval - (1n << BigInt(bits)) : uval;
}

function parseInputBuf(buf, base) {
  if (!buf) return 0n;
  try {
    switch (base) {
      case  2: return BigInt('0b' + buf);
      case  8: return BigInt('0o' + buf);
      case 10: return BigInt(buf);
      case 16: return BigInt('0x' + buf);
    }
  } catch (_) { return 0n; }
  return 0n;
}

/* Convert integer BigInt to display string in current base */
function getIntStr(uval) {
  return uval.toString(state.inputBase).toUpperCase();
}

/* Numeric value of current state (signed float) */
function getNumVal() {
  const intN = state.signed
    ? Number(toSigned(state.currentVal, state.bitWidth))
    : Number(state.currentVal);
  return intN + state.fracVal;
}

/* Numeric value of prev state */
function getPrevNumVal() {
  const intN = state.signed
    ? Number(toSigned(state.prevVal, state.bitWidth))
    : Number(state.prevVal);
  return intN + state.prevFracVal;
}

/* =============================================================
   FRACTIONAL BASE CONVERSION
   Converts the fractional part (0 ≤ frac < 1) to base `base`.
   Returns a string of digits (possibly ending with '…' if truncated).
   ============================================================= */
function fracToBase(frac, base, maxDigits) {
  if (!frac || frac < 1e-12) return '';
  const MAX = maxDigits ?? (base === 2 ? 24 : 12);
  let result = '';
  let f = frac;

  for (let i = 0; i < MAX; i++) {
    f *= base;
    const d = Math.floor(f);
    f -= d;
    result += d.toString(16).toUpperCase(); // works for digits 0–15
    if (f < 1e-10) break;
  }

  if (f >= 1e-10) result += '…';
  return result;
}

/* =============================================================
   SET STATE FROM A JAVASCRIPT NUMBER (arithmetic result)
   ============================================================= */
function setFromNum(num) {
  if (!isFinite(num) || isNaN(num)) {
    state.inputBuf = 'Error';
    state.currentVal = 0n;
    state.fracVal = 0; state.hasFrac = false; state.fracBuf = '';
    return;
  }

  const negative = num < 0;
  const abs = Math.abs(num);
  const intPart = Math.floor(abs);
  const fracPart = +(abs - intPart).toPrecision(14); // limit float noise

  state.currentVal = maskVal(
    negative ? -BigInt(intPart) : BigInt(intPart),
    state.bitWidth
  );
  state.fracVal  = fracPart;
  state.hasFrac  = fracPart >= 1e-12;
  state.fracBuf  = state.hasFrac ? fracToBase(fracPart, state.inputBase) : '';

  // Build inputBuf – for signed negative, prefix '-' + magnitude in current base
  const intDispStr = negative
    ? intPart.toString(state.inputBase).toUpperCase()
    : getIntStr(state.currentVal);

  state.inputBuf = (negative ? '-' : '') + intDispStr +
    (state.hasFrac ? '.' + state.fracBuf : '');
}

/* =============================================================
   DISPLAY HELPERS
   ============================================================= */
function fmtBin(uval, bits) {
  const s = uval.toString(2).padStart(bits, '0');
  const groups = [];
  for (let i = s.length; i > 0; i -= 4) groups.unshift(s.slice(Math.max(0, i - 4), i));
  return groups.join(' ');
}

function fmtHex(uval, bits) {
  const digits = bits / 4;
  const s = uval.toString(16).toUpperCase().padStart(digits, '0');
  const groups = [];
  for (let i = s.length; i > 0; i -= 4) groups.unshift(s.slice(Math.max(0, i - 4), i));
  return groups.join(' ');
}

/* Build an HTML string with the fractional part highlighted */
function buildBasePanelValue(intStr, fracStr) {
  if (!fracStr) return escHtml(intStr);
  return escHtml(intStr) + '.' + '<span class="frac-part">' + escHtml(fracStr) + '</span>';
}
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fitDisplayText(el, text, baseSize) {
  const len = text.length;
  let size = baseSize;
  if (len > 12) size = Math.max(16, baseSize - (len - 12) * 1.8);
  el.style.fontSize = size + 'px';
}

/* =============================================================
   RENDER
   ============================================================= */
function render() {
  const s = state;
  const bits = s.bitWidth;
  const uval = maskVal(s.currentVal, bits);

  /* ---------- Base panel: integer parts ---------- */
  const binInt = fmtBin(uval, bits);
  const octInt = uval.toString(8);
  const decInt = s.signed ? toSigned(uval, bits).toString() : uval.toString();
  const hexInt = fmtHex(uval, bits);

  /* ---------- Base panel: fractional parts ---------- */
  let fBin = '', fOct = '', fDec = '', fHex = '';
  if (s.hasFrac && s.fracVal > 0) {
    fBin = fracToBase(s.fracVal, 2,  24);
    fOct = fracToBase(s.fracVal, 8,  10);
    fDec = fracToBase(s.fracVal, 10, 12);
    fHex = fracToBase(s.fracVal, 16, 10);
  }

  const setPanel = (id, intStr, fracStr) => {
    const el = document.getElementById(id);
    el.innerHTML = buildBasePanelValue(intStr, fracStr);
    el.classList.toggle('has-frac', !!fracStr);
  };

  setPanel('val-bin', binInt, fBin);
  setPanel('val-oct', octInt, fOct);
  setPanel('val-dec', decInt, fDec);
  setPanel('val-hex', hexInt, fHex);

  /* ---------- Main display ---------- */
  const disp = document.getElementById('prog-display');
  disp.textContent = s.inputBuf;
  fitDisplayText(disp, s.inputBuf, 36);

  document.getElementById('prog-expr').textContent = s.expr;

  const labels = { 2:'BIN', 8:'OCT', 10:'DEC', 16:'HEX' };
  document.getElementById('base-badge').textContent = labels[s.inputBase];

  /* ---------- Active base row ---------- */
  document.querySelectorAll('.base-row').forEach(row =>
    row.classList.toggle('active-base', parseInt(row.dataset.base) === s.inputBase));

  /* ---------- Active operator highlight ---------- */
  document.querySelectorAll('.op-key, .bit-key').forEach(btn => {
    const opMap = { divide:'/', multiply:'*', subtract:'-', add:'+',
                    and:'AND', or:'OR', xor:'XOR', nand:'NAND',
                    nor:'NOR', shl:'SHL', shr:'SHR' };
    btn.classList.toggle('active-op',
      s.operator !== null && s.newInput && opMap[btn.dataset.action] === s.operator);
  });

  updateBtnStates();
}

/* =============================================================
   BUTTON STATE (digit validation + disable bitwise when fractional)
   ============================================================= */
function updateBtnStates() {
  const s = state;
  const base = s.inputBase;
  const validMap = { 2:'01', 8:'01234567', 10:'0123456789', 16:'0123456789ABCDEF' };
  const valid = validMap[base];

  document.querySelectorAll('.num-key, .hex-key').forEach(btn => {
    const v = (btn.dataset.value || '').toUpperCase();
    if (!v || v === '.') return;
    btn.classList.toggle('key-disabled', !valid.includes(v));
  });

  /* '.' button: disabled if already have decimal point */
  const dotBtn = document.querySelector('.dot-key');
  if (dotBtn) dotBtn.classList.toggle('key-disabled', s.hasFrac);

  /* Bitwise ops: disabled when fractional value is present */
  document.querySelectorAll('.bit-key').forEach(btn =>
    btn.classList.toggle('key-disabled', s.hasFrac));
}

/* =============================================================
   INPUT
   ============================================================= */
function pInput(char) {
  const s = state;

  /* --- Decimal point --- */
  if (char === '.') {
    if (s.hasFrac) return;
    s.hasFrac = true;
    s.fracBuf = '';
    s.fracVal = 0;
    if (s.newInput) {
      s.currentVal = 0n;
      s.inputBuf = '0.';
      s.newInput = false;
    } else {
      s.inputBuf += '.';
    }
    render();
    return;
  }

  /* --- Validate digit for current base --- */
  char = char.toUpperCase();
  const validMap = { 2:'01', 8:'01234567', 10:'0123456789', 16:'0123456789ABCDEF' };
  if (!validMap[s.inputBase].includes(char)) return;

  /* --- Fractional digits --- */
  if (s.hasFrac) {
    const MAX_FRAC = s.inputBase === 2 ? 24 : 12;
    if (s.fracBuf.length >= MAX_FRAC) return;
    s.fracBuf += char;
    const num   = parseInt(s.fracBuf, s.inputBase);
    const denom = Math.pow(s.inputBase, s.fracBuf.length);
    s.fracVal = num / denom;
    s.inputBuf = s.inputBuf.split('.')[0] + '.' + s.fracBuf;
    render();
    return;
  }

  /* --- Integer digits --- */
  let newBuf;
  if (s.newInput) {
    newBuf = char === '0' ? '0' : char;
    s.newInput = false;
  } else {
    newBuf = s.inputBuf === '0' ? char : s.inputBuf + char;
  }

  const newVal = parseInputBuf(newBuf, s.inputBase);
  if (newVal > bigMask(s.bitWidth)) return; // exceeds bit width

  s.inputBuf  = newBuf;
  s.currentVal = newVal;
  render();
}

/* =============================================================
   OPERATOR
   ============================================================= */
function pOperator(op) {
  const s = state;
  if (BITWISE_OPS.has(op) && s.hasFrac) return; // bitwise needs integers

  if (s.operator !== null && !s.newInput) {
    /* evaluate pending operation */
    if (BITWISE_OPS.has(s.operator)) {
      s.currentVal = maskVal(bitwiseCompute(s.prevVal, s.currentVal, s.operator), s.bitWidth);
      s.fracVal = 0; s.hasFrac = false; s.fracBuf = '';
      s.inputBuf = getIntStr(s.currentVal);
    } else {
      setFromNum(arithCompute(getPrevNumVal(), getNumVal(), s.operator));
    }
  }

  s.prevVal     = s.currentVal;
  s.prevFracVal = s.fracVal;
  s.prevHasFrac = s.hasFrac;
  // Reset fractional state so next operand starts as integer
  s.hasFrac = false;
  s.fracBuf = '';
  s.fracVal = 0;
  s.operator = op;
  s.expr     = s.inputBuf + ' ' + op;
  s.newInput = true;
  render();
}

/* =============================================================
   EQUALS
   ============================================================= */
function pEquals() {
  const s = state;
  if (s.operator === null) return;

  if (BITWISE_OPS.has(s.operator)) {
    s.currentVal = maskVal(bitwiseCompute(s.prevVal, s.currentVal, s.operator), s.bitWidth);
    s.fracVal = 0; s.hasFrac = false; s.fracBuf = '';
    s.inputBuf = getIntStr(s.currentVal);
  } else {
    setFromNum(arithCompute(getPrevNumVal(), getNumVal(), s.operator));
  }

  s.expr = '';
  s.operator = null;
  s.prevVal = 0n; s.prevFracVal = 0; s.prevHasFrac = false;
  s.newInput = true;
  render();
}

/* =============================================================
   COMPUTE HELPERS
   ============================================================= */
function arithCompute(a, b, op) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
    default:  return b;
  }
}

function bitwiseCompute(a, b, op) {
  const bits = state.bitWidth;
  a = maskVal(a, bits);
  b = maskVal(b, bits);
  switch (op) {
    case 'AND':  return a & b;
    case 'OR':   return a | b;
    case 'XOR':  return a ^ b;
    case 'NAND': return ~(a & b);
    case 'NOR':  return ~(a | b);
    case 'SHL':  return a << (b % BigInt(bits));
    case 'SHR':  return a >> (b % BigInt(bits));
    default:     return b;
  }
}

/* =============================================================
   CLEAR / BACKSPACE / SIGN / NOT
   ============================================================= */
function pClear() {
  Object.assign(state, {
    currentVal: 0n, prevVal: 0n,
    fracVal: 0, prevFracVal: 0,
    hasFrac: false, prevHasFrac: false,
    fracBuf: '', operator: null,
    newInput: true, inputBuf: '0', expr: '',
  });
  render();
}

function pBackspace() {
  const s = state;
  if (s.newInput) return;

  if (s.hasFrac) {
    if (s.fracBuf.length > 0) {
      s.fracBuf = s.fracBuf.slice(0, -1);
      if (s.fracBuf.length === 0) {
        s.fracVal = 0;
        s.inputBuf = s.inputBuf.split('.')[0] + '.';
      } else {
        s.fracVal = parseInt(s.fracBuf, s.inputBase) / Math.pow(s.inputBase, s.fracBuf.length);
        s.inputBuf = s.inputBuf.split('.')[0] + '.' + s.fracBuf;
      }
    } else {
      /* remove decimal point */
      s.hasFrac = false;
      s.fracBuf = ''; s.fracVal = 0;
      s.inputBuf = s.inputBuf.split('.')[0];
    }
  } else {
    s.inputBuf   = s.inputBuf.slice(0, -1) || '0';
    s.currentVal = maskVal(parseInputBuf(s.inputBuf, s.inputBase), s.bitWidth);
  }
  render();
}

function pNot() {
  const s = state;
  s.currentVal = maskVal(~s.currentVal, s.bitWidth);
  /* NOT ignores fractional part */
  s.fracVal = 0; s.hasFrac = false; s.fracBuf = '';
  s.inputBuf = getIntStr(s.currentVal);
  s.newInput = true;
  render();
}

function pSign() {
  const s = state;
  if (s.hasFrac) {
    setFromNum(-getNumVal());
  } else {
    const sv = toSigned(s.currentVal, s.bitWidth);
    s.currentVal = maskVal(-sv, s.bitWidth);
    s.inputBuf   = getIntStr(s.currentVal);
  }
  s.newInput = true;
  render();
}

/* =============================================================
   BASE / WIDTH / SIGN CHANGE – re-express current value
   ============================================================= */
function rebuildInputBuf() {
  const s = state;
  const intStr = getIntStr(s.currentVal);
  if (s.hasFrac) {
    s.fracBuf  = fracToBase(s.fracVal, s.inputBase);
    s.inputBuf = intStr + '.' + s.fracBuf;
  } else {
    s.fracBuf  = '';
    s.inputBuf = intStr;
  }
}

/* =============================================================
   KEYBOARD
   ============================================================= */
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  const base = state.inputBase;
  const k    = e.key.toUpperCase();

  if ('0123456789ABCDEF'.includes(k) && k.length === 1) {
    e.preventDefault(); pInput(k);
  } else switch (e.key) {
    case '.':       e.preventDefault(); pInput('.'); break;
    case '+':       e.preventDefault(); pOperator('+'); break;
    case '-':       e.preventDefault(); pOperator('-'); break;
    case '*':       e.preventDefault(); pOperator('*'); break;
    case '/':       e.preventDefault(); pOperator('/'); break;
    case 'Enter':
    case '=':       e.preventDefault(); pEquals(); break;
    case 'Backspace': e.preventDefault(); pBackspace(); break;
    case 'Escape':  e.preventDefault(); pClear(); break;
    case '&':       e.preventDefault(); pOperator('AND'); break;
    case '|':       e.preventDefault(); pOperator('OR'); break;
    case '^':       e.preventDefault(); pOperator('XOR'); break;
    case '~':       e.preventDefault(); pNot(); break;
  }
});

/* =============================================================
   TOAST
   ============================================================= */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* =============================================================
   FIXED-POINT / Q FORMAT
   ============================================================= */
function fpUpdate(source) {
  const qFrac = Math.max(0, parseInt(document.getElementById('q-frac').value) || 8);
  const scale = Math.pow(2, qFrac);
  document.getElementById('fp-scale-hint').textContent = `scale: 1/${scale}`;

  const rawEl  = document.getElementById('fp-raw');
  const realEl = document.getElementById('fp-real');
  const resEl  = document.getElementById('fp-result');

  if (source === 'raw') {
    const s = rawEl.value.trim();
    let raw;
    try {
      raw = /^0x/i.test(s) ? parseInt(s,16) : /^0b/i.test(s) ? parseInt(s.slice(2),2) : parseInt(s,10);
      if (isNaN(raw)) throw 0;
    } catch (_) { realEl.value = ''; resEl.textContent = ''; return; }
    const real = raw / scale;
    realEl.value = real.toPrecision(Math.min(qFrac + 3, 15)).replace(/\.?0+$/, '');
    fpShowResult(raw, real, scale);
  } else {
    const real = parseFloat(realEl.value);
    if (isNaN(real)) { rawEl.value = ''; resEl.textContent = ''; return; }
    const raw = Math.round(real * scale);
    rawEl.value = raw;
    fpShowResult(raw, real, scale);
  }
}

function fpShowResult(raw, real, scale) {
  const abs = Math.abs(raw);
  const sign = raw < 0 ? '-' : '';
  const hex  = sign + '0x' + abs.toString(16).toUpperCase();
  const bin  = sign + '0b' + abs.toString(2);
  document.getElementById('fp-result').textContent =
    `HEX: ${hex}    BIN: ${bin}    Real: ${real}    Scale: 1/${scale}`;
}

/* =============================================================
   INIT
   ============================================================= */
function init() {
  /* Keypad */
  document.querySelector('.prog-keypad').addEventListener('click', e => {
    const k = e.target.closest('[data-action],[data-value]');
    if (!k || k.classList.contains('key-disabled')) return;

    const { action, value } = k.dataset;
    if (value !== undefined) { pInput(value); return; }
    switch (action) {
      case 'clear':     pClear();           break;
      case 'backspace': pBackspace();        break;
      case 'sign':      pSign();             break;
      case 'not':       pNot();              break;
      case 'equals':    pEquals();           break;
      case 'add':       pOperator('+');      break;
      case 'subtract':  pOperator('-');      break;
      case 'multiply':  pOperator('*');      break;
      case 'divide':    pOperator('/');      break;
      case 'and':       pOperator('AND');    break;
      case 'or':        pOperator('OR');     break;
      case 'xor':       pOperator('XOR');    break;
      case 'nand':      pOperator('NAND');   break;
      case 'nor':       pOperator('NOR');    break;
      case 'shl':       pOperator('SHL');    break;
      case 'shr':       pOperator('SHR');    break;
    }
  });

  /* Bit-width selector */
  document.getElementById('bit-width-ctrl').addEventListener('click', e => {
    const btn = e.target.closest('[data-width]');
    if (!btn) return;
    state.bitWidth = parseInt(btn.dataset.width);
    document.querySelectorAll('#bit-width-ctrl .seg-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    state.currentVal = maskVal(state.currentVal, state.bitWidth);
    state.newInput   = true;
    rebuildInputBuf();
    render();
  });

  /* Sign toggle */
  document.getElementById('sign-ctrl').addEventListener('click', e => {
    const btn = e.target.closest('[data-sign]');
    if (!btn) return;
    state.signed = btn.dataset.sign === 'signed';
    document.querySelectorAll('#sign-ctrl .seg-btn').forEach(b =>
      b.classList.toggle('active', b === btn));
    render();
  });

  /* Base-row click → switch input base */
  document.querySelectorAll('.base-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.copy-btn')) return;
      state.inputBase = parseInt(row.dataset.base);
      state.newInput  = true;
      rebuildInputBuf();
      render();
    });
  });

  /* Copy buttons */
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const el = document.getElementById(btn.dataset.copy);
      // Strip HTML tags for copy, keep the '.' separator
      const text = el.innerText || el.textContent;
      navigator.clipboard.writeText(text.replace(/\s/g, ''))
        .then(() => showToast('Copied!'))
        .catch(() => showToast('Copy failed'));
    });
  });

  /* Fixed-point inputs */
  document.getElementById('fp-raw').addEventListener('input',  () => fpUpdate('raw'));
  document.getElementById('fp-real').addEventListener('input', () => fpUpdate('real'));
  document.getElementById('q-int').addEventListener('change',  () => fpUpdate('raw'));
  document.getElementById('q-frac').addEventListener('change', () => fpUpdate('raw'));

  /* Initial render */
  render();
  fpUpdate('raw');
}

document.addEventListener('DOMContentLoaded', init);
