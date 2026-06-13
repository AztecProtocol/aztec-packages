// Generate fully-unrolled, ARITHMETIC-BOUND float-limb FP32 256x256 multiply WGSL.
// NMUL independent multiplies, each reading DISTINCT buffer operands (uncloneable by
// the compiler) and writing a DISTINCT output (no DCE). No for-loop, no array temps
// (those spilled/folded last time). Straight-line scalar.
import fs from 'fs';
function maxG(B){return Math.max(1,Math.floor((2**24 - 2**(B-1))/2**(B+1)));}

function oneMul(B, G, idx) {
  const NL = Math.ceil(256/B), NCOL = 2*NL;
  const mask = `0x${((2**B-1)>>>0).toString(16)}u`;
  let s = '';
  const tag = `m${idx}_`;
  // load operands a,b for this mul from buffer offset base+idx*4 (8 u32 each => use 4 vec4)
  s += `  { // multiply #${idx}\n`;
  s += `    let a0 = inbuf[base+${idx*4}u]; let a1 = inbuf[base+${idx*4+1}u];\n`;
  s += `    let b0 = inbuf[base+${idx*4+2}u]; let b1 = inbuf[base+${idx*4+3}u];\n`;
  // limb extraction from the 8 words (a0.xyzw,a1.xyzw)
  const word = (v,wi)=> `${v}${['0','1'][wi<4?0:1]}.${'xyzw'[wi%4]}`;
  for (const [pfx,base2] of [['x','a'],['y','b']]) {
    for (let k=0;k<NL;k++){
      const bit=k*B, wi=(bit/32)|0, off=bit%32;
      let e = `(${word(base2,wi)} >> ${off}u)`;
      if (off + B > 32 && wi < 7) e = `(${e} | (${word(base2,wi+1)} << ${32-off}u))`;
      s += `    let ${tag}${pfx}${k} = f32(${e} & ${mask});\n`;
    }
  }
  for (let k=0;k<NCOL+2;k++) s += `    var c${k}: f32 = 0.0;\n`;
  for (let i2=0;i2<NL;i2++){
    for (let j=0;j<NL;j++){
      const k=i2+j;
      s += `    { let t = fma(${tag}x${i2}, ${tag}y${j}, CHI); let hi = t - CHI; let lo = fma(${tag}x${i2}, ${tag}y${j}, -hi);`;
      s += ` c${k} = c${k} + lo; c${k+1} = c${k+1} + hi * RINV; }\n`;
    }
    if ((i2+1)%G===0 && i2!==NL-1){
      // FLOOR-based renorm (magic-constant renorm gets folded away by the Mali backend).
      for (let k=0;k<NCOL+1;k++)
        s += `    { let hv = floor(c${k} * RINV); c${k} = c${k} - hv * R; c${k+1} = c${k+1} + hv; }\n`;
    }
  }
  for (let k=0;k<NCOL+1;k++)
    s += `    { let hv = floor(c${k} * RINV); c${k} = c${k} - hv * R; c${k+1} = c${k+1} + hv; }\n`;
  // After floor-renorm every c[k] is already in [0,R); just pack limbs (no extra carry).
  s += `    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;\n`;
  const O=['o0','o1','o2','o3','o4','o5','o6','o7'];
  const lowLimbs = Math.ceil(256/B);
  for (let k=0;k<lowLimbs;k++){
    s += `    { let du = u32(c${k});`;
    const bit=k*B, wi=(bit/32)|0, off=bit%32;
    s += ` ${O[wi]} = ${O[wi]} | (du << ${off}u);`;
    if (off + B > 32 && wi<7) s += ` ${O[wi+1]} = ${O[wi+1]} | (du >> ${32-off}u);`;
    s += ` }\n`;
  }
  s += `    outbuf[obase+${idx*2}u] = vec4<u32>(o0,o1,o2,o3);\n`;
  s += `    outbuf[obase+${idx*2+1}u] = vec4<u32>(o4,o5,o6,o7);\n`;
  s += `  }\n`;
  return s;
}

function gen(B, G, NMUL) {
  const NL = Math.ceil(256/B);
  let s = '';
  s += `// AUTO-GEN float-limb FP32 multiply B=${B}-bit (NL=${NL}), deferred-carry G=${G}.\n`;
  s += `// ${NMUL} independent unrolled multiplies, distinct buffer operands+outputs (arith-bound).\n\n`;
  s += `const CHI: f32 = ${2**(23+B)}.0;\n`;
  s += `const CN: f32 = ${3*2**(22+B)}.0;\n`;
  s += `const RINV: f32 = ${1/2**B};\nconst R: f32 = ${2**B}.0;\n\n`;
  s += `@group(0) @binding(0) var<storage, read> inbuf: array<vec4<u32>>;\n`;
  s += `@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<u32>>;\n\n`;
  s += `@compute @workgroup_size(64)\n`;
  s += `fn main(@builtin(global_invocation_id) gid: vec3<u32>) {\n`;
  s += `  let base = gid.x * ${NMUL*4}u;\n`;
  s += `  let obase = gid.x * ${NMUL*2}u;\n`;
  for (let m=0;m<NMUL;m++) s += oneMul(B, G, m);
  s += `}\n`;
  return s;
}

const NMUL = 16;
for (const B of [16,18,20,22]) {
  const G = maxG(B);
  fs.writeFileSync(`fp_largelimb_B${B}.wgsl`, gen(B, G, NMUL));
  console.log(`wrote fp_largelimb_B${B}.wgsl (G=${G}, NL=${Math.ceil(256/B)}, ${NMUL} muls)`);
}
