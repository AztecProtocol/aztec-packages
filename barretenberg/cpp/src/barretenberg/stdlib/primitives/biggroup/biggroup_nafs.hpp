// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"

namespace bb::stdlib::element_default {

template <typename C, class Fq, class Fr, class G>
template <size_t wnaf_size>
std::pair<uint64_t, bool> element<C, Fq, Fr, G>::get_staggered_wnaf_fragment_value(const uint64_t fragment_u64,
                                                                                   const uint64_t stagger,
                                                                                   bool is_negative,
                                                                                   bool wnaf_skew)
{
    // If there is no stagger then there is no need to change anything
    if (stagger == 0) {
        return std::make_pair(0, wnaf_skew);
    }

    // Sanity check input fragment
    BB_ASSERT_LT(fragment_u64, (1ULL << stagger), "biggroup_nafs: fragment value ≥ 2^{stagger}");

    // Convert the fragment to signed int for easier manipulation
    int fragment = static_cast<int>(fragment_u64);

    // Inverse the fragment if it's negative
    if (is_negative) {
        fragment = -fragment;
    }
    // If the value is positive and there is a skew in wnaf, subtract 2^{stagger}.
    if (!is_negative && wnaf_skew) {
        fragment -= (1 << stagger);
    }

    // If the value is negative and there is a skew in wnaf, add 2^{stagger}.
    if (is_negative && wnaf_skew) {
        fragment += (1 << stagger);
    }

    // If the lowest bit is zero, then set final skew to 1 and
    // (i) add 1 to the absolute value of the fragment if it's positive
    // (ii) subtract 1 from the absolute value of the fragment if it's negative
    bool output_skew = (fragment_u64 & 1) == 0;
    if (!is_negative && output_skew) {
        fragment += 1;
    } else if (is_negative && output_skew) {
        fragment -= 1;
    }

    // Compute raw wnaf value: w = 2e + 1  =>  e = (w - 1) / 2  => e = ⌊w / 2⌋
    const int signed_wnaf_value = (fragment / 2);
    constexpr int wnaf_window_size = (1ULL << (wnaf_size - 1));
    uint64_t output_fragment = 0;
    if (fragment < 0) {
        output_fragment = static_cast<uint64_t>(wnaf_window_size + signed_wnaf_value - 1);
    } else {
        output_fragment = static_cast<uint64_t>(wnaf_window_size + signed_wnaf_value);
    }

    return std::make_pair(output_fragment, output_skew);
}

template <typename C, class Fq, class Fr, class G>
template <size_t wnaf_size>
std::vector<field_t<C>> element<C, Fq, Fr, G>::convert_wnaf_values_to_witnesses(
    C* builder, const uint64_t* wnaf_values, bool is_negative, size_t rounds, const bool range_constrain_wnaf)
{
    constexpr uint64_t wnaf_window_size = (1ULL << (wnaf_size - 1));

    std::vector<field_ct> wnaf_entries;
    for (size_t i = 0; i < rounds; ++i) {
        // Predicate == sign of current wnaf value
        const bool predicate = (wnaf_values[i] >> 31U) & 1U;            // sign bit (32nd bit)
        const uint64_t wnaf_magnitude = (wnaf_values[i] & 0x7fffffffU); // 31-bit magnitude

        // If the signs of current entry and the whole scalar are the same, then add the magnitude of the
        // wnaf value to the windows size to form an entry. Otherwise, subract the magnitude along with 1.
        // The extra 1 is needed to get a uniform representation of (2e' + 1) as explained in the README.
        uint64_t offset_wnaf_entry = 0;
        if ((!predicate && !is_negative) || (predicate && is_negative)) {
            offset_wnaf_entry = wnaf_window_size + wnaf_magnitude;
        } else {
            offset_wnaf_entry = wnaf_window_size - wnaf_magnitude - 1;
        }
        field_ct wnaf_entry(witness_ct(builder, offset_wnaf_entry));

        // In some cases we may want to skip range constraining the wnaf entries. For example when we use these
        // entries to lookup in a ROM or regular table, it implicitly enforces the range constraint.
        if (range_constrain_wnaf) {
            wnaf_entry.create_range_constraint(wnaf_size, "biggroup_nafs: wnaf_entry is not in range");
        }
        wnaf_entries.emplace_back(wnaf_entry);
    }
    return wnaf_entries;
}

template <typename C, class Fq, class Fr, class G>
template <size_t wnaf_size>
Fr element<C, Fq, Fr, G>::reconstruct_bigfield_from_wnaf(Builder* builder,
                                                         const std::vector<field_t<Builder>>& wnaf,
                                                         const bool_ct& positive_skew,
                                                         const bool_ct& negative_skew,
                                                         const field_t<Builder>& stagger_fragment,
                                                         const size_t stagger,
                                                         const size_t rounds)
{
    // Collect positive wnaf entries for accumulation
    std::vector<field_ct> accumulator;
    for (size_t i = 0; i < rounds; ++i) {
        field_ct entry = wnaf[rounds - 1 - i];
        entry *= field_ct(uint256_t(1) << (i * wnaf_size));
        accumulator.emplace_back(entry);
    }

    // Accumulate entries, shift by stagger and add the stagger itself
    field_ct sum = field_ct::accumulate(accumulator);
    sum = sum * field_ct(bb::fr(1ULL << stagger));
    sum += (stagger_fragment);
    sum = sum.normalize();

    // Convert this value to bigfield element
    Fr reconstructed_positive_part =
        Fr(sum, field_ct::from_witness_index(builder, builder->zero_idx()), /*can_overflow*/ false);

    // Double the final value and add the positive skew
    reconstructed_positive_part =
        (reconstructed_positive_part + reconstructed_positive_part)
            .add_to_lower_limb(field_t<Builder>(positive_skew), /*other_maximum_value*/ uint256_t(1));

    // Start reconstructing the negative part: start with wnaf constant 0xff...ff
    // See the README for explanation of this constant
    constexpr uint64_t wnaf_window_size = (1ULL << (wnaf_size - 1));
    uint256_t negative_constant_wnaf_offset(0);
    for (size_t i = 0; i < rounds; ++i) {
        negative_constant_wnaf_offset += uint256_t((wnaf_window_size * 2) - 1) * (uint256_t(1) << (i * wnaf_size));
    }

    // Shift by stagger
    negative_constant_wnaf_offset = negative_constant_wnaf_offset << stagger;

    // Add for stagger (if any)
    if (stagger > 0) {
        negative_constant_wnaf_offset += ((1ULL << wnaf_size) - 1ULL); // from stagger fragment
    }

    // Add the negative skew to the bigfield constant
    Fr reconstructed_negative_part =
        Fr(nullptr, negative_constant_wnaf_offset).add_to_lower_limb(field_t<Builder>(negative_skew), uint256_t(1));

    // output = x_pos - x_neg (x_pos and x_neg are both non-negative)
    Fr reconstructed = reconstructed_positive_part - reconstructed_negative_part;

    return reconstructed;
}

template <typename C, class Fq, class Fr, class G>
template <size_t num_bits, size_t wnaf_size, size_t lo_stagger, size_t hi_stagger>
std::pair<Fr, typename element<C, Fq, Fr, G>::secp256k1_wnaf> element<C, Fq, Fr, G>::compute_secp256k1_single_wnaf(
    C* builder,
    const secp256k1::fr& scalar,
    size_t stagger,
    bool is_negative,
    const bool range_constrain_wnaf,
    bool is_lo)
{
    // The number of rounds is the minimal required to cover the whole scalar with wnaf_size windows
    constexpr size_t num_rounds = ((num_bits + wnaf_size - 1) / wnaf_size);

    // Stagger mask is needed to retrieve the lowest bits that will not be used in montgomery ladder directly
    const uint64_t stagger_mask = (1ULL << stagger) - 1;

    // Stagger scalar represents the lower "staggered" bits that are not used in the ladder
    const uint64_t stagger_scalar = scalar.data[0] & stagger_mask;

    std::array<uint64_t, num_rounds> wnaf_values = { 0 };
    bool skew_without_stagger = false;
    uint256_t k_u256{ scalar.data[0], scalar.data[1], scalar.data[2], scalar.data[3] };
    k_u256 = k_u256 >> stagger;
    if (is_lo) {
        bb::wnaf::fixed_wnaf<num_bits - lo_stagger, 1, wnaf_size>(
            &k_u256.data[0], &wnaf_values[0], skew_without_stagger, 0);
    } else {
        bb::wnaf::fixed_wnaf<num_bits - hi_stagger, 1, wnaf_size>(
            &k_u256.data[0], &wnaf_values[0], skew_without_stagger, 0);
    }

    // Number of rounds that are needed to reconstruct the scalar without staggered bits
    const size_t num_rounds_excluding_stagger_bits = ((num_bits + wnaf_size - 1 - stagger) / wnaf_size);

    // Compute the stagger-related fragment and the final skew due to the same
    const auto [first_fragment, skew] =
        get_staggered_wnaf_fragment_value<wnaf_size>(stagger_scalar, stagger, is_negative, skew_without_stagger);

    // Get wnaf witnesses
    // Note that we only range constrain the wnaf entries if range_constrain_wnaf is set to true.
    std::vector<field_ct> wnaf = convert_wnaf_values_to_witnesses<wnaf_size>(
        builder, &wnaf_values[0], is_negative, num_rounds_excluding_stagger_bits, range_constrain_wnaf);

    // Compute and constrain skews
    bool_ct negative_skew(witness_ct(builder, is_negative ? 0 : skew), /*use_range_constraint*/ true);
    bool_ct positive_skew(witness_ct(builder, is_negative ? skew : 0), /*use_range_constraint*/ true);

    // Enforce that both positive_skew, negative_skew are not set at the same time
    bool_ct both_skews_cannot_be_one = !(positive_skew & negative_skew);
    both_skews_cannot_be_one.assert_equal(
        bool_ct(builder, true), "biggroup_nafs: both positive and negative skews cannot be set at the same time");

    // Initialize stagger witness
    field_ct stagger_fragment = witness_ct(builder, first_fragment);

    // We only range constrain the stagger fragment if range_constrain_wnaf is set. This is because in some cases
    // we may use the stagger fragment to lookup in a ROM/regular table, which implicitly enforces the range constraint.
    if (range_constrain_wnaf) {
        stagger_fragment.create_range_constraint(wnaf_size, "biggroup_nafs: stagger fragment is not in range");
    }

    // Reconstruct the bigfield scalar from (wnaf + stagger) representation
    Fr reconstructed = reconstruct_bigfield_from_wnaf<wnaf_size>(
        builder, wnaf, positive_skew, negative_skew, stagger_fragment, stagger, num_rounds_excluding_stagger_bits);

    secp256k1_wnaf wnaf_out{ .wnaf = wnaf,
                             .positive_skew = positive_skew,
                             .negative_skew = negative_skew,
                             .least_significant_wnaf_fragment = stagger_fragment,
                             .has_wnaf_fragment = (stagger > 0) };

    return std::make_pair(reconstructed, wnaf_out);
}

/**
 * Split a secp256k1 Fr element into two 129 bit scalars `klo, khi`, where `scalar = klo + \lambda * khi mod n`
 *   where `\lambda` is the cube root of unity mod n, and `n` is the secp256k1 Fr modulus
 *
 * We return the wnaf representation of the two 129-bit scalars
 *
 * The wnaf representation includes `positive_skew` and `negative_skew` components,
 * because for both `klo, khi` EITHER `k < 2^{129}` OR `-k mod n < 2^{129}`.
 * If we have to negate the short scalar, the wnaf skew component flips sign.
 *
 * Outline of algorithm:
 *
 * We will use our wnaf elements to index a ROM table. ROM index values act like regular array indices,
 * i.e. start at 0, increase by 1 per index.
 * We need the wnaf format to follow the same structure.
 *
 * The mapping from wnaf value to lookup table point is as follows (example is 4-bit WNAF):
 *
 *  | wnaf witness value | wnaf real value | point representation |
 *  |--------------------|-----------------|----------------------|
 *  |                  0 |             -15 |              -15.[P] |
 *  |                  1 |             -13 |              -13.[P] |
 *  |                  2 |             -11 |              -11.[P] |
 *  |                  3 |              -9 |               -9.[P] |
 *  |                  4 |              -7 |               -7.[P] |
 *  |                  5 |              -5 |               -5.[P] |
 *  |                  6 |              -3 |               -3.[P] |
 *  |                  7 |              -1 |               -1.[P] |
 *  |                  8 |               1 |                1.[P] |
 *  |                  9 |               3 |                3.[P] |
 *  |                 10 |               5 |                5.[P] |
 *  |                 11 |               7 |                7.[P] |
 *  |                 12 |               9 |                9.[P] |
 *  |                 13 |              11 |               11.[P] |
 *  |                 14 |              13 |               13.[P] |
 *  |                 15 |              15 |               15.[P] |
 *  |--------------------|-----------------|----------------------|
 *
 * The transformation between the wnaf witness value `w` and the wnaf real value `v` is, for an `s`-bit window:
 *
 *                      s
 *          v = 2.w - (2 - 1)
 *
 * To reconstruct the 129-bit scalar multiplier `x` from wnaf values `w` (starting with most significant slice):
 *
 *                                                        m
 *                                                       ___
 *                                                      \     /          s      \    s.(m - i - 1)
 *           x =  positive_skew - negative_skew +        |    | 2.w  - (2  - 1) | . 2
 *                                                      /___  \    i            /
 *                                                       i=0
 *
 * N.B. `m` = number of rounds = (129 + s - 1) / s
 *
 * We can split the RHS into positive and negative components that are strictly positive:
 *
 *                                          m
 *                                         ___
 *                                        \     /    \    s.(m - i - 1)
 *                x_pos = positive_skew +  |    |2.w | . 2
 *                                        /___  \   i/
 *                                         i=0
 *
 *                                          m
 *                                         ___
 *                                        \     /  s     \    s.(m - i - 1)
 *                x_neg = negative_skew +  |    |(2  - 1)| . 2
 *                                        /___  \        /
 *                                         i=0
 *
 * By independently constructing `x_pos`, `x_neg`, we ensure we never underflow the native circuit modulus
 *
 * To reconstruct our wnaf components into a scalar, we perform the following (for each 129-bit slice klo, khi):
 *
 *      1. Compute the wnaf entries and range constrain each entry to be < 2^s
 *      2. Construct `x_pos`
 *      3. Construct `x_neg`
 *      4. Cast `x_pos, x_neg` into two Fr elements and compute `Fr reconstructed = Fr(x_pos) - Fr(x_neg)`
 *
 * This ensures that the only negation in performed in the Fr representation, removing the risk of underflow errors
 *
 * Once `klo, khi` have been reconstructed as Fr elements, we validate the following:
 *
 *      1. `scalar == Fr(klo) - Fr(khi) * Fr(\lambda)
 *
 * Finally, we return the wnaf representations of klo, khi including the skew
 **/
template <typename C, class Fq, class Fr, class G>
template <size_t wnaf_size, size_t lo_stagger, size_t hi_stagger>
typename element<C, Fq, Fr, G>::secp256k1_wnaf_pair element<C, Fq, Fr, G>::compute_secp256k1_endo_wnaf(
    const Fr& scalar, const bool range_constrain_wnaf)
{
    /**
     * The staggered offset describes the number of bits we want to remove from the input scalar before computing our
     * wnaf slices. This is to enable us to make repeated calls to the montgomery ladder algo when computing a
     * multi-scalar multiplication e.g. Consider an example with 2 points (A, B), using a 2-bit WNAF The typical
     * approach would be to perfomr a double-and-add algorithm, adding points into an accumulator ACC:
     *
     * ACC = ACC.dbl()
     * ACC = ACC.dbl()
     * ACC = ACC.add(A)
     * ACC = ACC.add(B)
     *
     * However, if the A and B WNAFs are offset by 1 bit each, we can perform the following:
     *
     * ACC = ACC.dbl()
     * ACC = ACC.add(A)
     * ACC = ACC.dbl()
     * ACC = ACC.add(B)
     *
     * which we can reduce to:
     *
     * ACC = ACC.montgomery_ladder(A)
     * ACC = ACC.montgomery_ladder(B)
     *
     * This is more efficient than the non-staggered approach as we save 1 non-native field multiplication when we
     * replace a DBL, ADD subroutine with a call to the montgomery ladder
     */
    C* builder = scalar.get_context();

    constexpr size_t num_bits = 129;

    // Decomposes the scalar k into two 129-bit scalars klo, khi such that
    // k = klo + ζ * khi (mod n)
    //   = klo - λ * khi (mod n)
    // where ζ is the primitive sixth root of unity mod n, and λ is the primitive cube root of unity mod n
    // (note that ζ = -λ). We know that for any scalar k, such a decomposition exists and klo and khi are 128-bits long.
    secp256k1::fr k(uint256_t(scalar.get_value() % Fr::modulus_u512));
    secp256k1::fr klo(0);
    secp256k1::fr khi(0);
    bool klo_negative = false;
    bool khi_negative = false;
    secp256k1::fr::split_into_endomorphism_scalars(k.from_montgomery_form(), klo, khi);

    // The low and high scalars must be less than 2^129 in absolute value. In some cases, the khi value
    // is returned as negative, in which case we negate it and set a flag to indicate this. This is because
    // we decompose the scalar as:
    // k = klo + ζ * khi (mod n)
    //   = klo - λ * khi (mod n)
    // where λ is the cube root of unity. If khi is negative, then -λ * khi is positive, and vice versa.
    if (khi.uint256_t_no_montgomery_conversion().get_msb() >= 129) {
        khi_negative = true;
        khi = -khi;
    }

    BB_ASSERT_LT(klo.uint256_t_no_montgomery_conversion().get_msb(), 129ULL, "biggroup_nafs: klo > 129 bits");
    BB_ASSERT_LT(khi.uint256_t_no_montgomery_conversion().get_msb(), 129ULL, "biggroup_nafs: khi > 129 bits");

    const auto [klo_reconstructed, klo_out] =
        element<C, Fq, Fr, G>::compute_secp256k1_single_wnaf<num_bits, wnaf_size, lo_stagger, hi_stagger>(
            builder, klo, lo_stagger, klo_negative, range_constrain_wnaf, true);

    const auto [khi_reconstructed, khi_out] =
        element<C, Fq, Fr, G>::compute_secp256k1_single_wnaf<num_bits, wnaf_size, lo_stagger, hi_stagger>(
            builder, khi, hi_stagger, khi_negative, range_constrain_wnaf, false);

    uint256_t minus_lambda_val(-secp256k1::fr::cube_root_of_unity());
    Fr minus_lambda(bb::fr(minus_lambda_val.slice(0, 136)), bb::fr(minus_lambda_val.slice(136, 256)), false);

    Fr reconstructed_scalar = khi_reconstructed.madd(minus_lambda, { klo_reconstructed });

    // Validate that the reconstructed scalar matches the original scalar in circuit
    scalar.assert_equal(reconstructed_scalar, "biggroup_nafs: reconstructed scalar does not match reduced input");

    return { .klo = klo_out, .khi = khi_out };
}

template <typename C, class Fq, class Fr, class G>
std::vector<bool_t<C>> element<C, Fq, Fr, G>::compute_naf(const Fr& scalar, const size_t max_num_bits)
{
    // Get the circuit builder
    C* builder = scalar.get_context();

    // To compute the NAF representation, we first reduce the scalar modulo r (the scalar field modulus).
    uint512_t scalar_multiplier_512 = uint512_t(scalar.get_value()) % uint512_t(Fr::modulus);
    uint256_t scalar_multiplier = scalar_multiplier_512.lo;

    // Number of rounds is either the max_num_bits provided, or the full size of the scalar field modulus.
    // If the scalar is zero, we use the full size of the scalar field modulus as we use scalar = r in this case.
    const size_t num_rounds = (max_num_bits == 0 || scalar_multiplier == 0) ? Fr::modulus.get_msb() + 1 : max_num_bits;

    // NAF can't handle 0 so we set scalar = r in this case.
    if (scalar_multiplier == 0) {
        scalar_multiplier = Fr::modulus;
    }

    // NAF representation consists of num_rounds bits and a skew bit.
    // Given a scalar k, we compute the NAF representation as follows:
    //
    // k = -skew + ₀∑ⁿ⁻¹ (1 - 2 * naf_i) * 2^i
    //
    // where naf_i = (1 - k_{i + 1}) ∈ {0, 1} and k_{i + 1} is the (i + 1)-th bit of the scalar k.
    // If naf_i = 0, then the i-th NAF entry is +1, otherwise it is -1. See the README for more details.
    //
    std::vector<bool_ct> naf_entries(num_rounds + 1);

    // If the scalar is even, we set the skew flag to true and add 1 to the scalar.
    // Sidenote: we apply range constraints to the boolean witnesses instead of full 1-bit range gates.
    const bool skew_value = !scalar_multiplier.get_bit(0);
    scalar_multiplier += uint256_t(static_cast<uint64_t>(skew_value));
    naf_entries[num_rounds] = bool_ct(witness_ct(builder, skew_value), /*use_range_constraint*/ true);

    // We need to manually propagate the origin tag
    naf_entries[num_rounds].set_origin_tag(scalar.get_origin_tag());

    for (size_t i = 0; i < num_rounds - 1; ++i) {
        // If the next entry is false, we need to flip the sign of the current entry (naf_entry := (1 - next_bit)).
        // Apply a basic range constraint per bool, and not a full 1-bit range gate. Results in ~`num_rounds`/4 gates
        // per scalar.
        const bool next_entry = scalar_multiplier.get_bit(i + 1);
        naf_entries[num_rounds - i - 1] = bool_ct(witness_ct(builder, !next_entry), /*use_range_constraint*/ true);

        // We need to manually propagate the origin tag
        naf_entries[num_rounds - i - 1].set_origin_tag(scalar.get_origin_tag());
    }

    // The most significant NAF entry is always (+1) as we are working with scalars < 2^{max_num_bits}.
    // Recall that true represents (-1) and false represents (+1).
    naf_entries[0] = bool_ct(witness_ct(builder, false), /*use_range_constraint*/ true);
    naf_entries[0].set_origin_tag(scalar.get_origin_tag());

    // validate correctness of NAF
    if constexpr (!Fr::is_composite) {
        std::vector<Fr> accumulators;
        for (size_t i = 0; i < num_rounds; ++i) {
            // bit = 1 - 2 * naf
            Fr entry(naf_entries[num_rounds - i - 1]);
            entry *= -2;
            entry += 1;
            entry *= static_cast<Fr>(uint256_t(1) << (i));
            accumulators.emplace_back(entry);
        }
        accumulators.emplace_back(-Fr(naf_entries[num_rounds])); // -skew
        Fr accumulator_result = Fr::accumulate(accumulators);
        scalar.assert_equal(accumulator_result);
    } else {
        const auto reconstruct_half_naf = [](bool_ct* nafs, const size_t half_round_length) {
            field_ct negative_accumulator(0);
            field_ct positive_accumulator(0);
            for (size_t i = 0; i < half_round_length; ++i) {
                negative_accumulator = negative_accumulator + negative_accumulator + field_ct(nafs[i]);
                positive_accumulator = positive_accumulator + positive_accumulator + field_ct(1) - field_ct(nafs[i]);
            }
            return std::make_pair(positive_accumulator, negative_accumulator);
        };

        std::pair<field_ct, field_ct> hi_accumulators;
        std::pair<field_ct, field_ct> lo_accumulators;

        if (num_rounds > Fr::NUM_LIMB_BITS * 2) {
            const size_t midpoint = num_rounds - (Fr::NUM_LIMB_BITS * 2);
            hi_accumulators = reconstruct_half_naf(&naf_entries[0], midpoint);
            lo_accumulators = reconstruct_half_naf(&naf_entries[midpoint], num_rounds - midpoint);
        } else {
            // If the number of rounds is ≤ (2 * Fr::NUM_LIMB_BITS), the high bits of the resulting Fr element are 0.
            const field_ct zero = field_ct::from_witness_index(builder, builder->zero_idx());
            lo_accumulators = reconstruct_half_naf(&naf_entries[0], num_rounds);
            hi_accumulators = std::make_pair(zero, zero);
        }

        // Add the skew bit to the low accumulator's negative part
        lo_accumulators.second = lo_accumulators.second + field_ct(naf_entries[num_rounds]);

        Fr reconstructed_positive = Fr(lo_accumulators.first, hi_accumulators.first);
        Fr reconstructed_negative = Fr(lo_accumulators.second, hi_accumulators.second);
        Fr accumulator = reconstructed_positive - reconstructed_negative;
        accumulator.assert_equal(scalar);
    }

    // Propagate tags to naf
    const auto original_tag = scalar.get_origin_tag();
    for (auto& naf_entry : naf_entries) {
        naf_entry.set_origin_tag(original_tag);
    }
    return naf_entries;
}
} // namespace bb::stdlib::element_default
