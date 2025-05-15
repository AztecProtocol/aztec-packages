// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "translator_proving_key.hpp"
namespace bb {
/**
 * @brief Construct a set of polynomials that are the result of interleaving a group of polynomials into one. Used in
 * translator to reduce the degree of the permutation relation.
 *
 * @details Multilinear PCS allow to provide openings for the resulting interleaved polynomials without having to commit
 * to them, using the commitments of polynomials in groups.
 *
 * If we have:
 * f(x₁, x₂) = {a₁, a₂, a₃, a₄}
 * g(x₁, x₂) = {b₁, b₂, b₃, b₄}
 * then:
 * h(x₁, x₂, x₃) = interleave(f(x₁, x₂), g(x₁, x₂)) = {a₁, b₁, a₂, b₂, a₃, b₃, a₄, b₄}
 *
 * Since we commit to multilinear polynomials with KZG, which treats evaluations as monomial coefficients, in univariate
 * form h(x)=f(x) + x⋅g(x⁴)
 *
 */
void TranslatorProvingKey::compute_interleaved_polynomials()
{
    // The vector of groups of polynomials to be interleaved
    auto interleaved = proving_key->polynomials.get_groups_to_be_interleaved();
    // Resulting interleaved polynomials
    auto targets = proving_key->polynomials.get_interleaved();

    const size_t num_polys_in_group = interleaved[0].size();
    ASSERT(num_polys_in_group == Flavor::INTERLEAVING_GROUP_SIZE);

    // Targets have to be full-sized proving_key->polynomials. We can compute the mini circuit size from them by
    // dividing by the number of polynomials in the group
    const size_t MINI_CIRCUIT_SIZE = targets[0].size() / num_polys_in_group;
    ASSERT(MINI_CIRCUIT_SIZE * num_polys_in_group == targets[0].size());

    auto ordering_function = [&](size_t index) {
        // Get the index of the interleaved polynomial
        size_t i = index / interleaved[0].size();
        // Get the index of the original polynomial
        size_t j = index % interleaved[0].size();
        auto& group = interleaved[i];
        auto& current_target = targets[i];

        // Copy into appropriate position in the interleaved polynomial
        // We offset by start_index() as the first 0 is not physically represented for shiftable values
        for (size_t k = group[j].start_index(); k < group[j].end_index(); k++) {
            current_target.at(k * num_polys_in_group + j) = group[j][k];
        }
    };
    parallel_for(interleaved.size() * num_polys_in_group, ordering_function);
}

/**
 * @brief Compute denominator polynomials for Translator's range constraint permutation
 *
 * @details  We need to prove that all the range constraint wires in the groups indeed have values within the given
 * range [0 , 2¹⁴ -1]. To do this, we use several virtual interleaved wires, each of which represents a subset of
 * the original wires (the virtual wires are interleaved_range_constraints_<i>). We also generate several new
 * polynomials of the same length as the interleaved ones (ordered_range_constraints_<i> which, as the name suggests,
 * are sorted in non-descending order). To show the interleaved range constraints have values within the appropriate
 * range, we in fact use the ordered range constraints, on which TranslatorFlavor's DeltaRangeConstraint relation
 * operates. The relation ensures that sequential values differ by no more than 3, the last value is the maximum and the
 * first value is zero (zero at the start allows us not to dance around shifts). Then, we run the
 * TranslatorPermutationRelation on interleaved_range_constraint_<i> and ordered_range_constraint_<i> to show that they
 * contain the same values which implies that the small wires in the groups are indeed within the correct range.
 *
 * Ideally, we could simply rearrange the values in interleaved_.._0 ,..., interleaved_.._3 and get 4 denominator
 * polynomials (ordered_constraints), but we could get the worst case scenario: each value in the polynomials is the
 * maximum value. What can we do in that case? We still have to add (max_range/3)+1 values  to each of the ordered
 * wires for the sort constraint to hold.  So we also need an extra denominator to store k ⋅ ( max_range / 3 + 1 )
 * values that couldn't go in + ( max_range / 3 +  1 ) connecting values. To counteract the extra ( k + 1 ) ⋅
 * ⋅ (max_range / 3 + 1 ) values needed for denominator sort constraints we need a polynomial in the numerator. So we
 * can construct a proof when ( k + 1 ) ⋅ ( max_range/ 3 + 1 ) < interleaved size
 *
 * @param masking if operating in zero-knowledge the real sizes of the polynomial should be adjusted to make space for
 * the random values.
 */
void TranslatorProvingKey::compute_translator_range_constraint_ordered_polynomials(bool masking)
{
    // Get constants
    constexpr size_t sort_step = Flavor::SORT_STEP;
    constexpr size_t num_interleaved_wires = Flavor::NUM_INTERLEAVED_WIRES;

    const size_t mini_NUM_DISABLED_ROWS_IN_SUMCHECK = masking ? NUM_DISABLED_ROWS_IN_SUMCHECK : 0;
    const size_t full_NUM_DISABLED_ROWS_IN_SUMCHECK =
        masking ? mini_NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE : 0;
    const size_t real_circuit_size = dyadic_circuit_size - full_NUM_DISABLED_ROWS_IN_SUMCHECK;

    // The value we have to end polynomials with, 2¹⁴ - 1
    constexpr uint32_t max_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;

    // Number of elements needed to go from 0 to MAX_VALUE with our step
    constexpr size_t sorted_elements_count = (max_value / sort_step) + 1 + (max_value % sort_step == 0 ? 0 : 1);

    // Check if we can construct these polynomials
    ASSERT((num_interleaved_wires + 1) * sorted_elements_count < real_circuit_size);

    // First use integers (easier to sort)
    std::vector<size_t> sorted_elements(sorted_elements_count);

    // Fill with necessary steps
    sorted_elements[0] = max_value;
    for (size_t i = 1; i < sorted_elements_count; i++) {
        sorted_elements[i] = (sorted_elements_count - 1 - i) * sort_step;
    }

    RefArray ordered_constraint_polynomials{ proving_key->polynomials.ordered_range_constraints_0,
                                             proving_key->polynomials.ordered_range_constraints_1,
                                             proving_key->polynomials.ordered_range_constraints_2,
                                             proving_key->polynomials.ordered_range_constraints_3 };
    std::vector<size_t> extra_denominator_uint(real_circuit_size);

    auto to_be_interleaved_groups = proving_key->polynomials.get_groups_to_be_interleaved();

    // Given the polynomials in group_i, transfer their elements, sorted in non-descending order, into the corresponding
    // ordered_range_constraint_i up to the given capacity and the remaining elements to the last range constraint.
    // Sorting is done by converting the elements to uint for efficiency.
    auto ordering_function = [&](size_t i) {
        auto group = to_be_interleaved_groups[i];
        std::vector<uint32_t> ordered_vectors_uint(real_circuit_size);

        // Calculate how much space there is for values from the group polynomials given we also need to append the
        // additional steps
        auto free_space_before_runway = real_circuit_size - sorted_elements_count;

        // Calculate the starting index of this group's overflowing elements in the extra denominator polynomial
        size_t extra_denominator_offset = i * sorted_elements_count;

        // Go through each polynomial in the interleaved group
        for (size_t j = 0; j < Flavor::INTERLEAVING_GROUP_SIZE; j++) {

            // Calculate the offset in the target vector
            auto current_offset = j * (mini_circuit_dyadic_size - mini_NUM_DISABLED_ROWS_IN_SUMCHECK);
            // For each element in the polynomial
            for (size_t k = group[j].start_index(); k < group[j].end_index() - mini_NUM_DISABLED_ROWS_IN_SUMCHECK;
                 k++) {

                // Put it it the target polynomial
                if ((current_offset + k) < free_space_before_runway) {
                    ordered_vectors_uint[current_offset + k] = static_cast<uint32_t>(uint256_t(group[j][k]).data[0]);

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

        // Sort the polynomial in nondescending order. We sort using the size_t vector for 2 reasons:
        // 1. It is faster to sort size_t
        // 2. Comparison operators for finite fields are operating on internal form, so we'd have to convert them
        // from Montgomery
        std::sort(ordered_vectors_uint.begin(), ordered_vectors_uint.end());
        ASSERT(ordered_vectors_uint.size() == real_circuit_size);
        // Copy the values into the actual polynomial
        ordered_constraint_polynomials[i].copy_vector(ordered_vectors_uint);
    };

    // Construct the first 4 polynomials
    parallel_for(num_interleaved_wires, ordering_function);

    // Advance the iterator into the extra range constraint past the last written element
    auto extra_denominator_it = extra_denominator_uint.begin();
    std::advance(extra_denominator_it, num_interleaved_wires * sorted_elements_count);

    // Add steps to the extra denominator polynomial to fill it
    std::copy(sorted_elements.cbegin(), sorted_elements.cend(), extra_denominator_it);

    ASSERT(extra_denominator_uint.size() == real_circuit_size);
    // Sort it
#ifdef NO_PAR_ALGOS
    std::sort(extra_denominator_uint.begin(), extra_denominator_uint.end());
#else
    std::sort(std::execution::par_unseq, extra_denominator_uint.begin(), extra_denominator_uint.end());
#endif
    ASSERT(extra_denominator_uint.size() == real_circuit_size);

    // Copy the values into the actual polynomial
    proving_key->polynomials.ordered_range_constraints_4.copy_vector(extra_denominator_uint);
}

void TranslatorProvingKey::compute_lagrange_polynomials()
{

    for (size_t i = 2; i < mini_circuit_dyadic_size; i += 2) {
        proving_key->polynomials.lagrange_even_in_minicircuit.at(i) = 1;
        proving_key->polynomials.lagrange_odd_in_minicircuit.at(i + 1) = 1;
    }
    proving_key->polynomials.lagrange_result_row.at(2) = 1;
    proving_key->polynomials.lagrange_last_in_minicircuit.at(mini_circuit_dyadic_size - 1) = 1;
}

/**
 * @brief Compute the extra numerator for the grand product polynomial.
 *
 * @details Goblin proves that several polynomials contain only values in a certain range through 2
 * relations: 1) A grand product which ignores positions of elements (TranslatorPermutationRelation) 2) A
 * relation enforcing a certain ordering on the elements of given polynomials
 * (TranslatorDeltaRangeConstraintRelation)
 *
 * We take the values from 4 polynomials (interleaved_range_constraint_<i>), and spread them into 5 polynomials to be
 * sorted (ordered_range_constraint_<i>), adding all the steps from MAX_VALUE to 0 in each ordered range constraint to
 * complete them. The latter polynomials will be in the numerator of the grand product, the former in the numerator. To
 * make up for the added steps in the numerator, an additional polynomial needs to be generated which contains 5
 * MAX_VALUE, 5 (MAX_VALUE-STEP),... values.
 *
 */
void TranslatorProvingKey::compute_extra_range_constraint_numerator()
{
    auto& extra_range_constraint_numerator = proving_key->polynomials.ordered_extra_range_constraints_numerator;

    static constexpr uint32_t MAX_VALUE = (1 << Flavor::MICRO_LIMB_BITS) - 1;

    // Calculate how many elements there are in the sequence MAX_VALUE, MAX_VALUE - 3,...,0
    size_t sorted_elements_count = (MAX_VALUE / Flavor::SORT_STEP) + 1 + (MAX_VALUE % Flavor::SORT_STEP == 0 ? 0 : 1);

    // Check that we can fit every element in the polynomial
    ASSERT((Flavor::NUM_INTERLEAVED_WIRES + 1) * sorted_elements_count < extra_range_constraint_numerator.size());

    std::vector<size_t> sorted_elements(sorted_elements_count);

    // Calculate the sequence in integers
    sorted_elements[0] = MAX_VALUE;
    for (size_t i = 1; i < sorted_elements_count; i++) {
        sorted_elements[i] = (sorted_elements_count - 1 - i) * Flavor::SORT_STEP;
    }

    // TODO(#756): can be parallelized further. This will use at most 5 threads
    auto fill_with_shift = [&](size_t shift) {
        for (size_t i = 0; i < sorted_elements_count; i++) {
            extra_range_constraint_numerator.at(shift + i * (Flavor::NUM_INTERLEAVED_WIRES + 1)) = sorted_elements[i];
        }
    };
    // Fill polynomials with a sequence, where each element is repeated NUM_INTERLEAVED_WIRES+1 times
    parallel_for(Flavor::NUM_INTERLEAVED_WIRES + 1, fill_with_shift);
}
} // namespace bb
