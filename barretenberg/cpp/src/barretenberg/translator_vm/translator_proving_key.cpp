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
 */
void TranslatorProvingKey::compute_translator_range_constraint_ordered_polynomials()
{
    // Get constants
    constexpr size_t num_interleaved_wires = Flavor::NUM_INTERLEAVED_WIRES;

    RefArray ordered_constraint_polynomials{ proving_key->polynomials.ordered_range_constraints_0,
                                             proving_key->polynomials.ordered_range_constraints_1,
                                             proving_key->polynomials.ordered_range_constraints_2,
                                             proving_key->polynomials.ordered_range_constraints_3 };
    std::vector<size_t> extra_denominator_uint(dyadic_circuit_size_without_masking);

    const auto sorted_elements = get_sorted_steps();
    auto to_be_interleaved_groups = proving_key->polynomials.get_groups_to_be_interleaved();

    // Given the polynomials in group_i, transfer their elements, sorted in non-descending order, into the corresponding
    // ordered_range_constraint_i up to the given capacity and the remaining elements to the last range constraint.
    // Sorting is done by converting the elements to uint for efficiency.
    auto ordering_function = [&](size_t i) {
        auto group = to_be_interleaved_groups[i];
        std::vector<uint32_t> ordered_vectors_uint(dyadic_circuit_size_without_masking);

        // Calculate how much space there is for values from the group polynomials given we also need to append the
        // additional steps
        auto free_space_before_runway = dyadic_circuit_size_without_masking - sorted_elements.size();

        // Calculate the starting index of this group's overflowing elements in the extra denominator polynomial
        size_t extra_denominator_offset = i * sorted_elements.size();

        // Go through each polynomial in the interleaved group
        for (size_t j = 0; j < Flavor::INTERLEAVING_GROUP_SIZE; j++) {

            // Calculate the offset in the target vector
            auto current_offset = j * dyadic_mini_circuit_size_without_masking;
            ;
            // For each element in the polynomial
            for (size_t k = group[j].start_index(); k < group[j].end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; k++) {

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
        ASSERT(ordered_vectors_uint.size() == dyadic_circuit_size_without_masking);
        // Copy the values into the actual polynomial
        ordered_constraint_polynomials[i].copy_vector(ordered_vectors_uint);
    };

    // Construct the first 4 polynomials
    parallel_for(num_interleaved_wires, ordering_function);

    // Advance the iterator into the extra range constraint past the last written element
    auto extra_denominator_it = extra_denominator_uint.begin();
    std::advance(extra_denominator_it, num_interleaved_wires * sorted_elements.size());

    // Add steps to the extra denominator polynomial to fill it
    std::copy(sorted_elements.cbegin(), sorted_elements.cend(), extra_denominator_it);
    // Sort it
#ifdef NO_PAR_ALGOS
    std::sort(extra_denominator_uint.begin(), extra_denominator_uint.end());
#else
    std::sort(std::execution::par_unseq, extra_denominator_uint.begin(), extra_denominator_uint.end());
#endif

    // Copy the values into the actual polynomial
    proving_key->polynomials.ordered_range_constraints_4.copy_vector(extra_denominator_uint);

    // Transfer randomness from interleaved to ordered polynomials such that the commitments and evaluations of all
    // ordered polynomials and their shifts are hidden
    split_interleaved_random_coefficients_to_ordered();
}

/**
 * @brief Distribute the randomness from the 4 interleaved polynomials to the 5 ordered range constraints such that
 * commitments and evaluations of ordered polynomials and their shifts are hidden.
 *
 * @details While we don't commit to the interleaved polynomials, ths PCS round connecting the opening of these to the
 * commitments of group polynomials, we have to commit to the ordered polynomials. Since the permutation relation
 * enforces that the values of ordered_* and interleaved_* are the same, we  must use the same blinding as for hiding
 * commitments and evaluations of the groups *_range_constraint_* wire polynomials. This methods hence splits the
 * randomness from interleaved to ordered polynomials.
 *
 * As a result, the ordered_* polynomials withing the range pointed to by lagrange_masking will have some random values
 * and some zeroes. This still maintains the correctness of the permutation relation as we "make up" for the zeroes from
 * the precomputed extra_range_constraint_numerator.
 */
void TranslatorProvingKey::split_interleaved_random_coefficients_to_ordered()
{
    auto interleaved = proving_key->polynomials.get_interleaved();
    auto ordered = proving_key->polynomials.get_ordered_range_constraints();
    const size_t num_ordered_polynomials = ordered.size();

    const size_t total_num_random_values =
        NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::NUM_INTERLEAVED_WIRES * Flavor::INTERLEAVING_GROUP_SIZE;
    const size_t num_random_values_per_interleaved = NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE;
    const size_t num_random_values_per_ordered = total_num_random_values / num_ordered_polynomials;
    const size_t remaining_random_values = total_num_random_values % num_ordered_polynomials;

    std::array<FF, NUM_DISABLED_ROWS_IN_SUMCHECK* Flavor::NUM_INTERLEAVED_WIRES* Flavor::INTERLEAVING_GROUP_SIZE>
        random_values = {};

    // Add the random values from all interleaved polynomials to an array
    parallel_for(Flavor::NUM_INTERLEAVED_WIRES, [&](size_t i) {
        size_t idx = i * num_random_values_per_interleaved;
        auto current_interleaved = interleaved[i];
        for (size_t j = dyadic_circuit_size_without_masking; j < current_interleaved.end_index(); j++) {
            random_values[idx] = current_interleaved.at(j);
            idx++;
        }
    });

    // Split them across the ordered polynomials
    size_t end = dyadic_circuit_size_without_masking + num_random_values_per_ordered;
    parallel_for(num_ordered_polynomials, [&](size_t i) {
        size_t index_into_random = i * num_random_values_per_ordered;
        auto& current_ordered = ordered[i];
        for (size_t j = dyadic_circuit_size_without_masking; j < end; j++) {
            current_ordered.at(j) = random_values[index_into_random];
            index_into_random++;
        }
    });

    // As the total number of random values might not a multiple of num_ordered_polynomials (and is definitely not the
    // current translator configurations) the remaining values are distributed across the ordered polynomials. The
    // configurations ensure this still remain within boundaries of the polynomial size otherwise the assignment would
    // fail.
    size_t index_into_random = num_ordered_polynomials * num_random_values_per_ordered;
    ASSERT(remaining_random_values < num_ordered_polynomials && end < ordered[0].end_index());
    for (size_t i = 0; i < remaining_random_values; i++) {
        ordered[i].at(end) = random_values[index_into_random];
        index_into_random++;
    }
}

/**
 * @brief Set all the precomputed lagrange polynomials used in Translator relations.
 *
 */
void TranslatorProvingKey::compute_lagrange_polynomials()
{

    proving_key->polynomials.lagrange_first.at(0) = 1;
    proving_key->polynomials.lagrange_real_last.at(dyadic_circuit_size_without_masking - 1) = 1;
    proving_key->polynomials.lagrange_last.at(dyadic_circuit_size - 1) = 1;

    // Location of randomness for the polynomials defined within the large size
    for (size_t i = dyadic_circuit_size_without_masking; i < dyadic_circuit_size; i++) {
        proving_key->polynomials.lagrange_masking.at(i) = 1;
    }

    // Location of randomness for wires defined within the mini circuit
    for (size_t i = dyadic_mini_circuit_size_without_masking; i < mini_circuit_dyadic_size; i++) {
        proving_key->polynomials.lagrange_mini_masking.at(i) = 1;
    }

    // Translator VM processes two rows of its execution trace at a time, establishing different relations between
    // polynomials at even and odd indices, as such we need corresponding lagranges for determining whic relations
    // should trigger at odd indices and which at even.
    for (size_t i = 2; i < dyadic_mini_circuit_size_without_masking; i += 2) {
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
 * We take the values from 4 polynomials (interleaved_range_constraint_<i>), and spread them into 5 polynomials to be
 * sorted (ordered_range_constraint_<i>), adding all the steps from MAX_VALUE to 0 in each ordered range constraint to
 * complete them. The latter polynomials will be in the numerator of the grand product, the former in the numerator. To
 * make up for the added steps in the numerator, an additional polynomial needs to be generated which contains 5
 * MAX_VALUE, 5 (MAX_VALUE-STEP),... values.
 *
 */
void TranslatorProvingKey::compute_extra_range_constraint_numerator()
{

    const auto sorted_elements = get_sorted_steps();
    // TODO(#756): can be parallelized further. This will use at most 5 threads
    auto fill_with_shift = [&](size_t shift) {
        for (size_t i = 0; i < sorted_elements.size(); i++) {
            proving_key->polynomials.ordered_extra_range_constraints_numerator.at(
                shift + i * (Flavor::NUM_INTERLEAVED_WIRES + 1)) = sorted_elements[i];
        }
    };
    // Fill polynomials with a sequence, where each element is repeated NUM_INTERLEAVED_WIRES+1 times
    parallel_for(Flavor::NUM_INTERLEAVED_WIRES + 1, fill_with_shift);
}
} // namespace bb
