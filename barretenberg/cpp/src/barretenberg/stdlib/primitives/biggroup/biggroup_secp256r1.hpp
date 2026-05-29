// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

/**
 * Special-case scalar-multiplication path for the secp256r1 ECDSA verification circuit.
 *
 * For an ECDSA verification we want to compute R = u₁ · G + u₂ · Q. Each side uses a different in-circuit strategy:
 *
 *   - u₁ · G  (fixed base): Pedersen-style 8-bit-window plookup tables holding precomputed `k · 2^(8w) · G + offset`
 *     entries. No in-circuit doublings; cost is ~32 plookup reads + 31 chain-adds + a constant offset subtract.
 *     See `element::secp256r1_fixed_base_mul`.
 *
 *   - u₂ · Q  (variable base): "fake-GLV" (1). The prover supplies a hint T₂ claimed to equal u₂·Q together with
 *     integers (α₂, β₂) from a half-GCD of (n, u₂) so that
 *         β₂ · u₂ ≡ α₂ (mod n),     |α₂|, |β₂| < √n < 2¹²⁸ for secp256r1.
 *     The identity
 *         α₂ · Q − β₂ · T₂ = O       (iff T₂ = (α₂/β₂) · Q = u₂·Q,  given β₂ ≠ 0)
 *     is verified as a 2-MSM at 128 bits via the generic `batch_mul`.
 *
 * Soundness ingredients on the variable-base side:
 *   - α₂ and |β₂| are range-constrained to 128 bits and β₂ is asserted ≠ 0 (rules out the trivial (0, 0)
 *     decomposition).
 *   - The decomposition check β₂_signed · u₂ ≡ α₂ (mod n) pins (α₂, β₂) to u₂.
 *   - T₂ is pinned to u₂·Q by the 2-MSM identity.
 *
 * [1] Fake GLV discussion
 *https://ethresear.ch/t/fake-glv-you-dont-need-an-efficient-endomorphism-to-implement-glv-like-scalar-multiplication-in-snark-circuits/20394
 **/
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_secp256r1_impl.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/secp256r1_fixed_base.hpp"

namespace bb::stdlib::element_default {

namespace detail {

/**
 * @brief Native fake-GLV decomposition for a secp256r1 scalar.
 *
 * @details Given a scalar `s` mod n, runs the extended Euclidean algorithm on (n, s) and returns the first
 * (α, β) pair with `α = u_{m+1} < 2¹²⁸` and `β = v_{m+1}` (computed modulo n; sign recovered
 * by comparing against n/2 -- safe because |v_{m+1}| < √n << n/2). Always satisfies
 *
 *     (β_is_negative ? -β_abs : β_abs) · s ≡ α (mod n)
 *
 * with `α` and `β_abs` strictly less than `2¹²⁸` (in fact ≤ √n < 2¹²⁸ for secp256r1). For the degenerate
 * case s = 0, the loop terminates immediately and we return (0, 1, false); callers must ensure s != 0 (the
 * caller in this file uses `Fr::conditional_assign` to substitute 0 → 1 prior to decomposition).
 */
struct fake_glv_decomposition {
    bb::numeric::uint256_t alpha;
    bb::numeric::uint256_t beta_abs;
    bool beta_is_negative;
};

inline fake_glv_decomposition compute_secp256r1_fake_glv_decomposition(const ::bb::secp256r1::fr& s)
{
    using uint256 = bb::numeric::uint256_t;

    constexpr uint256 n = ::bb::secp256r1::fr::modulus;
    constexpr uint256 half_n = n >> 1;
    constexpr uint256 bound = uint256(1) << 128;

    // Extended Euclidean Algo invariant maintained across the loop body (and on entry):
    //     v_prev · s ≡ u_prev (mod n)    and    v_curr · s ≡ u_curr (mod n)
    // Verified for the initial values below: 0 · s ≡ n ≡ 0  and  1 · s ≡ s.
    // The update v_next = v_prev − q · v_curr, u_next = u_prev − q · u_curr
    // (where q = ⌊u_prev / u_curr⌋) preserves it by linearity.
    uint256 u_prev = n;
    uint256 u_curr = uint256(s);
    ::bb::secp256r1::fr v_prev = ::bb::secp256r1::fr::zero();
    ::bb::secp256r1::fr v_curr = ::bb::secp256r1::fr::one();

    while (u_curr >= bound && u_curr != 0) {
        const uint256 q = u_prev / u_curr;
        const uint256 u_next = u_prev - q * u_curr;
        const ::bb::secp256r1::fr v_next = v_prev - ::bb::secp256r1::fr(q) * v_curr;
        u_prev = u_curr;
        v_prev = v_curr;
        u_curr = u_next;
        v_curr = v_next;
    }

    const uint256 v_uint = uint256(v_curr);

    fake_glv_decomposition result;
    result.alpha = u_curr;
    if (v_uint <= half_n) {
        result.beta_is_negative = false;
        result.beta_abs = v_uint;
    } else {
        result.beta_is_negative = true;
        result.beta_abs = n - v_uint;
    }
    return result;
}

} // namespace detail

template <typename C, class Fq, class Fr, class G>
template <typename, typename>
typename element<C, Fq, Fr, G>::Secp256r1EcdsaMulResult element<C, Fq, Fr, G>::secp256r1_ecdsa_mul(
    const element& pubkey, const Fr& u1, const Fr& u2)
{
    using FrNative = typename G::Fr;
    using AffineNative = typename G::affine_element;
    using ElementNative = typename G::element;

    C* builder = pubkey.get_context();

    // T₁ = u₁ · G via the Pedersen-style fixed-base plookup tables
    element T1 = element::secp256r1_fixed_base_mul(u1);

    // T₂ = u₂ · Q via fake-GLV
    //
    // The fake-GLV path cannot compute u₂·Q for u₂ ∈ {0, ±1}:
    //   - u₂ = 0  → T₂_native = 0·Q = O makes witness generation fail downstream.
    //   - u₂ = ±1 → T₂ = ±Q collides with Q in batch_mul's tables (incomplete addition divides by zero).
    // Substitute u₂_safe = 2 internally so witness generation completes for any input. The returned
    // element is then wrong for u₂ ∈ {0, ±1}; CALLERS MUST gate signature validity on u₂ ∉ {0, ±1} via a
    // separate `!u2_is_degenerate` check (see `ecdsa_verify_signature`).
    const Fr neg_one_fr = -Fr::one();
    const bool_ct u2_is_degenerate = (u2 == Fr::zero()) || (u2 == Fr::one()) || (u2 == neg_one_fr);
    Fr u2_safe = Fr::conditional_assign(u2_is_degenerate, Fr(2), u2);

    // fake-GLV idea: find α₂, |β₂| such that: α₂·Q − β₂·T₂ = O and α₂, |β₂| < 2¹²⁸
    const FrNative u2_n(uint256_t(u2_safe.get_value() % Fr::modulus_u512));
    const AffineNative pubkey_native = pubkey.get_value();
    const AffineNative T2_native(ElementNative(pubkey_native) * u2_n);
    const auto decomp2 = detail::compute_secp256r1_fake_glv_decomposition(u2_n);

    // Witness and range-constrain (α₂, |β₂|).
    field_ct alpha2_field(witness_ct(builder, bb::fr(decomp2.alpha)));
    field_ct beta2_abs_field(witness_ct(builder, bb::fr(decomp2.beta_abs)));
    alpha2_field.create_range_constraint(128, "secp256r1 fake-GLV: α₂ ≥ 2¹²⁸");
    beta2_abs_field.create_range_constraint(128, "secp256r1 fake-GLV: |β₂| ≥ 2¹²⁸");

    // Rule out (α, β) = (0, 0): with β = 0 the identity α·Q − β·T₂ = O collapses to α·Q = O, satisfied by any
    // T₂ whenever α = 0, which would leave T₂ unconstrained and allow forgery.
    beta2_abs_field.assert_is_not_zero("secp256r1 fake-GLV: β₂ must be nonzero");

    // Create witnesses for α₂, |β₂| and sign of β₂
    const bool_ct beta2_neg(witness_ct(builder, decomp2.beta_is_negative));
    const field_ct zero_witness = field_ct::from_witness_index(builder, builder->zero_idx());

    // Pack each 128-bit native field_ct as a "short" bigfield using the (lo, hi) constructor
    // The 128-bit value goes in as the low half (lo 136 bits) and the high half (hi 120 bits) is set to zero.
    Fr alpha2_fr(alpha2_field, zero_witness);
    Fr beta2_abs_fr(beta2_abs_field, zero_witness);

    // Validate the decomposition: β₂_signed · u₂ ≡ α₂ (mod n)
    Fr neg_beta2_fr = -beta2_abs_fr;
    Fr beta2_signed_fr = Fr::conditional_assign(beta2_neg, neg_beta2_fr, beta2_abs_fr);
    (beta2_signed_fr * u2_safe).assert_equal(alpha2_fr, "secp256r1 fake-GLV: β₂ · u₂ ≠ α₂ (mod n)");

    // Witness T₂ and verify it's not at infinity
    element T2 = element::from_witness(builder, T2_native);
    T2.is_point_at_infinity().assert_equal(bool_ct(false), "secp256r1 fake-GLV: T₂ at infinity");

    // T₂_msm absorbs the sign of β₂ so the 2-MSM has positive scalars only:
    //   if β₂ > 0  → T₂_msm = -T₂, so |β₂| · T₂_msm = -β₂ · T₂
    //   if β₂ < 0  → T₂_msm = +T₂, so |β₂| · T₂_msm =  β₂_abs · T₂ = -β₂ · T₂
    element T2_neg = -T2;
    element T2_msm = T2_neg.conditional_select(T2, beta2_neg);

    // Verify α₂·Q − β₂·T₂ = O via the generic 1-bit-NAF Strauss MSM
    element msm = element::batch_mul(
        { pubkey, T2_msm }, { alpha2_fr, beta2_abs_fr }, /*max_num_bits=*/128, /*with_edgecases=*/false);
    msm.is_point_at_infinity().assert_equal(bool_ct(true), "secp256r1 fake-GLV: α₂·Q − β₂·T₂ ≠ O");

    // Return (T₁ + T₂) = u₁·G + u₂_safe·Q paired with the soundness flag (false iff substitution fired).
    return { T1 + T2, !u2_is_degenerate };
}

/**
 * @brief Fixed-base multiplication u·G for secp256r1 via a Pedersen-style plookup decomposition.
 *
 * The plookup tables backing the lookups live in plookup_tables/secp256r1_fixed_base.hpp — for window
 * w, the precomputed entry k stores the point `k · 2^(8w) · G + 2^w · H` (H = the "biggroup table
 * offset generator"). Four BasicTables per window cover the binary-basis limb axes (xlo, xhi, ylo,
 * yhi); 32 × 4 = 128 BasicTables total. Eight MultiTables (4 axes × {lo, hi}) chain the per-window
 * BasicTables and let us drive the whole scalar through `plookup_read::get_lookup_accumulators`. The
 * bigfield prime-basis limb is recomputed in-circuit from the four binary limbs (see the 4-limb
 * `unsafe_construct_from_limbs` in `build_element` below) rather than stored in a fifth table — this
 * trades 2 add gates per coordinate per window for 8192 fewer preprocessed table rows.
 *
 * We split the bigfield scalar u into u_low (low 17 windows, ≤ 2·NUM_LIMB_BITS = 136 bits) and u_high
 * (high 15 windows, ≤ NUM_LIMB_BITS + NUM_LAST_LIMB_BITS = 120 bits) using u's own binary basis limbs.
 * The plookup gate emitted by each MultiTable call asserts that its byte slices reconstruct the input
 * field_t — combined with u's bigfield invariant (limbs reconstruct u), this pins the per-window
 * lookups to u itself. No explicit byte witnesses or range constraints are needed.
 *
 * Sum of the 32 looked-up points = `u · G + (2^32 − 1) · H`. The constant total offset is subtracted
 * out of the chain-add result.
 *
 * Edge case: u = 0 yields raw_result = total_offset, so the final subtract collapses to the identity.
 * The `operator-` infinity-detection path returns canonical infinity at (0, 0) with `is_infinity=true`,
 * which downstream `+` calls correctly treat as the group identity.
 */
template <typename C, class Fq, class Fr, class G>
template <typename, typename>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::secp256r1_fixed_base_mul(const Fr& u)
{
    using AffineNative = typename G::affine_element;
    using FqNative = typename G::Fq;
    using FBT = bb::plookup::secp256r1_fixed_base::table;
    using MultiTableId = bb::plookup::MultiTableId;
    using ColumnIdx = bb::plookup::ColumnIdx;

    constexpr size_t NUM_WINDOWS = FBT::NUM_WINDOWS;
    constexpr size_t NUM_WINDOWS_LO = FBT::NUM_WINDOWS_LO;
    constexpr size_t NUM_WINDOWS_HI = FBT::NUM_WINDOWS_HI;

    C* builder = u.get_context();
    BB_ASSERT(builder != nullptr, "secp256r1_fixed_base_mul: u must be associated with a circuit context.");

    // Step 1: extract u_low and u_high from u's bigfield binary basis limbs.
    //   u_low  = limbs[0] + 2^NUM_LIMB_BITS · limbs[1]   < 2^(2·NUM_LIMB_BITS) = 2^136
    //   u_high = limbs[2] + 2^NUM_LIMB_BITS · limbs[3]   < 2^(NUM_LIMB_BITS + NUM_LAST_LIMB_BITS) = 2^120
    // The bigfield invariant ties u_low and u_high to u itself; the plookup mechanism asserts that the
    // per-window byte slices reconstruct u_low and u_high (via the column-1 accumulator structure).
    const bb::fr limb_shift = bb::fr(uint256_t(1) << Fr::NUM_LIMB_BITS);
    const field_ct u_low = u.get_limb(0).element + (u.get_limb(1).element * limb_shift);
    const field_ct u_high = u.get_limb(2).element + (u.get_limb(3).element * limb_shift);

    // Step 2: drive u_low / u_high through the 10 secp256r1 fixed-base MultiTables. Each call returns
    // per-window (limb_a, limb_b) pairs via the C2/C3 columns (step size 0 ⇒ no accumulation).
    auto read = [&](MultiTableId id, const field_ct& key) {
        return bb::stdlib::plookup_read<C>::get_lookup_accumulators(id, key);
    };
    const auto xlo_lo = read(MultiTableId::SECP256R1_FIXED_BASE_XLO_LO, u_low);
    const auto xlo_hi = read(MultiTableId::SECP256R1_FIXED_BASE_XLO_HI, u_high);
    const auto xhi_lo = read(MultiTableId::SECP256R1_FIXED_BASE_XHI_LO, u_low);
    const auto xhi_hi = read(MultiTableId::SECP256R1_FIXED_BASE_XHI_HI, u_high);
    const auto ylo_lo = read(MultiTableId::SECP256R1_FIXED_BASE_YLO_LO, u_low);
    const auto ylo_hi = read(MultiTableId::SECP256R1_FIXED_BASE_YLO_HI, u_high);
    const auto yhi_lo = read(MultiTableId::SECP256R1_FIXED_BASE_YHI_LO, u_low);
    const auto yhi_hi = read(MultiTableId::SECP256R1_FIXED_BASE_YHI_HI, u_high);

    // Step 3: assemble 32 elements. Window j of the full decomposition corresponds to:
    //   - lo-half index j        for j ∈ [0, NUM_WINDOWS_LO)
    //   - hi-half index (j − NUM_WINDOWS_LO) for j ∈ [NUM_WINDOWS_LO, NUM_WINDOWS)
    // The 4-limb `unsafe_construct_from_limbs` recomputes prime_basis_limb in-circuit (see docstring).
    std::array<element, NUM_WINDOWS> looked_up;
    auto build_element = [&](const auto& xlo_r, const auto& xhi_r, const auto& ylo_r, const auto& yhi_r, size_t j) {
        const Fq x = Fq::unsafe_construct_from_limbs(
            xlo_r[ColumnIdx::C2][j], xlo_r[ColumnIdx::C3][j], xhi_r[ColumnIdx::C2][j], xhi_r[ColumnIdx::C3][j]);
        const Fq y = Fq::unsafe_construct_from_limbs(
            ylo_r[ColumnIdx::C2][j], ylo_r[ColumnIdx::C3][j], yhi_r[ColumnIdx::C2][j], yhi_r[ColumnIdx::C3][j]);
        return element(x, y, /*assert_on_curve=*/false);
    };
    for (size_t j = 0; j < NUM_WINDOWS_LO; ++j) {
        looked_up[j] = build_element(xlo_lo, xhi_lo, ylo_lo, yhi_lo, j);
    }
    for (size_t j = 0; j < NUM_WINDOWS_HI; ++j) {
        looked_up[NUM_WINDOWS_LO + j] = build_element(xlo_hi, xhi_hi, ylo_hi, yhi_hi, j);
    }

    // Step 4: chain-add the 32 looked-up points to defer per-add y-coordinate computation.
    auto chain = element::chain_add_start(looked_up[0], looked_up[1]);
    for (size_t i = 2; i < NUM_WINDOWS; ++i) {
        chain = element::chain_add(looked_up[i], chain);
    }
    const element raw_result = element::chain_add_end(chain);

    // Step 5: subtract the constant total offset (= sum of all per-window offsets) to recover u·G.
    const AffineNative total_offset_affine = FBT::total_offset();
    const element offset_correction(Fq(FqNative(total_offset_affine.x)),
                                    Fq(FqNative(total_offset_affine.y)),
                                    /*assert_on_curve=*/false);
    return raw_result - offset_correction;
}

} // namespace bb::stdlib::element_default
