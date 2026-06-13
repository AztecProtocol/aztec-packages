// Generate a FULLY-UNROLLED, scalar-variable WGSL FP32 multiply kernel so
// malioc sees register-resident arithmetic (no indexable-temp spills), the
// fair comparison against the unrolled integer min_mul.
//
// Design A: B=12 limbs (NL=22), plain exact products, hi/lo TwoSum columns.
// We also emit Design A' that drops the lo-accumulator (single-accumulator,
// renormalising more often) to cut FLOPs — validated separately in JS.

import fs from 'fs';

const NL = 22;          // 12-bit limbs
const NCOL = 2 * NL;    // product columns

function genUnrolled() {
  let s = '';
  s += `// AUTO-GENERATED fully-unrolled FP32 256-bit square (Design A, B=12).\n`;
  s += `// Plain exact products (2*12=24 mantissa), per-column hi/lo TwoSum.\n`;
  s += `// Isolated multiply kernel for malioc; no Montgomery reduction.\n\n`;
  s += `const B: f32 = 4096.0;\nconst BINV: f32 = 0.000244140625;\n\n`;
  s += `@group(0) @binding(0) var<storage, read> inbuf: array<vec4<u32>>;\n`;
  s += `@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<u32>>;\n\n`;
  s += `@compute @workgroup_size(64)\n`;
  s += `fn main(@builtin(global_invocation_id) gid: vec3<u32>) {\n`;
  s += `  let i = gid.x;\n  let q0 = inbuf[i*2u];\n  let q1 = inbuf[i*2u+1u];\n`;
  s += `  let w0=q0.x; let w1=q0.y; let w2=q0.z; let w3=q0.w;\n`;
  s += `  let w4=q1.x; let w5=q1.y; let w6=q1.z; let w7=q1.w;\n`;
  // unpack 22 x 12-bit limbs as scalar lets x0..x21
  const W = ['w0','w1','w2','w3','w4','w5','w6','w7'];
  for (let k = 0; k < NL; k++) {
    const bit = k*12, wi = (bit/32)|0, off = bit%32;
    let expr = `(${W[wi]} >> ${off}u)`;
    if (off > 20 && wi < 7) expr = `(${expr} | (${W[wi+1]} << ${32-off}u))`;
    s += `  let x${k} = f32(${expr} & 0xFFFu);\n`;
  }
  s += `\n`;
  // column hi/lo accumulators as scalars; build expressions per column.
  // For each column k, list products x[i]*x[j] with i+j=k.
  // We chain TwoSum. To keep it readable & register-light we emit:
  //   var hK = 0.0; var lK = 0.0; then for each product: TwoSum inline.
  for (let k = 0; k < NCOL; k++) { s += `  var h${k}: f32 = 0.0; var l${k}: f32 = 0.0;\n`; }
  s += `\n`;
  let tmp = 0;
  for (let ii = 0; ii < NL; ii++) {
    for (let jj = 0; jj < NL; jj++) {
      const k = ii + jj;
      const p = `p${tmp}`, sname = `s${tmp}`, bb = `b${tmp}`, e = `e${tmp}`;
      tmp++;
      s += `  let ${p} = x${ii} * x${jj};`;
      // TwoSum(h_k, p): s=h+p; bb=s-h; e=(h-(s-bb))+(p-bb); h=s; l+=e
      s += ` { let ${sname} = h${k} + ${p}; let ${bb} = ${sname} - h${k};`;
      s += ` let ${e} = (h${k} - (${sname} - ${bb})) + (${p} - ${bb});`;
      s += ` h${k} = ${sname}; l${k} = l${k} + ${e}; }\n`;
    }
  }
  s += `\n  // fold lo, carry-normalise base 2^12, repack low 256 bits\n`;
  s += `  var carry: f32 = 0.0;\n`;
  s += `  var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;\n`;
  const O = ['o0','o1','o2','o3','o4','o5','o6','o7'];
  for (let k = 0; k < NCOL; k++) {
    const bit = k*12;
    if (bit >= 256) break;
    const wi=(bit/32)|0, off=bit%32;
    s += `  { let total = h${k} + l${k} + carry; let q = floor(total*BINV);`;
    s += ` let digit = total - q*B; carry = q; let d = u32(digit);`;
    s += ` ${O[wi]} = ${O[wi]} | (d << ${off}u);`;
    if (off > 20 && wi < 7) s += ` ${O[wi+1]} = ${O[wi+1]} | (d >> ${32-off}u);`;
    s += ` }\n`;
  }
  s += `\n  outbuf[i*2u]    = vec4<u32>(o0,o1,o2,o3);\n`;
  s += `  outbuf[i*2u+1u] = vec4<u32>(o4,o5,o6,o7);\n}\n`;
  return s;
}

fs.writeFileSync('fp_mul_A_unrolled.wgsl', genUnrolled());
console.log('wrote fp_mul_A_unrolled.wgsl');
