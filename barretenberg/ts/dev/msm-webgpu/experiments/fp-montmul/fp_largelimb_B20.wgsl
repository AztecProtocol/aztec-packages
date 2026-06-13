// AUTO-GEN float-limb FP32 multiply B=20-bit (NL=13), deferred-carry G=7.
// 16 independent unrolled multiplies, distinct buffer operands+outputs (arith-bound).

const CHI: f32 = 8796093022208.0;
const CN: f32 = 13194139533312.0;
const RINV: f32 = 9.5367431640625e-7;
const R: f32 = 1048576.0;

@group(0) @binding(0) var<storage, read> inbuf: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let base = gid.x * 64u;
  let obase = gid.x * 32u;
  { // multiply #0
    let a0 = inbuf[base+0u]; let a1 = inbuf[base+1u];
    let b0 = inbuf[base+2u]; let b1 = inbuf[base+3u];
    let m0_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m0_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m0_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m0_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m0_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m0_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m0_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m0_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m0_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m0_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m0_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m0_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m0_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m0_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m0_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m0_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m0_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m0_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m0_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m0_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m0_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m0_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m0_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m0_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m0_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m0_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m0_x0, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m0_x0, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m0_x0, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m0_x0, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m0_x0, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m0_x0, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m0_x0, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x0, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x0, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x0, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x0, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x0, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x0, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x0, m0_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x1, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m0_x1, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m0_x1, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m0_x1, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m0_x1, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m0_x1, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x1, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x1, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x1, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x1, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x1, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x1, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x1, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x1, m0_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x2, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m0_x2, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m0_x2, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m0_x2, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m0_x2, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x2, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x2, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x2, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x2, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x2, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x2, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x2, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x2, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x2, m0_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x3, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m0_x3, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m0_x3, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m0_x3, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x3, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x3, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x3, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x3, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x3, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x3, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x3, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x3, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x3, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x3, m0_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x4, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m0_x4, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m0_x4, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x4, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x4, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x4, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x4, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x4, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x4, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x4, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x4, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x4, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x4, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x4, m0_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x5, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m0_x5, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x5, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x5, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x5, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x5, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x5, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x5, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x5, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x5, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x5, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x5, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x5, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x5, m0_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x6, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m0_x6, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x6, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x6, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x6, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x6, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x6, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x6, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x6, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x6, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x6, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x6, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x6, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x6, m0_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m0_x7, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m0_x7, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x7, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x7, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x7, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x7, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x7, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x7, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x7, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x7, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x7, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x7, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m0_x7, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x7, m0_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m0_x8, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m0_x8, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x8, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x8, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x8, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x8, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x8, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x8, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x8, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x8, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x8, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m0_x8, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m0_x8, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x8, m0_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m0_x9, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m0_x9, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x9, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x9, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x9, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x9, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x9, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x9, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x9, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x9, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m0_x9, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m0_x9, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m0_x9, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x9, m0_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m0_x10, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m0_x10, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x10, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x10, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x10, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x10, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x10, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x10, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x10, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m0_x10, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m0_x10, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m0_x10, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m0_x10, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x10, m0_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m0_x11, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m0_x11, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x11, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x11, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x11, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x11, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x11, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x11, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m0_x11, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m0_x11, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m0_x11, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m0_x11, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m0_x11, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x11, m0_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m0_x12, m0_y0, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m0_x12, m0_y1, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m0_x12, m0_y2, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m0_x12, m0_y3, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m0_x12, m0_y4, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m0_x12, m0_y5, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m0_x12, m0_y6, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m0_x12, m0_y7, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m0_x12, m0_y8, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m0_x12, m0_y9, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m0_x12, m0_y10, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m0_x12, m0_y11, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m0_x12, m0_y12, CHI); let hi = t - CHI; let lo = fma(m0_x12, m0_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+0u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+1u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #1
    let a0 = inbuf[base+4u]; let a1 = inbuf[base+5u];
    let b0 = inbuf[base+6u]; let b1 = inbuf[base+7u];
    let m1_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m1_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m1_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m1_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m1_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m1_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m1_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m1_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m1_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m1_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m1_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m1_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m1_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m1_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m1_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m1_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m1_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m1_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m1_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m1_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m1_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m1_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m1_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m1_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m1_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m1_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m1_x0, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m1_x0, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m1_x0, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m1_x0, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m1_x0, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m1_x0, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m1_x0, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x0, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x0, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x0, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x0, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x0, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x0, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x0, m1_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x1, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m1_x1, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m1_x1, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m1_x1, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m1_x1, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m1_x1, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x1, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x1, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x1, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x1, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x1, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x1, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x1, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x1, m1_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x2, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m1_x2, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m1_x2, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m1_x2, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m1_x2, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x2, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x2, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x2, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x2, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x2, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x2, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x2, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x2, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x2, m1_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x3, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m1_x3, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m1_x3, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m1_x3, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x3, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x3, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x3, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x3, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x3, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x3, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x3, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x3, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x3, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x3, m1_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x4, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m1_x4, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m1_x4, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x4, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x4, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x4, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x4, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x4, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x4, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x4, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x4, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x4, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x4, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x4, m1_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x5, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m1_x5, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x5, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x5, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x5, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x5, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x5, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x5, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x5, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x5, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x5, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x5, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x5, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x5, m1_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x6, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m1_x6, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x6, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x6, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x6, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x6, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x6, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x6, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x6, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x6, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x6, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x6, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x6, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x6, m1_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m1_x7, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m1_x7, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x7, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x7, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x7, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x7, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x7, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x7, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x7, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x7, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x7, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x7, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m1_x7, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x7, m1_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m1_x8, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m1_x8, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x8, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x8, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x8, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x8, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x8, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x8, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x8, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x8, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x8, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m1_x8, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m1_x8, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x8, m1_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m1_x9, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m1_x9, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x9, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x9, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x9, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x9, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x9, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x9, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x9, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x9, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m1_x9, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m1_x9, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m1_x9, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x9, m1_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m1_x10, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m1_x10, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x10, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x10, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x10, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x10, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x10, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x10, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x10, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m1_x10, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m1_x10, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m1_x10, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m1_x10, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x10, m1_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m1_x11, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m1_x11, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x11, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x11, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x11, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x11, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x11, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x11, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m1_x11, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m1_x11, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m1_x11, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m1_x11, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m1_x11, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x11, m1_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m1_x12, m1_y0, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m1_x12, m1_y1, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m1_x12, m1_y2, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m1_x12, m1_y3, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m1_x12, m1_y4, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m1_x12, m1_y5, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m1_x12, m1_y6, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m1_x12, m1_y7, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m1_x12, m1_y8, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m1_x12, m1_y9, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m1_x12, m1_y10, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m1_x12, m1_y11, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m1_x12, m1_y12, CHI); let hi = t - CHI; let lo = fma(m1_x12, m1_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+2u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+3u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #2
    let a0 = inbuf[base+8u]; let a1 = inbuf[base+9u];
    let b0 = inbuf[base+10u]; let b1 = inbuf[base+11u];
    let m2_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m2_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m2_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m2_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m2_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m2_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m2_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m2_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m2_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m2_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m2_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m2_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m2_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m2_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m2_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m2_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m2_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m2_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m2_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m2_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m2_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m2_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m2_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m2_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m2_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m2_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m2_x0, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m2_x0, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m2_x0, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m2_x0, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m2_x0, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m2_x0, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m2_x0, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x0, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x0, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x0, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x0, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x0, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x0, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x0, m2_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x1, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m2_x1, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m2_x1, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m2_x1, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m2_x1, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m2_x1, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x1, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x1, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x1, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x1, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x1, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x1, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x1, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x1, m2_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x2, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m2_x2, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m2_x2, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m2_x2, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m2_x2, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x2, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x2, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x2, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x2, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x2, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x2, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x2, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x2, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x2, m2_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x3, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m2_x3, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m2_x3, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m2_x3, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x3, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x3, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x3, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x3, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x3, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x3, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x3, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x3, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x3, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x3, m2_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x4, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m2_x4, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m2_x4, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x4, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x4, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x4, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x4, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x4, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x4, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x4, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x4, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x4, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x4, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x4, m2_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x5, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m2_x5, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x5, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x5, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x5, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x5, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x5, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x5, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x5, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x5, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x5, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x5, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x5, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x5, m2_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x6, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m2_x6, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x6, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x6, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x6, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x6, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x6, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x6, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x6, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x6, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x6, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x6, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x6, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x6, m2_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m2_x7, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m2_x7, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x7, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x7, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x7, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x7, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x7, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x7, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x7, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x7, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x7, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x7, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m2_x7, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x7, m2_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m2_x8, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m2_x8, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x8, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x8, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x8, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x8, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x8, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x8, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x8, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x8, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x8, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m2_x8, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m2_x8, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x8, m2_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m2_x9, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m2_x9, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x9, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x9, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x9, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x9, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x9, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x9, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x9, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x9, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m2_x9, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m2_x9, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m2_x9, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x9, m2_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m2_x10, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m2_x10, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x10, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x10, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x10, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x10, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x10, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x10, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x10, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m2_x10, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m2_x10, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m2_x10, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m2_x10, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x10, m2_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m2_x11, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m2_x11, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x11, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x11, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x11, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x11, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x11, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x11, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m2_x11, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m2_x11, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m2_x11, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m2_x11, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m2_x11, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x11, m2_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m2_x12, m2_y0, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m2_x12, m2_y1, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m2_x12, m2_y2, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m2_x12, m2_y3, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m2_x12, m2_y4, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m2_x12, m2_y5, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m2_x12, m2_y6, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m2_x12, m2_y7, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m2_x12, m2_y8, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m2_x12, m2_y9, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m2_x12, m2_y10, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m2_x12, m2_y11, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m2_x12, m2_y12, CHI); let hi = t - CHI; let lo = fma(m2_x12, m2_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+4u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+5u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #3
    let a0 = inbuf[base+12u]; let a1 = inbuf[base+13u];
    let b0 = inbuf[base+14u]; let b1 = inbuf[base+15u];
    let m3_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m3_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m3_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m3_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m3_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m3_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m3_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m3_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m3_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m3_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m3_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m3_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m3_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m3_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m3_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m3_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m3_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m3_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m3_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m3_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m3_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m3_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m3_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m3_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m3_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m3_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m3_x0, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m3_x0, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m3_x0, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m3_x0, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m3_x0, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m3_x0, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m3_x0, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x0, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x0, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x0, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x0, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x0, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x0, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x0, m3_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x1, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m3_x1, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m3_x1, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m3_x1, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m3_x1, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m3_x1, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x1, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x1, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x1, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x1, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x1, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x1, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x1, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x1, m3_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x2, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m3_x2, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m3_x2, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m3_x2, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m3_x2, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x2, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x2, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x2, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x2, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x2, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x2, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x2, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x2, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x2, m3_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x3, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m3_x3, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m3_x3, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m3_x3, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x3, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x3, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x3, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x3, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x3, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x3, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x3, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x3, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x3, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x3, m3_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x4, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m3_x4, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m3_x4, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x4, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x4, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x4, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x4, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x4, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x4, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x4, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x4, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x4, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x4, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x4, m3_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x5, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m3_x5, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x5, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x5, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x5, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x5, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x5, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x5, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x5, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x5, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x5, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x5, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x5, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x5, m3_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x6, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m3_x6, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x6, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x6, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x6, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x6, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x6, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x6, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x6, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x6, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x6, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x6, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x6, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x6, m3_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m3_x7, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m3_x7, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x7, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x7, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x7, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x7, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x7, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x7, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x7, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x7, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x7, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x7, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m3_x7, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x7, m3_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m3_x8, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m3_x8, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x8, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x8, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x8, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x8, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x8, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x8, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x8, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x8, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x8, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m3_x8, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m3_x8, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x8, m3_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m3_x9, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m3_x9, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x9, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x9, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x9, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x9, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x9, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x9, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x9, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x9, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m3_x9, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m3_x9, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m3_x9, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x9, m3_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m3_x10, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m3_x10, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x10, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x10, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x10, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x10, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x10, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x10, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x10, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m3_x10, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m3_x10, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m3_x10, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m3_x10, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x10, m3_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m3_x11, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m3_x11, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x11, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x11, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x11, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x11, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x11, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x11, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m3_x11, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m3_x11, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m3_x11, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m3_x11, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m3_x11, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x11, m3_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m3_x12, m3_y0, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m3_x12, m3_y1, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m3_x12, m3_y2, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m3_x12, m3_y3, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m3_x12, m3_y4, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m3_x12, m3_y5, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m3_x12, m3_y6, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m3_x12, m3_y7, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m3_x12, m3_y8, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m3_x12, m3_y9, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m3_x12, m3_y10, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m3_x12, m3_y11, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m3_x12, m3_y12, CHI); let hi = t - CHI; let lo = fma(m3_x12, m3_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+6u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+7u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #4
    let a0 = inbuf[base+16u]; let a1 = inbuf[base+17u];
    let b0 = inbuf[base+18u]; let b1 = inbuf[base+19u];
    let m4_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m4_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m4_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m4_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m4_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m4_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m4_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m4_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m4_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m4_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m4_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m4_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m4_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m4_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m4_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m4_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m4_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m4_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m4_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m4_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m4_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m4_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m4_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m4_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m4_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m4_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m4_x0, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m4_x0, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m4_x0, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m4_x0, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m4_x0, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m4_x0, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m4_x0, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x0, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x0, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x0, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x0, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x0, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x0, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x0, m4_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x1, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m4_x1, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m4_x1, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m4_x1, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m4_x1, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m4_x1, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x1, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x1, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x1, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x1, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x1, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x1, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x1, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x1, m4_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x2, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m4_x2, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m4_x2, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m4_x2, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m4_x2, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x2, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x2, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x2, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x2, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x2, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x2, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x2, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x2, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x2, m4_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x3, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m4_x3, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m4_x3, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m4_x3, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x3, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x3, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x3, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x3, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x3, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x3, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x3, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x3, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x3, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x3, m4_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x4, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m4_x4, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m4_x4, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x4, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x4, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x4, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x4, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x4, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x4, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x4, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x4, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x4, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x4, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x4, m4_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x5, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m4_x5, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x5, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x5, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x5, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x5, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x5, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x5, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x5, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x5, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x5, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x5, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x5, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x5, m4_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x6, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m4_x6, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x6, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x6, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x6, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x6, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x6, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x6, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x6, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x6, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x6, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x6, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x6, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x6, m4_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m4_x7, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m4_x7, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x7, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x7, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x7, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x7, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x7, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x7, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x7, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x7, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x7, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x7, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m4_x7, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x7, m4_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m4_x8, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m4_x8, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x8, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x8, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x8, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x8, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x8, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x8, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x8, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x8, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x8, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m4_x8, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m4_x8, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x8, m4_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m4_x9, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m4_x9, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x9, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x9, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x9, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x9, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x9, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x9, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x9, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x9, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m4_x9, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m4_x9, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m4_x9, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x9, m4_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m4_x10, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m4_x10, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x10, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x10, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x10, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x10, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x10, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x10, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x10, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m4_x10, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m4_x10, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m4_x10, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m4_x10, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x10, m4_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m4_x11, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m4_x11, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x11, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x11, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x11, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x11, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x11, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x11, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m4_x11, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m4_x11, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m4_x11, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m4_x11, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m4_x11, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x11, m4_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m4_x12, m4_y0, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m4_x12, m4_y1, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m4_x12, m4_y2, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m4_x12, m4_y3, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m4_x12, m4_y4, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m4_x12, m4_y5, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m4_x12, m4_y6, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m4_x12, m4_y7, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m4_x12, m4_y8, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m4_x12, m4_y9, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m4_x12, m4_y10, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m4_x12, m4_y11, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m4_x12, m4_y12, CHI); let hi = t - CHI; let lo = fma(m4_x12, m4_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+8u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+9u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #5
    let a0 = inbuf[base+20u]; let a1 = inbuf[base+21u];
    let b0 = inbuf[base+22u]; let b1 = inbuf[base+23u];
    let m5_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m5_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m5_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m5_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m5_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m5_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m5_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m5_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m5_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m5_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m5_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m5_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m5_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m5_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m5_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m5_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m5_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m5_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m5_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m5_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m5_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m5_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m5_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m5_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m5_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m5_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m5_x0, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m5_x0, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m5_x0, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m5_x0, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m5_x0, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m5_x0, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m5_x0, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x0, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x0, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x0, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x0, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x0, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x0, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x0, m5_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x1, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m5_x1, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m5_x1, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m5_x1, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m5_x1, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m5_x1, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x1, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x1, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x1, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x1, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x1, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x1, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x1, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x1, m5_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x2, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m5_x2, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m5_x2, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m5_x2, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m5_x2, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x2, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x2, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x2, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x2, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x2, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x2, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x2, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x2, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x2, m5_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x3, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m5_x3, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m5_x3, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m5_x3, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x3, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x3, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x3, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x3, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x3, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x3, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x3, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x3, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x3, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x3, m5_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x4, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m5_x4, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m5_x4, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x4, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x4, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x4, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x4, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x4, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x4, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x4, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x4, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x4, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x4, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x4, m5_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x5, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m5_x5, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x5, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x5, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x5, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x5, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x5, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x5, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x5, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x5, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x5, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x5, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x5, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x5, m5_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x6, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m5_x6, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x6, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x6, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x6, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x6, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x6, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x6, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x6, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x6, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x6, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x6, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x6, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x6, m5_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m5_x7, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m5_x7, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x7, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x7, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x7, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x7, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x7, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x7, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x7, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x7, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x7, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x7, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m5_x7, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x7, m5_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m5_x8, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m5_x8, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x8, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x8, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x8, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x8, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x8, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x8, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x8, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x8, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x8, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m5_x8, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m5_x8, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x8, m5_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m5_x9, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m5_x9, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x9, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x9, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x9, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x9, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x9, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x9, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x9, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x9, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m5_x9, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m5_x9, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m5_x9, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x9, m5_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m5_x10, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m5_x10, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x10, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x10, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x10, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x10, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x10, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x10, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x10, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m5_x10, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m5_x10, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m5_x10, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m5_x10, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x10, m5_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m5_x11, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m5_x11, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x11, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x11, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x11, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x11, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x11, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x11, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m5_x11, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m5_x11, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m5_x11, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m5_x11, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m5_x11, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x11, m5_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m5_x12, m5_y0, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m5_x12, m5_y1, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m5_x12, m5_y2, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m5_x12, m5_y3, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m5_x12, m5_y4, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m5_x12, m5_y5, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m5_x12, m5_y6, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m5_x12, m5_y7, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m5_x12, m5_y8, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m5_x12, m5_y9, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m5_x12, m5_y10, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m5_x12, m5_y11, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m5_x12, m5_y12, CHI); let hi = t - CHI; let lo = fma(m5_x12, m5_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+10u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+11u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #6
    let a0 = inbuf[base+24u]; let a1 = inbuf[base+25u];
    let b0 = inbuf[base+26u]; let b1 = inbuf[base+27u];
    let m6_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m6_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m6_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m6_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m6_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m6_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m6_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m6_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m6_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m6_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m6_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m6_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m6_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m6_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m6_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m6_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m6_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m6_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m6_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m6_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m6_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m6_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m6_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m6_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m6_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m6_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m6_x0, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m6_x0, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m6_x0, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m6_x0, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m6_x0, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m6_x0, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m6_x0, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x0, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x0, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x0, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x0, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x0, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x0, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x0, m6_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x1, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m6_x1, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m6_x1, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m6_x1, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m6_x1, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m6_x1, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x1, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x1, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x1, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x1, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x1, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x1, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x1, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x1, m6_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x2, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m6_x2, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m6_x2, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m6_x2, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m6_x2, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x2, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x2, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x2, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x2, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x2, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x2, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x2, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x2, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x2, m6_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x3, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m6_x3, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m6_x3, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m6_x3, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x3, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x3, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x3, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x3, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x3, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x3, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x3, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x3, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x3, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x3, m6_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x4, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m6_x4, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m6_x4, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x4, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x4, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x4, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x4, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x4, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x4, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x4, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x4, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x4, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x4, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x4, m6_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x5, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m6_x5, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x5, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x5, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x5, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x5, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x5, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x5, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x5, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x5, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x5, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x5, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x5, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x5, m6_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x6, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m6_x6, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x6, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x6, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x6, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x6, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x6, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x6, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x6, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x6, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x6, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x6, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x6, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x6, m6_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m6_x7, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m6_x7, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x7, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x7, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x7, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x7, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x7, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x7, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x7, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x7, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x7, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x7, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m6_x7, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x7, m6_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m6_x8, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m6_x8, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x8, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x8, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x8, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x8, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x8, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x8, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x8, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x8, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x8, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m6_x8, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m6_x8, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x8, m6_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m6_x9, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m6_x9, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x9, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x9, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x9, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x9, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x9, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x9, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x9, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x9, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m6_x9, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m6_x9, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m6_x9, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x9, m6_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m6_x10, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m6_x10, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x10, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x10, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x10, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x10, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x10, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x10, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x10, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m6_x10, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m6_x10, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m6_x10, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m6_x10, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x10, m6_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m6_x11, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m6_x11, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x11, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x11, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x11, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x11, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x11, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x11, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m6_x11, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m6_x11, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m6_x11, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m6_x11, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m6_x11, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x11, m6_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m6_x12, m6_y0, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m6_x12, m6_y1, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m6_x12, m6_y2, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m6_x12, m6_y3, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m6_x12, m6_y4, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m6_x12, m6_y5, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m6_x12, m6_y6, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m6_x12, m6_y7, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m6_x12, m6_y8, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m6_x12, m6_y9, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m6_x12, m6_y10, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m6_x12, m6_y11, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m6_x12, m6_y12, CHI); let hi = t - CHI; let lo = fma(m6_x12, m6_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+12u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+13u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #7
    let a0 = inbuf[base+28u]; let a1 = inbuf[base+29u];
    let b0 = inbuf[base+30u]; let b1 = inbuf[base+31u];
    let m7_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m7_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m7_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m7_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m7_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m7_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m7_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m7_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m7_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m7_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m7_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m7_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m7_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m7_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m7_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m7_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m7_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m7_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m7_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m7_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m7_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m7_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m7_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m7_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m7_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m7_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m7_x0, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m7_x0, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m7_x0, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m7_x0, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m7_x0, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m7_x0, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m7_x0, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x0, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x0, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x0, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x0, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x0, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x0, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x0, m7_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x1, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m7_x1, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m7_x1, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m7_x1, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m7_x1, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m7_x1, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x1, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x1, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x1, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x1, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x1, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x1, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x1, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x1, m7_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x2, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m7_x2, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m7_x2, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m7_x2, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m7_x2, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x2, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x2, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x2, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x2, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x2, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x2, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x2, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x2, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x2, m7_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x3, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m7_x3, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m7_x3, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m7_x3, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x3, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x3, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x3, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x3, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x3, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x3, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x3, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x3, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x3, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x3, m7_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x4, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m7_x4, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m7_x4, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x4, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x4, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x4, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x4, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x4, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x4, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x4, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x4, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x4, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x4, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x4, m7_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x5, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m7_x5, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x5, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x5, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x5, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x5, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x5, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x5, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x5, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x5, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x5, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x5, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x5, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x5, m7_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x6, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m7_x6, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x6, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x6, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x6, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x6, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x6, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x6, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x6, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x6, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x6, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x6, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x6, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x6, m7_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m7_x7, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m7_x7, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x7, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x7, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x7, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x7, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x7, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x7, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x7, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x7, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x7, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x7, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m7_x7, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x7, m7_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m7_x8, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m7_x8, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x8, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x8, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x8, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x8, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x8, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x8, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x8, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x8, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x8, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m7_x8, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m7_x8, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x8, m7_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m7_x9, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m7_x9, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x9, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x9, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x9, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x9, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x9, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x9, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x9, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x9, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m7_x9, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m7_x9, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m7_x9, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x9, m7_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m7_x10, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m7_x10, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x10, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x10, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x10, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x10, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x10, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x10, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x10, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m7_x10, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m7_x10, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m7_x10, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m7_x10, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x10, m7_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m7_x11, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m7_x11, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x11, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x11, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x11, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x11, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x11, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x11, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m7_x11, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m7_x11, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m7_x11, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m7_x11, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m7_x11, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x11, m7_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m7_x12, m7_y0, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m7_x12, m7_y1, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m7_x12, m7_y2, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m7_x12, m7_y3, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m7_x12, m7_y4, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m7_x12, m7_y5, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m7_x12, m7_y6, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m7_x12, m7_y7, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m7_x12, m7_y8, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m7_x12, m7_y9, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m7_x12, m7_y10, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m7_x12, m7_y11, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m7_x12, m7_y12, CHI); let hi = t - CHI; let lo = fma(m7_x12, m7_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+14u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+15u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #8
    let a0 = inbuf[base+32u]; let a1 = inbuf[base+33u];
    let b0 = inbuf[base+34u]; let b1 = inbuf[base+35u];
    let m8_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m8_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m8_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m8_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m8_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m8_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m8_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m8_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m8_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m8_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m8_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m8_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m8_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m8_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m8_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m8_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m8_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m8_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m8_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m8_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m8_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m8_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m8_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m8_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m8_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m8_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m8_x0, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m8_x0, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m8_x0, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m8_x0, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m8_x0, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m8_x0, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m8_x0, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x0, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x0, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x0, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x0, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x0, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x0, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x0, m8_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x1, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m8_x1, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m8_x1, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m8_x1, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m8_x1, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m8_x1, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x1, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x1, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x1, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x1, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x1, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x1, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x1, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x1, m8_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x2, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m8_x2, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m8_x2, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m8_x2, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m8_x2, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x2, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x2, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x2, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x2, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x2, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x2, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x2, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x2, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x2, m8_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x3, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m8_x3, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m8_x3, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m8_x3, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x3, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x3, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x3, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x3, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x3, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x3, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x3, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x3, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x3, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x3, m8_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x4, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m8_x4, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m8_x4, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x4, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x4, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x4, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x4, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x4, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x4, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x4, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x4, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x4, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x4, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x4, m8_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x5, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m8_x5, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x5, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x5, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x5, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x5, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x5, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x5, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x5, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x5, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x5, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x5, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x5, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x5, m8_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x6, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m8_x6, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x6, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x6, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x6, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x6, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x6, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x6, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x6, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x6, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x6, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x6, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x6, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x6, m8_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m8_x7, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m8_x7, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x7, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x7, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x7, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x7, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x7, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x7, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x7, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x7, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x7, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x7, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m8_x7, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x7, m8_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m8_x8, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m8_x8, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x8, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x8, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x8, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x8, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x8, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x8, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x8, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x8, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x8, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m8_x8, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m8_x8, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x8, m8_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m8_x9, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m8_x9, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x9, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x9, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x9, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x9, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x9, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x9, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x9, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x9, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m8_x9, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m8_x9, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m8_x9, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x9, m8_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m8_x10, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m8_x10, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x10, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x10, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x10, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x10, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x10, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x10, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x10, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m8_x10, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m8_x10, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m8_x10, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m8_x10, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x10, m8_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m8_x11, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m8_x11, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x11, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x11, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x11, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x11, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x11, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x11, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m8_x11, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m8_x11, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m8_x11, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m8_x11, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m8_x11, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x11, m8_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m8_x12, m8_y0, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m8_x12, m8_y1, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m8_x12, m8_y2, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m8_x12, m8_y3, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m8_x12, m8_y4, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m8_x12, m8_y5, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m8_x12, m8_y6, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m8_x12, m8_y7, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m8_x12, m8_y8, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m8_x12, m8_y9, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m8_x12, m8_y10, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m8_x12, m8_y11, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m8_x12, m8_y12, CHI); let hi = t - CHI; let lo = fma(m8_x12, m8_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+16u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+17u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #9
    let a0 = inbuf[base+36u]; let a1 = inbuf[base+37u];
    let b0 = inbuf[base+38u]; let b1 = inbuf[base+39u];
    let m9_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m9_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m9_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m9_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m9_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m9_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m9_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m9_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m9_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m9_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m9_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m9_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m9_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m9_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m9_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m9_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m9_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m9_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m9_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m9_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m9_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m9_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m9_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m9_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m9_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m9_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m9_x0, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m9_x0, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m9_x0, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m9_x0, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m9_x0, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m9_x0, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m9_x0, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x0, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x0, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x0, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x0, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x0, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x0, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x0, m9_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x1, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m9_x1, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m9_x1, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m9_x1, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m9_x1, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m9_x1, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x1, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x1, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x1, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x1, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x1, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x1, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x1, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x1, m9_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x2, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m9_x2, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m9_x2, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m9_x2, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m9_x2, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x2, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x2, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x2, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x2, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x2, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x2, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x2, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x2, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x2, m9_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x3, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m9_x3, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m9_x3, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m9_x3, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x3, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x3, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x3, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x3, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x3, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x3, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x3, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x3, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x3, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x3, m9_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x4, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m9_x4, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m9_x4, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x4, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x4, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x4, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x4, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x4, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x4, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x4, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x4, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x4, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x4, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x4, m9_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x5, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m9_x5, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x5, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x5, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x5, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x5, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x5, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x5, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x5, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x5, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x5, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x5, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x5, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x5, m9_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x6, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m9_x6, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x6, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x6, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x6, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x6, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x6, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x6, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x6, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x6, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x6, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x6, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x6, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x6, m9_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m9_x7, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m9_x7, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x7, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x7, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x7, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x7, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x7, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x7, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x7, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x7, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x7, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x7, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m9_x7, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x7, m9_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m9_x8, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m9_x8, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x8, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x8, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x8, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x8, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x8, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x8, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x8, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x8, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x8, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m9_x8, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m9_x8, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x8, m9_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m9_x9, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m9_x9, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x9, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x9, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x9, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x9, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x9, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x9, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x9, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x9, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m9_x9, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m9_x9, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m9_x9, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x9, m9_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m9_x10, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m9_x10, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x10, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x10, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x10, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x10, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x10, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x10, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x10, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m9_x10, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m9_x10, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m9_x10, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m9_x10, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x10, m9_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m9_x11, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m9_x11, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x11, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x11, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x11, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x11, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x11, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x11, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m9_x11, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m9_x11, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m9_x11, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m9_x11, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m9_x11, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x11, m9_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m9_x12, m9_y0, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m9_x12, m9_y1, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m9_x12, m9_y2, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m9_x12, m9_y3, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m9_x12, m9_y4, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m9_x12, m9_y5, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m9_x12, m9_y6, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m9_x12, m9_y7, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m9_x12, m9_y8, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m9_x12, m9_y9, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m9_x12, m9_y10, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m9_x12, m9_y11, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m9_x12, m9_y12, CHI); let hi = t - CHI; let lo = fma(m9_x12, m9_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+18u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+19u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #10
    let a0 = inbuf[base+40u]; let a1 = inbuf[base+41u];
    let b0 = inbuf[base+42u]; let b1 = inbuf[base+43u];
    let m10_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m10_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m10_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m10_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m10_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m10_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m10_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m10_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m10_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m10_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m10_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m10_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m10_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m10_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m10_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m10_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m10_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m10_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m10_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m10_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m10_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m10_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m10_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m10_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m10_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m10_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m10_x0, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m10_x0, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m10_x0, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m10_x0, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m10_x0, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m10_x0, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m10_x0, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x0, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x0, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x0, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x0, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x0, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x0, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x0, m10_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x1, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m10_x1, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m10_x1, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m10_x1, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m10_x1, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m10_x1, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x1, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x1, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x1, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x1, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x1, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x1, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x1, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x1, m10_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x2, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m10_x2, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m10_x2, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m10_x2, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m10_x2, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x2, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x2, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x2, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x2, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x2, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x2, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x2, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x2, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x2, m10_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x3, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m10_x3, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m10_x3, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m10_x3, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x3, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x3, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x3, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x3, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x3, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x3, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x3, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x3, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x3, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x3, m10_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x4, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m10_x4, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m10_x4, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x4, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x4, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x4, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x4, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x4, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x4, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x4, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x4, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x4, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x4, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x4, m10_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x5, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m10_x5, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x5, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x5, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x5, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x5, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x5, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x5, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x5, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x5, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x5, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x5, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x5, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x5, m10_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x6, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m10_x6, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x6, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x6, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x6, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x6, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x6, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x6, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x6, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x6, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x6, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x6, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x6, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x6, m10_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m10_x7, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m10_x7, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x7, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x7, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x7, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x7, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x7, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x7, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x7, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x7, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x7, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x7, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m10_x7, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x7, m10_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m10_x8, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m10_x8, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x8, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x8, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x8, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x8, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x8, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x8, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x8, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x8, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x8, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m10_x8, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m10_x8, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x8, m10_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m10_x9, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m10_x9, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x9, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x9, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x9, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x9, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x9, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x9, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x9, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x9, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m10_x9, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m10_x9, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m10_x9, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x9, m10_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m10_x10, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m10_x10, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x10, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x10, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x10, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x10, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x10, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x10, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x10, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m10_x10, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m10_x10, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m10_x10, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m10_x10, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x10, m10_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m10_x11, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m10_x11, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x11, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x11, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x11, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x11, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x11, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x11, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m10_x11, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m10_x11, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m10_x11, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m10_x11, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m10_x11, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x11, m10_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m10_x12, m10_y0, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m10_x12, m10_y1, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m10_x12, m10_y2, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m10_x12, m10_y3, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m10_x12, m10_y4, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m10_x12, m10_y5, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m10_x12, m10_y6, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m10_x12, m10_y7, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m10_x12, m10_y8, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m10_x12, m10_y9, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m10_x12, m10_y10, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m10_x12, m10_y11, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m10_x12, m10_y12, CHI); let hi = t - CHI; let lo = fma(m10_x12, m10_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+20u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+21u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #11
    let a0 = inbuf[base+44u]; let a1 = inbuf[base+45u];
    let b0 = inbuf[base+46u]; let b1 = inbuf[base+47u];
    let m11_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m11_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m11_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m11_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m11_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m11_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m11_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m11_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m11_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m11_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m11_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m11_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m11_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m11_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m11_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m11_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m11_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m11_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m11_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m11_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m11_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m11_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m11_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m11_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m11_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m11_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m11_x0, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m11_x0, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m11_x0, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m11_x0, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m11_x0, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m11_x0, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m11_x0, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x0, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x0, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x0, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x0, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x0, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x0, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x0, m11_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x1, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m11_x1, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m11_x1, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m11_x1, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m11_x1, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m11_x1, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x1, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x1, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x1, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x1, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x1, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x1, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x1, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x1, m11_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x2, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m11_x2, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m11_x2, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m11_x2, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m11_x2, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x2, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x2, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x2, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x2, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x2, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x2, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x2, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x2, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x2, m11_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x3, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m11_x3, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m11_x3, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m11_x3, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x3, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x3, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x3, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x3, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x3, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x3, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x3, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x3, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x3, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x3, m11_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x4, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m11_x4, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m11_x4, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x4, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x4, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x4, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x4, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x4, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x4, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x4, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x4, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x4, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x4, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x4, m11_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x5, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m11_x5, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x5, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x5, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x5, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x5, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x5, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x5, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x5, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x5, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x5, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x5, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x5, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x5, m11_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x6, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m11_x6, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x6, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x6, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x6, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x6, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x6, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x6, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x6, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x6, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x6, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x6, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x6, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x6, m11_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m11_x7, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m11_x7, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x7, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x7, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x7, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x7, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x7, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x7, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x7, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x7, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x7, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x7, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m11_x7, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x7, m11_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m11_x8, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m11_x8, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x8, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x8, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x8, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x8, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x8, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x8, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x8, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x8, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x8, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m11_x8, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m11_x8, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x8, m11_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m11_x9, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m11_x9, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x9, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x9, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x9, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x9, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x9, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x9, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x9, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x9, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m11_x9, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m11_x9, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m11_x9, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x9, m11_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m11_x10, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m11_x10, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x10, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x10, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x10, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x10, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x10, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x10, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x10, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m11_x10, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m11_x10, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m11_x10, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m11_x10, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x10, m11_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m11_x11, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m11_x11, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x11, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x11, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x11, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x11, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x11, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x11, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m11_x11, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m11_x11, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m11_x11, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m11_x11, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m11_x11, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x11, m11_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m11_x12, m11_y0, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m11_x12, m11_y1, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m11_x12, m11_y2, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m11_x12, m11_y3, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m11_x12, m11_y4, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m11_x12, m11_y5, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m11_x12, m11_y6, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m11_x12, m11_y7, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m11_x12, m11_y8, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m11_x12, m11_y9, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m11_x12, m11_y10, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m11_x12, m11_y11, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m11_x12, m11_y12, CHI); let hi = t - CHI; let lo = fma(m11_x12, m11_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+22u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+23u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #12
    let a0 = inbuf[base+48u]; let a1 = inbuf[base+49u];
    let b0 = inbuf[base+50u]; let b1 = inbuf[base+51u];
    let m12_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m12_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m12_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m12_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m12_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m12_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m12_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m12_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m12_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m12_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m12_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m12_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m12_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m12_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m12_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m12_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m12_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m12_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m12_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m12_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m12_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m12_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m12_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m12_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m12_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m12_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m12_x0, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m12_x0, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m12_x0, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m12_x0, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m12_x0, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m12_x0, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m12_x0, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x0, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x0, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x0, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x0, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x0, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x0, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x0, m12_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x1, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m12_x1, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m12_x1, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m12_x1, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m12_x1, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m12_x1, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x1, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x1, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x1, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x1, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x1, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x1, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x1, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x1, m12_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x2, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m12_x2, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m12_x2, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m12_x2, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m12_x2, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x2, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x2, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x2, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x2, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x2, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x2, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x2, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x2, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x2, m12_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x3, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m12_x3, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m12_x3, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m12_x3, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x3, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x3, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x3, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x3, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x3, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x3, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x3, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x3, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x3, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x3, m12_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x4, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m12_x4, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m12_x4, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x4, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x4, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x4, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x4, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x4, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x4, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x4, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x4, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x4, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x4, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x4, m12_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x5, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m12_x5, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x5, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x5, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x5, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x5, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x5, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x5, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x5, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x5, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x5, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x5, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x5, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x5, m12_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x6, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m12_x6, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x6, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x6, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x6, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x6, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x6, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x6, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x6, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x6, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x6, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x6, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x6, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x6, m12_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m12_x7, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m12_x7, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x7, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x7, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x7, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x7, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x7, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x7, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x7, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x7, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x7, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x7, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m12_x7, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x7, m12_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m12_x8, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m12_x8, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x8, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x8, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x8, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x8, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x8, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x8, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x8, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x8, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x8, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m12_x8, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m12_x8, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x8, m12_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m12_x9, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m12_x9, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x9, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x9, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x9, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x9, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x9, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x9, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x9, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x9, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m12_x9, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m12_x9, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m12_x9, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x9, m12_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m12_x10, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m12_x10, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x10, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x10, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x10, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x10, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x10, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x10, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x10, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m12_x10, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m12_x10, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m12_x10, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m12_x10, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x10, m12_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m12_x11, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m12_x11, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x11, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x11, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x11, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x11, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x11, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x11, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m12_x11, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m12_x11, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m12_x11, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m12_x11, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m12_x11, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x11, m12_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m12_x12, m12_y0, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m12_x12, m12_y1, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m12_x12, m12_y2, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m12_x12, m12_y3, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m12_x12, m12_y4, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m12_x12, m12_y5, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m12_x12, m12_y6, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m12_x12, m12_y7, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m12_x12, m12_y8, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m12_x12, m12_y9, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m12_x12, m12_y10, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m12_x12, m12_y11, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m12_x12, m12_y12, CHI); let hi = t - CHI; let lo = fma(m12_x12, m12_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+24u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+25u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #13
    let a0 = inbuf[base+52u]; let a1 = inbuf[base+53u];
    let b0 = inbuf[base+54u]; let b1 = inbuf[base+55u];
    let m13_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m13_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m13_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m13_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m13_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m13_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m13_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m13_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m13_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m13_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m13_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m13_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m13_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m13_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m13_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m13_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m13_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m13_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m13_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m13_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m13_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m13_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m13_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m13_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m13_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m13_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m13_x0, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m13_x0, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m13_x0, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m13_x0, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m13_x0, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m13_x0, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m13_x0, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x0, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x0, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x0, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x0, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x0, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x0, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x0, m13_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x1, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m13_x1, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m13_x1, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m13_x1, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m13_x1, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m13_x1, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x1, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x1, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x1, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x1, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x1, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x1, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x1, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x1, m13_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x2, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m13_x2, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m13_x2, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m13_x2, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m13_x2, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x2, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x2, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x2, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x2, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x2, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x2, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x2, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x2, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x2, m13_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x3, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m13_x3, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m13_x3, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m13_x3, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x3, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x3, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x3, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x3, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x3, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x3, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x3, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x3, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x3, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x3, m13_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x4, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m13_x4, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m13_x4, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x4, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x4, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x4, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x4, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x4, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x4, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x4, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x4, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x4, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x4, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x4, m13_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x5, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m13_x5, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x5, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x5, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x5, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x5, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x5, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x5, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x5, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x5, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x5, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x5, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x5, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x5, m13_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x6, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m13_x6, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x6, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x6, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x6, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x6, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x6, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x6, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x6, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x6, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x6, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x6, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x6, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x6, m13_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m13_x7, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m13_x7, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x7, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x7, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x7, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x7, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x7, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x7, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x7, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x7, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x7, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x7, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m13_x7, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x7, m13_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m13_x8, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m13_x8, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x8, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x8, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x8, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x8, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x8, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x8, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x8, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x8, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x8, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m13_x8, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m13_x8, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x8, m13_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m13_x9, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m13_x9, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x9, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x9, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x9, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x9, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x9, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x9, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x9, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x9, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m13_x9, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m13_x9, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m13_x9, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x9, m13_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m13_x10, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m13_x10, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x10, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x10, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x10, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x10, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x10, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x10, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x10, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m13_x10, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m13_x10, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m13_x10, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m13_x10, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x10, m13_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m13_x11, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m13_x11, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x11, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x11, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x11, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x11, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x11, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x11, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m13_x11, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m13_x11, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m13_x11, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m13_x11, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m13_x11, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x11, m13_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m13_x12, m13_y0, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m13_x12, m13_y1, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m13_x12, m13_y2, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m13_x12, m13_y3, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m13_x12, m13_y4, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m13_x12, m13_y5, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m13_x12, m13_y6, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m13_x12, m13_y7, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m13_x12, m13_y8, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m13_x12, m13_y9, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m13_x12, m13_y10, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m13_x12, m13_y11, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m13_x12, m13_y12, CHI); let hi = t - CHI; let lo = fma(m13_x12, m13_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+26u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+27u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #14
    let a0 = inbuf[base+56u]; let a1 = inbuf[base+57u];
    let b0 = inbuf[base+58u]; let b1 = inbuf[base+59u];
    let m14_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m14_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m14_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m14_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m14_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m14_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m14_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m14_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m14_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m14_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m14_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m14_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m14_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m14_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m14_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m14_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m14_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m14_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m14_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m14_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m14_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m14_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m14_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m14_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m14_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m14_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m14_x0, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m14_x0, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m14_x0, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m14_x0, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m14_x0, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m14_x0, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m14_x0, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x0, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x0, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x0, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x0, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x0, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x0, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x0, m14_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x1, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m14_x1, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m14_x1, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m14_x1, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m14_x1, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m14_x1, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x1, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x1, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x1, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x1, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x1, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x1, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x1, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x1, m14_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x2, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m14_x2, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m14_x2, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m14_x2, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m14_x2, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x2, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x2, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x2, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x2, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x2, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x2, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x2, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x2, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x2, m14_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x3, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m14_x3, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m14_x3, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m14_x3, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x3, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x3, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x3, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x3, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x3, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x3, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x3, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x3, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x3, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x3, m14_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x4, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m14_x4, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m14_x4, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x4, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x4, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x4, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x4, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x4, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x4, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x4, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x4, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x4, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x4, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x4, m14_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x5, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m14_x5, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x5, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x5, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x5, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x5, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x5, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x5, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x5, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x5, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x5, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x5, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x5, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x5, m14_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x6, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m14_x6, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x6, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x6, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x6, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x6, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x6, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x6, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x6, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x6, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x6, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x6, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x6, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x6, m14_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m14_x7, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m14_x7, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x7, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x7, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x7, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x7, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x7, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x7, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x7, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x7, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x7, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x7, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m14_x7, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x7, m14_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m14_x8, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m14_x8, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x8, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x8, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x8, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x8, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x8, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x8, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x8, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x8, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x8, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m14_x8, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m14_x8, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x8, m14_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m14_x9, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m14_x9, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x9, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x9, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x9, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x9, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x9, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x9, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x9, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x9, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m14_x9, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m14_x9, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m14_x9, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x9, m14_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m14_x10, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m14_x10, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x10, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x10, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x10, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x10, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x10, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x10, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x10, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m14_x10, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m14_x10, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m14_x10, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m14_x10, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x10, m14_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m14_x11, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m14_x11, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x11, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x11, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x11, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x11, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x11, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x11, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m14_x11, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m14_x11, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m14_x11, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m14_x11, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m14_x11, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x11, m14_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m14_x12, m14_y0, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m14_x12, m14_y1, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m14_x12, m14_y2, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m14_x12, m14_y3, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m14_x12, m14_y4, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m14_x12, m14_y5, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m14_x12, m14_y6, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m14_x12, m14_y7, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m14_x12, m14_y8, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m14_x12, m14_y9, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m14_x12, m14_y10, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m14_x12, m14_y11, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m14_x12, m14_y12, CHI); let hi = t - CHI; let lo = fma(m14_x12, m14_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+28u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+29u] = vec4<u32>(o4,o5,o6,o7);
  }
  { // multiply #15
    let a0 = inbuf[base+60u]; let a1 = inbuf[base+61u];
    let b0 = inbuf[base+62u]; let b1 = inbuf[base+63u];
    let m15_x0 = f32((a0.x >> 0u) & 0xfffffu);
    let m15_x1 = f32(((a0.x >> 20u) | (a0.y << 12u)) & 0xfffffu);
    let m15_x2 = f32((a0.y >> 8u) & 0xfffffu);
    let m15_x3 = f32(((a0.y >> 28u) | (a0.z << 4u)) & 0xfffffu);
    let m15_x4 = f32(((a0.z >> 16u) | (a0.w << 16u)) & 0xfffffu);
    let m15_x5 = f32((a0.w >> 4u) & 0xfffffu);
    let m15_x6 = f32(((a0.w >> 24u) | (a1.x << 8u)) & 0xfffffu);
    let m15_x7 = f32((a1.x >> 12u) & 0xfffffu);
    let m15_x8 = f32((a1.y >> 0u) & 0xfffffu);
    let m15_x9 = f32(((a1.y >> 20u) | (a1.z << 12u)) & 0xfffffu);
    let m15_x10 = f32((a1.z >> 8u) & 0xfffffu);
    let m15_x11 = f32(((a1.z >> 28u) | (a1.w << 4u)) & 0xfffffu);
    let m15_x12 = f32((a1.w >> 16u) & 0xfffffu);
    let m15_y0 = f32((b0.x >> 0u) & 0xfffffu);
    let m15_y1 = f32(((b0.x >> 20u) | (b0.y << 12u)) & 0xfffffu);
    let m15_y2 = f32((b0.y >> 8u) & 0xfffffu);
    let m15_y3 = f32(((b0.y >> 28u) | (b0.z << 4u)) & 0xfffffu);
    let m15_y4 = f32(((b0.z >> 16u) | (b0.w << 16u)) & 0xfffffu);
    let m15_y5 = f32((b0.w >> 4u) & 0xfffffu);
    let m15_y6 = f32(((b0.w >> 24u) | (b1.x << 8u)) & 0xfffffu);
    let m15_y7 = f32((b1.x >> 12u) & 0xfffffu);
    let m15_y8 = f32((b1.y >> 0u) & 0xfffffu);
    let m15_y9 = f32(((b1.y >> 20u) | (b1.z << 12u)) & 0xfffffu);
    let m15_y10 = f32((b1.z >> 8u) & 0xfffffu);
    let m15_y11 = f32(((b1.z >> 28u) | (b1.w << 4u)) & 0xfffffu);
    let m15_y12 = f32((b1.w >> 16u) & 0xfffffu);
    var c0: f32 = 0.0;
    var c1: f32 = 0.0;
    var c2: f32 = 0.0;
    var c3: f32 = 0.0;
    var c4: f32 = 0.0;
    var c5: f32 = 0.0;
    var c6: f32 = 0.0;
    var c7: f32 = 0.0;
    var c8: f32 = 0.0;
    var c9: f32 = 0.0;
    var c10: f32 = 0.0;
    var c11: f32 = 0.0;
    var c12: f32 = 0.0;
    var c13: f32 = 0.0;
    var c14: f32 = 0.0;
    var c15: f32 = 0.0;
    var c16: f32 = 0.0;
    var c17: f32 = 0.0;
    var c18: f32 = 0.0;
    var c19: f32 = 0.0;
    var c20: f32 = 0.0;
    var c21: f32 = 0.0;
    var c22: f32 = 0.0;
    var c23: f32 = 0.0;
    var c24: f32 = 0.0;
    var c25: f32 = 0.0;
    var c26: f32 = 0.0;
    var c27: f32 = 0.0;
    { let t = fma(m15_x0, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y0, -hi); c0 = c0 + lo; c1 = c1 + hi * RINV; }
    { let t = fma(m15_x0, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y1, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m15_x0, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y2, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m15_x0, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y3, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m15_x0, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y4, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m15_x0, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y5, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m15_x0, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y6, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x0, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y7, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x0, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y8, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x0, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y9, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x0, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y10, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x0, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y11, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x0, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x0, m15_y12, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x1, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y0, -hi); c1 = c1 + lo; c2 = c2 + hi * RINV; }
    { let t = fma(m15_x1, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y1, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m15_x1, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y2, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m15_x1, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y3, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m15_x1, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y4, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m15_x1, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y5, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x1, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y6, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x1, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y7, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x1, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y8, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x1, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y9, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x1, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y10, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x1, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y11, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x1, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x1, m15_y12, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x2, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y0, -hi); c2 = c2 + lo; c3 = c3 + hi * RINV; }
    { let t = fma(m15_x2, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y1, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m15_x2, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y2, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m15_x2, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y3, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m15_x2, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y4, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x2, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y5, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x2, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y6, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x2, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y7, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x2, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y8, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x2, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y9, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x2, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y10, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x2, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y11, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x2, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x2, m15_y12, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x3, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y0, -hi); c3 = c3 + lo; c4 = c4 + hi * RINV; }
    { let t = fma(m15_x3, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y1, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m15_x3, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y2, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m15_x3, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y3, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x3, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y4, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x3, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y5, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x3, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y6, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x3, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y7, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x3, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y8, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x3, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y9, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x3, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y10, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x3, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y11, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x3, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x3, m15_y12, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x4, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y0, -hi); c4 = c4 + lo; c5 = c5 + hi * RINV; }
    { let t = fma(m15_x4, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y1, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m15_x4, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y2, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x4, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y3, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x4, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y4, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x4, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y5, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x4, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y6, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x4, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y7, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x4, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y8, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x4, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y9, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x4, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y10, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x4, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y11, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x4, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x4, m15_y12, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x5, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y0, -hi); c5 = c5 + lo; c6 = c6 + hi * RINV; }
    { let t = fma(m15_x5, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y1, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x5, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y2, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x5, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y3, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x5, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y4, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x5, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y5, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x5, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y6, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x5, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y7, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x5, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y8, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x5, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y9, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x5, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y10, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x5, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y11, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x5, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x5, m15_y12, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x6, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y0, -hi); c6 = c6 + lo; c7 = c7 + hi * RINV; }
    { let t = fma(m15_x6, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y1, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x6, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y2, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x6, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y3, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x6, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y4, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x6, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y5, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x6, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y6, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x6, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y7, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x6, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y8, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x6, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y9, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x6, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y10, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x6, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y11, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x6, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x6, m15_y12, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    { let t = fma(m15_x7, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y0, -hi); c7 = c7 + lo; c8 = c8 + hi * RINV; }
    { let t = fma(m15_x7, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y1, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x7, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y2, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x7, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y3, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x7, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y4, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x7, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y5, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x7, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y6, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x7, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y7, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x7, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y8, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x7, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y9, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x7, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y10, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x7, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y11, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m15_x7, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x7, m15_y12, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m15_x8, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y0, -hi); c8 = c8 + lo; c9 = c9 + hi * RINV; }
    { let t = fma(m15_x8, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y1, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x8, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y2, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x8, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y3, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x8, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y4, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x8, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y5, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x8, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y6, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x8, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y7, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x8, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y8, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x8, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y9, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x8, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y10, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m15_x8, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y11, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m15_x8, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x8, m15_y12, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m15_x9, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y0, -hi); c9 = c9 + lo; c10 = c10 + hi * RINV; }
    { let t = fma(m15_x9, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y1, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x9, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y2, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x9, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y3, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x9, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y4, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x9, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y5, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x9, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y6, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x9, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y7, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x9, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y8, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x9, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y9, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m15_x9, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y10, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m15_x9, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y11, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m15_x9, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x9, m15_y12, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m15_x10, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y0, -hi); c10 = c10 + lo; c11 = c11 + hi * RINV; }
    { let t = fma(m15_x10, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y1, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x10, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y2, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x10, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y3, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x10, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y4, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x10, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y5, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x10, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y6, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x10, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y7, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x10, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y8, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m15_x10, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y9, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m15_x10, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y10, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m15_x10, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y11, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m15_x10, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x10, m15_y12, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m15_x11, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y0, -hi); c11 = c11 + lo; c12 = c12 + hi * RINV; }
    { let t = fma(m15_x11, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y1, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x11, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y2, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x11, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y3, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x11, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y4, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x11, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y5, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x11, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y6, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x11, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y7, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m15_x11, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y8, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m15_x11, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y9, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m15_x11, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y10, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m15_x11, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y11, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m15_x11, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x11, m15_y12, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m15_x12, m15_y0, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y0, -hi); c12 = c12 + lo; c13 = c13 + hi * RINV; }
    { let t = fma(m15_x12, m15_y1, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y1, -hi); c13 = c13 + lo; c14 = c14 + hi * RINV; }
    { let t = fma(m15_x12, m15_y2, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y2, -hi); c14 = c14 + lo; c15 = c15 + hi * RINV; }
    { let t = fma(m15_x12, m15_y3, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y3, -hi); c15 = c15 + lo; c16 = c16 + hi * RINV; }
    { let t = fma(m15_x12, m15_y4, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y4, -hi); c16 = c16 + lo; c17 = c17 + hi * RINV; }
    { let t = fma(m15_x12, m15_y5, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y5, -hi); c17 = c17 + lo; c18 = c18 + hi * RINV; }
    { let t = fma(m15_x12, m15_y6, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y6, -hi); c18 = c18 + lo; c19 = c19 + hi * RINV; }
    { let t = fma(m15_x12, m15_y7, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y7, -hi); c19 = c19 + lo; c20 = c20 + hi * RINV; }
    { let t = fma(m15_x12, m15_y8, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y8, -hi); c20 = c20 + lo; c21 = c21 + hi * RINV; }
    { let t = fma(m15_x12, m15_y9, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y9, -hi); c21 = c21 + lo; c22 = c22 + hi * RINV; }
    { let t = fma(m15_x12, m15_y10, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y10, -hi); c22 = c22 + lo; c23 = c23 + hi * RINV; }
    { let t = fma(m15_x12, m15_y11, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y11, -hi); c23 = c23 + lo; c24 = c24 + hi * RINV; }
    { let t = fma(m15_x12, m15_y12, CHI); let hi = t - CHI; let lo = fma(m15_x12, m15_y12, -hi); c24 = c24 + lo; c25 = c25 + hi * RINV; }
    { let hv = floor(c0 * RINV); c0 = c0 - hv * R; c1 = c1 + hv; }
    { let hv = floor(c1 * RINV); c1 = c1 - hv * R; c2 = c2 + hv; }
    { let hv = floor(c2 * RINV); c2 = c2 - hv * R; c3 = c3 + hv; }
    { let hv = floor(c3 * RINV); c3 = c3 - hv * R; c4 = c4 + hv; }
    { let hv = floor(c4 * RINV); c4 = c4 - hv * R; c5 = c5 + hv; }
    { let hv = floor(c5 * RINV); c5 = c5 - hv * R; c6 = c6 + hv; }
    { let hv = floor(c6 * RINV); c6 = c6 - hv * R; c7 = c7 + hv; }
    { let hv = floor(c7 * RINV); c7 = c7 - hv * R; c8 = c8 + hv; }
    { let hv = floor(c8 * RINV); c8 = c8 - hv * R; c9 = c9 + hv; }
    { let hv = floor(c9 * RINV); c9 = c9 - hv * R; c10 = c10 + hv; }
    { let hv = floor(c10 * RINV); c10 = c10 - hv * R; c11 = c11 + hv; }
    { let hv = floor(c11 * RINV); c11 = c11 - hv * R; c12 = c12 + hv; }
    { let hv = floor(c12 * RINV); c12 = c12 - hv * R; c13 = c13 + hv; }
    { let hv = floor(c13 * RINV); c13 = c13 - hv * R; c14 = c14 + hv; }
    { let hv = floor(c14 * RINV); c14 = c14 - hv * R; c15 = c15 + hv; }
    { let hv = floor(c15 * RINV); c15 = c15 - hv * R; c16 = c16 + hv; }
    { let hv = floor(c16 * RINV); c16 = c16 - hv * R; c17 = c17 + hv; }
    { let hv = floor(c17 * RINV); c17 = c17 - hv * R; c18 = c18 + hv; }
    { let hv = floor(c18 * RINV); c18 = c18 - hv * R; c19 = c19 + hv; }
    { let hv = floor(c19 * RINV); c19 = c19 - hv * R; c20 = c20 + hv; }
    { let hv = floor(c20 * RINV); c20 = c20 - hv * R; c21 = c21 + hv; }
    { let hv = floor(c21 * RINV); c21 = c21 - hv * R; c22 = c22 + hv; }
    { let hv = floor(c22 * RINV); c22 = c22 - hv * R; c23 = c23 + hv; }
    { let hv = floor(c23 * RINV); c23 = c23 - hv * R; c24 = c24 + hv; }
    { let hv = floor(c24 * RINV); c24 = c24 - hv * R; c25 = c25 + hv; }
    { let hv = floor(c25 * RINV); c25 = c25 - hv * R; c26 = c26 + hv; }
    { let hv = floor(c26 * RINV); c26 = c26 - hv * R; c27 = c27 + hv; }
    var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
    { let du = u32(c0); o0 = o0 | (du << 0u); }
    { let du = u32(c1); o0 = o0 | (du << 20u); o1 = o1 | (du >> 12u); }
    { let du = u32(c2); o1 = o1 | (du << 8u); }
    { let du = u32(c3); o1 = o1 | (du << 28u); o2 = o2 | (du >> 4u); }
    { let du = u32(c4); o2 = o2 | (du << 16u); o3 = o3 | (du >> 16u); }
    { let du = u32(c5); o3 = o3 | (du << 4u); }
    { let du = u32(c6); o3 = o3 | (du << 24u); o4 = o4 | (du >> 8u); }
    { let du = u32(c7); o4 = o4 | (du << 12u); }
    { let du = u32(c8); o5 = o5 | (du << 0u); }
    { let du = u32(c9); o5 = o5 | (du << 20u); o6 = o6 | (du >> 12u); }
    { let du = u32(c10); o6 = o6 | (du << 8u); }
    { let du = u32(c11); o6 = o6 | (du << 28u); o7 = o7 | (du >> 4u); }
    { let du = u32(c12); o7 = o7 | (du << 16u); }
    outbuf[obase+30u] = vec4<u32>(o0,o1,o2,o3);
    outbuf[obase+31u] = vec4<u32>(o4,o5,o6,o7);
  }
}
