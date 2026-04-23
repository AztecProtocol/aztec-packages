// This file is auto-generated from vector_field.hpp's operator* WASM SIMD body.
// It is compiled as a separate TU for the WASM build only, so that LLVM's
// backend sees operator* as a standalone function (not inlined into the bench
// loop / caller), giving it the same register allocation scope the gist's
// hand-written WAT function gets. Inlining across ~2400 lines of carefully
// ordered ops lets LLVM's instruction scheduler re-coalesce locals and
// recreate the stream-reorder problem we solved with asm barriers.
//
// The body below is verbatim from `VectorField<Bn254FrParams>::operator*`
// in vector_field.hpp; only the template/inline attributes are stripped and
// it's specialized for Bn254FrParams.

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"

#if defined(__wasm_simd128__)

namespace bb {

template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::operator*(const VectorField<Bn254FrParams>& other) const noexcept
{
    VectorField result;

    // --- Load inputs. ---
    const uint64_t sl0 = scalar_data[0], sl1 = scalar_data[1], sl2 = scalar_data[2], sl3 = scalar_data[3],
                   sl4 = scalar_data[4], sl5 = scalar_data[5], sl6 = scalar_data[6], sl7 = scalar_data[7],
                   sl8 = scalar_data[8];
    const uint64_t sri0 = other.scalar_data[0], sri1 = other.scalar_data[1], sri2 = other.scalar_data[2],
                   sri3 = other.scalar_data[3], sri4 = other.scalar_data[4], sri5 = other.scalar_data[5],
                   sri6 = other.scalar_data[6], sri7 = other.scalar_data[7], sri8 = other.scalar_data[8];
    const v128_t ql0 = quad_data[0], ql1 = quad_data[1], ql2 = quad_data[2], ql3 = quad_data[3], ql4 = quad_data[4],
                 ql5 = quad_data[5], ql6 = quad_data[6], ql7 = quad_data[7], ql8 = quad_data[8];
    const v128_t qri0 = other.quad_data[0], qri1 = other.quad_data[1], qri2 = other.quad_data[2],
                 qri3 = other.quad_data[3], qri4 = other.quad_data[4], qri5 = other.quad_data[5],
                 qri6 = other.quad_data[6], qri7 = other.quad_data[7], qri8 = other.quad_data[8];

    // ============================================================
    // Stage 1: P_lo = left[0..4] * right[0..4]  (5x5 schoolbook, 25 muls)
    // ============================================================
    // pl_k = sum of l_i * r_{k-i} for i,j in [0,4], i+j==k.
    //
    // Written one mul/mad at a time so the scalar and quad streams interleave.

    // pl0 = l0*r0
    uint64_t pl0 = sl0 * sri0;
    v128_t pl0_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri0);
    v128_t pl0_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri0);
    vector_field_detail::bb_vf_barrier_sqq(pl0, pl0_lo, pl0_hi);

    // pl1 = l0*r1 + l1*r0
    uint64_t pl1 = sl0 * sri1;
    v128_t pl1_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri1);
    v128_t pl1_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri1);
    vector_field_detail::bb_vf_barrier_sqq(pl1, pl1_lo, pl1_hi);
    pl1 += sl1 * sri0;
    pl1_lo = wasm_i64x2_add(pl1_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri0));
    pl1_hi = wasm_i64x2_add(pl1_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri0));
    vector_field_detail::bb_vf_barrier_sqq(pl1, pl1_lo, pl1_hi);

    // pl2 = l0*r2 + l1*r1 + l2*r0
    uint64_t pl2 = sl0 * sri2;
    v128_t pl2_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri2);
    v128_t pl2_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri2);
    vector_field_detail::bb_vf_barrier_sqq(pl2, pl2_lo, pl2_hi);
    pl2 += sl1 * sri1;
    pl2_lo = wasm_i64x2_add(pl2_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri1));
    pl2_hi = wasm_i64x2_add(pl2_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri1));
    vector_field_detail::bb_vf_barrier_sqq(pl2, pl2_lo, pl2_hi);
    pl2 += sl2 * sri0;
    pl2_lo = wasm_i64x2_add(pl2_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri0));
    pl2_hi = wasm_i64x2_add(pl2_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri0));
    vector_field_detail::bb_vf_barrier_sqq(pl2, pl2_lo, pl2_hi);

    // pl3 = l0*r3 + l1*r2 + l2*r1 + l3*r0
    uint64_t pl3 = sl0 * sri3;
    v128_t pl3_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri3);
    v128_t pl3_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri3);
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);
    pl3 += sl1 * sri2;
    pl3_lo = wasm_i64x2_add(pl3_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri2));
    pl3_hi = wasm_i64x2_add(pl3_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri2));
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);
    pl3 += sl2 * sri1;
    pl3_lo = wasm_i64x2_add(pl3_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri1));
    pl3_hi = wasm_i64x2_add(pl3_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri1));
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);
    pl3 += sl3 * sri0;
    pl3_lo = wasm_i64x2_add(pl3_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri0));
    pl3_hi = wasm_i64x2_add(pl3_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri0));
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);

    // pl4 = l0*r4 + l1*r3 + l2*r2 + l3*r1 + l4*r0
    uint64_t pl4 = sl0 * sri4;
    v128_t pl4_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri4);
    v128_t pl4_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri4);
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);
    pl4 += sl1 * sri3;
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri3));
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri3));
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);
    pl4 += sl2 * sri2;
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri2));
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri2));
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);
    pl4 += sl3 * sri1;
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri1));
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri1));
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);
    pl4 += sl4 * sri0;
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri0));
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri0));
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);

    // pl5 = l1*r4 + l2*r3 + l3*r2 + l4*r1
    uint64_t pl5 = sl1 * sri4;
    v128_t pl5_lo = wasm_u64x2_extmul_low_u32x4(ql1, qri4);
    v128_t pl5_hi = wasm_u64x2_extmul_high_u32x4(ql1, qri4);
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);
    pl5 += sl2 * sri3;
    pl5_lo = wasm_i64x2_add(pl5_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri3));
    pl5_hi = wasm_i64x2_add(pl5_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri3));
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);
    pl5 += sl3 * sri2;
    pl5_lo = wasm_i64x2_add(pl5_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri2));
    pl5_hi = wasm_i64x2_add(pl5_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri2));
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);
    pl5 += sl4 * sri1;
    pl5_lo = wasm_i64x2_add(pl5_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri1));
    pl5_hi = wasm_i64x2_add(pl5_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri1));
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);

    // pl6 = l2*r4 + l3*r3 + l4*r2
    uint64_t pl6 = sl2 * sri4;
    v128_t pl6_lo = wasm_u64x2_extmul_low_u32x4(ql2, qri4);
    v128_t pl6_hi = wasm_u64x2_extmul_high_u32x4(ql2, qri4);
    vector_field_detail::bb_vf_barrier_sqq(pl6, pl6_lo, pl6_hi);
    pl6 += sl3 * sri3;
    pl6_lo = wasm_i64x2_add(pl6_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri3));
    pl6_hi = wasm_i64x2_add(pl6_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri3));
    vector_field_detail::bb_vf_barrier_sqq(pl6, pl6_lo, pl6_hi);
    pl6 += sl4 * sri2;
    pl6_lo = wasm_i64x2_add(pl6_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri2));
    pl6_hi = wasm_i64x2_add(pl6_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri2));
    vector_field_detail::bb_vf_barrier_sqq(pl6, pl6_lo, pl6_hi);

    // pl7 = l3*r4 + l4*r3
    uint64_t pl7 = sl3 * sri4;
    v128_t pl7_lo = wasm_u64x2_extmul_low_u32x4(ql3, qri4);
    v128_t pl7_hi = wasm_u64x2_extmul_high_u32x4(ql3, qri4);
    vector_field_detail::bb_vf_barrier_sqq(pl7, pl7_lo, pl7_hi);
    pl7 += sl4 * sri3;
    pl7_lo = wasm_i64x2_add(pl7_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri3));
    pl7_hi = wasm_i64x2_add(pl7_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri3));
    vector_field_detail::bb_vf_barrier_sqq(pl7, pl7_lo, pl7_hi);

    // pl8 = l4*r4
    uint64_t pl8 = sl4 * sri4;
    v128_t pl8_lo = wasm_u64x2_extmul_low_u32x4(ql4, qri4);
    v128_t pl8_hi = wasm_u64x2_extmul_high_u32x4(ql4, qri4);
    vector_field_detail::bb_vf_barrier_sqq(pl8, pl8_lo, pl8_hi);

    // ============================================================
    // Stage 2: P_hi = left[5..8] * right[5..8]  (4x4 schoolbook, 16 muls)
    // ============================================================

    // ph0 = l5*r5
    uint64_t ph0 = sl5 * sri5;
    v128_t ph0_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri5);
    v128_t ph0_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri5);
    vector_field_detail::bb_vf_barrier_sqq(ph0, ph0_lo, ph0_hi);

    // ph1 = l5*r6 + l6*r5
    uint64_t ph1 = sl5 * sri6;
    v128_t ph1_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri6);
    v128_t ph1_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri6);
    vector_field_detail::bb_vf_barrier_sqq(ph1, ph1_lo, ph1_hi);
    ph1 += sl6 * sri5;
    ph1_lo = wasm_i64x2_add(ph1_lo, wasm_u64x2_extmul_low_u32x4(ql6, qri5));
    ph1_hi = wasm_i64x2_add(ph1_hi, wasm_u64x2_extmul_high_u32x4(ql6, qri5));
    vector_field_detail::bb_vf_barrier_sqq(ph1, ph1_lo, ph1_hi);

    // ph2 = l5*r7 + l6*r6 + l7*r5
    uint64_t ph2 = sl5 * sri7;
    v128_t ph2_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri7);
    v128_t ph2_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri7);
    vector_field_detail::bb_vf_barrier_sqq(ph2, ph2_lo, ph2_hi);
    ph2 += sl6 * sri6;
    ph2_lo = wasm_i64x2_add(ph2_lo, wasm_u64x2_extmul_low_u32x4(ql6, qri6));
    ph2_hi = wasm_i64x2_add(ph2_hi, wasm_u64x2_extmul_high_u32x4(ql6, qri6));
    vector_field_detail::bb_vf_barrier_sqq(ph2, ph2_lo, ph2_hi);
    ph2 += sl7 * sri5;
    ph2_lo = wasm_i64x2_add(ph2_lo, wasm_u64x2_extmul_low_u32x4(ql7, qri5));
    ph2_hi = wasm_i64x2_add(ph2_hi, wasm_u64x2_extmul_high_u32x4(ql7, qri5));
    vector_field_detail::bb_vf_barrier_sqq(ph2, ph2_lo, ph2_hi);

    // ph3 = l5*r8 + l6*r7 + l7*r6 + l8*r5
    uint64_t ph3 = sl5 * sri8;
    v128_t ph3_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri8);
    v128_t ph3_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri8);
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);
    ph3 += sl6 * sri7;
    ph3_lo = wasm_i64x2_add(ph3_lo, wasm_u64x2_extmul_low_u32x4(ql6, qri7));
    ph3_hi = wasm_i64x2_add(ph3_hi, wasm_u64x2_extmul_high_u32x4(ql6, qri7));
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);
    ph3 += sl7 * sri6;
    ph3_lo = wasm_i64x2_add(ph3_lo, wasm_u64x2_extmul_low_u32x4(ql7, qri6));
    ph3_hi = wasm_i64x2_add(ph3_hi, wasm_u64x2_extmul_high_u32x4(ql7, qri6));
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);
    ph3 += sl8 * sri5;
    ph3_lo = wasm_i64x2_add(ph3_lo, wasm_u64x2_extmul_low_u32x4(ql8, qri5));
    ph3_hi = wasm_i64x2_add(ph3_hi, wasm_u64x2_extmul_high_u32x4(ql8, qri5));
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);

    // ph4 = l6*r8 + l7*r7 + l8*r6
    uint64_t ph4 = sl6 * sri8;
    v128_t ph4_lo = wasm_u64x2_extmul_low_u32x4(ql6, qri8);
    v128_t ph4_hi = wasm_u64x2_extmul_high_u32x4(ql6, qri8);
    vector_field_detail::bb_vf_barrier_sqq(ph4, ph4_lo, ph4_hi);
    ph4 += sl7 * sri7;
    ph4_lo = wasm_i64x2_add(ph4_lo, wasm_u64x2_extmul_low_u32x4(ql7, qri7));
    ph4_hi = wasm_i64x2_add(ph4_hi, wasm_u64x2_extmul_high_u32x4(ql7, qri7));
    vector_field_detail::bb_vf_barrier_sqq(ph4, ph4_lo, ph4_hi);
    ph4 += sl8 * sri6;
    ph4_lo = wasm_i64x2_add(ph4_lo, wasm_u64x2_extmul_low_u32x4(ql8, qri6));
    ph4_hi = wasm_i64x2_add(ph4_hi, wasm_u64x2_extmul_high_u32x4(ql8, qri6));
    vector_field_detail::bb_vf_barrier_sqq(ph4, ph4_lo, ph4_hi);

    // ph5 = l7*r8 + l8*r7
    uint64_t ph5 = sl7 * sri8;
    v128_t ph5_lo = wasm_u64x2_extmul_low_u32x4(ql7, qri8);
    v128_t ph5_hi = wasm_u64x2_extmul_high_u32x4(ql7, qri8);
    vector_field_detail::bb_vf_barrier_sqq(ph5, ph5_lo, ph5_hi);
    ph5 += sl8 * sri7;
    ph5_lo = wasm_i64x2_add(ph5_lo, wasm_u64x2_extmul_low_u32x4(ql8, qri7));
    ph5_hi = wasm_i64x2_add(ph5_hi, wasm_u64x2_extmul_high_u32x4(ql8, qri7));
    vector_field_detail::bb_vf_barrier_sqq(ph5, ph5_lo, ph5_hi);

    // ph6 = l8*r8
    uint64_t ph6 = sl8 * sri8;
    v128_t ph6_lo = wasm_u64x2_extmul_low_u32x4(ql8, qri8);
    v128_t ph6_hi = wasm_u64x2_extmul_high_u32x4(ql8, qri8);
    vector_field_detail::bb_vf_barrier_sqq(ph6, ph6_lo, ph6_hi);

    // ============================================================
    // Stage 3: sums  sl_i = l_i + l_{5+i}  for i in 0..3, sl_4 = l_4.
    // Same for sr. CRITICAL: must be i32x4 add (NOT i64x2), else carry bleeds
    // across lanes and breaks independence.
    //
    // Each qsl_i / qsr_i gets its own barrier so LLVM doesn't keep all 10
    // simultaneously live across the 25 P_cross extmuls (which would force
    // spill).
    // ============================================================

    uint64_t ssl0 = sl0 + sl5;
    v128_t qsl0 = wasm_i32x4_add(ql0, ql5);
    uint64_t ssr0 = sri0 + sri5;
    v128_t qsr0 = wasm_i32x4_add(qri0, qri5);
    vector_field_detail::bb_vf_barrier_sq(ssl0, qsl0);
    vector_field_detail::bb_vf_barrier_sq(ssr0, qsr0);

    uint64_t ssl1 = sl1 + sl6;
    v128_t qsl1 = wasm_i32x4_add(ql1, ql6);
    uint64_t ssr1 = sri1 + sri6;
    v128_t qsr1 = wasm_i32x4_add(qri1, qri6);
    vector_field_detail::bb_vf_barrier_sq(ssl1, qsl1);
    vector_field_detail::bb_vf_barrier_sq(ssr1, qsr1);

    uint64_t ssl2 = sl2 + sl7;
    v128_t qsl2 = wasm_i32x4_add(ql2, ql7);
    uint64_t ssr2 = sri2 + sri7;
    v128_t qsr2 = wasm_i32x4_add(qri2, qri7);
    vector_field_detail::bb_vf_barrier_sq(ssl2, qsl2);
    vector_field_detail::bb_vf_barrier_sq(ssr2, qsr2);

    uint64_t ssl3 = sl3 + sl8;
    v128_t qsl3 = wasm_i32x4_add(ql3, ql8);
    uint64_t ssr3 = sri3 + sri8;
    v128_t qsr3 = wasm_i32x4_add(qri3, qri8);
    vector_field_detail::bb_vf_barrier_sq(ssl3, qsl3);
    vector_field_detail::bb_vf_barrier_sq(ssr3, qsr3);

    // Fix 3 — break the qsl4 == ql4 / qsr4 == qri4 alias so LLVM doesn't
    // eliminate the sl4*sr4 extmul pair by rewriting it to l4*r4 and CSE-ing
    // with the existing pl8 (= l4*r4). The barriers force qsl4 and qsr4 into
    // distinct locals, which keeps pc8 emitted as its own extmul pair and
    // recovers the 4 missing extmuls our previous WAT was dropping.
    uint64_t ssl4 = sl4;
    v128_t qsl4 = ql4;
    uint64_t ssr4 = sri4;
    v128_t qsr4 = qri4;
    vector_field_detail::bb_vf_barrier_sq(ssl4, qsl4);
    vector_field_detail::bb_vf_barrier_sq(ssr4, qsr4);

    // ============================================================
    // Stage 4: P_cross = sl * sr  (5x5 schoolbook, 25 muls)
    // ============================================================

    // pc0 = sl0*sr0
    uint64_t pc0 = ssl0 * ssr0;
    v128_t pc0_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr0);
    v128_t pc0_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr0);
    vector_field_detail::bb_vf_barrier_sqq(pc0, pc0_lo, pc0_hi);

    // pc1 = sl0*sr1 + sl1*sr0
    uint64_t pc1 = ssl0 * ssr1;
    v128_t pc1_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr1);
    v128_t pc1_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr1);
    vector_field_detail::bb_vf_barrier_sqq(pc1, pc1_lo, pc1_hi);
    pc1 += ssl1 * ssr0;
    pc1_lo = wasm_i64x2_add(pc1_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr0));
    pc1_hi = wasm_i64x2_add(pc1_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr0));
    vector_field_detail::bb_vf_barrier_sqq(pc1, pc1_lo, pc1_hi);

    // pc2 = sl0*sr2 + sl1*sr1 + sl2*sr0
    uint64_t pc2 = ssl0 * ssr2;
    v128_t pc2_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr2);
    v128_t pc2_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr2);
    vector_field_detail::bb_vf_barrier_sqq(pc2, pc2_lo, pc2_hi);
    pc2 += ssl1 * ssr1;
    pc2_lo = wasm_i64x2_add(pc2_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr1));
    pc2_hi = wasm_i64x2_add(pc2_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr1));
    vector_field_detail::bb_vf_barrier_sqq(pc2, pc2_lo, pc2_hi);
    pc2 += ssl2 * ssr0;
    pc2_lo = wasm_i64x2_add(pc2_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr0));
    pc2_hi = wasm_i64x2_add(pc2_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr0));
    vector_field_detail::bb_vf_barrier_sqq(pc2, pc2_lo, pc2_hi);

    // pc3 = sl0*sr3 + sl1*sr2 + sl2*sr1 + sl3*sr0
    uint64_t pc3 = ssl0 * ssr3;
    v128_t pc3_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr3);
    v128_t pc3_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr3);
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);
    pc3 += ssl1 * ssr2;
    pc3_lo = wasm_i64x2_add(pc3_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr2));
    pc3_hi = wasm_i64x2_add(pc3_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr2));
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);
    pc3 += ssl2 * ssr1;
    pc3_lo = wasm_i64x2_add(pc3_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr1));
    pc3_hi = wasm_i64x2_add(pc3_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr1));
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);
    pc3 += ssl3 * ssr0;
    pc3_lo = wasm_i64x2_add(pc3_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr0));
    pc3_hi = wasm_i64x2_add(pc3_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr0));
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);

    // pc4 = sl0*sr4 + sl1*sr3 + sl2*sr2 + sl3*sr1 + sl4*sr0
    uint64_t pc4 = ssl0 * ssr4;
    v128_t pc4_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr4);
    v128_t pc4_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr4);
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);
    pc4 += ssl1 * ssr3;
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr3));
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr3));
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);
    pc4 += ssl2 * ssr2;
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr2));
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr2));
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);
    pc4 += ssl3 * ssr1;
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr1));
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr1));
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);
    pc4 += ssl4 * ssr0;
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr0));
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr0));
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);

    // pc5 = sl1*sr4 + sl2*sr3 + sl3*sr2 + sl4*sr1
    uint64_t pc5 = ssl1 * ssr4;
    v128_t pc5_lo = wasm_u64x2_extmul_low_u32x4(qsl1, qsr4);
    v128_t pc5_hi = wasm_u64x2_extmul_high_u32x4(qsl1, qsr4);
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);
    pc5 += ssl2 * ssr3;
    pc5_lo = wasm_i64x2_add(pc5_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr3));
    pc5_hi = wasm_i64x2_add(pc5_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr3));
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);
    pc5 += ssl3 * ssr2;
    pc5_lo = wasm_i64x2_add(pc5_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr2));
    pc5_hi = wasm_i64x2_add(pc5_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr2));
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);
    pc5 += ssl4 * ssr1;
    pc5_lo = wasm_i64x2_add(pc5_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr1));
    pc5_hi = wasm_i64x2_add(pc5_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr1));
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);

    // pc6 = sl2*sr4 + sl3*sr3 + sl4*sr2
    uint64_t pc6 = ssl2 * ssr4;
    v128_t pc6_lo = wasm_u64x2_extmul_low_u32x4(qsl2, qsr4);
    v128_t pc6_hi = wasm_u64x2_extmul_high_u32x4(qsl2, qsr4);
    vector_field_detail::bb_vf_barrier_sqq(pc6, pc6_lo, pc6_hi);
    pc6 += ssl3 * ssr3;
    pc6_lo = wasm_i64x2_add(pc6_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr3));
    pc6_hi = wasm_i64x2_add(pc6_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr3));
    vector_field_detail::bb_vf_barrier_sqq(pc6, pc6_lo, pc6_hi);
    pc6 += ssl4 * ssr2;
    pc6_lo = wasm_i64x2_add(pc6_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr2));
    pc6_hi = wasm_i64x2_add(pc6_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr2));
    vector_field_detail::bb_vf_barrier_sqq(pc6, pc6_lo, pc6_hi);

    // pc7 = sl3*sr4 + sl4*sr3
    uint64_t pc7 = ssl3 * ssr4;
    v128_t pc7_lo = wasm_u64x2_extmul_low_u32x4(qsl3, qsr4);
    v128_t pc7_hi = wasm_u64x2_extmul_high_u32x4(qsl3, qsr4);
    vector_field_detail::bb_vf_barrier_sqq(pc7, pc7_lo, pc7_hi);
    pc7 += ssl4 * ssr3;
    pc7_lo = wasm_i64x2_add(pc7_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr3));
    pc7_hi = wasm_i64x2_add(pc7_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr3));
    vector_field_detail::bb_vf_barrier_sqq(pc7, pc7_lo, pc7_hi);

    // pc8 = sl4*sr4
    uint64_t pc8 = ssl4 * ssr4;
    v128_t pc8_lo = wasm_u64x2_extmul_low_u32x4(qsl4, qsr4);
    v128_t pc8_hi = wasm_u64x2_extmul_high_u32x4(qsl4, qsr4);
    vector_field_detail::bb_vf_barrier_sqq(pc8, pc8_lo, pc8_hi);

    // ============================================================
    // Stage 5: Combine into temp_0..temp_16.
    //   temp[k]         = pl[k]                       for k in 0..4
    //   temp[k]         = pl[k] + (pc[k-5] - pl[k-5] - ph[k-5])  for k in 5..8
    //   temp[9]         = pc[4] - pl[4] - ph[4]
    //   temp[k]         = (pc[k-5] - pl[k-5]) - ph[k-5] + ph[k-10]  for k in 10..13
    //                     (ph[k-5] only defined for k-5 <= 6 i.e. k <= 11; k=12,13 omit)
    //   temp[k]         = ph[k-10]                    for k in 14..16
    //
    // Scalar math uses uint64_t subtraction (wrap); valid because all values
    // fit in u64 without aliasing. Quad math uses i64x2 sub.
    // ============================================================

    uint64_t temp_0 = pl0;
    v128_t tlo_0 = pl0_lo;
    v128_t thi_0 = pl0_hi;
    uint64_t temp_1 = pl1;
    v128_t tlo_1 = pl1_lo;
    v128_t thi_1 = pl1_hi;
    uint64_t temp_2 = pl2;
    v128_t tlo_2 = pl2_lo;
    v128_t thi_2 = pl2_hi;
    uint64_t temp_3 = pl3;
    v128_t tlo_3 = pl3_lo;
    v128_t thi_3 = pl3_hi;
    uint64_t temp_4 = pl4;
    v128_t tlo_4 = pl4_lo;
    v128_t thi_4 = pl4_hi;

    // temp_5 = pl5 + (pc0 - pl0 - ph0)
    uint64_t temp_5 = pl5 + (pc0 - pl0 - ph0);
    v128_t tlo_5 = wasm_i64x2_add(pl5_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc0_lo, pl0_lo), ph0_lo));
    v128_t thi_5 = wasm_i64x2_add(pl5_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc0_hi, pl0_hi), ph0_hi));
    uint64_t temp_6 = pl6 + (pc1 - pl1 - ph1);
    v128_t tlo_6 = wasm_i64x2_add(pl6_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc1_lo, pl1_lo), ph1_lo));
    v128_t thi_6 = wasm_i64x2_add(pl6_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc1_hi, pl1_hi), ph1_hi));
    uint64_t temp_7 = pl7 + (pc2 - pl2 - ph2);
    v128_t tlo_7 = wasm_i64x2_add(pl7_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc2_lo, pl2_lo), ph2_lo));
    v128_t thi_7 = wasm_i64x2_add(pl7_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc2_hi, pl2_hi), ph2_hi));
    uint64_t temp_8 = pl8 + (pc3 - pl3 - ph3);
    v128_t tlo_8 = wasm_i64x2_add(pl8_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc3_lo, pl3_lo), ph3_lo));
    v128_t thi_8 = wasm_i64x2_add(pl8_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc3_hi, pl3_hi), ph3_hi));

    // temp_9 = pc4 - pl4 - ph4
    uint64_t temp_9 = pc4 - pl4 - ph4;
    v128_t tlo_9 = wasm_i64x2_sub(wasm_i64x2_sub(pc4_lo, pl4_lo), ph4_lo);
    v128_t thi_9 = wasm_i64x2_sub(wasm_i64x2_sub(pc4_hi, pl4_hi), ph4_hi);

    // temp_10 = (pc5 - pl5 - ph5) + ph0
    uint64_t temp_10 = (pc5 - pl5 - ph5) + ph0;
    v128_t tlo_10 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_lo, pl5_lo), ph5_lo), ph0_lo);
    v128_t thi_10 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_hi, pl5_hi), ph5_hi), ph0_hi);
    // temp_11 = (pc6 - pl6 - ph6) + ph1
    uint64_t temp_11 = (pc6 - pl6 - ph6) + ph1;
    v128_t tlo_11 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_lo, pl6_lo), ph6_lo), ph1_lo);
    v128_t thi_11 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_hi, pl6_hi), ph6_hi), ph1_hi);
    // temp_12 = (pc7 - pl7) + ph2    (ph7 doesn't exist)
    uint64_t temp_12 = (pc7 - pl7) + ph2;
    v128_t tlo_12 = wasm_i64x2_add(wasm_i64x2_sub(pc7_lo, pl7_lo), ph2_lo);
    v128_t thi_12 = wasm_i64x2_add(wasm_i64x2_sub(pc7_hi, pl7_hi), ph2_hi);
    // temp_13 = (pc8 - pl8) + ph3    (ph8 doesn't exist)
    uint64_t temp_13 = (pc8 - pl8) + ph3;
    v128_t tlo_13 = wasm_i64x2_add(wasm_i64x2_sub(pc8_lo, pl8_lo), ph3_lo);
    v128_t thi_13 = wasm_i64x2_add(wasm_i64x2_sub(pc8_hi, pl8_hi), ph3_hi);

    // temp_14 = ph4, temp_15 = ph5, temp_16 = ph6
    uint64_t temp_14 = ph4;
    v128_t tlo_14 = ph4_lo;
    v128_t thi_14 = ph4_hi;
    uint64_t temp_15 = ph5;
    v128_t tlo_15 = ph5_lo;
    v128_t thi_15 = ph5_hi;
    uint64_t temp_16 = ph6;
    v128_t tlo_16 = ph6_lo;
    v128_t thi_16 = ph6_hi;

    // Stage 5.5: stage boundary has no explicit barriers — the per-statement
    // barriers in Stage 5 combine already prevent LLVM from reordering across
    // stages. Adding more barriers here did not move the needle in our
    // measurements (within CV of the mul bench).

    // ============================================================
    // Stage 6: 8 x Yuval reductions.
    //
    // For lo in 0..7:
    //   km_lo = temp_lo & mask29
    //   carry_lo = temp_lo >> 29
    //   temp_{lo+1} += km_lo * r_inv[0] + carry_lo
    //   for j in 1..9: temp_{lo+1+j} += km_lo * r_inv[j]
    //
    // Quad: km_lo is an i32x4 (after extracting low 29 bits of each lane).
    // We build it by masking both tlo and thi to 29 bits (as i64x2) and
    // shuffling the low 32 bits of each lane into an i32x4.
    // ============================================================

    constexpr uint64_t MASK29 = 0x1fffffffULL;
    const v128_t mask29_i32x4 = wasm_i32x4_splat(0x1fffffff);

    // r_inv splats (i32x4). These are what the Yuval reductions multiply km_q
    // by. Marked volatile-via-asm-barrier so LLVM keeps them as i32x4 locals
    // (like the gist's WAT's `local.get $K32_...` pattern) instead of folding
    // them into i64x2 pre-extended constants. Without the barriers, LLVM
    // emits slow `i64x2.mul` against a pre-extended i64x2 constant; with the
    // barriers, LLVM is forced to use `i64x2.extmul_low/high_i32x4_u`
    // (pmuludq), which is ~3-5× faster on Zen3/V8.
    v128_t r_inv0 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[0]));
    v128_t r_inv1 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[1]));
    v128_t r_inv2 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[2]));
    v128_t r_inv3 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[3]));
    v128_t r_inv4 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[4]));
    v128_t r_inv5 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[5]));
    v128_t r_inv6 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[6]));
    v128_t r_inv7 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[7]));
    v128_t r_inv8 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[8]));
    // NOTE: These r_inv barriers MUST be "+r" (inout) not input-only. The
    // inout form forces LLVM to treat each splat as a fresh runtime value
    // after the barrier, preventing CSE of `extend_low_u32x4(r_inv_const)`
    // across the 9 Yuval madConst uses. Input-only barriers would allow
    // LLVM to pre-extend each r_inv to i64x2 once and use slow `i64x2.mul`
    // (emulated on x86) instead of `extmul_low/high_u32x4` (pmuludq).
    asm volatile("" : "+r"(r_inv0), "+r"(r_inv1), "+r"(r_inv2), "+r"(r_inv3), "+r"(r_inv4));
    asm volatile("" : "+r"(r_inv5), "+r"(r_inv6), "+r"(r_inv7), "+r"(r_inv8));

    // Macro-expanded Yuval reduction for one "lo" position. Scalar then quad.
    //
    // On the quad side, we need to build km as an i32x4 from tlo and thi
    // (each lane's low 29 bits). Then multiply by each r_inv[j] constant (i32x4
    // broadcast) using extmul_low/high to produce i64x2 partials, accumulate.

// Yuval reduction step. For each position `lo`:
//   km_q = (temp_lo & mask29) shuffled into i32x4 (takes low 32 bits of each
//          i64x2 lane from tlo_lo/thi_lo)
//   temp_{lo+1} += km_q * r_inv[0] + carry
//   temp_{lo+k} += km_q * r_inv[k-1]   for k in 2..9
//
// IMPORTANT: the scalar/quad barriers after every partial-add prevent LLVM
// from (a) reordering the scalar and quad streams across the iteration, and
// (b) CSE-ing the `extend_low_u32x4(km_q)` subexpression — without the
// barriers, LLVM extends km_q once to i64x2 then emits 9× slow `i64x2.mul`
// instead of 9× fast `extmul_low/high_u32x4` (pmuludq).
#define BB_VF_YUVAL_REDUCE(lo)                                                                                         \
    {                                                                                                                  \
        const uint64_t km_s = temp_##lo & MASK29;                                                                      \
        const uint64_t carry_s = temp_##lo >> 29;                                                                      \
        /* Build km_q as i32x4. Shuffle first (packs low 32 bits of each i64x2 lane), */                               \
        /* then mask to 29 bits. This saves one quad AND per Yuval: the old code masked */                             \
        /* tlo and thi as i64x2 BEFORE the shuffle (2 ops), then shuffled (1 op). New */                               \
        /* version shuffles (1 op), then ANDs the i32x4 result (1 op). Total 2 ops vs 3. */                            \
        /* Correctness: `(x & 0xFFFFFFFF) & 0x1fffffff = x & 0x1fffffff`, so the */                                    \
        /* shuffle-then-mask yields the same lane values as mask-then-shuffle. Unlike */                               \
        /* Stage 7's rk_q (which only needs the final mod-2^29 of the product), Yuval's */                             \
        /* km_q structurally requires the 29-bit mask because wasm_r_inv[j] is */                                      \
        /* precomputed assuming k = temp_lo & MASK29. */                                                               \
        v128_t km_q_raw = wasm_i8x16_shuffle(tlo_##lo,                                                                 \
                                              thi_##lo,                                                                \
                                              0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);               \
        v128_t km_q = wasm_v128_and(km_q_raw, mask29_i32x4);                                                           \
        v128_t carry_q_lo = wasm_u64x2_shr(tlo_##lo, 29);                                                              \
        v128_t carry_q_hi = wasm_u64x2_shr(thi_##lo, 29);                                                              \
        temp_##lo##_plus1 += km_s * R_INV_WASM[0] + carry_s;                                                           \
        tlo_##lo##_plus1 = wasm_i64x2_add(wasm_i64x2_add(tlo_##lo##_plus1, wasm_u64x2_extmul_low_u32x4(km_q, r_inv0)), \
                                          carry_q_lo);                                                                 \
        thi_##lo##_plus1 = wasm_i64x2_add(wasm_i64x2_add(thi_##lo##_plus1, wasm_u64x2_extmul_high_u32x4(km_q, r_inv0)),\
                                          carry_q_hi);                                                                 \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus1, tlo_##lo##_plus1, thi_##lo##_plus1);                 \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus2 += km_s * R_INV_WASM[1];                                                                     \
        tlo_##lo##_plus2 = wasm_i64x2_add(tlo_##lo##_plus2, wasm_u64x2_extmul_low_u32x4(km_q, r_inv1));                \
        thi_##lo##_plus2 = wasm_i64x2_add(thi_##lo##_plus2, wasm_u64x2_extmul_high_u32x4(km_q, r_inv1));               \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus3 += km_s * R_INV_WASM[2];                                                                     \
        tlo_##lo##_plus3 = wasm_i64x2_add(tlo_##lo##_plus3, wasm_u64x2_extmul_low_u32x4(km_q, r_inv2));                \
        thi_##lo##_plus3 = wasm_i64x2_add(thi_##lo##_plus3, wasm_u64x2_extmul_high_u32x4(km_q, r_inv2));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus3, tlo_##lo##_plus3, thi_##lo##_plus3);                 \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus4 += km_s * R_INV_WASM[3];                                                                     \
        tlo_##lo##_plus4 = wasm_i64x2_add(tlo_##lo##_plus4, wasm_u64x2_extmul_low_u32x4(km_q, r_inv3));                \
        thi_##lo##_plus4 = wasm_i64x2_add(thi_##lo##_plus4, wasm_u64x2_extmul_high_u32x4(km_q, r_inv3));               \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus5 += km_s * R_INV_WASM[4];                                                                     \
        tlo_##lo##_plus5 = wasm_i64x2_add(tlo_##lo##_plus5, wasm_u64x2_extmul_low_u32x4(km_q, r_inv4));                \
        thi_##lo##_plus5 = wasm_i64x2_add(thi_##lo##_plus5, wasm_u64x2_extmul_high_u32x4(km_q, r_inv4));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus5, tlo_##lo##_plus5, thi_##lo##_plus5);                 \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus6 += km_s * R_INV_WASM[5];                                                                     \
        tlo_##lo##_plus6 = wasm_i64x2_add(tlo_##lo##_plus6, wasm_u64x2_extmul_low_u32x4(km_q, r_inv5));                \
        thi_##lo##_plus6 = wasm_i64x2_add(thi_##lo##_plus6, wasm_u64x2_extmul_high_u32x4(km_q, r_inv5));               \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus7 += km_s * R_INV_WASM[6];                                                                     \
        tlo_##lo##_plus7 = wasm_i64x2_add(tlo_##lo##_plus7, wasm_u64x2_extmul_low_u32x4(km_q, r_inv6));                \
        thi_##lo##_plus7 = wasm_i64x2_add(thi_##lo##_plus7, wasm_u64x2_extmul_high_u32x4(km_q, r_inv6));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus7, tlo_##lo##_plus7, thi_##lo##_plus7);                 \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus8 += km_s * R_INV_WASM[7];                                                                     \
        tlo_##lo##_plus8 = wasm_i64x2_add(tlo_##lo##_plus8, wasm_u64x2_extmul_low_u32x4(km_q, r_inv7));                \
        thi_##lo##_plus8 = wasm_i64x2_add(thi_##lo##_plus8, wasm_u64x2_extmul_high_u32x4(km_q, r_inv7));               \
        asm volatile("" : "+r"(km_q));                                                                                                                                   \
        temp_##lo##_plus9 += km_s * R_INV_WASM[8];                                                                     \
        tlo_##lo##_plus9 = wasm_i64x2_add(tlo_##lo##_plus9, wasm_u64x2_extmul_low_u32x4(km_q, r_inv8));                \
        thi_##lo##_plus9 = wasm_i64x2_add(thi_##lo##_plus9, wasm_u64x2_extmul_high_u32x4(km_q, r_inv8));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus9, tlo_##lo##_plus9, thi_##lo##_plus9);                 \
    }

    // Unrolled Yuval reductions for lo = 0..7. Need alias names for the macro.
#define temp_0_plus1 temp_1
#define temp_0_plus2 temp_2
#define temp_0_plus3 temp_3
#define temp_0_plus4 temp_4
#define temp_0_plus5 temp_5
#define temp_0_plus6 temp_6
#define temp_0_plus7 temp_7
#define temp_0_plus8 temp_8
#define temp_0_plus9 temp_9
#define tlo_0_plus1 tlo_1
#define tlo_0_plus2 tlo_2
#define tlo_0_plus3 tlo_3
#define tlo_0_plus4 tlo_4
#define tlo_0_plus5 tlo_5
#define tlo_0_plus6 tlo_6
#define tlo_0_plus7 tlo_7
#define tlo_0_plus8 tlo_8
#define tlo_0_plus9 tlo_9
#define thi_0_plus1 thi_1
#define thi_0_plus2 thi_2
#define thi_0_plus3 thi_3
#define thi_0_plus4 thi_4
#define thi_0_plus5 thi_5
#define thi_0_plus6 thi_6
#define thi_0_plus7 thi_7
#define thi_0_plus8 thi_8
#define thi_0_plus9 thi_9
    BB_VF_YUVAL_REDUCE(0)
#undef temp_0_plus1
#undef temp_0_plus2
#undef temp_0_plus3
#undef temp_0_plus4
#undef temp_0_plus5
#undef temp_0_plus6
#undef temp_0_plus7
#undef temp_0_plus8
#undef temp_0_plus9
#undef tlo_0_plus1
#undef tlo_0_plus2
#undef tlo_0_plus3
#undef tlo_0_plus4
#undef tlo_0_plus5
#undef tlo_0_plus6
#undef tlo_0_plus7
#undef tlo_0_plus8
#undef tlo_0_plus9
#undef thi_0_plus1
#undef thi_0_plus2
#undef thi_0_plus3
#undef thi_0_plus4
#undef thi_0_plus5
#undef thi_0_plus6
#undef thi_0_plus7
#undef thi_0_plus8
#undef thi_0_plus9

#define temp_1_plus1 temp_2
#define temp_1_plus2 temp_3
#define temp_1_plus3 temp_4
#define temp_1_plus4 temp_5
#define temp_1_plus5 temp_6
#define temp_1_plus6 temp_7
#define temp_1_plus7 temp_8
#define temp_1_plus8 temp_9
#define temp_1_plus9 temp_10
#define tlo_1_plus1 tlo_2
#define tlo_1_plus2 tlo_3
#define tlo_1_plus3 tlo_4
#define tlo_1_plus4 tlo_5
#define tlo_1_plus5 tlo_6
#define tlo_1_plus6 tlo_7
#define tlo_1_plus7 tlo_8
#define tlo_1_plus8 tlo_9
#define tlo_1_plus9 tlo_10
#define thi_1_plus1 thi_2
#define thi_1_plus2 thi_3
#define thi_1_plus3 thi_4
#define thi_1_plus4 thi_5
#define thi_1_plus5 thi_6
#define thi_1_plus6 thi_7
#define thi_1_plus7 thi_8
#define thi_1_plus8 thi_9
#define thi_1_plus9 thi_10
    BB_VF_YUVAL_REDUCE(1)
#undef temp_1_plus1
#undef temp_1_plus2
#undef temp_1_plus3
#undef temp_1_plus4
#undef temp_1_plus5
#undef temp_1_plus6
#undef temp_1_plus7
#undef temp_1_plus8
#undef temp_1_plus9
#undef tlo_1_plus1
#undef tlo_1_plus2
#undef tlo_1_plus3
#undef tlo_1_plus4
#undef tlo_1_plus5
#undef tlo_1_plus6
#undef tlo_1_plus7
#undef tlo_1_plus8
#undef tlo_1_plus9
#undef thi_1_plus1
#undef thi_1_plus2
#undef thi_1_plus3
#undef thi_1_plus4
#undef thi_1_plus5
#undef thi_1_plus6
#undef thi_1_plus7
#undef thi_1_plus8
#undef thi_1_plus9

#define temp_2_plus1 temp_3
#define temp_2_plus2 temp_4
#define temp_2_plus3 temp_5
#define temp_2_plus4 temp_6
#define temp_2_plus5 temp_7
#define temp_2_plus6 temp_8
#define temp_2_plus7 temp_9
#define temp_2_plus8 temp_10
#define temp_2_plus9 temp_11
#define tlo_2_plus1 tlo_3
#define tlo_2_plus2 tlo_4
#define tlo_2_plus3 tlo_5
#define tlo_2_plus4 tlo_6
#define tlo_2_plus5 tlo_7
#define tlo_2_plus6 tlo_8
#define tlo_2_plus7 tlo_9
#define tlo_2_plus8 tlo_10
#define tlo_2_plus9 tlo_11
#define thi_2_plus1 thi_3
#define thi_2_plus2 thi_4
#define thi_2_plus3 thi_5
#define thi_2_plus4 thi_6
#define thi_2_plus5 thi_7
#define thi_2_plus6 thi_8
#define thi_2_plus7 thi_9
#define thi_2_plus8 thi_10
#define thi_2_plus9 thi_11
    BB_VF_YUVAL_REDUCE(2)
#undef temp_2_plus1
#undef temp_2_plus2
#undef temp_2_plus3
#undef temp_2_plus4
#undef temp_2_plus5
#undef temp_2_plus6
#undef temp_2_plus7
#undef temp_2_plus8
#undef temp_2_plus9
#undef tlo_2_plus1
#undef tlo_2_plus2
#undef tlo_2_plus3
#undef tlo_2_plus4
#undef tlo_2_plus5
#undef tlo_2_plus6
#undef tlo_2_plus7
#undef tlo_2_plus8
#undef tlo_2_plus9
#undef thi_2_plus1
#undef thi_2_plus2
#undef thi_2_plus3
#undef thi_2_plus4
#undef thi_2_plus5
#undef thi_2_plus6
#undef thi_2_plus7
#undef thi_2_plus8
#undef thi_2_plus9

#define temp_3_plus1 temp_4
#define temp_3_plus2 temp_5
#define temp_3_plus3 temp_6
#define temp_3_plus4 temp_7
#define temp_3_plus5 temp_8
#define temp_3_plus6 temp_9
#define temp_3_plus7 temp_10
#define temp_3_plus8 temp_11
#define temp_3_plus9 temp_12
#define tlo_3_plus1 tlo_4
#define tlo_3_plus2 tlo_5
#define tlo_3_plus3 tlo_6
#define tlo_3_plus4 tlo_7
#define tlo_3_plus5 tlo_8
#define tlo_3_plus6 tlo_9
#define tlo_3_plus7 tlo_10
#define tlo_3_plus8 tlo_11
#define tlo_3_plus9 tlo_12
#define thi_3_plus1 thi_4
#define thi_3_plus2 thi_5
#define thi_3_plus3 thi_6
#define thi_3_plus4 thi_7
#define thi_3_plus5 thi_8
#define thi_3_plus6 thi_9
#define thi_3_plus7 thi_10
#define thi_3_plus8 thi_11
#define thi_3_plus9 thi_12
    BB_VF_YUVAL_REDUCE(3)
#undef temp_3_plus1
#undef temp_3_plus2
#undef temp_3_plus3
#undef temp_3_plus4
#undef temp_3_plus5
#undef temp_3_plus6
#undef temp_3_plus7
#undef temp_3_plus8
#undef temp_3_plus9
#undef tlo_3_plus1
#undef tlo_3_plus2
#undef tlo_3_plus3
#undef tlo_3_plus4
#undef tlo_3_plus5
#undef tlo_3_plus6
#undef tlo_3_plus7
#undef tlo_3_plus8
#undef tlo_3_plus9
#undef thi_3_plus1
#undef thi_3_plus2
#undef thi_3_plus3
#undef thi_3_plus4
#undef thi_3_plus5
#undef thi_3_plus6
#undef thi_3_plus7
#undef thi_3_plus8
#undef thi_3_plus9

#define temp_4_plus1 temp_5
#define temp_4_plus2 temp_6
#define temp_4_plus3 temp_7
#define temp_4_plus4 temp_8
#define temp_4_plus5 temp_9
#define temp_4_plus6 temp_10
#define temp_4_plus7 temp_11
#define temp_4_plus8 temp_12
#define temp_4_plus9 temp_13
#define tlo_4_plus1 tlo_5
#define tlo_4_plus2 tlo_6
#define tlo_4_plus3 tlo_7
#define tlo_4_plus4 tlo_8
#define tlo_4_plus5 tlo_9
#define tlo_4_plus6 tlo_10
#define tlo_4_plus7 tlo_11
#define tlo_4_plus8 tlo_12
#define tlo_4_plus9 tlo_13
#define thi_4_plus1 thi_5
#define thi_4_plus2 thi_6
#define thi_4_plus3 thi_7
#define thi_4_plus4 thi_8
#define thi_4_plus5 thi_9
#define thi_4_plus6 thi_10
#define thi_4_plus7 thi_11
#define thi_4_plus8 thi_12
#define thi_4_plus9 thi_13
    BB_VF_YUVAL_REDUCE(4)
#undef temp_4_plus1
#undef temp_4_plus2
#undef temp_4_plus3
#undef temp_4_plus4
#undef temp_4_plus5
#undef temp_4_plus6
#undef temp_4_plus7
#undef temp_4_plus8
#undef temp_4_plus9
#undef tlo_4_plus1
#undef tlo_4_plus2
#undef tlo_4_plus3
#undef tlo_4_plus4
#undef tlo_4_plus5
#undef tlo_4_plus6
#undef tlo_4_plus7
#undef tlo_4_plus8
#undef tlo_4_plus9
#undef thi_4_plus1
#undef thi_4_plus2
#undef thi_4_plus3
#undef thi_4_plus4
#undef thi_4_plus5
#undef thi_4_plus6
#undef thi_4_plus7
#undef thi_4_plus8
#undef thi_4_plus9

#define temp_5_plus1 temp_6
#define temp_5_plus2 temp_7
#define temp_5_plus3 temp_8
#define temp_5_plus4 temp_9
#define temp_5_plus5 temp_10
#define temp_5_plus6 temp_11
#define temp_5_plus7 temp_12
#define temp_5_plus8 temp_13
#define temp_5_plus9 temp_14
#define tlo_5_plus1 tlo_6
#define tlo_5_plus2 tlo_7
#define tlo_5_plus3 tlo_8
#define tlo_5_plus4 tlo_9
#define tlo_5_plus5 tlo_10
#define tlo_5_plus6 tlo_11
#define tlo_5_plus7 tlo_12
#define tlo_5_plus8 tlo_13
#define tlo_5_plus9 tlo_14
#define thi_5_plus1 thi_6
#define thi_5_plus2 thi_7
#define thi_5_plus3 thi_8
#define thi_5_plus4 thi_9
#define thi_5_plus5 thi_10
#define thi_5_plus6 thi_11
#define thi_5_plus7 thi_12
#define thi_5_plus8 thi_13
#define thi_5_plus9 thi_14
    BB_VF_YUVAL_REDUCE(5)
#undef temp_5_plus1
#undef temp_5_plus2
#undef temp_5_plus3
#undef temp_5_plus4
#undef temp_5_plus5
#undef temp_5_plus6
#undef temp_5_plus7
#undef temp_5_plus8
#undef temp_5_plus9
#undef tlo_5_plus1
#undef tlo_5_plus2
#undef tlo_5_plus3
#undef tlo_5_plus4
#undef tlo_5_plus5
#undef tlo_5_plus6
#undef tlo_5_plus7
#undef tlo_5_plus8
#undef tlo_5_plus9
#undef thi_5_plus1
#undef thi_5_plus2
#undef thi_5_plus3
#undef thi_5_plus4
#undef thi_5_plus5
#undef thi_5_plus6
#undef thi_5_plus7
#undef thi_5_plus8
#undef thi_5_plus9

#define temp_6_plus1 temp_7
#define temp_6_plus2 temp_8
#define temp_6_plus3 temp_9
#define temp_6_plus4 temp_10
#define temp_6_plus5 temp_11
#define temp_6_plus6 temp_12
#define temp_6_plus7 temp_13
#define temp_6_plus8 temp_14
#define temp_6_plus9 temp_15
#define tlo_6_plus1 tlo_7
#define tlo_6_plus2 tlo_8
#define tlo_6_plus3 tlo_9
#define tlo_6_plus4 tlo_10
#define tlo_6_plus5 tlo_11
#define tlo_6_plus6 tlo_12
#define tlo_6_plus7 tlo_13
#define tlo_6_plus8 tlo_14
#define tlo_6_plus9 tlo_15
#define thi_6_plus1 thi_7
#define thi_6_plus2 thi_8
#define thi_6_plus3 thi_9
#define thi_6_plus4 thi_10
#define thi_6_plus5 thi_11
#define thi_6_plus6 thi_12
#define thi_6_plus7 thi_13
#define thi_6_plus8 thi_14
#define thi_6_plus9 thi_15
    BB_VF_YUVAL_REDUCE(6)
#undef temp_6_plus1
#undef temp_6_plus2
#undef temp_6_plus3
#undef temp_6_plus4
#undef temp_6_plus5
#undef temp_6_plus6
#undef temp_6_plus7
#undef temp_6_plus8
#undef temp_6_plus9
#undef tlo_6_plus1
#undef tlo_6_plus2
#undef tlo_6_plus3
#undef tlo_6_plus4
#undef tlo_6_plus5
#undef tlo_6_plus6
#undef tlo_6_plus7
#undef tlo_6_plus8
#undef tlo_6_plus9
#undef thi_6_plus1
#undef thi_6_plus2
#undef thi_6_plus3
#undef thi_6_plus4
#undef thi_6_plus5
#undef thi_6_plus6
#undef thi_6_plus7
#undef thi_6_plus8
#undef thi_6_plus9

#define temp_7_plus1 temp_8
#define temp_7_plus2 temp_9
#define temp_7_plus3 temp_10
#define temp_7_plus4 temp_11
#define temp_7_plus5 temp_12
#define temp_7_plus6 temp_13
#define temp_7_plus7 temp_14
#define temp_7_plus8 temp_15
#define temp_7_plus9 temp_16
#define tlo_7_plus1 tlo_8
#define tlo_7_plus2 tlo_9
#define tlo_7_plus3 tlo_10
#define tlo_7_plus4 tlo_11
#define tlo_7_plus5 tlo_12
#define tlo_7_plus6 tlo_13
#define tlo_7_plus7 tlo_14
#define tlo_7_plus8 tlo_15
#define tlo_7_plus9 tlo_16
#define thi_7_plus1 thi_8
#define thi_7_plus2 thi_9
#define thi_7_plus3 thi_10
#define thi_7_plus4 thi_11
#define thi_7_plus5 thi_12
#define thi_7_plus6 thi_13
#define thi_7_plus7 thi_14
#define thi_7_plus8 thi_15
#define thi_7_plus9 thi_16
    BB_VF_YUVAL_REDUCE(7)
#undef temp_7_plus1
#undef temp_7_plus2
#undef temp_7_plus3
#undef temp_7_plus4
#undef temp_7_plus5
#undef temp_7_plus6
#undef temp_7_plus7
#undef temp_7_plus8
#undef temp_7_plus9
#undef tlo_7_plus1
#undef tlo_7_plus2
#undef tlo_7_plus3
#undef tlo_7_plus4
#undef tlo_7_plus5
#undef tlo_7_plus6
#undef tlo_7_plus7
#undef tlo_7_plus8
#undef tlo_7_plus9
#undef thi_7_plus1
#undef thi_7_plus2
#undef thi_7_plus3
#undef thi_7_plus4
#undef thi_7_plus5
#undef thi_7_plus6
#undef thi_7_plus7
#undef thi_7_plus8
#undef thi_7_plus9
#undef BB_VF_YUVAL_REDUCE

    // ============================================================
    // Stage 7: 1 x wasm_reduce on (temp_8..temp_16).
    //   rk = (temp_8 * r_inv_mod_2_29) & mask29
    //   temp_8  += rk * p[0]             (zeros low 29 bits of temp_8; discarded)
    //   temp_9  += rk * p[1] + (temp_8 >> 29)
    //   temp_k  += rk * p[j]  for j in 2..8
    // ============================================================

    {
        // Scalar
        const uint64_t rk_s = (temp_8 * R_INV_MOD_2_29) & MASK29;
        // Quad: rk = (temp_8_i32x4 * r_inv_mod_2_29) & mask29
        const v128_t rinv_splat = wasm_i32x4_splat(static_cast<int32_t>(R_INV_MOD_2_29));
        // Build temp_8 as i32x4 (take low 32 bits of each i64x2 lane).
        // Correctness: `rk = (temp_8 * r_inv) mod 2^29` = `((temp_8 mod 2^32) *
        // r_inv) mod 2^29`. So pre-masking tlo_8/thi_8 to 29 bits is redundant
        // — the final `mask29_i32x4 AND` below clamps rk to 29 bits regardless
        // of whether high bits were present in the shuffle input. Unlike Yuval
        // (which structurally requires km = temp_lo & mask29 because it
        // precomputes r_inv_wasm[i] assuming that), wasm_reduce only needs the
        // final mod-2^29 of rk.
        const v128_t t8_i32x4 = wasm_i8x16_shuffle(tlo_8,
                                                    thi_8,
                                                    0,
                                                    1,
                                                    2,
                                                    3,
                                                    8,
                                                    9,
                                                    10,
                                                    11,
                                                    16,
                                                    17,
                                                    18,
                                                    19,
                                                    24,
                                                    25,
                                                    26,
                                                    27);
        const v128_t rk_q = wasm_v128_and(wasm_i32x4_mul(t8_i32x4, rinv_splat), mask29_i32x4);

        // p_splat constants (i32x4 with asm barrier — see r_inv comment above).
        v128_t p0_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[0]));
        v128_t p1_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[1]));
        v128_t p2_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[2]));
        v128_t p3_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[3]));
        v128_t p4_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[4]));
        v128_t p5_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[5]));
        v128_t p6_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[6]));
        v128_t p7_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[7]));
        v128_t p8_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[8]));
        // Same reasoning as r_inv barriers above: MUST be "+r" inout to
        // prevent LLVM from pre-extending the p constants and regressing to
        // slow i64x2.mul.
        asm volatile("" : "+r"(p0_splat), "+r"(p1_splat), "+r"(p2_splat), "+r"(p3_splat), "+r"(p4_splat));
        asm volatile("" : "+r"(p5_splat), "+r"(p6_splat), "+r"(p7_splat), "+r"(p8_splat));

        temp_8 += rk_s * P_WASM[0];
        tlo_8 = wasm_i64x2_add(tlo_8, wasm_u64x2_extmul_low_u32x4(rk_q, p0_splat));
        thi_8 = wasm_i64x2_add(thi_8, wasm_u64x2_extmul_high_u32x4(rk_q, p0_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_8, tlo_8, thi_8);

        temp_9 += rk_s * P_WASM[1] + (temp_8 >> 29);
        tlo_9 = wasm_i64x2_add(wasm_i64x2_add(tlo_9, wasm_u64x2_extmul_low_u32x4(rk_q, p1_splat)),
                               wasm_u64x2_shr(tlo_8, 29));
        thi_9 = wasm_i64x2_add(wasm_i64x2_add(thi_9, wasm_u64x2_extmul_high_u32x4(rk_q, p1_splat)),
                               wasm_u64x2_shr(thi_8, 29));
        vector_field_detail::bb_vf_barrier_sqq(temp_9, tlo_9, thi_9);

        temp_10 += rk_s * P_WASM[2];
        tlo_10 = wasm_i64x2_add(tlo_10, wasm_u64x2_extmul_low_u32x4(rk_q, p2_splat));
        thi_10 = wasm_i64x2_add(thi_10, wasm_u64x2_extmul_high_u32x4(rk_q, p2_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_10, tlo_10, thi_10);

        temp_11 += rk_s * P_WASM[3];
        tlo_11 = wasm_i64x2_add(tlo_11, wasm_u64x2_extmul_low_u32x4(rk_q, p3_splat));
        thi_11 = wasm_i64x2_add(thi_11, wasm_u64x2_extmul_high_u32x4(rk_q, p3_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_11, tlo_11, thi_11);

        temp_12 += rk_s * P_WASM[4];
        tlo_12 = wasm_i64x2_add(tlo_12, wasm_u64x2_extmul_low_u32x4(rk_q, p4_splat));
        thi_12 = wasm_i64x2_add(thi_12, wasm_u64x2_extmul_high_u32x4(rk_q, p4_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_12, tlo_12, thi_12);

        temp_13 += rk_s * P_WASM[5];
        tlo_13 = wasm_i64x2_add(tlo_13, wasm_u64x2_extmul_low_u32x4(rk_q, p5_splat));
        thi_13 = wasm_i64x2_add(thi_13, wasm_u64x2_extmul_high_u32x4(rk_q, p5_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_13, tlo_13, thi_13);

        temp_14 += rk_s * P_WASM[6];
        tlo_14 = wasm_i64x2_add(tlo_14, wasm_u64x2_extmul_low_u32x4(rk_q, p6_splat));
        thi_14 = wasm_i64x2_add(thi_14, wasm_u64x2_extmul_high_u32x4(rk_q, p6_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_14, tlo_14, thi_14);

        temp_15 += rk_s * P_WASM[7];
        tlo_15 = wasm_i64x2_add(tlo_15, wasm_u64x2_extmul_low_u32x4(rk_q, p7_splat));
        thi_15 = wasm_i64x2_add(thi_15, wasm_u64x2_extmul_high_u32x4(rk_q, p7_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_15, tlo_15, thi_15);

        temp_16 += rk_s * P_WASM[8];
        tlo_16 = wasm_i64x2_add(tlo_16, wasm_u64x2_extmul_low_u32x4(rk_q, p8_splat));
        thi_16 = wasm_i64x2_add(thi_16, wasm_u64x2_extmul_high_u32x4(rk_q, p8_splat));
        vector_field_detail::bb_vf_barrier_sqq(temp_16, tlo_16, thi_16);
    }

    // ============================================================
    // Stage 8: Carry propagation temp_9..temp_16, out to temp_17.
    //
    // Optimization: defer the "strip low 29 bits" AND from each step to
    // Stage 9. After `temp_{k+1} += temp_k >> 29`, temp_k retains its carry
    // bits in positions 29..63. This is HARMLESS for the carry chain because:
    //   - Step k+1 reads temp_{k+1} (not temp_k again). temp_{k+1}'s high
    //     bits represent the correct accumulated carry to extract next.
    //   - temp_k is only READ downstream by Stage 9 output, which applies
    //     a mask at store time (i32x4_and after the shuffle for quad, and
    //     `& MASK29` for scalar).
    // The VALUE represented by the output limbs `sum (temp_k & MASK29) *
    // 2^{29(k-9)}` equals the value before Stage 8. Equivalent to the
    // strip-every-step version but saves the i64x2 AND on tlo_k/thi_k per
    // step. The scalar AND per step is likewise deferred to match the
    // scalar/quad interleaving (V8 relies on it).
    //
    // Overflow: temp_k ≤ ~2^63 before Stage 8. `(temp_k) >> 29` ≤ 2^34.
    // Adding to temp_{k+1} (≤ 2^63) stays in u64. i64x2 lanes follow the
    // same bound.
    //
    // Saves 16 i64x2 AND ops (2 per step × 8 steps); Stage 9 reintroduces
    // 8 i32x4 AND ops; net save = 8 quad ops.
    // ============================================================

    temp_10 += temp_9 >> 29;
    tlo_10 = wasm_i64x2_add(tlo_10, wasm_u64x2_shr(tlo_9, 29));
    thi_10 = wasm_i64x2_add(thi_10, wasm_u64x2_shr(thi_9, 29));

    temp_11 += temp_10 >> 29;
    tlo_11 = wasm_i64x2_add(tlo_11, wasm_u64x2_shr(tlo_10, 29));
    thi_11 = wasm_i64x2_add(thi_11, wasm_u64x2_shr(thi_10, 29));

    temp_12 += temp_11 >> 29;
    tlo_12 = wasm_i64x2_add(tlo_12, wasm_u64x2_shr(tlo_11, 29));
    thi_12 = wasm_i64x2_add(thi_12, wasm_u64x2_shr(thi_11, 29));

    temp_13 += temp_12 >> 29;
    tlo_13 = wasm_i64x2_add(tlo_13, wasm_u64x2_shr(tlo_12, 29));
    thi_13 = wasm_i64x2_add(thi_13, wasm_u64x2_shr(thi_12, 29));

    temp_14 += temp_13 >> 29;
    tlo_14 = wasm_i64x2_add(tlo_14, wasm_u64x2_shr(tlo_13, 29));
    thi_14 = wasm_i64x2_add(thi_14, wasm_u64x2_shr(thi_13, 29));

    temp_15 += temp_14 >> 29;
    tlo_15 = wasm_i64x2_add(tlo_15, wasm_u64x2_shr(tlo_14, 29));
    thi_15 = wasm_i64x2_add(thi_15, wasm_u64x2_shr(thi_14, 29));

    temp_16 += temp_15 >> 29;
    tlo_16 = wasm_i64x2_add(tlo_16, wasm_u64x2_shr(tlo_15, 29));
    thi_16 = wasm_i64x2_add(thi_16, wasm_u64x2_shr(thi_15, 29));

    // temp_17 initialized directly from the final carry out of temp_16 —
    // this saves the splat(0) + i64x2_add pair (both scalar and quad) that
    // a "temp_17 = 0; temp_17 += temp_16 >> 29" pattern would generate.
    const uint64_t temp_17 = temp_16 >> 29;
    const v128_t tlo_17 = wasm_u64x2_shr(tlo_16, 29);
    const v128_t thi_17 = wasm_u64x2_shr(thi_16, 29);

    // ============================================================
    // Stage 9/10: Store output (no conditional subtract needed).
    //
    // Per field_impl_generic.hpp line 863, the Karatsuba+Yuval result is in
    // [0, p] already (tighter than coarse [0, 2p)), so no final subtract-p is
    // required. We simply emit temp_9..temp_17 as the 9-limb output. The
    // scalar reference (field<>::montgomery_mul WASM path, line 892-896)
    // similarly skips any conditional subtract.
    //
    // Quad output: shuffle (tlo_lo, thi_hi) back into i32x4 form, then AND
    // with mask29_i32x4 to strip the deferred carry bits from Stage 8 (see
    // Stage 8 comment). The low 29 bits of each i32x4 lane are the limb.
    //
    // Scalar output: `& MASK29` to strip the deferred carry bits from
    // Stage 8. (The static_cast<uint32_t> takes bits 0..31; without the
    // mask, bits 29..31 — part of the carry chain — would leak into the
    // output limb.)
    //
    // temp_17 (final carry slot) does NOT need a mask: it is `temp_16 >> 29`
    // directly, and since the result value ≤ p < 2^254 spreads across 9×29
    // bit limbs, limb 8 ≤ 2^22 < 2^29. (Formally: temp_17 = bits 29..63 of
    // temp_16 post-step-7 = total carry out of position 8 in the result,
    // which is bounded by p/2^232 < 2^22.)
    // ============================================================

    result.scalar_data[0] = static_cast<uint32_t>(temp_9) & static_cast<uint32_t>(MASK29);
    result.quad_data[0] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_9, thi_9, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[1] = static_cast<uint32_t>(temp_10) & static_cast<uint32_t>(MASK29);
    result.quad_data[1] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_10, thi_10, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[2] = static_cast<uint32_t>(temp_11) & static_cast<uint32_t>(MASK29);
    result.quad_data[2] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_11, thi_11, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[3] = static_cast<uint32_t>(temp_12) & static_cast<uint32_t>(MASK29);
    result.quad_data[3] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_12, thi_12, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[4] = static_cast<uint32_t>(temp_13) & static_cast<uint32_t>(MASK29);
    result.quad_data[4] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_13, thi_13, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[5] = static_cast<uint32_t>(temp_14) & static_cast<uint32_t>(MASK29);
    result.quad_data[5] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_14, thi_14, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[6] = static_cast<uint32_t>(temp_15) & static_cast<uint32_t>(MASK29);
    result.quad_data[6] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_15, thi_15, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[7] = static_cast<uint32_t>(temp_16) & static_cast<uint32_t>(MASK29);
    result.quad_data[7] = wasm_v128_and(
        wasm_i8x16_shuffle(tlo_16, thi_16, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),
        mask29_i32x4);
    result.scalar_data[8] = static_cast<uint32_t>(temp_17);
    result.quad_data[8] = wasm_i8x16_shuffle(
        tlo_17, thi_17, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);

    return result;
}


} // namespace bb

#endif // __wasm_simd128__
