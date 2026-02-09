// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "translator_proving_key.hpp"
#include "barretenberg/common/assert.hpp"
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

        // For group 4 (non-range), the last 3 slots are null padding (static zero values).
        // These are zero-initialized, so we skip them.
        if (i == 4 && j >= 13) {
            return; // null padding slots - leave as zero
        }

        // Copy into appropriate position in the concatenated polynomial: j * MINI + k
        for (size_t k = group[j].start_index(); k < group[j].end_index(); k++) {
            current_target.at(j * MINI_CIRCUIT_SIZE + k) = group[j][k];
        }
    };
    parallel_for(groups.size() * num_polys_in_group, ordering_function);
}

/**
 * @brief Compute denominator polynomials for Translator's range constraint permutation
 *
 * @details We need to prove that all the range constraint wires indeed have values within the given
 * range [0, 2^14 - 1]. We use concatenated polynomials (concatenated_range_constraints_<i> and
 * concatenated_non_range) and generate ordered polynomials (ordered_range_constraints_<i>) that contain
 * the same values in sorted order. The DeltaRangeConstraint relation ensures sequential values differ by
 * at most 3, with the last value being the maximum.
 *
 * With concatenation, masking rows are scattered: the last NUM_MASKED_ROWS_END rows of each block.
 * Sorted values occupy non-masking positions; masking values sit in the holes.
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
    auto ordering_function = [&](size_t i) {
        const auto& group = to_be_concatenated_groups[i];
        std::vector<uint32_t> ordered_vectors_uint(dyadic_circuit_size_without_masking);

        // Calculate how much space there is for values from the group polynomials given we also need to append the
        // additional steps
        auto free_space_before_runway = dyadic_circuit_size_without_masking - sorted_elements.size();

        // Calculate the starting index of this group's overflowing elements in the extra denominator polynomial
        size_t extra_denominator_offset = i * sorted_elements.size();

        // Number of values per lane (excluding start_index gap and masking rows)
        const size_t values_per_lane = group[0].end_index() - group[0].start_index() - NUM_DISABLED_ROWS_IN_SUMCHECK;

        // Go through each polynomial in the concatenated group
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {

            // Dense offset: avoid phantom zeros by packing values tightly
            auto current_offset = j * values_per_lane;

            // For each element in the polynomial
            for (size_t k = group[j].start_index(); k < group[j].end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k++) {

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
        // Advance the iterator past the last written element in the range constraint polynomial and complete it with
        // sorted steps
        auto ordered_vector_it = ordered_vectors_uint.begin();
        std::advance(ordered_vector_it, free_space_before_runway);
        std::copy(sorted_elements.cbegin(), sorted_elements.cend(), ordered_vector_it);

        // Sort the polynomial in nondescending order. We sort using the uint32_t vector for 2 reasons:
        // 1. It is faster to sort integers
        // 2. Comparison operators for finite fields are operating on internal form, so we'd have to convert them
        // from Montgomery
        std::sort(ordered_vectors_uint.begin(), ordered_vectors_uint.end());
        BB_ASSERT_EQ(ordered_vectors_uint.size(), dyadic_circuit_size_without_masking);

        // All polynomials reserve the same amount of space at the end (max across all polynomials)
        // so that lagrange_real_last marks the same position for all polynomials
        // Place sorted values contiguously from position 1 to circuit_size - MAX_RANDOM_VALUES_PER_ORDERED
        // Position 0 remains 0 (virtual zero). Last MAX_RANDOM_VALUES_PER_ORDERED positions reserved for random values.
        size_t sorted_idx = 1; // Skip vec[0] (virtual zero at position 0)
        for (size_t pos = 1; pos < circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; pos++) {
            ordered_constraint_polynomials[i].at(pos) = FF(ordered_vectors_uint[sorted_idx]);
            sorted_idx++;
        }
    };

    // Construct the first 4 polynomials
    parallel_for(4, ordering_function);

    // Advance the iterator into the extra range constraint past the last written element
    auto extra_denominator_it = extra_denominator_uint.begin();
    std::advance(extra_denominator_it, 4 * sorted_elements.size());

    // Add steps to the extra denominator polynomial to fill it
    std::copy(sorted_elements.cbegin(), sorted_elements.cend(), extra_denominator_it);
    // Sort it
#ifdef NO_PAR_ALGOS
    std::sort(extra_denominator_uint.begin(), extra_denominator_uint.end());
#else
    std::sort(std::execution::par_unseq, extra_denominator_uint.begin(), extra_denominator_uint.end());
#endif

    // Place sorted values for the 5th polynomial
    // All polynomials reserve the same amount of space at the end
    {
        size_t sorted_idx = 1; // Skip vec[0] (virtual zero at position 0)
        for (size_t pos = 1; pos < circuit_size - Flavor::MAX_RANDOM_VALUES_PER_ORDERED; pos++) {
            proving_key->polynomials.ordered_range_constraints_4.at(pos) = FF(extra_denominator_uint[sorted_idx]);
            sorted_idx++;
        }
    }

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
    // NOTE: Only extract from the first 4 concatenated polys (concatenated_range_constraints_0..3)
    // which appear in the permutation numerator. The 5th (concatenated_non_range) is not in the numerator.
    // Masking positions are at the end of each block: [j*MINI + (MINI - NUM_DISABLED_ROWS_IN_SUMCHECK), j*MINI + MINI)
    constexpr size_t NUM_CONCATENATED_IN_NUMERATOR = 4; // Only range constraint concatenated polys are in numerator
    const size_t num_random_values_per_concat = NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::CONCATENATION_GROUP_SIZE;
    const size_t total_num_random_values = num_random_values_per_concat * NUM_CONCATENATED_IN_NUMERATOR;
    const size_t num_random_values_per_ordered = total_num_random_values / num_ordered_polynomials;
    const size_t remaining_random_values = total_num_random_values % num_ordered_polynomials;

    std::vector<FF> random_values;
    random_values.reserve(total_num_random_values);

    // Extract random values from scattered masking positions in the first 4 concatenated polynomials
    for (size_t i = 0; i < NUM_CONCATENATED_IN_NUMERATOR; i++) {
        const auto& current_concat = concatenated[i];
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
            size_t block_masking_start = j * MINI + (MINI - NUM_DISABLED_ROWS_IN_SUMCHECK);
            size_t block_masking_end = j * MINI + MINI;
            for (size_t k = block_masking_start; k < block_masking_end; k++) {
                random_values.push_back(current_concat[k]);
            }
        }
    }

    // Distribute random values to ordered polynomials at the END (contiguous)
    // Each ordered polynomial gets values at the last positions
    size_t random_idx = 0;
    const size_t circuit_size = proving_key->polynomials.get_polynomial_size();
    for (size_t i = 0; i < num_ordered_polynomials; i++) {
        auto& current_ordered = ordered[i];
        size_t values_for_this_poly = num_random_values_per_ordered + (i < remaining_random_values ? 1 : 0);
        // Place random values at the END: [circuit_size - values_for_this_poly, circuit_size)
        for (size_t k = 0; k < values_for_this_poly; k++) {
            current_ordered.at(circuit_size - values_for_this_poly + k) = random_values[random_idx];
            random_idx++;
        }
    }
}

/**
 * @brief Constructs all Lagrange precomputed polynomials required for Translator relations.
 *
 * @details With concatenation, lagrange_masking is scattered across 16 blocks (end of each block),
 * and lagrange_masking_adjacent is 1 at masking rows AND the row immediately preceding each masking block.
 * lagrange_real_last marks the last row with sorted values in ordered polynomials (before the contiguous
 * masking region at the end).
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

    // lagrange_masking_adjacent: 1 where masking[i]=1 OR masking[i+1]=1
    // This disables the delta range constraint at masking rows AND at the row before each masking block
    for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {
        size_t block_masking_start = j * MINI + (MINI - Flavor::NUM_MASKED_ROWS_END);
        // The row before the masking block (adjacent)
        if (block_masking_start > 0) {
            proving_key->polynomials.lagrange_masking_adjacent.at(block_masking_start - 1) = 1;
        }
        // The masking rows themselves
        for (size_t k = block_masking_start; k < j * MINI + MINI; k++) {
            proving_key->polynomials.lagrange_masking_adjacent.at(k) = 1;
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
    // NOTE: We use 5 factors in the numerator: 4 concatenated_range_constraints + 1 extra_numerator
    // (matching 5 ordered_range_constraints in denominator). Each sorted element appears 5 times.
    constexpr size_t NUM_FACTORS_IN_NUMERATOR = 5; // 4 concat range + 1 extra
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
