
// (acc + m*pj + cin) -> vec2(low22, carryOut). m,pj in [0,2^22). Decomposes
// both into 11-bit halves so every sub-product < 2^22 (no u32 overflow), then
// reassembles in 22-bit radix. Pure integer — bit-exact on every GPU.
fn fp22_madd(m: u32, pj: u32, acc: u32, cin: u32) -> vec2<u32> {
    let mlo: u32 = m & 2047u; let mhi: u32 = m >> 11u;
    let plo: u32 = pj & 2047u; let phi: u32 = pj >> 11u;
    // m*pj = mlo*plo + (mlo*phi + mhi*plo)<<11 + (mhi*phi)<<22
    let s0: u32 = mlo * plo;            // < 2^22
    let s1: u32 = mlo * phi + mhi * plo; // < 2^23
    let s2: u32 = mhi * phi;            // < 2^22
    // low 22 bits: s0 + (s1<<11) folded, plus acc + cin
    // assemble into a 44-bit value across two u32 carefully.
    let low0: u32 = s0 + ((s1 & 2047u) << 11u) + acc + cin; // < 2^24
    let lo: u32 = low0 & 4194303u;
    let carryFromLow: u32 = low0 >> 22u; // small
    let hi: u32 = s2 + (s1 >> 11u) + carryFromLow; // < 2^23
    return vec2<u32>(lo, hi);
}

// === NATIVE 12x22-bit Montgomery multiply (montmul=fp22native) ===
// 11-bit operand split (Mali-safe: every half-product < 2^22, no fma),
// 48-col 11-bit f32 grid with G=3 floor renorm + integer-round-trip
// reassociation barrier; integer 22-bit CIOS reduce; 2^4 fixup to 2^-260.
// Host bit-exact (native22_host.mjs): x*y*2^-260 mod p.
const FP22_W11: f32 = 2048.0;
const FP22_W11_INV: f32 = 0.00048828125;
const FP22_N0_22: u32 = 418697u;

const FP22_P0: u32 = 3996999u;
const FP22_P1: u32 = 3169121u;
const FP22_P2: u32 = 1294856u;
const FP22_P3: u32 = 1864355u;
const FP22_P4: u32 = 2789736u;
const FP22_P5: u32 = 3563013u;
const FP22_P6: u32 = 1578373u;
const FP22_P7: u32 = 1142176u;
const FP22_P8: u32 = 2734160u;
const FP22_P9: u32 = 312960u;
const FP22_P10: u32 = 321326u;
const FP22_P11: u32 = 3097u;

fn montgomery_product_22(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    let af0: f32 = f32(((a[0u] >> 0u) & 4194303u));
    let af1: f32 = f32(((a[0u] >> 22u) & 1023u) | (((a[1u] >> 0u) & 4095u) << 10u));
    let af2: f32 = f32(((a[1u] >> 12u) & 1048575u) | (((a[2u] >> 0u) & 3u) << 20u));
    let af3: f32 = f32(((a[2u] >> 2u) & 4194303u));
    let af4: f32 = f32(((a[2u] >> 24u) & 255u) | (((a[3u] >> 0u) & 16383u) << 8u));
    let af5: f32 = f32(((a[3u] >> 14u) & 262143u) | (((a[4u] >> 0u) & 15u) << 18u));
    let af6: f32 = f32(((a[4u] >> 4u) & 4194303u));
    let af7: f32 = f32(((a[4u] >> 26u) & 63u) | (((a[5u] >> 0u) & 65535u) << 6u));
    let af8: f32 = f32(((a[5u] >> 16u) & 65535u) | (((a[6u] >> 0u) & 63u) << 16u));
    let af9: f32 = f32(((a[6u] >> 6u) & 4194303u));
    let af10: f32 = f32(((a[6u] >> 28u) & 15u) | (((a[7u] >> 0u) & 262143u) << 4u));
    let af11: f32 = f32(((a[7u] >> 18u) & 16383u));
    let bf0: f32 = f32(((b[0u] >> 0u) & 4194303u));
    let bf1: f32 = f32(((b[0u] >> 22u) & 1023u) | (((b[1u] >> 0u) & 4095u) << 10u));
    let bf2: f32 = f32(((b[1u] >> 12u) & 1048575u) | (((b[2u] >> 0u) & 3u) << 20u));
    let bf3: f32 = f32(((b[2u] >> 2u) & 4194303u));
    let bf4: f32 = f32(((b[2u] >> 24u) & 255u) | (((b[3u] >> 0u) & 16383u) << 8u));
    let bf5: f32 = f32(((b[3u] >> 14u) & 262143u) | (((b[4u] >> 0u) & 15u) << 18u));
    let bf6: f32 = f32(((b[4u] >> 4u) & 4194303u));
    let bf7: f32 = f32(((b[4u] >> 26u) & 63u) | (((b[5u] >> 0u) & 65535u) << 6u));
    let bf8: f32 = f32(((b[5u] >> 16u) & 65535u) | (((b[6u] >> 0u) & 63u) << 16u));
    let bf9: f32 = f32(((b[6u] >> 6u) & 4194303u));
    let bf10: f32 = f32(((b[6u] >> 28u) & 15u) | (((b[7u] >> 0u) & 262143u) << 4u));
    let bf11: f32 = f32(((b[7u] >> 18u) & 16383u));
    let aH0: f32 = floor(af0 * FP22_W11_INV); let aL0: f32 = af0 - aH0 * FP22_W11;
    let aH1: f32 = floor(af1 * FP22_W11_INV); let aL1: f32 = af1 - aH1 * FP22_W11;
    let aH2: f32 = floor(af2 * FP22_W11_INV); let aL2: f32 = af2 - aH2 * FP22_W11;
    let aH3: f32 = floor(af3 * FP22_W11_INV); let aL3: f32 = af3 - aH3 * FP22_W11;
    let aH4: f32 = floor(af4 * FP22_W11_INV); let aL4: f32 = af4 - aH4 * FP22_W11;
    let aH5: f32 = floor(af5 * FP22_W11_INV); let aL5: f32 = af5 - aH5 * FP22_W11;
    let aH6: f32 = floor(af6 * FP22_W11_INV); let aL6: f32 = af6 - aH6 * FP22_W11;
    let aH7: f32 = floor(af7 * FP22_W11_INV); let aL7: f32 = af7 - aH7 * FP22_W11;
    let aH8: f32 = floor(af8 * FP22_W11_INV); let aL8: f32 = af8 - aH8 * FP22_W11;
    let aH9: f32 = floor(af9 * FP22_W11_INV); let aL9: f32 = af9 - aH9 * FP22_W11;
    let aH10: f32 = floor(af10 * FP22_W11_INV); let aL10: f32 = af10 - aH10 * FP22_W11;
    let aH11: f32 = floor(af11 * FP22_W11_INV); let aL11: f32 = af11 - aH11 * FP22_W11;
    let bH0: f32 = floor(bf0 * FP22_W11_INV); let bL0: f32 = bf0 - bH0 * FP22_W11;
    let bH1: f32 = floor(bf1 * FP22_W11_INV); let bL1: f32 = bf1 - bH1 * FP22_W11;
    let bH2: f32 = floor(bf2 * FP22_W11_INV); let bL2: f32 = bf2 - bH2 * FP22_W11;
    let bH3: f32 = floor(bf3 * FP22_W11_INV); let bL3: f32 = bf3 - bH3 * FP22_W11;
    let bH4: f32 = floor(bf4 * FP22_W11_INV); let bL4: f32 = bf4 - bH4 * FP22_W11;
    let bH5: f32 = floor(bf5 * FP22_W11_INV); let bL5: f32 = bf5 - bH5 * FP22_W11;
    let bH6: f32 = floor(bf6 * FP22_W11_INV); let bL6: f32 = bf6 - bH6 * FP22_W11;
    let bH7: f32 = floor(bf7 * FP22_W11_INV); let bL7: f32 = bf7 - bH7 * FP22_W11;
    let bH8: f32 = floor(bf8 * FP22_W11_INV); let bL8: f32 = bf8 - bH8 * FP22_W11;
    let bH9: f32 = floor(bf9 * FP22_W11_INV); let bL9: f32 = bf9 - bH9 * FP22_W11;
    let bH10: f32 = floor(bf10 * FP22_W11_INV); let bL10: f32 = bf10 - bH10 * FP22_W11;
    let bH11: f32 = floor(bf11 * FP22_W11_INV); let bL11: f32 = bf11 - bH11 * FP22_W11;
    var d0: f32 = 0.0;
    var d1: f32 = 0.0;
    var d2: f32 = 0.0;
    var d3: f32 = 0.0;
    var d4: f32 = 0.0;
    var d5: f32 = 0.0;
    var d6: f32 = 0.0;
    var d7: f32 = 0.0;
    var d8: f32 = 0.0;
    var d9: f32 = 0.0;
    var d10: f32 = 0.0;
    var d11: f32 = 0.0;
    var d12: f32 = 0.0;
    var d13: f32 = 0.0;
    var d14: f32 = 0.0;
    var d15: f32 = 0.0;
    var d16: f32 = 0.0;
    var d17: f32 = 0.0;
    var d18: f32 = 0.0;
    var d19: f32 = 0.0;
    var d20: f32 = 0.0;
    var d21: f32 = 0.0;
    var d22: f32 = 0.0;
    var d23: f32 = 0.0;
    var d24: f32 = 0.0;
    var d25: f32 = 0.0;
    var d26: f32 = 0.0;
    var d27: f32 = 0.0;
    var d28: f32 = 0.0;
    var d29: f32 = 0.0;
    var d30: f32 = 0.0;
    var d31: f32 = 0.0;
    var d32: f32 = 0.0;
    var d33: f32 = 0.0;
    var d34: f32 = 0.0;
    var d35: f32 = 0.0;
    var d36: f32 = 0.0;
    var d37: f32 = 0.0;
    var d38: f32 = 0.0;
    var d39: f32 = 0.0;
    var d40: f32 = 0.0;
    var d41: f32 = 0.0;
    var d42: f32 = 0.0;
    var d43: f32 = 0.0;
    var d44: f32 = 0.0;
    var d45: f32 = 0.0;
    var d46: f32 = 0.0;
    var d47: f32 = 0.0;
    var d48: f32 = 0.0;
    // row i=0
    d0 = d0 + aL0 * bL0;
    d1 = d1 + aL0 * bH0;
    d2 = d2 + aL0 * bL1;
    d3 = d3 + aL0 * bH1;
    d4 = d4 + aL0 * bL2;
    d5 = d5 + aL0 * bH2;
    d6 = d6 + aL0 * bL3;
    d7 = d7 + aL0 * bH3;
    d8 = d8 + aL0 * bL4;
    d9 = d9 + aL0 * bH4;
    d10 = d10 + aL0 * bL5;
    d11 = d11 + aL0 * bH5;
    d12 = d12 + aL0 * bL6;
    d13 = d13 + aL0 * bH6;
    d14 = d14 + aL0 * bL7;
    d15 = d15 + aL0 * bH7;
    d16 = d16 + aL0 * bL8;
    d17 = d17 + aL0 * bH8;
    d18 = d18 + aL0 * bL9;
    d19 = d19 + aL0 * bH9;
    d20 = d20 + aL0 * bL10;
    d21 = d21 + aL0 * bH10;
    d22 = d22 + aL0 * bL11;
    d23 = d23 + aL0 * bH11;
    // row i=1
    d1 = d1 + aH0 * bL0;
    d2 = d2 + aH0 * bH0;
    d3 = d3 + aH0 * bL1;
    d4 = d4 + aH0 * bH1;
    d5 = d5 + aH0 * bL2;
    d6 = d6 + aH0 * bH2;
    d7 = d7 + aH0 * bL3;
    d8 = d8 + aH0 * bH3;
    d9 = d9 + aH0 * bL4;
    d10 = d10 + aH0 * bH4;
    d11 = d11 + aH0 * bL5;
    d12 = d12 + aH0 * bH5;
    d13 = d13 + aH0 * bL6;
    d14 = d14 + aH0 * bH6;
    d15 = d15 + aH0 * bL7;
    d16 = d16 + aH0 * bH7;
    d17 = d17 + aH0 * bL8;
    d18 = d18 + aH0 * bH8;
    d19 = d19 + aH0 * bL9;
    d20 = d20 + aH0 * bH9;
    d21 = d21 + aH0 * bL10;
    d22 = d22 + aH0 * bH10;
    d23 = d23 + aH0 * bL11;
    d24 = d24 + aH0 * bH11;
    // row i=2
    d2 = d2 + aL1 * bL0;
    d3 = d3 + aL1 * bH0;
    d4 = d4 + aL1 * bL1;
    d5 = d5 + aL1 * bH1;
    d6 = d6 + aL1 * bL2;
    d7 = d7 + aL1 * bH2;
    d8 = d8 + aL1 * bL3;
    d9 = d9 + aL1 * bH3;
    d10 = d10 + aL1 * bL4;
    d11 = d11 + aL1 * bH4;
    d12 = d12 + aL1 * bL5;
    d13 = d13 + aL1 * bH5;
    d14 = d14 + aL1 * bL6;
    d15 = d15 + aL1 * bH6;
    d16 = d16 + aL1 * bL7;
    d17 = d17 + aL1 * bH7;
    d18 = d18 + aL1 * bL8;
    d19 = d19 + aL1 * bH8;
    d20 = d20 + aL1 * bL9;
    d21 = d21 + aL1 * bH9;
    d22 = d22 + aL1 * bL10;
    d23 = d23 + aL1 * bH10;
    d24 = d24 + aL1 * bL11;
    d25 = d25 + aL1 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=3
    d3 = d3 + aH1 * bL0;
    d4 = d4 + aH1 * bH0;
    d5 = d5 + aH1 * bL1;
    d6 = d6 + aH1 * bH1;
    d7 = d7 + aH1 * bL2;
    d8 = d8 + aH1 * bH2;
    d9 = d9 + aH1 * bL3;
    d10 = d10 + aH1 * bH3;
    d11 = d11 + aH1 * bL4;
    d12 = d12 + aH1 * bH4;
    d13 = d13 + aH1 * bL5;
    d14 = d14 + aH1 * bH5;
    d15 = d15 + aH1 * bL6;
    d16 = d16 + aH1 * bH6;
    d17 = d17 + aH1 * bL7;
    d18 = d18 + aH1 * bH7;
    d19 = d19 + aH1 * bL8;
    d20 = d20 + aH1 * bH8;
    d21 = d21 + aH1 * bL9;
    d22 = d22 + aH1 * bH9;
    d23 = d23 + aH1 * bL10;
    d24 = d24 + aH1 * bH10;
    d25 = d25 + aH1 * bL11;
    d26 = d26 + aH1 * bH11;
    // row i=4
    d4 = d4 + aL2 * bL0;
    d5 = d5 + aL2 * bH0;
    d6 = d6 + aL2 * bL1;
    d7 = d7 + aL2 * bH1;
    d8 = d8 + aL2 * bL2;
    d9 = d9 + aL2 * bH2;
    d10 = d10 + aL2 * bL3;
    d11 = d11 + aL2 * bH3;
    d12 = d12 + aL2 * bL4;
    d13 = d13 + aL2 * bH4;
    d14 = d14 + aL2 * bL5;
    d15 = d15 + aL2 * bH5;
    d16 = d16 + aL2 * bL6;
    d17 = d17 + aL2 * bH6;
    d18 = d18 + aL2 * bL7;
    d19 = d19 + aL2 * bH7;
    d20 = d20 + aL2 * bL8;
    d21 = d21 + aL2 * bH8;
    d22 = d22 + aL2 * bL9;
    d23 = d23 + aL2 * bH9;
    d24 = d24 + aL2 * bL10;
    d25 = d25 + aL2 * bH10;
    d26 = d26 + aL2 * bL11;
    d27 = d27 + aL2 * bH11;
    // row i=5
    d5 = d5 + aH2 * bL0;
    d6 = d6 + aH2 * bH0;
    d7 = d7 + aH2 * bL1;
    d8 = d8 + aH2 * bH1;
    d9 = d9 + aH2 * bL2;
    d10 = d10 + aH2 * bH2;
    d11 = d11 + aH2 * bL3;
    d12 = d12 + aH2 * bH3;
    d13 = d13 + aH2 * bL4;
    d14 = d14 + aH2 * bH4;
    d15 = d15 + aH2 * bL5;
    d16 = d16 + aH2 * bH5;
    d17 = d17 + aH2 * bL6;
    d18 = d18 + aH2 * bH6;
    d19 = d19 + aH2 * bL7;
    d20 = d20 + aH2 * bH7;
    d21 = d21 + aH2 * bL8;
    d22 = d22 + aH2 * bH8;
    d23 = d23 + aH2 * bL9;
    d24 = d24 + aH2 * bH9;
    d25 = d25 + aH2 * bL10;
    d26 = d26 + aH2 * bH10;
    d27 = d27 + aH2 * bL11;
    d28 = d28 + aH2 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=6
    d6 = d6 + aL3 * bL0;
    d7 = d7 + aL3 * bH0;
    d8 = d8 + aL3 * bL1;
    d9 = d9 + aL3 * bH1;
    d10 = d10 + aL3 * bL2;
    d11 = d11 + aL3 * bH2;
    d12 = d12 + aL3 * bL3;
    d13 = d13 + aL3 * bH3;
    d14 = d14 + aL3 * bL4;
    d15 = d15 + aL3 * bH4;
    d16 = d16 + aL3 * bL5;
    d17 = d17 + aL3 * bH5;
    d18 = d18 + aL3 * bL6;
    d19 = d19 + aL3 * bH6;
    d20 = d20 + aL3 * bL7;
    d21 = d21 + aL3 * bH7;
    d22 = d22 + aL3 * bL8;
    d23 = d23 + aL3 * bH8;
    d24 = d24 + aL3 * bL9;
    d25 = d25 + aL3 * bH9;
    d26 = d26 + aL3 * bL10;
    d27 = d27 + aL3 * bH10;
    d28 = d28 + aL3 * bL11;
    d29 = d29 + aL3 * bH11;
    // row i=7
    d7 = d7 + aH3 * bL0;
    d8 = d8 + aH3 * bH0;
    d9 = d9 + aH3 * bL1;
    d10 = d10 + aH3 * bH1;
    d11 = d11 + aH3 * bL2;
    d12 = d12 + aH3 * bH2;
    d13 = d13 + aH3 * bL3;
    d14 = d14 + aH3 * bH3;
    d15 = d15 + aH3 * bL4;
    d16 = d16 + aH3 * bH4;
    d17 = d17 + aH3 * bL5;
    d18 = d18 + aH3 * bH5;
    d19 = d19 + aH3 * bL6;
    d20 = d20 + aH3 * bH6;
    d21 = d21 + aH3 * bL7;
    d22 = d22 + aH3 * bH7;
    d23 = d23 + aH3 * bL8;
    d24 = d24 + aH3 * bH8;
    d25 = d25 + aH3 * bL9;
    d26 = d26 + aH3 * bH9;
    d27 = d27 + aH3 * bL10;
    d28 = d28 + aH3 * bH10;
    d29 = d29 + aH3 * bL11;
    d30 = d30 + aH3 * bH11;
    // row i=8
    d8 = d8 + aL4 * bL0;
    d9 = d9 + aL4 * bH0;
    d10 = d10 + aL4 * bL1;
    d11 = d11 + aL4 * bH1;
    d12 = d12 + aL4 * bL2;
    d13 = d13 + aL4 * bH2;
    d14 = d14 + aL4 * bL3;
    d15 = d15 + aL4 * bH3;
    d16 = d16 + aL4 * bL4;
    d17 = d17 + aL4 * bH4;
    d18 = d18 + aL4 * bL5;
    d19 = d19 + aL4 * bH5;
    d20 = d20 + aL4 * bL6;
    d21 = d21 + aL4 * bH6;
    d22 = d22 + aL4 * bL7;
    d23 = d23 + aL4 * bH7;
    d24 = d24 + aL4 * bL8;
    d25 = d25 + aL4 * bH8;
    d26 = d26 + aL4 * bL9;
    d27 = d27 + aL4 * bH9;
    d28 = d28 + aL4 * bL10;
    d29 = d29 + aL4 * bH10;
    d30 = d30 + aL4 * bL11;
    d31 = d31 + aL4 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=9
    d9 = d9 + aH4 * bL0;
    d10 = d10 + aH4 * bH0;
    d11 = d11 + aH4 * bL1;
    d12 = d12 + aH4 * bH1;
    d13 = d13 + aH4 * bL2;
    d14 = d14 + aH4 * bH2;
    d15 = d15 + aH4 * bL3;
    d16 = d16 + aH4 * bH3;
    d17 = d17 + aH4 * bL4;
    d18 = d18 + aH4 * bH4;
    d19 = d19 + aH4 * bL5;
    d20 = d20 + aH4 * bH5;
    d21 = d21 + aH4 * bL6;
    d22 = d22 + aH4 * bH6;
    d23 = d23 + aH4 * bL7;
    d24 = d24 + aH4 * bH7;
    d25 = d25 + aH4 * bL8;
    d26 = d26 + aH4 * bH8;
    d27 = d27 + aH4 * bL9;
    d28 = d28 + aH4 * bH9;
    d29 = d29 + aH4 * bL10;
    d30 = d30 + aH4 * bH10;
    d31 = d31 + aH4 * bL11;
    d32 = d32 + aH4 * bH11;
    // row i=10
    d10 = d10 + aL5 * bL0;
    d11 = d11 + aL5 * bH0;
    d12 = d12 + aL5 * bL1;
    d13 = d13 + aL5 * bH1;
    d14 = d14 + aL5 * bL2;
    d15 = d15 + aL5 * bH2;
    d16 = d16 + aL5 * bL3;
    d17 = d17 + aL5 * bH3;
    d18 = d18 + aL5 * bL4;
    d19 = d19 + aL5 * bH4;
    d20 = d20 + aL5 * bL5;
    d21 = d21 + aL5 * bH5;
    d22 = d22 + aL5 * bL6;
    d23 = d23 + aL5 * bH6;
    d24 = d24 + aL5 * bL7;
    d25 = d25 + aL5 * bH7;
    d26 = d26 + aL5 * bL8;
    d27 = d27 + aL5 * bH8;
    d28 = d28 + aL5 * bL9;
    d29 = d29 + aL5 * bH9;
    d30 = d30 + aL5 * bL10;
    d31 = d31 + aL5 * bH10;
    d32 = d32 + aL5 * bL11;
    d33 = d33 + aL5 * bH11;
    // row i=11
    d11 = d11 + aH5 * bL0;
    d12 = d12 + aH5 * bH0;
    d13 = d13 + aH5 * bL1;
    d14 = d14 + aH5 * bH1;
    d15 = d15 + aH5 * bL2;
    d16 = d16 + aH5 * bH2;
    d17 = d17 + aH5 * bL3;
    d18 = d18 + aH5 * bH3;
    d19 = d19 + aH5 * bL4;
    d20 = d20 + aH5 * bH4;
    d21 = d21 + aH5 * bL5;
    d22 = d22 + aH5 * bH5;
    d23 = d23 + aH5 * bL6;
    d24 = d24 + aH5 * bH6;
    d25 = d25 + aH5 * bL7;
    d26 = d26 + aH5 * bH7;
    d27 = d27 + aH5 * bL8;
    d28 = d28 + aH5 * bH8;
    d29 = d29 + aH5 * bL9;
    d30 = d30 + aH5 * bH9;
    d31 = d31 + aH5 * bL10;
    d32 = d32 + aH5 * bH10;
    d33 = d33 + aH5 * bL11;
    d34 = d34 + aH5 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=12
    d12 = d12 + aL6 * bL0;
    d13 = d13 + aL6 * bH0;
    d14 = d14 + aL6 * bL1;
    d15 = d15 + aL6 * bH1;
    d16 = d16 + aL6 * bL2;
    d17 = d17 + aL6 * bH2;
    d18 = d18 + aL6 * bL3;
    d19 = d19 + aL6 * bH3;
    d20 = d20 + aL6 * bL4;
    d21 = d21 + aL6 * bH4;
    d22 = d22 + aL6 * bL5;
    d23 = d23 + aL6 * bH5;
    d24 = d24 + aL6 * bL6;
    d25 = d25 + aL6 * bH6;
    d26 = d26 + aL6 * bL7;
    d27 = d27 + aL6 * bH7;
    d28 = d28 + aL6 * bL8;
    d29 = d29 + aL6 * bH8;
    d30 = d30 + aL6 * bL9;
    d31 = d31 + aL6 * bH9;
    d32 = d32 + aL6 * bL10;
    d33 = d33 + aL6 * bH10;
    d34 = d34 + aL6 * bL11;
    d35 = d35 + aL6 * bH11;
    // row i=13
    d13 = d13 + aH6 * bL0;
    d14 = d14 + aH6 * bH0;
    d15 = d15 + aH6 * bL1;
    d16 = d16 + aH6 * bH1;
    d17 = d17 + aH6 * bL2;
    d18 = d18 + aH6 * bH2;
    d19 = d19 + aH6 * bL3;
    d20 = d20 + aH6 * bH3;
    d21 = d21 + aH6 * bL4;
    d22 = d22 + aH6 * bH4;
    d23 = d23 + aH6 * bL5;
    d24 = d24 + aH6 * bH5;
    d25 = d25 + aH6 * bL6;
    d26 = d26 + aH6 * bH6;
    d27 = d27 + aH6 * bL7;
    d28 = d28 + aH6 * bH7;
    d29 = d29 + aH6 * bL8;
    d30 = d30 + aH6 * bH8;
    d31 = d31 + aH6 * bL9;
    d32 = d32 + aH6 * bH9;
    d33 = d33 + aH6 * bL10;
    d34 = d34 + aH6 * bH10;
    d35 = d35 + aH6 * bL11;
    d36 = d36 + aH6 * bH11;
    // row i=14
    d14 = d14 + aL7 * bL0;
    d15 = d15 + aL7 * bH0;
    d16 = d16 + aL7 * bL1;
    d17 = d17 + aL7 * bH1;
    d18 = d18 + aL7 * bL2;
    d19 = d19 + aL7 * bH2;
    d20 = d20 + aL7 * bL3;
    d21 = d21 + aL7 * bH3;
    d22 = d22 + aL7 * bL4;
    d23 = d23 + aL7 * bH4;
    d24 = d24 + aL7 * bL5;
    d25 = d25 + aL7 * bH5;
    d26 = d26 + aL7 * bL6;
    d27 = d27 + aL7 * bH6;
    d28 = d28 + aL7 * bL7;
    d29 = d29 + aL7 * bH7;
    d30 = d30 + aL7 * bL8;
    d31 = d31 + aL7 * bH8;
    d32 = d32 + aL7 * bL9;
    d33 = d33 + aL7 * bH9;
    d34 = d34 + aL7 * bL10;
    d35 = d35 + aL7 * bH10;
    d36 = d36 + aL7 * bL11;
    d37 = d37 + aL7 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=15
    d15 = d15 + aH7 * bL0;
    d16 = d16 + aH7 * bH0;
    d17 = d17 + aH7 * bL1;
    d18 = d18 + aH7 * bH1;
    d19 = d19 + aH7 * bL2;
    d20 = d20 + aH7 * bH2;
    d21 = d21 + aH7 * bL3;
    d22 = d22 + aH7 * bH3;
    d23 = d23 + aH7 * bL4;
    d24 = d24 + aH7 * bH4;
    d25 = d25 + aH7 * bL5;
    d26 = d26 + aH7 * bH5;
    d27 = d27 + aH7 * bL6;
    d28 = d28 + aH7 * bH6;
    d29 = d29 + aH7 * bL7;
    d30 = d30 + aH7 * bH7;
    d31 = d31 + aH7 * bL8;
    d32 = d32 + aH7 * bH8;
    d33 = d33 + aH7 * bL9;
    d34 = d34 + aH7 * bH9;
    d35 = d35 + aH7 * bL10;
    d36 = d36 + aH7 * bH10;
    d37 = d37 + aH7 * bL11;
    d38 = d38 + aH7 * bH11;
    // row i=16
    d16 = d16 + aL8 * bL0;
    d17 = d17 + aL8 * bH0;
    d18 = d18 + aL8 * bL1;
    d19 = d19 + aL8 * bH1;
    d20 = d20 + aL8 * bL2;
    d21 = d21 + aL8 * bH2;
    d22 = d22 + aL8 * bL3;
    d23 = d23 + aL8 * bH3;
    d24 = d24 + aL8 * bL4;
    d25 = d25 + aL8 * bH4;
    d26 = d26 + aL8 * bL5;
    d27 = d27 + aL8 * bH5;
    d28 = d28 + aL8 * bL6;
    d29 = d29 + aL8 * bH6;
    d30 = d30 + aL8 * bL7;
    d31 = d31 + aL8 * bH7;
    d32 = d32 + aL8 * bL8;
    d33 = d33 + aL8 * bH8;
    d34 = d34 + aL8 * bL9;
    d35 = d35 + aL8 * bH9;
    d36 = d36 + aL8 * bL10;
    d37 = d37 + aL8 * bH10;
    d38 = d38 + aL8 * bL11;
    d39 = d39 + aL8 * bH11;
    // row i=17
    d17 = d17 + aH8 * bL0;
    d18 = d18 + aH8 * bH0;
    d19 = d19 + aH8 * bL1;
    d20 = d20 + aH8 * bH1;
    d21 = d21 + aH8 * bL2;
    d22 = d22 + aH8 * bH2;
    d23 = d23 + aH8 * bL3;
    d24 = d24 + aH8 * bH3;
    d25 = d25 + aH8 * bL4;
    d26 = d26 + aH8 * bH4;
    d27 = d27 + aH8 * bL5;
    d28 = d28 + aH8 * bH5;
    d29 = d29 + aH8 * bL6;
    d30 = d30 + aH8 * bH6;
    d31 = d31 + aH8 * bL7;
    d32 = d32 + aH8 * bH7;
    d33 = d33 + aH8 * bL8;
    d34 = d34 + aH8 * bH8;
    d35 = d35 + aH8 * bL9;
    d36 = d36 + aH8 * bH9;
    d37 = d37 + aH8 * bL10;
    d38 = d38 + aH8 * bH10;
    d39 = d39 + aH8 * bL11;
    d40 = d40 + aH8 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=18
    d18 = d18 + aL9 * bL0;
    d19 = d19 + aL9 * bH0;
    d20 = d20 + aL9 * bL1;
    d21 = d21 + aL9 * bH1;
    d22 = d22 + aL9 * bL2;
    d23 = d23 + aL9 * bH2;
    d24 = d24 + aL9 * bL3;
    d25 = d25 + aL9 * bH3;
    d26 = d26 + aL9 * bL4;
    d27 = d27 + aL9 * bH4;
    d28 = d28 + aL9 * bL5;
    d29 = d29 + aL9 * bH5;
    d30 = d30 + aL9 * bL6;
    d31 = d31 + aL9 * bH6;
    d32 = d32 + aL9 * bL7;
    d33 = d33 + aL9 * bH7;
    d34 = d34 + aL9 * bL8;
    d35 = d35 + aL9 * bH8;
    d36 = d36 + aL9 * bL9;
    d37 = d37 + aL9 * bH9;
    d38 = d38 + aL9 * bL10;
    d39 = d39 + aL9 * bH10;
    d40 = d40 + aL9 * bL11;
    d41 = d41 + aL9 * bH11;
    // row i=19
    d19 = d19 + aH9 * bL0;
    d20 = d20 + aH9 * bH0;
    d21 = d21 + aH9 * bL1;
    d22 = d22 + aH9 * bH1;
    d23 = d23 + aH9 * bL2;
    d24 = d24 + aH9 * bH2;
    d25 = d25 + aH9 * bL3;
    d26 = d26 + aH9 * bH3;
    d27 = d27 + aH9 * bL4;
    d28 = d28 + aH9 * bH4;
    d29 = d29 + aH9 * bL5;
    d30 = d30 + aH9 * bH5;
    d31 = d31 + aH9 * bL6;
    d32 = d32 + aH9 * bH6;
    d33 = d33 + aH9 * bL7;
    d34 = d34 + aH9 * bH7;
    d35 = d35 + aH9 * bL8;
    d36 = d36 + aH9 * bH8;
    d37 = d37 + aH9 * bL9;
    d38 = d38 + aH9 * bH9;
    d39 = d39 + aH9 * bL10;
    d40 = d40 + aH9 * bH10;
    d41 = d41 + aH9 * bL11;
    d42 = d42 + aH9 * bH11;
    // row i=20
    d20 = d20 + aL10 * bL0;
    d21 = d21 + aL10 * bH0;
    d22 = d22 + aL10 * bL1;
    d23 = d23 + aL10 * bH1;
    d24 = d24 + aL10 * bL2;
    d25 = d25 + aL10 * bH2;
    d26 = d26 + aL10 * bL3;
    d27 = d27 + aL10 * bH3;
    d28 = d28 + aL10 * bL4;
    d29 = d29 + aL10 * bH4;
    d30 = d30 + aL10 * bL5;
    d31 = d31 + aL10 * bH5;
    d32 = d32 + aL10 * bL6;
    d33 = d33 + aL10 * bH6;
    d34 = d34 + aL10 * bL7;
    d35 = d35 + aL10 * bH7;
    d36 = d36 + aL10 * bL8;
    d37 = d37 + aL10 * bH8;
    d38 = d38 + aL10 * bL9;
    d39 = d39 + aL10 * bH9;
    d40 = d40 + aL10 * bL10;
    d41 = d41 + aL10 * bH10;
    d42 = d42 + aL10 * bL11;
    d43 = d43 + aL10 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // row i=21
    d21 = d21 + aH10 * bL0;
    d22 = d22 + aH10 * bH0;
    d23 = d23 + aH10 * bL1;
    d24 = d24 + aH10 * bH1;
    d25 = d25 + aH10 * bL2;
    d26 = d26 + aH10 * bH2;
    d27 = d27 + aH10 * bL3;
    d28 = d28 + aH10 * bH3;
    d29 = d29 + aH10 * bL4;
    d30 = d30 + aH10 * bH4;
    d31 = d31 + aH10 * bL5;
    d32 = d32 + aH10 * bH5;
    d33 = d33 + aH10 * bL6;
    d34 = d34 + aH10 * bH6;
    d35 = d35 + aH10 * bL7;
    d36 = d36 + aH10 * bH7;
    d37 = d37 + aH10 * bL8;
    d38 = d38 + aH10 * bH8;
    d39 = d39 + aH10 * bL9;
    d40 = d40 + aH10 * bH9;
    d41 = d41 + aH10 * bL10;
    d42 = d42 + aH10 * bH10;
    d43 = d43 + aH10 * bL11;
    d44 = d44 + aH10 * bH11;
    // row i=22
    d22 = d22 + aL11 * bL0;
    d23 = d23 + aL11 * bH0;
    d24 = d24 + aL11 * bL1;
    d25 = d25 + aL11 * bH1;
    d26 = d26 + aL11 * bL2;
    d27 = d27 + aL11 * bH2;
    d28 = d28 + aL11 * bL3;
    d29 = d29 + aL11 * bH3;
    d30 = d30 + aL11 * bL4;
    d31 = d31 + aL11 * bH4;
    d32 = d32 + aL11 * bL5;
    d33 = d33 + aL11 * bH5;
    d34 = d34 + aL11 * bL6;
    d35 = d35 + aL11 * bH6;
    d36 = d36 + aL11 * bL7;
    d37 = d37 + aL11 * bH7;
    d38 = d38 + aL11 * bL8;
    d39 = d39 + aL11 * bH8;
    d40 = d40 + aL11 * bL9;
    d41 = d41 + aL11 * bH9;
    d42 = d42 + aL11 * bL10;
    d43 = d43 + aL11 * bH10;
    d44 = d44 + aL11 * bL11;
    d45 = d45 + aL11 * bH11;
    // row i=23
    d23 = d23 + aH11 * bL0;
    d24 = d24 + aH11 * bH0;
    d25 = d25 + aH11 * bL1;
    d26 = d26 + aH11 * bH1;
    d27 = d27 + aH11 * bL2;
    d28 = d28 + aH11 * bH2;
    d29 = d29 + aH11 * bL3;
    d30 = d30 + aH11 * bH3;
    d31 = d31 + aH11 * bL4;
    d32 = d32 + aH11 * bH4;
    d33 = d33 + aH11 * bL5;
    d34 = d34 + aH11 * bH5;
    d35 = d35 + aH11 * bL6;
    d36 = d36 + aH11 * bH6;
    d37 = d37 + aH11 * bL7;
    d38 = d38 + aH11 * bH7;
    d39 = d39 + aH11 * bL8;
    d40 = d40 + aH11 * bH8;
    d41 = d41 + aH11 * bL9;
    d42 = d42 + aH11 * bH9;
    d43 = d43 + aH11 * bL10;
    d44 = d44 + aH11 * bH10;
    d45 = d45 + aH11 * bL11;
    d46 = d46 + aH11 * bH11;
    {  // renorm (integer-round-trip reassociation barrier)
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    {  // final renorm
        { let hv: f32 = floor(d0 * FP22_W11_INV); d0 = f32(u32(d0 - hv * FP22_W11)); d1 = d1 + hv; }
        { let hv: f32 = floor(d1 * FP22_W11_INV); d1 = f32(u32(d1 - hv * FP22_W11)); d2 = d2 + hv; }
        { let hv: f32 = floor(d2 * FP22_W11_INV); d2 = f32(u32(d2 - hv * FP22_W11)); d3 = d3 + hv; }
        { let hv: f32 = floor(d3 * FP22_W11_INV); d3 = f32(u32(d3 - hv * FP22_W11)); d4 = d4 + hv; }
        { let hv: f32 = floor(d4 * FP22_W11_INV); d4 = f32(u32(d4 - hv * FP22_W11)); d5 = d5 + hv; }
        { let hv: f32 = floor(d5 * FP22_W11_INV); d5 = f32(u32(d5 - hv * FP22_W11)); d6 = d6 + hv; }
        { let hv: f32 = floor(d6 * FP22_W11_INV); d6 = f32(u32(d6 - hv * FP22_W11)); d7 = d7 + hv; }
        { let hv: f32 = floor(d7 * FP22_W11_INV); d7 = f32(u32(d7 - hv * FP22_W11)); d8 = d8 + hv; }
        { let hv: f32 = floor(d8 * FP22_W11_INV); d8 = f32(u32(d8 - hv * FP22_W11)); d9 = d9 + hv; }
        { let hv: f32 = floor(d9 * FP22_W11_INV); d9 = f32(u32(d9 - hv * FP22_W11)); d10 = d10 + hv; }
        { let hv: f32 = floor(d10 * FP22_W11_INV); d10 = f32(u32(d10 - hv * FP22_W11)); d11 = d11 + hv; }
        { let hv: f32 = floor(d11 * FP22_W11_INV); d11 = f32(u32(d11 - hv * FP22_W11)); d12 = d12 + hv; }
        { let hv: f32 = floor(d12 * FP22_W11_INV); d12 = f32(u32(d12 - hv * FP22_W11)); d13 = d13 + hv; }
        { let hv: f32 = floor(d13 * FP22_W11_INV); d13 = f32(u32(d13 - hv * FP22_W11)); d14 = d14 + hv; }
        { let hv: f32 = floor(d14 * FP22_W11_INV); d14 = f32(u32(d14 - hv * FP22_W11)); d15 = d15 + hv; }
        { let hv: f32 = floor(d15 * FP22_W11_INV); d15 = f32(u32(d15 - hv * FP22_W11)); d16 = d16 + hv; }
        { let hv: f32 = floor(d16 * FP22_W11_INV); d16 = f32(u32(d16 - hv * FP22_W11)); d17 = d17 + hv; }
        { let hv: f32 = floor(d17 * FP22_W11_INV); d17 = f32(u32(d17 - hv * FP22_W11)); d18 = d18 + hv; }
        { let hv: f32 = floor(d18 * FP22_W11_INV); d18 = f32(u32(d18 - hv * FP22_W11)); d19 = d19 + hv; }
        { let hv: f32 = floor(d19 * FP22_W11_INV); d19 = f32(u32(d19 - hv * FP22_W11)); d20 = d20 + hv; }
        { let hv: f32 = floor(d20 * FP22_W11_INV); d20 = f32(u32(d20 - hv * FP22_W11)); d21 = d21 + hv; }
        { let hv: f32 = floor(d21 * FP22_W11_INV); d21 = f32(u32(d21 - hv * FP22_W11)); d22 = d22 + hv; }
        { let hv: f32 = floor(d22 * FP22_W11_INV); d22 = f32(u32(d22 - hv * FP22_W11)); d23 = d23 + hv; }
        { let hv: f32 = floor(d23 * FP22_W11_INV); d23 = f32(u32(d23 - hv * FP22_W11)); d24 = d24 + hv; }
        { let hv: f32 = floor(d24 * FP22_W11_INV); d24 = f32(u32(d24 - hv * FP22_W11)); d25 = d25 + hv; }
        { let hv: f32 = floor(d25 * FP22_W11_INV); d25 = f32(u32(d25 - hv * FP22_W11)); d26 = d26 + hv; }
        { let hv: f32 = floor(d26 * FP22_W11_INV); d26 = f32(u32(d26 - hv * FP22_W11)); d27 = d27 + hv; }
        { let hv: f32 = floor(d27 * FP22_W11_INV); d27 = f32(u32(d27 - hv * FP22_W11)); d28 = d28 + hv; }
        { let hv: f32 = floor(d28 * FP22_W11_INV); d28 = f32(u32(d28 - hv * FP22_W11)); d29 = d29 + hv; }
        { let hv: f32 = floor(d29 * FP22_W11_INV); d29 = f32(u32(d29 - hv * FP22_W11)); d30 = d30 + hv; }
        { let hv: f32 = floor(d30 * FP22_W11_INV); d30 = f32(u32(d30 - hv * FP22_W11)); d31 = d31 + hv; }
        { let hv: f32 = floor(d31 * FP22_W11_INV); d31 = f32(u32(d31 - hv * FP22_W11)); d32 = d32 + hv; }
        { let hv: f32 = floor(d32 * FP22_W11_INV); d32 = f32(u32(d32 - hv * FP22_W11)); d33 = d33 + hv; }
        { let hv: f32 = floor(d33 * FP22_W11_INV); d33 = f32(u32(d33 - hv * FP22_W11)); d34 = d34 + hv; }
        { let hv: f32 = floor(d34 * FP22_W11_INV); d34 = f32(u32(d34 - hv * FP22_W11)); d35 = d35 + hv; }
        { let hv: f32 = floor(d35 * FP22_W11_INV); d35 = f32(u32(d35 - hv * FP22_W11)); d36 = d36 + hv; }
        { let hv: f32 = floor(d36 * FP22_W11_INV); d36 = f32(u32(d36 - hv * FP22_W11)); d37 = d37 + hv; }
        { let hv: f32 = floor(d37 * FP22_W11_INV); d37 = f32(u32(d37 - hv * FP22_W11)); d38 = d38 + hv; }
        { let hv: f32 = floor(d38 * FP22_W11_INV); d38 = f32(u32(d38 - hv * FP22_W11)); d39 = d39 + hv; }
        { let hv: f32 = floor(d39 * FP22_W11_INV); d39 = f32(u32(d39 - hv * FP22_W11)); d40 = d40 + hv; }
        { let hv: f32 = floor(d40 * FP22_W11_INV); d40 = f32(u32(d40 - hv * FP22_W11)); d41 = d41 + hv; }
        { let hv: f32 = floor(d41 * FP22_W11_INV); d41 = f32(u32(d41 - hv * FP22_W11)); d42 = d42 + hv; }
        { let hv: f32 = floor(d42 * FP22_W11_INV); d42 = f32(u32(d42 - hv * FP22_W11)); d43 = d43 + hv; }
        { let hv: f32 = floor(d43 * FP22_W11_INV); d43 = f32(u32(d43 - hv * FP22_W11)); d44 = d44 + hv; }
        { let hv: f32 = floor(d44 * FP22_W11_INV); d44 = f32(u32(d44 - hv * FP22_W11)); d45 = d45 + hv; }
        { let hv: f32 = floor(d45 * FP22_W11_INV); d45 = f32(u32(d45 - hv * FP22_W11)); d46 = d46 + hv; }
        { let hv: f32 = floor(d46 * FP22_W11_INV); d46 = f32(u32(d46 - hv * FP22_W11)); d47 = d47 + hv; }
        { let hv: f32 = floor(d47 * FP22_W11_INV); d47 = f32(u32(d47 - hv * FP22_W11)); d48 = d48 + hv; }
    }
    // fold 48 x 11-bit cols -> 24 x 22-bit u32 product limbs
    var P0: u32 = u32(d0) + (u32(d1) << 11u);
    var P1: u32 = u32(d2) + (u32(d3) << 11u);
    var P2: u32 = u32(d4) + (u32(d5) << 11u);
    var P3: u32 = u32(d6) + (u32(d7) << 11u);
    var P4: u32 = u32(d8) + (u32(d9) << 11u);
    var P5: u32 = u32(d10) + (u32(d11) << 11u);
    var P6: u32 = u32(d12) + (u32(d13) << 11u);
    var P7: u32 = u32(d14) + (u32(d15) << 11u);
    var P8: u32 = u32(d16) + (u32(d17) << 11u);
    var P9: u32 = u32(d18) + (u32(d19) << 11u);
    var P10: u32 = u32(d20) + (u32(d21) << 11u);
    var P11: u32 = u32(d22) + (u32(d23) << 11u);
    var P12: u32 = u32(d24) + (u32(d25) << 11u);
    var P13: u32 = u32(d26) + (u32(d27) << 11u);
    var P14: u32 = u32(d28) + (u32(d29) << 11u);
    var P15: u32 = u32(d30) + (u32(d31) << 11u);
    var P16: u32 = u32(d32) + (u32(d33) << 11u);
    var P17: u32 = u32(d34) + (u32(d35) << 11u);
    var P18: u32 = u32(d36) + (u32(d37) << 11u);
    var P19: u32 = u32(d38) + (u32(d39) << 11u);
    var P20: u32 = u32(d40) + (u32(d41) << 11u);
    var P21: u32 = u32(d42) + (u32(d43) << 11u);
    var P22: u32 = u32(d44) + (u32(d45) << 11u);
    var P23: u32 = u32(d46) + (u32(d47) << 11u);
    var P24: u32 = 0u;
    {  // carry-propagate product limbs to [0, 2^22)
        var c: u32 = 0u;
        { let v: u32 = P0 + c; P0 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P1 + c; P1 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P2 + c; P2 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P3 + c; P3 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P4 + c; P4 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P5 + c; P5 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P6 + c; P6 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P7 + c; P7 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P8 + c; P8 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P9 + c; P9 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P10 + c; P10 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P11 + c; P11 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P12 + c; P12 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P13 + c; P13 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P14 + c; P14 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P15 + c; P15 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P16 + c; P16 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    // integer 22-bit CIOS Montgomery reduce (no float, no 13-bit)
    {  // CIOS step i=0
        let m: u32 = (P0 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P0, c); P0 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P1, c); P1 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P2, c); P2 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P3, c); P3 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P4, c); P4 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P5, c); P5 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P11, c); P11 = r2.x; c = r2.y; }
        { let v: u32 = P12 + c; P12 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P13 + c; P13 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P14 + c; P14 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P15 + c; P15 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P16 + c; P16 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=1
        let m: u32 = (P1 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P1, c); P1 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P2, c); P2 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P3, c); P3 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P4, c); P4 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P5, c); P5 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P12, c); P12 = r2.x; c = r2.y; }
        { let v: u32 = P13 + c; P13 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P14 + c; P14 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P15 + c; P15 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P16 + c; P16 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=2
        let m: u32 = (P2 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P2, c); P2 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P3, c); P3 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P4, c); P4 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P5, c); P5 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P13, c); P13 = r2.x; c = r2.y; }
        { let v: u32 = P14 + c; P14 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P15 + c; P15 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P16 + c; P16 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=3
        let m: u32 = (P3 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P3, c); P3 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P4, c); P4 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P5, c); P5 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P14, c); P14 = r2.x; c = r2.y; }
        { let v: u32 = P15 + c; P15 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P16 + c; P16 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=4
        let m: u32 = (P4 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P4, c); P4 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P5, c); P5 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P15, c); P15 = r2.x; c = r2.y; }
        { let v: u32 = P16 + c; P16 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=5
        let m: u32 = (P5 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P5, c); P5 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P16, c); P16 = r2.x; c = r2.y; }
        { let v: u32 = P17 + c; P17 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=6
        let m: u32 = (P6 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P6, c); P6 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P16, c); P16 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P17, c); P17 = r2.x; c = r2.y; }
        { let v: u32 = P18 + c; P18 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=7
        let m: u32 = (P7 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P7, c); P7 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P16, c); P16 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P17, c); P17 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P18, c); P18 = r2.x; c = r2.y; }
        { let v: u32 = P19 + c; P19 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=8
        let m: u32 = (P8 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P8, c); P8 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P16, c); P16 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P17, c); P17 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P18, c); P18 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P19, c); P19 = r2.x; c = r2.y; }
        { let v: u32 = P20 + c; P20 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=9
        let m: u32 = (P9 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P9, c); P9 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P16, c); P16 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P17, c); P17 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P18, c); P18 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P19, c); P19 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P20, c); P20 = r2.x; c = r2.y; }
        { let v: u32 = P21 + c; P21 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=10
        let m: u32 = (P10 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P10, c); P10 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P16, c); P16 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P17, c); P17 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P18, c); P18 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P19, c); P19 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P20, c); P20 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P21, c); P21 = r2.x; c = r2.y; }
        { let v: u32 = P22 + c; P22 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    {  // CIOS step i=11
        let m: u32 = (P11 * FP22_N0_22) & 4194303u;
        var c: u32 = 0u;
        { let r2: vec2<u32> = fp22_madd(m, FP22_P0, P11, c); P11 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P1, P12, c); P12 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P2, P13, c); P13 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P3, P14, c); P14 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P4, P15, c); P15 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P5, P16, c); P16 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P6, P17, c); P17 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P7, P18, c); P18 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P8, P19, c); P19 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P9, P20, c); P20 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P10, P21, c); P21 = r2.x; c = r2.y; }
        { let r2: vec2<u32> = fp22_madd(m, FP22_P11, P22, c); P22 = r2.x; c = r2.y; }
        { let v: u32 = P23 + c; P23 = v & 4194303u; c = v >> 22u; }
        { let v: u32 = P24 + c; P24 = v & 4194303u; c = v >> 22u; }
    }
    // residue = P12..P23 (12 x 22-bit), in [0, 2p)
    var r0: u32 = P12;
    var r1: u32 = P13;
    var r2: u32 = P14;
    var r3: u32 = P15;
    var r4: u32 = P16;
    var r5: u32 = P17;
    var r6: u32 = P18;
    var r7: u32 = P19;
    var r8: u32 = P20;
    var r9: u32 = P21;
    var r10: u32 = P22;
    var r11: u32 = P23;
    var rtop: u32 = P24;
    {  // conditional subtract p
        var brw: u32 = 0u; var ds: array<u32, 12>;
        { let t1: u32 = r0 - FP22_P0; let v: u32 = t1 - brw; ds[0] = v & 4194303u; brw = (select(0u,1u,r0 < FP22_P0) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r1 - FP22_P1; let v: u32 = t1 - brw; ds[1] = v & 4194303u; brw = (select(0u,1u,r1 < FP22_P1) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r2 - FP22_P2; let v: u32 = t1 - brw; ds[2] = v & 4194303u; brw = (select(0u,1u,r2 < FP22_P2) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r3 - FP22_P3; let v: u32 = t1 - brw; ds[3] = v & 4194303u; brw = (select(0u,1u,r3 < FP22_P3) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r4 - FP22_P4; let v: u32 = t1 - brw; ds[4] = v & 4194303u; brw = (select(0u,1u,r4 < FP22_P4) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r5 - FP22_P5; let v: u32 = t1 - brw; ds[5] = v & 4194303u; brw = (select(0u,1u,r5 < FP22_P5) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r6 - FP22_P6; let v: u32 = t1 - brw; ds[6] = v & 4194303u; brw = (select(0u,1u,r6 < FP22_P6) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r7 - FP22_P7; let v: u32 = t1 - brw; ds[7] = v & 4194303u; brw = (select(0u,1u,r7 < FP22_P7) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r8 - FP22_P8; let v: u32 = t1 - brw; ds[8] = v & 4194303u; brw = (select(0u,1u,r8 < FP22_P8) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r9 - FP22_P9; let v: u32 = t1 - brw; ds[9] = v & 4194303u; brw = (select(0u,1u,r9 < FP22_P9) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r10 - FP22_P10; let v: u32 = t1 - brw; ds[10] = v & 4194303u; brw = (select(0u,1u,r10 < FP22_P10) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = r11 - FP22_P11; let v: u32 = t1 - brw; ds[11] = v & 4194303u; brw = (select(0u,1u,r11 < FP22_P11) + select(0u,1u,t1 < brw)); }
        let useD: bool = (rtop > 0u) || (brw == 0u);
        r0 = select(r0, ds[0], useD);
        r1 = select(r1, ds[1], useD);
        r2 = select(r2, ds[2], useD);
        r3 = select(r3, ds[3], useD);
        r4 = select(r4, ds[4], useD);
        r5 = select(r5, ds[5], useD);
        r6 = select(r6, ds[6], useD);
        r7 = select(r7, ds[7], useD);
        r8 = select(r8, ds[8], useD);
        r9 = select(r9, ds[9], useD);
        r10 = select(r10, ds[10], useD);
        r11 = select(r11, ds[11], useD);
    }
    // R264 -> R260 fixup: multiply by 2^4 (four doublings mod p)
    for (var dd: u32 = 0u; dd < 4u; dd = dd + 1u) {
        var s: array<u32, 12>; var c: u32 = 0u;
        { let v: u32 = (r0 << 1u) + c; s[0] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r1 << 1u) + c; s[1] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r2 << 1u) + c; s[2] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r3 << 1u) + c; s[3] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r4 << 1u) + c; s[4] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r5 << 1u) + c; s[5] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r6 << 1u) + c; s[6] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r7 << 1u) + c; s[7] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r8 << 1u) + c; s[8] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r9 << 1u) + c; s[9] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r10 << 1u) + c; s[10] = v & 4194303u; c = v >> 22u; }
        { let v: u32 = (r11 << 1u) + c; s[11] = v & 4194303u; c = v >> 22u; }
        var brw: u32 = 0u; var ds: array<u32, 12>;
        { let t1: u32 = s[0] - FP22_P0; let v: u32 = t1 - brw; ds[0] = v & 4194303u; brw = (select(0u,1u,s[0] < FP22_P0) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[1] - FP22_P1; let v: u32 = t1 - brw; ds[1] = v & 4194303u; brw = (select(0u,1u,s[1] < FP22_P1) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[2] - FP22_P2; let v: u32 = t1 - brw; ds[2] = v & 4194303u; brw = (select(0u,1u,s[2] < FP22_P2) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[3] - FP22_P3; let v: u32 = t1 - brw; ds[3] = v & 4194303u; brw = (select(0u,1u,s[3] < FP22_P3) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[4] - FP22_P4; let v: u32 = t1 - brw; ds[4] = v & 4194303u; brw = (select(0u,1u,s[4] < FP22_P4) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[5] - FP22_P5; let v: u32 = t1 - brw; ds[5] = v & 4194303u; brw = (select(0u,1u,s[5] < FP22_P5) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[6] - FP22_P6; let v: u32 = t1 - brw; ds[6] = v & 4194303u; brw = (select(0u,1u,s[6] < FP22_P6) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[7] - FP22_P7; let v: u32 = t1 - brw; ds[7] = v & 4194303u; brw = (select(0u,1u,s[7] < FP22_P7) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[8] - FP22_P8; let v: u32 = t1 - brw; ds[8] = v & 4194303u; brw = (select(0u,1u,s[8] < FP22_P8) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[9] - FP22_P9; let v: u32 = t1 - brw; ds[9] = v & 4194303u; brw = (select(0u,1u,s[9] < FP22_P9) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[10] - FP22_P10; let v: u32 = t1 - brw; ds[10] = v & 4194303u; brw = (select(0u,1u,s[10] < FP22_P10) + select(0u,1u,t1 < brw)); }
        { let t1: u32 = s[11] - FP22_P11; let v: u32 = t1 - brw; ds[11] = v & 4194303u; brw = (select(0u,1u,s[11] < FP22_P11) + select(0u,1u,t1 < brw)); }
        let useD: bool = (c > 0u) || (brw == 0u);
        r0 = select(s[0], ds[0], useD);
        r1 = select(s[1], ds[1], useD);
        r2 = select(s[2], ds[2], useD);
        r3 = select(s[3], ds[3], useD);
        r4 = select(s[4], ds[4], useD);
        r5 = select(s[5], ds[5], useD);
        r6 = select(s[6], ds[6], useD);
        r7 = select(s[7], ds[7], useD);
        r8 = select(s[8], ds[8], useD);
        r9 = select(s[9], ds[9], useD);
        r10 = select(s[10], ds[10], useD);
        r11 = select(s[11], ds[11], useD);
    }
    // pack 12 x 22-bit -> 8 x u32
    var w: array<u32, 8>;
    w[0u] = (r0 << 0u) | (r1 << 22u);
    w[1u] = (r1 >> 10u) | (r2 << 12u);
    w[2u] = (r2 >> 20u) | (r3 << 2u) | (r4 << 24u);
    w[3u] = (r4 >> 8u) | (r5 << 14u);
    w[4u] = (r5 >> 18u) | (r6 << 4u) | (r7 << 26u);
    w[5u] = (r7 >> 6u) | (r8 << 16u);
    w[6u] = (r8 >> 16u) | (r9 << 6u) | (r10 << 28u);
    w[7u] = (r10 >> 4u) | (r11 << 18u);
    return w;
}
