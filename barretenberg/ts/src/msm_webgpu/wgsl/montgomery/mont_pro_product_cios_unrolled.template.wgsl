// === FULLY-UNROLLED CIOS Montgomery multiply — flagged variant (montmul=cios_unrolled) ===
//
// Device-validated alternative body for `fn montgomery_product` in the
// karat_yuval scaffold. On Pixel 9a / Mali-G715, logn=17 profile A (10-rep
// medians): 488.4 -> 360.6 ms (-26%) vs the Karatsuba default, on-device
// cross-check AGREE, malioc Bound=A (register-resident, LS<A). Bit-exact over
// 120000+16 edge cases (rebench_validate_cios.mjs).
//
// SHAPE: 20 scalar accumulators s0..s19 (NO array, NO dynamic index) so naga
// keeps them in registers rather than spilling to a thread-local alloca (the
// looped form indexes s.limbs[j] dynamically -> LS-bound -> 3.56x SLOWER; do
// NOT use that form). P limbs are inline immediates -> BN254 @ 20x13-bit ONLY.
//
// This file is spliced over the Karatsuba `fn montgomery_product` by
// ShaderManager.renderCiosUnrolledMont() via brace-match (it reuses the
// scaffold's get_p / conditional_reduce / NUM_WORDS / WORD_SIZE / MASK / N0).
// It is a static partial (no mustache placeholders); the BN254 p-limb
// immediates are baked, hence the curve guard in renderCiosUnrolledMont().
fn montgomery_product(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {
    var s0: u32 = 0u;
    var s1: u32 = 0u;
    var s2: u32 = 0u;
    var s3: u32 = 0u;
    var s4: u32 = 0u;
    var s5: u32 = 0u;
    var s6: u32 = 0u;
    var s7: u32 = 0u;
    var s8: u32 = 0u;
    var s9: u32 = 0u;
    var s10: u32 = 0u;
    var s11: u32 = 0u;
    var s12: u32 = 0u;
    var s13: u32 = 0u;
    var s14: u32 = 0u;
    var s15: u32 = 0u;
    var s16: u32 = 0u;
    var s17: u32 = 0u;
    var s18: u32 = 0u;
    var s19: u32 = 0u;
    let x0: u32 = (*x_ptr).limbs[0u];
    let x1: u32 = (*x_ptr).limbs[1u];
    let x2: u32 = (*x_ptr).limbs[2u];
    let x3: u32 = (*x_ptr).limbs[3u];
    let x4: u32 = (*x_ptr).limbs[4u];
    let x5: u32 = (*x_ptr).limbs[5u];
    let x6: u32 = (*x_ptr).limbs[6u];
    let x7: u32 = (*x_ptr).limbs[7u];
    let x8: u32 = (*x_ptr).limbs[8u];
    let x9: u32 = (*x_ptr).limbs[9u];
    let x10: u32 = (*x_ptr).limbs[10u];
    let x11: u32 = (*x_ptr).limbs[11u];
    let x12: u32 = (*x_ptr).limbs[12u];
    let x13: u32 = (*x_ptr).limbs[13u];
    let x14: u32 = (*x_ptr).limbs[14u];
    let x15: u32 = (*x_ptr).limbs[15u];
    let x16: u32 = (*x_ptr).limbs[16u];
    let x17: u32 = (*x_ptr).limbs[17u];
    let x18: u32 = (*x_ptr).limbs[18u];
    let x19: u32 = (*x_ptr).limbs[19u];
    let y0: u32 = (*y_ptr).limbs[0u];
    let y1: u32 = (*y_ptr).limbs[1u];
    let y2: u32 = (*y_ptr).limbs[2u];
    let y3: u32 = (*y_ptr).limbs[3u];
    let y4: u32 = (*y_ptr).limbs[4u];
    let y5: u32 = (*y_ptr).limbs[5u];
    let y6: u32 = (*y_ptr).limbs[6u];
    let y7: u32 = (*y_ptr).limbs[7u];
    let y8: u32 = (*y_ptr).limbs[8u];
    let y9: u32 = (*y_ptr).limbs[9u];
    let y10: u32 = (*y_ptr).limbs[10u];
    let y11: u32 = (*y_ptr).limbs[11u];
    let y12: u32 = (*y_ptr).limbs[12u];
    let y13: u32 = (*y_ptr).limbs[13u];
    let y14: u32 = (*y_ptr).limbs[14u];
    let y15: u32 = (*y_ptr).limbs[15u];
    let y16: u32 = (*y_ptr).limbs[16u];
    let y17: u32 = (*y_ptr).limbs[17u];
    let y18: u32 = (*y_ptr).limbs[18u];
    let y19: u32 = (*y_ptr).limbs[19u];

    {   // ===== outer i=0 =====
        let t: u32 = s0 + x0 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x0 * y1 + qi * 999u + c;
        s1 = s2 + x0 * y2 + qi * 1462u;
        s2 = s3 + x0 * y3 + qi * 280u;
        s3 = s4 + x0 * y4 + qi * 5058u;
        s4 = s5 + x0 * y5 + qi * 1350u;
        s5 = s6 + x0 * y6 + qi * 455u;
        s6 = s7 + x0 * y7 + qi * 4653u;
        s7 = s8 + x0 * y8 + qi * 362u;
        s8 = s9 + x0 * y9 + qi * 3260u;
        s9 = s10 + x0 * y10 + qi * 5655u;
        s10 = s11 + x0 * y11 + qi * 770u;
        s11 = s12 + x0 * y12 + qi * 7016u;
        s12 = s13 + x0 * y13 + qi * 2082u;
        s13 = s14 + x0 * y14 + qi * 1761u;
        s14 = s15 + x0 * y15 + qi * 5125u;
        s15 = s16 + x0 * y16 + qi * 305u;
        s16 = s17 + x0 * y17 + qi * 5015u;
        s17 = s18 + x0 * y18 + qi * 6419u;
        s18 = s19 + x0 * y19 + qi * 96u;
        s18 = x0 * y19 + qi * 96u;
    }
    {   // ===== outer i=1 =====
        let t: u32 = s0 + x1 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x1 * y1 + qi * 999u + c;
        s1 = s2 + x1 * y2 + qi * 1462u;
        s2 = s3 + x1 * y3 + qi * 280u;
        s3 = s4 + x1 * y4 + qi * 5058u;
        s4 = s5 + x1 * y5 + qi * 1350u;
        s5 = s6 + x1 * y6 + qi * 455u;
        s6 = s7 + x1 * y7 + qi * 4653u;
        s7 = s8 + x1 * y8 + qi * 362u;
        s8 = s9 + x1 * y9 + qi * 3260u;
        s9 = s10 + x1 * y10 + qi * 5655u;
        s10 = s11 + x1 * y11 + qi * 770u;
        s11 = s12 + x1 * y12 + qi * 7016u;
        s12 = s13 + x1 * y13 + qi * 2082u;
        s13 = s14 + x1 * y14 + qi * 1761u;
        s14 = s15 + x1 * y15 + qi * 5125u;
        s15 = s16 + x1 * y16 + qi * 305u;
        s16 = s17 + x1 * y17 + qi * 5015u;
        s17 = s18 + x1 * y18 + qi * 6419u;
        s18 = s19 + x1 * y19 + qi * 96u;
        s18 = x1 * y19 + qi * 96u;
    }
    {   // ===== outer i=2 =====
        let t: u32 = s0 + x2 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x2 * y1 + qi * 999u + c;
        s1 = s2 + x2 * y2 + qi * 1462u;
        s2 = s3 + x2 * y3 + qi * 280u;
        s3 = s4 + x2 * y4 + qi * 5058u;
        s4 = s5 + x2 * y5 + qi * 1350u;
        s5 = s6 + x2 * y6 + qi * 455u;
        s6 = s7 + x2 * y7 + qi * 4653u;
        s7 = s8 + x2 * y8 + qi * 362u;
        s8 = s9 + x2 * y9 + qi * 3260u;
        s9 = s10 + x2 * y10 + qi * 5655u;
        s10 = s11 + x2 * y11 + qi * 770u;
        s11 = s12 + x2 * y12 + qi * 7016u;
        s12 = s13 + x2 * y13 + qi * 2082u;
        s13 = s14 + x2 * y14 + qi * 1761u;
        s14 = s15 + x2 * y15 + qi * 5125u;
        s15 = s16 + x2 * y16 + qi * 305u;
        s16 = s17 + x2 * y17 + qi * 5015u;
        s17 = s18 + x2 * y18 + qi * 6419u;
        s18 = s19 + x2 * y19 + qi * 96u;
        s18 = x2 * y19 + qi * 96u;
    }
    {   // ===== outer i=3 =====
        let t: u32 = s0 + x3 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x3 * y1 + qi * 999u + c;
        s1 = s2 + x3 * y2 + qi * 1462u;
        s2 = s3 + x3 * y3 + qi * 280u;
        s3 = s4 + x3 * y4 + qi * 5058u;
        s4 = s5 + x3 * y5 + qi * 1350u;
        s5 = s6 + x3 * y6 + qi * 455u;
        s6 = s7 + x3 * y7 + qi * 4653u;
        s7 = s8 + x3 * y8 + qi * 362u;
        s8 = s9 + x3 * y9 + qi * 3260u;
        s9 = s10 + x3 * y10 + qi * 5655u;
        s10 = s11 + x3 * y11 + qi * 770u;
        s11 = s12 + x3 * y12 + qi * 7016u;
        s12 = s13 + x3 * y13 + qi * 2082u;
        s13 = s14 + x3 * y14 + qi * 1761u;
        s14 = s15 + x3 * y15 + qi * 5125u;
        s15 = s16 + x3 * y16 + qi * 305u;
        s16 = s17 + x3 * y17 + qi * 5015u;
        s17 = s18 + x3 * y18 + qi * 6419u;
        s18 = s19 + x3 * y19 + qi * 96u;
        s18 = x3 * y19 + qi * 96u;
    }
    {   // ===== outer i=4 =====
        let t: u32 = s0 + x4 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x4 * y1 + qi * 999u + c;
        s1 = s2 + x4 * y2 + qi * 1462u;
        s2 = s3 + x4 * y3 + qi * 280u;
        s3 = s4 + x4 * y4 + qi * 5058u;
        s4 = s5 + x4 * y5 + qi * 1350u;
        s5 = s6 + x4 * y6 + qi * 455u;
        s6 = s7 + x4 * y7 + qi * 4653u;
        s7 = s8 + x4 * y8 + qi * 362u;
        s8 = s9 + x4 * y9 + qi * 3260u;
        s9 = s10 + x4 * y10 + qi * 5655u;
        s10 = s11 + x4 * y11 + qi * 770u;
        s11 = s12 + x4 * y12 + qi * 7016u;
        s12 = s13 + x4 * y13 + qi * 2082u;
        s13 = s14 + x4 * y14 + qi * 1761u;
        s14 = s15 + x4 * y15 + qi * 5125u;
        s15 = s16 + x4 * y16 + qi * 305u;
        s16 = s17 + x4 * y17 + qi * 5015u;
        s17 = s18 + x4 * y18 + qi * 6419u;
        s18 = s19 + x4 * y19 + qi * 96u;
        s18 = x4 * y19 + qi * 96u;
    }
    {   // ===== outer i=5 =====
        let t: u32 = s0 + x5 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x5 * y1 + qi * 999u + c;
        s1 = s2 + x5 * y2 + qi * 1462u;
        s2 = s3 + x5 * y3 + qi * 280u;
        s3 = s4 + x5 * y4 + qi * 5058u;
        s4 = s5 + x5 * y5 + qi * 1350u;
        s5 = s6 + x5 * y6 + qi * 455u;
        s6 = s7 + x5 * y7 + qi * 4653u;
        s7 = s8 + x5 * y8 + qi * 362u;
        s8 = s9 + x5 * y9 + qi * 3260u;
        s9 = s10 + x5 * y10 + qi * 5655u;
        s10 = s11 + x5 * y11 + qi * 770u;
        s11 = s12 + x5 * y12 + qi * 7016u;
        s12 = s13 + x5 * y13 + qi * 2082u;
        s13 = s14 + x5 * y14 + qi * 1761u;
        s14 = s15 + x5 * y15 + qi * 5125u;
        s15 = s16 + x5 * y16 + qi * 305u;
        s16 = s17 + x5 * y17 + qi * 5015u;
        s17 = s18 + x5 * y18 + qi * 6419u;
        s18 = s19 + x5 * y19 + qi * 96u;
        s18 = x5 * y19 + qi * 96u;
    }
    {   // ===== outer i=6 =====
        let t: u32 = s0 + x6 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x6 * y1 + qi * 999u + c;
        s1 = s2 + x6 * y2 + qi * 1462u;
        s2 = s3 + x6 * y3 + qi * 280u;
        s3 = s4 + x6 * y4 + qi * 5058u;
        s4 = s5 + x6 * y5 + qi * 1350u;
        s5 = s6 + x6 * y6 + qi * 455u;
        s6 = s7 + x6 * y7 + qi * 4653u;
        s7 = s8 + x6 * y8 + qi * 362u;
        s8 = s9 + x6 * y9 + qi * 3260u;
        s9 = s10 + x6 * y10 + qi * 5655u;
        s10 = s11 + x6 * y11 + qi * 770u;
        s11 = s12 + x6 * y12 + qi * 7016u;
        s12 = s13 + x6 * y13 + qi * 2082u;
        s13 = s14 + x6 * y14 + qi * 1761u;
        s14 = s15 + x6 * y15 + qi * 5125u;
        s15 = s16 + x6 * y16 + qi * 305u;
        s16 = s17 + x6 * y17 + qi * 5015u;
        s17 = s18 + x6 * y18 + qi * 6419u;
        s18 = s19 + x6 * y19 + qi * 96u;
        s18 = x6 * y19 + qi * 96u;
    }
    {   // ===== outer i=7 =====
        let t: u32 = s0 + x7 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x7 * y1 + qi * 999u + c;
        s1 = s2 + x7 * y2 + qi * 1462u;
        s2 = s3 + x7 * y3 + qi * 280u;
        s3 = s4 + x7 * y4 + qi * 5058u;
        s4 = s5 + x7 * y5 + qi * 1350u;
        s5 = s6 + x7 * y6 + qi * 455u;
        s6 = s7 + x7 * y7 + qi * 4653u;
        s7 = s8 + x7 * y8 + qi * 362u;
        s8 = s9 + x7 * y9 + qi * 3260u;
        s9 = s10 + x7 * y10 + qi * 5655u;
        s10 = s11 + x7 * y11 + qi * 770u;
        s11 = s12 + x7 * y12 + qi * 7016u;
        s12 = s13 + x7 * y13 + qi * 2082u;
        s13 = s14 + x7 * y14 + qi * 1761u;
        s14 = s15 + x7 * y15 + qi * 5125u;
        s15 = s16 + x7 * y16 + qi * 305u;
        s16 = s17 + x7 * y17 + qi * 5015u;
        s17 = s18 + x7 * y18 + qi * 6419u;
        s18 = s19 + x7 * y19 + qi * 96u;
        s18 = x7 * y19 + qi * 96u;
    }
    {   // ===== outer i=8 =====
        let t: u32 = s0 + x8 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x8 * y1 + qi * 999u + c;
        s1 = s2 + x8 * y2 + qi * 1462u;
        s2 = s3 + x8 * y3 + qi * 280u;
        s3 = s4 + x8 * y4 + qi * 5058u;
        s4 = s5 + x8 * y5 + qi * 1350u;
        s5 = s6 + x8 * y6 + qi * 455u;
        s6 = s7 + x8 * y7 + qi * 4653u;
        s7 = s8 + x8 * y8 + qi * 362u;
        s8 = s9 + x8 * y9 + qi * 3260u;
        s9 = s10 + x8 * y10 + qi * 5655u;
        s10 = s11 + x8 * y11 + qi * 770u;
        s11 = s12 + x8 * y12 + qi * 7016u;
        s12 = s13 + x8 * y13 + qi * 2082u;
        s13 = s14 + x8 * y14 + qi * 1761u;
        s14 = s15 + x8 * y15 + qi * 5125u;
        s15 = s16 + x8 * y16 + qi * 305u;
        s16 = s17 + x8 * y17 + qi * 5015u;
        s17 = s18 + x8 * y18 + qi * 6419u;
        s18 = s19 + x8 * y19 + qi * 96u;
        s18 = x8 * y19 + qi * 96u;
    }
    {   // ===== outer i=9 =====
        let t: u32 = s0 + x9 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x9 * y1 + qi * 999u + c;
        s1 = s2 + x9 * y2 + qi * 1462u;
        s2 = s3 + x9 * y3 + qi * 280u;
        s3 = s4 + x9 * y4 + qi * 5058u;
        s4 = s5 + x9 * y5 + qi * 1350u;
        s5 = s6 + x9 * y6 + qi * 455u;
        s6 = s7 + x9 * y7 + qi * 4653u;
        s7 = s8 + x9 * y8 + qi * 362u;
        s8 = s9 + x9 * y9 + qi * 3260u;
        s9 = s10 + x9 * y10 + qi * 5655u;
        s10 = s11 + x9 * y11 + qi * 770u;
        s11 = s12 + x9 * y12 + qi * 7016u;
        s12 = s13 + x9 * y13 + qi * 2082u;
        s13 = s14 + x9 * y14 + qi * 1761u;
        s14 = s15 + x9 * y15 + qi * 5125u;
        s15 = s16 + x9 * y16 + qi * 305u;
        s16 = s17 + x9 * y17 + qi * 5015u;
        s17 = s18 + x9 * y18 + qi * 6419u;
        s18 = s19 + x9 * y19 + qi * 96u;
        s18 = x9 * y19 + qi * 96u;
    }
    {   // ===== outer i=10 =====
        let t: u32 = s0 + x10 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x10 * y1 + qi * 999u + c;
        s1 = s2 + x10 * y2 + qi * 1462u;
        s2 = s3 + x10 * y3 + qi * 280u;
        s3 = s4 + x10 * y4 + qi * 5058u;
        s4 = s5 + x10 * y5 + qi * 1350u;
        s5 = s6 + x10 * y6 + qi * 455u;
        s6 = s7 + x10 * y7 + qi * 4653u;
        s7 = s8 + x10 * y8 + qi * 362u;
        s8 = s9 + x10 * y9 + qi * 3260u;
        s9 = s10 + x10 * y10 + qi * 5655u;
        s10 = s11 + x10 * y11 + qi * 770u;
        s11 = s12 + x10 * y12 + qi * 7016u;
        s12 = s13 + x10 * y13 + qi * 2082u;
        s13 = s14 + x10 * y14 + qi * 1761u;
        s14 = s15 + x10 * y15 + qi * 5125u;
        s15 = s16 + x10 * y16 + qi * 305u;
        s16 = s17 + x10 * y17 + qi * 5015u;
        s17 = s18 + x10 * y18 + qi * 6419u;
        s18 = s19 + x10 * y19 + qi * 96u;
        s18 = x10 * y19 + qi * 96u;
    }
    {   // ===== outer i=11 =====
        let t: u32 = s0 + x11 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x11 * y1 + qi * 999u + c;
        s1 = s2 + x11 * y2 + qi * 1462u;
        s2 = s3 + x11 * y3 + qi * 280u;
        s3 = s4 + x11 * y4 + qi * 5058u;
        s4 = s5 + x11 * y5 + qi * 1350u;
        s5 = s6 + x11 * y6 + qi * 455u;
        s6 = s7 + x11 * y7 + qi * 4653u;
        s7 = s8 + x11 * y8 + qi * 362u;
        s8 = s9 + x11 * y9 + qi * 3260u;
        s9 = s10 + x11 * y10 + qi * 5655u;
        s10 = s11 + x11 * y11 + qi * 770u;
        s11 = s12 + x11 * y12 + qi * 7016u;
        s12 = s13 + x11 * y13 + qi * 2082u;
        s13 = s14 + x11 * y14 + qi * 1761u;
        s14 = s15 + x11 * y15 + qi * 5125u;
        s15 = s16 + x11 * y16 + qi * 305u;
        s16 = s17 + x11 * y17 + qi * 5015u;
        s17 = s18 + x11 * y18 + qi * 6419u;
        s18 = s19 + x11 * y19 + qi * 96u;
        s18 = x11 * y19 + qi * 96u;
    }
    {   // ===== outer i=12 =====
        let t: u32 = s0 + x12 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x12 * y1 + qi * 999u + c;
        s1 = s2 + x12 * y2 + qi * 1462u;
        s2 = s3 + x12 * y3 + qi * 280u;
        s3 = s4 + x12 * y4 + qi * 5058u;
        s4 = s5 + x12 * y5 + qi * 1350u;
        s5 = s6 + x12 * y6 + qi * 455u;
        s6 = s7 + x12 * y7 + qi * 4653u;
        s7 = s8 + x12 * y8 + qi * 362u;
        s8 = s9 + x12 * y9 + qi * 3260u;
        s9 = s10 + x12 * y10 + qi * 5655u;
        s10 = s11 + x12 * y11 + qi * 770u;
        s11 = s12 + x12 * y12 + qi * 7016u;
        s12 = s13 + x12 * y13 + qi * 2082u;
        s13 = s14 + x12 * y14 + qi * 1761u;
        s14 = s15 + x12 * y15 + qi * 5125u;
        s15 = s16 + x12 * y16 + qi * 305u;
        s16 = s17 + x12 * y17 + qi * 5015u;
        s17 = s18 + x12 * y18 + qi * 6419u;
        s18 = s19 + x12 * y19 + qi * 96u;
        s18 = x12 * y19 + qi * 96u;
    }
    {   // ===== outer i=13 =====
        let t: u32 = s0 + x13 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x13 * y1 + qi * 999u + c;
        s1 = s2 + x13 * y2 + qi * 1462u;
        s2 = s3 + x13 * y3 + qi * 280u;
        s3 = s4 + x13 * y4 + qi * 5058u;
        s4 = s5 + x13 * y5 + qi * 1350u;
        s5 = s6 + x13 * y6 + qi * 455u;
        s6 = s7 + x13 * y7 + qi * 4653u;
        s7 = s8 + x13 * y8 + qi * 362u;
        s8 = s9 + x13 * y9 + qi * 3260u;
        s9 = s10 + x13 * y10 + qi * 5655u;
        s10 = s11 + x13 * y11 + qi * 770u;
        s11 = s12 + x13 * y12 + qi * 7016u;
        s12 = s13 + x13 * y13 + qi * 2082u;
        s13 = s14 + x13 * y14 + qi * 1761u;
        s14 = s15 + x13 * y15 + qi * 5125u;
        s15 = s16 + x13 * y16 + qi * 305u;
        s16 = s17 + x13 * y17 + qi * 5015u;
        s17 = s18 + x13 * y18 + qi * 6419u;
        s18 = s19 + x13 * y19 + qi * 96u;
        s18 = x13 * y19 + qi * 96u;
    }
    {   // ===== outer i=14 =====
        let t: u32 = s0 + x14 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x14 * y1 + qi * 999u + c;
        s1 = s2 + x14 * y2 + qi * 1462u;
        s2 = s3 + x14 * y3 + qi * 280u;
        s3 = s4 + x14 * y4 + qi * 5058u;
        s4 = s5 + x14 * y5 + qi * 1350u;
        s5 = s6 + x14 * y6 + qi * 455u;
        s6 = s7 + x14 * y7 + qi * 4653u;
        s7 = s8 + x14 * y8 + qi * 362u;
        s8 = s9 + x14 * y9 + qi * 3260u;
        s9 = s10 + x14 * y10 + qi * 5655u;
        s10 = s11 + x14 * y11 + qi * 770u;
        s11 = s12 + x14 * y12 + qi * 7016u;
        s12 = s13 + x14 * y13 + qi * 2082u;
        s13 = s14 + x14 * y14 + qi * 1761u;
        s14 = s15 + x14 * y15 + qi * 5125u;
        s15 = s16 + x14 * y16 + qi * 305u;
        s16 = s17 + x14 * y17 + qi * 5015u;
        s17 = s18 + x14 * y18 + qi * 6419u;
        s18 = s19 + x14 * y19 + qi * 96u;
        s18 = x14 * y19 + qi * 96u;
    }
    {   // ===== outer i=15 =====
        let t: u32 = s0 + x15 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x15 * y1 + qi * 999u + c;
        s1 = s2 + x15 * y2 + qi * 1462u;
        s2 = s3 + x15 * y3 + qi * 280u;
        s3 = s4 + x15 * y4 + qi * 5058u;
        s4 = s5 + x15 * y5 + qi * 1350u;
        s5 = s6 + x15 * y6 + qi * 455u;
        s6 = s7 + x15 * y7 + qi * 4653u;
        s7 = s8 + x15 * y8 + qi * 362u;
        s8 = s9 + x15 * y9 + qi * 3260u;
        s9 = s10 + x15 * y10 + qi * 5655u;
        s10 = s11 + x15 * y11 + qi * 770u;
        s11 = s12 + x15 * y12 + qi * 7016u;
        s12 = s13 + x15 * y13 + qi * 2082u;
        s13 = s14 + x15 * y14 + qi * 1761u;
        s14 = s15 + x15 * y15 + qi * 5125u;
        s15 = s16 + x15 * y16 + qi * 305u;
        s16 = s17 + x15 * y17 + qi * 5015u;
        s17 = s18 + x15 * y18 + qi * 6419u;
        s18 = s19 + x15 * y19 + qi * 96u;
        s18 = x15 * y19 + qi * 96u;
    }
    {   // ===== outer i=16 =====
        let t: u32 = s0 + x16 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x16 * y1 + qi * 999u + c;
        s1 = s2 + x16 * y2 + qi * 1462u;
        s2 = s3 + x16 * y3 + qi * 280u;
        s3 = s4 + x16 * y4 + qi * 5058u;
        s4 = s5 + x16 * y5 + qi * 1350u;
        s5 = s6 + x16 * y6 + qi * 455u;
        s6 = s7 + x16 * y7 + qi * 4653u;
        s7 = s8 + x16 * y8 + qi * 362u;
        s8 = s9 + x16 * y9 + qi * 3260u;
        s9 = s10 + x16 * y10 + qi * 5655u;
        s10 = s11 + x16 * y11 + qi * 770u;
        s11 = s12 + x16 * y12 + qi * 7016u;
        s12 = s13 + x16 * y13 + qi * 2082u;
        s13 = s14 + x16 * y14 + qi * 1761u;
        s14 = s15 + x16 * y15 + qi * 5125u;
        s15 = s16 + x16 * y16 + qi * 305u;
        s16 = s17 + x16 * y17 + qi * 5015u;
        s17 = s18 + x16 * y18 + qi * 6419u;
        s18 = s19 + x16 * y19 + qi * 96u;
        s18 = x16 * y19 + qi * 96u;
    }
    {   // ===== outer i=17 =====
        let t: u32 = s0 + x17 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x17 * y1 + qi * 999u + c;
        s1 = s2 + x17 * y2 + qi * 1462u;
        s2 = s3 + x17 * y3 + qi * 280u;
        s3 = s4 + x17 * y4 + qi * 5058u;
        s4 = s5 + x17 * y5 + qi * 1350u;
        s5 = s6 + x17 * y6 + qi * 455u;
        s6 = s7 + x17 * y7 + qi * 4653u;
        s7 = s8 + x17 * y8 + qi * 362u;
        s8 = s9 + x17 * y9 + qi * 3260u;
        s9 = s10 + x17 * y10 + qi * 5655u;
        s10 = s11 + x17 * y11 + qi * 770u;
        s11 = s12 + x17 * y12 + qi * 7016u;
        s12 = s13 + x17 * y13 + qi * 2082u;
        s13 = s14 + x17 * y14 + qi * 1761u;
        s14 = s15 + x17 * y15 + qi * 5125u;
        s15 = s16 + x17 * y16 + qi * 305u;
        s16 = s17 + x17 * y17 + qi * 5015u;
        s17 = s18 + x17 * y18 + qi * 6419u;
        s18 = s19 + x17 * y19 + qi * 96u;
        s18 = x17 * y19 + qi * 96u;
    }
    {   // ===== outer i=18 =====
        let t: u32 = s0 + x18 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x18 * y1 + qi * 999u + c;
        s1 = s2 + x18 * y2 + qi * 1462u;
        s2 = s3 + x18 * y3 + qi * 280u;
        s3 = s4 + x18 * y4 + qi * 5058u;
        s4 = s5 + x18 * y5 + qi * 1350u;
        s5 = s6 + x18 * y6 + qi * 455u;
        s6 = s7 + x18 * y7 + qi * 4653u;
        s7 = s8 + x18 * y8 + qi * 362u;
        s8 = s9 + x18 * y9 + qi * 3260u;
        s9 = s10 + x18 * y10 + qi * 5655u;
        s10 = s11 + x18 * y11 + qi * 770u;
        s11 = s12 + x18 * y12 + qi * 7016u;
        s12 = s13 + x18 * y13 + qi * 2082u;
        s13 = s14 + x18 * y14 + qi * 1761u;
        s14 = s15 + x18 * y15 + qi * 5125u;
        s15 = s16 + x18 * y16 + qi * 305u;
        s16 = s17 + x18 * y17 + qi * 5015u;
        s17 = s18 + x18 * y18 + qi * 6419u;
        s18 = s19 + x18 * y19 + qi * 96u;
        s18 = x18 * y19 + qi * 96u;
    }
    {   // ===== outer i=19 =====
        let t: u32 = s0 + x19 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        s0 = s1 + x19 * y1 + qi * 999u + c;
        s1 = s2 + x19 * y2 + qi * 1462u;
        s2 = s3 + x19 * y3 + qi * 280u;
        s3 = s4 + x19 * y4 + qi * 5058u;
        s4 = s5 + x19 * y5 + qi * 1350u;
        s5 = s6 + x19 * y6 + qi * 455u;
        s6 = s7 + x19 * y7 + qi * 4653u;
        s7 = s8 + x19 * y8 + qi * 362u;
        s8 = s9 + x19 * y9 + qi * 3260u;
        s9 = s10 + x19 * y10 + qi * 5655u;
        s10 = s11 + x19 * y11 + qi * 770u;
        s11 = s12 + x19 * y12 + qi * 7016u;
        s12 = s13 + x19 * y13 + qi * 2082u;
        s13 = s14 + x19 * y14 + qi * 1761u;
        s14 = s15 + x19 * y15 + qi * 5125u;
        s15 = s16 + x19 * y16 + qi * 305u;
        s16 = s17 + x19 * y17 + qi * 5015u;
        s17 = s18 + x19 * y18 + qi * 6419u;
        s18 = s19 + x19 * y19 + qi * 96u;
        s18 = x19 * y19 + qi * 96u;
    }

    // final carry normalisation
    var cc: u32 = 0u;
    { let v: u32 = s0 + cc; cc = v >> WORD_SIZE; s0 = v & MASK; }
    { let v: u32 = s1 + cc; cc = v >> WORD_SIZE; s1 = v & MASK; }
    { let v: u32 = s2 + cc; cc = v >> WORD_SIZE; s2 = v & MASK; }
    { let v: u32 = s3 + cc; cc = v >> WORD_SIZE; s3 = v & MASK; }
    { let v: u32 = s4 + cc; cc = v >> WORD_SIZE; s4 = v & MASK; }
    { let v: u32 = s5 + cc; cc = v >> WORD_SIZE; s5 = v & MASK; }
    { let v: u32 = s6 + cc; cc = v >> WORD_SIZE; s6 = v & MASK; }
    { let v: u32 = s7 + cc; cc = v >> WORD_SIZE; s7 = v & MASK; }
    { let v: u32 = s8 + cc; cc = v >> WORD_SIZE; s8 = v & MASK; }
    { let v: u32 = s9 + cc; cc = v >> WORD_SIZE; s9 = v & MASK; }
    { let v: u32 = s10 + cc; cc = v >> WORD_SIZE; s10 = v & MASK; }
    { let v: u32 = s11 + cc; cc = v >> WORD_SIZE; s11 = v & MASK; }
    { let v: u32 = s12 + cc; cc = v >> WORD_SIZE; s12 = v & MASK; }
    { let v: u32 = s13 + cc; cc = v >> WORD_SIZE; s13 = v & MASK; }
    { let v: u32 = s14 + cc; cc = v >> WORD_SIZE; s14 = v & MASK; }
    { let v: u32 = s15 + cc; cc = v >> WORD_SIZE; s15 = v & MASK; }
    { let v: u32 = s16 + cc; cc = v >> WORD_SIZE; s16 = v & MASK; }
    { let v: u32 = s17 + cc; cc = v >> WORD_SIZE; s17 = v & MASK; }
    { let v: u32 = s18 + cc; cc = v >> WORD_SIZE; s18 = v & MASK; }
    { let v: u32 = s19 + cc; cc = v >> WORD_SIZE; s19 = v & MASK; }

    var s: BigInt;
    s.limbs[0u] = s0;
    s.limbs[1u] = s1;
    s.limbs[2u] = s2;
    s.limbs[3u] = s3;
    s.limbs[4u] = s4;
    s.limbs[5u] = s5;
    s.limbs[6u] = s6;
    s.limbs[7u] = s7;
    s.limbs[8u] = s8;
    s.limbs[9u] = s9;
    s.limbs[10u] = s10;
    s.limbs[11u] = s11;
    s.limbs[12u] = s12;
    s.limbs[13u] = s13;
    s.limbs[14u] = s14;
    s.limbs[15u] = s15;
    s.limbs[16u] = s16;
    s.limbs[17u] = s17;
    s.limbs[18u] = s18;
    s.limbs[19u] = s19;
    return conditional_reduce(&s);
}
