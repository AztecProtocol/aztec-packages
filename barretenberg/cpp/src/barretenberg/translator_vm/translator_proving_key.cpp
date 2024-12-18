#include "translator_proving_key.hpp"
namespace bb {
void TranslatorProvingKey::compute_concatenated_polynomials()
{
    // Concatenation groups are vectors of polynomials that are concatenated together
    auto concatenation_groups = proving_key->polynomials.get_groups_to_be_concatenated();

    // Resulting concatenated polynomials
    auto targets = proving_key->polynomials.get_concatenated();

    // Targets have to be full-sized proving_key->polynomials. We can compute the mini circuit size from them by
    // dividing by concatenation index
    const size_t MINI_CIRCUIT_SIZE = targets[0].size() / Flavor::CONCATENATION_GROUP_SIZE;
    ASSERT(MINI_CIRCUIT_SIZE * Flavor::CONCATENATION_GROUP_SIZE == targets[0].size());
    // A function that produces 1 concatenated polynomial

    // Translator uses concatenated polynomials in the permutation argument. These polynomials contain the same
    // coefficients as other shorter polynomials, but we don't have to commit to them due to reusing commitments of
    // shorter polynomials and updating our PCS to open using them. But the prover still needs the concatenated
    // proving_key->polynomials. This function constructs a chunk of the polynomial.
    auto ordering_function = [&](size_t index) {
        // Get the index of the concatenated polynomial
        size_t i = index / concatenation_groups[0].size();
        // Get the index of the original polynomial
        size_t j = index % concatenation_groups[0].size();
        auto& my_group = concatenation_groups[i];
        auto& current_target = targets[i];

        // Copy into appropriate position in the concatenated polynomial
        // We offset by start_index() as the first 0 is not physically represented for shiftable values
        for (size_t k = current_target.start_index(); k < MINI_CIRCUIT_SIZE; k++) {
            current_target.at(j * MINI_CIRCUIT_SIZE + k) = my_group[j][k];
        }
    };
    parallel_for(concatenation_groups.size() * concatenation_groups[0].size(), ordering_function);
}

/**
 * @brief Compute denominator polynomials for Translator's range constraint permutation
 *
 * @details  We need to prove that all the range constraint wires indeed have values within the given range (unless
 * changed ∈  [0 , 2¹⁴ - 1]. To do this, we use several virtual concatenated wires, each of which represents a
 * subset or original wires (concatenated_range_constraints_<i>). We also generate several new polynomials of the
 * same length as concatenated ones. These polynomials have values within range, but they are also constrained by
 * the TranslatorFlavor's DeltaRangeConstraint relation, which ensures that sequential values differ by not more
 * than 3, the last value is the maximum and the first value is zero (zero at the start allows us not to dance
 * around shifts).
 *
 * Ideally, we could simply rearrange the values in concatenated_.._0 ,..., concatenated_.._3 and get denominator
 * polynomials (ordered_constraints), but we could get the worst case scenario: each value in the polynomials is
 * maximum value. What can we do in that case? We still have to add (max_range/3)+1 values  to each of the ordered
 * wires for the sort constraint to hold.  So we also need a and extra denominator to store k ⋅ ( max_range / 3 + 1
 * ) values that couldn't go in + ( max_range / 3 +  1 ) connecting values. To counteract the extra ( k + 1 ) ⋅ ⋅
 * (max_range / 3 + 1 ) values needed for denominator sort constraints we need a polynomial in the numerator. So we
 * can construct a proof when ( k + 1 ) ⋅ ( max_range/ 3 + 1 ) < concatenated size
 *
 * @tparam Flavor
 * @param proving_key
 */
void TranslatorProvingKey::compute_translator_range_constraint_ordered_polynomials()
{
    // Get constants
    constexpr auto sort_step = Flavor::SORT_STEP;
    constexpr auto num_concatenated_wires = Flavor::NUM_CONCATENATED_WIRES;
    const auto full_circuit_size = mini_circuit_dyadic_size * Flavor::CONCATENATION_GROUP_SIZE;

    // The value we have to end polynomials with
    constexpr uint32_t max_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;

    // Number of elements needed to go from 0 to MAX_VALUE with our step
    constexpr size_t sorted_elements_count = (max_value / sort_step) + 1 + (max_value % sort_step == 0 ? 0 : 1);

    // Check if we can construct these polynomials
    ASSERT((num_concatenated_wires + 1) * sorted_elements_count < full_circuit_size);

    // First use integers (easier to sort)
    std::vector<size_t> sorted_elements(sorted_elements_count);

    // Fill with necessary steps
    sorted_elements[0] = max_value;
    for (size_t i = 1; i < sorted_elements_count; i++) {
        sorted_elements[i] = (sorted_elements_count - 1 - i) * sort_step;
    }

    std::vector<std::vector<uint32_t>> ordered_vectors_uint(num_concatenated_wires);
    RefArray ordered_constraint_polynomials{ proving_key->polynomials.ordered_range_constraints_0,
                                             proving_key->polynomials.ordered_range_constraints_1,
                                             proving_key->polynomials.ordered_range_constraints_2,
                                             proving_key->polynomials.ordered_range_constraints_3 };
    std::vector<size_t> extra_denominator_uint(full_circuit_size);

    // Get information which polynomials need to be concatenated
    auto concatenation_groups = proving_key->polynomials.get_groups_to_be_concatenated();

    // A function that transfers elements from each of the polynomials in the chosen concatenation group in the uint
    // ordered polynomials
    auto ordering_function = [&](size_t i) {
        // Get the group and the main target vector
        auto my_group = concatenation_groups[i];
        auto& current_vector = ordered_vectors_uint[i];
        current_vector.resize(full_circuit_size);

        // Calculate how much space there is for values from the original polynomials
        auto free_space_before_runway = full_circuit_size - sorted_elements_count;

        // Calculate the offset of this group's overflowing elements in the extra denominator polynomial
        size_t extra_denominator_offset = i * sorted_elements_count;

        // Go through each polynomial in the concatenation group
        for (size_t j = 0; j < Flavor::CONCATENATION_GROUP_SIZE; j++) {

            // Calculate the offset in the target vector
            auto current_offset = j * mini_circuit_dyadic_size;
            // For each element in the polynomial
            for (size_t k = 0; k < mini_circuit_dyadic_size; k++) {

                // Put it it the target polynomial
                if ((current_offset + k) < free_space_before_runway) {
                    current_vector[current_offset + k] = static_cast<uint32_t>(uint256_t(my_group[j][k]).data[0]);

                    // Or in the extra one if there is no space left
                } else {
                    extra_denominator_uint[extra_denominator_offset] =
                        static_cast<uint32_t>(uint256_t(my_group[j][k]).data[0]);
                    extra_denominator_offset++;
                }
            }
        }
        // Copy the steps into the target polynomial
        auto starting_write_offset = current_vector.begin();
        std::advance(starting_write_offset, free_space_before_runway);
        std::copy(sorted_elements.cbegin(), sorted_elements.cend(), starting_write_offset);

        // Sort the polynomial in nondescending order. We sort using vector with size_t elements for 2 reasons:
        // 1. It is faster to sort size_t
        // 2. Comparison operators for finite fields are operating on internal form, so we'd have to convert them
        // from Montgomery
        std::sort(current_vector.begin(), current_vector.end());
        // Copy the values into the actual polynomial
        ordered_constraint_polynomials[i].copy_vector(current_vector);
    };

    // Construct the first 4 polynomials
    parallel_for(num_concatenated_wires, ordering_function);
    ordered_vectors_uint.clear();

    auto sorted_element_insertion_offset = extra_denominator_uint.begin();
    std::advance(sorted_element_insertion_offset, num_concatenated_wires * sorted_elements_count);

    // Add steps to the extra denominator polynomial
    std::copy(sorted_elements.cbegin(), sorted_elements.cend(), sorted_element_insertion_offset);

    // Sort it
#ifdef NO_PAR_ALGOS
    std::sort(extra_denominator_uint.begin(), extra_denominator_uint.end());
#else
    std::sort(std::execution::par_unseq, extra_denominator_uint.begin(), extra_denominator_uint.end());
#endif

    // Copy the values into the actual polynomial
    proving_key->polynomials.ordered_range_constraints_4.copy_vector(extra_denominator_uint);
}

void TranslatorProvingKey::compute_lagrange_polynomials()
{

    for (size_t i = 1; i < mini_circuit_dyadic_size - 1; i += 2) {
        proving_key->polynomials.lagrange_odd_in_minicircuit.at(i) = 1;
        proving_key->polynomials.lagrange_even_in_minicircuit.at(i + 1) = 1;
    }
    proving_key->polynomials.lagrange_second.at(1) = 1;
    proving_key->polynomials.lagrange_second_to_last_in_minicircuit.at(mini_circuit_dyadic_size - 2) = 1;
}

/**
 * @brief Compute the extra numerator for Goblin range constraint argument
 *
 * @details Goblin proves that several polynomials contain only values in a certain range through 2
 * relations: 1) A grand product which ignores positions of elements (TranslatorPermutationRelation) 2) A
 * relation enforcing a certain ordering on the elements of the given polynomial
 * (TranslatorDeltaRangeConstraintRelation)
 *
 * We take the values from 4 polynomials, and spread them into 5 polynomials + add all the steps from
 * MAX_VALUE to 0. We order these polynomials and use them in the denominator of the grand product, at the
 * same time checking that they go from MAX_VALUE to 0. To counteract the added steps we also generate an
 * extra range constraint numerator, which contains 5 MAX_VALUE, 5 (MAX_VALUE-STEP),... values
 *
 */
void TranslatorProvingKey::compute_extra_range_constraint_numerator()
{
    auto& extra_range_constraint_numerator = proving_key->polynomials.ordered_extra_range_constraints_numerator;

    static constexpr uint32_t MAX_VALUE = (1 << Flavor::MICRO_LIMB_BITS) - 1;

    // Calculate how many elements there are in the sequence MAX_VALUE, MAX_VALUE - 3,...,0
    size_t sorted_elements_count = (MAX_VALUE / Flavor::SORT_STEP) + 1 + (MAX_VALUE % Flavor::SORT_STEP == 0 ? 0 : 1);

    // Check that we can fit every element in the polynomial
    ASSERT((Flavor::NUM_CONCATENATED_WIRES + 1) * sorted_elements_count < extra_range_constraint_numerator.size());

    std::vector<size_t> sorted_elements(sorted_elements_count);

    // Calculate the sequence in integers
    sorted_elements[0] = MAX_VALUE;
    for (size_t i = 1; i < sorted_elements_count; i++) {
        sorted_elements[i] = (sorted_elements_count - 1 - i) * Flavor::SORT_STEP;
    }

    // TODO(#756): can be parallelized further. This will use at most 5 threads
    auto fill_with_shift = [&](size_t shift) {
        for (size_t i = 0; i < sorted_elements_count; i++) {
            extra_range_constraint_numerator.at(shift + i * (Flavor::NUM_CONCATENATED_WIRES + 1)) = sorted_elements[i];
        }
    };
    // Fill polynomials with a sequence, where each element is repeated NUM_CONCATENATED_WIRES+1 times
    parallel_for(Flavor::NUM_CONCATENATED_WIRES + 1, fill_with_shift);
}
} // namespace bb