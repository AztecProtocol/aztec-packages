#pragma once

#include "field_declarations.hpp"

#include <array>
#include <bit>
#include <cstdint>
#include <span>
#include <type_traits>

#if defined(__wasm_relaxed_simd__) && defined(__wasm__)
#include <wasm_simd128.h>

namespace bb {
namespace detail {

// Relaxed-SIMD paired RNE helpers for WASM paired multiplication in the
// modulus range covered by the paired coarse-output proof.
// Uses the 5x51 limbs representations to efficiently compute the limb multiplication
// using floating point SIMD multiply and add operation.

inline constexpr uint64_t WASM_PAIRED_LIMB_BITS = 51;
inline constexpr uint64_t WASM_PAIRED_LIMB_MASK = (1ULL << WASM_PAIRED_LIMB_BITS) - 1;
// 5 limbs * 51 bits = 255 bits, enough to hold any value < 2^255 (modulus has < 2^254).
inline constexpr size_t WASM_PAIRED_NUM_LIMBS = 5;
// The paired end-to-end bound closes exactly when p < 2^254 - 2^204 = (2^62 - 2^12) * 2^192,
// so the top limb of a largest safe field modulus is 2^62 - 2^12 - 1. This covers the
// BN254 / Grumpkin field parameters.
inline constexpr uint64_t WASM_PAIRED_MAX_MODULUS_3 = MODULUS_TOP_LIMB_LARGE_THRESHOLD - (1ULL << 12) - 1;

// Type-level predicate: true when the runtime supports relaxed-SIMD AND the field's
// modulus fits within the paired-bound proof's range. Drives the single guard in
// paired_mul / paired_sqr.
template <class Params> inline constexpr bool supports_paired_simd = Params::modulus_3 <= WASM_PAIRED_MAX_MODULUS_3;

// Anchors for the Emmart-Zheng two-FMA integer multiply: for a,b < 2^51 we
// have a*b < 2^102, and the two FMAs split that 102-bit product into
//   p_hi = a*b + C1 + delta
//   p_lo = a*b + (C2 - p_hi) = (C2 - C1) - delta
// where p_hi contributes the high 51 bits and p_lo the low 51 bits after the
// anchor bias is cancelled in the integer accumulator.
inline constexpr double C1_D = 0x1p103;
inline constexpr double C2_D = C1_D + 0x1p52 + 0x1p51;

// Each p_lo / p_hi lane, when reinterpreted as int64, carries a constant
// IEEE-754 bias: P_LO_BIAS from C2-C1 and P_HI_BIAS from C1. Those biases
// are deterministic and additive, so they accumulate in every column at a
// rate fixed by the pipeline schedule (schoolbook 5x5, 3 rho folds, 2 CIOS
// rounds). make_initial() seeds the columns with the negation of that total
// bias, so it cancels exactly when the column finishes summing.
inline constexpr std::array<uint64_t, 2 * WASM_PAIRED_NUM_LIMBS> LO_BIAS_COUNTS = { 1, 2, 3, 8, 10, 9, 8, 7, 2, 0 };
inline constexpr std::array<uint64_t, 2 * WASM_PAIRED_NUM_LIMBS> HI_BIAS_COUNTS = { 0, 1, 2, 3, 8, 10, 9, 8, 7, 2 };

// Repack an x < 2^255 (4x64 little-endian) into the paired-RNE 5x51 layout.
BB_INLINE constexpr std::array<uint64_t, WASM_PAIRED_NUM_LIMBS> split_to_5x51(std::span<const uint64_t, 4> l) noexcept
{
    return {
        l[0] & WASM_PAIRED_LIMB_MASK,
        ((l[0] >> 51) | (l[1] << 13)) & WASM_PAIRED_LIMB_MASK,
        ((l[1] >> 38) | (l[2] << 26)) & WASM_PAIRED_LIMB_MASK,
        ((l[2] >> 25) | (l[3] << 39)) & WASM_PAIRED_LIMB_MASK,
        (l[3] >> 12) & WASM_PAIRED_LIMB_MASK,
    };
}

// Inverse of split_to_5x51, with a fused >>1 (kernel R=2^255 → outer R=2^256).
BB_INLINE constexpr std::array<uint64_t, 4> pack_to_4x64_shr_1(
    const std::array<uint64_t, WASM_PAIRED_NUM_LIMBS>& l) noexcept
{
    return {
        (l[0] >> 1) | (l[1] << 50),
        (l[1] >> 14) | (l[2] << 37),
        (l[2] >> 27) | (l[3] << 24),
        (l[3] >> 40) | (l[4] << 11),
    };
}

// Returns -p0^{-1} mod 2^WASM_PAIRED_LIMB_BITS (the Montgomery scalar n' for the 5x51 layout).
// Hensel iteration x ← x*(2 - p0*x) doubles the correct low bits each step, so 6 rounds from
// x=1 (correct mod 2 since p0 is odd) reach 64 bits, which we then mask down to 51.
constexpr uint64_t compute_r_inv_local(uint64_t p0) noexcept
{
    uint64_t x = 1;
    for (int i = 0; i < 6; ++i) {
        x = x * (2 - p0 * x);
    }
    return -x & WASM_PAIRED_LIMB_MASK;
}

// Computes 2^{-limb_bits} mod p by iteratively dividing by 2 and conditionally adding p.
constexpr uint256_t compute_div_r_inv_local(const uint256_t& p, unsigned limb_bits) noexcept
{
    uint256_t result(1);
    for (unsigned i = 0; i < limb_bits; ++i) {
        uint64_t carry = 0;
        // If `result` is odd, add p (≡ 0 mod p) to flip parity without changing the residue.
        if ((result.data[0] & 1) != 0) {
            uint256_t sum = result + p;
            carry = (sum < result) ? 1ULL : 0ULL;
            result = sum;
        }
        // Halve the (now-even) result by shifting all 4 limbs right by 1; the +p overflow re-enters at bit 255.
        result = uint256_t((result.data[0] >> 1) | (result.data[1] << 63),
                           (result.data[1] >> 1) | (result.data[2] << 63),
                           (result.data[2] >> 1) | (result.data[3] << 63),
                           (result.data[3] >> 1) | (carry << 63));
    }
    return result;
}

template <class Params> struct paired_rne_constants {
    // Field modulus repacked into the 5x51 layout.
    static constexpr std::array<uint64_t, WASM_PAIRED_NUM_LIMBS> u51_p = split_to_5x51(field<Params>::modulus.data);
    // Montgomery scalar n' = -p^{-1} mod 2^51, used by the two CIOS rounds.
    static constexpr uint64_t u51_np0 = compute_r_inv_local(field<Params>::modulus.data[0]);
    // rho[k-1] = beta^{-k} mod p (with beta = 2^51), used for parallel reductions.
    static constexpr std::array<std::array<uint64_t, WASM_PAIRED_NUM_LIMBS>, 4> rho = []() constexpr {
        std::array<std::array<uint64_t, WASM_PAIRED_NUM_LIMBS>, 4> out{};
        for (unsigned k = 1; k <= 4; ++k) {
            out[k - 1] = split_to_5x51(
                compute_div_r_inv_local(field<Params>::modulus, static_cast<unsigned>(WASM_PAIRED_LIMB_BITS) * k).data);
        }
        return out;
    }();
};

// Per-column initial value that cancels the anchor bias left behind by
// accumulating the `low_count` p_lo terms and `high_count` p_hi terms.
BB_INLINE constexpr int64_t make_initial(uint64_t low_count, uint64_t high_count) noexcept
{
    constexpr uint64_t P_HI_BIAS = 0x4660000000000000ULL;
    constexpr uint64_t P_LO_BIAS = 0x4338000000000000ULL;
    const uint64_t val = high_count * P_HI_BIAS + low_count * P_LO_BIAS;
    return -static_cast<int64_t>(val);
}

BB_INLINE v128_t fma_v(v128_t a, v128_t b, v128_t c) noexcept
{
    return __builtin_wasm_relaxed_madd_f64x2(a, b, c);
}

// Emmart-Zheng FMA pair: returns { p_hi, p_lo } — the anchor-biased high and low halves
// of a*b. Both lanes carry the IEEE-754 bias from C1 and (C2 - C1) that make_initial() cancels.
BB_INLINE std::array<v128_t, 2> ez_mul(v128_t a, v128_t b) noexcept
{
    const v128_t C1_V = wasm_f64x2_const_splat(C1_D);
    const v128_t C2_V = wasm_f64x2_const_splat(C2_D);
    const v128_t p_hi = fma_v(a, b, C1_V);
    const v128_t p_lo = fma_v(a, b, wasm_f64x2_sub(C2_V, p_hi));
    return { p_hi, p_lo };
}

// Streaming schoolbook row: accumulates a * bs[0..N-1] into the mutable span ts[0..N].
// Sibling of smult_noinit_paired_v128 below, which returns a fresh array instead.
// Streams hi forward so each ts slot is written exactly once.
template <size_t N>
BB_INLINE void mul_accum_paired_row(v128_t a, const std::array<v128_t, N>& bs, std::span<v128_t, N + 1> ts) noexcept
{
    static_assert(N >= 1, "mul_accum_paired_row requires at least one b limb");
    // h_prev=0 so j=0's add(h_prev, l) folds to `l`.
    v128_t h_prev = wasm_i64x2_const_splat(0);
    BB_FORCE_UNROLL
    for (size_t j = 0; j < N; ++j) {
        auto [h, l] = ez_mul(a, bs[j]);
        ts[j] = wasm_i64x2_add(ts[j], wasm_i64x2_add(h_prev, l));
        h_prev = h;
    }
    ts[N] = wasm_i64x2_add(ts[N], h_prev);
}

// Lane-parallel i64x2 -> f64x2 conversion without an explicit cast
// instruction. ORing with the IEEE-754 bits of 2^52 yields exactly 2^52 + u in
// f64 for each lane, then subtraction removes the bias. Requires u < 2^52.
BB_INLINE v128_t i2f_v128(v128_t u) noexcept
{
    const v128_t bias = wasm_i64x2_const_splat(0x4330000000000000LL);
    return wasm_f64x2_sub(wasm_v128_or(u, bias), bias);
}

// Streaming schoolbook row with a compile-time multiplicand V: returns s * V as a fresh
// (NUM_LIMBS+1)-limb array. Sibling of mul_accum_paired_row above, which accumulates into
// a runtime span instead. Streams hi forward to so each out slot is written exactly once.
template <std::array<uint64_t, WASM_PAIRED_NUM_LIMBS> V>
BB_INLINE std::array<v128_t, WASM_PAIRED_NUM_LIMBS + 1> smult_noinit_paired_v128(v128_t s_vec_u64) noexcept
{
    const v128_t s_f = i2f_v128(s_vec_u64);
    std::array<v128_t, WASM_PAIRED_NUM_LIMBS + 1> out;
    // h_prev=0 so k=0's add(h_prev, l) folds to `l`.
    v128_t h_prev = wasm_i64x2_const_splat(0);
    BB_FORCE_UNROLL
    for (size_t k = 0; k < WASM_PAIRED_NUM_LIMBS; ++k) {
        auto [h, l] = ez_mul(s_f, wasm_f64x2_splat(static_cast<double>(V[k])));
        out[k] = wasm_i64x2_add(h_prev, l);
        h_prev = h;
    }
    out[WASM_PAIRED_NUM_LIMBS] = h_prev;
    return out;
}

// One carry-propagation pass: bits past 51 in each of t[0..NUM_LIMBS-2] are folded into
// t[i+1]. The top limb t[NUM_LIMBS-1] is left wider — pack_to_4x64_shr_1 consumes it directly.
BB_INLINE std::array<v128_t, WASM_PAIRED_NUM_LIMBS> redundant_carry_paired_v128(
    const std::array<v128_t, WASM_PAIRED_NUM_LIMBS>& t) noexcept
{
    const v128_t WASM_PAIRED_LIMB_MASK_V = wasm_i64x2_const_splat(static_cast<int64_t>(WASM_PAIRED_LIMB_MASK));
    std::array<v128_t, WASM_PAIRED_NUM_LIMBS> res{};
    v128_t borrow = wasm_i64x2_const_splat(0);
    BB_FORCE_UNROLL
    for (size_t i = 0; i < WASM_PAIRED_NUM_LIMBS - 1; ++i) {
        const v128_t tmp = wasm_i64x2_add(t[i], borrow);
        res[i] = wasm_v128_and(tmp, WASM_PAIRED_LIMB_MASK_V);
        borrow = wasm_i64x2_shr(tmp, 51);
    }
    res[WASM_PAIRED_NUM_LIMBS - 1] = wasm_i64x2_add(t[WASM_PAIRED_NUM_LIMBS - 1], borrow);
    return res;
}

// Per-lane constant-time conditional add: if a lane's lowest bit is set, add
// B to that lane, otherwise leave it unchanged.
template <std::array<uint64_t, WASM_PAIRED_NUM_LIMBS> B>
BB_INLINE std::array<v128_t, WASM_PAIRED_NUM_LIMBS> reduce_ct_paired_v128(
    const std::array<v128_t, WASM_PAIRED_NUM_LIMBS>& a) noexcept
{
    const v128_t lsb = wasm_v128_and(a[0], wasm_i64x2_const_splat(1));
    const v128_t mask = wasm_i64x2_neg(lsb);
    std::array<v128_t, WASM_PAIRED_NUM_LIMBS> res;
    BB_FORCE_UNROLL
    for (size_t i = 0; i < WASM_PAIRED_NUM_LIMBS; ++i) {
        const v128_t bi = wasm_i64x2_splat(static_cast<int64_t>(B[i]));
        res[i] = wasm_i64x2_add(a[i], wasm_v128_and(bi, mask));
    }
    return res;
}

// Reduces a paired column accumulator t_in (each lane holding the schoolbook
// output of a*b with both inputs in relaxed Montgomery form < 2*p, so per-lane
// value < 4*p^2 in the 5x51 layout) modulo R = 2^256, and returns a pair of
// field<Params> — one per SIMD lane. Output is in relaxed Montgomery form
// (< 2*p), matching the rest of the lazy-reduction field API.
//
// The five reduction phases are:
//   1. Signed carry propagation through t[0..3], normalizing the low half so
//      phase 2 can mask off 51-bit chunks cleanly.
//   2. Three rho folds: t[0..2] are pulled into the 7-limb high window via the
//      precomputed beta^{-k} factors (rho[0..2]); t[3] enters at its natural
//      beta^3 position with no extra fold.
//   3. Two CIOS rounds. Each picks m = ss_low * u51_np0 mod 2^51, adds m*p to
//      the live window, then propagates the dropped limb's carry forward. This
//      strips the bottom two 51-bit limbs and brings the value into [0, 2*p)
//      under the kernel R = 2^255.
//   4. Constant-time conditional add of p (so ss is even) and one carry
//      normalization pass — preparation for the halving step that converts
//      kernel R = 2^255 to outer R = 2^256.
//   5. Lane split and 5x51 -> 4x64 repack via pack_to_4x64_shr_1, whose fused
//      >>1 performs the halving from phase 4. The output remains in relaxed
//      Montgomery form (< 2*p).
template <class Params>
BB_INLINE std::array<field<Params>, 2> reduce_and_finalize_paired_rne(
    const std::array<v128_t, 2 * WASM_PAIRED_NUM_LIMBS>& t_in) noexcept
{
    using constants = paired_rne_constants<Params>;

    // Phase 1: propagate signed carries through t[0..3]. The rho folds in
    // phase 2 mask t[0..2] to 51 bits, so we must push their high bits up
    // first or they'd be silently dropped.
    const v128_t t0 = t_in[0];
    const v128_t t1 = wasm_i64x2_add(t_in[1], wasm_i64x2_shr(t0, 51));
    const v128_t t2 = wasm_i64x2_add(t_in[2], wasm_i64x2_shr(t1, 51));
    const v128_t t3 = wasm_i64x2_add(t_in[3], wasm_i64x2_shr(t2, 51));

    // Phase 2: for k = 0, 1, 2, add to the high limbs of t_in (positions β^3..β^9)
    //   t_k * β^k ≡ (t_k * β^{k-3}) * β^3  (mod p).
    // Since t_in = Σ_{k=0}^{9} t_k * β^k, applying this identity to k = 0, 1, 2
    // gives
    //   t_in ≡ β^3 * Σ_{k=0}^{9} t_k * β^{k-3}  (mod p),
    // so we can drop the bottom 3 limbs (153 bits) and keep working on the
    // 7-limb β^3..β^9 window. The three folds share no inputs, so they can
    // be computed in parallel.
    const v128_t WASM_PAIRED_LIMB_MASK_V = wasm_i64x2_const_splat(static_cast<int64_t>(WASM_PAIRED_LIMB_MASK));

    const std::array<std::array<v128_t, WASM_PAIRED_NUM_LIMBS + 1>, 3> r = {
        smult_noinit_paired_v128<constants::rho[2]>(wasm_v128_and(t0, WASM_PAIRED_LIMB_MASK_V)),
        smult_noinit_paired_v128<constants::rho[1]>(wasm_v128_and(t1, WASM_PAIRED_LIMB_MASK_V)),
        smult_noinit_paired_v128<constants::rho[0]>(wasm_v128_and(t2, WASM_PAIRED_LIMB_MASK_V)),
    };

    const std::array<v128_t, 7> t_high = { t3, t_in[4], t_in[5], t_in[6], t_in[7], t_in[8], t_in[9] };
    std::array<v128_t, 7> ss;
    // Tree-balanced add per limb: (r0+r1) and (t_high+r2) first, then sum.
    BB_FORCE_UNROLL
    for (size_t k = 0; k < WASM_PAIRED_NUM_LIMBS + 1; ++k) {
        const v128_t r01 = wasm_i64x2_add(r[0][k], r[1][k]);
        const v128_t t_plus_r2 = wasm_i64x2_add(t_high[k], r[2][k]);
        ss[k] = wasm_i64x2_add(r01, t_plus_r2);
    }
    ss[6] = t_high[6];

    // Phase 3: ss ≡ t_in/β^3 (mod p), but its integer value is on the order of
    // β^2 * p as phase 2 preserved the residue without shrinking magnitude.
    // Two CIOS reductions tighten ss to ~2p. Each step computes
    //   m = ss[i] * np0 mod β
    // then performs ss ← (ss + m * p) / β, with bound transform
    //   ss < B ⇒ ss < B/β + p.
    // Chaining from ~β^2 * p: β p + p → 2p + p/β. Phase 5's halving absorbs
    // the residual p/β slack into the final < 2p contract.
    BB_FORCE_UNROLL
    for (size_t i = 0; i < 2; ++i) {
        const uint64_t s_lane0 = static_cast<uint64_t>(wasm_i64x2_extract_lane(ss[i], 0));
        const uint64_t s_lane1 = static_cast<uint64_t>(wasm_i64x2_extract_lane(ss[i], 1));
        const uint64_t m_lane0 = (s_lane0 * constants::u51_np0) & WASM_PAIRED_LIMB_MASK;
        const uint64_t m_lane1 = (s_lane1 * constants::u51_np0) & WASM_PAIRED_LIMB_MASK;
        const v128_t m = wasm_i64x2_make(static_cast<int64_t>(m_lane0), static_cast<int64_t>(m_lane1));
        const auto mp = smult_noinit_paired_v128<constants::u51_p>(m);
        BB_FORCE_UNROLL
        for (size_t k = 0; k < WASM_PAIRED_NUM_LIMBS + 1; ++k) {
            ss[i + k] = wasm_i64x2_add(ss[i + k], mp[k]);
        }
        ss[i + 1] = wasm_i64x2_add(ss[i + 1], wasm_i64x2_shr(ss[i], 51));
    }

    // Phase 4: prepare ss[2..6] for halving. ss ≡ t_in / 2^255 (mod p); we
    // want ss / 2 to land at outer R = 2^256. If ss is odd, add p (p is odd
    // ⇒ ss + p is even and ≡ ss mod p), then normalize via carry propagation.
    const std::array<v128_t, WASM_PAIRED_NUM_LIMBS> s_arr = { ss[2], ss[3], ss[4], ss[5], ss[6] };
    const std::array<v128_t, WASM_PAIRED_NUM_LIMBS> s_reduced = reduce_ct_paired_v128<constants::u51_p>(s_arr);
    const std::array<v128_t, WASM_PAIRED_NUM_LIMBS> normalized = redundant_carry_paired_v128(s_reduced);

    // Phase 5: extract per-lane scalar 5x51 arrays and repack to 4x64 via
    // pack_to_4x64_shr_1, whose fused >>1 performs the halve prepared in
    // phase 4 (kernel R = 2^255 → outer R = 2^256).
    std::array<uint64_t, WASM_PAIRED_NUM_LIMBS> out1_u255;
    std::array<uint64_t, WASM_PAIRED_NUM_LIMBS> out2_u255;
    BB_FORCE_UNROLL
    for (size_t k = 0; k < WASM_PAIRED_NUM_LIMBS; ++k) {
        out1_u255[k] = static_cast<uint64_t>(wasm_i64x2_extract_lane(normalized[k], 0));
        out2_u255[k] = static_cast<uint64_t>(wasm_i64x2_extract_lane(normalized[k], 1));
    }

    const auto out1 = pack_to_4x64_shr_1(out1_u255);
    const auto out2 = pack_to_4x64_shr_1(out2_u255);
    return { field<Params>{ out1[0], out1[1], out1[2], out1[3] }, field<Params>{ out2[0], out2[1], out2[2], out2[3] } };
}

// Pack two field elements (4x64) into the paired 5x51 SIMD layout: lane 0
// carries lane0's limbs, lane 1 carries lane1's. Inputs are converted to
// f64 via the bias trick (see i2f_v128) so they can feed ez_mul directly.
template <class Params>
BB_INLINE std::array<v128_t, WASM_PAIRED_NUM_LIMBS> pack_paired_lanes(const field<Params>& lane0,
                                                                      const field<Params>& lane1) noexcept
{
    const auto l0 = split_to_5x51(lane0.data);
    const auto l1 = split_to_5x51(lane1.data);
    std::array<v128_t, WASM_PAIRED_NUM_LIMBS> out;
    BB_FORCE_UNROLL
    for (size_t k = 0; k < WASM_PAIRED_NUM_LIMBS; ++k) {
        out[k] = i2f_v128(wasm_i64x2_make(static_cast<int64_t>(l0[k]), static_cast<int64_t>(l1[k])));
    }
    return out;
}

} // namespace detail
} // namespace bb

#endif

namespace bb {

template <class T>
constexpr std::array<field<T>, 2> field<T>::paired_mul(const field& a,
                                                       const field& b,
                                                       const field& c,
                                                       const field& d) noexcept
{
#if defined(__wasm_relaxed_simd__) && defined(__wasm__)
    // The 5×51 layout itself only requires p < 2^254, but the current
    // implementation-level coarse-output proof closes only for the top-limb
    // range captured by WASM_PAIRED_MAX_MODULUS_3. Larger moduli fall back to
    // the ordinary single-lane path.
    if constexpr (T::modulus_3 <= detail::WASM_PAIRED_MAX_MODULUS_3) {
        if (!std::is_constant_evaluated()) {
            using namespace detail;

            // Pack inputs into paired 5x51 SIMD lanes — lane 0 holds (a, b), lane 1 holds (c, d).
            const auto a_vecs = pack_paired_lanes<T>(a, c);
            const auto b_vecs = pack_paired_lanes<T>(b, d);

            // Seed the 10 column accumulators with the FMA bias-cancellation values.
            std::array<v128_t, 2 * WASM_PAIRED_NUM_LIMBS> ts;
            BB_FORCE_UNROLL
            for (size_t k = 0; k < 2 * WASM_PAIRED_NUM_LIMBS; ++k) {
                ts[k] = wasm_i64x2_splat(make_initial(LO_BIAS_COUNTS[k], HI_BIAS_COUNTS[k]));
            }

            // 5x5 schoolbook: each row streams its p_hi forward into the next column,
            // so every column is touched exactly once per row.
            mul_accum_paired_row(a_vecs[0], b_vecs, std::span(ts).subspan<0, 6>());
            mul_accum_paired_row(a_vecs[1], b_vecs, std::span(ts).subspan<1, 6>());
            mul_accum_paired_row(a_vecs[2], b_vecs, std::span(ts).subspan<2, 6>());
            mul_accum_paired_row(a_vecs[3], b_vecs, std::span(ts).subspan<3, 6>());
            mul_accum_paired_row(a_vecs[4], b_vecs, std::span(ts).subspan<4, 6>());

            return reduce_and_finalize_paired_rne<T>(ts);
        }
    }
#endif
    return { a * b, c * d };
}

template <class T> constexpr std::array<field<T>, 2> field<T>::paired_sqr(const field& a, const field& b) noexcept
{
#if defined(__wasm_relaxed_simd__) && defined(__wasm__)
    // The 5×51 layout itself only requires p < 2^254, but the current
    // implementation-level coarse-output proof closes only for the top-limb
    // range captured by WASM_PAIRED_MAX_MODULUS_3. Larger moduli fall back to
    // the ordinary single-lane path.
    if constexpr (T::modulus_3 <= detail::WASM_PAIRED_MAX_MODULUS_3) {
        if (!std::is_constant_evaluated()) {
            using namespace detail;

            // Pack inputs into paired 5x51 SIMD lanes — lane 0 holds a, lane 1 holds b.
            const auto a_vecs = pack_paired_lanes<T>(a, b);

            // Triangular schoolbook: accumulate off-diagonal a_i * a_j (i < j) products
            // first, double them with an i64x2 self-add, then add the five diagonal
            // a_i * a_i products. Bias seeds go in last so the doubling step doesn't
            // double them.
            std::array<v128_t, 2 * WASM_PAIRED_NUM_LIMBS> ts{};
            mul_accum_paired_row(a_vecs[0],
                                 std::array<v128_t, 4>{ a_vecs[1], a_vecs[2], a_vecs[3], a_vecs[4] },
                                 std::span(ts).subspan<1, 5>());
            mul_accum_paired_row(
                a_vecs[1], std::array<v128_t, 3>{ a_vecs[2], a_vecs[3], a_vecs[4] }, std::span(ts).subspan<3, 4>());
            mul_accum_paired_row(
                a_vecs[2], std::array<v128_t, 2>{ a_vecs[3], a_vecs[4] }, std::span(ts).subspan<5, 3>());
            mul_accum_paired_row(a_vecs[3], std::array<v128_t, 1>{ a_vecs[4] }, std::span(ts).subspan<7, 2>());

            BB_FORCE_UNROLL
            for (size_t k = 1; k < 2 * WASM_PAIRED_NUM_LIMBS - 1; ++k) {
                ts[k] = wasm_i64x2_add(ts[k], ts[k]);
            }

            mul_accum_paired_row(a_vecs[0], std::array<v128_t, 1>{ a_vecs[0] }, std::span(ts).subspan<0, 2>());
            mul_accum_paired_row(a_vecs[1], std::array<v128_t, 1>{ a_vecs[1] }, std::span(ts).subspan<2, 2>());
            mul_accum_paired_row(a_vecs[2], std::array<v128_t, 1>{ a_vecs[2] }, std::span(ts).subspan<4, 2>());
            mul_accum_paired_row(a_vecs[3], std::array<v128_t, 1>{ a_vecs[3] }, std::span(ts).subspan<6, 2>());
            mul_accum_paired_row(a_vecs[4], std::array<v128_t, 1>{ a_vecs[4] }, std::span(ts).subspan<8, 2>());

            // Add bias seeds. The doubled off-diagonals + diagonals produce the same
            // per-column p_lo / p_hi histogram as a full 5x5 multiplication, so
            // LO_BIAS_COUNTS / HI_BIAS_COUNTS apply unchanged.
            BB_FORCE_UNROLL
            for (size_t k = 0; k < 2 * WASM_PAIRED_NUM_LIMBS; ++k) {
                ts[k] = wasm_i64x2_add(ts[k], wasm_i64x2_splat(make_initial(LO_BIAS_COUNTS[k], HI_BIAS_COUNTS[k])));
            }

            return reduce_and_finalize_paired_rne<T>(ts);
        }
    }
#endif
    return { a.sqr(), b.sqr() };
}

} // namespace bb
