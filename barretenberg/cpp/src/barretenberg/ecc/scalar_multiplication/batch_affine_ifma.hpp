// AVX-512 IFMA batch-affine drain for the native Stage-6a tree reduce.
//
// x86-64 only and runtime-dispatched: the build targets a baseline ISA, so every function that touches 512-bit
// registers carries a `target` attribute and is only entered after `ifma_available()` confirmed the CPU (and OS)
// support it. WASM and non-x86 builds compile none of this.

#pragma once

#if defined(__x86_64__) && !defined(__wasm__) && (defined(__clang__) || defined(__GNUC__))
#define BB_MSM_IFMA 1
#endif

#ifdef BB_MSM_IFMA

#include "barretenberg/common/throw_or_abort.hpp"

#include <immintrin.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <memory>

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays, cppcoreguidelines-pro-bounds-constant-array-index)
#define BB_IFMA_TARGET __attribute__((target("avx512f,avx512ifma,avx512vl,avx512dq,avx512bw")))
#define BB_IFMA_INLINE BB_IFMA_TARGET __attribute__((always_inline)) inline

namespace bb::scalar_multiplication::ifma {

/**
 * @brief True when the CPU and OS support AVX-512F + IFMA. `BB_MSM_NO_IFMA` (any value) forces false, which keeps the
 *        portable drain reachable on IFMA hardware for A/B runs and tests.
 */
inline bool ifma_available() noexcept
{
    static const bool available = [] {
        if (std::getenv("BB_MSM_NO_IFMA") != nullptr) {
            return false;
        }
        __builtin_cpu_init();
        return __builtin_cpu_supports("avx512f") != 0 && __builtin_cpu_supports("avx512ifma") != 0 &&
               __builtin_cpu_supports("avx512vl") != 0 && __builtin_cpu_supports("avx512dq") != 0;
    }();
    return available;
}

/**
 * @brief Field elements as 5 limbs of 52 bits, 8 lanes per register (one lane per independent element).
 *
 * @details The Montgomery multiplication below uses R = 2^256, i.e. bb's own Montgomery domain: four 52-bit
 *          reduction steps followed by one 48-bit step. Values are kept loosely reduced. The bounds quoted in this file
 *          are in units of p and rely on p < 0.19 * 2^256 (both BN254 fields), which gives
 *          mont_mul(a, b) < 0.19 * a * b / p + p; every value stays far below the 2^260 the limbs can hold.
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

BB_IFMA_INLINE __m512i bcast(uint64_t v)
{
    return _mm512_set1_epi64(static_cast<long long>(v));
}

/**
 * @brief r = a * b / 2^256 (mod p), r < 0.19 * a * b / p + p. Limbs of a and b must be < 2^52.
 */
template <typename Params> BB_IFMA_INLINE V5 mont_mul(const V5& a, const V5& b)
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
BB_IFMA_INLINE void normalise(V5& r)
{
    const __m512i m52 = bcast((uint64_t{ 1 } << 52) - 1);
    for (size_t i = 0; i < 4; ++i) {
        r.l[i + 1] = _mm512_add_epi64(r.l[i + 1], _mm512_srai_epi64(r.l[i], 52));
        r.l[i] = _mm512_and_si512(r.l[i], m52);
    }
}

// a + k - b, with k a constant multiple of p (as normalised limbs) that is at least b.
BB_IFMA_INLINE V5 sub_plus(const V5& a, const V5& b, const std::array<uint64_t, 5>& k)
{
    V5 r;
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_sub_epi64(_mm512_add_epi64(a.l[i], bcast(k[i])), b.l[i]);
    }
    normalise(r);
    return r;
}

// a + k - b - c.
BB_IFMA_INLINE V5 sub2_plus(const V5& a, const V5& b, const V5& c, const std::array<uint64_t, 5>& k)
{
    V5 r;
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_sub_epi64(_mm512_sub_epi64(_mm512_add_epi64(a.l[i], bcast(k[i])), b.l[i]), c.l[i]);
    }
    normalise(r);
    return r;
}

/**
 * @brief Fully reduce v (normalised, v < 2^256 + 2^255 suffices) into [0, p).
 *
 * @details q = floor(v4 * QK / 2^52), with v4 = floor(v / 2^208), never exceeds floor(v / p) and falls short of it by
 * at most one for the inputs used here (v < 9p), so v - q * p lies in [0, 2p); one conditional subtraction finishes.
 */
template <typename Params> BB_IFMA_INLINE V5 canonical(const V5& v)
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

// Load 8 consecutive elements from four limb-major 64-bit columns (each a bb field element's data[i]).
BB_IFMA_INLINE V5 load64(const uint64_t* l0, const uint64_t* l1, const uint64_t* l2, const uint64_t* l3)
{
    const __m512i m52 = bcast((uint64_t{ 1 } << 52) - 1);
    const __m512i a0 = _mm512_load_si512(l0);
    const __m512i a1 = _mm512_load_si512(l1);
    const __m512i a2 = _mm512_load_si512(l2);
    const __m512i a3 = _mm512_load_si512(l3);
    V5 r;
    r.l[0] = _mm512_and_si512(a0, m52);
    r.l[1] = _mm512_and_si512(_mm512_or_si512(_mm512_srli_epi64(a0, 52), _mm512_slli_epi64(a1, 12)), m52);
    r.l[2] = _mm512_and_si512(_mm512_or_si512(_mm512_srli_epi64(a1, 40), _mm512_slli_epi64(a2, 24)), m52);
    r.l[3] = _mm512_and_si512(_mm512_or_si512(_mm512_srli_epi64(a2, 28), _mm512_slli_epi64(a3, 36)), m52);
    r.l[4] = _mm512_srli_epi64(a3, 16);
    return r;
}

// Inverse of load64 for a value below 2^256.
BB_IFMA_INLINE void store64(const V5& v, uint64_t* l0, uint64_t* l1, uint64_t* l2, uint64_t* l3)
{
    _mm512_store_si512(l0, _mm512_or_si512(v.l[0], _mm512_slli_epi64(v.l[1], 52)));
    _mm512_store_si512(l1, _mm512_or_si512(_mm512_srli_epi64(v.l[1], 12), _mm512_slli_epi64(v.l[2], 40)));
    _mm512_store_si512(l2, _mm512_or_si512(_mm512_srli_epi64(v.l[2], 24), _mm512_slli_epi64(v.l[3], 28)));
    _mm512_store_si512(l3, _mm512_or_si512(_mm512_srli_epi64(v.l[3], 36), _mm512_slli_epi64(v.l[4], 16)));
}

BB_IFMA_INLINE V5 load52(const uint64_t* base, size_t stride)
{
    V5 r;
    for (size_t i = 0; i < 5; ++i) {
        r.l[i] = _mm512_load_si512(base + (i * stride));
    }
    return r;
}

BB_IFMA_INLINE void store52(const V5& v, uint64_t* base, size_t stride)
{
    for (size_t i = 0; i < 5; ++i) {
        _mm512_store_si512(base + (i * stride), v.l[i]);
    }
}

/**
 * @brief Queue and scratch for one worker's IFMA drain: up to CAP pairs (lhs, rhs) held limb-major, so lane k of
 *        column `lx[i]` is limb i of pair k's lhs.x. dx and the prefix products are kept as 52-bit limbs.
 */
template <size_t CAP> struct DrainBuffer {
    static_assert(CAP % 8 == 0);
    alignas(64) uint64_t lx[4][CAP];
    alignas(64) uint64_t ly[4][CAP];
    alignas(64) uint64_t rx[4][CAP];
    alignas(64) uint64_t ry[4][CAP];
    alignas(64) uint64_t dx[5][CAP];
    alignas(64) uint64_t pre[5][CAP];
    uint32_t pair_dest[CAP];

    template <typename BaseField>
    void push(size_t k, const BaseField& x1, const BaseField& y1, const BaseField& x2, const BaseField& y2) noexcept
    {
        for (size_t i = 0; i < 4; ++i) {
            lx[i][k] = x1.data[i];
            ly[i][k] = y1.data[i];
            rx[i][k] = x2.data[i];
            ry[i][k] = y2.data[i];
        }
    }
};

/**
 * @brief Batch affine addition with one shared inversion: sink(k, x3, y3) receives lhs[k] + rhs[k] for each of the n
 *        pairs queued in `buf`.
 *
 * @details The pairs are spread over 8 independent Montgomery prefix chains, one per lane: pair k belongs to lane k % 8
 *          at step k / 8. The forward pass forms dx and the running prefix products, the 8 chain products are inverted
 *          with scalar Montgomery batching around one field inversion, and the backward pass peels off each 1 / dx and
 *          finishes the affine addition. The backward pass has enough independent work per step to hide the latency
 *          of its two chained multiplications, so more chains do not pay. Every output coordinate is fully reduced
 *          into [0, p). The caller guarantees lhs.x != rhs.x for every pair (so no dx is zero), as for the scalar
 *          drain.
 */
template <typename BaseField, size_t CAP, typename Sink>
BB_IFMA_TARGET void drain_vector(DrainBuffer<CAP>& buf, size_t n, Sink&& sink)
{
    using Params = typename BaseField::Params;
    using C = Consts<Params>;
    const size_t steps = (n + 7) / 8;
    const size_t padded = steps * 8;

    // Padding pairs (0, 0) + (1, 0): dx = 1, so they leave the chain products unchanged. Their outputs are dropped.
    const BaseField one = BaseField::one();
    for (size_t k = n; k < padded; ++k) {
        for (size_t i = 0; i < 4; ++i) {
            buf.lx[i][k] = 0;
            buf.ly[i][k] = 0;
            buf.rx[i][k] = one.data[i];
            buf.ry[i][k] = 0;
        }
    }

    alignas(64) uint64_t lanes[4][8];
    for (size_t i = 0; i < 4; ++i) {
        for (auto& o : lanes[i]) {
            o = one.data[i];
        }
    }
    V5 acc = load64(lanes[0], lanes[1], lanes[2], lanes[3]);

    // Forward: dx = rx - lx + 2p (< 4p); prefix products bounded by ~4.1p.
    for (size_t k = 0; k < padded; k += 8) {
        const V5 x1 = load64(&buf.lx[0][k], &buf.lx[1][k], &buf.lx[2][k], &buf.lx[3][k]);
        const V5 x2 = load64(&buf.rx[0][k], &buf.rx[1][k], &buf.rx[2][k], &buf.rx[3][k]);
        const V5 dx = sub_plus(x2, x1, C::P2);
        store52(dx, &buf.dx[0][k], CAP);
        store52(acc, &buf.pre[0][k], CAP);
        acc = mont_mul<Params>(acc, dx);
    }

    // Invert the 8 chain products.
    store64(canonical<Params>(acc), lanes[0], lanes[1], lanes[2], lanes[3]);
    {
        std::array<BaseField, 8> lane;
        std::array<BaseField, 8> prefix;
        BaseField running = BaseField::one();
        for (size_t l = 0; l < 8; ++l) {
            lane[l] = BaseField{ lanes[0][l], lanes[1][l], lanes[2][l], lanes[3][l] };
            prefix[l] = running;
            running *= lane[l];
        }
        if (running.is_zero()) {
            throw_or_abort("batch_invert: attempted to invert zero");
        }
        running = running.invert();
        for (size_t l = 8; l-- > 0;) {
            const BaseField inv = (running * prefix[l]).reduce_once();
            running *= lane[l];
            for (size_t i = 0; i < 4; ++i) {
                lanes[i][l] = inv.data[i];
            }
        }
    }
    acc = load64(lanes[0], lanes[1], lanes[2], lanes[3]);

    // Backward: acc holds 1 / (dx_0 ... dx_s) per chain; times the prefix it gives 1 / dx_s, times dx_s it steps back
    // one pair. Bounds (units of p): 1/dx, slope ~4.2; slope^2 ~4.3; x3 before reduction < 8.3; y3 < 5.4.
    alignas(64) uint64_t ox[4][8];
    alignas(64) uint64_t oy[4][8];
    for (size_t k = padded; k != 0;) {
        k -= 8;
        const V5 inv_dx = mont_mul<Params>(acc, load52(&buf.pre[0][k], CAP));
        acc = mont_mul<Params>(acc, load52(&buf.dx[0][k], CAP));
        const V5 x1 = load64(&buf.lx[0][k], &buf.lx[1][k], &buf.lx[2][k], &buf.lx[3][k]);
        const V5 y1 = load64(&buf.ly[0][k], &buf.ly[1][k], &buf.ly[2][k], &buf.ly[3][k]);
        const V5 x2 = load64(&buf.rx[0][k], &buf.rx[1][k], &buf.rx[2][k], &buf.rx[3][k]);
        const V5 y2 = load64(&buf.ry[0][k], &buf.ry[1][k], &buf.ry[2][k], &buf.ry[3][k]);
        const V5 slope = mont_mul<Params>(sub_plus(y2, y1, C::P2), inv_dx);
        const V5 x3 = canonical<Params>(sub2_plus(mont_mul<Params>(slope, slope), x1, x2, C::P4));
        const V5 y3 = canonical<Params>(sub_plus(mont_mul<Params>(slope, sub_plus(x1, x3, C::P)), y1, C::P2));
        store64(x3, ox[0], ox[1], ox[2], ox[3]);
        store64(y3, oy[0], oy[1], oy[2], oy[3]);
        const size_t live = std::min<size_t>(8, n - k);
        for (size_t l = 0; l < live; ++l) {
            sink(k + l,
                 BaseField{ ox[0][l], ox[1][l], ox[2][l], ox[3][l] },
                 BaseField{ oy[0][l], oy[1][l], oy[2][l], oy[3][l] });
        }
    }
}

// Below this many pairs the vector drain's fixed cost (lane padding, the 8-lane batch around the inversion) exceeds
// what it saves; such drains run the scalar formulas on the same queue.
inline constexpr size_t SMALL_DRAIN_MAX_PAIRS = 6;

template <typename BaseField, size_t CAP, typename Sink>
void drain_small(const DrainBuffer<CAP>& buf, size_t n, Sink&& sink)
{
    const auto lhs_x = [&](size_t k) { return BaseField{ buf.lx[0][k], buf.lx[1][k], buf.lx[2][k], buf.lx[3][k] }; };
    const auto rhs_x = [&](size_t k) { return BaseField{ buf.rx[0][k], buf.rx[1][k], buf.rx[2][k], buf.rx[3][k] }; };
    std::array<BaseField, SMALL_DRAIN_MAX_PAIRS> dxs;
    std::array<BaseField, SMALL_DRAIN_MAX_PAIRS> prefix;
    BaseField acc = BaseField::one();
    for (size_t k = 0; k < n; ++k) {
        dxs[k] = rhs_x(k) - lhs_x(k);
        prefix[k] = acc;
        acc *= dxs[k];
    }
    if (acc.is_zero()) {
        throw_or_abort("batch_invert: attempted to invert zero");
    }
    acc = acc.invert();
    for (size_t k = n; k-- > 0;) {
        const BaseField inv = acc * prefix[k];
        acc *= dxs[k];
        const BaseField x1 = lhs_x(k);
        const BaseField y1{ buf.ly[0][k], buf.ly[1][k], buf.ly[2][k], buf.ly[3][k] };
        const BaseField y2{ buf.ry[0][k], buf.ry[1][k], buf.ry[2][k], buf.ry[3][k] };
        const BaseField slope = (y2 - y1) * inv;
        const BaseField x3 = slope.sqr() - (x1 + rhs_x(k));
        sink(k, x3, slope * (x1 - x3) - y1);
    }
}

/**
 * @brief sink(k, x3, y3) receives lhs[k] + rhs[k] (affine) for each of the n queued pairs; one shared inversion.
 */
template <typename BaseField, size_t CAP, typename Sink> void drain(DrainBuffer<CAP>& buf, size_t n, Sink&& sink)
{
    if (n <= SMALL_DRAIN_MAX_PAIRS) {
        drain_small<BaseField>(buf, n, sink);
    } else {
        drain_vector<BaseField>(buf, n, sink);
    }
}

/**
 * @brief out[pair_dest[k]] = lhs[k] + rhs[k] for the n queued pairs, `out` an array of affine elements.
 */
template <typename BaseField, size_t CAP, typename AffineElement>
void drain_to(DrainBuffer<CAP>& buf, size_t n, AffineElement* out)
{
    drain<BaseField>(buf, n, [&](size_t k, const BaseField& x, const BaseField& y) {
        AffineElement& dst = out[buf.pair_dest[k]];
        dst.x = x;
        dst.y = y;
    });
}

} // namespace bb::scalar_multiplication::ifma
// NOLINTEND(cppcoreguidelines-avoid-c-arrays, cppcoreguidelines-pro-bounds-constant-array-index)

#endif // BB_MSM_IFMA
