// Minimal interpreter for the SUBSET of WGSL emitted by gen_cios15n.mjs.
// Parses the body of montmul_cios15native and executes each statement with
// STRICT u32 semantics (every intermediate wrapped mod 2^32). Validates the
// ACTUAL EMITTED WGSL (not the hand mirror) against x*y*2^-255 mod p, and tracks
// the max '+'/'*' intermediate to PROVE no u32 overflow.
//
// Supported grammar (exactly what the emitter produces):
//   decls:   var sK: u32 = 0u;  | let pK: u32 = LIT;  | let N0: u32 = LIT;
//            var c|v|m: u32;  | var out: BigInt;  | var borrow: i32 = 0;  | var dd: i32;
//            let aK: u32 = a.limbs[K];
//   stmts:   lhs = expr ;        (lhs: sK, c, v, m, out.limbs[K], borrow, dd)
//   exprs:   ids, a.limbs[K]/b.limbs[K], LITu, signed int LIT, + - * & >> ,
//            i32(x), u32(x), select(f,t,cond), comparisons (< , !=)
//   return out;
import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
export const N = C.N, B = C.B, MASK = C.MASK;
export const p = BigInt(C.p);

const wgsl = readFileSync(new URL('./montmul_cios15native.wgsl.gen', import.meta.url), 'utf8');
const bodyStart = wgsl.indexOf('{');
const bodyEnd = wgsl.lastIndexOf('}');
const body = wgsl.slice(bodyStart + 1, bodyEnd);

const rawStmts = body.split('\n')
  .map(l => l.replace(/\/\/.*$/, '').trim())
  .filter(l => l.length > 0)
  .join(' ').split(';').map(s => s.trim()).filter(s => s.length > 0);

let maxIntermediate = 0;
let curA = null, curB = null;

function tokenize(expr) {
  const toks = [];
  const re = /\s*(a\.limbs\[\d+\]|b\.limbs\[\d+\]|out\.limbs\[\d+\]|select|i32|u32|\d+u|\d+|[A-Za-z_]\w*|!=|<=|>=|>>|<<|[-+*&|()=,<>])/y;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m) { if (/^\s+$/.test(expr.slice(pos))) break; throw new Error('tokenize fail at: ' + JSON.stringify(expr.slice(pos, pos + 24))); }
    toks.push(m[1]); pos = re.lastIndex;
  }
  return toks;
}

function parse(toks) {
  let i = 0;
  const peek = () => toks[i];
  const eat = () => toks[i++];
  function parsePrimary() {
    const t = peek();
    if (t === '(') { eat(); const e = parseExpr(0); if (eat() !== ')') throw new Error('expect )'); return e; }
    if (t === 'select') { eat(); if (eat() !== '(') throw new Error('select('); const a = parseExpr(0); if (eat() !== ',') throw new Error('s,1'); const b = parseExpr(0); if (eat() !== ',') throw new Error('s,2'); const c = parseExpr(0); if (eat() !== ')') throw new Error('s)'); return { op: 'select', a, b, c }; }
    if (t === 'i32' || t === 'u32') { eat(); if (eat() !== '(') throw new Error('cast('); const a = parseExpr(0); if (eat() !== ')') throw new Error('cast)'); return { op: 'cast', to: t, a }; }
    if (/^a\.limbs\[\d+\]$/.test(t)) { eat(); return { op: 'arr', name: 'a', idx: +t.match(/\[(\d+)\]/)[1] }; }
    if (/^b\.limbs\[\d+\]$/.test(t)) { eat(); return { op: 'arr', name: 'b', idx: +t.match(/\[(\d+)\]/)[1] }; }
    if (/^\d+u$/.test(t)) { eat(); return { op: 'lit', v: BigInt(parseInt(t)) }; }
    if (/^\d+$/.test(t)) { eat(); return { op: 'lit', v: BigInt(t) }; }
    if (/^[A-Za-z_]\w*$/.test(t)) { eat(); return { op: 'var', name: t }; }
    throw new Error('primary fail at ' + JSON.stringify(t));
  }
  const PREC = { '*': 6, '&': 5, '>>': 4, '<<': 4, '+': 3, '-': 3, '|': 2, '<': 1, '<=': 1, '>=': 1, '>': 1, '!=': 1 };
  function parseExpr(minPrec) {
    let left = parsePrimary();
    while (true) {
      const t = peek();
      if (t === undefined) break;
      const pr = PREC[t];
      if (pr === undefined || pr < minPrec) break;
      eat();
      const right = parseExpr(pr + 1);
      left = { op: 'bin', o: t, l: left, r: right };
    }
    return left;
  }
  const e = parseExpr(0);
  if (i !== toks.length) throw new Error('trailing: ' + toks.slice(i).join(' '));
  return e;
}

const U32 = 1n << 32n;
const U32MASK = U32 - 1n;
// values are tracked as BigInt; u32 vars are kept in [0,2^32), i32 vars as signed.
function evalNode(n, vars) {
  switch (n.op) {
    case 'lit': return n.v;
    case 'var': { if (!(n.name in vars)) throw new Error('undef var ' + n.name); return vars[n.name]; }
    case 'arr': return BigInt((n.name === 'a' ? curA : curB)[n.idx] >>> 0);
    case 'cast': {
      const x = evalNode(n.a, vars);
      if (n.to === 'u32') { let v = x & U32MASK; return v; }     // reinterpret low 32 bits as unsigned
      // i32: reinterpret low 32 bits as signed
      let v = x & U32MASK; if (v >= (1n << 31n)) v -= U32; return v;
    }
    case 'select': { const cond = evalNode(n.c, vars); return cond ? evalNode(n.b, vars) : evalNode(n.a, vars); }
    case 'bin': {
      const l = evalNode(n.l, vars), r = evalNode(n.r, vars);
      switch (n.o) {
        case '*': { const res = l * r; const a = res < 0n ? -res : res; if (a > maxIntermediate) maxIntermediate = a; return res & U32MASK; }
        case '+': { const res = l + r; const a = res < 0n ? -res : res; if (a > maxIntermediate) maxIntermediate = a; return res & U32MASK; }
        case '-': return l - r;   // used inside i32 context; keep exact (signed)
        case '&': return l & r;
        case '|': return l | r;
        case '>>': return l >> r;
        case '<<': return (l << r) & U32MASK;
        case '<': return l < r ? 1n : 0n;
        case '<=': return l <= r ? 1n : 0n;
        case '>=': return l >= r ? 1n : 0n;
        case '>': return l > r ? 1n : 0n;
        case '!=': return l !== r ? 1n : 0n;
        default: throw new Error('op ' + n.o);
      }
    }
    default: throw new Error('node ' + n.op);
  }
}

// Pre-parse statements into a program.
const program = [];
for (const s of rawStmts) {
  let stmt = s, decl = false;
  if (/^var\s/.test(stmt) || /^let\s/.test(stmt)) { decl = true; stmt = stmt.replace(/^(var|let)\s+/, ''); }
  if (stmt.startsWith('return ')) { program.push({ kind: 'return', name: stmt.slice('return '.length).trim() }); continue; }
  // single decl with initializer "name: type = expr"
  const declInit = stmt.match(/^(\w+):\s*[\w<>,\s]+?\s*=\s*(.+)$/);
  if (decl && declInit) { program.push({ kind: 'assign', lhs: declInit[1], ast: parse(tokenize(declInit[2])) }); continue; }
  // pure type decl "name: type"
  if (decl && /^\w+:\s*[\w<>,\s]+$/.test(stmt) && !stmt.includes('=')) { program.push({ kind: 'decl', lhs: stmt.split(':')[0].trim() }); continue; }
  // assignment lhs = rhs
  const asg = stmt.match(/^([\w.\[\]]+)\s*=\s*(.+)$/);
  if (asg) { program.push({ kind: 'assign', lhs: asg[1], ast: parse(tokenize(asg[2])) }); continue; }
  throw new Error('unparsed stmt: ' + JSON.stringify(stmt));
}

export function runWGSL(aLimbs, bLimbs) {
  curA = aLimbs; curB = bLimbs;
  const vars = Object.create(null);
  const out = new Array(N).fill(0n);
  for (const ins of program) {
    if (ins.kind === 'decl') { vars[ins.lhs] = 0n; continue; }
    if (ins.kind === 'return') return out.map(x => Number(x & ((1n << BigInt(B)) - 1n)));
    const val = evalNode(ins.ast, vars);
    if (ins.lhs.startsWith('out.limbs[')) { const idx = +ins.lhs.match(/\[(\d+)\]/)[1]; out[idx] = val & U32MASK; }
    else vars[ins.lhs] = val;
  }
  return out.map(x => Number(x & ((1n << BigInt(B)) - 1n)));
}

export function maxSeen() { return maxIntermediate; }
export { C };
