// Option A: Bernstein-Yang safegcd inverse on the 20 x 13-bit BigInt
// representation. Tight wide-multiply apply_matrix variant.
//
// LAYOUT
//   - BigInt:  20 x 13-bit limbs (canonical input) or 20 limbs storing
//     SIGNED i32 bitcast into u32 (non-canonical between iters, magnitude
//     bounded by 2^15).
//   - Matrix entries u, v, q, r: signed i32. After BATCH=26 inner divsteps
//     |entry| <= 2^26, fits comfortably in i32.
//   - Inner divsteps operate on the LOW 64 BITS of (f, g) carried as a
//     vec2<u32>. We need >= BATCH bits to drive divstep decisions
//     correctly; 64 gives us 38 bits of headroom for sign propagation.
//
// APPLY_MATRIX DESIGN
//   - Per-output-limb raw accumulators are each ONE inline expression of
//     four 13-bit muls + three adds. No common-subexpression pre-compute
//     (each lo/hi*limb product is used in exactly ONE slot). The compiler
//     issues them back-to-back, the GPU keeps registers tight.
//   - Carry-propagation is TWO parallel passes (each reads only the prior
//     pass's output, not its own in-progress writes). After two passes the
//     limbs fit in [-2^14, 2^14] and we store them as u32 bitcast.
//   - We do NOT canonicalize between outer iterations: limbs stay signed
//     non-canonical up to 2^15 magnitude. Next iter's multiply tolerates
//     this because (2^13_matrix * 2^15_limb) * 4_terms = 2^30 < 2^31.
//   - We DO canonicalize d at the very end (before the Mont correction).
//
// LOOP BOUND DISCIPLINE
//   - Outer driver:        `for (var iter < BYA_NUM_OUTER)`    (const = 29)
//   - Inner divsteps:      `for (var i < BYA_BATCH)`           (const = 26)
//   - Apply matrix:        fully unrolled (no loops)
//   - Reduce-to-canonical: `for (var it < BYA_RTC_MAX_ITERS)`  (const = 4)
//
// CONVERGENCE
//   Bernstein-Yang safegcd bound for 256-bit modulus: 735 divsteps.
//   BATCH=26 -> NUM_OUTER = ceil(735/26) = 29.

const BYA_BATCH: u32 = 26u;
const BYA_NUM_OUTER: u32 = 29u;
const BYA_REDUCE_INTERVAL: u32 = 4u;
const BYA_RTC_MAX_ITERS: u32 = 4u;
const BYA_MASK13: u32 = (1u << 13u) - 1u;
const BYA_MASK13_I32: i32 = (1 << 13) - 1;

// 2x2 matrix entries after BATCH=26 divsteps. Each entry is an i32 with
// |.| <= 2^26.
struct MatA {
    u: i32,
    v: i32,
    q: i32,
    r: i32,
}

// ============================================================
// bya_divsteps: BATCH=26 branchy divsteps on the low 64 bits of (f, g).
//
// Matrix entries u, v, q, r grow by at most one shl + one sub per iter,
// so after BATCH=26 we have |entry| <= 2^26.
// ============================================================
fn bya_divsteps(delta: ptr<function, i32>, f_lo_in: vec2<u32>, g_lo_in: vec2<u32>) -> MatA {
    var f_lo: vec2<u32> = f_lo_in;
    var g_lo: vec2<u32> = g_lo_in;
    var u: i32 = 1;
    var v: i32 = 0;
    var q: i32 = 0;
    var r: i32 = 1;
    var d: i32 = *delta;
    for (var i: u32 = 0u; i < BYA_BATCH; i = i + 1u) {
        if (u64_low_bit(g_lo) != 0u) {
            if (d > 0) {
                let nf: vec2<u32> = g_lo;
                let diff: vec2<u32> = u64_sub(g_lo, f_lo);
                let ng: vec2<u32> = u64_shr1(diff);
                let nu: i32 = q << 1u;
                let nv: i32 = r << 1u;
                let nq: i32 = q - u;
                let nr: i32 = r - v;
                f_lo = nf;
                g_lo = ng;
                u = nu;
                v = nv;
                q = nq;
                r = nr;
                d = 1 - d;
            } else {
                let sum: vec2<u32> = u64_add(g_lo, f_lo);
                g_lo = u64_shr1(sum);
                q = q + u;
                r = r + v;
                u = u << 1u;
                v = v << 1u;
                d = d + 1;
            }
        } else {
            g_lo = u64_shr1(g_lo);
            u = u << 1u;
            v = v << 1u;
            d = d + 1;
        }
    }
    *delta = d;
    return MatA(u, v, q, r);
}

// ============================================================
// bya_low_u64_lohi: low 64 bits of a 20 x 13-bit BigInt with canonical
// 13-bit limbs (the serial-carry apply_matrix output guarantees this).
// ============================================================
fn bya_low_u64_lohi(x: BigInt) -> vec2<u32> {
    let l0: u32 = x.limbs[0] & MASK;
    let l1: u32 = x.limbs[1] & MASK;
    let l2: u32 = x.limbs[2] & MASK;
    let l3: u32 = x.limbs[3] & MASK;
    let l4: u32 = x.limbs[4] & MASK;
    let lo32: u32 = l0 | (l1 << 13u) | (l2 << 26u);
    let hi32: u32 = (l2 >> 6u) | (l3 << 7u) | (l4 << 20u);
    return vec2<u32>(lo32, hi32);
}

// ============================================================
// bya_normalise: carry-propagate so each limb in [0, N-1) is in
// [0, 2^13) canonical and the top limb absorbs the signed extension.
// Used by reduce_to_canonical at the END of fr_inv_by_a.
// ============================================================
fn bya_normalise(x: ptr<function, BigInt>) {
    var c: i32 = 0;
    for (var i: u32 = 0u; i < {{ num_words }}u - 1u; i = i + 1u) {
        let v = i32((*x).limbs[i]) + c;
        (*x).limbs[i] = u32(v) & MASK;
        c = v >> WORD_SIZE;
    }
    (*x).limbs[{{ num_words }}u - 1u] = u32(i32((*x).limbs[{{ num_words }}u - 1u]) + c) & MASK;
}

// ============================================================
// bya_apply_matrix_fg
//
// Compute (f_new, g_new) = ((u*f + v*g) >> 26, (q*f + r*g) >> 26).
//
// Matrix entry split: m = m_lo + m_hi * 2^13 where m_lo in [0, 2^13)
// (taken as low-13-bit unsigned) and m_hi in [-2^13, 2^13) (taken as
// arithmetic shift right of i32). The product is recovered as:
//   m * x = m_lo * x + m_hi * x * 2^13
//
// For each output position k in [0, 19], the raw value is
//   nf[k] = u_lo*f[k+2] + v_lo*g[k+2] + u_hi*f[k+1] + v_hi*g[k+1]
// with the convention f[20] = f[21] = 0 (and same for g). The two
// dropped low product positions contribute a boundary carry into
// output 0 — see "boundary carry" comment below.
//
// Sign of f/g: limbs in [0, N-2] are non-negative (in [-2^15, 2^15) when
// non-canonical between iters); the top limb f[N-1] carries the signed
// extension of the full integer and is sign-extended via arithmetic
// shifts before multiplying.
//
// |nf[k]| <= 4 * (2^13 * 2^15) = 2^30 with non-canonical limbs, fits i32.
// ============================================================
fn bya_apply_matrix_fg(m: MatA, f: ptr<function, BigInt>, g: ptr<function, BigInt>) {
    // Matrix splits. _lo in [0, 2^13); _hi signed in [-2^13, 2^13).
    let u_lo: i32 = i32(u32(m.u) & MASK);
    let u_hi: i32 = m.u >> WORD_SIZE;
    let v_lo: i32 = i32(u32(m.v) & MASK);
    let v_hi: i32 = m.v >> WORD_SIZE;
    let q_lo: i32 = i32(u32(m.q) & MASK);
    let q_hi: i32 = m.q >> WORD_SIZE;
    let r_lo: i32 = i32(u32(m.r) & MASK);
    let r_hi: i32 = m.r >> WORD_SIZE;

    // Load all limbs into named locals to give the compiler a chance to
    // hoist the loads above the multiply chain.
    let f0:  i32 = i32((*f).limbs[0]);
    let f1:  i32 = i32((*f).limbs[1]);
    let f2:  i32 = i32((*f).limbs[2]);
    let f3:  i32 = i32((*f).limbs[3]);
    let f4:  i32 = i32((*f).limbs[4]);
    let f5:  i32 = i32((*f).limbs[5]);
    let f6:  i32 = i32((*f).limbs[6]);
    let f7:  i32 = i32((*f).limbs[7]);
    let f8:  i32 = i32((*f).limbs[8]);
    let f9:  i32 = i32((*f).limbs[9]);
    let f10: i32 = i32((*f).limbs[10]);
    let f11: i32 = i32((*f).limbs[11]);
    let f12: i32 = i32((*f).limbs[12]);
    let f13: i32 = i32((*f).limbs[13]);
    let f14: i32 = i32((*f).limbs[14]);
    let f15: i32 = i32((*f).limbs[15]);
    let f16: i32 = i32((*f).limbs[16]);
    let f17: i32 = i32((*f).limbs[17]);
    let f18: i32 = i32((*f).limbs[18]);
    // Sign-extension of the top limb (bit 12 is the sign bit for canonical
    // input; for non-canonical input we still arithmetic-shift the full
    // i32 — high bits already carry sign).
    let f19_raw: u32 = (*f).limbs[19];
    let f19: i32 = (i32(f19_raw) << (32u - WORD_SIZE)) >> (32u - WORD_SIZE);

    let g0:  i32 = i32((*g).limbs[0]);
    let g1:  i32 = i32((*g).limbs[1]);
    let g2:  i32 = i32((*g).limbs[2]);
    let g3:  i32 = i32((*g).limbs[3]);
    let g4:  i32 = i32((*g).limbs[4]);
    let g5:  i32 = i32((*g).limbs[5]);
    let g6:  i32 = i32((*g).limbs[6]);
    let g7:  i32 = i32((*g).limbs[7]);
    let g8:  i32 = i32((*g).limbs[8]);
    let g9:  i32 = i32((*g).limbs[9]);
    let g10: i32 = i32((*g).limbs[10]);
    let g11: i32 = i32((*g).limbs[11]);
    let g12: i32 = i32((*g).limbs[12]);
    let g13: i32 = i32((*g).limbs[13]);
    let g14: i32 = i32((*g).limbs[14]);
    let g15: i32 = i32((*g).limbs[15]);
    let g16: i32 = i32((*g).limbs[16]);
    let g17: i32 = i32((*g).limbs[17]);
    let g18: i32 = i32((*g).limbs[18]);
    let g19_raw: u32 = (*g).limbs[19];
    let g19: i32 = (i32(g19_raw) << (32u - WORD_SIZE)) >> (32u - WORD_SIZE);

    // Boundary carry from the two dropped low product positions (positions
    // 0 and 1). Carry-propagates as in a serial chain — the parallel-pass
    // identity `(A >> 26) + (B >> 13)` is OFF BY 1 from
    // `((B + (A >> 13)) >> 13)` in general because shifts don't distribute
    // over addition. The boundary lands at output limb 0 below.
    let rp0_f: i32 = u_lo * f0 + v_lo * g0;
    let rp1_f: i32 = u_lo * f1 + v_lo * g1 + u_hi * f0 + v_hi * g0;
    let boundary_f: i32 = (rp1_f + (rp0_f >> 13u)) >> 13u;

    let rp0_g: i32 = q_lo * f0 + r_lo * g0;
    let rp1_g: i32 = q_lo * f1 + r_lo * g1 + q_hi * f0 + r_hi * g0;
    let boundary_g: i32 = (rp1_g + (rp0_g >> 13u)) >> 13u;

    // MULTIPLY PHASE with shared partial products. Each individual product
    // is used in EXACTLY ONE output slot — the names just help the GPU
    // compiler pipeline issue muls + adds without re-reading the limb.
    let ulf2  = u_lo * f2;  let ulf3  = u_lo * f3;  let ulf4  = u_lo * f4;  let ulf5  = u_lo * f5;
    let ulf6  = u_lo * f6;  let ulf7  = u_lo * f7;  let ulf8  = u_lo * f8;  let ulf9  = u_lo * f9;
    let ulf10 = u_lo * f10; let ulf11 = u_lo * f11; let ulf12 = u_lo * f12; let ulf13 = u_lo * f13;
    let ulf14 = u_lo * f14; let ulf15 = u_lo * f15; let ulf16 = u_lo * f16; let ulf17 = u_lo * f17;
    let ulf18 = u_lo * f18; let ulf19 = u_lo * f19;
    let uhf1  = u_hi * f1;  let uhf2  = u_hi * f2;  let uhf3  = u_hi * f3;  let uhf4  = u_hi * f4;
    let uhf5  = u_hi * f5;  let uhf6  = u_hi * f6;  let uhf7  = u_hi * f7;  let uhf8  = u_hi * f8;
    let uhf9  = u_hi * f9;  let uhf10 = u_hi * f10; let uhf11 = u_hi * f11; let uhf12 = u_hi * f12;
    let uhf13 = u_hi * f13; let uhf14 = u_hi * f14; let uhf15 = u_hi * f15; let uhf16 = u_hi * f16;
    let uhf17 = u_hi * f17; let uhf18 = u_hi * f18; let uhf19 = u_hi * f19;
    let vlg2  = v_lo * g2;  let vlg3  = v_lo * g3;  let vlg4  = v_lo * g4;  let vlg5  = v_lo * g5;
    let vlg6  = v_lo * g6;  let vlg7  = v_lo * g7;  let vlg8  = v_lo * g8;  let vlg9  = v_lo * g9;
    let vlg10 = v_lo * g10; let vlg11 = v_lo * g11; let vlg12 = v_lo * g12; let vlg13 = v_lo * g13;
    let vlg14 = v_lo * g14; let vlg15 = v_lo * g15; let vlg16 = v_lo * g16; let vlg17 = v_lo * g17;
    let vlg18 = v_lo * g18; let vlg19 = v_lo * g19;
    let vhg1  = v_hi * g1;  let vhg2  = v_hi * g2;  let vhg3  = v_hi * g3;  let vhg4  = v_hi * g4;
    let vhg5  = v_hi * g5;  let vhg6  = v_hi * g6;  let vhg7  = v_hi * g7;  let vhg8  = v_hi * g8;
    let vhg9  = v_hi * g9;  let vhg10 = v_hi * g10; let vhg11 = v_hi * g11; let vhg12 = v_hi * g12;
    let vhg13 = v_hi * g13; let vhg14 = v_hi * g14; let vhg15 = v_hi * g15; let vhg16 = v_hi * g16;
    let vhg17 = v_hi * g17; let vhg18 = v_hi * g18; let vhg19 = v_hi * g19;

    let qlf2  = q_lo * f2;  let qlf3  = q_lo * f3;  let qlf4  = q_lo * f4;  let qlf5  = q_lo * f5;
    let qlf6  = q_lo * f6;  let qlf7  = q_lo * f7;  let qlf8  = q_lo * f8;  let qlf9  = q_lo * f9;
    let qlf10 = q_lo * f10; let qlf11 = q_lo * f11; let qlf12 = q_lo * f12; let qlf13 = q_lo * f13;
    let qlf14 = q_lo * f14; let qlf15 = q_lo * f15; let qlf16 = q_lo * f16; let qlf17 = q_lo * f17;
    let qlf18 = q_lo * f18; let qlf19 = q_lo * f19;
    let qhf1  = q_hi * f1;  let qhf2  = q_hi * f2;  let qhf3  = q_hi * f3;  let qhf4  = q_hi * f4;
    let qhf5  = q_hi * f5;  let qhf6  = q_hi * f6;  let qhf7  = q_hi * f7;  let qhf8  = q_hi * f8;
    let qhf9  = q_hi * f9;  let qhf10 = q_hi * f10; let qhf11 = q_hi * f11; let qhf12 = q_hi * f12;
    let qhf13 = q_hi * f13; let qhf14 = q_hi * f14; let qhf15 = q_hi * f15; let qhf16 = q_hi * f16;
    let qhf17 = q_hi * f17; let qhf18 = q_hi * f18; let qhf19 = q_hi * f19;
    let rlg2  = r_lo * g2;  let rlg3  = r_lo * g3;  let rlg4  = r_lo * g4;  let rlg5  = r_lo * g5;
    let rlg6  = r_lo * g6;  let rlg7  = r_lo * g7;  let rlg8  = r_lo * g8;  let rlg9  = r_lo * g9;
    let rlg10 = r_lo * g10; let rlg11 = r_lo * g11; let rlg12 = r_lo * g12; let rlg13 = r_lo * g13;
    let rlg14 = r_lo * g14; let rlg15 = r_lo * g15; let rlg16 = r_lo * g16; let rlg17 = r_lo * g17;
    let rlg18 = r_lo * g18; let rlg19 = r_lo * g19;
    let rhg1  = r_hi * g1;  let rhg2  = r_hi * g2;  let rhg3  = r_hi * g3;  let rhg4  = r_hi * g4;
    let rhg5  = r_hi * g5;  let rhg6  = r_hi * g6;  let rhg7  = r_hi * g7;  let rhg8  = r_hi * g8;
    let rhg9  = r_hi * g9;  let rhg10 = r_hi * g10; let rhg11 = r_hi * g11; let rhg12 = r_hi * g12;
    let rhg13 = r_hi * g13; let rhg14 = r_hi * g14; let rhg15 = r_hi * g15; let rhg16 = r_hi * g16;
    let rhg17 = r_hi * g17; let rhg18 = r_hi * g18; let rhg19 = r_hi * g19;

    let nf0:  i32 = ulf2  + vlg2  + uhf1  + vhg1  + boundary_f;
    let nf1:  i32 = ulf3  + vlg3  + uhf2  + vhg2;
    let nf2:  i32 = ulf4  + vlg4  + uhf3  + vhg3;
    let nf3:  i32 = ulf5  + vlg5  + uhf4  + vhg4;
    let nf4:  i32 = ulf6  + vlg6  + uhf5  + vhg5;
    let nf5:  i32 = ulf7  + vlg7  + uhf6  + vhg6;
    let nf6:  i32 = ulf8  + vlg8  + uhf7  + vhg7;
    let nf7:  i32 = ulf9  + vlg9  + uhf8  + vhg8;
    let nf8:  i32 = ulf10 + vlg10 + uhf9  + vhg9;
    let nf9:  i32 = ulf11 + vlg11 + uhf10 + vhg10;
    let nf10: i32 = ulf12 + vlg12 + uhf11 + vhg11;
    let nf11: i32 = ulf13 + vlg13 + uhf12 + vhg12;
    let nf12: i32 = ulf14 + vlg14 + uhf13 + vhg13;
    let nf13: i32 = ulf15 + vlg15 + uhf14 + vhg14;
    let nf14: i32 = ulf16 + vlg16 + uhf15 + vhg15;
    let nf15: i32 = ulf17 + vlg17 + uhf16 + vhg16;
    let nf16: i32 = ulf18 + vlg18 + uhf17 + vhg17;
    let nf17: i32 = ulf19 + vlg19 + uhf18 + vhg18;
    let nf18: i32 =                  uhf19 + vhg19;

    let ng0:  i32 = qlf2  + rlg2  + qhf1  + rhg1  + boundary_g;
    let ng1:  i32 = qlf3  + rlg3  + qhf2  + rhg2;
    let ng2:  i32 = qlf4  + rlg4  + qhf3  + rhg3;
    let ng3:  i32 = qlf5  + rlg5  + qhf4  + rhg4;
    let ng4:  i32 = qlf6  + rlg6  + qhf5  + rhg5;
    let ng5:  i32 = qlf7  + rlg7  + qhf6  + rhg6;
    let ng6:  i32 = qlf8  + rlg8  + qhf7  + rhg7;
    let ng7:  i32 = qlf9  + rlg9  + qhf8  + rhg8;
    let ng8:  i32 = qlf10 + rlg10 + qhf9  + rhg9;
    let ng9:  i32 = qlf11 + rlg11 + qhf10 + rhg10;
    let ng10: i32 = qlf12 + rlg12 + qhf11 + rhg11;
    let ng11: i32 = qlf13 + rlg13 + qhf12 + rhg12;
    let ng12: i32 = qlf14 + rlg14 + qhf13 + rhg13;
    let ng13: i32 = qlf15 + rlg15 + qhf14 + rhg14;
    let ng14: i32 = qlf16 + rlg16 + qhf15 + rhg15;
    let ng15: i32 = qlf17 + rlg17 + qhf16 + rhg16;
    let ng16: i32 = qlf18 + rlg18 + qhf17 + rhg17;
    let ng17: i32 = qlf19 + rlg19 + qhf18 + rhg18;
    let ng18: i32 =                  qhf19 + rhg19;

    // SERIAL CARRY PASS — empirically faster than 2-pass parallel on this
    // GPU (the carry chain is short enough that scheduler latency dominates
    // any pipelining advantage).
    var cf: i32 = 0;
    let vf_0: i32 = nf0 + cf;  (*f).limbs[0] = u32(vf_0) & MASK; cf = vf_0 >> 13u;
    let vf_1: i32 = nf1 + cf;  (*f).limbs[1] = u32(vf_1) & MASK; cf = vf_1 >> 13u;
    let vf_2: i32 = nf2 + cf;  (*f).limbs[2] = u32(vf_2) & MASK; cf = vf_2 >> 13u;
    let vf_3: i32 = nf3 + cf;  (*f).limbs[3] = u32(vf_3) & MASK; cf = vf_3 >> 13u;
    let vf_4: i32 = nf4 + cf;  (*f).limbs[4] = u32(vf_4) & MASK; cf = vf_4 >> 13u;
    let vf_5: i32 = nf5 + cf;  (*f).limbs[5] = u32(vf_5) & MASK; cf = vf_5 >> 13u;
    let vf_6: i32 = nf6 + cf;  (*f).limbs[6] = u32(vf_6) & MASK; cf = vf_6 >> 13u;
    let vf_7: i32 = nf7 + cf;  (*f).limbs[7] = u32(vf_7) & MASK; cf = vf_7 >> 13u;
    let vf_8: i32 = nf8 + cf;  (*f).limbs[8] = u32(vf_8) & MASK; cf = vf_8 >> 13u;
    let vf_9: i32 = nf9 + cf;  (*f).limbs[9] = u32(vf_9) & MASK; cf = vf_9 >> 13u;
    let vf_10: i32 = nf10 + cf; (*f).limbs[10] = u32(vf_10) & MASK; cf = vf_10 >> 13u;
    let vf_11: i32 = nf11 + cf; (*f).limbs[11] = u32(vf_11) & MASK; cf = vf_11 >> 13u;
    let vf_12: i32 = nf12 + cf; (*f).limbs[12] = u32(vf_12) & MASK; cf = vf_12 >> 13u;
    let vf_13: i32 = nf13 + cf; (*f).limbs[13] = u32(vf_13) & MASK; cf = vf_13 >> 13u;
    let vf_14: i32 = nf14 + cf; (*f).limbs[14] = u32(vf_14) & MASK; cf = vf_14 >> 13u;
    let vf_15: i32 = nf15 + cf; (*f).limbs[15] = u32(vf_15) & MASK; cf = vf_15 >> 13u;
    let vf_16: i32 = nf16 + cf; (*f).limbs[16] = u32(vf_16) & MASK; cf = vf_16 >> 13u;
    let vf_17: i32 = nf17 + cf; (*f).limbs[17] = u32(vf_17) & MASK; cf = vf_17 >> 13u;
    let vf_18: i32 = nf18 + cf; (*f).limbs[18] = u32(vf_18) & MASK; cf = vf_18 >> 13u;
    (*f).limbs[19] = u32(cf);

    var cg: i32 = 0;
    let vg_0: i32 = ng0 + cg;  (*g).limbs[0] = u32(vg_0) & MASK; cg = vg_0 >> 13u;
    let vg_1: i32 = ng1 + cg;  (*g).limbs[1] = u32(vg_1) & MASK; cg = vg_1 >> 13u;
    let vg_2: i32 = ng2 + cg;  (*g).limbs[2] = u32(vg_2) & MASK; cg = vg_2 >> 13u;
    let vg_3: i32 = ng3 + cg;  (*g).limbs[3] = u32(vg_3) & MASK; cg = vg_3 >> 13u;
    let vg_4: i32 = ng4 + cg;  (*g).limbs[4] = u32(vg_4) & MASK; cg = vg_4 >> 13u;
    let vg_5: i32 = ng5 + cg;  (*g).limbs[5] = u32(vg_5) & MASK; cg = vg_5 >> 13u;
    let vg_6: i32 = ng6 + cg;  (*g).limbs[6] = u32(vg_6) & MASK; cg = vg_6 >> 13u;
    let vg_7: i32 = ng7 + cg;  (*g).limbs[7] = u32(vg_7) & MASK; cg = vg_7 >> 13u;
    let vg_8: i32 = ng8 + cg;  (*g).limbs[8] = u32(vg_8) & MASK; cg = vg_8 >> 13u;
    let vg_9: i32 = ng9 + cg;  (*g).limbs[9] = u32(vg_9) & MASK; cg = vg_9 >> 13u;
    let vg_10: i32 = ng10 + cg; (*g).limbs[10] = u32(vg_10) & MASK; cg = vg_10 >> 13u;
    let vg_11: i32 = ng11 + cg; (*g).limbs[11] = u32(vg_11) & MASK; cg = vg_11 >> 13u;
    let vg_12: i32 = ng12 + cg; (*g).limbs[12] = u32(vg_12) & MASK; cg = vg_12 >> 13u;
    let vg_13: i32 = ng13 + cg; (*g).limbs[13] = u32(vg_13) & MASK; cg = vg_13 >> 13u;
    let vg_14: i32 = ng14 + cg; (*g).limbs[14] = u32(vg_14) & MASK; cg = vg_14 >> 13u;
    let vg_15: i32 = ng15 + cg; (*g).limbs[15] = u32(vg_15) & MASK; cg = vg_15 >> 13u;
    let vg_16: i32 = ng16 + cg; (*g).limbs[16] = u32(vg_16) & MASK; cg = vg_16 >> 13u;
    let vg_17: i32 = ng17 + cg; (*g).limbs[17] = u32(vg_17) & MASK; cg = vg_17 >> 13u;
    let vg_18: i32 = ng18 + cg; (*g).limbs[18] = u32(vg_18) & MASK; cg = vg_18 >> 13u;
    (*g).limbs[19] = u32(cg);
}

// ============================================================
// bya_apply_matrix_de — same shape as fg, plus k_d/k_e * p folded in.
//
// k_d, k_e are chosen so the low 26 bits of (u*d + v*e), (q*d + r*e)
// cancel mod p. The "low 26" reconstruction uses the same two-limb
// pre-compute as before.
//
// |nd[k]| <= 6 * (2^13 * 2^15) = 3 * 2^29 ≈ 2^30 — fits i32 with margin.
// ============================================================
fn bya_apply_matrix_de(
    m: MatA,
    d: ptr<function, BigInt>,
    e: ptr<function, BigInt>,
    p: ptr<function, BigInt>,
    p_inv_lo: u32,
) {
    let u_lo: i32 = i32(u32(m.u) & MASK);
    let u_hi: i32 = m.u >> WORD_SIZE;
    let v_lo: i32 = i32(u32(m.v) & MASK);
    let v_hi: i32 = m.v >> WORD_SIZE;
    let q_lo: i32 = i32(u32(m.q) & MASK);
    let q_hi: i32 = m.q >> WORD_SIZE;
    let r_lo: i32 = i32(u32(m.r) & MASK);
    let r_hi: i32 = m.r >> WORD_SIZE;

    // Load all limbs into named locals.
    let d0:  i32 = i32((*d).limbs[0]);
    let d1:  i32 = i32((*d).limbs[1]);
    let d2:  i32 = i32((*d).limbs[2]);
    let d3:  i32 = i32((*d).limbs[3]);
    let d4:  i32 = i32((*d).limbs[4]);
    let d5:  i32 = i32((*d).limbs[5]);
    let d6:  i32 = i32((*d).limbs[6]);
    let d7:  i32 = i32((*d).limbs[7]);
    let d8:  i32 = i32((*d).limbs[8]);
    let d9:  i32 = i32((*d).limbs[9]);
    let d10: i32 = i32((*d).limbs[10]);
    let d11: i32 = i32((*d).limbs[11]);
    let d12: i32 = i32((*d).limbs[12]);
    let d13: i32 = i32((*d).limbs[13]);
    let d14: i32 = i32((*d).limbs[14]);
    let d15: i32 = i32((*d).limbs[15]);
    let d16: i32 = i32((*d).limbs[16]);
    let d17: i32 = i32((*d).limbs[17]);
    let d18: i32 = i32((*d).limbs[18]);
    let d19_raw: u32 = (*d).limbs[19];
    let d19: i32 = (i32(d19_raw) << (32u - WORD_SIZE)) >> (32u - WORD_SIZE);

    let e0:  i32 = i32((*e).limbs[0]);
    let e1:  i32 = i32((*e).limbs[1]);
    let e2:  i32 = i32((*e).limbs[2]);
    let e3:  i32 = i32((*e).limbs[3]);
    let e4:  i32 = i32((*e).limbs[4]);
    let e5:  i32 = i32((*e).limbs[5]);
    let e6:  i32 = i32((*e).limbs[6]);
    let e7:  i32 = i32((*e).limbs[7]);
    let e8:  i32 = i32((*e).limbs[8]);
    let e9:  i32 = i32((*e).limbs[9]);
    let e10: i32 = i32((*e).limbs[10]);
    let e11: i32 = i32((*e).limbs[11]);
    let e12: i32 = i32((*e).limbs[12]);
    let e13: i32 = i32((*e).limbs[13]);
    let e14: i32 = i32((*e).limbs[14]);
    let e15: i32 = i32((*e).limbs[15]);
    let e16: i32 = i32((*e).limbs[16]);
    let e17: i32 = i32((*e).limbs[17]);
    let e18: i32 = i32((*e).limbs[18]);
    let e19_raw: u32 = (*e).limbs[19];
    let e19: i32 = (i32(e19_raw) << (32u - WORD_SIZE)) >> (32u - WORD_SIZE);

    let p0:  i32 = i32((*p).limbs[0]);
    let p1:  i32 = i32((*p).limbs[1]);
    let p2:  i32 = i32((*p).limbs[2]);
    let p3:  i32 = i32((*p).limbs[3]);
    let p4:  i32 = i32((*p).limbs[4]);
    let p5:  i32 = i32((*p).limbs[5]);
    let p6:  i32 = i32((*p).limbs[6]);
    let p7:  i32 = i32((*p).limbs[7]);
    let p8:  i32 = i32((*p).limbs[8]);
    let p9:  i32 = i32((*p).limbs[9]);
    let p10: i32 = i32((*p).limbs[10]);
    let p11: i32 = i32((*p).limbs[11]);
    let p12: i32 = i32((*p).limbs[12]);
    let p13: i32 = i32((*p).limbs[13]);
    let p14: i32 = i32((*p).limbs[14]);
    let p15: i32 = i32((*p).limbs[15]);
    let p16: i32 = i32((*p).limbs[16]);
    let p17: i32 = i32((*p).limbs[17]);
    let p18: i32 = i32((*p).limbs[18]);
    let p19: i32 = i32((*p).limbs[19]);

    // === Step 1: m-trick. Compute low 26 bits of (u*d + v*e), (q*d + r*e)
    // to derive k_d, k_e so the result is divisible by 2^26.
    let nd0_pre: i32 = u_lo * d0 + v_lo * e0;
    let nd1_pre: i32 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    let ne0_pre: i32 = q_lo * d0 + r_lo * e0;
    let ne1_pre: i32 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;

    let nd1_full: i32 = nd1_pre + (nd0_pre >> 13u);
    let ne1_full: i32 = ne1_pre + (ne0_pre >> 13u);
    let td_low26: u32 = (u32(nd0_pre) & MASK) | ((u32(nd1_full) & MASK) << 13u);
    let te_low26: u32 = (u32(ne0_pre) & MASK) | ((u32(ne1_full) & MASK) << 13u);

    let MASK_BATCH: u32 = (1u << BYA_BATCH) - 1u;
    let neg_td: u32 = (~td_low26 + 1u) & MASK_BATCH;
    let neg_te: u32 = (~te_low26 + 1u) & MASK_BATCH;
    let kd_full: u32 = (neg_td * p_inv_lo) & MASK_BATCH;
    let ke_full: u32 = (neg_te * p_inv_lo) & MASK_BATCH;

    let kd_lo: i32 = i32(kd_full & MASK);
    let kd_hi: i32 = i32(kd_full >> WORD_SIZE);
    let ke_lo: i32 = i32(ke_full & MASK);
    let ke_hi: i32 = i32(ke_full >> WORD_SIZE);

    // Boundary carry from positions 0, 1 of the full product. After
    // m-trick, the low 26 bits ARE zero, so boundary is exactly the
    // shift-out from positions 0 and 1.
    let rp0_d: i32 = nd0_pre + kd_lo * p0;
    let rp1_d: i32 = nd1_pre + kd_lo * p1 + kd_hi * p0;
    let boundary_d: i32 = (rp1_d + (rp0_d >> 13u)) >> 13u;

    let rp0_e: i32 = ne0_pre + ke_lo * p0;
    let rp1_e: i32 = ne1_pre + ke_lo * p1 + ke_hi * p0;
    let boundary_e: i32 = (rp1_e + (rp0_e >> 13u)) >> 13u;

    // PARALLEL MULTIPLY PHASE.
    // raw_nd[k] = u_lo*d[k+2] + v_lo*e[k+2] + u_hi*d[k+1] + v_hi*e[k+1]
    //           + kd_lo*p[k+2] + kd_hi*p[k+1]
    let nd0:  i32 = u_lo * d2  + v_lo * e2  + u_hi * d1  + v_hi * e1  + kd_lo * p2  + kd_hi * p1  + boundary_d;
    let nd1:  i32 = u_lo * d3  + v_lo * e3  + u_hi * d2  + v_hi * e2  + kd_lo * p3  + kd_hi * p2;
    let nd2:  i32 = u_lo * d4  + v_lo * e4  + u_hi * d3  + v_hi * e3  + kd_lo * p4  + kd_hi * p3;
    let nd3:  i32 = u_lo * d5  + v_lo * e5  + u_hi * d4  + v_hi * e4  + kd_lo * p5  + kd_hi * p4;
    let nd4:  i32 = u_lo * d6  + v_lo * e6  + u_hi * d5  + v_hi * e5  + kd_lo * p6  + kd_hi * p5;
    let nd5:  i32 = u_lo * d7  + v_lo * e7  + u_hi * d6  + v_hi * e6  + kd_lo * p7  + kd_hi * p6;
    let nd6:  i32 = u_lo * d8  + v_lo * e8  + u_hi * d7  + v_hi * e7  + kd_lo * p8  + kd_hi * p7;
    let nd7:  i32 = u_lo * d9  + v_lo * e9  + u_hi * d8  + v_hi * e8  + kd_lo * p9  + kd_hi * p8;
    let nd8:  i32 = u_lo * d10 + v_lo * e10 + u_hi * d9  + v_hi * e9  + kd_lo * p10 + kd_hi * p9;
    let nd9:  i32 = u_lo * d11 + v_lo * e11 + u_hi * d10 + v_hi * e10 + kd_lo * p11 + kd_hi * p10;
    let nd10: i32 = u_lo * d12 + v_lo * e12 + u_hi * d11 + v_hi * e11 + kd_lo * p12 + kd_hi * p11;
    let nd11: i32 = u_lo * d13 + v_lo * e13 + u_hi * d12 + v_hi * e12 + kd_lo * p13 + kd_hi * p12;
    let nd12: i32 = u_lo * d14 + v_lo * e14 + u_hi * d13 + v_hi * e13 + kd_lo * p14 + kd_hi * p13;
    let nd13: i32 = u_lo * d15 + v_lo * e15 + u_hi * d14 + v_hi * e14 + kd_lo * p15 + kd_hi * p14;
    let nd14: i32 = u_lo * d16 + v_lo * e16 + u_hi * d15 + v_hi * e15 + kd_lo * p16 + kd_hi * p15;
    let nd15: i32 = u_lo * d17 + v_lo * e17 + u_hi * d16 + v_hi * e16 + kd_lo * p17 + kd_hi * p16;
    let nd16: i32 = u_lo * d18 + v_lo * e18 + u_hi * d17 + v_hi * e17 + kd_lo * p18 + kd_hi * p17;
    let nd17: i32 = u_lo * d19 + v_lo * e19 + u_hi * d18 + v_hi * e18 + kd_lo * p19 + kd_hi * p18;
    let nd18: i32 =                            u_hi * d19 + v_hi * e19                + kd_hi * p19;

    let ne0:  i32 = q_lo * d2  + r_lo * e2  + q_hi * d1  + r_hi * e1  + ke_lo * p2  + ke_hi * p1  + boundary_e;
    let ne1:  i32 = q_lo * d3  + r_lo * e3  + q_hi * d2  + r_hi * e2  + ke_lo * p3  + ke_hi * p2;
    let ne2:  i32 = q_lo * d4  + r_lo * e4  + q_hi * d3  + r_hi * e3  + ke_lo * p4  + ke_hi * p3;
    let ne3:  i32 = q_lo * d5  + r_lo * e5  + q_hi * d4  + r_hi * e4  + ke_lo * p5  + ke_hi * p4;
    let ne4:  i32 = q_lo * d6  + r_lo * e6  + q_hi * d5  + r_hi * e5  + ke_lo * p6  + ke_hi * p5;
    let ne5:  i32 = q_lo * d7  + r_lo * e7  + q_hi * d6  + r_hi * e6  + ke_lo * p7  + ke_hi * p6;
    let ne6:  i32 = q_lo * d8  + r_lo * e8  + q_hi * d7  + r_hi * e7  + ke_lo * p8  + ke_hi * p7;
    let ne7:  i32 = q_lo * d9  + r_lo * e9  + q_hi * d8  + r_hi * e8  + ke_lo * p9  + ke_hi * p8;
    let ne8:  i32 = q_lo * d10 + r_lo * e10 + q_hi * d9  + r_hi * e9  + ke_lo * p10 + ke_hi * p9;
    let ne9:  i32 = q_lo * d11 + r_lo * e11 + q_hi * d10 + r_hi * e10 + ke_lo * p11 + ke_hi * p10;
    let ne10: i32 = q_lo * d12 + r_lo * e12 + q_hi * d11 + r_hi * e11 + ke_lo * p12 + ke_hi * p11;
    let ne11: i32 = q_lo * d13 + r_lo * e13 + q_hi * d12 + r_hi * e12 + ke_lo * p13 + ke_hi * p12;
    let ne12: i32 = q_lo * d14 + r_lo * e14 + q_hi * d13 + r_hi * e13 + ke_lo * p14 + ke_hi * p13;
    let ne13: i32 = q_lo * d15 + r_lo * e15 + q_hi * d14 + r_hi * e14 + ke_lo * p15 + ke_hi * p14;
    let ne14: i32 = q_lo * d16 + r_lo * e16 + q_hi * d15 + r_hi * e15 + ke_lo * p16 + ke_hi * p15;
    let ne15: i32 = q_lo * d17 + r_lo * e17 + q_hi * d16 + r_hi * e16 + ke_lo * p17 + ke_hi * p16;
    let ne16: i32 = q_lo * d18 + r_lo * e18 + q_hi * d17 + r_hi * e17 + ke_lo * p18 + ke_hi * p17;
    let ne17: i32 = q_lo * d19 + r_lo * e19 + q_hi * d18 + r_hi * e18 + ke_lo * p19 + ke_hi * p18;
    let ne18: i32 =                            q_hi * d19 + r_hi * e19                + ke_hi * p19;

    // SERIAL CARRY PASS.
    var cd: i32 = 0;
    let vd_0: i32 = nd0 + cd;  (*d).limbs[0] = u32(vd_0) & MASK; cd = vd_0 >> 13u;
    let vd_1: i32 = nd1 + cd;  (*d).limbs[1] = u32(vd_1) & MASK; cd = vd_1 >> 13u;
    let vd_2: i32 = nd2 + cd;  (*d).limbs[2] = u32(vd_2) & MASK; cd = vd_2 >> 13u;
    let vd_3: i32 = nd3 + cd;  (*d).limbs[3] = u32(vd_3) & MASK; cd = vd_3 >> 13u;
    let vd_4: i32 = nd4 + cd;  (*d).limbs[4] = u32(vd_4) & MASK; cd = vd_4 >> 13u;
    let vd_5: i32 = nd5 + cd;  (*d).limbs[5] = u32(vd_5) & MASK; cd = vd_5 >> 13u;
    let vd_6: i32 = nd6 + cd;  (*d).limbs[6] = u32(vd_6) & MASK; cd = vd_6 >> 13u;
    let vd_7: i32 = nd7 + cd;  (*d).limbs[7] = u32(vd_7) & MASK; cd = vd_7 >> 13u;
    let vd_8: i32 = nd8 + cd;  (*d).limbs[8] = u32(vd_8) & MASK; cd = vd_8 >> 13u;
    let vd_9: i32 = nd9 + cd;  (*d).limbs[9] = u32(vd_9) & MASK; cd = vd_9 >> 13u;
    let vd_10: i32 = nd10 + cd; (*d).limbs[10] = u32(vd_10) & MASK; cd = vd_10 >> 13u;
    let vd_11: i32 = nd11 + cd; (*d).limbs[11] = u32(vd_11) & MASK; cd = vd_11 >> 13u;
    let vd_12: i32 = nd12 + cd; (*d).limbs[12] = u32(vd_12) & MASK; cd = vd_12 >> 13u;
    let vd_13: i32 = nd13 + cd; (*d).limbs[13] = u32(vd_13) & MASK; cd = vd_13 >> 13u;
    let vd_14: i32 = nd14 + cd; (*d).limbs[14] = u32(vd_14) & MASK; cd = vd_14 >> 13u;
    let vd_15: i32 = nd15 + cd; (*d).limbs[15] = u32(vd_15) & MASK; cd = vd_15 >> 13u;
    let vd_16: i32 = nd16 + cd; (*d).limbs[16] = u32(vd_16) & MASK; cd = vd_16 >> 13u;
    let vd_17: i32 = nd17 + cd; (*d).limbs[17] = u32(vd_17) & MASK; cd = vd_17 >> 13u;
    let vd_18: i32 = nd18 + cd; (*d).limbs[18] = u32(vd_18) & MASK; cd = vd_18 >> 13u;
    (*d).limbs[19] = u32(cd);

    var ce: i32 = 0;
    let ve_0: i32 = ne0 + ce;  (*e).limbs[0] = u32(ve_0) & MASK; ce = ve_0 >> 13u;
    let ve_1: i32 = ne1 + ce;  (*e).limbs[1] = u32(ve_1) & MASK; ce = ve_1 >> 13u;
    let ve_2: i32 = ne2 + ce;  (*e).limbs[2] = u32(ve_2) & MASK; ce = ve_2 >> 13u;
    let ve_3: i32 = ne3 + ce;  (*e).limbs[3] = u32(ve_3) & MASK; ce = ve_3 >> 13u;
    let ve_4: i32 = ne4 + ce;  (*e).limbs[4] = u32(ve_4) & MASK; ce = ve_4 >> 13u;
    let ve_5: i32 = ne5 + ce;  (*e).limbs[5] = u32(ve_5) & MASK; ce = ve_5 >> 13u;
    let ve_6: i32 = ne6 + ce;  (*e).limbs[6] = u32(ve_6) & MASK; ce = ve_6 >> 13u;
    let ve_7: i32 = ne7 + ce;  (*e).limbs[7] = u32(ve_7) & MASK; ce = ve_7 >> 13u;
    let ve_8: i32 = ne8 + ce;  (*e).limbs[8] = u32(ve_8) & MASK; ce = ve_8 >> 13u;
    let ve_9: i32 = ne9 + ce;  (*e).limbs[9] = u32(ve_9) & MASK; ce = ve_9 >> 13u;
    let ve_10: i32 = ne10 + ce; (*e).limbs[10] = u32(ve_10) & MASK; ce = ve_10 >> 13u;
    let ve_11: i32 = ne11 + ce; (*e).limbs[11] = u32(ve_11) & MASK; ce = ve_11 >> 13u;
    let ve_12: i32 = ne12 + ce; (*e).limbs[12] = u32(ve_12) & MASK; ce = ve_12 >> 13u;
    let ve_13: i32 = ne13 + ce; (*e).limbs[13] = u32(ve_13) & MASK; ce = ve_13 >> 13u;
    let ve_14: i32 = ne14 + ce; (*e).limbs[14] = u32(ve_14) & MASK; ce = ve_14 >> 13u;
    let ve_15: i32 = ne15 + ce; (*e).limbs[15] = u32(ve_15) & MASK; ce = ve_15 >> 13u;
    let ve_16: i32 = ne16 + ce; (*e).limbs[16] = u32(ve_16) & MASK; ce = ve_16 >> 13u;
    let ve_17: i32 = ne17 + ce; (*e).limbs[17] = u32(ve_17) & MASK; ce = ve_17 >> 13u;
    let ve_18: i32 = ne18 + ce; (*e).limbs[18] = u32(ve_18) & MASK; ce = ve_18 >> 13u;
    (*e).limbs[19] = u32(ce);
}

// ============================================================
// Driver helpers
// ============================================================

fn bya_is_zero(x: ptr<function, BigInt>) -> bool {
    var a: u32 = 0u;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        a = a | (*x).limbs[i];
    }
    return a == 0u;
}

fn bya_neg_inplace(x: ptr<function, BigInt>) {
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        (*x).limbs[i] = u32(-i32((*x).limbs[i]));
    }
    bya_normalise(x);
}

fn bya_add_p_inplace(x: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        (*x).limbs[i] = u32(i32((*x).limbs[i]) + i32((*p).limbs[i]));
    }
    bya_normalise(x);
}

fn bya_sub_p_inplace(x: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        (*x).limbs[i] = u32(i32((*x).limbs[i]) - i32((*p).limbs[i]));
    }
    bya_normalise(x);
}

fn bya_reduce_to_canonical(x: ptr<function, BigInt>, p: ptr<function, BigInt>) {
    bya_normalise(x);
    var done: bool = false;
    for (var it: u32 = 0u; it < BYA_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (bigint_is_neg_2c(x)) {
            bya_add_p_inplace(x, p);
        } else if (bigint_gte(x, p)) {
            bya_sub_p_inplace(x, p);
        } else {
            done = true;
        }
    }
}

const FR_INV_BY_A_P_INV_LO: u32 = {{ p_inv_by_a_lo }}u;

// fr_inv_by_a: Bernstein-Yang safegcd inverse driver, BATCH=26 / NUM_OUTER=29
// on the 20 x 13-bit BigInt representation. Tight inline-mul apply_matrix.
fn fr_inv_by_a(a: BigInt) -> BigInt {
    var p_loc: BigInt = get_p();
    var f: BigInt = get_p();
    var g: BigInt = a;

    var d: BigInt;
    var e: BigInt;
    for (var k: u32 = 0u; k < {{ num_words }}u; k = k + 1u) {
        d.limbs[k] = 0u;
        e.limbs[k] = 0u;
    }
    e.limbs[0] = 1u;

    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYA_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = bya_low_u64_lohi(f);
        let g_lo: vec2<u32> = bya_low_u64_lohi(g);
        let m: MatA = bya_divsteps(&delta, f_lo, g_lo);
        bya_apply_matrix_fg(m, &f, &g);
        bya_apply_matrix_de(m, &d, &e, &p_loc, FR_INV_BY_A_P_INV_LO);
        if (((iter + 1u) % BYA_REDUCE_INTERVAL) == 0u) {
            bya_reduce_to_canonical(&d, &p_loc);
            bya_reduce_to_canonical(&e, &p_loc);
        }
        if (bya_is_zero(&g)) {
            done = true;
        }
    }

    bya_reduce_to_canonical(&d, &p_loc);
    if (bigint_is_neg_2c(&f)) {
        bya_neg_inplace(&d);
        bya_reduce_to_canonical(&d, &p_loc);
    }

    var inv_native: BigInt = d;
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&inv_native, &r_cubed);
}
