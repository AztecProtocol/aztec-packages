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

// =====================================================================
// Karatsuba Stage 1..4 shared macro.
//
// Textually stamps the interleaved scalar + quad computation of
//   pl0..pl8   (P_lo  = left[0..4] * right[0..4], 25 muls)
//   ph0..ph6   (P_hi  = left[5..8] * right[5..8], 16 muls)
//   ssl/ssr/qsl/qsr 0..4 (cross sums, i32x4 add — NOT i64x2)
//   pc0..pc8   (P_cross = sl * sr, 25 muls)
// from the named-local inputs `sl0..sl8`, `sri0..sri8`, `ql0..ql8`,
// `qri0..qri8` that the caller must define.
//
// This is a MACRO, not a function: if it were inlined through a function
// boundary, the struct-return + array-intermediate would defeat LLVM's
// SSA register allocator and lose ~5% on the mul bench (see commit
// history). The macro form stamps the body directly so the compiler
// sees the inputs and outputs as fresh locals in each caller.
//
// Every `bb_vf_barrier_sqq` / `bb_vf_barrier_sq` is load-bearing: see
// vector_field.hpp for why. DO NOT remove.
//
// Stage 3 "break the qsl4==ql4 / qsr4==qri4 alias" (via bb_vf_barrier_sq
// on ssl4/qsl4/ssr4/qsr4) prevents LLVM from CSE-ing pc8's extmul pair
// with pl8 = l4*r4.
// =====================================================================
// clang-format off
#define BB_VF_KARATSUBA_STAGES_1_4()                                                                                   \
    /* Stage 1: P_lo (25 muls, pl0..pl8). */                                                                           \
    uint64_t pl0 = sl0 * sri0;                                                                                         \
    v128_t pl0_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri0);                                                            \
    v128_t pl0_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri0);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl0, pl0_lo, pl0_hi);                                                       \
    uint64_t pl1 = sl0 * sri1;                                                                                         \
    v128_t pl1_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri1);                                                            \
    v128_t pl1_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri1);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl1, pl1_lo, pl1_hi);                                                       \
    pl1 += sl1 * sri0;                                                                                                 \
    pl1_lo = wasm_i64x2_add(pl1_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri0));                                           \
    pl1_hi = wasm_i64x2_add(pl1_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri0));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl1, pl1_lo, pl1_hi);                                                       \
    uint64_t pl2 = sl0 * sri2;                                                                                         \
    v128_t pl2_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri2);                                                            \
    v128_t pl2_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri2);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl2, pl2_lo, pl2_hi);                                                       \
    pl2 += sl1 * sri1;                                                                                                 \
    pl2_lo = wasm_i64x2_add(pl2_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri1));                                           \
    pl2_hi = wasm_i64x2_add(pl2_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri1));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl2, pl2_lo, pl2_hi);                                                       \
    pl2 += sl2 * sri0;                                                                                                 \
    pl2_lo = wasm_i64x2_add(pl2_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri0));                                           \
    pl2_hi = wasm_i64x2_add(pl2_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri0));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl2, pl2_lo, pl2_hi);                                                       \
    uint64_t pl3 = sl0 * sri3;                                                                                         \
    v128_t pl3_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri3);                                                            \
    v128_t pl3_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri3);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);                                                       \
    pl3 += sl1 * sri2;                                                                                                 \
    pl3_lo = wasm_i64x2_add(pl3_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri2));                                           \
    pl3_hi = wasm_i64x2_add(pl3_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri2));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);                                                       \
    pl3 += sl2 * sri1;                                                                                                 \
    pl3_lo = wasm_i64x2_add(pl3_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri1));                                           \
    pl3_hi = wasm_i64x2_add(pl3_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri1));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);                                                       \
    pl3 += sl3 * sri0;                                                                                                 \
    pl3_lo = wasm_i64x2_add(pl3_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri0));                                           \
    pl3_hi = wasm_i64x2_add(pl3_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri0));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl3, pl3_lo, pl3_hi);                                                       \
    uint64_t pl4 = sl0 * sri4;                                                                                         \
    v128_t pl4_lo = wasm_u64x2_extmul_low_u32x4(ql0, qri4);                                                            \
    v128_t pl4_hi = wasm_u64x2_extmul_high_u32x4(ql0, qri4);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);                                                       \
    pl4 += sl1 * sri3;                                                                                                 \
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql1, qri3));                                           \
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql1, qri3));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);                                                       \
    pl4 += sl2 * sri2;                                                                                                 \
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri2));                                           \
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri2));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);                                                       \
    pl4 += sl3 * sri1;                                                                                                 \
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri1));                                           \
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri1));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);                                                       \
    pl4 += sl4 * sri0;                                                                                                 \
    pl4_lo = wasm_i64x2_add(pl4_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri0));                                           \
    pl4_hi = wasm_i64x2_add(pl4_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri0));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl4, pl4_lo, pl4_hi);                                                       \
    uint64_t pl5 = sl1 * sri4;                                                                                         \
    v128_t pl5_lo = wasm_u64x2_extmul_low_u32x4(ql1, qri4);                                                            \
    v128_t pl5_hi = wasm_u64x2_extmul_high_u32x4(ql1, qri4);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);                                                       \
    pl5 += sl2 * sri3;                                                                                                 \
    pl5_lo = wasm_i64x2_add(pl5_lo, wasm_u64x2_extmul_low_u32x4(ql2, qri3));                                           \
    pl5_hi = wasm_i64x2_add(pl5_hi, wasm_u64x2_extmul_high_u32x4(ql2, qri3));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);                                                       \
    pl5 += sl3 * sri2;                                                                                                 \
    pl5_lo = wasm_i64x2_add(pl5_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri2));                                           \
    pl5_hi = wasm_i64x2_add(pl5_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri2));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);                                                       \
    pl5 += sl4 * sri1;                                                                                                 \
    pl5_lo = wasm_i64x2_add(pl5_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri1));                                           \
    pl5_hi = wasm_i64x2_add(pl5_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri1));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl5, pl5_lo, pl5_hi);                                                       \
    uint64_t pl6 = sl2 * sri4;                                                                                         \
    v128_t pl6_lo = wasm_u64x2_extmul_low_u32x4(ql2, qri4);                                                            \
    v128_t pl6_hi = wasm_u64x2_extmul_high_u32x4(ql2, qri4);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl6, pl6_lo, pl6_hi);                                                       \
    pl6 += sl3 * sri3;                                                                                                 \
    pl6_lo = wasm_i64x2_add(pl6_lo, wasm_u64x2_extmul_low_u32x4(ql3, qri3));                                           \
    pl6_hi = wasm_i64x2_add(pl6_hi, wasm_u64x2_extmul_high_u32x4(ql3, qri3));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl6, pl6_lo, pl6_hi);                                                       \
    pl6 += sl4 * sri2;                                                                                                 \
    pl6_lo = wasm_i64x2_add(pl6_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri2));                                           \
    pl6_hi = wasm_i64x2_add(pl6_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri2));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl6, pl6_lo, pl6_hi);                                                       \
    uint64_t pl7 = sl3 * sri4;                                                                                         \
    v128_t pl7_lo = wasm_u64x2_extmul_low_u32x4(ql3, qri4);                                                            \
    v128_t pl7_hi = wasm_u64x2_extmul_high_u32x4(ql3, qri4);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl7, pl7_lo, pl7_hi);                                                       \
    pl7 += sl4 * sri3;                                                                                                 \
    pl7_lo = wasm_i64x2_add(pl7_lo, wasm_u64x2_extmul_low_u32x4(ql4, qri3));                                           \
    pl7_hi = wasm_i64x2_add(pl7_hi, wasm_u64x2_extmul_high_u32x4(ql4, qri3));                                          \
    vector_field_detail::bb_vf_barrier_sqq(pl7, pl7_lo, pl7_hi);                                                       \
    uint64_t pl8 = sl4 * sri4;                                                                                         \
    v128_t pl8_lo = wasm_u64x2_extmul_low_u32x4(ql4, qri4);                                                            \
    v128_t pl8_hi = wasm_u64x2_extmul_high_u32x4(ql4, qri4);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(pl8, pl8_lo, pl8_hi);                                                       \
    /* Stage 2: P_hi (16 muls, ph0..ph6). */                                                                           \
    uint64_t ph0 = sl5 * sri5;                                                                                         \
    v128_t ph0_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri5);                                                            \
    v128_t ph0_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri5);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph0, ph0_lo, ph0_hi);                                                       \
    uint64_t ph1 = sl5 * sri6;                                                                                         \
    v128_t ph1_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri6);                                                            \
    v128_t ph1_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri6);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph1, ph1_lo, ph1_hi);                                                       \
    ph1 += sl6 * sri5;                                                                                                 \
    ph1_lo = wasm_i64x2_add(ph1_lo, wasm_u64x2_extmul_low_u32x4(ql6, qri5));                                           \
    ph1_hi = wasm_i64x2_add(ph1_hi, wasm_u64x2_extmul_high_u32x4(ql6, qri5));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph1, ph1_lo, ph1_hi);                                                       \
    uint64_t ph2 = sl5 * sri7;                                                                                         \
    v128_t ph2_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri7);                                                            \
    v128_t ph2_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri7);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph2, ph2_lo, ph2_hi);                                                       \
    ph2 += sl6 * sri6;                                                                                                 \
    ph2_lo = wasm_i64x2_add(ph2_lo, wasm_u64x2_extmul_low_u32x4(ql6, qri6));                                           \
    ph2_hi = wasm_i64x2_add(ph2_hi, wasm_u64x2_extmul_high_u32x4(ql6, qri6));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph2, ph2_lo, ph2_hi);                                                       \
    ph2 += sl7 * sri5;                                                                                                 \
    ph2_lo = wasm_i64x2_add(ph2_lo, wasm_u64x2_extmul_low_u32x4(ql7, qri5));                                           \
    ph2_hi = wasm_i64x2_add(ph2_hi, wasm_u64x2_extmul_high_u32x4(ql7, qri5));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph2, ph2_lo, ph2_hi);                                                       \
    uint64_t ph3 = sl5 * sri8;                                                                                         \
    v128_t ph3_lo = wasm_u64x2_extmul_low_u32x4(ql5, qri8);                                                            \
    v128_t ph3_hi = wasm_u64x2_extmul_high_u32x4(ql5, qri8);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);                                                       \
    ph3 += sl6 * sri7;                                                                                                 \
    ph3_lo = wasm_i64x2_add(ph3_lo, wasm_u64x2_extmul_low_u32x4(ql6, qri7));                                           \
    ph3_hi = wasm_i64x2_add(ph3_hi, wasm_u64x2_extmul_high_u32x4(ql6, qri7));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);                                                       \
    ph3 += sl7 * sri6;                                                                                                 \
    ph3_lo = wasm_i64x2_add(ph3_lo, wasm_u64x2_extmul_low_u32x4(ql7, qri6));                                           \
    ph3_hi = wasm_i64x2_add(ph3_hi, wasm_u64x2_extmul_high_u32x4(ql7, qri6));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);                                                       \
    ph3 += sl8 * sri5;                                                                                                 \
    ph3_lo = wasm_i64x2_add(ph3_lo, wasm_u64x2_extmul_low_u32x4(ql8, qri5));                                           \
    ph3_hi = wasm_i64x2_add(ph3_hi, wasm_u64x2_extmul_high_u32x4(ql8, qri5));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph3, ph3_lo, ph3_hi);                                                       \
    uint64_t ph4 = sl6 * sri8;                                                                                         \
    v128_t ph4_lo = wasm_u64x2_extmul_low_u32x4(ql6, qri8);                                                            \
    v128_t ph4_hi = wasm_u64x2_extmul_high_u32x4(ql6, qri8);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph4, ph4_lo, ph4_hi);                                                       \
    ph4 += sl7 * sri7;                                                                                                 \
    ph4_lo = wasm_i64x2_add(ph4_lo, wasm_u64x2_extmul_low_u32x4(ql7, qri7));                                           \
    ph4_hi = wasm_i64x2_add(ph4_hi, wasm_u64x2_extmul_high_u32x4(ql7, qri7));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph4, ph4_lo, ph4_hi);                                                       \
    ph4 += sl8 * sri6;                                                                                                 \
    ph4_lo = wasm_i64x2_add(ph4_lo, wasm_u64x2_extmul_low_u32x4(ql8, qri6));                                           \
    ph4_hi = wasm_i64x2_add(ph4_hi, wasm_u64x2_extmul_high_u32x4(ql8, qri6));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph4, ph4_lo, ph4_hi);                                                       \
    uint64_t ph5 = sl7 * sri8;                                                                                         \
    v128_t ph5_lo = wasm_u64x2_extmul_low_u32x4(ql7, qri8);                                                            \
    v128_t ph5_hi = wasm_u64x2_extmul_high_u32x4(ql7, qri8);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph5, ph5_lo, ph5_hi);                                                       \
    ph5 += sl8 * sri7;                                                                                                 \
    ph5_lo = wasm_i64x2_add(ph5_lo, wasm_u64x2_extmul_low_u32x4(ql8, qri7));                                           \
    ph5_hi = wasm_i64x2_add(ph5_hi, wasm_u64x2_extmul_high_u32x4(ql8, qri7));                                          \
    vector_field_detail::bb_vf_barrier_sqq(ph5, ph5_lo, ph5_hi);                                                       \
    uint64_t ph6 = sl8 * sri8;                                                                                         \
    v128_t ph6_lo = wasm_u64x2_extmul_low_u32x4(ql8, qri8);                                                            \
    v128_t ph6_hi = wasm_u64x2_extmul_high_u32x4(ql8, qri8);                                                           \
    vector_field_detail::bb_vf_barrier_sqq(ph6, ph6_lo, ph6_hi);                                                       \
    /* Stage 3: cross sums (i32x4 add, NOT i64x2). */                                                                  \
    uint64_t ssl0 = sl0 + sl5;                                                                                         \
    v128_t qsl0 = wasm_i32x4_add(ql0, ql5);                                                                            \
    uint64_t ssr0 = sri0 + sri5;                                                                                       \
    v128_t qsr0 = wasm_i32x4_add(qri0, qri5);                                                                          \
    vector_field_detail::bb_vf_barrier_sq(ssl0, qsl0);                                                                 \
    vector_field_detail::bb_vf_barrier_sq(ssr0, qsr0);                                                                 \
    uint64_t ssl1 = sl1 + sl6;                                                                                         \
    v128_t qsl1 = wasm_i32x4_add(ql1, ql6);                                                                            \
    uint64_t ssr1 = sri1 + sri6;                                                                                       \
    v128_t qsr1 = wasm_i32x4_add(qri1, qri6);                                                                          \
    vector_field_detail::bb_vf_barrier_sq(ssl1, qsl1);                                                                 \
    vector_field_detail::bb_vf_barrier_sq(ssr1, qsr1);                                                                 \
    uint64_t ssl2 = sl2 + sl7;                                                                                         \
    v128_t qsl2 = wasm_i32x4_add(ql2, ql7);                                                                            \
    uint64_t ssr2 = sri2 + sri7;                                                                                       \
    v128_t qsr2 = wasm_i32x4_add(qri2, qri7);                                                                          \
    vector_field_detail::bb_vf_barrier_sq(ssl2, qsl2);                                                                 \
    vector_field_detail::bb_vf_barrier_sq(ssr2, qsr2);                                                                 \
    uint64_t ssl3 = sl3 + sl8;                                                                                         \
    v128_t qsl3 = wasm_i32x4_add(ql3, ql8);                                                                            \
    uint64_t ssr3 = sri3 + sri8;                                                                                       \
    v128_t qsr3 = wasm_i32x4_add(qri3, qri8);                                                                          \
    vector_field_detail::bb_vf_barrier_sq(ssl3, qsl3);                                                                 \
    vector_field_detail::bb_vf_barrier_sq(ssr3, qsr3);                                                                 \
    uint64_t ssl4 = sl4;                                                                                               \
    v128_t qsl4 = ql4;                                                                                                 \
    uint64_t ssr4 = sri4;                                                                                              \
    v128_t qsr4 = qri4;                                                                                                \
    vector_field_detail::bb_vf_barrier_sq(ssl4, qsl4);                                                                 \
    vector_field_detail::bb_vf_barrier_sq(ssr4, qsr4);                                                                 \
    /* Stage 4: P_cross (25 muls, pc0..pc8). */                                                                        \
    uint64_t pc0 = ssl0 * ssr0;                                                                                        \
    v128_t pc0_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr0);                                                           \
    v128_t pc0_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr0);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc0, pc0_lo, pc0_hi);                                                       \
    uint64_t pc1 = ssl0 * ssr1;                                                                                        \
    v128_t pc1_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr1);                                                           \
    v128_t pc1_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr1);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc1, pc1_lo, pc1_hi);                                                       \
    pc1 += ssl1 * ssr0;                                                                                                \
    pc1_lo = wasm_i64x2_add(pc1_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr0));                                          \
    pc1_hi = wasm_i64x2_add(pc1_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr0));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc1, pc1_lo, pc1_hi);                                                       \
    uint64_t pc2 = ssl0 * ssr2;                                                                                        \
    v128_t pc2_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr2);                                                           \
    v128_t pc2_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr2);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc2, pc2_lo, pc2_hi);                                                       \
    pc2 += ssl1 * ssr1;                                                                                                \
    pc2_lo = wasm_i64x2_add(pc2_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr1));                                          \
    pc2_hi = wasm_i64x2_add(pc2_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr1));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc2, pc2_lo, pc2_hi);                                                       \
    pc2 += ssl2 * ssr0;                                                                                                \
    pc2_lo = wasm_i64x2_add(pc2_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr0));                                          \
    pc2_hi = wasm_i64x2_add(pc2_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr0));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc2, pc2_lo, pc2_hi);                                                       \
    uint64_t pc3 = ssl0 * ssr3;                                                                                        \
    v128_t pc3_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr3);                                                           \
    v128_t pc3_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr3);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);                                                       \
    pc3 += ssl1 * ssr2;                                                                                                \
    pc3_lo = wasm_i64x2_add(pc3_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr2));                                          \
    pc3_hi = wasm_i64x2_add(pc3_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr2));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);                                                       \
    pc3 += ssl2 * ssr1;                                                                                                \
    pc3_lo = wasm_i64x2_add(pc3_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr1));                                          \
    pc3_hi = wasm_i64x2_add(pc3_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr1));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);                                                       \
    pc3 += ssl3 * ssr0;                                                                                                \
    pc3_lo = wasm_i64x2_add(pc3_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr0));                                          \
    pc3_hi = wasm_i64x2_add(pc3_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr0));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc3, pc3_lo, pc3_hi);                                                       \
    uint64_t pc4 = ssl0 * ssr4;                                                                                        \
    v128_t pc4_lo = wasm_u64x2_extmul_low_u32x4(qsl0, qsr4);                                                           \
    v128_t pc4_hi = wasm_u64x2_extmul_high_u32x4(qsl0, qsr4);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);                                                       \
    pc4 += ssl1 * ssr3;                                                                                                \
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl1, qsr3));                                          \
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl1, qsr3));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);                                                       \
    pc4 += ssl2 * ssr2;                                                                                                \
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr2));                                          \
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr2));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);                                                       \
    pc4 += ssl3 * ssr1;                                                                                                \
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr1));                                          \
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr1));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);                                                       \
    pc4 += ssl4 * ssr0;                                                                                                \
    pc4_lo = wasm_i64x2_add(pc4_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr0));                                          \
    pc4_hi = wasm_i64x2_add(pc4_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr0));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc4, pc4_lo, pc4_hi);                                                       \
    uint64_t pc5 = ssl1 * ssr4;                                                                                        \
    v128_t pc5_lo = wasm_u64x2_extmul_low_u32x4(qsl1, qsr4);                                                           \
    v128_t pc5_hi = wasm_u64x2_extmul_high_u32x4(qsl1, qsr4);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);                                                       \
    pc5 += ssl2 * ssr3;                                                                                                \
    pc5_lo = wasm_i64x2_add(pc5_lo, wasm_u64x2_extmul_low_u32x4(qsl2, qsr3));                                          \
    pc5_hi = wasm_i64x2_add(pc5_hi, wasm_u64x2_extmul_high_u32x4(qsl2, qsr3));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);                                                       \
    pc5 += ssl3 * ssr2;                                                                                                \
    pc5_lo = wasm_i64x2_add(pc5_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr2));                                          \
    pc5_hi = wasm_i64x2_add(pc5_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr2));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);                                                       \
    pc5 += ssl4 * ssr1;                                                                                                \
    pc5_lo = wasm_i64x2_add(pc5_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr1));                                          \
    pc5_hi = wasm_i64x2_add(pc5_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr1));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc5, pc5_lo, pc5_hi);                                                       \
    uint64_t pc6 = ssl2 * ssr4;                                                                                        \
    v128_t pc6_lo = wasm_u64x2_extmul_low_u32x4(qsl2, qsr4);                                                           \
    v128_t pc6_hi = wasm_u64x2_extmul_high_u32x4(qsl2, qsr4);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc6, pc6_lo, pc6_hi);                                                       \
    pc6 += ssl3 * ssr3;                                                                                                \
    pc6_lo = wasm_i64x2_add(pc6_lo, wasm_u64x2_extmul_low_u32x4(qsl3, qsr3));                                          \
    pc6_hi = wasm_i64x2_add(pc6_hi, wasm_u64x2_extmul_high_u32x4(qsl3, qsr3));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc6, pc6_lo, pc6_hi);                                                       \
    pc6 += ssl4 * ssr2;                                                                                                \
    pc6_lo = wasm_i64x2_add(pc6_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr2));                                          \
    pc6_hi = wasm_i64x2_add(pc6_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr2));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc6, pc6_lo, pc6_hi);                                                       \
    uint64_t pc7 = ssl3 * ssr4;                                                                                        \
    v128_t pc7_lo = wasm_u64x2_extmul_low_u32x4(qsl3, qsr4);                                                           \
    v128_t pc7_hi = wasm_u64x2_extmul_high_u32x4(qsl3, qsr4);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc7, pc7_lo, pc7_hi);                                                       \
    pc7 += ssl4 * ssr3;                                                                                                \
    pc7_lo = wasm_i64x2_add(pc7_lo, wasm_u64x2_extmul_low_u32x4(qsl4, qsr3));                                          \
    pc7_hi = wasm_i64x2_add(pc7_hi, wasm_u64x2_extmul_high_u32x4(qsl4, qsr3));                                         \
    vector_field_detail::bb_vf_barrier_sqq(pc7, pc7_lo, pc7_hi);                                                       \
    uint64_t pc8 = ssl4 * ssr4;                                                                                        \
    v128_t pc8_lo = wasm_u64x2_extmul_low_u32x4(qsl4, qsr4);                                                           \
    v128_t pc8_hi = wasm_u64x2_extmul_high_u32x4(qsl4, qsr4);                                                          \
    vector_field_detail::bb_vf_barrier_sqq(pc8, pc8_lo, pc8_hi)

// Load the 9-scalar-limb + 9-quad-limb input from LEFT and RIGHT references
// into named locals used by BB_VF_KARATSUBA_STAGES_1_4.
#define BB_VF_LOAD_LIMBS(LEFT, RIGHT)                                                                                  \
    const uint64_t sl0 = (LEFT).scalar_data[0], sl1 = (LEFT).scalar_data[1], sl2 = (LEFT).scalar_data[2],              \
                   sl3 = (LEFT).scalar_data[3], sl4 = (LEFT).scalar_data[4], sl5 = (LEFT).scalar_data[5],              \
                   sl6 = (LEFT).scalar_data[6], sl7 = (LEFT).scalar_data[7], sl8 = (LEFT).scalar_data[8];              \
    const uint64_t sri0 = (RIGHT).scalar_data[0], sri1 = (RIGHT).scalar_data[1], sri2 = (RIGHT).scalar_data[2],        \
                   sri3 = (RIGHT).scalar_data[3], sri4 = (RIGHT).scalar_data[4], sri5 = (RIGHT).scalar_data[5],        \
                   sri6 = (RIGHT).scalar_data[6], sri7 = (RIGHT).scalar_data[7], sri8 = (RIGHT).scalar_data[8];        \
    const v128_t ql0 = (LEFT).quad_data[0], ql1 = (LEFT).quad_data[1], ql2 = (LEFT).quad_data[2],                      \
                 ql3 = (LEFT).quad_data[3], ql4 = (LEFT).quad_data[4], ql5 = (LEFT).quad_data[5],                      \
                 ql6 = (LEFT).quad_data[6], ql7 = (LEFT).quad_data[7], ql8 = (LEFT).quad_data[8];                      \
    const v128_t qri0 = (RIGHT).quad_data[0], qri1 = (RIGHT).quad_data[1], qri2 = (RIGHT).quad_data[2],                \
                 qri3 = (RIGHT).quad_data[3], qri4 = (RIGHT).quad_data[4], qri5 = (RIGHT).quad_data[5],                \
                 qri6 = (RIGHT).quad_data[6], qri7 = (RIGHT).quad_data[7], qri8 = (RIGHT).quad_data[8]
// clang-format on

// Body of Stages 6..10. Takes 17 `temp_m` accumulators (scalar + tlo + thi) by
// named local reference, runs 8 Yuval reductions, 1 wasm_reduce, carry
// propagation, and stores into `result`. Shared between operator* and
// dot_product<K>. The Yuval barriers / asm "+r" barriers on km_q and r_inv_*
// are load-bearing: they force LLVM to emit fast extmul_low/high_u32x4
// (pmuludq) instead of slow i64x2.mul. See BB_VF_DP_YUVAL below.
// clang-format off
#define BB_VF_RUN_STAGES_6_THROUGH_10()                                                                                \
    do {                                                                                                               \
        constexpr uint64_t MASK29 = 0x1fffffffULL;                                                                     \
        const v128_t mask29_i32x4 = wasm_i32x4_splat(0x1fffffff);                                                      \
                                                                                                                       \
        v128_t r_inv0 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[0]));                                         \
        v128_t r_inv1 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[1]));                                         \
        v128_t r_inv2 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[2]));                                         \
        v128_t r_inv3 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[3]));                                         \
        v128_t r_inv4 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[4]));                                         \
        v128_t r_inv5 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[5]));                                         \
        v128_t r_inv6 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[6]));                                         \
        v128_t r_inv7 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[7]));                                         \
        v128_t r_inv8 = wasm_i32x4_splat(static_cast<int32_t>(R_INV_WASM[8]));                                         \
        asm volatile("" : "+r"(r_inv0), "+r"(r_inv1), "+r"(r_inv2), "+r"(r_inv3), "+r"(r_inv4));                       \
        asm volatile("" : "+r"(r_inv5), "+r"(r_inv6), "+r"(r_inv7), "+r"(r_inv8));                                     \
                                                                                                                       \
        BB_VF_DP_YUVAL(0, 1, 2, 3, 4, 5, 6, 7, 8, 9)                                                                   \
        BB_VF_DP_YUVAL(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)                                                                  \
        BB_VF_DP_YUVAL(2, 3, 4, 5, 6, 7, 8, 9, 10, 11)                                                                 \
        BB_VF_DP_YUVAL(3, 4, 5, 6, 7, 8, 9, 10, 11, 12)                                                                \
        BB_VF_DP_YUVAL(4, 5, 6, 7, 8, 9, 10, 11, 12, 13)                                                               \
        BB_VF_DP_YUVAL(5, 6, 7, 8, 9, 10, 11, 12, 13, 14)                                                              \
        BB_VF_DP_YUVAL(6, 7, 8, 9, 10, 11, 12, 13, 14, 15)                                                             \
        BB_VF_DP_YUVAL(7, 8, 9, 10, 11, 12, 13, 14, 15, 16)                                                            \
                                                                                                                       \
        {                                                                                                              \
            const uint64_t rk_s = (temp_8 * R_INV_MOD_2_29) & MASK29;                                                  \
            const v128_t rinv_splat = wasm_i32x4_splat(static_cast<int32_t>(R_INV_MOD_2_29));                          \
            const v128_t t8_i32x4 =                                                                                    \
                wasm_i8x16_shuffle(tlo_8, thi_8, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);            \
            const v128_t rk_q = wasm_v128_and(wasm_i32x4_mul(t8_i32x4, rinv_splat), mask29_i32x4);                     \
                                                                                                                       \
            v128_t p0_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[0]));                                       \
            v128_t p1_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[1]));                                       \
            v128_t p2_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[2]));                                       \
            v128_t p3_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[3]));                                       \
            v128_t p4_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[4]));                                       \
            v128_t p5_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[5]));                                       \
            v128_t p6_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[6]));                                       \
            v128_t p7_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[7]));                                       \
            v128_t p8_splat = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[8]));                                       \
            asm volatile("" : "+r"(p0_splat), "+r"(p1_splat), "+r"(p2_splat), "+r"(p3_splat), "+r"(p4_splat));         \
            asm volatile("" : "+r"(p5_splat), "+r"(p6_splat), "+r"(p7_splat), "+r"(p8_splat));                         \
                                                                                                                       \
            temp_8 += rk_s * P_WASM[0];                                                                                \
            tlo_8 = wasm_i64x2_add(tlo_8, wasm_u64x2_extmul_low_u32x4(rk_q, p0_splat));                                \
            thi_8 = wasm_i64x2_add(thi_8, wasm_u64x2_extmul_high_u32x4(rk_q, p0_splat));                               \
            vector_field_detail::bb_vf_barrier_sqq(temp_8, tlo_8, thi_8);                                                                   \
                                                                                                                       \
            temp_9 += rk_s * P_WASM[1] + (temp_8 >> 29);                                                               \
            tlo_9 = wasm_i64x2_add(wasm_i64x2_add(tlo_9, wasm_u64x2_extmul_low_u32x4(rk_q, p1_splat)),                 \
                                   wasm_u64x2_shr(tlo_8, 29));                                                         \
            thi_9 = wasm_i64x2_add(wasm_i64x2_add(thi_9, wasm_u64x2_extmul_high_u32x4(rk_q, p1_splat)),                \
                                   wasm_u64x2_shr(thi_8, 29));                                                         \
            vector_field_detail::bb_vf_barrier_sqq(temp_9, tlo_9, thi_9);                                                                   \
                                                                                                                       \
            temp_10 += rk_s * P_WASM[2];                                                                               \
            tlo_10 = wasm_i64x2_add(tlo_10, wasm_u64x2_extmul_low_u32x4(rk_q, p2_splat));                              \
            thi_10 = wasm_i64x2_add(thi_10, wasm_u64x2_extmul_high_u32x4(rk_q, p2_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_10, tlo_10, thi_10);                                                                \
                                                                                                                       \
            temp_11 += rk_s * P_WASM[3];                                                                               \
            tlo_11 = wasm_i64x2_add(tlo_11, wasm_u64x2_extmul_low_u32x4(rk_q, p3_splat));                              \
            thi_11 = wasm_i64x2_add(thi_11, wasm_u64x2_extmul_high_u32x4(rk_q, p3_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_11, tlo_11, thi_11);                                                                \
                                                                                                                       \
            temp_12 += rk_s * P_WASM[4];                                                                               \
            tlo_12 = wasm_i64x2_add(tlo_12, wasm_u64x2_extmul_low_u32x4(rk_q, p4_splat));                              \
            thi_12 = wasm_i64x2_add(thi_12, wasm_u64x2_extmul_high_u32x4(rk_q, p4_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_12, tlo_12, thi_12);                                                                \
                                                                                                                       \
            temp_13 += rk_s * P_WASM[5];                                                                               \
            tlo_13 = wasm_i64x2_add(tlo_13, wasm_u64x2_extmul_low_u32x4(rk_q, p5_splat));                              \
            thi_13 = wasm_i64x2_add(thi_13, wasm_u64x2_extmul_high_u32x4(rk_q, p5_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_13, tlo_13, thi_13);                                                                \
                                                                                                                       \
            temp_14 += rk_s * P_WASM[6];                                                                               \
            tlo_14 = wasm_i64x2_add(tlo_14, wasm_u64x2_extmul_low_u32x4(rk_q, p6_splat));                              \
            thi_14 = wasm_i64x2_add(thi_14, wasm_u64x2_extmul_high_u32x4(rk_q, p6_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_14, tlo_14, thi_14);                                                                \
                                                                                                                       \
            temp_15 += rk_s * P_WASM[7];                                                                               \
            tlo_15 = wasm_i64x2_add(tlo_15, wasm_u64x2_extmul_low_u32x4(rk_q, p7_splat));                              \
            thi_15 = wasm_i64x2_add(thi_15, wasm_u64x2_extmul_high_u32x4(rk_q, p7_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_15, tlo_15, thi_15);                                                                \
                                                                                                                       \
            temp_16 += rk_s * P_WASM[8];                                                                               \
            tlo_16 = wasm_i64x2_add(tlo_16, wasm_u64x2_extmul_low_u32x4(rk_q, p8_splat));                              \
            thi_16 = wasm_i64x2_add(thi_16, wasm_u64x2_extmul_high_u32x4(rk_q, p8_splat));                             \
            vector_field_detail::bb_vf_barrier_sqq(temp_16, tlo_16, thi_16);                                                                \
        }                                                                                                              \
                                                                                                                       \
        temp_10 += temp_9 >> 29;                                                                                       \
        tlo_10 = wasm_i64x2_add(tlo_10, wasm_u64x2_shr(tlo_9, 29));                                                    \
        thi_10 = wasm_i64x2_add(thi_10, wasm_u64x2_shr(thi_9, 29));                                                    \
        temp_11 += temp_10 >> 29;                                                                                      \
        tlo_11 = wasm_i64x2_add(tlo_11, wasm_u64x2_shr(tlo_10, 29));                                                   \
        thi_11 = wasm_i64x2_add(thi_11, wasm_u64x2_shr(thi_10, 29));                                                   \
        temp_12 += temp_11 >> 29;                                                                                      \
        tlo_12 = wasm_i64x2_add(tlo_12, wasm_u64x2_shr(tlo_11, 29));                                                   \
        thi_12 = wasm_i64x2_add(thi_12, wasm_u64x2_shr(thi_11, 29));                                                   \
        temp_13 += temp_12 >> 29;                                                                                      \
        tlo_13 = wasm_i64x2_add(tlo_13, wasm_u64x2_shr(tlo_12, 29));                                                   \
        thi_13 = wasm_i64x2_add(thi_13, wasm_u64x2_shr(thi_12, 29));                                                   \
        temp_14 += temp_13 >> 29;                                                                                      \
        tlo_14 = wasm_i64x2_add(tlo_14, wasm_u64x2_shr(tlo_13, 29));                                                   \
        thi_14 = wasm_i64x2_add(thi_14, wasm_u64x2_shr(thi_13, 29));                                                   \
        temp_15 += temp_14 >> 29;                                                                                      \
        tlo_15 = wasm_i64x2_add(tlo_15, wasm_u64x2_shr(tlo_14, 29));                                                   \
        thi_15 = wasm_i64x2_add(thi_15, wasm_u64x2_shr(thi_14, 29));                                                   \
        temp_16 += temp_15 >> 29;                                                                                      \
        tlo_16 = wasm_i64x2_add(tlo_16, wasm_u64x2_shr(tlo_15, 29));                                                   \
        thi_16 = wasm_i64x2_add(thi_16, wasm_u64x2_shr(thi_15, 29));                                                   \
                                                                                                                       \
        const uint64_t temp_17 = temp_16 >> 29;                                                                        \
        const v128_t tlo_17 = wasm_u64x2_shr(tlo_16, 29);                                                              \
        const v128_t thi_17 = wasm_u64x2_shr(thi_16, 29);                                                              \
                                                                                                                       \
        result.scalar_data[0] = static_cast<uint32_t>(temp_9) & static_cast<uint32_t>(MASK29);                         \
        result.quad_data[0] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_9, thi_9, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27), mask29_i32x4); \
        result.scalar_data[1] = static_cast<uint32_t>(temp_10) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[1] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_10, thi_10, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[2] = static_cast<uint32_t>(temp_11) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[2] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_11, thi_11, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[3] = static_cast<uint32_t>(temp_12) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[3] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_12, thi_12, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[4] = static_cast<uint32_t>(temp_13) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[4] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_13, thi_13, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[5] = static_cast<uint32_t>(temp_14) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[5] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_14, thi_14, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[6] = static_cast<uint32_t>(temp_15) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[6] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_15, thi_15, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[7] = static_cast<uint32_t>(temp_16) & static_cast<uint32_t>(MASK29);                        \
        result.quad_data[7] = wasm_v128_and(                                                                           \
            wasm_i8x16_shuffle(tlo_16, thi_16, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27),              \
            mask29_i32x4);                                                                                             \
        result.scalar_data[8] = static_cast<uint32_t>(temp_17);                                                        \
        result.quad_data[8] =                                                                                          \
            wasm_i8x16_shuffle(tlo_17, thi_17, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);              \
    } while (0)

// Single Yuval reduction step. `lo`, `p1..p9` are the temp/tlo/thi indices.
// `p1 == lo+1`, ..., `p9 == lo+9`, passed explicitly so the macro token-pastes
// cleanly. km_q must be kept as i32x4: without the asm "+r"(km_q) barriers
// between the 9 multiplier uses, LLVM pre-extends km_q once to i64x2 and emits
// 9x slow i64x2.mul instead of 9x fast extmul_low/high_u32x4 (pmuludq).
#define BB_VF_DP_YUVAL(lo, p1, p2, p3, p4, p5, p6, p7, p8, p9)                                                         \
    {                                                                                                                  \
        const uint64_t km_s = temp_##lo & MASK29;                                                                      \
        const uint64_t carry_s = temp_##lo >> 29;                                                                      \
        v128_t km_q_raw =                                                                                              \
            wasm_i8x16_shuffle(tlo_##lo, thi_##lo, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);          \
        v128_t km_q = wasm_v128_and(km_q_raw, mask29_i32x4);                                                           \
        v128_t carry_q_lo = wasm_u64x2_shr(tlo_##lo, 29);                                                              \
        v128_t carry_q_hi = wasm_u64x2_shr(thi_##lo, 29);                                                              \
        temp_##p1 += km_s * R_INV_WASM[0] + carry_s;                                                                   \
        tlo_##p1 = wasm_i64x2_add(wasm_i64x2_add(tlo_##p1, wasm_u64x2_extmul_low_u32x4(km_q, r_inv0)), carry_q_lo);    \
        thi_##p1 = wasm_i64x2_add(wasm_i64x2_add(thi_##p1, wasm_u64x2_extmul_high_u32x4(km_q, r_inv0)), carry_q_hi);   \
        vector_field_detail::bb_vf_barrier_sqq(temp_##p1, tlo_##p1, thi_##p1);                                                              \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p2 += km_s * R_INV_WASM[1];                                                                             \
        tlo_##p2 = wasm_i64x2_add(tlo_##p2, wasm_u64x2_extmul_low_u32x4(km_q, r_inv1));                                \
        thi_##p2 = wasm_i64x2_add(thi_##p2, wasm_u64x2_extmul_high_u32x4(km_q, r_inv1));                               \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p3 += km_s * R_INV_WASM[2];                                                                             \
        tlo_##p3 = wasm_i64x2_add(tlo_##p3, wasm_u64x2_extmul_low_u32x4(km_q, r_inv2));                                \
        thi_##p3 = wasm_i64x2_add(thi_##p3, wasm_u64x2_extmul_high_u32x4(km_q, r_inv2));                               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##p3, tlo_##p3, thi_##p3);                                                              \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p4 += km_s * R_INV_WASM[3];                                                                             \
        tlo_##p4 = wasm_i64x2_add(tlo_##p4, wasm_u64x2_extmul_low_u32x4(km_q, r_inv3));                                \
        thi_##p4 = wasm_i64x2_add(thi_##p4, wasm_u64x2_extmul_high_u32x4(km_q, r_inv3));                               \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p5 += km_s * R_INV_WASM[4];                                                                             \
        tlo_##p5 = wasm_i64x2_add(tlo_##p5, wasm_u64x2_extmul_low_u32x4(km_q, r_inv4));                                \
        thi_##p5 = wasm_i64x2_add(thi_##p5, wasm_u64x2_extmul_high_u32x4(km_q, r_inv4));                               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##p5, tlo_##p5, thi_##p5);                                                              \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p6 += km_s * R_INV_WASM[5];                                                                             \
        tlo_##p6 = wasm_i64x2_add(tlo_##p6, wasm_u64x2_extmul_low_u32x4(km_q, r_inv5));                                \
        thi_##p6 = wasm_i64x2_add(thi_##p6, wasm_u64x2_extmul_high_u32x4(km_q, r_inv5));                               \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p7 += km_s * R_INV_WASM[6];                                                                             \
        tlo_##p7 = wasm_i64x2_add(tlo_##p7, wasm_u64x2_extmul_low_u32x4(km_q, r_inv6));                                \
        thi_##p7 = wasm_i64x2_add(thi_##p7, wasm_u64x2_extmul_high_u32x4(km_q, r_inv6));                               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##p7, tlo_##p7, thi_##p7);                                                              \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p8 += km_s * R_INV_WASM[7];                                                                             \
        tlo_##p8 = wasm_i64x2_add(tlo_##p8, wasm_u64x2_extmul_low_u32x4(km_q, r_inv7));                                \
        thi_##p8 = wasm_i64x2_add(thi_##p8, wasm_u64x2_extmul_high_u32x4(km_q, r_inv7));                               \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##p9 += km_s * R_INV_WASM[8];                                                                             \
        tlo_##p9 = wasm_i64x2_add(tlo_##p9, wasm_u64x2_extmul_low_u32x4(km_q, r_inv8));                                \
        thi_##p9 = wasm_i64x2_add(thi_##p9, wasm_u64x2_extmul_high_u32x4(km_q, r_inv8));                               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##p9, tlo_##p9, thi_##p9);                                                              \
    }
// clang-format on
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::operator*(const VectorField<Bn254FrParams>& other) const noexcept
{
    VectorField result;

    BB_VF_LOAD_LIMBS(*this, other);
    BB_VF_KARATSUBA_STAGES_1_4();

    // ============================================================
    // Stage 5: Combine into temp_0..temp_16.
    //   temp[k]         = pl[k]                       for k in 0..4
    //   temp[k]         = pl[k] + (pc[k-5] - pl[k-5] - ph[k-5])  for k in 5..8
    //   temp[9]         = pc[4] - pl[4] - ph[4]
    //   temp[k]         = (pc[k-5] - pl[k-5]) - ph[k-5] + ph[k-10]  for k in 10..13
    //                     (ph[k-5] only defined for k-5 <= 6 i.e. k <= 11; k=12,13 omit)
    //   temp[k]         = ph[k-10]                    for k in 14..16
    // Scalar math uses uint64_t subtraction (wrap); quad math uses i64x2 sub.
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

    uint64_t temp_9 = pc4 - pl4 - ph4;
    v128_t tlo_9 = wasm_i64x2_sub(wasm_i64x2_sub(pc4_lo, pl4_lo), ph4_lo);
    v128_t thi_9 = wasm_i64x2_sub(wasm_i64x2_sub(pc4_hi, pl4_hi), ph4_hi);

    uint64_t temp_10 = (pc5 - pl5 - ph5) + ph0;
    v128_t tlo_10 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_lo, pl5_lo), ph5_lo), ph0_lo);
    v128_t thi_10 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_hi, pl5_hi), ph5_hi), ph0_hi);
    uint64_t temp_11 = (pc6 - pl6 - ph6) + ph1;
    v128_t tlo_11 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_lo, pl6_lo), ph6_lo), ph1_lo);
    v128_t thi_11 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_hi, pl6_hi), ph6_hi), ph1_hi);
    uint64_t temp_12 = (pc7 - pl7) + ph2;
    v128_t tlo_12 = wasm_i64x2_add(wasm_i64x2_sub(pc7_lo, pl7_lo), ph2_lo);
    v128_t thi_12 = wasm_i64x2_add(wasm_i64x2_sub(pc7_hi, pl7_hi), ph2_hi);
    uint64_t temp_13 = (pc8 - pl8) + ph3;
    v128_t tlo_13 = wasm_i64x2_add(wasm_i64x2_sub(pc8_lo, pl8_lo), ph3_lo);
    v128_t thi_13 = wasm_i64x2_add(wasm_i64x2_sub(pc8_hi, pl8_hi), ph3_hi);

    uint64_t temp_14 = ph4;
    v128_t tlo_14 = ph4_lo;
    v128_t thi_14 = ph4_hi;
    uint64_t temp_15 = ph5;
    v128_t tlo_15 = ph5_lo;
    v128_t thi_15 = ph5_hi;
    uint64_t temp_16 = ph6;
    v128_t tlo_16 = ph6_lo;
    v128_t thi_16 = ph6_hi;

    // ============================================================
    // Stage 6: 8 x Yuval reductions.
    // Stage 7: 1 x wasm_reduce on (temp_8..temp_16).
    // Stage 8: Carry propagation temp_9..temp_16, out to temp_17.
    // Stage 9/10: Store output (no conditional subtract needed — Karatsuba+Yuval
    // result is already in [0, p]; scalar/quad AND with mask29 strips deferred
    // Stage 8 carry bits. See field_impl_generic.hpp line 863 and Stage 8/9
    // comments in BB_VF_RUN_STAGES_6_THROUGH_10 below.
    // ============================================================
    BB_VF_RUN_STAGES_6_THROUGH_10();
    return result;
}

// =====================================================================
// dot_product<K> specializations (K in {1..6}) for Bn254FrParams.
//
// Structure:
//   Stage 1..5 per pair: compute 17 `temp_m` accumulators (scalar + tlo + thi).
//   Running-sum accumulation: after each pair's Stage 5, ADD its temp_m's
//     into a running `sum_temp_m` accumulator.
//   Stage 6..10 ONCE on sum_temp: 8 Yuval reductions, 1 wasm_reduce, carry
//     propagation, store.
//
// This saves (K-1) sets of Stage 6..10 relative to calling operator* K times
// and adding the results. Stage 6..10 is ~40% of operator*, so the theoretical
// win per-multiply is ~ (K - 1) / K * 40% (e.g. ~20% for K=2, ~27% for K=3).
//
// Magnitude bounds: see the K_max analysis in the header. For Bn254Fr,
// sum_temp_8 after all 8 Yuvals is at most (9K + 8) * (2^29 - 1)^2. For
// K in {2, 3, 4, 5, 6} this is at most 62 * (2^29-1)^2 < 2^63.95, safely
// in u64 / i64x2.
// =====================================================================

namespace vector_field_detail {

// Holds the 17 `temp_m` accumulators produced by Karatsuba Stages 1..5 for one
// (left, right) pair, scalar and paired-i64x2 quad streams alongside.
struct KaratsubaPartials {
    uint64_t t[17];
    v128_t tlo[17];
    v128_t thi[17];
};

// Stage 1..5 of the Mont-mul kernel. always_inline: caller (dot_product<K>)
// wants this body's code stamped out in-place K times so LLVM can SSA the
// outputs into register locals (vs spilling the returned KaratsubaPartials
// struct to stack).
[[gnu::always_inline]] static inline KaratsubaPartials karatsuba_stage_1_5_bn254fr(
    const VectorField<Bn254FrParams>& left, const VectorField<Bn254FrParams>& right) noexcept
{
    BB_VF_LOAD_LIMBS(left, right);
    BB_VF_KARATSUBA_STAGES_1_4();

    // Stage 5: combine pl/ph/pc into 17 KaratsubaPartials entries.
    KaratsubaPartials out;
    out.t[0] = pl0;
    out.tlo[0] = pl0_lo;
    out.thi[0] = pl0_hi;
    out.t[1] = pl1;
    out.tlo[1] = pl1_lo;
    out.thi[1] = pl1_hi;
    out.t[2] = pl2;
    out.tlo[2] = pl2_lo;
    out.thi[2] = pl2_hi;
    out.t[3] = pl3;
    out.tlo[3] = pl3_lo;
    out.thi[3] = pl3_hi;
    out.t[4] = pl4;
    out.tlo[4] = pl4_lo;
    out.thi[4] = pl4_hi;

    out.t[5] = pl5 + (pc0 - pl0 - ph0);
    out.tlo[5] = wasm_i64x2_add(pl5_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc0_lo, pl0_lo), ph0_lo));
    out.thi[5] = wasm_i64x2_add(pl5_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc0_hi, pl0_hi), ph0_hi));
    out.t[6] = pl6 + (pc1 - pl1 - ph1);
    out.tlo[6] = wasm_i64x2_add(pl6_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc1_lo, pl1_lo), ph1_lo));
    out.thi[6] = wasm_i64x2_add(pl6_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc1_hi, pl1_hi), ph1_hi));
    out.t[7] = pl7 + (pc2 - pl2 - ph2);
    out.tlo[7] = wasm_i64x2_add(pl7_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc2_lo, pl2_lo), ph2_lo));
    out.thi[7] = wasm_i64x2_add(pl7_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc2_hi, pl2_hi), ph2_hi));
    out.t[8] = pl8 + (pc3 - pl3 - ph3);
    out.tlo[8] = wasm_i64x2_add(pl8_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc3_lo, pl3_lo), ph3_lo));
    out.thi[8] = wasm_i64x2_add(pl8_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc3_hi, pl3_hi), ph3_hi));

    out.t[9] = pc4 - pl4 - ph4;
    out.tlo[9] = wasm_i64x2_sub(wasm_i64x2_sub(pc4_lo, pl4_lo), ph4_lo);
    out.thi[9] = wasm_i64x2_sub(wasm_i64x2_sub(pc4_hi, pl4_hi), ph4_hi);

    out.t[10] = (pc5 - pl5 - ph5) + ph0;
    out.tlo[10] = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_lo, pl5_lo), ph5_lo), ph0_lo);
    out.thi[10] = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_hi, pl5_hi), ph5_hi), ph0_hi);
    out.t[11] = (pc6 - pl6 - ph6) + ph1;
    out.tlo[11] = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_lo, pl6_lo), ph6_lo), ph1_lo);
    out.thi[11] = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_hi, pl6_hi), ph6_hi), ph1_hi);
    out.t[12] = (pc7 - pl7) + ph2;
    out.tlo[12] = wasm_i64x2_add(wasm_i64x2_sub(pc7_lo, pl7_lo), ph2_lo);
    out.thi[12] = wasm_i64x2_add(wasm_i64x2_sub(pc7_hi, pl7_hi), ph2_hi);
    out.t[13] = (pc8 - pl8) + ph3;
    out.tlo[13] = wasm_i64x2_add(wasm_i64x2_sub(pc8_lo, pl8_lo), ph3_lo);
    out.thi[13] = wasm_i64x2_add(wasm_i64x2_sub(pc8_hi, pl8_hi), ph3_hi);

    out.t[14] = ph4;
    out.tlo[14] = ph4_lo;
    out.thi[14] = ph4_hi;
    out.t[15] = ph5;
    out.tlo[15] = ph5_lo;
    out.thi[15] = ph5_hi;
    out.t[16] = ph6;
    out.tlo[16] = ph6_lo;
    out.thi[16] = ph6_hi;

    return out;
}

// In-place accumulate variant of karatsuba_stage_1_5_bn254fr: same 17 Stage-5
// expressions, but `temp[m] += ...` (and paired tlo/thi i64x2 adds). This lets
// each intermediate pl/ph/pc be issued and consumed immediately into the
// accumulator, rather than all 66 partial-products surviving past Stage 5 into
// a returned 51-value aggregate. The reduction in live-range is what lets
// K=3..6 avoid V8's i64x2 regpool spill.
[[gnu::always_inline]] static inline void karatsuba_stage_1_5_bn254fr_accumulate(
    const VectorField<Bn254FrParams>& left,
    const VectorField<Bn254FrParams>& right,
    uint64_t (&temp)[17],
    v128_t (&tlo)[17],
    v128_t (&thi)[17]) noexcept
{
    BB_VF_LOAD_LIMBS(left, right);
    BB_VF_KARATSUBA_STAGES_1_4();

    // Stage 5, in-place accumulate.
    temp[0] += pl0;
    tlo[0] = wasm_i64x2_add(tlo[0], pl0_lo);
    thi[0] = wasm_i64x2_add(thi[0], pl0_hi);
    temp[1] += pl1;
    tlo[1] = wasm_i64x2_add(tlo[1], pl1_lo);
    thi[1] = wasm_i64x2_add(thi[1], pl1_hi);
    temp[2] += pl2;
    tlo[2] = wasm_i64x2_add(tlo[2], pl2_lo);
    thi[2] = wasm_i64x2_add(thi[2], pl2_hi);
    temp[3] += pl3;
    tlo[3] = wasm_i64x2_add(tlo[3], pl3_lo);
    thi[3] = wasm_i64x2_add(thi[3], pl3_hi);
    temp[4] += pl4;
    tlo[4] = wasm_i64x2_add(tlo[4], pl4_lo);
    thi[4] = wasm_i64x2_add(thi[4], pl4_hi);

    temp[5] += pl5 + (pc0 - pl0 - ph0);
    tlo[5] = wasm_i64x2_add(tlo[5], wasm_i64x2_add(pl5_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc0_lo, pl0_lo), ph0_lo)));
    thi[5] = wasm_i64x2_add(thi[5], wasm_i64x2_add(pl5_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc0_hi, pl0_hi), ph0_hi)));
    temp[6] += pl6 + (pc1 - pl1 - ph1);
    tlo[6] = wasm_i64x2_add(tlo[6], wasm_i64x2_add(pl6_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc1_lo, pl1_lo), ph1_lo)));
    thi[6] = wasm_i64x2_add(thi[6], wasm_i64x2_add(pl6_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc1_hi, pl1_hi), ph1_hi)));
    temp[7] += pl7 + (pc2 - pl2 - ph2);
    tlo[7] = wasm_i64x2_add(tlo[7], wasm_i64x2_add(pl7_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc2_lo, pl2_lo), ph2_lo)));
    thi[7] = wasm_i64x2_add(thi[7], wasm_i64x2_add(pl7_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc2_hi, pl2_hi), ph2_hi)));
    temp[8] += pl8 + (pc3 - pl3 - ph3);
    tlo[8] = wasm_i64x2_add(tlo[8], wasm_i64x2_add(pl8_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc3_lo, pl3_lo), ph3_lo)));
    thi[8] = wasm_i64x2_add(thi[8], wasm_i64x2_add(pl8_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc3_hi, pl3_hi), ph3_hi)));

    temp[9] += pc4 - pl4 - ph4;
    tlo[9] = wasm_i64x2_add(tlo[9], wasm_i64x2_sub(wasm_i64x2_sub(pc4_lo, pl4_lo), ph4_lo));
    thi[9] = wasm_i64x2_add(thi[9], wasm_i64x2_sub(wasm_i64x2_sub(pc4_hi, pl4_hi), ph4_hi));

    temp[10] += (pc5 - pl5 - ph5) + ph0;
    tlo[10] = wasm_i64x2_add(tlo[10], wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_lo, pl5_lo), ph5_lo), ph0_lo));
    thi[10] = wasm_i64x2_add(thi[10], wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_hi, pl5_hi), ph5_hi), ph0_hi));
    temp[11] += (pc6 - pl6 - ph6) + ph1;
    tlo[11] = wasm_i64x2_add(tlo[11], wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_lo, pl6_lo), ph6_lo), ph1_lo));
    thi[11] = wasm_i64x2_add(thi[11], wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_hi, pl6_hi), ph6_hi), ph1_hi));
    temp[12] += (pc7 - pl7) + ph2;
    tlo[12] = wasm_i64x2_add(tlo[12], wasm_i64x2_add(wasm_i64x2_sub(pc7_lo, pl7_lo), ph2_lo));
    thi[12] = wasm_i64x2_add(thi[12], wasm_i64x2_add(wasm_i64x2_sub(pc7_hi, pl7_hi), ph2_hi));
    temp[13] += (pc8 - pl8) + ph3;
    tlo[13] = wasm_i64x2_add(tlo[13], wasm_i64x2_add(wasm_i64x2_sub(pc8_lo, pl8_lo), ph3_lo));
    thi[13] = wasm_i64x2_add(thi[13], wasm_i64x2_add(wasm_i64x2_sub(pc8_hi, pl8_hi), ph3_hi));

    temp[14] += ph4;
    tlo[14] = wasm_i64x2_add(tlo[14], ph4_lo);
    thi[14] = wasm_i64x2_add(thi[14], ph4_hi);
    temp[15] += ph5;
    tlo[15] = wasm_i64x2_add(tlo[15], ph5_lo);
    thi[15] = wasm_i64x2_add(thi[15], ph5_hi);
    temp[16] += ph6;
    tlo[16] = wasm_i64x2_add(tlo[16], ph6_lo);
    thi[16] = wasm_i64x2_add(thi[16], ph6_hi);
}

} // namespace vector_field_detail

// --------------- dot_product<K=1> (trivially delegates to operator*) ---------------
template <>
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::dot_product<1>(
    const std::array<std::pair<VectorField<Bn254FrParams>, VectorField<Bn254FrParams>>, 1>& pairs) noexcept
{
    return pairs[0].first * pairs[0].second;
}

// Macro: seed the 17 sum_temp accumulator arrays from pair 0's Stage 1..5
// output. Writes into the caller's local `uint64_t temp[17]`, `v128_t tlo[17]`,
// `v128_t thi[17]`.
#define BB_VF_DP_SEED_FROM_PAIR0(PAIR_LEFT, PAIR_RIGHT)                                                                \
    do {                                                                                                               \
        const KaratsubaPartials _p0_partials = karatsuba_stage_1_5_bn254fr((PAIR_LEFT), (PAIR_RIGHT));                 \
        for (int _i = 0; _i < 17; ++_i) {                                                                              \
            temp[_i] = _p0_partials.t[_i];                                                                             \
            tlo[_i] = _p0_partials.tlo[_i];                                                                            \
            thi[_i] = _p0_partials.thi[_i];                                                                            \
        }                                                                                                              \
    } while (0)

// Copy 17-element array accumulators into named locals temp_0..temp_16 (and
// similarly tlo_m, thi_m) before invoking BB_VF_RUN_STAGES_6_THROUGH_10, which
// references those named locals via token-pasting. Copy is free in SSA.
#define BB_VF_DP_LOAD_NAMED_FROM_ARRAYS()                                                                              \
    uint64_t temp_0 = temp[0], temp_1 = temp[1], temp_2 = temp[2], temp_3 = temp[3], temp_4 = temp[4],                 \
             temp_5 = temp[5], temp_6 = temp[6], temp_7 = temp[7], temp_8 = temp[8], temp_9 = temp[9],                 \
             temp_10 = temp[10], temp_11 = temp[11], temp_12 = temp[12], temp_13 = temp[13], temp_14 = temp[14],       \
             temp_15 = temp[15], temp_16 = temp[16];                                                                   \
    v128_t tlo_0 = tlo[0], tlo_1 = tlo[1], tlo_2 = tlo[2], tlo_3 = tlo[3], tlo_4 = tlo[4], tlo_5 = tlo[5],             \
           tlo_6 = tlo[6], tlo_7 = tlo[7], tlo_8 = tlo[8], tlo_9 = tlo[9], tlo_10 = tlo[10], tlo_11 = tlo[11],         \
           tlo_12 = tlo[12], tlo_13 = tlo[13], tlo_14 = tlo[14], tlo_15 = tlo[15], tlo_16 = tlo[16];                   \
    v128_t thi_0 = thi[0], thi_1 = thi[1], thi_2 = thi[2], thi_3 = thi[3], thi_4 = thi[4], thi_5 = thi[5],             \
           thi_6 = thi[6], thi_7 = thi[7], thi_8 = thi[8], thi_9 = thi[9], thi_10 = thi[10], thi_11 = thi[11],         \
           thi_12 = thi[12], thi_13 = thi[13], thi_14 = thi[14], thi_15 = thi[15], thi_16 = thi[16]

// --------------- dot_product<K=2> ---------------
template <>
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::dot_product<2>(
    const std::array<std::pair<VectorField<Bn254FrParams>, VectorField<Bn254FrParams>>, 2>& pairs) noexcept
{
    using namespace vector_field_detail;
    VectorField result;

    uint64_t temp[17];
    v128_t tlo[17];
    v128_t thi[17];
    BB_VF_DP_SEED_FROM_PAIR0(pairs[0].first, pairs[0].second);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[1].first, pairs[1].second, temp, tlo, thi);

    BB_VF_DP_LOAD_NAMED_FROM_ARRAYS();
    BB_VF_RUN_STAGES_6_THROUGH_10();
    return result;
}

// --------------- dot_product<K=3> ---------------
template <>
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::dot_product<3>(
    const std::array<std::pair<VectorField<Bn254FrParams>, VectorField<Bn254FrParams>>, 3>& pairs) noexcept
{
    using namespace vector_field_detail;
    VectorField result;

    uint64_t temp[17];
    v128_t tlo[17];
    v128_t thi[17];
    BB_VF_DP_SEED_FROM_PAIR0(pairs[0].first, pairs[0].second);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[1].first, pairs[1].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[2].first, pairs[2].second, temp, tlo, thi);

    BB_VF_DP_LOAD_NAMED_FROM_ARRAYS();
    BB_VF_RUN_STAGES_6_THROUGH_10();
    return result;
}

// --------------- dot_product<K=4> ---------------
template <>
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::dot_product<4>(
    const std::array<std::pair<VectorField<Bn254FrParams>, VectorField<Bn254FrParams>>, 4>& pairs) noexcept
{
    using namespace vector_field_detail;
    VectorField result;

    uint64_t temp[17];
    v128_t tlo[17];
    v128_t thi[17];
    BB_VF_DP_SEED_FROM_PAIR0(pairs[0].first, pairs[0].second);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[1].first, pairs[1].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[2].first, pairs[2].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[3].first, pairs[3].second, temp, tlo, thi);

    BB_VF_DP_LOAD_NAMED_FROM_ARRAYS();
    BB_VF_RUN_STAGES_6_THROUGH_10();
    return result;
}

// --------------- dot_product<K=5> ---------------
template <>
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::dot_product<5>(
    const std::array<std::pair<VectorField<Bn254FrParams>, VectorField<Bn254FrParams>>, 5>& pairs) noexcept
{
    using namespace vector_field_detail;
    VectorField result;

    uint64_t temp[17];
    v128_t tlo[17];
    v128_t thi[17];
    BB_VF_DP_SEED_FROM_PAIR0(pairs[0].first, pairs[0].second);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[1].first, pairs[1].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[2].first, pairs[2].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[3].first, pairs[3].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[4].first, pairs[4].second, temp, tlo, thi);

    BB_VF_DP_LOAD_NAMED_FROM_ARRAYS();
    BB_VF_RUN_STAGES_6_THROUGH_10();
    return result;
}

// --------------- dot_product<K=6> ---------------
template <>
template <>
VectorField<Bn254FrParams> VectorField<Bn254FrParams>::dot_product<6>(
    const std::array<std::pair<VectorField<Bn254FrParams>, VectorField<Bn254FrParams>>, 6>& pairs) noexcept
{
    using namespace vector_field_detail;
    VectorField result;

    uint64_t temp[17];
    v128_t tlo[17];
    v128_t thi[17];
    BB_VF_DP_SEED_FROM_PAIR0(pairs[0].first, pairs[0].second);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[1].first, pairs[1].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[2].first, pairs[2].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[3].first, pairs[3].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[4].first, pairs[4].second, temp, tlo, thi);
    karatsuba_stage_1_5_bn254fr_accumulate(pairs[5].first, pairs[5].second, temp, tlo, thi);

    BB_VF_DP_LOAD_NAMED_FROM_ARRAYS();
    BB_VF_RUN_STAGES_6_THROUGH_10();
    return result;
}

#undef BB_VF_RUN_STAGES_6_THROUGH_10
#undef BB_VF_DP_YUVAL
#undef BB_VF_DP_SEED_FROM_PAIR0
#undef BB_VF_DP_LOAD_NAMED_FROM_ARRAYS
#undef BB_VF_KARATSUBA_STAGES_1_4
#undef BB_VF_LOAD_LIMBS

} // namespace bb

#endif // __wasm_simd128__
