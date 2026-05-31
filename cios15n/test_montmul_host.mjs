// Host bit-exact test: montmulMirror(a,b) == (A*B*R^{-1}) mod p, R=2^255.
// A=fromLimbs(a), B=fromLimbs(b) are Montgomery residues. i.e. montmul computes
// A*B*2^-255 mod p in native 17x15 limbs. Runs in CHUNKS with progress. Edges + random.
import { montmulMirror, CONST } from './gen_cios15n.mjs';
import { writeFileSync, appendFileSync } from 'node:fs';

const p = BigInt(CONST.p);
const B = BigInt(CONST.B);
const N = CONST.N;
const MASK = BigInt(CONST.MASK);
const R = 1n << (B * BigInt(N));        // 2^255
const Rinv = modinv(R % p, p);

function modinv(a, m) {
  let [o, r] = [((a % m) + m) % m, m];
  let [os, s] = [1n, 0n];
  while (r !== 0n) { const q = o / r; [o, r] = [r, o - q * r]; [os, s] = [s, os - q * s]; }
  return ((os % m) + m) % m;
}
function toLimbs(x) { const o = []; let v = ((x % p) + p) % p; for (let i=0;i<N;i++){o.push(Number(v & MASK)); v>>=B;} return o; }
function fromLimbs(l){ let v=0n; for(let i=l.length-1;i>=0;i--) v=(v<<B)|BigInt(l[i]); return v; }
function expected(A, Bx) { return (((A % p) * (Bx % p)) % p * Rinv) % p; }

let fails = 0, run = 0;
const logFails = [];
function checkPair(A, Bx, tag) {
  run++;
  const got = fromLimbs(montmulMirror(toLimbs(A), toLimbs(Bx)));
  const exp = expected(A, Bx);
  if (got !== exp) { fails++; if (logFails.length < 8) logFails.push(`${tag} A=${A} B=${Bx} got=${got} exp=${exp}`); }
}

const edges = [0n, 1n, 2n, p - 1n, p - 2n, R % p, (R*R)%p, (1n<<128n)%p, (1n<<254n)%p, (p+1n)/2n, (p-1n)/2n];
for (const A of edges) for (const Bx of edges) checkPair(A, Bx, 'edge');
writeFileSync('/tmp/mont_progress.txt', `edges_done run=${run} fails=${fails}<<E`);

const TOTAL = Number(process.env.TRIALS || 120000);
const CHUNK = 20000;
let s0 = 0x9e3779b97f4a7c15n, s1 = 0xbf58476d1ce4e5b9n;
function next64(){ let x=s0, y=s1; s0=y; x^=x<<23n; x&=(1n<<64n)-1n; s1=(x^y^(x>>17n)^(y>>26n))&((1n<<64n)-1n); return (s1+y)&((1n<<64n)-1n);}
function randFp(){ let v=0n; for(let k=0;k<4;k++) v=(v<<64n)|next64(); return v % p; }

let done = 0;
while (done < TOTAL) {
  const end = Math.min(done + CHUNK, TOTAL);
  for (let i = done; i < end; i++) checkPair(randFp(), randFp(), 'rand');
  done = end;
  appendFileSync('/tmp/mont_progress.txt', `\nchunk done=${done}/${TOTAL} fails=${fails}<<E`);
  console.log(`progress ${done}/${TOTAL} fails=${fails}`);
}

const verdict = fails === 0 ? 'PASS' : 'FAIL';
const summary = `MONTMUL_HOST ${verdict} run=${run} fails=${fails} ` + (logFails.length ? ('firstfails: ' + logFails.join(' | ')) : '');
writeFileSync('/tmp/mont_verdict.txt', summary + '<<E');
console.log(summary);
process.exit(fails === 0 ? 0 : 1);
