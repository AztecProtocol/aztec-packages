// AVX-512 IFMA kernels for prover hot loops over BN254-sized prime fields (8 elements per 512-bit register).
//
// x86-64 only and runtime-dispatched: the build targets a baseline ISA, so every function that touches 512-bit
// registers carries a `target` attribute and is only entered after `available()` confirmed the CPU (and OS) support
// it. WASM and non-x86 builds compile none of this; callers keep their scalar loop as the fallback.
//
// Every kernel returns the same field values as the scalar code it replaces (exact arithmetic). Computed outputs are
// fully reduced into [0, p), values copied through unchanged keep their input form; both are valid representatives
// for bb's coarse [0, 2p) form.

#pragma once

#if defined(__x86_64__) && !defined(__wasm__) && (defined(__clang__) || defined(__GNUC__))
#define BB_FIELD_IFMA 1
#endif

#ifdef BB_FIELD_IFMA

#include <immintrin.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays, cppcoreguidelines-pro-bounds-constant-array-index)
#define BB_FIELD_IFMA_TARGET __attribute__((target("avx512f,avx512ifma,avx512vl,avx512dq,avx512bw")))
#define BB_FIELD_IFMA_INLINE BB_FIELD_IFMA_TARGET __attribute__((always_inline)) inline

namespace bb::field_ifma {

/**
 * @brief True when the CPU and OS support AVX-512F + IFMA. `BB_FIELD_NO_IFMA` (any value) forces false, which keeps
 *        the scalar loops reachable on IFMA hardware for A/B runs and tests.
 */
inline bool available() noexcept
{
    static const bool is_available = [] {
        if (std::getenv("BB_FIELD_NO_IFMA") != nullptr) {
            return false;
        }
        __builtin_cpu_init();
        return __builtin_cpu_supports("avx512f") != 0 && __builtin_cpu_supports("avx512ifma") != 0 &&
               __builtin_cpu_supports("avx512vl") != 0 && __builtin_cpu_supports("avx512dq") != 0;
    }();
    return is_available;
}

/**
 * @brief Field elements as 5 limbs of 52 bits, 8 lanes per register.
 *
 * @details Montgomery multiplication uses R = 2^256, i.e. bb's own Montgomery domain: four 52-bit reduction steps and
 *          one 48-bit step, so values move between bb and the kernels by re-limbing only. Values stay loosely reduced;
 *          the bounds quoted below are in units of p and rely on p < 0.19 * 2^256, which gives
 *          mont_mul(a, b) < 0.19 * a * b / p + p.
 */
template <typename Params> struct Consts {
    static constexpr uint64_t M52 = (uint64_t{ 1 } << 52) - 1;
    static constexpr std::array<uint64_t, 4> MOD{
        Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3
    };

    static constexpr std::array<uint64_t, 5> to52(const std::array<uint64_t, 4>& a)
    {
        return { a[0] & M52,
                 ((a[0] >> 52) | (a[1] << 12)) & M52,
                 ((a[1] >> 40) | (a[2] << 24)) & M52,
                 ((a[2] >> 28) | (a[3] << 36)) & M52,
                 a[3] >> 16 };
    }
    // k * p in normalised 52-bit limbs (k small).
    static constexpr std::array<uint64_t, 5> times(uint64_t k)
    {
        const std::array<uint64_t, 5> p = to52(MOD);
        std::array<uint64_t, 5> r{};
        uint64_t carry = 0;
        for (size_t i = 0; i < 5; ++i) {
            const uint64_t v = (p[i] * k) + carry;
            r[i] = (i < 4) ? (v & M52) : v;
            carry = v >> 52;
        }
        return r;
    }
    static constexpr std::array<uint64_t, 5> P = times(1);
    static constexpr std::array<uint64_t, 5> P2 = times(2);
    static constexpr std::array<uint64_t, 5> P4 = times(4);
    // -p^-1 mod 2^52.
    static constexpr uint64_t PINV = Params::r_inv & M52;
    // floor(2^52 / (floor(p / 2^208) + 1)): quotient estimate for `canonical`.
    static constexpr uint64_t QK = (uint64_t{ 1 } << 52) / (P[4] + 1);

    // The bound analysis needs p < 0.19 * 2^256 (0.19 * 2^64 = 0x30a3d70a3d70a3d7).
    static constexpr bool supported = Params::modulus_3 < 0x30a3d70a3d70a3d7ULL;
};

struct V5 {
    __m512i l[5];
};

BB_FIELD_IFMA_INLINE __m512i bcast(uint64_t v)
{
    return _mm512_set1_epi64(static_cast<long long>(v));
}

/**
 * @brief r = a * b / 2^256 (mod p), r < 0.19 * a * b / p + p. Limbs of a and b must be < 2^52.
 */
template <typename Params> BB_FIELD_IFMA_INLINE V5 mont_mul(const V5& a, const V5& b)
{
    using C = Consts<Params>;
    const __m512i z = _mm512_setzero_si512();
    const __m512i m52 = bcast(C::M52);
    const __m512i pinv = bcast(C::PINV);
    __m512i p[5];
    for (size_t j = 0; j < 5; ++j) {
        p[j] = bcast(C::P[j]);
    }
    __m512i t[10];
    for (auto& ti : t) {
        ti = z;
    }
    for (size_t i = 0; i < 5; ++i) {
        for (size_t j = 0; j < 5; ++j) {
            t[i + j] = _mm512_madd52lo_epu64(t[i + j], a.l[i], b.l[j]);
            t[i + j + 1] = _mm512_madd52hi_epu64(t[i + j + 1], a.l[i], b.l[j]);
        }
    }
    // Four 52-bit Montgomery steps: zero the low 52 bits of t[i] and carry them into t[i + 1].
    for (size_t i = 0; i < 4; ++i) {
        const __m512i m = _mm512_madd52lo_epu64(z, t[i], pinv);
        for (size_t j = 0; j < 5; ++j) {
            t[i + j] = _mm512_madd52lo_epu64(t[i + j], m, p[j]);
            t[i + j + 1] = _mm512_madd52hi_epu64(t[i + j + 1], m, p[j]);
        }
        t[i + 1] = _mm512_add_epi64(t[i + 1], _mm512_srli_epi64(t[i], 52));
    }
    // One 48-bit step brings the total shift to 4 * 52 + 48 = 256.
    {
        const __m512i m = _mm512_and_si512(_mm512_madd52lo_epu64(z, t[4], pinv), bcast((uint64_t{ 1 } << 48) - 1));
        for (size_t j = 0; j < 5; ++j) {
            t[4 + j] = _mm512_madd52lo_epu64(t[4 + j], m, p[j]);
            t[5 + j] = _mm512_madd52hi_epu64(t[5 + j], m, p[j]);
        }
    }
    for (size_t i = 4; i < 9; ++i) {
        t[i + 1] = _mm512_add_epi64(t[i + 1], _mm512_srli_epi64(t[i], 52));
        t[i] = _mm512_and_si512(t[i], m52);
    }
    V5 r;
    for (size_t j = 0; j < 4; ++j) {
        r.l[j] =
            _mm512_or_si512(_mm512_srli_epi64(t[4 + j], 48), _mm512_and_si512(_mm512_slli_epi64(t[5 + j], 4), m52));
    }
    r.l[4] = _mm512_or_si512(_mm512_srli_epi64(t[8], 48), _mm512_slli_epi64(t[9], 4));
    return r;
}

// Propagate signed per-limb carries so limbs 0..3 are in [0, 2^52). The represented value must be non-negative.
BB_FIELD_IFMA_INLINE void normalise(V5& r)
{
    const __m512i m52 = bcast((uint64_t{ 1 } << 52) - 1);
    for (size_t i = 0; i < 4; ++i) {
        r.l[i + 1] = _mm512_add_epi64(r.l[i + 1], _mm512_srai_epi64(r.l[i], 52));
        r.l[i] = _mm512_and_si512(r.l[i], m52);
    }
}

BB_FIELD_IFMA_INLINE V5 add(const V5& a, const V5& b)
{
    V5 r;
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_add_epi64(a.l[i], b.l[i]);
    }
    normalise(r);
    return r;
}

// a + k - b, with k a constant multiple of p (as normalised limbs) that is at least b.
BB_FIELD_IFMA_INLINE V5 sub_plus(const V5& a, const V5& b, const std::array<uint64_t, 5>& k)
{
    V5 r;
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_sub_epi64(_mm512_add_epi64(a.l[i], bcast(k[i])), b.l[i]);
    }
    normalise(r);
    return r;
}

// a + k - b - c, with k a constant multiple of p (as normalised limbs) that is at least b + c.
BB_FIELD_IFMA_INLINE V5 sub2_plus(const V5& a, const V5& b, const V5& c, const std::array<uint64_t, 5>& k)
{
    V5 r;
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_sub_epi64(_mm512_sub_epi64(_mm512_add_epi64(a.l[i], bcast(k[i])), b.l[i]), c.l[i]);
    }
    normalise(r);
    return r;
}

/**
 * @brief Fully reduce v (normalised, v < 9p) into [0, p).
 *
 * @details q = floor(v4 * QK / 2^52), with v4 = floor(v / 2^208), never exceeds floor(v / p) and falls short of it by
 * at most one for v < 9p, so v - q * p lies in [0, 2p); one conditional subtraction finishes.
 */
template <typename Params> BB_FIELD_IFMA_INLINE V5 canonical(const V5& v)
{
    using C = Consts<Params>;
    const __m512i z = _mm512_setzero_si512();
    const __m512i q = _mm512_madd52hi_epu64(z, v.l[4], bcast(C::QK));
    V5 r;
    __m512i carry_hi = z;
    for (size_t i = 0; i < 5; ++i) {
        const __m512i pi = bcast(C::P[i]);
        const __m512i lo = _mm512_madd52lo_epu64(z, q, pi);
        r.l[i] = _mm512_sub_epi64(_mm512_sub_epi64(v.l[i], lo), carry_hi);
        carry_hi = _mm512_madd52hi_epu64(z, q, pi);
    }
    normalise(r);
    V5 t;
    for (size_t i = 0; i < 5; ++i) {
        t.l[i] = _mm512_sub_epi64(r.l[i], bcast(C::P[i]));
    }
    normalise(t);
    const __mmask8 negative = _mm512_movepi64_mask(t.l[4]);
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_mask_blend_epi64(negative, t.l[i], r.l[i]);
    }
    return r;
}

// Four 64-bit limb columns (lane j of column i = limb i of one element) to 52-bit limbs. The value must be < 2^256.
BB_FIELD_IFMA_INLINE V5 from_columns(__m512i a0, __m512i a1, __m512i a2, __m512i a3)
{
    const __m512i m52 = bcast((uint64_t{ 1 } << 52) - 1);
    V5 r;
    r.l[0] = _mm512_and_si512(a0, m52);
    r.l[1] = _mm512_and_si512(_mm512_or_si512(_mm512_srli_epi64(a0, 52), _mm512_slli_epi64(a1, 12)), m52);
    r.l[2] = _mm512_and_si512(_mm512_or_si512(_mm512_srli_epi64(a1, 40), _mm512_slli_epi64(a2, 24)), m52);
    r.l[3] = _mm512_and_si512(_mm512_or_si512(_mm512_srli_epi64(a2, 28), _mm512_slli_epi64(a3, 36)), m52);
    r.l[4] = _mm512_srli_epi64(a3, 16);
    return r;
}

/**
 * @brief Transpose four registers holding eight consecutive 4-limb elements (z_k = elements 2k, 2k + 1) into limb
 *        columns and re-limb them. Lane order is e0, e2, e1, e3, e4, e6, e5, e7; `store8` undoes it.
 */
BB_FIELD_IFMA_INLINE V5 transpose_in(__m512i z0, __m512i z1, __m512i z2, __m512i z3)
{
    const __m512i t0 = _mm512_unpacklo_epi64(z0, z1); // e0l0 e2l0 e0l2 e2l2 | e1l0 e3l0 e1l2 e3l2
    const __m512i t1 = _mm512_unpackhi_epi64(z0, z1); // limbs 1 and 3 of e0..e3
    const __m512i t2 = _mm512_unpacklo_epi64(z2, z3);
    const __m512i t3 = _mm512_unpackhi_epi64(z2, z3);
    return from_columns(_mm512_shuffle_i64x2(t0, t2, 0x88),
                        _mm512_shuffle_i64x2(t1, t3, 0x88),
                        _mm512_shuffle_i64x2(t0, t2, 0xDD),
                        _mm512_shuffle_i64x2(t1, t3, 0xDD));
}

// Load eight consecutive elements (32-byte 4-limb layout) starting at `src`.
BB_FIELD_IFMA_INLINE V5 load8(const uint64_t* src)
{
    return transpose_in(_mm512_loadu_si512(src),
                        _mm512_loadu_si512(src + 8),
                        _mm512_loadu_si512(src + 16),
                        _mm512_loadu_si512(src + 24));
}

/**
 * @brief Load the eight even-indexed and the eight odd-indexed elements of the sixteen consecutive elements at `src`,
 *        both in `load8`'s lane order.
 */
BB_FIELD_IFMA_INLINE void load8_even_odd(const uint64_t* src, V5& even, V5& odd)
{
    __m512i z[8];
    for (size_t i = 0; i < 8; ++i) {
        z[i] = _mm512_loadu_si512(src + (8 * i));
    }
    // z[i] = elements 2i (even) and 2i + 1 (odd); regroup 256-bit halves.
    even = transpose_in(_mm512_shuffle_i64x2(z[0], z[1], 0x44),
                        _mm512_shuffle_i64x2(z[2], z[3], 0x44),
                        _mm512_shuffle_i64x2(z[4], z[5], 0x44),
                        _mm512_shuffle_i64x2(z[6], z[7], 0x44));
    odd = transpose_in(_mm512_shuffle_i64x2(z[0], z[1], 0xEE),
                       _mm512_shuffle_i64x2(z[2], z[3], 0xEE),
                       _mm512_shuffle_i64x2(z[4], z[5], 0xEE),
                       _mm512_shuffle_i64x2(z[6], z[7], 0xEE));
}

// 52-bit limbs (normalised, value below 2^256) back to four 64-bit limb columns.
BB_FIELD_IFMA_INLINE void to_columns(const V5& v, __m512i& c0, __m512i& c1, __m512i& c2, __m512i& c3)
{
    c0 = _mm512_or_si512(v.l[0], _mm512_slli_epi64(v.l[1], 52));
    c1 = _mm512_or_si512(_mm512_srli_epi64(v.l[1], 12), _mm512_slli_epi64(v.l[2], 40));
    c2 = _mm512_or_si512(_mm512_srli_epi64(v.l[2], 24), _mm512_slli_epi64(v.l[3], 28));
    c3 = _mm512_or_si512(_mm512_srli_epi64(v.l[3], 36), _mm512_slli_epi64(v.l[4], 16));
}

// Inverse of `load8` for a value below 2^256.
BB_FIELD_IFMA_INLINE void store8(const V5& v, uint64_t* dst)
{
    __m512i c0;
    __m512i c1;
    __m512i c2;
    __m512i c3;
    to_columns(v, c0, c1, c2, c3);
    // Columns hold lanes e0 e2 e1 e3 e4 e6 e5 e7; rebuild the unpack stage of `transpose_in`.
    const __m512i lo_idx = _mm512_setr_epi64(0, 1, 8, 9, 2, 3, 10, 11);
    const __m512i hi_idx = _mm512_setr_epi64(4, 5, 12, 13, 6, 7, 14, 15);
    const __m512i t0 = _mm512_permutex2var_epi64(c0, lo_idx, c2);
    const __m512i t1 = _mm512_permutex2var_epi64(c1, lo_idx, c3);
    const __m512i t2 = _mm512_permutex2var_epi64(c0, hi_idx, c2);
    const __m512i t3 = _mm512_permutex2var_epi64(c1, hi_idx, c3);
    _mm512_storeu_si512(dst, _mm512_unpacklo_epi64(t0, t1));
    _mm512_storeu_si512(dst + 8, _mm512_unpackhi_epi64(t0, t1));
    _mm512_storeu_si512(dst + 16, _mm512_unpacklo_epi64(t2, t3));
    _mm512_storeu_si512(dst + 24, _mm512_unpackhi_epi64(t2, t3));
}

/**
 * @brief Eight elements held limb-major, lane j of `limb[i]` being 64-bit limb i of element j (256 bytes, the same
 *        footprint as eight bb field elements). Stored values are below 2^256.
 */
struct alignas(64) Columns {
    uint64_t limb[4][8];
};

BB_FIELD_IFMA_INLINE V5 load_columns(const Columns& c)
{
    return from_columns(_mm512_load_si512(c.limb[0]),
                        _mm512_load_si512(c.limb[1]),
                        _mm512_load_si512(c.limb[2]),
                        _mm512_load_si512(c.limb[3]));
}

// v must be normalised and below 2^256.
BB_FIELD_IFMA_INLINE void store_columns(const V5& v, Columns& c)
{
    __m512i c0;
    __m512i c1;
    __m512i c2;
    __m512i c3;
    to_columns(v, c0, c1, c2, c3);
    _mm512_store_si512(c.limb[0], c0);
    _mm512_store_si512(c.limb[1], c1);
    _mm512_store_si512(c.limb[2], c2);
    _mm512_store_si512(c.limb[3], c3);
}

// One element broadcast to all lanes. `limbs` must be < 2^256.
BB_FIELD_IFMA_INLINE V5 broadcast(const uint64_t* limbs)
{
    return from_columns(bcast(limbs[0]), bcast(limbs[1]), bcast(limbs[2]), bcast(limbs[3]));
}

/**
 * @brief dst[k] = src[2k] + u * (src[2k + 1] - src[2k]) for k < n, on raw 4-limb elements in [0, 2p). n must be a
 *        multiple of 8. dst may alias src (dst == src): every iteration reads its sixteen inputs before writing. A
 * block of eight bit-identical pairs is copied (src[2k]) like the scalar loop's per-pair short-cut.
 */
template <typename Params>
BB_FIELD_IFMA_TARGET void fold_stride2(const uint64_t* src, uint64_t* dst, size_t n, const uint64_t* u)
{
    using C = Consts<Params>;
    const V5 uv = broadcast(u);
    for (size_t k = 0; k < n; k += 8) {
        V5 even;
        V5 odd;
        load8_even_odd(src + (8 * k), even, odd);
        // Eight bit-identical neighbour pairs (constant selector runs, zero padding) fold to the even values.
        __m512i diff = _mm512_setzero_si512();
        for (size_t i = 0; i < 5; ++i) {
            diff = _mm512_or_si512(diff, _mm512_xor_si512(even.l[i], odd.l[i]));
        }
        if (_mm512_test_epi64_mask(diff, diff) == 0) {
            store8(even, dst + (4 * k));
            continue;
        }
        // (odd - even + 2p) < 4p; times u < 2p gives < 2.52p; plus even < 4.52p.
        const V5 r = add(mont_mul<Params>(sub_plus(odd, even, C::P2), uv), even);
        store8(canonical<Params>(r), dst + (4 * k));
    }
}

/**
 * @brief Horner evaluation split over 16 interleaved chains: writes eight elements t_0 .. t_7 (in [0, p), 4-limb
 *        layout) to `out` whose sum is sum_i coeffs[i] * z^i for i < n. coeffs are raw 4-limb elements in [0, 2p) and
 *        n must be a multiple of 16; `z_pows` holds z^0 .. z^7, `z8` = z^8 and `z16` = z^16, each below 2p.
 *
 * @details Lane j of chain A accumulates sum_m coeffs[16m + j] z^(16m) and chain B sum_m coeffs[16m + 8 + j] z^(16m)
 *          by Horner's rule from the top, so two independent multiplications are in flight per step. Then
 *          t_j = z^j (A_j + z^8 B_j).
 */
template <typename Params>
BB_FIELD_IFMA_TARGET void evaluate(
    const uint64_t* coeffs, size_t n, const uint64_t* z_pows, const uint64_t* z8, const uint64_t* z16, uint64_t* out)
{
    const V5 z16v = broadcast(z16);
    V5 a;
    V5 b;
    for (size_t i = 0; i < 5; ++i) {
        a.l[i] = _mm512_setzero_si512();
        b.l[i] = _mm512_setzero_si512();
    }
    // The accumulators stay below 4.9p (fixed point of x -> 0.19 * 2x + 1 + 2).
    for (size_t i = n; i != 0;) {
        i -= 16;
        a = add(mont_mul<Params>(a, z16v), load8(coeffs + (4 * i)));
        b = add(mont_mul<Params>(b, z16v), load8(coeffs + (4 * (i + 8))));
    }
    // a + z^8 b < 4.9p + 2.9p; reduce before the last multiplication.
    const V5 lanes = canonical<Params>(add(a, mont_mul<Params>(b, broadcast(z8))));
    store8(canonical<Params>(mont_mul<Params>(lanes, load8(z_pows))), out);
}

/**
 * @brief One source of `add_scaled_batch_tile`: tile elements [begin, end) gain scalar * src, where `data` points at
 *        the source element for tile index `begin`. A unit scalar (`unit`) adds src without multiplying.
 */
struct ScaledSource {
    const uint64_t* data;
    size_t begin;
    size_t end;
    const uint64_t* scalar;
    bool unit;
};

/**
 * @brief dst[i] += sum over sources of scalar * src[i] for a tile of n <= MAX_TILE elements (n a multiple of 8), on raw
 *        4-limb elements in [0, 2p). Outputs are in [0, p).
 *
 * @details The tile is held in 52-bit form for the whole batch, so every dst element is converted once. Blocks of
 *          eight source elements that are all zero (selector columns) are skipped, as are the lanes of a block outside
 *          the source's range (masked loads, which also never touch memory outside it). Each block is reduced after
 *          every third term, keeping it below 2p + 3 * 2p < 9p as `canonical` needs.
 */
inline constexpr size_t MAX_TILE = 256;

template <typename Params>
BB_FIELD_IFMA_TARGET void add_scaled_batch_tile(uint64_t* dst,
                                                size_t n,
                                                const ScaledSource* sources,
                                                size_t num_sources)
{
    const size_t num_blocks = n / 8;
    V5 acc[MAX_TILE / 8];
    uint8_t terms[MAX_TILE / 8];
    for (size_t b = 0; b < num_blocks; ++b) {
        acc[b] = load8(dst + (32 * b));
        terms[b] = 0;
    }
    for (size_t s = 0; s < num_sources; ++s) {
        const ScaledSource& src = sources[s];
        const V5 scalar = broadcast(src.scalar);
        for (size_t b = src.begin / 8; b * 8 < src.end; ++b) {
            const size_t lo = b * 8;
            // Mask of the 64-bit words of the block's eight elements that lie in [begin, end).
            const size_t first = (src.begin > lo) ? src.begin - lo : 0;
            const size_t last = std::min<size_t>(8, src.end - lo);
            const uint32_t elements = ((1U << last) - 1U) & ~((1U << first) - 1U);
            // Element pointer arithmetic stays within the source when every lane is live.
            const uint64_t* base = src.data - (4 * src.begin) + (4 * lo);
            __m512i z[4];
            __m512i any = _mm512_setzero_si512();
            for (size_t j = 0; j < 4; ++j) {
                const uint32_t pair = (elements >> (2 * j)) & 3U;
                const __mmask8 words =
                    static_cast<__mmask8>(((pair & 1U) != 0 ? 0x0FU : 0U) | ((pair & 2U) != 0 ? 0xF0U : 0U));
                z[j] = _mm512_maskz_loadu_epi64(words, base + (8 * j));
                any = _mm512_or_si512(any, z[j]);
            }
            if (_mm512_test_epi64_mask(any, any) == 0) {
                continue;
            }
            V5 v = transpose_in(z[0], z[1], z[2], z[3]);
            if (!src.unit) {
                v = mont_mul<Params>(v, scalar);
            }
            acc[b] = add(acc[b], v);
            if (++terms[b] == 3) {
                acc[b] = canonical<Params>(acc[b]);
                terms[b] = 0;
            }
        }
    }
    for (size_t b = 0; b < num_blocks; ++b) {
        store8(canonical<Params>(acc[b]), dst + (32 * b));
    }
}

} // namespace bb::field_ifma

// NOLINTEND(cppcoreguidelines-avoid-c-arrays, cppcoreguidelines-pro-bounds-constant-array-index)

#endif // BB_FIELD_IFMA
