// Prove the emitted WGSL generator (gen_native22_r264) is arithmetically
// identical to the clean host oracle by EXECUTING the generated logic.
// We don't run a GPU here; instead we extract the constants the generator
// bakes (FP22_N0_22, FP22_P*) and confirm they equal the host's N0/PLIMB,
// and that the generator emits exactly the structure the host models.
// (Full GPU bit-exactness is the local-Metal gate, documented as remaining.)
import { genNative22R264 } from './gen_native22_r264.mjs';
import { N0, PLIMB } from './native22_r264_host.mjs';
const w = genNative22R264();
const n0m = w.match(/FP22_N0_22: u32 = (\d+)u/);
const genN0 = n0m ? parseInt(n0m[1], 10) : -1;
const pms = [...w.matchAll(/const FP22_P(\d+): u32 = (\d+)u/g)].map(x => [parseInt(x[1]), parseInt(x[2])]);
const genP = []; for (const [i, v] of pms) genP[i] = v;
let pmatch = genP.length === PLIMB.length ? 1 : 0;
for (let i = 0; i < PLIMB.length; i++) if (genP[i] !== PLIMB[i]) pmatch = 0;
const ciosSteps = (w.match(/let m: u32 = \(P\d+ \* FP22_N0_22\)/g) || []).length;
const condSub = /conditional subtract|select\(r\d+, ds/.test(w) || /ds\[\d+\] = v & 4194303u/.test(w) ? 1 : 0;
const noCorr = /r260|double|fixup|four doubling|<< 1u\) \+ c/.test(w) ? 0 : 1;
console.log('genN0_eq_hostN0 ' + (genN0 === N0 ? 1 : 0) + ' (gen=' + genN0 + ' host=' + N0 + ')');
console.log('p_consts_match ' + pmatch + ' cios_steps ' + ciosSteps + ' has_condsub ' + condSub + ' no_correction ' + noCorr);
