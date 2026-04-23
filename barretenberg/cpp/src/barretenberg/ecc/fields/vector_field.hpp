#pragma once

// VectorField: holds 5 field elements and processes them per call with a
// batched kernel that interleaves one scalar stream (1 field) with one
// quad-packed SIMD stream (4 fields in i32x4 / i64x2 lanes).
//
// This is a direct C++ port of the `q1s1` / `mix_s1q1` WAT kernels from
//   https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0 (Mont-mul)
//   https://gist.github.com/AztecBot/2ad5f310fd0e8a3badda33487f4536ff (add/sub/eq/iz)
//
// Two critical constraints from the gist:
//
// 1. Karatsuba, not schoolbook.
//    Mont-mul splits 9 limbs into 5 (lo) + 4 (hi) and uses three schoolbook
//    products: 5x5 P_lo (25), 4x4 P_hi (16), 5x5 P_cross (25). Total 66 muls
//    in the product phase, NOT 81. Combined with 9 Yuval reductions × 9
//    madConst = 81, total is 66+81 = 147. Schoolbook would have been 81+81 =
//    162. The gist: "it's ~25% of the total runtime."
//
// 2. Op-by-op interleaving.
//    Scalar statement, then equivalent quad statement, then next scalar, etc.
//    Clang preserves source order through its WASM backend, V8 TurboFan sees
//    adjacent different-opcode ops with independent operands, dispatches to
//    separate INT / SIMD pipes.
//
// Storage layout (WASM SIMD path): 9 × 29-bit limbs (R = 2^261)
//
//   alignas(32) uint64_t scalar_data[9];    // one field, 9 × 29-bit limbs in u64
//   alignas(16) v128_t   quad_data[9];      // 4 fields × 9 × 29-bit limbs,
//                                           // transposed: lane L of quad_data[k]
//                                           // = field L's u32 limb k
//
// Coarse invariant: each logical field is in [0, 2p) throughout.
//
// Storage layout (fallback): alignas(32) Field elts[5];

#include "barretenberg/ecc/fields/field.hpp"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"

#include <array>
#include <cstdint>
#include <cstring>

#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#define BB_VECTOR_FIELD_SIMD 1
#else
#define BB_VECTOR_FIELD_SIMD 0
#endif

namespace bb {

// ---------------------------------------------------------------------------
// Compile-time constants derived from Params.
// ---------------------------------------------------------------------------
//
// BN254 Fr's 9 × 29-bit wasm modulus (already in Params::modulus_wasm_*):
//   0x10000001, 0x1f0fac9f, 0x0e5c2450, 0x07d090f3,
//   0x1585d283, 0x02db40c0, 0x00a6e141, 0x0e5c2634, 0x0030644e
//
// twice_modulus_wasm[i] = 2 * modulus_wasm[i], propagated as 29-bit limbs.
// Used for sub's r+2p blend and the TNM trick on add.

template <class Params> inline constexpr std::array<uint64_t, 9> compute_twice_modulus_wasm() noexcept
{
    const std::array<uint64_t, 9> p = { Params::modulus_wasm_0, Params::modulus_wasm_1, Params::modulus_wasm_2,
                                        Params::modulus_wasm_3, Params::modulus_wasm_4, Params::modulus_wasm_5,
                                        Params::modulus_wasm_6, Params::modulus_wasm_7, Params::modulus_wasm_8 };
    std::array<uint64_t, 9> twop{};
    uint64_t carry = 0;
    for (size_t i = 0; i < 9; ++i) {
        uint64_t v = (p[i] << 1) + carry;
        twop[i] = v & 0x1fffffff;
        carry = v >> 29;
    }
    // No carry-out beyond limb 8 for BN254 Fr (2p fits in 9 × 29 bits easily).
    return twop;
}

// 2^261 - 2p (mod 2^261), as 9 × 29-bit limbs. The "TNM" constant for add's
// TNM-blend trick: a + b + TNM overflows 2^261 iff a + b >= 2p, which is the
// exact condition under which we should reduce.
template <class Params> inline constexpr std::array<uint64_t, 9> compute_tnm_wasm() noexcept
{
    const auto twop = compute_twice_modulus_wasm<Params>();
    std::array<uint64_t, 9> tnm{};
    uint64_t carry = 1;
    for (size_t i = 0; i < 9; ++i) {
        uint64_t v = ((~twop[i]) & 0x1fffffff) + carry;
        tnm[i] = v & 0x1fffffff;
        carry = v >> 29;
    }
    return tnm;
}

template <class Params> struct alignas(32) VectorField {
    using Field = field<Params>;
    static constexpr size_t SIZE = 5;

    static constexpr std::array<uint64_t, 9> P_WASM = { Params::modulus_wasm_0, Params::modulus_wasm_1,
                                                        Params::modulus_wasm_2, Params::modulus_wasm_3,
                                                        Params::modulus_wasm_4, Params::modulus_wasm_5,
                                                        Params::modulus_wasm_6, Params::modulus_wasm_7,
                                                        Params::modulus_wasm_8 };
    static constexpr std::array<uint64_t, 9> TWOP_WASM = compute_twice_modulus_wasm<Params>();
    static constexpr std::array<uint64_t, 9> TNM_WASM = compute_tnm_wasm<Params>();
    // -(modulus)^-1 mod 2^29.
    static constexpr uint64_t R_INV_MOD_2_29 = Params::r_inv & 0x1fffffffULL;
    static constexpr std::array<uint64_t, 9> R_INV_WASM = { Params::r_inv_wasm_0, Params::r_inv_wasm_1,
                                                            Params::r_inv_wasm_2, Params::r_inv_wasm_3,
                                                            Params::r_inv_wasm_4, Params::r_inv_wasm_5,
                                                            Params::r_inv_wasm_6, Params::r_inv_wasm_7,
                                                            Params::r_inv_wasm_8 };

    // ---- Storage ----
#if BB_VECTOR_FIELD_SIMD
    // 9 × 29-bit limbs, stored in u64 slots (top 35 bits zero). Matches the
    // gist's `mmul_scalar` input format.
    alignas(32) uint64_t scalar_data[9];
    // 9 × v128; each v128 holds four u32 slots carrying one limb from each of
    // 4 fields. Top 3 bits of each u32 are zero.
    alignas(16) v128_t quad_data[9];
#else
    alignas(32) Field elts[5];
#endif

    constexpr VectorField() noexcept = default;

    // Construct from 5 field<Params> values. Each is expected to be in the
    // field's internal Montgomery form (R = 2^261 on WASM, R = 2^256 on
    // native).
    explicit VectorField(const std::array<Field, 5>& in) noexcept { store_from_array(in); }

    std::array<Field, 5> to_array() const noexcept
    {
        std::array<Field, 5> out;
        load_to_array(out);
        return out;
    }

    Field get(size_t i) const noexcept
    {
        auto a = to_array();
        return a[i];
    }
    void set(size_t i, const Field& v) noexcept
    {
        auto a = to_array();
        a[i] = v;
        store_from_array(a);
    }

    VectorField operator+(const VectorField& other) const noexcept;
    VectorField operator-(const VectorField& other) const noexcept;
    VectorField operator*(const VectorField& other) const noexcept;

    // Returns a 5-bit mask: bit 0 = scalar, bits 1..4 = quad lanes 0..3.
    uint32_t eq(const VectorField& other) const noexcept;
    uint32_t is_zero() const noexcept;

  private:
    void store_from_array(const std::array<Field, 5>& in) noexcept;
    void load_to_array(std::array<Field, 5>& out) const noexcept;
};

// =====================================================================
// Implementation
// =====================================================================

#if BB_VECTOR_FIELD_SIMD

namespace vector_field_detail {

// Compiler scheduling barrier — prevents LLVM from reordering the scalar and
// quad statements around this point.
//
// The gist's schedule (https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0)
// REQUIRES that scalar and quad ops stay textually adjacent in the compiled
// WAT: V8's register allocator only keeps v128 live-ranges short if it sees
// the scalar int ops interleaved with the SIMD ops on the issue queue. If the
// WAT serializes all scalar muls first, then all SIMD muls, V8 sees a
// long-lived fan-out of ~130 v128 partial products and spills most of them.
//
// Clang's WASM backend has no dependency between the two streams (i64 ops vs
// v128 ops), so its instruction scheduler happily hoists all of one kind
// before the other. An `asm volatile` barrier with BOTH a scalar output and a
// quad output forces LLVM to keep the pair adjacent, which gets us back to
// the gist's intended schedule.
//
// Verified experimentally: single-value barriers allow reordering; joint
// (scalar+quad) barriers preserve per-statement adjacency.

[[gnu::always_inline]] inline void bb_vf_barrier_sq(uint64_t& s, v128_t& q) noexcept
{
    asm volatile("" : "+r"(s), "+r"(q));
}

[[gnu::always_inline]] inline void bb_vf_barrier_sqq(uint64_t& s, v128_t& q_lo, v128_t& q_hi) noexcept
{
    asm volatile("" : "+r"(s), "+r"(q_lo), "+r"(q_hi));
}

// Pack 4 × u64 (little-endian 256-bit value) into 9 × 29-bit limbs.
inline void pack_4u64_to_9x29(const uint64_t in[4], uint64_t out[9]) noexcept
{
    out[0] = in[0] & 0x1fffffff;
    out[1] = (in[0] >> 29) & 0x1fffffff;
    out[2] = ((in[0] >> 58) & 0x3f) | ((in[1] & 0x7fffff) << 6);
    out[3] = (in[1] >> 23) & 0x1fffffff;
    out[4] = ((in[1] >> 52) & 0xfff) | ((in[2] & 0x1ffff) << 12);
    out[5] = (in[2] >> 17) & 0x1fffffff;
    out[6] = ((in[2] >> 46) & 0x3ffff) | ((in[3] & 0x7ff) << 18);
    out[7] = (in[3] >> 11) & 0x1fffffff;
    out[8] = (in[3] >> 40) & 0x1fffffff;
}

// Unpack 9 × 29-bit limbs back to 4 × u64.
inline void unpack_9x29_to_4u64(const uint64_t in[9], uint64_t out[4]) noexcept
{
    out[0] = in[0] | (in[1] << 29) | (in[2] << 58);
    out[1] = (in[2] >> 6) | (in[3] << 23) | (in[4] << 52);
    out[2] = (in[4] >> 12) | (in[5] << 17) | (in[6] << 46);
    out[3] = (in[6] >> 18) | (in[7] << 11) | (in[8] << 40);
}

} // namespace vector_field_detail

// -------------------- store/load --------------------

template <class Params> inline void VectorField<Params>::store_from_array(const std::array<Field, 5>& in) noexcept
{
    // Scalar lane.
    vector_field_detail::pack_4u64_to_9x29(in[0].data, scalar_data);
    // Quad lanes: transpose 4 fields' 9-limb forms into 9 v128s.
    uint64_t limbs[4][9];
    vector_field_detail::pack_4u64_to_9x29(in[1].data, limbs[0]);
    vector_field_detail::pack_4u64_to_9x29(in[2].data, limbs[1]);
    vector_field_detail::pack_4u64_to_9x29(in[3].data, limbs[2]);
    vector_field_detail::pack_4u64_to_9x29(in[4].data, limbs[3]);
    for (size_t k = 0; k < 9; ++k) {
        quad_data[k] = wasm_i32x4_make(static_cast<int32_t>(limbs[0][k]),
                                       static_cast<int32_t>(limbs[1][k]),
                                       static_cast<int32_t>(limbs[2][k]),
                                       static_cast<int32_t>(limbs[3][k]));
    }
}

template <class Params> inline void VectorField<Params>::load_to_array(std::array<Field, 5>& out) const noexcept
{
    vector_field_detail::unpack_9x29_to_4u64(scalar_data, out[0].data);
    uint64_t limbs[4][9];
    for (size_t k = 0; k < 9; ++k) {
        limbs[0][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 0));
        limbs[1][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 1));
        limbs[2][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 2));
        limbs[3][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 3));
    }
    vector_field_detail::unpack_9x29_to_4u64(limbs[0], out[1].data);
    vector_field_detail::unpack_9x29_to_4u64(limbs[1], out[2].data);
    vector_field_detail::unpack_9x29_to_4u64(limbs[2], out[3].data);
    vector_field_detail::unpack_9x29_to_4u64(limbs[3], out[4].data);
}

// -------------------- operator+ (coarse form, 9x29 limbs) --------------------
//
// Two independent chains (the "TNM trick"):
//   r[k]  = a[k] + b[k] (+ carry from r[k-1])                ; raw add
//   t[k]  = r[k] + TNM[k] (+ carry from t[k-1])              ; independent chain
//   if t produces a final carry (i.e., a+b >= 2p) use t, else use r.
//
// Interleaved scalar / quad. Each 29-bit limb + 29-bit limb + 1 <= 30 bits so
// carries fit in bit 29.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator+(const VectorField& other) const noexcept
{
    constexpr uint64_t MASK = 0x1fffffffULL;
    const v128_t mask_splat = wasm_i32x4_splat(MASK);

    VectorField result;

    // --- r chain: r = a + b with carry, limbs 0..8 ---
    uint64_t sr0 = scalar_data[0] + other.scalar_data[0];
    v128_t qr0 = wasm_i32x4_add(quad_data[0], other.quad_data[0]);
    uint64_t scarry = sr0 >> 29;
    v128_t qcarry = wasm_u32x4_shr(qr0, 29);
    sr0 &= MASK;
    qr0 = wasm_v128_and(qr0, mask_splat);

    uint64_t sr1 = scalar_data[1] + other.scalar_data[1] + scarry;
    v128_t qr1 = wasm_i32x4_add(wasm_i32x4_add(quad_data[1], other.quad_data[1]), qcarry);
    scarry = sr1 >> 29;
    qcarry = wasm_u32x4_shr(qr1, 29);
    sr1 &= MASK;
    qr1 = wasm_v128_and(qr1, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr1, qr1, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr2 = scalar_data[2] + other.scalar_data[2] + scarry;
    v128_t qr2 = wasm_i32x4_add(wasm_i32x4_add(quad_data[2], other.quad_data[2]), qcarry);
    scarry = sr2 >> 29;
    qcarry = wasm_u32x4_shr(qr2, 29);
    sr2 &= MASK;
    qr2 = wasm_v128_and(qr2, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr2, qr2, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr3 = scalar_data[3] + other.scalar_data[3] + scarry;
    v128_t qr3 = wasm_i32x4_add(wasm_i32x4_add(quad_data[3], other.quad_data[3]), qcarry);
    scarry = sr3 >> 29;
    qcarry = wasm_u32x4_shr(qr3, 29);
    sr3 &= MASK;
    qr3 = wasm_v128_and(qr3, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr3, qr3, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr4 = scalar_data[4] + other.scalar_data[4] + scarry;
    v128_t qr4 = wasm_i32x4_add(wasm_i32x4_add(quad_data[4], other.quad_data[4]), qcarry);
    scarry = sr4 >> 29;
    qcarry = wasm_u32x4_shr(qr4, 29);
    sr4 &= MASK;
    qr4 = wasm_v128_and(qr4, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr4, qr4, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr5 = scalar_data[5] + other.scalar_data[5] + scarry;
    v128_t qr5 = wasm_i32x4_add(wasm_i32x4_add(quad_data[5], other.quad_data[5]), qcarry);
    scarry = sr5 >> 29;
    qcarry = wasm_u32x4_shr(qr5, 29);
    sr5 &= MASK;
    qr5 = wasm_v128_and(qr5, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr5, qr5, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr6 = scalar_data[6] + other.scalar_data[6] + scarry;
    v128_t qr6 = wasm_i32x4_add(wasm_i32x4_add(quad_data[6], other.quad_data[6]), qcarry);
    scarry = sr6 >> 29;
    qcarry = wasm_u32x4_shr(qr6, 29);
    sr6 &= MASK;
    qr6 = wasm_v128_and(qr6, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr6, qr6, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr7 = scalar_data[7] + other.scalar_data[7] + scarry;
    v128_t qr7 = wasm_i32x4_add(wasm_i32x4_add(quad_data[7], other.quad_data[7]), qcarry);
    scarry = sr7 >> 29;
    qcarry = wasm_u32x4_shr(qr7, 29);
    sr7 &= MASK;
    qr7 = wasm_v128_and(qr7, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr7, qr7, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr8 = scalar_data[8] + other.scalar_data[8] + scarry;
    v128_t qr8 = wasm_i32x4_add(wasm_i32x4_add(quad_data[8], other.quad_data[8]), qcarry);
    // No carry out of limb 8 for coarse inputs + add (result < 2 * 2p < 2^261).

    // --- t chain: t = r + TNM with carry, limbs 0..8 ---
    uint64_t st0 = sr0 + TNM_WASM[0];
    v128_t qt0 = wasm_i32x4_add(qr0, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[0])));
    scarry = st0 >> 29;
    qcarry = wasm_u32x4_shr(qt0, 29);
    st0 &= MASK;
    qt0 = wasm_v128_and(qt0, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st0, qt0, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st1 = sr1 + TNM_WASM[1] + scarry;
    v128_t qt1 = wasm_i32x4_add(wasm_i32x4_add(qr1, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[1]))), qcarry);
    scarry = st1 >> 29;
    qcarry = wasm_u32x4_shr(qt1, 29);
    st1 &= MASK;
    qt1 = wasm_v128_and(qt1, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st1, qt1, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st2 = sr2 + TNM_WASM[2] + scarry;
    v128_t qt2 = wasm_i32x4_add(wasm_i32x4_add(qr2, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[2]))), qcarry);
    scarry = st2 >> 29;
    qcarry = wasm_u32x4_shr(qt2, 29);
    st2 &= MASK;
    qt2 = wasm_v128_and(qt2, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st2, qt2, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st3 = sr3 + TNM_WASM[3] + scarry;
    v128_t qt3 = wasm_i32x4_add(wasm_i32x4_add(qr3, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[3]))), qcarry);
    scarry = st3 >> 29;
    qcarry = wasm_u32x4_shr(qt3, 29);
    st3 &= MASK;
    qt3 = wasm_v128_and(qt3, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st3, qt3, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st4 = sr4 + TNM_WASM[4] + scarry;
    v128_t qt4 = wasm_i32x4_add(wasm_i32x4_add(qr4, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[4]))), qcarry);
    scarry = st4 >> 29;
    qcarry = wasm_u32x4_shr(qt4, 29);
    st4 &= MASK;
    qt4 = wasm_v128_and(qt4, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st4, qt4, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st5 = sr5 + TNM_WASM[5] + scarry;
    v128_t qt5 = wasm_i32x4_add(wasm_i32x4_add(qr5, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[5]))), qcarry);
    scarry = st5 >> 29;
    qcarry = wasm_u32x4_shr(qt5, 29);
    st5 &= MASK;
    qt5 = wasm_v128_and(qt5, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st5, qt5, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st6 = sr6 + TNM_WASM[6] + scarry;
    v128_t qt6 = wasm_i32x4_add(wasm_i32x4_add(qr6, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[6]))), qcarry);
    scarry = st6 >> 29;
    qcarry = wasm_u32x4_shr(qt6, 29);
    st6 &= MASK;
    qt6 = wasm_v128_and(qt6, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st6, qt6, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st7 = sr7 + TNM_WASM[7] + scarry;
    v128_t qt7 = wasm_i32x4_add(wasm_i32x4_add(qr7, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[7]))), qcarry);
    scarry = st7 >> 29;
    qcarry = wasm_u32x4_shr(qt7, 29);
    st7 &= MASK;
    qt7 = wasm_v128_and(qt7, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st7, qt7, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st8 = sr8 + TNM_WASM[8] + scarry;
    v128_t qt8 = wasm_i32x4_add(wasm_i32x4_add(qr8, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[8]))), qcarry);
    // Top-limb carry: if t8 >= 2^29, a+b >= 2p — pick t (reduced). Else pick r.
    const uint64_t sc_final = st8 >> 29;
    const v128_t qc_final = wasm_u32x4_shr(qt8, 29);
    st8 &= MASK;
    qt8 = wasm_v128_and(qt8, mask_splat);

    // Blend: sc_final nonzero => pick t.
    const uint64_t smask = 0ULL - sc_final;
    // qc_final is 0/1 per lane; turn into 0 / all-ones via compare-not-equal-0.
    // Using i32x4_eq (qc_final, 1) = all-ones if lane is 1, which is correct.
    const v128_t qmask = wasm_i32x4_eq(qc_final, wasm_i32x4_splat(1));
    const uint64_t simask = ~smask;

    result.scalar_data[0] = (sr0 & simask) | (st0 & smask);
    result.quad_data[0] = wasm_v128_bitselect(qt0, qr0, qmask);
    result.scalar_data[1] = (sr1 & simask) | (st1 & smask);
    result.quad_data[1] = wasm_v128_bitselect(qt1, qr1, qmask);
    result.scalar_data[2] = (sr2 & simask) | (st2 & smask);
    result.quad_data[2] = wasm_v128_bitselect(qt2, qr2, qmask);
    result.scalar_data[3] = (sr3 & simask) | (st3 & smask);
    result.quad_data[3] = wasm_v128_bitselect(qt3, qr3, qmask);
    result.scalar_data[4] = (sr4 & simask) | (st4 & smask);
    result.quad_data[4] = wasm_v128_bitselect(qt4, qr4, qmask);
    result.scalar_data[5] = (sr5 & simask) | (st5 & smask);
    result.quad_data[5] = wasm_v128_bitselect(qt5, qr5, qmask);
    result.scalar_data[6] = (sr6 & simask) | (st6 & smask);
    result.quad_data[6] = wasm_v128_bitselect(qt6, qr6, qmask);
    result.scalar_data[7] = (sr7 & simask) | (st7 & smask);
    result.quad_data[7] = wasm_v128_bitselect(qt7, qr7, qmask);
    result.scalar_data[8] = (sr8 & simask) | (st8 & smask);
    result.quad_data[8] = wasm_v128_bitselect(qt8, qr8, qmask);

    return result;
}

// -------------------- operator- (coarse form, 9x29 limbs) --------------------
//
// Two chains:
//   r = a - b    (may go negative)
//   s = r + 2p   (always in [0, 4p))
// If final borrow from r is set, pick s; else pick r.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator-(const VectorField& other) const noexcept
{
    constexpr uint64_t MASK = 0x1fffffffULL;
    const v128_t mask_splat = wasm_i32x4_splat(MASK);

    VectorField result;

    // Strategy: keep the r chain fully in i32x4 space (no i64x2 transitions).
    // - For limb 0, compute sub and borrow from underflow.
    // - Represent quad borrow as an i32x4 "0 or 1" value.
    // - Subsequent limbs: r[k] = a[k] - b[k] - borrow, mask to 29 bits,
    //   borrow_out = 1 iff underflow. Detect underflow via the top bit (bit 31)
    //   of the raw subtract result, since 29-bit values keep bits 29..31 clear
    //   and underflow sets them.

    // Limb 0.
    int64_t sdiff0 = static_cast<int64_t>(scalar_data[0]) - static_cast<int64_t>(other.scalar_data[0]);
    v128_t qdiff0 = wasm_i32x4_sub(quad_data[0], other.quad_data[0]);
    uint64_t sr0 = static_cast<uint64_t>(sdiff0) & MASK;
    v128_t qr0 = wasm_v128_and(qdiff0, mask_splat);
    // Borrow: scalar 0 or 1; quad: 1 per lane if underflow (top bit of i32 set).
    int64_t sborrow = (sdiff0 < 0) ? 1 : 0;
    v128_t qborrow = wasm_u32x4_shr(qdiff0, 31);

    // Limb 1.
    int64_t sdiff1 = static_cast<int64_t>(scalar_data[1]) - static_cast<int64_t>(other.scalar_data[1]) - sborrow;
    v128_t qdiff1 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[1], other.quad_data[1]), qborrow);
    uint64_t sr1 = static_cast<uint64_t>(sdiff1) & MASK;
    v128_t qr1 = wasm_v128_and(qdiff1, mask_splat);
    sborrow = (sdiff1 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff1, 31);
    vector_field_detail::bb_vf_barrier_sq(sr1, qr1);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff2 = static_cast<int64_t>(scalar_data[2]) - static_cast<int64_t>(other.scalar_data[2]) - sborrow;
    v128_t qdiff2 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[2], other.quad_data[2]), qborrow);
    uint64_t sr2 = static_cast<uint64_t>(sdiff2) & MASK;
    v128_t qr2 = wasm_v128_and(qdiff2, mask_splat);
    sborrow = (sdiff2 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff2, 31);
    vector_field_detail::bb_vf_barrier_sq(sr2, qr2);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff3 = static_cast<int64_t>(scalar_data[3]) - static_cast<int64_t>(other.scalar_data[3]) - sborrow;
    v128_t qdiff3 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[3], other.quad_data[3]), qborrow);
    uint64_t sr3 = static_cast<uint64_t>(sdiff3) & MASK;
    v128_t qr3 = wasm_v128_and(qdiff3, mask_splat);
    sborrow = (sdiff3 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff3, 31);
    vector_field_detail::bb_vf_barrier_sq(sr3, qr3);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff4 = static_cast<int64_t>(scalar_data[4]) - static_cast<int64_t>(other.scalar_data[4]) - sborrow;
    v128_t qdiff4 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[4], other.quad_data[4]), qborrow);
    uint64_t sr4 = static_cast<uint64_t>(sdiff4) & MASK;
    v128_t qr4 = wasm_v128_and(qdiff4, mask_splat);
    sborrow = (sdiff4 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff4, 31);
    vector_field_detail::bb_vf_barrier_sq(sr4, qr4);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff5 = static_cast<int64_t>(scalar_data[5]) - static_cast<int64_t>(other.scalar_data[5]) - sborrow;
    v128_t qdiff5 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[5], other.quad_data[5]), qborrow);
    uint64_t sr5 = static_cast<uint64_t>(sdiff5) & MASK;
    v128_t qr5 = wasm_v128_and(qdiff5, mask_splat);
    sborrow = (sdiff5 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff5, 31);
    vector_field_detail::bb_vf_barrier_sq(sr5, qr5);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff6 = static_cast<int64_t>(scalar_data[6]) - static_cast<int64_t>(other.scalar_data[6]) - sborrow;
    v128_t qdiff6 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[6], other.quad_data[6]), qborrow);
    uint64_t sr6 = static_cast<uint64_t>(sdiff6) & MASK;
    v128_t qr6 = wasm_v128_and(qdiff6, mask_splat);
    sborrow = (sdiff6 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff6, 31);
    vector_field_detail::bb_vf_barrier_sq(sr6, qr6);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff7 = static_cast<int64_t>(scalar_data[7]) - static_cast<int64_t>(other.scalar_data[7]) - sborrow;
    v128_t qdiff7 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[7], other.quad_data[7]), qborrow);
    uint64_t sr7 = static_cast<uint64_t>(sdiff7) & MASK;
    v128_t qr7 = wasm_v128_and(qdiff7, mask_splat);
    sborrow = (sdiff7 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff7, 31);
    vector_field_detail::bb_vf_barrier_sq(sr7, qr7);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff8 = static_cast<int64_t>(scalar_data[8]) - static_cast<int64_t>(other.scalar_data[8]) - sborrow;
    v128_t qdiff8 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[8], other.quad_data[8]), qborrow);
    uint64_t sr8 = static_cast<uint64_t>(sdiff8) & MASK;
    v128_t qr8 = wasm_v128_and(qdiff8, mask_splat);
    // Final borrow — this is what decides whether to add 2p.
    const uint64_t s_final_borrow = (sdiff8 < 0) ? 1 : 0;
    const v128_t q_final_borrow_i32 = wasm_u32x4_shr(qdiff8, 31); // 0 or 1 per lane
    // q_final_borrow_mask: all-ones per lane if borrow set, else 0.
    const v128_t q_final_borrow_mask = wasm_i32x4_eq(q_final_borrow_i32, wasm_i32x4_splat(1));

    // s = r + 2p chain (scalar + quad interleaved).
    uint64_t ss0 = sr0 + TWOP_WASM[0];
    v128_t qs0 = wasm_i32x4_add(qr0, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[0])));
    uint64_t scarry = ss0 >> 29;
    v128_t qcarry = wasm_u32x4_shr(qs0, 29);
    ss0 &= MASK;
    qs0 = wasm_v128_and(qs0, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss0, qs0, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss1 = sr1 + TWOP_WASM[1] + scarry;
    v128_t qs1 = wasm_i32x4_add(wasm_i32x4_add(qr1, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[1]))), qcarry);
    scarry = ss1 >> 29;
    qcarry = wasm_u32x4_shr(qs1, 29);
    ss1 &= MASK;
    qs1 = wasm_v128_and(qs1, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss1, qs1, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss2 = sr2 + TWOP_WASM[2] + scarry;
    v128_t qs2 = wasm_i32x4_add(wasm_i32x4_add(qr2, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[2]))), qcarry);
    scarry = ss2 >> 29;
    qcarry = wasm_u32x4_shr(qs2, 29);
    ss2 &= MASK;
    qs2 = wasm_v128_and(qs2, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss2, qs2, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss3 = sr3 + TWOP_WASM[3] + scarry;
    v128_t qs3 = wasm_i32x4_add(wasm_i32x4_add(qr3, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[3]))), qcarry);
    scarry = ss3 >> 29;
    qcarry = wasm_u32x4_shr(qs3, 29);
    ss3 &= MASK;
    qs3 = wasm_v128_and(qs3, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss3, qs3, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss4 = sr4 + TWOP_WASM[4] + scarry;
    v128_t qs4 = wasm_i32x4_add(wasm_i32x4_add(qr4, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[4]))), qcarry);
    scarry = ss4 >> 29;
    qcarry = wasm_u32x4_shr(qs4, 29);
    ss4 &= MASK;
    qs4 = wasm_v128_and(qs4, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss4, qs4, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss5 = sr5 + TWOP_WASM[5] + scarry;
    v128_t qs5 = wasm_i32x4_add(wasm_i32x4_add(qr5, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[5]))), qcarry);
    scarry = ss5 >> 29;
    qcarry = wasm_u32x4_shr(qs5, 29);
    ss5 &= MASK;
    qs5 = wasm_v128_and(qs5, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss5, qs5, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss6 = sr6 + TWOP_WASM[6] + scarry;
    v128_t qs6 = wasm_i32x4_add(wasm_i32x4_add(qr6, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[6]))), qcarry);
    scarry = ss6 >> 29;
    qcarry = wasm_u32x4_shr(qs6, 29);
    ss6 &= MASK;
    qs6 = wasm_v128_and(qs6, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss6, qs6, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss7 = sr7 + TWOP_WASM[7] + scarry;
    v128_t qs7 = wasm_i32x4_add(wasm_i32x4_add(qr7, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[7]))), qcarry);
    scarry = ss7 >> 29;
    qcarry = wasm_u32x4_shr(qs7, 29);
    ss7 &= MASK;
    qs7 = wasm_v128_and(qs7, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss7, qs7, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss8 = sr8 + TWOP_WASM[8] + scarry;
    v128_t qs8 = wasm_i32x4_add(wasm_i32x4_add(qr8, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[8]))), qcarry);
    ss8 &= MASK;
    qs8 = wasm_v128_and(qs8, mask_splat);

    // Blend on final borrow: borrow set => pick s.
    const uint64_t smask = 0ULL - s_final_borrow;
    const uint64_t simask = ~smask;
    const v128_t qmask = q_final_borrow_mask;

    result.scalar_data[0] = (sr0 & simask) | (ss0 & smask);
    result.quad_data[0] = wasm_v128_bitselect(qs0, qr0, qmask);
    result.scalar_data[1] = (sr1 & simask) | (ss1 & smask);
    result.quad_data[1] = wasm_v128_bitselect(qs1, qr1, qmask);
    result.scalar_data[2] = (sr2 & simask) | (ss2 & smask);
    result.quad_data[2] = wasm_v128_bitselect(qs2, qr2, qmask);
    result.scalar_data[3] = (sr3 & simask) | (ss3 & smask);
    result.quad_data[3] = wasm_v128_bitselect(qs3, qr3, qmask);
    result.scalar_data[4] = (sr4 & simask) | (ss4 & smask);
    result.quad_data[4] = wasm_v128_bitselect(qs4, qr4, qmask);
    result.scalar_data[5] = (sr5 & simask) | (ss5 & smask);
    result.quad_data[5] = wasm_v128_bitselect(qs5, qr5, qmask);
    result.scalar_data[6] = (sr6 & simask) | (ss6 & smask);
    result.quad_data[6] = wasm_v128_bitselect(qs6, qr6, qmask);
    result.scalar_data[7] = (sr7 & simask) | (ss7 & smask);
    result.quad_data[7] = wasm_v128_bitselect(qs7, qr7, qmask);
    result.scalar_data[8] = (sr8 & simask) | (ss8 & smask);
    result.quad_data[8] = wasm_v128_bitselect(qs8, qr8, qmask);

    return result;
}

// -------------------- eq / is_zero (coarse form, 9x29 limbs) --------------------
//
// Coarse-form equality trick: two elements are equal iff their difference d
// satisfies d == 0 or d == p (in 9 x 29-bit form). We compute d = a - b and
// OR-reduce the limbs both as-is (for d == 0) and XOR'd with p (for d == p).
//
// To avoid slow per-lane extract_lane calls, we use wasm_i32x4_bitmask to turn
// a 4-lane all-ones/zero compare into a 4-bit integer mask in one instruction.

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    const VectorField d = (*this) - other;

    // Scalar + quad OR-reductions interleaved. Two parallel accumulators per
    // stream: one for (d == 0), one for (d ^ p == 0 i.e. d == p).
    uint64_t sacc_z = d.scalar_data[0];
    v128_t qacc_z = d.quad_data[0];
    uint64_t sacc_p = d.scalar_data[0] ^ P_WASM[0];
    v128_t qacc_p = wasm_v128_xor(d.quad_data[0], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[0])));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[1];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[1]);
    sacc_p |= d.scalar_data[1] ^ P_WASM[1];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[1], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[1]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[2];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[2]);
    sacc_p |= d.scalar_data[2] ^ P_WASM[2];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[2], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[2]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[3];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[3]);
    sacc_p |= d.scalar_data[3] ^ P_WASM[3];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[3], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[3]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[4];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[4]);
    sacc_p |= d.scalar_data[4] ^ P_WASM[4];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[4], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[4]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[5];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[5]);
    sacc_p |= d.scalar_data[5] ^ P_WASM[5];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[5], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[5]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[6];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[6]);
    sacc_p |= d.scalar_data[6] ^ P_WASM[6];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[6], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[6]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[7];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[7]);
    sacc_p |= d.scalar_data[7] ^ P_WASM[7];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[7], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[7]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[8];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[8]);
    sacc_p |= d.scalar_data[8] ^ P_WASM[8];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[8], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[8]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    // For the quad stream, we want a 4-bit lane-equal mask. bitmask extracts
    // the top bit of each i32 lane. To make "acc == 0" produce top-bit-set,
    // compare to 0 with i32x4_eq → all-ones/0 per lane → bitmask extracts.
    // One i32x4_eq + one bitmask per accumulator — much cheaper than 4 extracts.
    const v128_t qzero = wasm_i32x4_splat(0);
    const uint32_t lanes_z = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_z, qzero));
    const uint32_t lanes_p = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_p, qzero));
    const uint32_t lanes_eq = lanes_z | lanes_p; // bits 0..3 per lane

    const uint32_t scalar_eq = ((sacc_z == 0) || (sacc_p == 0)) ? 1u : 0u;

    // Result: bit 0 = scalar, bits 1..4 = lanes 0..3. Shift lanes_eq left by 1.
    return scalar_eq | (lanes_eq << 1);
}

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::is_zero() const noexcept
{
    // Same pattern as eq, but on (*this) directly (no subtract).
    uint64_t sacc_z = scalar_data[0];
    v128_t qacc_z = quad_data[0];
    uint64_t sacc_p = scalar_data[0] ^ P_WASM[0];
    v128_t qacc_p = wasm_v128_xor(quad_data[0], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[0])));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[1];
    qacc_z = wasm_v128_or(qacc_z, quad_data[1]);
    sacc_p |= scalar_data[1] ^ P_WASM[1];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[1], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[1]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[2];
    qacc_z = wasm_v128_or(qacc_z, quad_data[2]);
    sacc_p |= scalar_data[2] ^ P_WASM[2];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[2], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[2]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[3];
    qacc_z = wasm_v128_or(qacc_z, quad_data[3]);
    sacc_p |= scalar_data[3] ^ P_WASM[3];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[3], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[3]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[4];
    qacc_z = wasm_v128_or(qacc_z, quad_data[4]);
    sacc_p |= scalar_data[4] ^ P_WASM[4];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[4], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[4]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[5];
    qacc_z = wasm_v128_or(qacc_z, quad_data[5]);
    sacc_p |= scalar_data[5] ^ P_WASM[5];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[5], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[5]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[6];
    qacc_z = wasm_v128_or(qacc_z, quad_data[6]);
    sacc_p |= scalar_data[6] ^ P_WASM[6];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[6], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[6]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[7];
    qacc_z = wasm_v128_or(qacc_z, quad_data[7]);
    sacc_p |= scalar_data[7] ^ P_WASM[7];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[7], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[7]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[8];
    qacc_z = wasm_v128_or(qacc_z, quad_data[8]);
    sacc_p |= scalar_data[8] ^ P_WASM[8];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[8], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[8]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    const v128_t qzero = wasm_i32x4_splat(0);
    const uint32_t lanes_z = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_z, qzero));
    const uint32_t lanes_p = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_p, qzero));
    const uint32_t lanes_iz = lanes_z | lanes_p;

    const uint32_t scalar_iz = ((sacc_z == 0) || (sacc_p == 0)) ? 1u : 0u;

    return scalar_iz | (lanes_iz << 1);
}

// -------------------- operator* (Mont-mul via Karatsuba, 9x29 limbs) --------------------
//
// Follows the authoritative OPS[] schedule from
// https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0.
//
// Stages:
//   1. P_lo   = left[0..4] * right[0..4]       (25 muls in pl0..pl8)
//   2. P_hi   = left[5..8] * right[5..8]       (16 muls in ph0..ph6)
//   3. Sums   sl_i = l_i + l_{5+i} for i=0..3, sl4 = l4, same for sr (i32x4 add)
//   4. P_cross= sl * sr                        (25 muls in pc0..pc8)
//   5. Combine into temp_0..temp_16
//   6. 8 x Yuval reductions over (temp_lo..temp_{lo+9})
//   7. 1 x wasm_reduce over (temp_8..temp_16)
//   8. Carry-propagate temp_9..temp_17
//   9. Branch-free conditional subtract
//   10. Store output
//
// Scalar stream uses i64 arithmetic (29*29 -> 58-bit products fit in u64 with
// 6 bits of accumulator headroom for 9 partial products).
//
// Quad stream uses paired i64x2 accumulators: lane L holds field L's limb k.
// Two i64x2 slots per logical limb cover 4 fields (tlo = lanes 0/1 = fields
// 0,1; thi = lanes 2/3 = fields 2,3). Partial products use
// `i64x2.extmul_low/high_u32x4` to do 2 x (32x32->64) per v128 op.
//
// Source order: scalar op, then equivalent quad op(s), then next scalar op, etc.
// Clang preserves source order in WASM codegen; V8 sees independent scalar /
// SIMD ops and schedules them on separate pipes.
//
// Total muls in the product phase: 25 + 16 + 25 = 66 (NOT 81). This is the
// whole point of Karatsuba — schoolbook 9x9 would need 81.

template <class Params>
[[gnu::noinline]] inline VectorField<Params> VectorField<Params>::operator*(const VectorField& other) const noexcept
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
    // ============================================================

    const uint64_t ssl0 = sl0 + sl5;
    const v128_t qsl0 = wasm_i32x4_add(ql0, ql5);
    const uint64_t ssr0 = sri0 + sri5;
    const v128_t qsr0 = wasm_i32x4_add(qri0, qri5);

    const uint64_t ssl1 = sl1 + sl6;
    const v128_t qsl1 = wasm_i32x4_add(ql1, ql6);
    const uint64_t ssr1 = sri1 + sri6;
    const v128_t qsr1 = wasm_i32x4_add(qri1, qri6);

    const uint64_t ssl2 = sl2 + sl7;
    const v128_t qsl2 = wasm_i32x4_add(ql2, ql7);
    const uint64_t ssr2 = sri2 + sri7;
    const v128_t qsr2 = wasm_i32x4_add(qri2, qri7);

    const uint64_t ssl3 = sl3 + sl8;
    const v128_t qsl3 = wasm_i32x4_add(ql3, ql8);
    const uint64_t ssr3 = sri3 + sri8;
    const v128_t qsr3 = wasm_i32x4_add(qri3, qri8);

    const uint64_t ssl4 = sl4;
    const v128_t qsl4 = ql4;
    const uint64_t ssr4 = sri4;
    const v128_t qsr4 = qri4;

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
    const v128_t mask29_i64x2 = wasm_i64x2_splat(0x1fffffff);
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
        v128_t tlo_##lo##_m = wasm_v128_and(tlo_##lo, mask29_i64x2);                                                   \
        v128_t thi_##lo##_m = wasm_v128_and(thi_##lo, mask29_i64x2);                                                   \
        v128_t km_q = wasm_i8x16_shuffle(tlo_##lo##_m,                                                                 \
                                          thi_##lo##_m,                                                                \
                                          0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);                   \
        v128_t carry_q_lo = wasm_u64x2_shr(tlo_##lo, 29);                                                              \
        v128_t carry_q_hi = wasm_u64x2_shr(thi_##lo, 29);                                                              \
        temp_##lo##_plus1 += km_s * R_INV_WASM[0] + carry_s;                                                           \
        tlo_##lo##_plus1 = wasm_i64x2_add(wasm_i64x2_add(tlo_##lo##_plus1, wasm_u64x2_extmul_low_u32x4(km_q, r_inv0)), \
                                          carry_q_lo);                                                                 \
        thi_##lo##_plus1 = wasm_i64x2_add(wasm_i64x2_add(thi_##lo##_plus1, wasm_u64x2_extmul_high_u32x4(km_q, r_inv0)),\
                                          carry_q_hi);                                                                 \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus1, tlo_##lo##_plus1, thi_##lo##_plus1);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus2 += km_s * R_INV_WASM[1];                                                                     \
        tlo_##lo##_plus2 = wasm_i64x2_add(tlo_##lo##_plus2, wasm_u64x2_extmul_low_u32x4(km_q, r_inv1));                \
        thi_##lo##_plus2 = wasm_i64x2_add(thi_##lo##_plus2, wasm_u64x2_extmul_high_u32x4(km_q, r_inv1));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus2, tlo_##lo##_plus2, thi_##lo##_plus2);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus3 += km_s * R_INV_WASM[2];                                                                     \
        tlo_##lo##_plus3 = wasm_i64x2_add(tlo_##lo##_plus3, wasm_u64x2_extmul_low_u32x4(km_q, r_inv2));                \
        thi_##lo##_plus3 = wasm_i64x2_add(thi_##lo##_plus3, wasm_u64x2_extmul_high_u32x4(km_q, r_inv2));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus3, tlo_##lo##_plus3, thi_##lo##_plus3);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus4 += km_s * R_INV_WASM[3];                                                                     \
        tlo_##lo##_plus4 = wasm_i64x2_add(tlo_##lo##_plus4, wasm_u64x2_extmul_low_u32x4(km_q, r_inv3));                \
        thi_##lo##_plus4 = wasm_i64x2_add(thi_##lo##_plus4, wasm_u64x2_extmul_high_u32x4(km_q, r_inv3));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus4, tlo_##lo##_plus4, thi_##lo##_plus4);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus5 += km_s * R_INV_WASM[4];                                                                     \
        tlo_##lo##_plus5 = wasm_i64x2_add(tlo_##lo##_plus5, wasm_u64x2_extmul_low_u32x4(km_q, r_inv4));                \
        thi_##lo##_plus5 = wasm_i64x2_add(thi_##lo##_plus5, wasm_u64x2_extmul_high_u32x4(km_q, r_inv4));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus5, tlo_##lo##_plus5, thi_##lo##_plus5);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus6 += km_s * R_INV_WASM[5];                                                                     \
        tlo_##lo##_plus6 = wasm_i64x2_add(tlo_##lo##_plus6, wasm_u64x2_extmul_low_u32x4(km_q, r_inv5));                \
        thi_##lo##_plus6 = wasm_i64x2_add(thi_##lo##_plus6, wasm_u64x2_extmul_high_u32x4(km_q, r_inv5));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus6, tlo_##lo##_plus6, thi_##lo##_plus6);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus7 += km_s * R_INV_WASM[6];                                                                     \
        tlo_##lo##_plus7 = wasm_i64x2_add(tlo_##lo##_plus7, wasm_u64x2_extmul_low_u32x4(km_q, r_inv6));                \
        thi_##lo##_plus7 = wasm_i64x2_add(thi_##lo##_plus7, wasm_u64x2_extmul_high_u32x4(km_q, r_inv6));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus7, tlo_##lo##_plus7, thi_##lo##_plus7);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
        temp_##lo##_plus8 += km_s * R_INV_WASM[7];                                                                     \
        tlo_##lo##_plus8 = wasm_i64x2_add(tlo_##lo##_plus8, wasm_u64x2_extmul_low_u32x4(km_q, r_inv7));                \
        thi_##lo##_plus8 = wasm_i64x2_add(thi_##lo##_plus8, wasm_u64x2_extmul_high_u32x4(km_q, r_inv7));               \
        vector_field_detail::bb_vf_barrier_sqq(temp_##lo##_plus8, tlo_##lo##_plus8, thi_##lo##_plus8);                 \
        asm volatile("" : "+r"(km_q));                                                                                 \
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
        const v128_t tlo_8_m = wasm_v128_and(tlo_8, mask29_i64x2);
        const v128_t thi_8_m = wasm_v128_and(thi_8, mask29_i64x2);
        const v128_t t8_i32x4 = wasm_i8x16_shuffle(tlo_8_m,
                                                    thi_8_m,
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
    // ============================================================

    uint64_t temp_17 = 0;
    v128_t tlo_17 = wasm_i64x2_splat(0);
    v128_t thi_17 = wasm_i64x2_splat(0);

    temp_10 += temp_9 >> 29;
    tlo_10 = wasm_i64x2_add(tlo_10, wasm_u64x2_shr(tlo_9, 29));
    thi_10 = wasm_i64x2_add(thi_10, wasm_u64x2_shr(thi_9, 29));
    temp_9 &= MASK29;
    tlo_9 = wasm_v128_and(tlo_9, mask29_i64x2);
    thi_9 = wasm_v128_and(thi_9, mask29_i64x2);

    temp_11 += temp_10 >> 29;
    tlo_11 = wasm_i64x2_add(tlo_11, wasm_u64x2_shr(tlo_10, 29));
    thi_11 = wasm_i64x2_add(thi_11, wasm_u64x2_shr(thi_10, 29));
    temp_10 &= MASK29;
    tlo_10 = wasm_v128_and(tlo_10, mask29_i64x2);
    thi_10 = wasm_v128_and(thi_10, mask29_i64x2);

    temp_12 += temp_11 >> 29;
    tlo_12 = wasm_i64x2_add(tlo_12, wasm_u64x2_shr(tlo_11, 29));
    thi_12 = wasm_i64x2_add(thi_12, wasm_u64x2_shr(thi_11, 29));
    temp_11 &= MASK29;
    tlo_11 = wasm_v128_and(tlo_11, mask29_i64x2);
    thi_11 = wasm_v128_and(thi_11, mask29_i64x2);

    temp_13 += temp_12 >> 29;
    tlo_13 = wasm_i64x2_add(tlo_13, wasm_u64x2_shr(tlo_12, 29));
    thi_13 = wasm_i64x2_add(thi_13, wasm_u64x2_shr(thi_12, 29));
    temp_12 &= MASK29;
    tlo_12 = wasm_v128_and(tlo_12, mask29_i64x2);
    thi_12 = wasm_v128_and(thi_12, mask29_i64x2);

    temp_14 += temp_13 >> 29;
    tlo_14 = wasm_i64x2_add(tlo_14, wasm_u64x2_shr(tlo_13, 29));
    thi_14 = wasm_i64x2_add(thi_14, wasm_u64x2_shr(thi_13, 29));
    temp_13 &= MASK29;
    tlo_13 = wasm_v128_and(tlo_13, mask29_i64x2);
    thi_13 = wasm_v128_and(thi_13, mask29_i64x2);

    temp_15 += temp_14 >> 29;
    tlo_15 = wasm_i64x2_add(tlo_15, wasm_u64x2_shr(tlo_14, 29));
    thi_15 = wasm_i64x2_add(thi_15, wasm_u64x2_shr(thi_14, 29));
    temp_14 &= MASK29;
    tlo_14 = wasm_v128_and(tlo_14, mask29_i64x2);
    thi_14 = wasm_v128_and(thi_14, mask29_i64x2);

    temp_16 += temp_15 >> 29;
    tlo_16 = wasm_i64x2_add(tlo_16, wasm_u64x2_shr(tlo_15, 29));
    thi_16 = wasm_i64x2_add(thi_16, wasm_u64x2_shr(thi_15, 29));
    temp_15 &= MASK29;
    tlo_15 = wasm_v128_and(tlo_15, mask29_i64x2);
    thi_15 = wasm_v128_and(thi_15, mask29_i64x2);

    temp_17 += temp_16 >> 29;
    tlo_17 = wasm_i64x2_add(tlo_17, wasm_u64x2_shr(tlo_16, 29));
    thi_17 = wasm_i64x2_add(thi_17, wasm_u64x2_shr(thi_16, 29));
    temp_16 &= MASK29;
    tlo_16 = wasm_v128_and(tlo_16, mask29_i64x2);
    thi_16 = wasm_v128_and(thi_16, mask29_i64x2);

    // ============================================================
    // Stage 9/10: Store output (no conditional subtract needed).
    //
    // Per field_impl_generic.hpp line 863, the Karatsuba+Yuval result is in
    // [0, p] already (tighter than coarse [0, 2p)), so no final subtract-p is
    // required. We simply emit temp_9..temp_17 as the 9-limb output. The
    // scalar reference (field<>::montgomery_mul WASM path, line 892-896)
    // similarly skips any conditional subtract.
    //
    // Quad output: shuffle (tlo_lo, thi_hi) back into i32x4 form. The low 32
    // bits of each i64x2 lane hold the 29-bit limb value.
    // ============================================================

    result.scalar_data[0] = temp_9;
    result.quad_data[0] = wasm_i8x16_shuffle(
        tlo_9, thi_9, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[1] = temp_10;
    result.quad_data[1] = wasm_i8x16_shuffle(
        tlo_10, thi_10, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[2] = temp_11;
    result.quad_data[2] = wasm_i8x16_shuffle(
        tlo_11, thi_11, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[3] = temp_12;
    result.quad_data[3] = wasm_i8x16_shuffle(
        tlo_12, thi_12, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[4] = temp_13;
    result.quad_data[4] = wasm_i8x16_shuffle(
        tlo_13, thi_13, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[5] = temp_14;
    result.quad_data[5] = wasm_i8x16_shuffle(
        tlo_14, thi_14, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[6] = temp_15;
    result.quad_data[6] = wasm_i8x16_shuffle(
        tlo_15, thi_15, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[7] = temp_16;
    result.quad_data[7] = wasm_i8x16_shuffle(
        tlo_16, thi_16, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    result.scalar_data[8] = temp_17;
    result.quad_data[8] = wasm_i8x16_shuffle(
        tlo_17, thi_17, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);

    return result;
}

#else // !BB_VECTOR_FIELD_SIMD

// ======================== Portable fallback ========================
// No SIMD: store 5 fields side-by-side, apply scalar field ops one at a time.
// Used on native x86/ARM builds.

template <class Params> inline void VectorField<Params>::store_from_array(const std::array<Field, 5>& in) noexcept
{
    for (size_t i = 0; i < 5; ++i) {
        elts[i] = in[i];
    }
}

template <class Params> inline void VectorField<Params>::load_to_array(std::array<Field, 5>& out) const noexcept
{
    for (size_t i = 0; i < 5; ++i) {
        out[i] = elts[i];
    }
}

template <class Params>
inline VectorField<Params> VectorField<Params>::operator+(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] + other.elts[i];
    }
    return r;
}

template <class Params>
inline VectorField<Params> VectorField<Params>::operator-(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] - other.elts[i];
    }
    return r;
}

template <class Params>
inline VectorField<Params> VectorField<Params>::operator*(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] * other.elts[i];
    }
    return r;
}

template <class Params> inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    uint32_t m = 0;
    for (size_t i = 0; i < 5; ++i) {
        if (elts[i] == other.elts[i]) {
            m |= (1u << i);
        }
    }
    return m;
}

template <class Params> inline uint32_t VectorField<Params>::is_zero() const noexcept
{
    uint32_t m = 0;
    for (size_t i = 0; i < 5; ++i) {
        if (elts[i].is_zero()) {
            m |= (1u << i);
        }
    }
    return m;
}

#endif // BB_VECTOR_FIELD_SIMD

} // namespace bb
