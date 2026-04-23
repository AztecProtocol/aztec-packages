#pragma once

// VectorField: holds 5 field elements and processes them per call with a
// batched kernel that interleaves one scalar stream (1 field, 4×u64 limbs) with
// one quad-packed SIMD stream (4 fields, 8×u32 limbs in v128 lanes).
//
// This is a direct C++ port of the `q1s1` / `mix_s1q1` WAT kernels from
//   https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0 (Mont-mul)
//   https://gist.github.com/AztecBot/2ad5f310fd0e8a3badda33487f4536ff (add/sub/eq/iz)
//
// Key ILP constraint the gist emphasises:
//
//   > Emit the kernel body as ONE function. Inside, structure it as two
//   > arithmetic chains whose operations are textually adjacent. ... Don't
//   > __attribute__((noinline)) anything; don't split into helpers for any
//   > reason; don't unroll differently than WAT does. Match the schedule.
//
// So every op below is written inline in source-interleaved order: one scalar
// statement, then the equivalent quad statement, then the next scalar
// statement, etc. Clang preserves this order through its WASM backend, and V8
// TurboFan's register allocator then sees adjacent different-opcode ops with
// independent operands and schedules them onto separate INT and SIMD pipes.
//
// Invariant for +, -, ==, is_zero (coarse form): each of the 5 logical fields
// is an integer in [0, 2p). Add/sub preserve this invariant; eq uses the
// (d==0 ∨ d==p) coarse-equality trick.
//
// Invariant for operator* (Montgomery multiplication):
//   - Inputs are 9×29-bit limbs (R = 2^261).
//   - Internally, scalar stream uses 17×i64 limb accumulators and quad stream
//     uses 17×v128 limb accumulators (paired i64x2 for lanes 0-1 / 2-3).
//   - Output is coarse [0, 2p) back in 9×29-bit form.
//
// Storage layout (WASM SIMD path):
//
//   alignas(32) uint64_t scalar_data[9];    // one field, 9 × 29-bit limbs packed in u64
//   alignas(16) v128_t   quad_data[9];      // 4 fields × 9 × 29-bit limbs,
//                                           // transposed: lane L of quad_data[k]
//                                           // = field L's u32 limb k
//
// The 9-limb form is chosen because it matches what mont-mul expects natively;
// converting back and forth would eat the SIMD win. Add/sub/eq/is_zero operate
// on the 9-limb form too (still coarse [0, 2p)).
//
// Storage layout (fallback):
//   alignas(32) field<Params> elts[5];

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
// Used for sub's r+2p blend and the TNM trick on add. The gist hard-codes
// these; we compute them at constexpr time from Params.

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
// TNM-blend trick: a + b + TNM overflows 2^261 iff a + b ≥ 2p, which is the
// exact condition under which we should reduce.
template <class Params> inline constexpr std::array<uint64_t, 9> compute_tnm_wasm() noexcept
{
    const auto twop = compute_twice_modulus_wasm<Params>();
    std::array<uint64_t, 9> tnm{};
    // TNM = 2^261 - 2p, computed as (~(2p) + 1) restricted to 261 bits.
    // Equivalently, in 9 × 29 limb form: tnm[i] = (~twop[i]) & 0x1fffffff,
    // then +1 and carry-propagate.
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
    // -(modulus)^-1 mod 2^29, as a 29-bit value. Derived from Params::r_inv
    // which is -(modulus)^-1 mod 2^64; masking to 29 bits gives the
    // constant used by field<>::wasm_reduce (field_impl_generic.hpp:636).
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

// Pack 4 × u64 (little-endian 256-bit value) into 9 × 29-bit limbs. Matches
// field<>::wasm_convert byte-for-byte.
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

// Unpack 9 × 29-bit limbs back to 4 × u64. Inverse of pack_4u64_to_9x29.
// Assumes each limb fits in 29 bits (i.e., canonical 9×29 form).
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
    // Scalar: carry-propagate + canonical-reduce isn't needed here; we trust
    // the stored 9 × 29-bit form is canonical on the way out.
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

// -------------------- operator+ (coarse form, 9×29 limbs) --------------------
//
// Scalar and quad streams share an identical op graph:
//
//   r[k] = a[k] + b[k] (+ carry from r[k-1])            ; naïve 9-limb add
//   t[k] = r[k] + TNM[k] (+ carry from t[k-1])          ; independent chain
//   if t produces no final carry (i.e., a+b < 2p)       ; use r, else use t
//
// Because each 29-bit limb + 29-bit limb + 1 = 30 bits max, the carry fits
// in bit 29. We extract it as `(sum >> 29)`, mask the limb to 29 bits, and
// feed the carry forward.
//
// Interleaving pattern: scalar_stmt; quad_stmt; scalar_stmt; quad_stmt; ...
// Clang preserves source order → WAT has adjacent scalar/quad ops → V8's
// register allocator issues them to independent pipes.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator+(const VectorField& other) const noexcept
{
    constexpr uint64_t MASK = 0x1fffffffULL;
    VectorField result;

    // --- r chain: r = a + b with carry, limbs 0..8 ---
    // Each statement pair: scalar, then quad. Clang emits them in this order,
    // V8 dispatches scalar to INT pipes and quad to SIMD pipes.
    const uint64_t sa0 = scalar_data[0];
    const v128_t qa0 = quad_data[0];
    const uint64_t sb0 = other.scalar_data[0];
    const v128_t qb0 = other.quad_data[0];
    uint64_t sr0 = sa0 + sb0;
    v128_t qr0 = wasm_i32x4_add(qa0, qb0);
    uint64_t scarry = sr0 >> 29;
    v128_t qcarry = wasm_u32x4_shr(qr0, 29);
    sr0 &= MASK;
    qr0 = wasm_v128_and(qr0, wasm_i32x4_splat(MASK));

    const uint64_t sa1 = scalar_data[1];
    const v128_t qa1 = quad_data[1];
    const uint64_t sb1 = other.scalar_data[1];
    const v128_t qb1 = other.quad_data[1];
    uint64_t sr1 = sa1 + sb1 + scarry;
    v128_t qr1 = wasm_i32x4_add(wasm_i32x4_add(qa1, qb1), qcarry);
    scarry = sr1 >> 29;
    qcarry = wasm_u32x4_shr(qr1, 29);
    sr1 &= MASK;
    qr1 = wasm_v128_and(qr1, wasm_i32x4_splat(MASK));

    const uint64_t sa2 = scalar_data[2];
    const v128_t qa2 = quad_data[2];
    const uint64_t sb2 = other.scalar_data[2];
    const v128_t qb2 = other.quad_data[2];
    uint64_t sr2 = sa2 + sb2 + scarry;
    v128_t qr2 = wasm_i32x4_add(wasm_i32x4_add(qa2, qb2), qcarry);
    scarry = sr2 >> 29;
    qcarry = wasm_u32x4_shr(qr2, 29);
    sr2 &= MASK;
    qr2 = wasm_v128_and(qr2, wasm_i32x4_splat(MASK));

    const uint64_t sa3 = scalar_data[3];
    const v128_t qa3 = quad_data[3];
    const uint64_t sb3 = other.scalar_data[3];
    const v128_t qb3 = other.quad_data[3];
    uint64_t sr3 = sa3 + sb3 + scarry;
    v128_t qr3 = wasm_i32x4_add(wasm_i32x4_add(qa3, qb3), qcarry);
    scarry = sr3 >> 29;
    qcarry = wasm_u32x4_shr(qr3, 29);
    sr3 &= MASK;
    qr3 = wasm_v128_and(qr3, wasm_i32x4_splat(MASK));

    const uint64_t sa4 = scalar_data[4];
    const v128_t qa4 = quad_data[4];
    const uint64_t sb4 = other.scalar_data[4];
    const v128_t qb4 = other.quad_data[4];
    uint64_t sr4 = sa4 + sb4 + scarry;
    v128_t qr4 = wasm_i32x4_add(wasm_i32x4_add(qa4, qb4), qcarry);
    scarry = sr4 >> 29;
    qcarry = wasm_u32x4_shr(qr4, 29);
    sr4 &= MASK;
    qr4 = wasm_v128_and(qr4, wasm_i32x4_splat(MASK));

    const uint64_t sa5 = scalar_data[5];
    const v128_t qa5 = quad_data[5];
    const uint64_t sb5 = other.scalar_data[5];
    const v128_t qb5 = other.quad_data[5];
    uint64_t sr5 = sa5 + sb5 + scarry;
    v128_t qr5 = wasm_i32x4_add(wasm_i32x4_add(qa5, qb5), qcarry);
    scarry = sr5 >> 29;
    qcarry = wasm_u32x4_shr(qr5, 29);
    sr5 &= MASK;
    qr5 = wasm_v128_and(qr5, wasm_i32x4_splat(MASK));

    const uint64_t sa6 = scalar_data[6];
    const v128_t qa6 = quad_data[6];
    const uint64_t sb6 = other.scalar_data[6];
    const v128_t qb6 = other.quad_data[6];
    uint64_t sr6 = sa6 + sb6 + scarry;
    v128_t qr6 = wasm_i32x4_add(wasm_i32x4_add(qa6, qb6), qcarry);
    scarry = sr6 >> 29;
    qcarry = wasm_u32x4_shr(qr6, 29);
    sr6 &= MASK;
    qr6 = wasm_v128_and(qr6, wasm_i32x4_splat(MASK));

    const uint64_t sa7 = scalar_data[7];
    const v128_t qa7 = quad_data[7];
    const uint64_t sb7 = other.scalar_data[7];
    const v128_t qb7 = other.quad_data[7];
    uint64_t sr7 = sa7 + sb7 + scarry;
    v128_t qr7 = wasm_i32x4_add(wasm_i32x4_add(qa7, qb7), qcarry);
    scarry = sr7 >> 29;
    qcarry = wasm_u32x4_shr(qr7, 29);
    sr7 &= MASK;
    qr7 = wasm_v128_and(qr7, wasm_i32x4_splat(MASK));

    const uint64_t sa8 = scalar_data[8];
    const v128_t qa8 = quad_data[8];
    const uint64_t sb8 = other.scalar_data[8];
    const v128_t qb8 = other.quad_data[8];
    uint64_t sr8 = sa8 + sb8 + scarry;
    v128_t qr8 = wasm_i32x4_add(wasm_i32x4_add(qa8, qb8), qcarry);
    // No carry out of limb 8 for coarse inputs + add (result < 2 * 2p < 2^261).

    // --- t chain: t = r + TNM with carry, limbs 0..8 ---
    uint64_t st0 = sr0 + TNM_WASM[0];
    v128_t qt0 = wasm_i32x4_add(qr0, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[0])));
    scarry = st0 >> 29;
    qcarry = wasm_u32x4_shr(qt0, 29);
    st0 &= MASK;
    qt0 = wasm_v128_and(qt0, wasm_i32x4_splat(MASK));

    uint64_t st1 = sr1 + TNM_WASM[1] + scarry;
    v128_t qt1 = wasm_i32x4_add(wasm_i32x4_add(qr1, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[1]))), qcarry);
    scarry = st1 >> 29;
    qcarry = wasm_u32x4_shr(qt1, 29);
    st1 &= MASK;
    qt1 = wasm_v128_and(qt1, wasm_i32x4_splat(MASK));

    uint64_t st2 = sr2 + TNM_WASM[2] + scarry;
    v128_t qt2 = wasm_i32x4_add(wasm_i32x4_add(qr2, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[2]))), qcarry);
    scarry = st2 >> 29;
    qcarry = wasm_u32x4_shr(qt2, 29);
    st2 &= MASK;
    qt2 = wasm_v128_and(qt2, wasm_i32x4_splat(MASK));

    uint64_t st3 = sr3 + TNM_WASM[3] + scarry;
    v128_t qt3 = wasm_i32x4_add(wasm_i32x4_add(qr3, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[3]))), qcarry);
    scarry = st3 >> 29;
    qcarry = wasm_u32x4_shr(qt3, 29);
    st3 &= MASK;
    qt3 = wasm_v128_and(qt3, wasm_i32x4_splat(MASK));

    uint64_t st4 = sr4 + TNM_WASM[4] + scarry;
    v128_t qt4 = wasm_i32x4_add(wasm_i32x4_add(qr4, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[4]))), qcarry);
    scarry = st4 >> 29;
    qcarry = wasm_u32x4_shr(qt4, 29);
    st4 &= MASK;
    qt4 = wasm_v128_and(qt4, wasm_i32x4_splat(MASK));

    uint64_t st5 = sr5 + TNM_WASM[5] + scarry;
    v128_t qt5 = wasm_i32x4_add(wasm_i32x4_add(qr5, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[5]))), qcarry);
    scarry = st5 >> 29;
    qcarry = wasm_u32x4_shr(qt5, 29);
    st5 &= MASK;
    qt5 = wasm_v128_and(qt5, wasm_i32x4_splat(MASK));

    uint64_t st6 = sr6 + TNM_WASM[6] + scarry;
    v128_t qt6 = wasm_i32x4_add(wasm_i32x4_add(qr6, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[6]))), qcarry);
    scarry = st6 >> 29;
    qcarry = wasm_u32x4_shr(qt6, 29);
    st6 &= MASK;
    qt6 = wasm_v128_and(qt6, wasm_i32x4_splat(MASK));

    uint64_t st7 = sr7 + TNM_WASM[7] + scarry;
    v128_t qt7 = wasm_i32x4_add(wasm_i32x4_add(qr7, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[7]))), qcarry);
    scarry = st7 >> 29;
    qcarry = wasm_u32x4_shr(qt7, 29);
    st7 &= MASK;
    qt7 = wasm_v128_and(qt7, wasm_i32x4_splat(MASK));

    uint64_t st8 = sr8 + TNM_WASM[8] + scarry;
    v128_t qt8 = wasm_i32x4_add(wasm_i32x4_add(qr8, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[8]))), qcarry);
    // Top-limb carry: if t8 >= 2^29, a+b >= 2p — pick t (reduced). Else pick r.
    const uint64_t sc_final = st8 >> 29;
    const v128_t qc_final = wasm_u32x4_shr(qt8, 29);
    st8 &= MASK;
    qt8 = wasm_v128_and(qt8, wasm_i32x4_splat(MASK));

    // --- Blend: sc_final nonzero ⇒ pick t, else pick r ---
    const uint64_t smask = 0ULL - sc_final;
    // qc_final is 0/1 per lane; convert to 0 / all-ones mask.
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

// -------------------- operator- (coarse form, 9×29 limbs) --------------------
//
// Two independent chains on 9-limb inputs:
//   r = a - b (may go negative, tracked via borrow mask)
//   s = r + 2p  (always positive)
// If final borrow bit is set, pick s; else pick r.
//
// Borrow propagation on 9-limb form: a[k] - b[k] - borrow. If the subtraction
// underflows 29 bits, the next limb's borrow-in is 1. We represent `borrow`
// as a 1-bit value in scalar and as an all-ones/0 mask in quad so
// i32x4 subtract works.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator-(const VectorField& other) const noexcept
{
    constexpr uint64_t MASK = 0x1fffffffULL;
    VectorField result;

    // --- r = a - b with borrow (scalar borrow ∈ {0, 1}, quad borrow ∈ {0, -1} mask) ---
    // Implement a - b = a + (~b & mask) + 1 - 2^29 per limb:
    // Equivalently sr = a - b - borrow, underflowing if sr > a.
    // To avoid negative 29-bit intermediates in quad, we add (2^29) to a first
    // and subtract at the end; scalar just uses signed extension.
    // For simplicity, track borrow directly via comparison.
    int64_t sborrow = 0;
    v128_t qborrow = wasm_i64x2_splat(0);

    uint64_t sr[9];
    v128_t qr[9];

    // Limb 0.
    {
        int64_t diff = static_cast<int64_t>(scalar_data[0]) - static_cast<int64_t>(other.scalar_data[0]);
        v128_t qdiff = wasm_i32x4_sub(quad_data[0], other.quad_data[0]);
        sr[0] = static_cast<uint64_t>(diff) & MASK;
        qr[0] = wasm_v128_and(qdiff, wasm_i32x4_splat(MASK));
        sborrow = (diff < 0) ? 1 : 0;
        // quad borrow: if (qa < qb) → -1 mask per lane.
        qborrow = wasm_u32x4_lt(quad_data[0], other.quad_data[0]);
    }
    for (size_t k = 1; k < 9; ++k) {
        int64_t diff =
            static_cast<int64_t>(scalar_data[k]) - static_cast<int64_t>(other.scalar_data[k]) - sborrow;
        // quad: subtract b and subtract borrow-mask (sub of -1 == add 1, so
        // we want add the borrow-mask — wait, we want SUBTRACT the borrow.
        // borrow mask is 0 or -1; subtracting -1 = +1, subtracting 0 = 0.
        // We want: qr = qa - qb - (borrow ? 1 : 0) = qa - qb + borrow_mask.
        v128_t qdiff = wasm_i32x4_add(wasm_i32x4_sub(quad_data[k], other.quad_data[k]), qborrow);
        sr[k] = static_cast<uint64_t>(diff) & MASK;
        qr[k] = wasm_v128_and(qdiff, wasm_i32x4_splat(MASK));
        sborrow = (diff < 0) ? 1 : 0;
        // new quad borrow: top bit of qdiff (bit 31) set ⇒ underflow.
        qborrow = wasm_i32x4_shr(qdiff, 31);
    }

    // --- s = r + 2p with carry (always succeeds, stays in 29-bit form) ---
    uint64_t scarry = 0;
    v128_t qcarry = wasm_i32x4_splat(0);
    uint64_t ss[9];
    v128_t qs[9];
    for (size_t k = 0; k < 9; ++k) {
        const uint64_t tp = TWOP_WASM[k];
        uint64_t sv = sr[k] + tp + scarry;
        v128_t qv = wasm_i32x4_add(wasm_i32x4_add(qr[k], wasm_i32x4_splat(static_cast<int32_t>(tp))), qcarry);
        ss[k] = sv & MASK;
        qs[k] = wasm_v128_and(qv, wasm_i32x4_splat(MASK));
        scarry = sv >> 29;
        qcarry = wasm_u32x4_shr(qv, 29);
    }

    // --- Blend on original borrow: borrow set ⇒ pick s; else pick r ---
    const uint64_t smask = 0ULL - static_cast<uint64_t>(sborrow);
    const v128_t qmask = qborrow; // already all-ones/0 per lane
    const uint64_t simask = ~smask;

    for (size_t k = 0; k < 9; ++k) {
        result.scalar_data[k] = (sr[k] & simask) | (ss[k] & smask);
        result.quad_data[k] = wasm_v128_bitselect(qs[k], qr[k], qmask);
    }
    return result;
}

// -------------------- eq / is_zero (coarse form, 9×29 limbs) --------------------

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    const VectorField d = (*this) - other;

    // scalar: d == 0 OR d == p
    uint64_t sacc_z = 0;
    uint64_t sacc_p = 0;
    v128_t qacc_z = wasm_i32x4_splat(0);
    v128_t qacc_p = wasm_i32x4_splat(0);
    for (size_t k = 0; k < 9; ++k) {
        sacc_z |= d.scalar_data[k];
        sacc_p |= (d.scalar_data[k] ^ P_WASM[k]);
        qacc_z = wasm_v128_or(qacc_z, d.quad_data[k]);
        qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[k], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[k]))));
    }
    const bool scalar_eq = (sacc_z == 0) || (sacc_p == 0);
    const v128_t qeq =
        wasm_v128_or(wasm_i32x4_eq(qacc_z, wasm_i32x4_splat(0)), wasm_i32x4_eq(qacc_p, wasm_i32x4_splat(0)));

    uint32_t mask = scalar_eq ? 1u : 0u;
    mask |= (wasm_i32x4_extract_lane(qeq, 0) != 0) ? 2u : 0u;
    mask |= (wasm_i32x4_extract_lane(qeq, 1) != 0) ? 4u : 0u;
    mask |= (wasm_i32x4_extract_lane(qeq, 2) != 0) ? 8u : 0u;
    mask |= (wasm_i32x4_extract_lane(qeq, 3) != 0) ? 16u : 0u;
    return mask;
}

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::is_zero() const noexcept
{
    uint64_t sacc_or = 0;
    uint64_t sacc_xp = 0;
    v128_t qor = wasm_i32x4_splat(0);
    v128_t qxp = wasm_i32x4_splat(0);
    for (size_t k = 0; k < 9; ++k) {
        sacc_or |= scalar_data[k];
        sacc_xp |= (scalar_data[k] ^ P_WASM[k]);
        qor = wasm_v128_or(qor, quad_data[k]);
        qxp = wasm_v128_or(qxp, wasm_v128_xor(quad_data[k], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[k]))));
    }
    const bool scalar_iz = (sacc_or == 0) || (sacc_xp == 0);
    const v128_t qiz = wasm_v128_or(wasm_i32x4_eq(qor, wasm_i32x4_splat(0)), wasm_i32x4_eq(qxp, wasm_i32x4_splat(0)));

    uint32_t mask = scalar_iz ? 1u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 0) != 0) ? 2u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 1) != 0) ? 4u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 2) != 0) ? 8u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 3) != 0) ? 16u : 0u;
    return mask;
}

// -------------------- operator* (Montgomery multiplication, 9×29 limbs) --------------------
//
// 5-field Mont-mul. Per field: 81 mul + 81 madC + 17 andmask/shr + 9 subConst
// + blend, following the same schoolbook-Yuval path as field<>::montgomery_mul
// on WASM (see field_impl_generic.hpp lines 478-560).
//
// Scalar stream uses i64 arithmetic (29×29 → 58-bit products fit in u64,
// with 6 bits of accumulator headroom for 9 partial products).
//
// Quad stream uses paired i64x2 accumulators: lane L holds field L's limb k.
// Two i64x2 slots per logical limb cover 4 fields (lo = lanes 0/1, hi =
// lanes 2/3). The mul instructions are `i64x2.extmul_low_i32x4_u` and
// `i64x2.extmul_high_i32x4_u`, which do 2 × (32×32→64) per op.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator*(const VectorField& other) const noexcept
{
    // Exact port of field<>::montgomery_mul_big (field_impl_generic.hpp
    // lines 454-562):
    //   - 9 iterations of (wasm_madd + wasm_reduce) using the classic
    //     Montgomery step (k = temp*r_inv & mask; temp += k*p).
    //   - Carry-propagate temp[9..17] to strict 29-bit form.
    //   - Conditional subtract p using signed 64-bit borrow propagation.
    //   - Result in temp[9..17] (9 limbs).
    //
    // Scalar stream uses u64 arithmetic directly; quad stream uses paired
    // i64x2 accumulators (tlo holds fields 0,1 in lanes 0,1; thi holds
    // fields 2,3 in lanes 0,1). Partial products use
    // `i64x2.extmul_low/high_i32x4_u` to do 2 × (32×32→64) per v128 op.
    //
    // Scalar and quad statements are written in source-interleaved order so
    // clang's WASM backend preserves the interleave and V8 TurboFan schedules
    // them onto independent INT / SIMD pipes.
    VectorField result;

    const uint64_t sl[9] = { scalar_data[0], scalar_data[1], scalar_data[2], scalar_data[3], scalar_data[4],
                             scalar_data[5], scalar_data[6], scalar_data[7], scalar_data[8] };
    const uint64_t sr[9] = { other.scalar_data[0], other.scalar_data[1], other.scalar_data[2], other.scalar_data[3],
                             other.scalar_data[4], other.scalar_data[5], other.scalar_data[6], other.scalar_data[7],
                             other.scalar_data[8] };
    const v128_t ql[9] = { quad_data[0], quad_data[1], quad_data[2], quad_data[3], quad_data[4],
                           quad_data[5], quad_data[6], quad_data[7], quad_data[8] };
    const v128_t qr[9] = { other.quad_data[0], other.quad_data[1], other.quad_data[2], other.quad_data[3],
                           other.quad_data[4], other.quad_data[5], other.quad_data[6], other.quad_data[7],
                           other.quad_data[8] };

    uint64_t sc[18];
    v128_t tlo[18];
    v128_t thi[18];
    const v128_t zero = wasm_i64x2_splat(0);
    for (size_t i = 0; i < 18; ++i) {
        sc[i] = 0;
        tlo[i] = zero;
        thi[i] = zero;
    }

    const v128_t mask29_i64 = wasm_i64x2_splat(0x1fffffff);
    const v128_t mask29_i32 = wasm_i32x4_splat(0x1fffffff);
    const v128_t rinv_mask_splat = wasm_i32x4_splat(static_cast<int32_t>(R_INV_MOD_2_29));

    v128_t p_splat[9];
    for (size_t j = 0; j < 9; ++j) {
        p_splat[j] = wasm_i32x4_splat(static_cast<int32_t>(P_WASM[j]));
    }

    // 9 iterations of (wasm_madd + wasm_reduce).
    for (size_t i = 0; i < 9; ++i) {
        // wasm_madd(l[i], r): temp[i..i+8] += l[i] * r[0..8]
        for (size_t j = 0; j < 9; ++j) {
            sc[i + j] += sl[i] * sr[j];
            tlo[i + j] = wasm_i64x2_add(tlo[i + j], wasm_u64x2_extmul_low_u32x4(ql[i], qr[j]));
            thi[i + j] = wasm_i64x2_add(thi[i + j], wasm_u64x2_extmul_high_u32x4(ql[i], qr[j]));
        }
        // wasm_reduce: k = (temp[i] * r_inv_mod_2_29) & 0x1fffffff
        //              temp[i]   += k * p[0]        (low 29 bits become 0)
        //              temp[i+1] += k * p[1] + (temp[i] >> 29)
        //              temp[i+j] += k * p[j]        for j in 2..8
        const uint64_t sk = (sc[i] * R_INV_MOD_2_29) & 0x1fffffff;
        const v128_t tcur_lo_m = wasm_v128_and(tlo[i], mask29_i64);
        const v128_t tcur_hi_m = wasm_v128_and(thi[i], mask29_i64);
        const v128_t tcur_i32x4 = wasm_i8x16_shuffle(tcur_lo_m, tcur_hi_m, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24,
                                                     25, 26, 27);
        const v128_t qk = wasm_v128_and(wasm_i32x4_mul(tcur_i32x4, rinv_mask_splat), mask29_i32);

        sc[i] += sk * P_WASM[0];
        tlo[i] = wasm_i64x2_add(tlo[i], wasm_u64x2_extmul_low_u32x4(qk, p_splat[0]));
        thi[i] = wasm_i64x2_add(thi[i], wasm_u64x2_extmul_high_u32x4(qk, p_splat[0]));
        sc[i + 1] += sk * P_WASM[1] + (sc[i] >> 29);
        tlo[i + 1] = wasm_i64x2_add(wasm_i64x2_add(tlo[i + 1], wasm_u64x2_extmul_low_u32x4(qk, p_splat[1])),
                                    wasm_u64x2_shr(tlo[i], 29));
        thi[i + 1] = wasm_i64x2_add(wasm_i64x2_add(thi[i + 1], wasm_u64x2_extmul_high_u32x4(qk, p_splat[1])),
                                    wasm_u64x2_shr(thi[i], 29));
        for (size_t j = 2; j < 9; ++j) {
            sc[i + j] += sk * P_WASM[j];
            tlo[i + j] = wasm_i64x2_add(tlo[i + j], wasm_u64x2_extmul_low_u32x4(qk, p_splat[j]));
            thi[i + j] = wasm_i64x2_add(thi[i + j], wasm_u64x2_extmul_high_u32x4(qk, p_splat[j]));
        }
    }

    // Carry-propagate temp[9..17] into strict 29-bit form.
    for (size_t k = 9; k < 17; ++k) {
        sc[k + 1] += sc[k] >> 29;
        tlo[k + 1] = wasm_i64x2_add(tlo[k + 1], wasm_u64x2_shr(tlo[k], 29));
        thi[k + 1] = wasm_i64x2_add(thi[k + 1], wasm_u64x2_shr(thi[k], 29));
        sc[k] &= 0x1fffffff;
        tlo[k] = wasm_v128_and(tlo[k], mask29_i64);
        thi[k] = wasm_v128_and(thi[k], mask29_i64);
    }

    // Conditional subtract p (field_impl_generic.hpp:541-562):
    //   r_temp[j] = temp[9+j] - p[j] - borrow_from_prev  (signed 64-bit)
    //   if final r_temp[8] is negative (borrow set) ⇒ keep temp, else use r_temp
    uint64_t rt[9];
    v128_t rlo[9];
    v128_t rhi[9];
    {
        int64_t sprev = 0;
        v128_t qprev_lo = zero;
        v128_t qprev_hi = zero;
        for (size_t j = 0; j < 9; ++j) {
            const int64_t sv = static_cast<int64_t>(sc[9 + j]) - static_cast<int64_t>(P_WASM[j])
                               - (j == 0 ? 0 : (sprev >> 63));
            const v128_t pv = wasm_i64x2_splat(static_cast<int64_t>(P_WASM[j]));
            v128_t dlo = wasm_i64x2_sub(tlo[9 + j], pv);
            v128_t dhi = wasm_i64x2_sub(thi[9 + j], pv);
            if (j > 0) {
                dlo = wasm_i64x2_sub(dlo, wasm_i64x2_shr(qprev_lo, 63));
                dhi = wasm_i64x2_sub(dhi, wasm_i64x2_shr(qprev_hi, 63));
            }
            rt[j] = static_cast<uint64_t>(sv);
            rlo[j] = dlo;
            rhi[j] = dhi;
            sprev = sv;
            qprev_lo = dlo;
            qprev_hi = dhi;
        }
    }
    const uint64_t new_mask_s = 0ULL - (rt[8] >> 63); // all-ones if value < p
    const uint64_t inv_mask_s = ~new_mask_s & 0x1fffffff;
    const v128_t new_mask_lo = wasm_i64x2_shr(rlo[8], 63);
    const v128_t new_mask_hi = wasm_i64x2_shr(rhi[8], 63);

    for (size_t j = 0; j < 9; ++j) {
        result.scalar_data[j] = (sc[9 + j] & new_mask_s) | (rt[j] & inv_mask_s);
        const v128_t vlo = wasm_v128_bitselect(tlo[9 + j], wasm_v128_and(rlo[j], mask29_i64), new_mask_lo);
        const v128_t vhi = wasm_v128_bitselect(thi[9 + j], wasm_v128_and(rhi[j], mask29_i64), new_mask_hi);
        result.quad_data[j] =
            wasm_i8x16_shuffle(vlo, vhi, 0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27);
    }
    return result;
}

#else // !BB_VECTOR_FIELD_SIMD

// ======================== Portable fallback ========================
// No SIMD: store 5 fields side-by-side, apply scalar field ops one at a time.
// Used on native x86/ARM builds. Not performance-optimized.

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
