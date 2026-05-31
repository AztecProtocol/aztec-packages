import {
  P, R, NUM_LIMBS, montmul_fp22, montref, toLimbs22, fromLimbs22, N0_F32, PLIMB,
} from './fp22_host.mjs';
import { writeFileSync } from 'fs';

function montIn(a) { return (a * (R % P)) % P; }
const lines = [];
function run(label, am, bm) {
  const aL = toLimbs22(am).map(Number);
  const bL = toLimbs22(bm).map(Number);
  const outL = montmul_fp22(aL, bL, N0_F32, PLIMB.map(Number));
  const got = ((fromLimbs22(outL) % P) + P) % P;
  const want = montref(am, bm);
  lines.push(`${label}: match=${got === want} got=${got.toString().slice(0,20)} want=${want.toString().slice(0,20)} outL=[${outL.join(',')}]`);
}
run('0x0', montIn(0n), montIn(0n));
run('1x1', montIn(1n), montIn(1n));
run('2x3', montIn(2n), montIn(3n));
run('Pm1xPm1', montIn(P-1n), montIn(P-1n));
lines.push(`N0=${N0_F32} PLIMB=[${PLIMB.join(',')}]`);
lines.push(`sanity montref(In2,In3)=${montref(montIn(2n),montIn(3n)).toString()} In6=${montIn(6n).toString()}`);
writeFileSync('/tmp/fp22_dbg2.txt', lines.join('\n') + '\n');
console.log('WROTE');
