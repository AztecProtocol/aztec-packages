// SIMD-paired Montgomery multiplication for BN254 Fq, mirroring the
// existing scalar 9x29 + Karatsuba + Yuval algorithm in
// `field_impl_generic.hpp` but operating on TWO field elements per call.
//
// Two Fq's are interleaved across the two i64 lanes of v128. Every limb
// multiply in the scalar code becomes one `i64x2.extmul_low_i32x4_u`
// (mapped to `umull v.2d, v.2s, v.2s` on ARM64 NEON; `vpmuludq xmm` on x86)
// carrying both fields' work simultaneously.
//
// On Apple M3 P-core, integer-multiply pipes (2 IMUL/cycle) and NEON
// pipes (2 UMULL/cycle for 32x32->64) are physically separate, so the
// theoretical mixed-dispatch ceiling is 6 32x32->64 muls per cycle
// (2 scalar + 2 SIMD each carrying 2 lanes).  This file implements the
// pure SIMD path; the JIT and OoO scheduler can still co-issue scalar
// work in the surrounding loop body.
//
// Three exports for benchmarking:
//   bench_field_mul_scalar(state, iters)
//     - calls the existing scalar field<Fq>::montgomery_mul `iters` times
//       with state used as both inputs (square chain). Counts ITERS muls.
//   bench_field_mul_simd_pair(state_a, state_b, iters)
//     - calls the SIMD pair multiply `iters` times, each producing two
//       independent field-mul results in lanes 0/1. Counts 2*ITERS muls.
//   bench_field_mul_simd_pair_verify(state_a, state_b, scalar_a, scalar_b)
//     - one shot of SIMD pair vs scalar baseline; writes both into the
//       respective output buffers so JS can byte-compare.

#include <cstdint>
#include <cstring>

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"

// WASM SIMD (v128) intrinsics. The surrounding build is compiled without
// -msimd128 by default; we tag every helper that uses v128 below with
// __attribute__((target("simd128"))) so clang turns SIMD on per-function.
#define BB_SIMD __attribute__((target("simd128")))
// Helper macro that also force-inlines. Used on internal functions so the
// bench loop doesn't pay per-call overhead under -Oz. NOT used on
// WASM_EXPORT functions (they must remain externally visible).
#define BB_SIMD_INLINE BB_SIMD __attribute__((always_inline)) inline
#include <wasm_simd128.h>

namespace {

using Fq = bb::curve::BN254::BaseField;

// 9 little-endian 29-bit limbs of the BN254 Fq modulus (cached as i32 for
// SIMD lane packing).
static constexpr uint32_t MOD_29[9] = { 0x187cfd47u, 0x10460b6u,  0x1c72a34fu, 0x2d522d0u,  0x1585d978u,
                                        0x2db40c0u,  0xa6e141u,   0xe5c2634u,  0x30644eu };

// Precomputed Yuval reduction multiplier r_inv_wasm = 2^{-29} mod p, in
// 9 little-endian 29-bit limbs.
static constexpr uint32_t RINV_29[9] = { 0x17789a9fu, 0x5ffc3dcu,  0xd6bde42u,  0x1cf152e3u, 0x18eb055fu,
                                         0xed815e2u,  0x16626d2u,  0xb8bab0fu,  0x6d7c4u };

static constexpr uint64_t LIMB_MASK = 0x1fffffffull;

// ---- 4x64 <-> 9x29 conversion (per field, scalar) ------------------------

static inline void convert_to_29(const uint64_t in[4], uint32_t out[9])
{
    out[0] = (uint32_t)(in[0] & LIMB_MASK);
    out[1] = (uint32_t)((in[0] >> 29) & LIMB_MASK);
    out[2] = (uint32_t)(((in[0] >> 58) | (in[1] << 6)) & LIMB_MASK);
    out[3] = (uint32_t)((in[1] >> 23) & LIMB_MASK);
    out[4] = (uint32_t)(((in[1] >> 52) | (in[2] << 12)) & LIMB_MASK);
    out[5] = (uint32_t)((in[2] >> 17) & LIMB_MASK);
    out[6] = (uint32_t)(((in[2] >> 46) | (in[3] << 18)) & LIMB_MASK);
    out[7] = (uint32_t)((in[3] >> 11) & LIMB_MASK);
    out[8] = (uint32_t)((in[3] >> 40) & LIMB_MASK);
}

// 8 little-endian 29-bit limbs back to 4x64. Mirrors the trailing
// expression in `field<T>::montgomery_mul` after Yuval+wasm_reduce, which
// returns `{ ... | (temp_16 << 11) }` -- 8 limbs into 4x64.
static inline void convert_from_29(const uint64_t lo[8], uint64_t out[4])
{
    out[0] = (lo[0] << 0)  | (lo[1] << 29) | (lo[2] << 58);
    out[1] = (lo[2] >> 6)  | (lo[3] << 23) | (lo[4] << 52);
    out[2] = (lo[4] >> 12) | (lo[5] << 17) | (lo[6] << 46);
    out[3] = (lo[6] >> 18) | (lo[7] << 11);
}

// We use TWO v128 layouts:
//   "v32"  - field A's value in i32 lane 0, field B's value in i32 lane 1.
//            i32 lanes 2-3 are unused. This is the INPUT layout for
//            extmul_low_u32x4 (reads lanes 0+1).
//   "v64"  - field A's value in i64 lane 0, field B's value in i64 lane 1.
//            This is the OUTPUT layout from extmul_low_u32x4 and the
//            natural accumulator layout (each lane holds up to 64 bits).
//
// Conversions between the two:
//   v32 -> v64: not needed (a v32 value is already a valid v64 value where
//               each i64 lane holds <= 32 bits; extmul reads the i32 view).
//   v64 -> v32: needed when an accumulator value must be fed back as a
//               multiplier. Done by shuffling: i32 lane 0 of v64 (= low 32
//               of i64 lane 0) and i32 lane 2 of v64 (= low 32 of i64 lane 1)
//               are gathered into i32 lanes 0+1 of the result.

// Build a v32 value from two 32-bit field limbs.
BB_SIMD_INLINE static v128_t pack_pair(uint32_t a_limb, uint32_t b_limb)
{
    return wasm_i32x4_make((int32_t)a_limb, (int32_t)b_limb, 0, 0);
}

// Splat a 32-bit constant to v32 layout (i32 lanes 0+1, lanes 2-3 zero).
BB_SIMD_INLINE static v128_t splat_u32_pair(uint32_t v)
{
    return wasm_i32x4_make((int32_t)v, (int32_t)v, 0, 0);
}

// Convert v64-format v128 (i64 lanes carrying values <= 32 bits) to v32
// format suitable as an extmul_low_u32x4 input.
BB_SIMD_INLINE static v128_t v64_lo32_to_v32(v128_t v)
{
    // i32 lane 0 = source i32 lane 0 (low 32 bits of i64 lane 0)
    // i32 lane 1 = source i32 lane 2 (low 32 bits of i64 lane 1)
    return wasm_i32x4_shuffle(v, v, 0, 2, 0, 0);
}

// One Yuval reduction, in-place on 9 individually-named v128 locals. Taking
// pointers to an array prevents clang from register-allocating the higher
// limbs -- using named arguments by-reference via a macro keeps them in
// SSA form.  This macro mutates h0..h8 in-place.
//
// r0  : v64-format low limb of each field (to be consumed and discarded)
// h0..h8 : the 9 higher limbs, v64 format (updated in place)
#define YUVAL_STEP_PAIR(r0, h0, h1, h2, h3, h4, h5, h6, h7, h8) do {         \
    const v128_t _r0m_v64 = wasm_v128_and((r0), wasm_i64x2_splat(LIMB_MASK));\
    const v128_t _r0hi    = wasm_u64x2_shr((r0), 29);                        \
    const v128_t _r0m_v32 = v64_lo32_to_v32(_r0m_v64);                       \
    h0 = wasm_i64x2_add(h0,                                                  \
           wasm_i64x2_add(wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[0])), _r0hi)); \
    h1 = wasm_i64x2_add(h1, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[1]))); \
    h2 = wasm_i64x2_add(h2, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[2]))); \
    h3 = wasm_i64x2_add(h3, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[3]))); \
    h4 = wasm_i64x2_add(h4, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[4]))); \
    h5 = wasm_i64x2_add(h5, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[5]))); \
    h6 = wasm_i64x2_add(h6, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[6]))); \
    h7 = wasm_i64x2_add(h7, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[7]))); \
    h8 = wasm_i64x2_add(h8, wasm_u64x2_extmul_low_u32x4(_r0m_v32, splat_u32_pair(RINV_29[8]))); \
} while (0)

// SIMD-paired Montgomery multiply.  Computes:
//   out_a = a_left * a_right  (mod p, in Montgomery form)
//   out_b = b_left * b_right  (mod p, in Montgomery form)
// using two i64 lanes of v128 to carry both fields concurrently.
//
// Inputs/outputs are 4x64-bit Montgomery-form field elements, the same
// interface as the scalar `field<Fq>::montgomery_mul`.
// Reads all 16 input limbs into registers before writing any output, so
// aliasing between (a_left, a_out) and (b_left, b_out) is safe -- the
// bench's squaring chain passes a for both a_left and a_out.
// Short alias for extmul_low to keep lines readable.
#define M(x, y) wasm_u64x2_extmul_low_u32x4((x), (y))
// Short aliases for add and sub on v64.
#define A(x, y) wasm_i64x2_add((x), (y))
#define S(x, y) wasm_i64x2_sub((x), (y))

BB_SIMD_INLINE static void simd_mont_mul_pair(const uint64_t a_left[4], const uint64_t a_right[4],
                                       const uint64_t b_left[4], const uint64_t b_right[4],
                                       uint64_t a_out[4], uint64_t b_out[4])
{
    // 1) Convert to 9x29 limbs per field. Still scalar -- small cost.
    uint32_t la[9], lb[9], ra[9], rb[9];
    convert_to_29(a_left, la);
    convert_to_29(b_left, lb);
    convert_to_29(a_right, ra);
    convert_to_29(b_right, rb);

    // 2) Pack each (a_limb, b_limb) pair into individually-named v32 locals.
    // IMPORTANT: do NOT use `v128_t left[9]` arrays -- clang under -Oz won't
    // reliably keep those in NEON registers and they get spilled to stack.
    const v128_t l0 = pack_pair(la[0], lb[0]);
    const v128_t l1 = pack_pair(la[1], lb[1]);
    const v128_t l2 = pack_pair(la[2], lb[2]);
    const v128_t l3 = pack_pair(la[3], lb[3]);
    const v128_t l4 = pack_pair(la[4], lb[4]);
    const v128_t l5 = pack_pair(la[5], lb[5]);
    const v128_t l6 = pack_pair(la[6], lb[6]);
    const v128_t l7 = pack_pair(la[7], lb[7]);
    const v128_t l8 = pack_pair(la[8], lb[8]);
    const v128_t r0 = pack_pair(ra[0], rb[0]);
    const v128_t r1 = pack_pair(ra[1], rb[1]);
    const v128_t r2 = pack_pair(ra[2], rb[2]);
    const v128_t r3 = pack_pair(ra[3], rb[3]);
    const v128_t r4 = pack_pair(ra[4], rb[4]);
    const v128_t r5 = pack_pair(ra[5], rb[5]);
    const v128_t r6 = pack_pair(ra[6], rb[6]);
    const v128_t r7 = pack_pair(ra[7], rb[7]);
    const v128_t r8 = pack_pair(ra[8], rb[8]);

    // 3) Karatsuba 5+4 split.
    // P_lo = left[0..4] * right[0..4]  (25 muls)
    const v128_t pl0 = M(l0, r0);
    const v128_t pl1 = A(M(l0, r1), M(l1, r0));
    const v128_t pl2 = A(A(M(l0, r2), M(l1, r1)), M(l2, r0));
    const v128_t pl3 = A(A(M(l0, r3), M(l1, r2)), A(M(l2, r1), M(l3, r0)));
    const v128_t pl4 = A(A(M(l0, r4), M(l1, r3)), A(M(l2, r2), A(M(l3, r1), M(l4, r0))));
    const v128_t pl5 = A(A(M(l1, r4), M(l2, r3)), A(M(l3, r2), M(l4, r1)));
    const v128_t pl6 = A(A(M(l2, r4), M(l3, r3)), M(l4, r2));
    const v128_t pl7 = A(M(l3, r4), M(l4, r3));
    const v128_t pl8 = M(l4, r4);

    // P_hi = left[5..8] * right[5..8]  (16 muls)
    const v128_t ph0 = M(l5, r5);
    const v128_t ph1 = A(M(l5, r6), M(l6, r5));
    const v128_t ph2 = A(A(M(l5, r7), M(l6, r6)), M(l7, r5));
    const v128_t ph3 = A(A(M(l5, r8), M(l6, r7)), A(M(l7, r6), M(l8, r5)));
    const v128_t ph4 = A(A(M(l6, r8), M(l7, r7)), M(l8, r6));
    const v128_t ph5 = A(M(l7, r8), M(l8, r7));
    const v128_t ph6 = M(l8, r8);

    // sum_left = left[0..4] + left[5..8]  (sl4 = left[4] only), same for right.
    const v128_t sl0 = wasm_i32x4_add(l0, l5);
    const v128_t sl1 = wasm_i32x4_add(l1, l6);
    const v128_t sl2 = wasm_i32x4_add(l2, l7);
    const v128_t sl3 = wasm_i32x4_add(l3, l8);
    const v128_t sr0 = wasm_i32x4_add(r0, r5);
    const v128_t sr1 = wasm_i32x4_add(r1, r6);
    const v128_t sr2 = wasm_i32x4_add(r2, r7);
    const v128_t sr3 = wasm_i32x4_add(r3, r8);

    // P_cross = sum_left * sum_right (5x5 = 25 muls, using l4/r4 directly for sl4/sr4)
    const v128_t pc0 = M(sl0, sr0);
    const v128_t pc1 = A(M(sl0, sr1), M(sl1, sr0));
    const v128_t pc2 = A(A(M(sl0, sr2), M(sl1, sr1)), M(sl2, sr0));
    const v128_t pc3 = A(A(M(sl0, sr3), M(sl1, sr2)), A(M(sl2, sr1), M(sl3, sr0)));
    const v128_t pc4 = A(A(M(sl0, r4), M(sl1, sr3)),
                         A(M(sl2, sr2), A(M(sl3, sr1), M(l4, sr0))));
    const v128_t pc5 = A(A(M(sl1, r4), M(sl2, sr3)), A(M(sl3, sr2), M(l4, sr1)));
    const v128_t pc6 = A(A(M(sl2, r4), M(sl3, sr3)), M(l4, sr2));
    const v128_t pc7 = A(M(sl3, r4), M(l4, sr3));
    const v128_t pc8 = M(l4, r4);

    // 4) Combine into temp_0..temp_16 as individual named locals (not array).
    // temp[k] = P_lo[k] + (P_cross - P_lo - P_hi)[k-5] + P_hi[k-10]
    v128_t t0 = pl0;
    v128_t t1 = pl1;
    v128_t t2 = pl2;
    v128_t t3 = pl3;
    v128_t t4 = pl4;
    v128_t t5 = A(pl5, S(pc0, A(pl0, ph0)));
    v128_t t6 = A(pl6, S(pc1, A(pl1, ph1)));
    v128_t t7 = A(pl7, S(pc2, A(pl2, ph2)));
    v128_t t8 = A(pl8, S(pc3, A(pl3, ph3)));
    v128_t t9  = S(pc4, A(pl4, ph4));
    v128_t t10 = A(S(pc5, A(pl5, ph5)), ph0);
    v128_t t11 = A(S(pc6, A(pl6, ph6)), ph1);
    v128_t t12 = A(S(pc7, pl7), ph2);
    v128_t t13 = A(S(pc8, pl8), ph3);
    v128_t t14 = ph4;
    v128_t t15 = ph5;
    v128_t t16 = ph6;

    // 5) Eight Yuval reductions. Each consumes one low limb and shifts up.
    YUVAL_STEP_PAIR(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9);
    YUVAL_STEP_PAIR(t1, t2, t3, t4, t5, t6, t7, t8, t9, t10);
    YUVAL_STEP_PAIR(t2, t3, t4, t5, t6, t7, t8, t9, t10, t11);
    YUVAL_STEP_PAIR(t3, t4, t5, t6, t7, t8, t9, t10, t11, t12);
    YUVAL_STEP_PAIR(t4, t5, t6, t7, t8, t9, t10, t11, t12, t13);
    YUVAL_STEP_PAIR(t5, t6, t7, t8, t9, t10, t11, t12, t13, t14);
    YUVAL_STEP_PAIR(t6, t7, t8, t9, t10, t11, t12, t13, t14, t15);
    YUVAL_STEP_PAIR(t7, t8, t9, t10, t11, t12, t13, t14, t15, t16);

    // 6) Final standard Montgomery reduction on t8..t16 (mirrors wasm_reduce):
    //      k = (t8 * r_inv) & mask
    //      t8 += k * MOD_29[0]
    //      t9 += k * MOD_29[1] + (t8 >> 29)
    //      t{8+i} += k * MOD_29[i]   for i in 2..8
    //    For BN254 Fq, T::r_inv = 0x87d20782e4866389; lower 29 bits = 0x04866389.
    static constexpr uint32_t MU_WASM = 0x04866389u;
    const v128_t mask_v64 = wasm_i64x2_splat(LIMB_MASK);
    const v128_t t8_masked_v32 = v64_lo32_to_v32(wasm_v128_and(t8, mask_v64));
    const v128_t k_v32 = v64_lo32_to_v32(
        wasm_v128_and(M(t8_masked_v32, splat_u32_pair(MU_WASM)), mask_v64));
    t8 = A(t8, M(k_v32, splat_u32_pair(MOD_29[0])));
    const v128_t t8_shr = wasm_u64x2_shr(t8, 29);
    t9  = A(t9,  A(M(k_v32, splat_u32_pair(MOD_29[1])), t8_shr));
    t10 = A(t10, M(k_v32, splat_u32_pair(MOD_29[2])));
    t11 = A(t11, M(k_v32, splat_u32_pair(MOD_29[3])));
    t12 = A(t12, M(k_v32, splat_u32_pair(MOD_29[4])));
    t13 = A(t13, M(k_v32, splat_u32_pair(MOD_29[5])));
    t14 = A(t14, M(k_v32, splat_u32_pair(MOD_29[6])));
    t15 = A(t15, M(k_v32, splat_u32_pair(MOD_29[7])));
    t16 = A(t16, M(k_v32, splat_u32_pair(MOD_29[8])));

    // 7) Carry-propagate t9..t16 into 29-bit limbs.
    t10 = A(t10, wasm_u64x2_shr(t9,  29)); t9  = wasm_v128_and(t9,  mask_v64);
    t11 = A(t11, wasm_u64x2_shr(t10, 29)); t10 = wasm_v128_and(t10, mask_v64);
    t12 = A(t12, wasm_u64x2_shr(t11, 29)); t11 = wasm_v128_and(t11, mask_v64);
    t13 = A(t13, wasm_u64x2_shr(t12, 29)); t12 = wasm_v128_and(t12, mask_v64);
    t14 = A(t14, wasm_u64x2_shr(t13, 29)); t13 = wasm_v128_and(t13, mask_v64);
    t15 = A(t15, wasm_u64x2_shr(t14, 29)); t14 = wasm_v128_and(t14, mask_v64);
    t16 = A(t16, wasm_u64x2_shr(t15, 29)); t15 = wasm_v128_and(t15, mask_v64);

    // 8) Extract per-lane results. t9..t16 are the 8 reduced limbs.
    uint64_t a9  = (uint64_t)wasm_i64x2_extract_lane(t9,  0); uint64_t b9  = (uint64_t)wasm_i64x2_extract_lane(t9,  1);
    uint64_t a10 = (uint64_t)wasm_i64x2_extract_lane(t10, 0); uint64_t b10 = (uint64_t)wasm_i64x2_extract_lane(t10, 1);
    uint64_t a11 = (uint64_t)wasm_i64x2_extract_lane(t11, 0); uint64_t b11 = (uint64_t)wasm_i64x2_extract_lane(t11, 1);
    uint64_t a12 = (uint64_t)wasm_i64x2_extract_lane(t12, 0); uint64_t b12 = (uint64_t)wasm_i64x2_extract_lane(t12, 1);
    uint64_t a13 = (uint64_t)wasm_i64x2_extract_lane(t13, 0); uint64_t b13 = (uint64_t)wasm_i64x2_extract_lane(t13, 1);
    uint64_t a14 = (uint64_t)wasm_i64x2_extract_lane(t14, 0); uint64_t b14 = (uint64_t)wasm_i64x2_extract_lane(t14, 1);
    uint64_t a15 = (uint64_t)wasm_i64x2_extract_lane(t15, 0); uint64_t b15 = (uint64_t)wasm_i64x2_extract_lane(t15, 1);
    uint64_t a16 = (uint64_t)wasm_i64x2_extract_lane(t16, 0); uint64_t b16 = (uint64_t)wasm_i64x2_extract_lane(t16, 1);
    const uint64_t av[8] = { a9, a10, a11, a12, a13, a14, a15, a16 };
    const uint64_t bv[8] = { b9, b10, b11, b12, b13, b14, b15, b16 };
    convert_from_29(av, a_out);
    convert_from_29(bv, b_out);
}

#undef M
#undef A
#undef S

} // namespace

// ============================================================================
// Benchmark exports
// ============================================================================

WASM_EXPORT void bench_field_mul_scalar(uint64_t* state, uint32_t iters)
{
    Fq x;
    std::memcpy(x.data, state, 32);
    for (uint32_t i = 0; i < iters; ++i) {
        x = x * x;
    }
    std::memcpy(state, x.data, 32);
}

BB_SIMD WASM_EXPORT void bench_field_mul_simd_pair(uint64_t* state_a, uint64_t* state_b, uint32_t iters)
{
    uint64_t a[4], b[4];
    std::memcpy(a, state_a, 32);
    std::memcpy(b, state_b, 32);
    for (uint32_t i = 0; i < iters; ++i) {
        simd_mont_mul_pair(a, a, b, b, a, b);
    }
    std::memcpy(state_a, a, 32);
    std::memcpy(state_b, b, 32);
}

// One-shot: compute a*a and b*b via SIMD pair, plus the same via scalar,
// and write all four results so JS can byte-compare for correctness.
BB_SIMD WASM_EXPORT void bench_field_mul_simd_pair_verify(const uint64_t* in_a, const uint64_t* in_b,
                                                          uint64_t* simd_out_a, uint64_t* simd_out_b,
                                                          uint64_t* scalar_out_a, uint64_t* scalar_out_b)
{
    simd_mont_mul_pair(in_a, in_a, in_b, in_b, simd_out_a, simd_out_b);
    Fq xa, xb;
    std::memcpy(xa.data, in_a, 32);
    std::memcpy(xb.data, in_b, 32);
    Fq ra = xa * xa;
    Fq rb = xb * xb;
    std::memcpy(scalar_out_a, ra.data, 32);
    std::memcpy(scalar_out_b, rb.data, 32);
}
