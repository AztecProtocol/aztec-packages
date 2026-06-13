// Generate fully-unrolled FP32 256-bit multiply, Design B8: 8-bit limbs (32),
// plain products, NO error-free transform. Accumulation col += x*y emitted as
// explicit fma(x, y, col) -> lands on Mali FMA pipe. One carry pass.
// Two operands a,b independent (not a square) so the optimizer cannot fold.
import fs from 'fs';
const NL = 32, NCOL = 2*NL;

function gen(useFma) {
  let s = '';
  s += `// AUTO-GEN FP32 256-bit multiply a*b, Design B8 (8-bit limbs, no EFT).\n`;
  s += `// Accumulation via ${useFma ? 'explicit fma()' : 'mul then add'}.\n`;
  s += `// Isolated multiply kernel for malioc; no Montgomery reduction.\n\n`;
  s += `const B: f32 = 256.0;\nconst BINV: f32 = 0.00390625;\n\n`;
  s += `@group(0) @binding(0) var<storage, read> inbuf: array<vec4<u32>>;\n`;
  s += `@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<u32>>;\n\n`;
  s += `@compute @workgroup_size(64)\n`;
  s += `fn main(@builtin(global_invocation_id) gid: vec3<u32>) {\n`;
  s += `  let i = gid.x;\n`;
  s += `  let a0 = inbuf[i*4u]; let a1 = inbuf[i*4u+1u];\n`;
  s += `  let b0 = inbuf[i*4u+2u]; let b1 = inbuf[i*4u+3u];\n`;
  s += `  let aw = array<u32,8>(a0.x,a0.y,a0.z,a0.w,a1.x,a1.y,a1.z,a1.w);\n`;
  s += `  let bw = array<u32,8>(b0.x,b0.y,b0.z,b0.w,b1.x,b1.y,b1.z,b1.w);\n`;
  // 8-bit limbs align perfectly with bytes: limb k = byte k.
  const wordOf = k => `${['aw','bw'][0]}`; // placeholder
  for (const [pfx, arr] of [['x','aw'],['y','bw']]) {
    for (let k = 0; k < NL; k++) {
      const wi = (k/4)|0, byte = k%4;
      s += `  let ${pfx}${k} = f32((${arr}[${wi}] >> ${byte*8}u) & 0xFFu);\n`;
    }
  }
  s += `\n`;
  for (let k = 0; k < NCOL; k++) s += `  var c${k}: f32 = 0.0;\n`;
  s += `\n`;
  for (let i = 0; i < NL; i++) {
    for (let j = 0; j < NL; j++) {
      const k = i + j;
      if (useFma) s += `  c${k} = fma(x${i}, y${j}, c${k});\n`;
      else        s += `  c${k} = c${k} + x${i} * y${j};\n`;
    }
  }
  s += `\n  // carry-normalise base 2^8 (FP), repack low 256 bits\n`;
  s += `  var carry: f32 = 0.0;\n`;
  s += `  var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;\n`;
  const O = ['o0','o1','o2','o3','o4','o5','o6','o7'];
  for (let k = 0; k < 32; k++) {           // low 256 bits = 32 byte-limbs
    const wi = (k/4)|0, byte = k%4;
    s += `  { let t = c${k} + carry; let q = floor(t*BINV); let d = u32(t - q*B); carry = q;`;
    s += ` ${O[wi]} = ${O[wi]} | (d << ${byte*8}u); }\n`;
  }
  s += `\n  outbuf[i*2u]    = vec4<u32>(o0,o1,o2,o3);\n`;
  s += `  outbuf[i*2u+1u] = vec4<u32>(o4,o5,o6,o7);\n}\n`;
  return s;
}
fs.writeFileSync('fp_mul_B8_fma.wgsl', gen(true));
fs.writeFileSync('fp_mul_B8_muladd.wgsl', gen(false));
console.log('wrote fp_mul_B8_fma.wgsl and fp_mul_B8_muladd.wgsl');
