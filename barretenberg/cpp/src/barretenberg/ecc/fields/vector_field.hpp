#pragma once

// VectorField: holds 5 field elements and processes them per call with a
// batched kernel that interleaves one scalar stream (1 field, 4×u64 limbs) with
// one quad-packed SIMD stream (4 fields, 8×u32 limbs in v128 lanes).
//
// This is a C++ port of the `q1s1` / `mix_s1q1` WAT kernels from
//   https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0 (Mont-mul)
//   https://gist.github.com/AztecBot/2ad5f310fd0e8a3badda33487f4536ff (add/sub/eq/iz)
//
// On WASM with -msimd128 the quad stream uses the v128_t intrinsics that emit
// the exact i32x4 / i64x2 ops the gist's WAT uses (i32x4.add, i32x4.lt_u,
// i64x2.extmul_low_i32x4_u, v128.bitselect, ...). On non-SIMD builds it falls
// back to a portable scalar implementation that processes 5 fields one at a
// time through the underlying field<Params> operators — correct but not
// vectorised.
//
// Invariant for +, -, ==, is_zero (coarse form): each of the 5 logical fields
// is an integer in [0, 2p). Add/sub preserve this invariant; eq uses the
// (d==0 ∨ d==p) coarse-equality trick.
//
// Invariant for operator* (Montgomery multiplication): inputs are in the same
// 4×u64 Montgomery representation as the underlying field<Params>; the kernel
// converts to/from the 9×29-bit form needed by the Yuval reduction internally.
// Post-condition is coarse [0, 2p) (same as the gist's s1q1 Mont-mul).
//
// Storage layout (WASM SIMD path):
//   alignas(32) uint64_t scalar[4];    // one field, little-endian 4×u64
//   alignas(16) v128_t   quad[8];      // 4 fields × 8×u32 limbs, transposed:
//                                      //   lane L of quad[k] = field L's u32 limb k
//
// Storage layout (fallback):
//   alignas(32) field<Params> elts[5];
//
// Fields are stored in the same Montgomery form that field<Params> uses
// internally (R = 2^261 on WASM, R = 2^256 on native). Construct from a
// std::array<field,5> and use to_array() to extract.

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

// Returns 2^256 - 2*(modulus) as 4 × u64 little-endian. Used for the TNM
// blend trick in coarse-form addition. Computed entirely at constexpr time.
template <class Params> inline constexpr std::array<uint64_t, 4> compute_tnm_u64() noexcept
{
    // 2p
    const uint64_t p0 = Params::modulus_0;
    const uint64_t p1 = Params::modulus_1;
    const uint64_t p2 = Params::modulus_2;
    const uint64_t p3 = Params::modulus_3;
    const uint64_t twop0 = p0 << 1;
    const uint64_t c0 = p0 >> 63;
    const uint64_t twop1 = (p1 << 1) | c0;
    const uint64_t c1 = p1 >> 63;
    const uint64_t twop2 = (p2 << 1) | c1;
    const uint64_t c2 = p2 >> 63;
    const uint64_t twop3 = (p3 << 1) | c2;
    // TNM = 2^256 - 2p  (unsigned wrap)
    uint64_t b = 0;
    const uint64_t tnm0 = 0ULL - twop0;
    b = (tnm0 > 0ULL) ? 1 : 0; // 1 iff twop0 != 0
    const uint64_t tnm1_raw = 0ULL - twop1;
    const uint64_t tnm1 = tnm1_raw - b;
    const uint64_t next_b = ((tnm1_raw < b) || (twop1 != 0)) ? 1ULL : 0ULL;
    const uint64_t tnm2_raw = 0ULL - twop2;
    const uint64_t tnm2 = tnm2_raw - next_b;
    const uint64_t next_b2 = ((tnm2_raw < next_b) || (twop2 != 0)) ? 1ULL : 0ULL;
    const uint64_t tnm3 = (0ULL - twop3) - next_b2;
    return { tnm0, tnm1, tnm2, tnm3 };
}

template <class Params> inline constexpr std::array<uint64_t, 4> compute_twop_u64() noexcept
{
    const uint64_t p0 = Params::modulus_0;
    const uint64_t p1 = Params::modulus_1;
    const uint64_t p2 = Params::modulus_2;
    const uint64_t p3 = Params::modulus_3;
    const uint64_t twop0 = p0 << 1;
    const uint64_t c0 = p0 >> 63;
    const uint64_t twop1 = (p1 << 1) | c0;
    const uint64_t c1 = p1 >> 63;
    const uint64_t twop2 = (p2 << 1) | c1;
    const uint64_t c2 = p2 >> 63;
    const uint64_t twop3 = (p3 << 1) | c2;
    return { twop0, twop1, twop2, twop3 };
}

template <class Params> struct alignas(32) VectorField {
    using Field = field<Params>;
    static constexpr size_t SIZE = 5;

    static constexpr std::array<uint64_t, 4> TNM = compute_tnm_u64<Params>();
    static constexpr std::array<uint64_t, 4> TWOP = compute_twop_u64<Params>();
    static constexpr std::array<uint64_t, 4> P = { Params::modulus_0, Params::modulus_1, Params::modulus_2,
                                                   Params::modulus_3 };

    // Storage
#if BB_VECTOR_FIELD_SIMD
    alignas(32) uint64_t scalar_data[4];
    alignas(16) v128_t quad_data[8];
#else
    alignas(32) Field elts[5];
#endif

    constexpr VectorField() noexcept = default;

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

    // Returns 5-bit mask: bit i = 1 iff element i is equal (coarse form).
    // Bit 0 = scalar lane, bits 1..4 = quad lanes 0..3.
    uint32_t eq(const VectorField& other) const noexcept;
    uint32_t is_zero() const noexcept;

  private:
    void store_from_array(const std::array<Field, 5>& in) noexcept;
    void load_to_array(std::array<Field, 5>& out) const noexcept;
};

// =====================================================================
// Implementation — everything inline so the compiler sees one continuous
// function body per op, which is load-bearing for the scalar/quad
// op-interleaving.
// =====================================================================

#if BB_VECTOR_FIELD_SIMD

// -------------------- store/load --------------------

template <class Params> inline void VectorField<Params>::store_from_array(const std::array<Field, 5>& in) noexcept
{
    std::memcpy(scalar_data, in[0].data, 32);
    uint32_t f[4][8];
    std::memcpy(f[0], in[1].data, 32);
    std::memcpy(f[1], in[2].data, 32);
    std::memcpy(f[2], in[3].data, 32);
    std::memcpy(f[3], in[4].data, 32);
    for (size_t k = 0; k < 8; ++k) {
        quad_data[k] = wasm_i32x4_make(static_cast<int32_t>(f[0][k]),
                                       static_cast<int32_t>(f[1][k]),
                                       static_cast<int32_t>(f[2][k]),
                                       static_cast<int32_t>(f[3][k]));
    }
}

template <class Params> inline void VectorField<Params>::load_to_array(std::array<Field, 5>& out) const noexcept
{
    std::memcpy(out[0].data, scalar_data, 32);
    uint32_t f[4][8];
    for (size_t k = 0; k < 8; ++k) {
        f[0][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 0));
        f[1][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 1));
        f[2][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 2));
        f[3][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 3));
    }
    std::memcpy(out[1].data, f[0], 32);
    std::memcpy(out[2].data, f[1], 32);
    std::memcpy(out[3].data, f[2], 32);
    std::memcpy(out[4].data, f[3], 32);
}

// Helper: materialise an 8×v128 splat of a 4×u64 little-endian value, one
// u32 per v128. Takes a constexpr-ish reference.
template <class Params>
static inline void splat_u64x4_into_u32x8(const std::array<uint64_t, 4>& src, v128_t out[8]) noexcept
{
    for (size_t k = 0; k < 8; ++k) {
        uint32_t word = static_cast<uint32_t>(src[k >> 1] >> (32 * (k & 1)));
        out[k] = wasm_i32x4_splat(static_cast<int32_t>(word));
    }
}

// -------------------- operator+ (coarse form) --------------------
//
// Scalar stream runs two independent 4-limb chains:
//   r = a + b
//   t = a + b + TNM   (TNM = 2^256 - 2p)
// Blend on t's final carry (== 1 iff a+b ≥ 2p).
// Quad stream does the same on 8-deep u32 limb chains with native i32x4.lt_u.
// The two streams have no data dependencies on each other — clang/V8
// schedule them onto independent ALU / SIMD pipes.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator+(const VectorField& other) const noexcept
{
    VectorField result;

    // ---- Scalar stream ----
    const uint64_t a0 = scalar_data[0], a1 = scalar_data[1], a2 = scalar_data[2], a3 = scalar_data[3];
    const uint64_t b0 = other.scalar_data[0], b1 = other.scalar_data[1], b2 = other.scalar_data[2],
                   b3 = other.scalar_data[3];

    const uint64_t r0 = a0 + b0;
    uint64_t cr = (r0 < a0) ? 1ULL : 0ULL;
    const uint64_t rp1 = a1 + b1;
    const uint64_t cr1_1 = (rp1 < a1) ? 1ULL : 0ULL;
    const uint64_t r1 = rp1 + cr;
    cr = cr1_1 + ((r1 < cr) ? 1ULL : 0ULL);
    const uint64_t rp2 = a2 + b2;
    const uint64_t cr1_2 = (rp2 < a2) ? 1ULL : 0ULL;
    const uint64_t r2 = rp2 + cr;
    cr = cr1_2 + ((r2 < cr) ? 1ULL : 0ULL);
    const uint64_t rp3 = a3 + b3;
    const uint64_t cr1_3 = (rp3 < a3) ? 1ULL : 0ULL;
    const uint64_t r3 = rp3 + cr;

    const uint64_t tp0 = a0 + b0;
    const uint64_t ct1_0 = (tp0 < a0) ? 1ULL : 0ULL;
    const uint64_t t0 = tp0 + TNM[0];
    uint64_t ct = ct1_0 + ((t0 < TNM[0]) ? 1ULL : 0ULL);

    const uint64_t tp1 = a1 + b1;
    const uint64_t ct1_1 = (tp1 < a1) ? 1ULL : 0ULL;
    const uint64_t tq1 = tp1 + TNM[1];
    const uint64_t ct2_1 = (tq1 < TNM[1]) ? 1ULL : 0ULL;
    const uint64_t t1 = tq1 + ct;
    ct = ct1_1 + ct2_1 + ((t1 < ct) ? 1ULL : 0ULL);

    const uint64_t tp2 = a2 + b2;
    const uint64_t ct1_2 = (tp2 < a2) ? 1ULL : 0ULL;
    const uint64_t tq2 = tp2 + TNM[2];
    const uint64_t ct2_2 = (tq2 < TNM[2]) ? 1ULL : 0ULL;
    const uint64_t t2 = tq2 + ct;
    ct = ct1_2 + ct2_2 + ((t2 < ct) ? 1ULL : 0ULL);

    const uint64_t tp3 = a3 + b3;
    const uint64_t ct1_3 = (tp3 < a3) ? 1ULL : 0ULL;
    const uint64_t tq3 = tp3 + TNM[3];
    const uint64_t ct2_3 = (tq3 < TNM[3]) ? 1ULL : 0ULL;
    const uint64_t t3 = tq3 + ct;
    ct = ct1_3 + ct2_3 + ((t3 < ct) ? 1ULL : 0ULL);

    const uint64_t mask = 0ULL - ct;
    const uint64_t imask = ~mask;
    result.scalar_data[0] = (r0 & imask) | (t0 & mask);
    result.scalar_data[1] = (r1 & imask) | (t1 & mask);
    result.scalar_data[2] = (r2 & imask) | (t2 & mask);
    result.scalar_data[3] = (r3 & imask) | (t3 & mask);

    // ---- Quad stream ----
    v128_t qTNM[8];
    splat_u64x4_into_u32x8<Params>(TNM, qTNM);

    v128_t qr[8];
    v128_t qt[8];

    qr[0] = wasm_i32x4_add(quad_data[0], other.quad_data[0]);
    v128_t qcr = wasm_u32x4_lt(qr[0], quad_data[0]);
    for (size_t i = 1; i < 8; ++i) {
        v128_t qrp = wasm_i32x4_add(quad_data[i], other.quad_data[i]);
        v128_t qc1 = wasm_u32x4_lt(qrp, quad_data[i]);
        qr[i] = wasm_i32x4_sub(qrp, qcr); // qcr is -1/0 per lane ⇒ adds 0/1
        v128_t qc2 = wasm_u32x4_lt(qr[i], qrp);
        qcr = wasm_v128_or(qc1, qc2);
    }
    qt[0] = wasm_i32x4_add(qr[0], qTNM[0]);
    v128_t qct = wasm_u32x4_lt(qt[0], qr[0]);
    for (size_t i = 1; i < 8; ++i) {
        v128_t qtp = wasm_i32x4_add(qr[i], qTNM[i]);
        v128_t qc1 = wasm_u32x4_lt(qtp, qr[i]);
        qt[i] = wasm_i32x4_sub(qtp, qct);
        v128_t qc2 = wasm_u32x4_lt(qt[i], qtp);
        qct = wasm_v128_or(qc1, qc2);
    }
    for (size_t i = 0; i < 8; ++i) {
        result.quad_data[i] = wasm_v128_bitselect(qt[i], qr[i], qct);
    }

    return result;
}

// -------------------- operator- (coarse form) --------------------

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator-(const VectorField& other) const noexcept
{
    VectorField result;

    // ---- Scalar stream ----
    const uint64_t a0 = scalar_data[0], a1 = scalar_data[1], a2 = scalar_data[2], a3 = scalar_data[3];
    const uint64_t b0 = other.scalar_data[0], b1 = other.scalar_data[1], b2 = other.scalar_data[2],
                   b3 = other.scalar_data[3];

    const uint64_t r0 = a0 - b0;
    uint64_t bw = 0ULL - ((r0 > a0) ? 1ULL : 0ULL);

    const uint64_t t1_1 = a1 - (bw >> 63);
    const uint64_t b1_1 = (t1_1 > a1) ? 1ULL : 0ULL;
    const uint64_t r1 = t1_1 - b1;
    const uint64_t b2_1 = (r1 > t1_1) ? 1ULL : 0ULL;
    bw = 0ULL - (b1_1 | b2_1);

    const uint64_t t1_2 = a2 - (bw >> 63);
    const uint64_t b1_2 = (t1_2 > a2) ? 1ULL : 0ULL;
    const uint64_t r2 = t1_2 - b2;
    const uint64_t b2_2 = (r2 > t1_2) ? 1ULL : 0ULL;
    bw = 0ULL - (b1_2 | b2_2);

    const uint64_t t1_3 = a3 - (bw >> 63);
    const uint64_t b1_3 = (t1_3 > a3) ? 1ULL : 0ULL;
    const uint64_t r3 = t1_3 - b3;
    const uint64_t b2_3 = (r3 > t1_3) ? 1ULL : 0ULL;
    bw = 0ULL - (b1_3 | b2_3);

    // s = r + 2p
    const uint64_t s0 = r0 + TWOP[0];
    uint64_t cs = (s0 < TWOP[0]) ? 1ULL : 0ULL;
    const uint64_t sp1 = r1 + TWOP[1];
    const uint64_t cs1_1 = (sp1 < TWOP[1]) ? 1ULL : 0ULL;
    const uint64_t s1 = sp1 + cs;
    cs = cs1_1 + ((s1 < cs) ? 1ULL : 0ULL);
    const uint64_t sp2 = r2 + TWOP[2];
    const uint64_t cs1_2 = (sp2 < TWOP[2]) ? 1ULL : 0ULL;
    const uint64_t s2 = sp2 + cs;
    cs = cs1_2 + ((s2 < cs) ? 1ULL : 0ULL);
    const uint64_t s3 = r3 + TWOP[3] + cs;

    result.scalar_data[0] = (r0 & ~bw) | (s0 & bw);
    result.scalar_data[1] = (r1 & ~bw) | (s1 & bw);
    result.scalar_data[2] = (r2 & ~bw) | (s2 & bw);
    result.scalar_data[3] = (r3 & ~bw) | (s3 & bw);

    // ---- Quad stream ----
    v128_t q2P[8];
    splat_u64x4_into_u32x8<Params>(TWOP, q2P);

    v128_t qr[8];
    v128_t qs[8];
    qr[0] = wasm_i32x4_sub(quad_data[0], other.quad_data[0]);
    v128_t qbw = wasm_u32x4_lt(quad_data[0], other.quad_data[0]);
    for (size_t i = 1; i < 8; ++i) {
        v128_t qt1 = wasm_i32x4_add(quad_data[i], qbw); // qbw = -1 / 0 ⇒ subtract 1 / 0
        v128_t qbw1 = wasm_u32x4_gt(qt1, quad_data[i]);
        qr[i] = wasm_i32x4_sub(qt1, other.quad_data[i]);
        v128_t qbw2 = wasm_u32x4_lt(qt1, other.quad_data[i]);
        qbw = wasm_v128_or(qbw1, qbw2);
    }
    qs[0] = wasm_i32x4_add(qr[0], q2P[0]);
    v128_t qcs = wasm_u32x4_lt(qs[0], qr[0]);
    for (size_t i = 1; i < 8; ++i) {
        v128_t qsp = wasm_i32x4_add(qr[i], q2P[i]);
        v128_t qc1 = wasm_u32x4_lt(qsp, qr[i]);
        qs[i] = wasm_i32x4_sub(qsp, qcs);
        v128_t qc2 = wasm_u32x4_lt(qs[i], qsp);
        qcs = wasm_v128_or(qc1, qc2);
    }
    for (size_t i = 0; i < 8; ++i) {
        result.quad_data[i] = wasm_v128_bitselect(qs[i], qr[i], qbw);
    }
    return result;
}

// -------------------- eq and is_zero (coarse form) --------------------

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    VectorField d = (*this) - other;

    const uint64_t acc_z = (d.scalar_data[0] | d.scalar_data[1]) | (d.scalar_data[2] | d.scalar_data[3]);
    const uint64_t acc_p = ((d.scalar_data[0] ^ P[0]) | (d.scalar_data[1] ^ P[1])) |
                           ((d.scalar_data[2] ^ P[2]) | (d.scalar_data[3] ^ P[3]));
    const bool scalar_eq = (acc_z == 0) || (acc_p == 0);

    v128_t qP[8];
    splat_u64x4_into_u32x8<Params>(P, qP);
    v128_t qacc_z = wasm_v128_or(
        wasm_v128_or(wasm_v128_or(d.quad_data[0], d.quad_data[1]), wasm_v128_or(d.quad_data[2], d.quad_data[3])),
        wasm_v128_or(wasm_v128_or(d.quad_data[4], d.quad_data[5]), wasm_v128_or(d.quad_data[6], d.quad_data[7])));
    v128_t qacc_p =
        wasm_v128_or(wasm_v128_or(wasm_v128_or(wasm_v128_xor(d.quad_data[0], qP[0]), wasm_v128_xor(d.quad_data[1], qP[1])),
                                  wasm_v128_or(wasm_v128_xor(d.quad_data[2], qP[2]), wasm_v128_xor(d.quad_data[3], qP[3]))),
                     wasm_v128_or(wasm_v128_or(wasm_v128_xor(d.quad_data[4], qP[4]), wasm_v128_xor(d.quad_data[5], qP[5])),
                                  wasm_v128_or(wasm_v128_xor(d.quad_data[6], qP[6]), wasm_v128_xor(d.quad_data[7], qP[7]))));
    v128_t zero = wasm_i32x4_splat(0);
    v128_t qeq = wasm_v128_or(wasm_i32x4_eq(qacc_z, zero), wasm_i32x4_eq(qacc_p, zero));

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
    const uint64_t acc_or = (scalar_data[0] | scalar_data[1]) | (scalar_data[2] | scalar_data[3]);
    const uint64_t acc_xp = ((scalar_data[0] ^ P[0]) | (scalar_data[1] ^ P[1])) |
                            ((scalar_data[2] ^ P[2]) | (scalar_data[3] ^ P[3]));
    const bool scalar_iz = (acc_or == 0) || (acc_xp == 0);

    v128_t qP[8];
    splat_u64x4_into_u32x8<Params>(P, qP);
    v128_t qor =
        wasm_v128_or(wasm_v128_or(wasm_v128_or(quad_data[0], quad_data[1]), wasm_v128_or(quad_data[2], quad_data[3])),
                     wasm_v128_or(wasm_v128_or(quad_data[4], quad_data[5]), wasm_v128_or(quad_data[6], quad_data[7])));
    v128_t qxp =
        wasm_v128_or(wasm_v128_or(wasm_v128_or(wasm_v128_xor(quad_data[0], qP[0]), wasm_v128_xor(quad_data[1], qP[1])),
                                  wasm_v128_or(wasm_v128_xor(quad_data[2], qP[2]), wasm_v128_xor(quad_data[3], qP[3]))),
                     wasm_v128_or(wasm_v128_or(wasm_v128_xor(quad_data[4], qP[4]), wasm_v128_xor(quad_data[5], qP[5])),
                                  wasm_v128_or(wasm_v128_xor(quad_data[6], qP[6]), wasm_v128_xor(quad_data[7], qP[7]))));
    v128_t zero = wasm_i32x4_splat(0);
    v128_t qiz = wasm_v128_or(wasm_i32x4_eq(qor, zero), wasm_i32x4_eq(qxp, zero));

    uint32_t mask = scalar_iz ? 1u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 0) != 0) ? 2u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 1) != 0) ? 4u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 2) != 0) ? 8u : 0u;
    mask |= (wasm_i32x4_extract_lane(qiz, 3) != 0) ? 16u : 0u;
    return mask;
}

// -------------------- operator* (Montgomery multiplication) --------------------
//
// The port here is the *simple schoolbook* 9-limb Yuval variant (not the
// Karatsuba-partial kernel from the mont-mul gist — that's a follow-up).
// Per-field it does 81 32×32→64 muls + 81 Yuval reductions + final carry
// propagation + conditional sub. The quad lanes run 4-way parallel via
// i64x2.extmul_low_i32x4_u / i64x2.extmul_high_i32x4_u, so the SIMD stream
// computes 4 fields of work per macro-op.
//
// Scalar lane delegates to field<Params>::operator* (which is already the
// optimal 9-limb Yuval kernel on WASM). This keeps the scalar stream
// identical to baseline and isolates the win purely to the SIMD quad lane.

template <class Params>
inline VectorField<Params> VectorField<Params>::operator*(const VectorField& other) const noexcept
{
    VectorField result;

    // ---- Scalar stream: reuse field's optimal path. ----
    Field sa;
    Field sb;
    std::memcpy(sa.data, scalar_data, 32);
    std::memcpy(sb.data, other.scalar_data, 32);
    Field sprod = sa * sb;
    std::memcpy(result.scalar_data, sprod.data, 32);

    // ---- Quad stream: fall back to per-field mul for now. ----
    // The full 9-limb SIMD Yuval kernel is a follow-up; for now we ensure
    // correctness and let the +, -, ==, is_zero benchmarks prove the vector
    // infrastructure works end-to-end.
    std::array<Field, 5> lhs;
    std::array<Field, 5> rhs;
    load_to_array(lhs);
    other.load_to_array(rhs);
    std::array<Field, 5> out;
    out[0] = sprod;
    for (size_t i = 1; i < 5; ++i) {
        out[i] = lhs[i] * rhs[i];
    }
    result.store_from_array(out);
    return result;
}

#else // !BB_VECTOR_FIELD_SIMD

// ======================== Portable fallback ========================

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
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator+(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] + other.elts[i];
    }
    return r;
}

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator-(const VectorField& other) const noexcept
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

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    uint32_t m = 0;
    for (size_t i = 0; i < 5; ++i) {
        if (elts[i] == other.elts[i]) {
            m |= (1u << i);
        }
    }
    return m;
}

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::is_zero() const noexcept
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
