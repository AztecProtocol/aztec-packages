// FP32 256-bit multiply, Design A: B=12-bit limbs, 22 limbs.
// Products a*b are EXACT in FP32 (2B=24 == mantissa). Column sums are kept
// exact with a two-accumulator (hi,lo) TwoSum running total per column.
// This is an ISOLATED multiply kernel for malioc (mirrors min_mul.wgsl shape):
// read 256-bit a from inbuf, compute a*a (512-bit), write low 256 to outbuf.
//
// Goal: move the limb multiplies off Mali's SFU (u32-mul) onto the FMA pipe
// (FP32 mul/fma). Montgomery reduction is intentionally omitted here — the
// SFU pressure is in the multiply, and reduction can stay integer.

const NL: u32 = 22u;        // limbs
const B:  f32 = 4096.0;     // 2^12
const BINV: f32 = 0.000244140625; // 2^-12

// TwoSum: s = a+b rounded, e = exact error. 6 FLOPs (Knuth).
fn two_sum(a: f32, b: f32) -> vec2<f32> {
  let s = a + b;
  let bb = s - a;
  let e = (a - (s - bb)) + (b - bb);
  return vec2<f32>(s, e);
}

@group(0) @binding(0) var<storage, read> inbuf: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let q0 = inbuf[i*2u];
  let q1 = inbuf[i*2u+1u];
  // unpack 8x u32 (256 bit) -> 22 x 12-bit FP32 limbs
  var w = array<u32,8>(q0.x,q0.y,q0.z,q0.w,q1.x,q1.y,q1.z,q1.w);
  var x: array<f32, NL>;
  // bit-extract 12-bit limbs from the 256-bit little-endian word array
  for (var k = 0u; k < NL; k = k + 1u) {
    let bit = k * 12u;
    let wi = bit / 32u;
    let off = bit % 32u;
    var lo = w[wi] >> off;
    if (off > 20u && wi < 7u) {            // limb straddles two words
      lo = lo | (w[wi+1u] << (32u - off));
    }
    x[k] = f32(lo & 0xFFFu);
  }

  // schoolbook a*a into 2*NL columns, hi/lo TwoSum accumulators
  var colHi: array<f32, 44>;
  var colLo: array<f32, 44>;
  for (var k = 0u; k < 2u*NL; k = k + 1u) { colHi[k] = 0.0; colLo[k] = 0.0; }

  for (var ii = 0u; ii < NL; ii = ii + 1u) {
    for (var jj = 0u; jj < NL; jj = jj + 1u) {
      let p = x[ii] * x[jj];        // EXACT FP32 product (< 2^24) -> FMA pipe
      let k = ii + jj;
      let ts = two_sum(colHi[k], p);
      colHi[k] = ts.x;
      colLo[k] = colLo[k] + ts.y;
    }
  }

  // fold lo into hi and carry-normalise base 2^12 (FP), then repack low 256 bits
  var carry: f32 = 0.0;
  var out: array<u32,8> = array<u32,8>(0u,0u,0u,0u,0u,0u,0u,0u);
  var acc_bits: u32 = 0u;   // we rebuild 256-bit little-endian integer
  // Normalise: digit = total mod 2^12, carry = floor(total / 2^12)
  for (var k = 0u; k < 2u*NL; k = k + 1u) {
    let total = colHi[k] + colLo[k] + carry;
    let q = floor(total * BINV);
    let digit = total - q * B;          // in [0, 2^12)
    carry = q;
    // pack 12-bit digit at bit position 12*k into out[8] (only low 256 bits)
    let d = u32(digit);
    let bit = k * 12u;
    if (bit < 256u) {
      let wi = bit / 32u;
      let off = bit % 32u;
      out[wi] = out[wi] | (d << off);
      if (off > 20u && wi < 7u) {
        out[wi+1u] = out[wi+1u] | (d >> (32u - off));
      }
    }
  }

  outbuf[i*2u]    = vec4<u32>(out[0],out[1],out[2],out[3]);
  outbuf[i*2u+1u] = vec4<u32>(out[4],out[5],out[6],out[7]);
}
