import { readFileSync, writeFileSync } from 'node:fs';

const all = readFileSync('/Users/zac/localclaudebox/phonetests/fp_dropin_montmul.wgsl', 'utf8').split('\n');
// fn montgomery_product starts at line 175 (1-indexed); body ends at the line
// immediately before `fn montgomery_product_f8` (line 1298). Closing '}' is line 1296.
// Slice lines 175..1296 inclusive (the full FP fn montgomery_product).
const fnLines = all.slice(174, 1296); // indices 174..1295 => lines 175..1296
let fn = fnLines.join('\n');
if (!fn.startsWith('fn montgomery_product(x_ptr')) throw new Error('unexpected start: ' + fn.slice(0, 60));
if (!/return conditional_reduce\(&sres\);\s*}?\s*$/.test(fn.trim())) {
  // make sure we captured the closing brace
}
// ensure trailing close brace present
const lastClose = fn.lastIndexOf('}');
fn = fn.slice(0, lastClose + 1);

const header = `// === FP-B13 drop-in fn montgomery_product for the karat_yuval scaffold ===
// FP32/FMA 256x256 multiply (B13 TwoProduct schoolbook columns) feeding the
// scaffold's existing integer Yuval reduction. Uses scaffold consts R_INV_*,
// P_LIMB_*, MASK/WORD_SIZE/NUM_WORDS and scaffold conditional_reduce(&sres).
// CHI13/RINV13 are FP-specific and declared here (absent from the scaffold).
const CHI13: f32 = 68719476736.0;     // 2^36
const RINV13: f32 = 0.0001220703125;  // 2^-13
`;
writeFileSync('/Users/zac/localclaudebox/phonetests/rebench_fp_b13_dropin.wgsl', header + fn + '\n');
console.log('wrote rebench_fp_b13_dropin.wgsl');
