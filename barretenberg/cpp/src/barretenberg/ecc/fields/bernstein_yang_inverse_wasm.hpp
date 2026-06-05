// 9 × 29-bit-limb state.  Included from bernstein_yang_inverse.hpp; uses the
// u64 / i64 / DivstepMatrix names declared there.
//
// Why a different limb size from Native5x64: on wasm32 there is no native
// 64×64→128 multiply, so i64 × u64 → __int128 lowers to a compiler-rt
// __multi3 dispatch.  Pack the 254-bit state into 9 limbs of 29 bits each
// instead: every limb-level product is then i29 × i29 = i58, fitting in a
// single WASM i64.mul.  Choosing the per-iter BATCH as exactly 2 × LIMB_BITS
// makes the "/ 2^BATCH" at the end of apply_divstep_matrix equivalent to dropping
// the bottom two 29-bit limbs (no sub-limb shift on the intermediate).

#pragma once

#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstdint>

namespace bb::bernstein_yang {

class Wasm9x29 {
  public:
    // Divsteps per matrix application; smaller than Native5x64::BATCH so
    // the resulting "/ 2^BATCH" is limb-aligned (= drop the bottom two
    // 29-bit limbs) and no sub-limb shift is needed on the intermediate.
    static constexpr int BATCH = 58;

    // ⌈735 / 58⌉ = 13.  Same convergence-bound logic as Native5x64; one
    // iter more because BATCH is smaller.
    static constexpr int NUM_ITERATIONS = 13;

    // |d|, |e| can grow by ~2× + p per matrix application; after 4 iters
    // they reach ~31p ≈ 2^259, which still fits in the 9 × 29-bit signed
    // state (capacity ~2^260).  Reducing once every 4 iters instead of
    // every iter saves ~3× reduce_to_canonical calls per inversion.
    static constexpr int REDUCE_INTERVAL = 4;

    // Worst-case iteration cap inside reduce_to_canonical.  After
    // REDUCE_INTERVAL iters between reductions, |d|, |e| ≤ (2^(REDUCE_INTERVAL+1) - 1)·p,
    // so reducing requires that many subtractions plus one break iter.
    static constexpr int REDUCE_TO_CANONICAL_MAX_ITERS = 36;
    static_assert((1U << (REDUCE_INTERVAL + 1)) <= REDUCE_TO_CANONICAL_MAX_ITERS,
                  "REDUCE_INTERVAL too large for reduce_to_canonical iteration bound");

    Wasm9x29() noexcept
        : l{}
    {}
    explicit Wasm9x29(const uint256_t& x) noexcept
    {
        const u64* d = x.data;
        l[0] = (i64)(d[0] & LIMB_MASK);
        l[1] = (i64)((d[0] >> 29) & LIMB_MASK);
        l[2] = (i64)(((d[0] >> 58) & 0x3FULL) | ((d[1] & 0x7FFFFFULL) << 6));
        l[3] = (i64)((d[1] >> 23) & LIMB_MASK);
        l[4] = (i64)(((d[1] >> 52) & 0xFFFULL) | ((d[2] & 0x1FFFFULL) << 12));
        l[5] = (i64)((d[2] >> 17) & LIMB_MASK);
        l[6] = (i64)(((d[2] >> 46) & 0x3FFFFULL) | ((d[3] & 0x7FFULL) << 18));
        l[7] = (i64)((d[3] >> 11) & LIMB_MASK);
        l[8] = (i64)((d[3] >> 40) & 0xFFFFFFULL);
    }
    static Wasm9x29 one() noexcept
    {
        Wasm9x29 r;
        r.l[0] = 1;
        return r;
    }

    uint256_t to_uint256() const noexcept
    {
        return { (u64)l[0] | ((u64)l[1] << 29) | ((u64)l[2] << 58),
                 ((u64)l[2] >> 6) | ((u64)l[3] << 23) | ((u64)l[4] << 52),
                 ((u64)l[4] >> 12) | ((u64)l[5] << 17) | ((u64)l[6] << 46),
                 ((u64)l[6] >> 18) | ((u64)l[7] << 11) | ((u64)l[8] << 40) };
    }
    u64 low_64() const noexcept { return (u64)l[0] | ((u64)l[1] << 29) | (((u64)l[2] & 0x3F) << 58); }
    bool is_zero() const noexcept
    {
        i64 a = 0;
        for (int i = 0; i < N; ++i) {
            a |= l[i];
        }
        return a == 0;
    }
    bool is_negative() const noexcept { return l[N - 1] < 0; }
    void neg() noexcept
    {
        for (int i = 0; i < N; ++i) {
            l[i] = -l[i];
        }
        normalise();
    }
    void reduce_to_canonical(const Wasm9x29& p) noexcept;

    // See Native5x64 for the batched divstep matrix, matrix application,
    // and p_inv_mod_2k_from_montgomery_r_inv contracts; the bodies differ only
    // in limb representation.
    static DivstepMatrix compute_divstep_matrix(i64& delta, u64 f_lo, u64 g_lo) noexcept;
    static void apply_divstep_matrix(const DivstepMatrix& m,
                                     Wasm9x29& f,
                                     Wasm9x29& g,
                                     Wasm9x29& d,
                                     Wasm9x29& e,
                                     const Wasm9x29& p,
                                     u64 p_inv_mod_2k) noexcept;
    static constexpr u64 p_inv_mod_2k_from_montgomery_r_inv(u64 r_inv) noexcept
    {
        // r_inv = -p^{-1} mod 2^64, so 0 - r_inv = p^{-1} mod 2^64.
        return (0ULL - r_inv) & ((1ULL << BATCH) - 1);
    }

  private:
    static constexpr int N = 9;
    static constexpr int LIMB_BITS = 29;
    static constexpr u64 LIMB_MASK = (1ULL << LIMB_BITS) - 1;
    i64 l[N]; // top limb carries sign; lower limbs in [0, 2^29) post-normalise

    void normalise() noexcept
    {
        i64 c = 0;
        for (int i = 0; i < N - 1; ++i) {
            i64 v = l[i] + c;
            l[i] = v & (i64)LIMB_MASK;
            c = v >> LIMB_BITS;
        }
        l[N - 1] += c;
    }
    void add_inplace(const Wasm9x29& b) noexcept
    {
        for (int i = 0; i < N; ++i) {
            l[i] += b.l[i];
        }
        normalise();
    }
    void sub_inplace(const Wasm9x29& b) noexcept
    {
        for (int i = 0; i < N; ++i) {
            l[i] -= b.l[i];
        }
        normalise();
    }
};

// Iter cap chosen by the REDUCE_TO_CANONICAL_MAX_ITERS / REDUCE_INTERVAL
// static_assert above; see those constants for the magnitude argument.
inline void Wasm9x29::reduce_to_canonical(const Wasm9x29& p) noexcept
{
    normalise();
    for (int it = 0; it < REDUCE_TO_CANONICAL_MAX_ITERS; ++it) {
        if (is_negative()) {
            add_inplace(p);
            continue;
        }
        int cmp = 0;
        for (int i = N - 1; i >= 0; --i) {
            if (l[i] != p.l[i]) {
                cmp = l[i] > p.l[i] ? 1 : -1;
                break;
            }
        }
        if (cmp < 0) {
            break;
        }
        sub_inplace(p);
    }
}

inline DivstepMatrix Wasm9x29::compute_divstep_matrix(i64& delta, u64 f_lo, u64 g_lo) noexcept
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

// Streamed schoolbook: for each limb position i compute
//   nf_i = u_lo·f_i + v_lo·g_i + u_hi·f_{i-1} + v_hi·g_{i-1} + carry_in
// (similarly ng, nd, ne), then carry_out = nf_i >> LIMB_BITS, masked low
// 29 bits land at output position i - 2 (= exact >> BATCH).  The de row
// derives k_d, k_e from the low two limbs up front and folds k·p into the
// per-limb formula from position 2 onward.  No 11-limb intermediate is
// materialised — the JIT keeps the four running carries in registers.
inline void Wasm9x29::apply_divstep_matrix(const DivstepMatrix& m,
                                           Wasm9x29& f,
                                           Wasm9x29& g,
                                           Wasm9x29& d,
                                           Wasm9x29& e,
                                           const Wasm9x29& p,
                                           u64 p_inv_mod_2k) noexcept
{
    constexpr u64 MASK_BATCH = (1ULL << BATCH) - 1;
    const i64 u_lo = m.u & (i64)LIMB_MASK, u_hi = m.u >> LIMB_BITS;
    const i64 v_lo = m.v & (i64)LIMB_MASK, v_hi = m.v >> LIMB_BITS;
    const i64 q_lo = m.q & (i64)LIMB_MASK, q_hi = m.q >> LIMB_BITS;
    const i64 r_lo = m.r & (i64)LIMB_MASK, r_hi = m.r >> LIMB_BITS;

    {
        i64 cf = 0, cg = 0, fp = 0, gp = 0;
        for (int i = 0; i < N; ++i) {
            const i64 fi = f.l[i], gi = g.l[i];
            const i64 nf = u_lo * fi + v_lo * gi + u_hi * fp + v_hi * gp + cf;
            const i64 ng = q_lo * fi + r_lo * gi + q_hi * fp + r_hi * gp + cg;
            cf = nf >> LIMB_BITS;
            cg = ng >> LIMB_BITS;
            if (i >= 2) {
                f.l[i - 2] = nf & (i64)LIMB_MASK;
                g.l[i - 2] = ng & (i64)LIMB_MASK;
            }
            fp = fi;
            gp = gi;
        }
        const i64 nf9 = u_hi * fp + v_hi * gp + cf;
        const i64 ng9 = q_hi * fp + r_hi * gp + cg;
        f.l[N - 2] = nf9 & (i64)LIMB_MASK;
        g.l[N - 2] = ng9 & (i64)LIMB_MASK;
        f.l[N - 1] = nf9 >> LIMB_BITS;
        g.l[N - 1] = ng9 >> LIMB_BITS;
    }

    // k_d, k_e (mod 2^BATCH) clear the low BATCH bits of nd, ne; fold k·p
    // into the streaming pass from position 2 onward.
    {
        const i64 d0 = d.l[0], e0 = e.l[0], d1 = d.l[1], e1 = e.l[1];
        const i64 nd0 = u_lo * d0 + v_lo * e0;
        const i64 ne0 = q_lo * d0 + r_lo * e0;
        const i64 nd1 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
        const i64 ne1 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;
        const u64 t_d = ((u64)nd0 & LIMB_MASK) | (((u64)(nd1 + (nd0 >> LIMB_BITS)) & LIMB_MASK) << LIMB_BITS);
        const u64 t_e = ((u64)ne0 & LIMB_MASK) | (((u64)(ne1 + (ne0 >> LIMB_BITS)) & LIMB_MASK) << LIMB_BITS);
        const u64 k_d = ((0ULL - t_d) * p_inv_mod_2k) & MASK_BATCH;
        const u64 k_e = ((0ULL - t_e) * p_inv_mod_2k) & MASK_BATCH;
        const i64 kd_lo = (i64)(k_d & LIMB_MASK), kd_hi = (i64)(k_d >> LIMB_BITS);
        const i64 ke_lo = (i64)(k_e & LIMB_MASK), ke_hi = (i64)(k_e >> LIMB_BITS);
        i64 cd = (nd1 + kd_lo * p.l[1] + kd_hi * p.l[0] + ((nd0 + kd_lo * p.l[0]) >> LIMB_BITS)) >> LIMB_BITS;
        i64 ce = (ne1 + ke_lo * p.l[1] + ke_hi * p.l[0] + ((ne0 + ke_lo * p.l[0]) >> LIMB_BITS)) >> LIMB_BITS;

        i64 dp = d1, ep = e1;
        for (int i = 2; i < N; ++i) {
            const i64 di = d.l[i], ei = e.l[i];
            const i64 nd = u_lo * di + v_lo * ei + u_hi * dp + v_hi * ep + kd_lo * p.l[i] + kd_hi * p.l[i - 1] + cd;
            const i64 ne = q_lo * di + r_lo * ei + q_hi * dp + r_hi * ep + ke_lo * p.l[i] + ke_hi * p.l[i - 1] + ce;
            cd = nd >> LIMB_BITS;
            ce = ne >> LIMB_BITS;
            d.l[i - 2] = nd & (i64)LIMB_MASK;
            e.l[i - 2] = ne & (i64)LIMB_MASK;
            dp = di;
            ep = ei;
        }
        const i64 nd9 = u_hi * dp + v_hi * ep + kd_hi * p.l[N - 1] + cd;
        const i64 ne9 = q_hi * dp + r_hi * ep + ke_hi * p.l[N - 1] + ce;
        d.l[N - 2] = nd9 & (i64)LIMB_MASK;
        e.l[N - 2] = ne9 & (i64)LIMB_MASK;
        d.l[N - 1] = nd9 >> LIMB_BITS;
        e.l[N - 1] = ne9 >> LIMB_BITS;
    }
}

} // namespace bb::bernstein_yang
