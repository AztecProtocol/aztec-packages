// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "translator_proving_key.hpp"
#include "barretenberg/common/assert.hpp"

#include <algorithm>

namespace bb {
/**
 * @brief Construct a set of polynomials that are the result of concatenating a group of polynomials into one.
 * Used in translator to reduce the number of commitments while preserving PCS compatibility.
 *
 * @details Concatenation maps lane bits to MSB positions:
 *   concatenated_i[j * MINI_CIRCUIT_SIZE + k] = group_i_wire_j[k]
 *
 * This ensures that the verifier can reconstruct concatenated evaluations from individual wire evaluations
 * using Lagrange decomposition over the top 4 sumcheck challenges.
 */
void TranslatorProvingKey::compute_concatenated_polynomials()
{
    // The vector of groups of polynomials to be concatenated
    auto groups = proving_key->polynomials.get_groups_to_be_concatenated();
    // Resulting concatenated polynomials
    auto targets = proving_key->polynomials.get_concatenated();

    const size_t num_polys_in_group = groups[0].size();
    BB_ASSERT_EQ(num_polys_in_group, Flavor::CONCATENATION_GROUP_SIZE);

    const size_t MINI_CIRCUIT_SIZE = Flavor::MINI_CIRCUIT_SIZE;

    auto ordering_function = [&](size_t index) {
        // Get the index of the concatenated polynomial (group index)
        size_t i = index / num_polys_in_group;
        // Get the index of the polynomial within the group
        size_t j = index % num_polys_in_group;
        auto& group = groups[i];
        auto& current_target = targets[i];

        // Copy into appropriate position in the concatenated polynomial: j * MINI + k
        // Note: null padding slots in group 4 are zero-sized polynomials, so this loop is a no-op for them.
        for (size_t k = group[j].start_index(); k < group[j].end_index(); k++) {
            current_target.at(j * MINI_CIRCUIT_SIZE + k) = group[j][k];
        }
    };
    parallel_for(groups.size() * num_polys_in_group, ordering_function);
}

/**
 * @brief Compute denominator polynomials for Translator's range constraint permutation
 *
 * @details We need to prove that all the range constraint wires in the concatenation groups indeed have values within
 * the given range [0, 2^14 - 1]. To do this, we take the values from the 4 concatenated range constraint polynomials
 * (concatenated_range_constraints_<i>) and spread them into 5 ordered polynomials (ordered_range_constraints_<i>)
 * which, as the name suggests, are sorted in non-descending order. The TranslatorDeltaRangeConstraint relation
 * operates on these ordered polynomials and ensures that sequential values differ by no more than 3, the last value
 * is the maximum, and the first value is zero (zero at the start allows us to avoid complications with shifts). Then,
 * we run the TranslatorPermutationRelation on the concatenated and ordered polynomials to show that they contain the
 * same multiset of values, which implies that the wires in the groups are indeed within the correct range.
 *
 * Ideally, we could simply rearrange the values from the 4 concatenated polynomials into 4 ordered polynomials, but
 * we could hit the worst case scenario: every value in the polynomials is the maximum value. In that case we still
 * need to add (max_range / 3 + 1) stepping-stone values to each ordered polynomial for the delta range constraint to
 * hold. So we also need a 5th ordered polynomial to store the overflow: k * (max_range / 3 + 1) values that couldn't
 * fit, plus (max_range / 3 + 1) connecting values. To counteract the extra (k + 1) * (max_range / 3 + 1) values in
 * the denominator, we place a corresponding extra numerator polynomial (ordered_extra_range_constraints_numerator).
 * The construction is feasible when (k + 1) * (max_range / 3 + 1) < concatenated polynomial size.
 *
 * With concatenation, masking rows are scattered: the last NUM_MASKED_ROWS_END rows of each block. Sorted values
 * occupy non-masking positions; masking values sit in the holes.
 */
void TranslatorProvingKey::compute_translator_range_constraint_ordered_polynomials()
{
    RefArray ordered_constraint_polynomials{ proving_key->polynomials.ordered_range_constraints_0,
                                             proving_key->polynomials.ordered_range_constraints_1,
                                             proving_key->polynomials.ordered_range_constraints_2,
                                             proving_key->polynomials.ordered_range_constraints_3 };
    std::vector<size_t> extra_denominator_uint(dyadic_circuit_size_without_masking);

    const auto sorted_elements = get_sorted_steps();
    auto to_be_concatenated_groups = proving_key->polynomials.get_groups_to_be_concatenated();
    const size_t circuit_size = proving_key->polynomials.get_polynomial_size();

    // Given the polynomials in group_i, transfer their elements, sorted in non-descending order, into the corresponding
    // ordered_range_constraint_i up to the given capacity and the remaining elements to the last range constraint.
    // Sorting is done by converting the elements to uint for efficiency.
    //
    // Pre-allocate the sorted uint vectors outside the lambda so the final copy can run in a separate parallel step.
    // We sort using uint32_t vectors for 2 reasons:
    // 1. It is faster to sort integers
    // 2. Comparison operators for finite fields are operating on internal form, so we'd have to convert them
    // from Montgomery
    constexpr size_t NUM_RANGE_CONSTRAINT_GROUPS = Flavor::NUM_CONCATENATED_POLYS - 1;
    std::array<std::vector<uint32_t>, NUM_RANGE_CONSTRAINT_GROUPS> ordered_uint_vecs;
    for (auto& v : ordered_uint_vecs) {
        v.resize(dyadic_circuit_size_without_masking);
    }

    auto ordering_function = [&](size_t i) {
        const auto& group = to_be_concatenated_groups[i];
        auto& ordered_vectors_uint = ordered_uint_vecs[i];

        // Calculate how much space there is for values from the group polynomials given we also need to append the
        // additional steps
        auto free_space_before_runway = dyadic_circuit_size_without_masking - sorted_elements.size();

        // Calculate the starting index of this group's overflowing elements in the extra denominator polynomial
        size_t extra_denominator_offset = i * sorted_elements.size();

        // Number of real values per lane: MINI_CIRCUIT_SIZE positions minus the virtual zero at index 0
        // minus NUM_MASKED_ROWS_END masking rows at the end of each block
        static constexpr size_t values_per_lane = Flavor::MINI_CIRCUIT_SIZE - 1 - Flavor::NUM_MASKED_ROWS_END;

        // Go through each polynomial in the concatenated group
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {

            // Dense offset: avoid phantom zeros by packing values tightly
            auto current_offset = j * values_per_lane;

            // For each element in the polynomial (excluding masking rows at the end)
            for (size_t k = group[j].start_index(); k < group[j].end_index() - Flavor::NUM_MASKED_ROWS_END; k++) {

                auto vec_idx = current_offset + (k - group[j].start_index());

                // Put it in the target polynomial
                if (vec_idx < free_space_before_runway) {
                    ordered_vectors_uint[vec_idx] = static_cast<uint32_t>(uint256_t(group[j][k]).data[0]);

                    // Or in the extra one if there is no space left
                } else {
                    extra_denominator_uint[extra_denominator_offset] =
                        static_cast<uint32_t>(uint256_t(group[j][k]).data[0]);
                    extra_denominator_offset++;
                }
            }
        }

        // Verify that overflow entries didn't exceed the reserved space (SORTED_STEPS_COUNT per group)
        BB_ASSERT(extra_denominator_offset <= (i + 1) * Flavor::SORTED_STEPS_COUNT,
                  "Translator: overflow entries exceed reserved space in ordered polynomial");

        // Advance the iterator past the last written element in the range constraint polynomial and complete it with
        // sorted steps
        auto ordered_vector_it = ordered_vectors_uint.begin();
        std::advance(ordered_vector_it, free_space_before_runway);
        std::copy(sorted_elements.cbegin(), sorted_elements.cend(), ordered_vector_it);

        // Sort the polynomial in nondescending order.
        std::sort(ordered_vectors_uint.begin(), ordered_vectors_uint.end());
        BB_ASSERT_EQ(ordered_vectors_uint.size(), dyadic_circuit_size_without_masking);
    };

    // Construct the first NUM_CONCATENATED_POLYS - 1 polynomials (range constraint groups only)
    parallel_for(NUM_RANGE_CONSTRAINT_GROUPS, ordering_function);

    // Advance the iterator into the extra range constraint past the last written element
    auto extra_denominator_it = extra_denominator_uint.begin();
    std::advance(extra_denominator_it, NUM_RANGE_CONSTRAINT_GROUPS * sorted_elements.size());

    // Add steps to the extra denominator polynomial to fill it
    std::copy(sorted_elements.cbegin(), sorted_elements.cend(), extra_denominator_it);
    // Sort it
#ifdef NO_PAR_ALGOS
    std::sort(extra_denominator_uint.begin(), extra_denominator_uint.end());
#else
    std::sort(std::execution::par_unseq, extra_denominator_uint.begin(), extra_denominator_uint.end());
#endif

    // Copy sorted values to all 5 polynomials in parallel. Uses parallel_for_range so that each of the N available
    // threads gets a contiguous chunk of positions to write, covering all polynomials per chunk.
    // All polynomials reserve the same amount of space at the end (max across all polynomials)
    // so that lagrange_real_last marks the same position for all polynomials.
    // Position 0 remains 0 (virtual zero). Last MAX_RANDOM_VALUES_PER_ORDERED positions reserved for random values.
    const size_t copy_len = circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1;
    parallel_for_range(copy_len, [&](size_t start, size_t end) {
        for (size_t i = 0; i < NUM_RANGE_CONSTRAINT_GROUPS; i++) {
            for (size_t pos = start + 1; pos <= end; pos++) {
                ordered_constraint_polynomials[i].at(pos) = FF(ordered_uint_vecs[i][pos]);
            }
        }
        for (size_t pos = start + 1; pos <= end; pos++) {
            proving_key->polynomials.ordered_range_constraints_4.at(pos) = FF(extra_denominator_uint[pos]);
        }
    });

    // Transfer randomness from concatenated to ordered polynomials such that the commitments and evaluations of all
    // ordered polynomials and their shifts are hidden
    split_concatenated_random_coefficients_to_ordered();
}

/**
 * @brief Distribute the randomness from the 4 concatenated range constraint polynomials to the 5 ordered range
 * constraints such that commitments and evaluations of ordered polynomials and their shifts are hidden.
 *
 * @details With concatenation, masking values are at scattered positions: the last NUM_MASKED_ROWS_END rows
 * of each block (positions [j * MINI + (MINI - NUM_MASKED_ROWS_END), j * MINI + MINI) for each j in [0,16)).
 * We extract these random values from the concatenated polynomials and distribute them to the ordered
 * polynomials at the same scattered masking positions.
 */
void TranslatorProvingKey::split_concatenated_random_coefficients_to_ordered()
{
    auto concatenated = proving_key->polynomials.get_concatenated();
    auto ordered = proving_key->polynomials.get_ordered_range_constraints();
    const size_t num_ordered_polynomials = ordered.size();
    const size_t MINI = Flavor::MINI_CIRCUIT_SIZE;

    // Collect all random values from masking positions in concatenated range constraint polynomials
    // NOTE: Only extract from the first NUM_CONCATENATED_POLYS - 1 concatenated polys
    // (concatenated_range_constraints_0..3) which appear in the permutation numerator.
    // The last (concatenated_non_range) is not in the numerator.
    // Masking positions are at the end of each block: [j*MINI + (MINI - NUM_MASKED_ROWS_END), j*MINI + MINI)
    constexpr size_t NUM_RANGE_CONSTRAINT_GROUPS = Flavor::NUM_CONCATENATED_POLYS - 1;
    const size_t num_random_values_per_concat = Flavor::NUM_MASKED_ROWS_END * Flavor::CONCATENATION_GROUP_SIZE;
    const size_t total_num_random_values = num_random_values_per_concat * NUM_RANGE_CONSTRAINT_GROUPS;
    const size_t num_random_values_per_ordered = total_num_random_values / num_ordered_polynomials;
    const size_t remaining_random_values = total_num_random_values % num_ordered_polynomials;

    std::vector<FF> random_values(total_num_random_values);

    // Extract random values from scattered masking positions in the first NUM_RANGE_CONSTRAINT_GROUPS concatenated
    // polynomials. Each thread handles one concatenated polynomial, writing to a disjoint slice of random_values.
    parallel_for(NUM_RANGE_CONSTRAINT_GROUPS, [&](size_t i) {
        const auto& current_concat = concatenated[i];
        size_t idx = i * num_random_values_per_concat;
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            size_t block_masking_start = j * MINI + (MINI - Flavor::NUM_MASKED_ROWS_END);
            for (size_t k = 0; k < Flavor::NUM_MASKED_ROWS_END; k++) {
                random_values[idx] = current_concat[block_masking_start + k];
                idx++;
            }
        }
    });

    // Distribute random values to ordered polynomials at the END (contiguous).
    // Each ordered polynomial gets values at the last positions.
    const size_t circuit_size = proving_key->polynomials.get_polynomial_size();
    parallel_for(num_ordered_polynomials, [&](size_t i) {
        auto& current_ordered = ordered[i];
        size_t values_for_this_poly = num_random_values_per_ordered + (i < remaining_random_values ? 1 : 0);
        // Compute offset into random_values for this ordered polynomial
        size_t random_idx = i * num_random_values_per_ordered + std::min(i, remaining_random_values);
        // Place random values at the END: [circuit_size - values_for_this_poly, circuit_size)
        for (size_t k = 0; k < values_for_this_poly; k++) {
            current_ordered.at(circuit_size - values_for_this_poly + k) = random_values[random_idx];
            random_idx++;
        }
    });
}

/**
 * @brief Constructs all Lagrange precomputed polynomials required for Translator relations. These enforce properties at
 * specific positions within the Translator trace. Translator operates on two circuit sizes (full and mini) both
 * requiring separate Lagrange polynomials.
 *
 * @details With concatenation, the full circuit has CONCATENATION_GROUP_SIZE (16) blocks of MINI_CIRCUIT_SIZE each.
 * Masking rows are scattered: the last NUM_MASKED_ROWS_END rows of each block, rather than contiguous at the end.
 *
 * **Full Circuit Lagranges:**
 * - `lagrange_first`: Active only at index 0, marks the first row of the full circuit
 * - `lagrange_real_last`: Active at the last row with sorted values in ordered polynomials
 *   (before the contiguous masking region at circuit_size - MAX_RANDOM_VALUES_PER_ORDERED)
 * - `lagrange_last`: Active at the very last row of the full circuit
 * - `lagrange_masking`: Active at scattered masking positions — the last NUM_MASKED_ROWS_END rows of each of the
 *   CONCATENATION_GROUP_SIZE blocks
 * - `lagrange_ordered_masking`: Active at the last MAX_RANDOM_VALUES_PER_ORDERED positions (contiguous at end),
 *   where random values are placed in ordered polynomials
 *
 * **Mini Circuit Lagranges:**
 * - `lagrange_mini_masking`: Active in two regions:
 *   1. Between RANDOMNESS_START and RESULT_ROW (random values at the beginning of the mini circuit)
 *   2. In the last rows of the mini circuit (for trailing randomness)
 * - `lagrange_even_in_minicircuit`: Active at even indices within the actual ECC operation processing range,
 *   excluding randomness
 * - `lagrange_odd_in_minicircuit`: Active at odd indices within the actual ECC operation processing range,
 *   excluding randomness
 * - `lagrange_result_row`: Active only at the designated result row (Flavor::RESULT_ROW)
 * - `lagrange_last_in_minicircuit`: Active at the last row before masking in the mini circuit
 *
 * The even/odd Lagranges are needed because the Translator VM processes two rows of its execution trace
 * simultaneously, with different relations applying to even and odd indexed rows.
 *
 * @note All Lagrange polynomials are initialized to 0 by default, and this function sets specific
 *       indices to 1 to create the desired selector behavior.
 * @note The masking regions contain random values used for zero-knowledge properties.
 */
void TranslatorProvingKey::compute_lagrange_polynomials()
{
    const size_t MINI = Flavor::MINI_CIRCUIT_SIZE;
    const size_t circuit_size = proving_key->polynomials.get_polynomial_size();

    proving_key->polynomials.lagrange_first.at(0) = 1;
    // lagrange_real_last marks the last position with sorted values in ordered polynomials
    // (where we check maximum value = 2^14 - 1)
    proving_key->polynomials.lagrange_real_last.at(circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED - 1) = 1;
    proving_key->polynomials.lagrange_last.at(circuit_size - 1) = 1;

    // Scattered masking: last NUM_MASKED_ROWS_END rows of each of the 16 blocks
    for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
        for (size_t k = MINI - Flavor::NUM_MASKED_ROWS_END; k < MINI; k++) {
            proving_key->polynomials.lagrange_masking.at(j * MINI + k) = 1;
        }
    }

    // lagrange_ordered_masking: marks the last MAX_RANDOM_VALUES_PER_ORDERED positions (contiguous at end)
    // where random values are placed in ordered polynomials
    for (size_t i = circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; i < circuit_size; i++) {
        proving_key->polynomials.lagrange_ordered_masking.at(i) = 1;
    }

    for (size_t i = Flavor::RANDOMNESS_START; i < Flavor::RESULT_ROW; i++) {
        proving_key->polynomials.lagrange_mini_masking.at(i) = 1;
    }

    // Location of randomness for wires defined within the mini circuit
    for (size_t i = dyadic_mini_circuit_size_without_masking; i < mini_circuit_dyadic_size; i++) {
        proving_key->polynomials.lagrange_mini_masking.at(i) = 1;
    }

    // Translator VM processes two rows of its execution trace at a time, establishing different relations between
    // polynomials at even and odd indices
    for (size_t i = Flavor::RESULT_ROW; i < dyadic_mini_circuit_size_without_masking; i += 2) {
        proving_key->polynomials.lagrange_even_in_minicircuit.at(i) = 1;
        proving_key->polynomials.lagrange_odd_in_minicircuit.at(i + 1) = 1;
    }

    // Position of evaluation result
    proving_key->polynomials.lagrange_result_row.at(Flavor::RESULT_ROW) = 1;
    proving_key->polynomials.lagrange_last_in_minicircuit.at(dyadic_mini_circuit_size_without_masking - 1) = 1;
}

/**
 * @brief Compute the extra numerator for the grand product polynomial.
 *
 * @details Goblin proves that several polynomials contain only values in a certain range through 2
 * relations: 1) A grand product which ignores positions of elements (TranslatorPermutationRelation) 2) A
 * relation enforcing a certain ordering on the elements of given polynomials
 * (TranslatorDeltaRangeConstraintRelation)
 *
 * We take the values from 4 concatenated range constraint polynomials, and spread them into 5 polynomials to be
 * sorted (ordered_range_constraint_<i>), adding all the steps from MAX_VALUE to 0 in each ordered range constraint to
 * complete them. The latter polynomials will be in the denominator of the grand product, the former in the numerator.
 * To make up for the added steps in the numerator, an additional polynomial needs to be generated which contains 5
 * MAX_VALUE, 5 (MAX_VALUE-STEP),... values.
 */
void TranslatorProvingKey::compute_extra_range_constraint_numerator()
{

    const auto sorted_elements = get_sorted_steps();
    // The numerator has NUM_CONCATENATED_POLYS factors: (NUM_CONCATENATED_POLYS - 1) concatenated range constraint
    // polynomials + 1 extra_numerator, matching NUM_CONCATENATED_POLYS ordered polynomials in the denominator.
    // Each sorted element appears NUM_CONCATENATED_POLYS times.
    constexpr size_t NUM_FACTORS_IN_NUMERATOR = Flavor::NUM_CONCATENATED_POLYS;
    auto fill_with_shift = [&](size_t shift) {
        for (size_t i = 0; i < sorted_elements.size(); i++) {
            proving_key->polynomials.ordered_extra_range_constraints_numerator.at(
                shift + i * NUM_FACTORS_IN_NUMERATOR) = sorted_elements[i];
        }
    };
    // Fill polynomials with a sequence, where each element is repeated NUM_FACTORS_IN_NUMERATOR times
    parallel_for(NUM_FACTORS_IN_NUMERATOR, fill_with_shift);
}

} // namespace bb
