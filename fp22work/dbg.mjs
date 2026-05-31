import {
  P, R, NUM_LIMBS, montmul_fp22, montref, toLimbs22, fromLimbs22, N0_F32, PLIMB, modinv,
} from './fp22_host.mjs';

function montIn(a) { return (a * (R % P)) % P; }

function run(am, bm) {
  const aL = toLimbs22(am).map(Number);
  const bL = toLimbs22(bm).map(Number);
  const outL = montmul_fp22(aL, bL, N0_F32, PLIMB.map(Number));
  const got = ((fromLimbs22(outL) % P) + P) % P;
  const want = montref(am, bm);
  console.log('am', am, 'bm', bm);
  console.log('aL', aL.join(','));
  console.log('bL', bL.join(','));
  console.log('outL', outL.join(','));
  console.log('got ', got.toString());
  console.log('want', want.toString());
  console.log('match', got === want);
  console.log('N0', N0_F32, 'PLIMB', PLIMB.join(','));
  console.log('---');
}

run(montIn(0n), montIn(0n));
run(montIn(1n), montIn(1n));
run(montIn(2n), montIn(3n));
// sanity: montref(montIn(a),montIn(b)) should equal montIn(a*b)
const a=2n,b=3n;
console.log('montref(In(a),In(b))=', montref(montIn(a),montIn(b)).toString(), 'In(a*b)=', montIn((a*b)%P).toString());
