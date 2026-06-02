// === Workgroup-backed CIOS Montgomery multiply (montgomery_product_wg) ===
//
// Register-footprint-reduction variant of mont_pro_product_cios_unrolled. The
// arithmetic is byte-for-byte identical to the register cios body; the only
// change is WHERE the 20 CIOS accumulators live: a workgroup array `mont_s`
// instead of 20 private registers s0..s19. This removes ~20 GPRs from every
// thread that multiplies, raising Adreno wave occupancy.
//
// LAYOUT (transposed / bank-conflict-free): accumulator j of the thread whose
// local index is wg_slot lives at  mont_s[wg_slot + j * MONT_TPB].  When all
// lanes of a wave touch the same accumulator j they hit MONT_TPB consecutive
// words -> minimal LDS bank conflicts (vs the contiguous wg_slot*20+j layout,
// which strides by 20 and serialises ~8-way on a 32-bank LDS).
//
// Each thread only ever touches its own slots (no cross-lane sharing), so no
// workgroup barrier is needed. The including kernel must declare, at module
// scope:  const MONT_TPB: u32 = <workgroup_size>u;
//         var<workgroup> mont_s: array<u32, 20u * MONT_TPB>;
//         var<private>   wg_slot: u32;   // set to local_invocation_id.x in main
// and reuses the cios scaffold helpers (N0, MASK, WORD_SIZE, conditional_reduce).
//
// GENERATED from mont_pro_product_cios_unrolled.template.wgsl by
// ~/localclaudebox/cios15n/gen_cios_wg.mjs. Edit the generator, not this file.

fn montgomery_product_wg(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {
    // Zero this thread's 20 accumulator slots (workgroup memory persists
    // across calls by the same thread, so it must be reset each product).
    for (var zj: u32 = 0u; zj < 20u; zj = zj + 1u) {
        mont_s[wg_slot + zj * MONT_TPB] = 0u;
    }
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
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x0 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x0 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x0 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x0 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x0 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x0 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x0 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x0 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x0 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x0 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x0 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x0 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x0 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x0 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x0 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x0 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x0 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x0 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x0 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x0 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x0 * y19 + qi * 96u;
    }
    {   // ===== outer i=1 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x1 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x1 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x1 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x1 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x1 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x1 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x1 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x1 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x1 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x1 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x1 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x1 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x1 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x1 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x1 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x1 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x1 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x1 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x1 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x1 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x1 * y19 + qi * 96u;
    }
    {   // ===== outer i=2 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x2 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x2 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x2 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x2 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x2 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x2 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x2 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x2 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x2 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x2 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x2 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x2 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x2 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x2 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x2 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x2 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x2 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x2 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x2 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x2 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x2 * y19 + qi * 96u;
    }
    {   // ===== outer i=3 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x3 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x3 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x3 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x3 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x3 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x3 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x3 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x3 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x3 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x3 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x3 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x3 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x3 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x3 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x3 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x3 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x3 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x3 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x3 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x3 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x3 * y19 + qi * 96u;
    }
    {   // ===== outer i=4 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x4 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x4 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x4 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x4 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x4 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x4 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x4 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x4 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x4 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x4 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x4 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x4 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x4 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x4 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x4 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x4 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x4 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x4 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x4 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x4 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x4 * y19 + qi * 96u;
    }
    {   // ===== outer i=5 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x5 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x5 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x5 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x5 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x5 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x5 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x5 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x5 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x5 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x5 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x5 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x5 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x5 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x5 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x5 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x5 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x5 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x5 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x5 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x5 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x5 * y19 + qi * 96u;
    }
    {   // ===== outer i=6 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x6 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x6 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x6 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x6 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x6 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x6 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x6 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x6 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x6 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x6 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x6 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x6 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x6 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x6 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x6 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x6 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x6 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x6 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x6 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x6 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x6 * y19 + qi * 96u;
    }
    {   // ===== outer i=7 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x7 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x7 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x7 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x7 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x7 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x7 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x7 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x7 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x7 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x7 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x7 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x7 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x7 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x7 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x7 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x7 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x7 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x7 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x7 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x7 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x7 * y19 + qi * 96u;
    }
    {   // ===== outer i=8 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x8 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x8 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x8 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x8 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x8 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x8 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x8 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x8 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x8 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x8 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x8 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x8 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x8 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x8 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x8 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x8 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x8 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x8 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x8 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x8 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x8 * y19 + qi * 96u;
    }
    {   // ===== outer i=9 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x9 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x9 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x9 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x9 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x9 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x9 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x9 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x9 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x9 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x9 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x9 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x9 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x9 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x9 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x9 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x9 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x9 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x9 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x9 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x9 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x9 * y19 + qi * 96u;
    }
    {   // ===== outer i=10 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x10 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x10 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x10 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x10 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x10 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x10 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x10 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x10 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x10 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x10 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x10 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x10 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x10 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x10 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x10 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x10 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x10 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x10 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x10 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x10 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x10 * y19 + qi * 96u;
    }
    {   // ===== outer i=11 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x11 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x11 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x11 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x11 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x11 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x11 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x11 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x11 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x11 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x11 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x11 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x11 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x11 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x11 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x11 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x11 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x11 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x11 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x11 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x11 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x11 * y19 + qi * 96u;
    }
    {   // ===== outer i=12 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x12 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x12 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x12 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x12 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x12 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x12 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x12 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x12 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x12 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x12 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x12 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x12 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x12 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x12 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x12 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x12 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x12 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x12 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x12 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x12 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x12 * y19 + qi * 96u;
    }
    {   // ===== outer i=13 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x13 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x13 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x13 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x13 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x13 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x13 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x13 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x13 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x13 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x13 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x13 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x13 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x13 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x13 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x13 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x13 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x13 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x13 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x13 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x13 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x13 * y19 + qi * 96u;
    }
    {   // ===== outer i=14 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x14 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x14 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x14 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x14 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x14 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x14 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x14 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x14 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x14 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x14 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x14 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x14 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x14 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x14 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x14 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x14 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x14 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x14 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x14 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x14 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x14 * y19 + qi * 96u;
    }
    {   // ===== outer i=15 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x15 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x15 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x15 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x15 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x15 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x15 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x15 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x15 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x15 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x15 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x15 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x15 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x15 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x15 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x15 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x15 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x15 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x15 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x15 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x15 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x15 * y19 + qi * 96u;
    }
    {   // ===== outer i=16 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x16 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x16 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x16 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x16 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x16 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x16 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x16 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x16 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x16 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x16 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x16 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x16 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x16 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x16 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x16 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x16 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x16 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x16 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x16 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x16 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x16 * y19 + qi * 96u;
    }
    {   // ===== outer i=17 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x17 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x17 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x17 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x17 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x17 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x17 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x17 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x17 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x17 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x17 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x17 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x17 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x17 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x17 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x17 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x17 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x17 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x17 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x17 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x17 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x17 * y19 + qi * 96u;
    }
    {   // ===== outer i=18 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x18 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x18 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x18 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x18 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x18 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x18 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x18 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x18 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x18 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x18 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x18 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x18 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x18 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x18 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x18 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x18 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x18 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x18 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x18 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x18 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x18 * y19 + qi * 96u;
    }
    {   // ===== outer i=19 =====
        let t: u32 = mont_s[wg_slot + 0u * MONT_TPB] + x19 * y0;
        let qi: u32 = (N0 * (t & MASK)) & MASK;
        let c: u32 = (t + qi * 7495u) >> WORD_SIZE;
        mont_s[wg_slot + 0u * MONT_TPB] = mont_s[wg_slot + 1u * MONT_TPB] + x19 * y1 + qi * 999u + c;
        mont_s[wg_slot + 1u * MONT_TPB] = mont_s[wg_slot + 2u * MONT_TPB] + x19 * y2 + qi * 1462u;
        mont_s[wg_slot + 2u * MONT_TPB] = mont_s[wg_slot + 3u * MONT_TPB] + x19 * y3 + qi * 280u;
        mont_s[wg_slot + 3u * MONT_TPB] = mont_s[wg_slot + 4u * MONT_TPB] + x19 * y4 + qi * 5058u;
        mont_s[wg_slot + 4u * MONT_TPB] = mont_s[wg_slot + 5u * MONT_TPB] + x19 * y5 + qi * 1350u;
        mont_s[wg_slot + 5u * MONT_TPB] = mont_s[wg_slot + 6u * MONT_TPB] + x19 * y6 + qi * 455u;
        mont_s[wg_slot + 6u * MONT_TPB] = mont_s[wg_slot + 7u * MONT_TPB] + x19 * y7 + qi * 4653u;
        mont_s[wg_slot + 7u * MONT_TPB] = mont_s[wg_slot + 8u * MONT_TPB] + x19 * y8 + qi * 362u;
        mont_s[wg_slot + 8u * MONT_TPB] = mont_s[wg_slot + 9u * MONT_TPB] + x19 * y9 + qi * 3260u;
        mont_s[wg_slot + 9u * MONT_TPB] = mont_s[wg_slot + 10u * MONT_TPB] + x19 * y10 + qi * 5655u;
        mont_s[wg_slot + 10u * MONT_TPB] = mont_s[wg_slot + 11u * MONT_TPB] + x19 * y11 + qi * 770u;
        mont_s[wg_slot + 11u * MONT_TPB] = mont_s[wg_slot + 12u * MONT_TPB] + x19 * y12 + qi * 7016u;
        mont_s[wg_slot + 12u * MONT_TPB] = mont_s[wg_slot + 13u * MONT_TPB] + x19 * y13 + qi * 2082u;
        mont_s[wg_slot + 13u * MONT_TPB] = mont_s[wg_slot + 14u * MONT_TPB] + x19 * y14 + qi * 1761u;
        mont_s[wg_slot + 14u * MONT_TPB] = mont_s[wg_slot + 15u * MONT_TPB] + x19 * y15 + qi * 5125u;
        mont_s[wg_slot + 15u * MONT_TPB] = mont_s[wg_slot + 16u * MONT_TPB] + x19 * y16 + qi * 305u;
        mont_s[wg_slot + 16u * MONT_TPB] = mont_s[wg_slot + 17u * MONT_TPB] + x19 * y17 + qi * 5015u;
        mont_s[wg_slot + 17u * MONT_TPB] = mont_s[wg_slot + 18u * MONT_TPB] + x19 * y18 + qi * 6419u;
        mont_s[wg_slot + 18u * MONT_TPB] = mont_s[wg_slot + 19u * MONT_TPB] + x19 * y19 + qi * 96u;
        mont_s[wg_slot + 18u * MONT_TPB] = x19 * y19 + qi * 96u;
    }

    // final carry normalisation
    var cc: u32 = 0u;
    { let v: u32 = mont_s[wg_slot + 0u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 0u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 1u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 1u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 2u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 2u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 3u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 3u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 4u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 4u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 5u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 5u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 6u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 6u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 7u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 7u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 8u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 8u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 9u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 9u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 10u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 10u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 11u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 11u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 12u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 12u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 13u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 13u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 14u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 14u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 15u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 15u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 16u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 16u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 17u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 17u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 18u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 18u * MONT_TPB] = v & MASK; }
    { let v: u32 = mont_s[wg_slot + 19u * MONT_TPB] + cc; cc = v >> WORD_SIZE; mont_s[wg_slot + 19u * MONT_TPB] = v & MASK; }

    var s: BigInt;
    s.limbs[0u] = mont_s[wg_slot + 0u * MONT_TPB];
    s.limbs[1u] = mont_s[wg_slot + 1u * MONT_TPB];
    s.limbs[2u] = mont_s[wg_slot + 2u * MONT_TPB];
    s.limbs[3u] = mont_s[wg_slot + 3u * MONT_TPB];
    s.limbs[4u] = mont_s[wg_slot + 4u * MONT_TPB];
    s.limbs[5u] = mont_s[wg_slot + 5u * MONT_TPB];
    s.limbs[6u] = mont_s[wg_slot + 6u * MONT_TPB];
    s.limbs[7u] = mont_s[wg_slot + 7u * MONT_TPB];
    s.limbs[8u] = mont_s[wg_slot + 8u * MONT_TPB];
    s.limbs[9u] = mont_s[wg_slot + 9u * MONT_TPB];
    s.limbs[10u] = mont_s[wg_slot + 10u * MONT_TPB];
    s.limbs[11u] = mont_s[wg_slot + 11u * MONT_TPB];
    s.limbs[12u] = mont_s[wg_slot + 12u * MONT_TPB];
    s.limbs[13u] = mont_s[wg_slot + 13u * MONT_TPB];
    s.limbs[14u] = mont_s[wg_slot + 14u * MONT_TPB];
    s.limbs[15u] = mont_s[wg_slot + 15u * MONT_TPB];
    s.limbs[16u] = mont_s[wg_slot + 16u * MONT_TPB];
    s.limbs[17u] = mont_s[wg_slot + 17u * MONT_TPB];
    s.limbs[18u] = mont_s[wg_slot + 18u * MONT_TPB];
    s.limbs[19u] = mont_s[wg_slot + 19u * MONT_TPB];
    return conditional_reduce(&s);
}
