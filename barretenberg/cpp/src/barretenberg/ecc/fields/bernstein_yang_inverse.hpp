// Bernstein-Yang safegcd modular inverse.
//
// We want a⁻¹ mod p, where p is an odd prime.  Run an extended binary GCD on
// the pair (f, g) starting at (p, a), with Bezout coefficients (d, e)
// satisfying invariants  d·a ≡ f (mod p)  and  e·a ≡ g (mod p)  at all times.
// When g reaches 0, gcd(p, a) = ±f = ±1 (since p is prime, a ≠ 0), so
// a⁻¹ = ±d.
//
// The cheap operation in a binary GCD is "if g is odd swap-and-subtract to
// make it even, then divide g by 2"; one such step is a "divstep" and
// shrinks |g| by ~1 bit.  Doing each divstep on the full 256-bit state would
// be slow, so we use Pornin's trick: do BATCH divsteps purely on the low 64
// bits of (f, g), accumulating the resulting linear transform as a 2×2
// integer matrix M, then apply M to the full-precision (f, g, d, e) in one
// go (with an exact /2^BATCH at the end).  The (d, e) side needs a 2-adic
// correction k·p added before dividing so the result stays integer-valued
// — k is determined by the low BATCH bits of M·(d, e) and p⁻¹ mod 2^BATCH.
//
// Native5x64 and Wasm9x29 wrap the platform-specific limb representation
// behind the same static interface so `invert_vartime` below is a
// single algorithm for both targets.

#pragma once

#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstdint>

namespace bb::bernstein_yang {

using numeric::uint256_t;
using u64 = uint64_t;
using i64 = int64_t;

// The transition matrix produced by BATCH divsteps. With the implicit
// "/ 2^BATCH" at the end of apply_divstep_matrix, it represents the linear
// map (f, g) ↦ (M·(f, g) / 2^BATCH).  Each divstep doubles one matrix entry,
// so after BATCH steps |u|, |v|, |q|, |r| ≤ 2^BATCH; they are signed (the
// swap-and-subtract case introduces negatives).
struct DivstepMatrix {
    i64 u, v, q, r;
};

// 5 × 64-bit limbs, top limb two's-complement signed.  Products via __int128.
class Native5x64 {
  public:
    // Number of divsteps folded into one matrix application.  Bigger BATCH
    // means fewer matrix applications per inversion but bigger matrix
    // entries.  Cap is set by the matrix-times-state product staying inside
    // an __int128 accumulator: a single (i63 entry) × (u64 limb) is 127 bits,
    // so BATCH ≤ 63; we use 62 to keep one bit of slack for the running sum.
    static constexpr int BATCH = 62;

    // Worst-case number of matrix applications needed before g must have
    // reached 0.  The 735-divstep bound for 254-bit inputs is from the BY
    // paper's convergence proof (rate ≈ 1 / 1.7 bits of g consumed per
    // divstep).  We pick the smallest NUM_ITERATIONS so NUM_ITERATIONS *
    // BATCH ≥ 735; ⌈735 / 62⌉ = 12.  The actual loop usually exits much
    // earlier via the early break on g == 0.
    static constexpr int NUM_ITERATIONS = 12;

    // The Bezout coefficients (d, e) live mod p but during the iteration we
    // hold them as signed integers in the state.  Each matrix application grows
    // |d|, |e| by roughly a factor of 2 (matrix entry × value) plus an
    // additive p (from the 2-adic correction k·p), so without bringing them
    // back to [0, p) they would eventually overflow the state.
    // reduce_to_canonical does that subtract-or-add-p reduction.  Calling it
    // every iter is wasteful — the 5×64-bit signed state has enough room to
    // let |d|, |e| reach ~2^K · p before they no longer fit, so we only
    // reduce every REDUCE_INTERVAL = 4 iters (|d|, |e| stay ≤ ~32p between
    // reductions, plenty of headroom).
    static constexpr int REDUCE_INTERVAL = 4;

    // Worst-case iteration cap inside reduce_to_canonical.  After
    // REDUCE_INTERVAL iters between reductions, |d|, |e| ≤ (2^(REDUCE_INTERVAL+1) - 1)·p,
    // so reducing requires that many subtractions plus one break iter.
    static constexpr int REDUCE_TO_CANONICAL_MAX_ITERS = 36;
    static_assert((1U << (REDUCE_INTERVAL + 1)) <= REDUCE_TO_CANONICAL_MAX_ITERS,
                  "REDUCE_INTERVAL too large for reduce_to_canonical iteration bound");

    Native5x64() noexcept
        : l{}
    {}
    explicit Native5x64(const uint256_t& x) noexcept
        : l{ x.data[0], x.data[1], x.data[2], x.data[3], 0 }
    {}
    static Native5x64 one() noexcept
    {
        Native5x64 r;
        r.l[0] = 1;
        return r;
    }

    uint256_t to_uint256() const noexcept { return { l[0], l[1], l[2], l[3] }; }
    u64 low_64() const noexcept { return l[0]; }
    bool is_zero() const noexcept { return (l[0] | l[1] | l[2] | l[3] | l[4]) == 0; }
    bool is_negative() const noexcept { return (i64)l[4] < 0; }
    void neg() noexcept
    {
        u64 c = 1;
        for (int i = 0; i < N; ++i) {
            u64 v = (~l[i]) + c;
            c = (c && v == 0) ? 1 : 0;
            l[i] = v;
        }
    }
    // Iter cap chosen by the REDUCE_TO_CANONICAL_MAX_ITERS / REDUCE_INTERVAL
    // static_assert above; see those constants for the magnitude argument.
    void reduce_to_canonical(const Native5x64& p) noexcept
    {
        for (int it = 0; it < REDUCE_TO_CANONICAL_MAX_ITERS; ++it) {
            if (is_negative()) {
                add_inplace(p);
            } else if (ge(p)) {
                sub_inplace(p);
            } else {
                break;
            }
        }
    }

    // BATCH branchy divsteps on the low 64 bits of (f, g); returns the
    // transition matrix M and updates δ.  Variable-time over the inner
    // branches — non-secret inputs only.
    static DivstepMatrix compute_divstep_matrix(i64& delta, u64 f_lo, u64 g_lo) noexcept;
    // (f, g) ← M·(f, g) / 2^BATCH and (d, e) ← (M·(d, e) + k·p) / 2^BATCH,
    // where k_i = -((M·(d, e))_i · p⁻¹) mod 2^BATCH (the 2-adic correction
    // that makes (M·(d, e))_i + k_i·p divisible by 2^BATCH).
    static void apply_divstep_matrix(const DivstepMatrix& m,
                                     Native5x64& f,
                                     Native5x64& g,
                                     Native5x64& d,
                                     Native5x64& e,
                                     const Native5x64& p,
                                     u64 p_inv_mod_2k) noexcept;
    // r_inv = -p⁻¹ mod 2^64 (barretenberg's Montgomery constant), so p⁻¹ mod
    // 2^BATCH is the low BATCH bits of -r_inv.
    static constexpr u64 p_inv_mod_2k_from_montgomery_r_inv(u64 r_inv) noexcept
    {
        // r_inv = -p^{-1} mod 2^64, so 0 - r_inv = p^{-1} mod 2^64.
        return (0ULL - r_inv) & ((1ULL << BATCH) - 1);
    }

  private:
    static constexpr int N = 5;
    u64 l[N];

    void add_inplace(const Native5x64& b) noexcept
    {
        u64 c = 0;
        for (int i = 0; i < N; ++i) {
            __uint128_t s = (__uint128_t)l[i] + b.l[i] + c;
            l[i] = (u64)s;
            c = (u64)(s >> 64);
        }
    }
    void sub_inplace(const Native5x64& b) noexcept
    {
        u64 borrow = 0;
        for (int i = 0; i < N; ++i) {
            __uint128_t s = (__uint128_t)l[i] - (__uint128_t)b.l[i] - borrow;
            l[i] = (u64)s;
            borrow = ((i64)(s >> 64) < 0) ? 1 : 0;
        }
    }
    bool ge(const Native5x64& b) const noexcept
    {
        i64 a_top = (i64)l[N - 1], b_top = (i64)b.l[N - 1];
        if (a_top != b_top) {
            return a_top > b_top;
        }
        for (int i = N - 2; i >= 0; --i) {
            if (l[i] != b.l[i]) {
                return l[i] > b.l[i];
            }
        }
        return true;
    }

    friend struct NativeMatrix;
};

// 6-limb signed product helpers used by Native5x64::apply_divstep_matrix.
struct NativeMatrix {
    static void signed_linear_combination(i64 a, const Native5x64& x, i64 b, const Native5x64& y, u64 out[6]) noexcept
    {
        __int128 c = 0;
        for (int i = 0; i < 4; ++i) {
            c += (__int128)a * (__int128)(u64)x.l[i] + (__int128)b * (__int128)(u64)y.l[i];
            out[i] = (u64)c;
            c >>= 64;
        }
        c += (__int128)a * (__int128)(i64)x.l[4] + (__int128)b * (__int128)(i64)y.l[4];
        out[4] = (u64)c;
        out[5] = (u64)(c >> 64);
    }
    // Sign-preserving exact /2^BATCH on the 6-limb signed `t`.  Sign of the
    // result lives in bit 63 of r.l[4], which is bit 61 of t[5].  This is the
    // sign of t iff t[5] is just sign-extension of the actual magnitude — i.e.,
    // iff |t| < 2^319.  BY guarantees this: |M·(x,y) + k·p| ≤ 2^324 in the
    // (d,e) row and ≤ 2^319 in the (f,g) row, both with |result/2^62| < 2^263 < 2^319.
    // A future change widening the matrix entries or state without re-running
    // this analysis will silently corrupt the sign bit.
    static Native5x64 arithmetic_shift_by_batch(const u64 t[6]) noexcept
    {
        Native5x64 r;
        for (int i = 0; i < 4; ++i) {
            r.l[i] = (t[i] >> 62) | (t[i + 1] << 2);
        }
        r.l[4] = (t[4] >> 62) | (t[5] << 2);
        return r;
    }
};

// Each inner step shrinks |g| by ~1 bit using a binary-GCD-style move.
// Three cases, depending on g's parity and the "δ" tracker (which decides
// whether |f| or |g| is currently smaller):
//   g even         : g ← g/2.
//   g odd, δ ≤ 0   : g ← (g + f)/2  (adding f to make g+f even before /2).
//   g odd, δ > 0   : swap roles — (f, g) ← (g, (g - f)/2).
// The matrix (u, v, q, r) tracks the same linear transform applied
// symbolically; doubling u, v (or q, r) corresponds to the implicit /2 each
// inner step performs.  After BATCH steps the low BATCH bits of the
// transformed state are guaranteed zero, so apply_divstep_matrix's implicit
// "/ 2^BATCH" is an exact integer division.
inline DivstepMatrix Native5x64::compute_divstep_matrix(i64& delta, u64 f_lo, u64 g_lo) noexcept
{
    i64 u = 1, v = 0, q = 0, r = 1;
    for (int i = 0; i < BATCH; ++i) {
        if (g_lo & 1) {
            if (delta > 0) {
                u64 nf = g_lo, ng = (g_lo - f_lo) >> 1;
                i64 nu = q << 1, nv = r << 1, nq = q - u, nr = r - v;
                f_lo = nf;
                g_lo = ng;
                u = nu;
                v = nv;
                q = nq;
                r = nr;
                delta = 1 - delta;
            } else {
                g_lo = (g_lo + f_lo) >> 1;
                q = q + u;
                r = r + v;
                u <<= 1;
                v <<= 1;
                delta = delta + 1;
            }
        } else {
            g_lo >>= 1;
            u <<= 1;
            v <<= 1;
            delta = delta + 1;
        }
    }
    return { u, v, q, r };
}

inline void Native5x64::apply_divstep_matrix(const DivstepMatrix& m,
                                             Native5x64& f,
                                             Native5x64& g,
                                             Native5x64& d,
                                             Native5x64& e,
                                             const Native5x64& p,
                                             u64 p_inv_mod_2k) noexcept
{
    constexpr u64 MASK_BATCH = (1ULL << BATCH) - 1;

    u64 nf[6], ng[6];
    NativeMatrix::signed_linear_combination(m.u, f, m.v, g, nf);
    NativeMatrix::signed_linear_combination(m.q, f, m.r, g, ng);
    f = NativeMatrix::arithmetic_shift_by_batch(nf);
    g = NativeMatrix::arithmetic_shift_by_batch(ng);

    // k = -t · p_inv_mod_2k mod 2^BATCH makes t + k·p divisible by 2^BATCH.
    auto apply_corrected_row = [&](i64 a, const Native5x64& da, i64 b, const Native5x64& eb, Native5x64& out) {
        u64 t[6];
        NativeMatrix::signed_linear_combination(a, da, b, eb, t);
        u64 k = ((0ULL - t[0]) * p_inv_mod_2k) & MASK_BATCH;
        u64 kp[6] = {};
        u64 carry = 0;
        for (int i = 0; i < 5; ++i) {
            __uint128_t prod = (__uint128_t)k * (u64)p.l[i] + carry;
            kp[i] = (u64)prod;
            carry = (u64)(prod >> 64);
        }
        kp[5] = carry;
        u64 c = 0;
        for (int i = 0; i < 6; ++i) {
            __uint128_t s = (__uint128_t)t[i] + kp[i] + c;
            t[i] = (u64)s;
            c = (u64)(s >> 64);
        }
        out = NativeMatrix::arithmetic_shift_by_batch(t);
    };
    Native5x64 nd, ne;
    apply_corrected_row(m.u, d, m.v, e, nd);
    apply_corrected_row(m.q, d, m.r, e, ne);
    d = nd;
    e = ne;
}

} // namespace bb::bernstein_yang

#include "./bernstein_yang_inverse_wasm.hpp"

namespace bb::bernstein_yang {

#if defined(__wasm__)
using State = Wasm9x29;
#else
using State = Native5x64;
#endif

/**
 * @brief Variable-time safegcd inverse (Bernstein-Yang TCHES 2019, Pornin 2020 §4).
 *
 * Iterates (f, g) starting at (p, a); each outer iter batches BATCH divsteps
 * into a 2×2 matrix M and applies M to (f, g) / (d, e).  When g reaches 0,
 * gcd(p, a) = ±f and a⁻¹ = ±d mod p.  Returns 0 for a == 0.
 *
 * @param p_inv_mod_2k  p⁻¹ mod 2^BATCH (used by apply_divstep_matrix's 2-adic correction).
 * @pre p odd prime, p < 2^255, 0 ≤ a < p.
 */
template <class S = State>
inline uint256_t invert_vartime(const uint256_t& a, const uint256_t& p, u64 p_inv_mod_2k) noexcept
{
    if (a == uint256_t(0)) {
        return uint256_t(0);
    }
    S P(p), f = P, g(a), d, e = S::one();
    // δ is Pornin's auxiliary used by the divstep rule to decide swap-vs-add cases.
    i64 delta = 1;
    for (int i = 0; i < S::NUM_ITERATIONS; ++i) {
        DivstepMatrix m = S::compute_divstep_matrix(delta, f.low_64(), g.low_64());
        S::apply_divstep_matrix(m, f, g, d, e, P, p_inv_mod_2k);
        if (g.is_zero()) {
            break;
        }
        if ((i + 1) % S::REDUCE_INTERVAL == 0) {
            d.reduce_to_canonical(P);
            e.reduce_to_canonical(P);
        }
    }
    d.reduce_to_canonical(P);
    if (f.is_negative()) {
        d.neg();
        d.reduce_to_canonical(P);
    }
    return d.to_uint256();
}

inline constexpr u64 p_inv_mod_2k_from_montgomery_r_inv(u64 r_inv) noexcept
{
    return State::p_inv_mod_2k_from_montgomery_r_inv(r_inv);
}

// True iff `invert_vartime` is usable for field params T: the active
// kernel must be compilable on this toolchain (Native5x64 needs __int128, the
// WASM kernel is unconditional) and T's modulus must fit BY's < 2^255
// precondition.  Used to gate the dispatch in `field::invert()`.
template <class T>
inline constexpr bool supported_v =
#if defined(__SIZEOF_INT128__) || defined(__wasm__)
    T::modulus_3 < (1ULL << 63);
#else
    false;
#endif

} // namespace bb::bernstein_yang
