// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
/**
 * Special case function for performing BN254 group operations
 *
 * TODO: we should try to genericize this, but this method is super fiddly and we need it to be efficient!
 *
 * We use a special case algorithm to split bn254 scalar multipliers into endomorphism scalars
 *
 **/
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
namespace bb::stdlib::element_default {

/**
 * A batch multiplication method for the BN254 curve. This method is only available if Fr == field_t<bb::fr>
 *
 * big_points : group elements we will multiply by full 254-bit scalar multipliers
 * big_scalars : 254-bit scalar multipliers. We want to compute (\sum big_scalars[i] * big_points[i])
 * small_points : group elements we will multiply by short scalar mutipliers whose max value will be (1 <<
 *max_num_small_bits) small_scalars : short scalar mutipliers whose max value will be (1 << max_num_small_bits)
 * max_num_small_bits : MINIMUM value must be 128 bits
 * (we will be splitting `big_scalars` into two 128-bit scalars, we assume all scalars after this transformation are 128
 *bits)
 **/
template <typename C, class Fq, class Fr, class G>
template <typename, typename>
    requires(IsNotMegaBuilder<C>)
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::bn254_endo_batch_mul(const std::vector<element>& big_points,
                                                                  const std::vector<Fr>& big_scalars,
                                                                  const std::vector<element>& small_points,
                                                                  const std::vector<Fr>& small_scalars,
                                                                  const size_t max_num_small_bits)
{

    BB_ASSERT_EQ(max_num_small_bits % 2, 0U);

    const size_t num_big_points = big_points.size();
    const size_t num_small_points = small_points.size();
    C* ctx = nullptr;
    for (auto element : big_points) {
        if (element.get_context()) {
            ctx = element.get_context();
            break;
        }
    }

    std::vector<element> points;
    std::vector<Fr> scalars;
    std::vector<element> endo_points;
    std::vector<Fr> endo_scalars;

    /**
     * Split big scalars into short 128-bit scalars.
     *
     * For `big_scalars` we use the BN254 curve endomorphism to split the scalar into two short 128-bit scalars.
     * i.e. for scalar multiplier `k` we derive 128-bit values `k1, k2` where:
     *   k = k1 - k2 * \lambda
     * (\lambda is the cube root of unity modulo the group order of the BN254 curve)
     *
     * This ensures ALL our scalar multipliers can now be treated as 128-bit scalars,
     * which halves the number of iterations of our main "double and add" loop!
     */
    bb::fr lambda = bb::fr::cube_root_of_unity();
    bb::fq beta = bb::fq::cube_root_of_unity();
    for (size_t i = 0; i < num_big_points; ++i) {
        Fr scalar = big_scalars[i];
        // Q: is it a problem if wraps? get_value is 512 bits
        // A: it can't wrap, this method only compiles if the Fr type is a field_t<bb::fr> type

        // Split k into short scalars (scalar_k1, scalar_k2) using bn254 endomorphism.
        bb::fr k = uint256_t(scalar.get_value());
        bb::fr k1(0);
        bb::fr k2(0);
        bb::fr::split_into_endomorphism_scalars(k.from_montgomery_form(), k1, k2);
        Fr scalar_k1 = Fr::from_witness(ctx, k1.to_montgomery_form());
        Fr scalar_k2 = Fr::from_witness(ctx, k2.to_montgomery_form());

        // Propagate tags
        scalar_k1.set_origin_tag(scalar.get_origin_tag());
        scalar_k2.set_origin_tag(scalar.get_origin_tag());

        // Add copy constraint that validates k1 = scalar_k1 - scalar_k2 * \lambda
        scalar.assert_equal(scalar_k1 - scalar_k2 * lambda);
        scalars.push_back(scalar_k1);
        endo_scalars.push_back(scalar_k2);
        element point = big_points[i];
        points.push_back(point);

        // negate the point that maps to the endo scalar `scalar_k2`
        // instead of computing scalar_k1 * [P] - scalar_k2 * [P], we compute scalar_k1 * [P] + scalar_k2 * [-P]
        point.y = -point.y;
        point.x = point.x * Fq(ctx, uint256_t(beta));
        point.y.self_reduce();
        endo_points.push_back(point);
    }
    for (size_t i = 0; i < num_small_points; ++i) {
        points.push_back(small_points[i]);
        scalars.push_back(small_scalars[i]);
    }
    std::copy(endo_points.begin(), endo_points.end(), std::back_inserter(points));
    std::copy(endo_scalars.begin(), endo_scalars.end(), std::back_inserter(scalars));

    // Compute the tag of the result
    OriginTag union_tag{};
    for (size_t i = 0; i < points.size(); i++) {
        union_tag = OriginTag(union_tag, OriginTag(points[i].get_origin_tag(), scalars[i].get_origin_tag()));

        // Remove tags so they don't interfere during computation
        points[i].set_origin_tag(OriginTag());
        scalars[i].set_origin_tag(OriginTag());
    }
    BB_ASSERT_EQ(big_scalars.size(), num_big_points);
    BB_ASSERT_EQ(small_scalars.size(), num_small_points);

    /**
     * Compute batch_lookup_table
     *
     * batch_lookup_table implements a lookup table for a vector of points.
     *
     * We subdivide `batch_lookup_table` into a set of 3-bit lookup tables,
     * (using 2-bit and 1-bit tables if points.size() is not a multiple of 8)
     *
     * We index the lookup table using a vector of NAF values for each point
     *
     * e.g. for points P_1, .., P_N and naf values s_1, ..., s_n (where S_i = +1 or -1),
     * the lookup table will compute:
     *
     *  \sum_{i=0}^n (s_i ? -P_i : P_i)
     **/
    batch_lookup_table point_table(points);

    /**
     * Compute scalar multiplier NAFs
     *
     * A Non Adjacent Form is a representation of an integer where each 'bit' is either +1 OR -1, i.e. each bit
     *entry is non-zero. This is VERY useful for biggroup operations, as this removes the need to conditionally add
     *points depending on whether the scalar mul bit is +1 or 0 (instead we multiply the y-coordinate by the NAF
     *value, which is cheaper)
     *
     * The vector `naf_entries` tracks the `naf` set for each point, where each `naf` set is a vector of bools
     * if `naf[i][j] = 0` this represents a NAF value of -1
     * if `naf[i][j] = 1` this represents a NAF value of +1
     **/
    const size_t num_rounds = max_num_small_bits;
    const size_t num_points = points.size();
    std::vector<std::vector<bool_ct>> naf_entries;
    for (size_t i = 0; i < num_points; ++i) {
        naf_entries.emplace_back(compute_naf(scalars[i], max_num_small_bits));
    }

    /**
     * Initialize accumulator point with an offset generator. See `compute_offset_generators` for detailed
     *explanation
     **/
    const auto offset_generators = compute_offset_generators(num_rounds);

    /**
     * Get the initial entry of our point table. This is the same as point_table.get_accumulator for the most
     *significant NAF entry. HOWEVER, we know the most significant NAF value is +1 because our scalar muls are
     *positive. `get_initial_entry` handles this special case as it's cheaper than `point_table.get_accumulator`
     **/
    element accumulator = offset_generators.first + point_table.get_initial_entry();

    /**
     * Main "double and add" loop
     *
     * Each loop iteration traverses TWO bits of our scalar multiplier. Algorithm performs following:
     *
     * 1. Extract NAF value for bit `2*i - 1` for each scalar multiplier and store in `nafs` vector.
     * 2. Use `nafs` vector to derive the point that we need (`add_1`) to add into our accumulator.
     * 3. Repeat the above 2 steps but for bit `2 * i` (`add_2`)
     * 4. Compute `accumulator = 4 * accumulator + 2 * add_1 + add_2` using `multiple_montgomery_ladder` method
     *
     * The purpose of the above is to minimize the number of required range checks (vs a simple double and add algo).
     *
     * When computing repeated iterations of the montgomery ladder algorithm, we can neglect computing the y-coordinate
     *of each ladder output. See `multiple_montgomery_ladder` for more details.
     **/
    for (size_t i = 1; i < num_rounds / 2; ++i) {
        // `nafs` tracks the naf value for each point for the current round
        std::vector<bool_ct> nafs;
        for (size_t j = 0; j < points.size(); ++j) {
            nafs.emplace_back(naf_entries[j][i * 2 - 1]);
        }

        /**
         * Get `chain_add_accumulator`.
         *
         * Recovering a point from our point table requires group additions iff the table is >3 bits.
         * We can chain repeated add operations together without computing the y-coordinate of intermediate addition
         *outputs.
         *
         * This is represented using the `chain_add_accumulator` type. See the type declaration for more details
         *
         * (this is cheaper than regular additions iff point_table.get_accumulator require 2 or more point additions.
         *  Cost is the same as `point_table.get_accumulator` if 1 or 0 point additions are required)
         **/
        element::chain_add_accumulator add_1 = point_table.get_chain_add_accumulator(nafs);
        for (size_t j = 0; j < points.size(); ++j) {
            nafs[j] = (naf_entries[j][i * 2]);
        }
        element::chain_add_accumulator add_2 = point_table.get_chain_add_accumulator(nafs);

        // Perform the double montgomery ladder.
        accumulator = accumulator.multiple_montgomery_ladder({ add_1, add_2 });
    }

    // we need to iterate 1 more time if the number of rounds is even
    if ((num_rounds & 0x01ULL) == 0x00ULL) {
        std::vector<bool_ct> nafs;
        for (size_t j = 0; j < points.size(); ++j) {
            nafs.emplace_back(naf_entries[j][num_rounds - 1]);
        }
        element::chain_add_accumulator add_1 = point_table.get_chain_add_accumulator(nafs);
        accumulator = accumulator.multiple_montgomery_ladder({ add_1 });
    }

    /**
     * Handle skew factors.
     *
     * We represent scalar multipliers via Non Adjacent Form values (NAF).
     * In a NAF, each bit value is either -1 or +1.
     * We use this representation to avoid having to conditionally add points
     * (i.e. every bit we iterate over will result in either a point addition or subtraction,
     *  instead of conditionally adding a point into an accumulator,
     *  we conditionally negate the point's y-coordinate and *always* add it into the accumulator)
     *
     * However! The problem here is that we can only represent odd integers with a NAF.
     * For even integers we add +1 to the integer and set that multiplier's `skew` value to `true`.
     *
     * We record a scalar multiplier's skew value at the end of their NAF values
     *(`naf_entries[point_index][num_rounds]`)
     *
     * If the skew is true, we must subtract the original point from the accumulator.
     **/
    for (size_t i = 0; i < num_points; ++i) {
        element skew = accumulator - points[i];
        Fq out_x = accumulator.x.conditional_select(skew.x, naf_entries[i][num_rounds]);
        Fq out_y = accumulator.y.conditional_select(skew.y, naf_entries[i][num_rounds]);
        accumulator = element(out_x, out_y);
    }

    // Remove the offset generator point!
    accumulator = accumulator - offset_generators.second;

    accumulator.set_origin_tag(union_tag);
    // Return our scalar mul output
    return accumulator;
}
} // namespace bb::stdlib::element_default
