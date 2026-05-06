#include "barretenberg/translator_vm/translator_flavor.hpp"

#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"

namespace bb {

template <typename FFType>
void TranslatorFlavor::compute_computable_precomputed(AllEntities<FFType>& evals, std::span<const FFType> challenge)
{
    TranslatorSelectorEvaluations<FFType, LOG_MINI_CIRCUIT_SIZE>::compute(challenge).populate(evals);
}

template <typename FFType>
void TranslatorFlavor::set_minicircuit_evaluations(AllEntities<FFType>& evals,
                                                   const std::array<FFType, NUM_MINICIRCUIT_EVALUATIONS>& mid)
{
    size_t src = 0;
    for (auto& wire : evals.get_minicircuit_wires()) {
        wire = mid[src++];
    }
    for (auto& wire : evals.get_minicircuit_wires_shifted()) {
        wire = mid[src++];
    }
}

template <typename FFType>
void TranslatorFlavor::complete_claimed_evaluations(AllEntities<FFType>& evals, std::span<const FFType> challenge)
{
    compute_computable_precomputed(evals, challenge);

    FFType l0 = FFType(1);
    for (size_t i = 0; i < CONST_TRANSLATOR_LOG_N - LOG_MINI_CIRCUIT_SIZE; i++) {
        l0 *= (FFType(1) - challenge[LOG_MINI_CIRCUIT_SIZE + i]);
    }
    for (auto& wire : evals.get_minicircuit_wires()) {
        wire *= l0;
    }
    for (auto& wire : evals.get_minicircuit_wires_shifted()) {
        wire *= l0;
    }
}

template <typename FFType>
void TranslatorFlavor::complete_full_circuit_evaluations(
    AllEntities<FFType>& evals,
    const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit,
    std::span<const FFType> challenge)
{
    set_full_circuit_evaluations(evals, full_circuit);
    complete_claimed_evaluations(evals, challenge);

    auto concat_evals = reconstruct_concatenated_evaluations</*Shifted=*/false>(evals, challenge);
    for (auto [ref, eval] : zip_view(evals.get_concatenated(), concat_evals)) {
        ref = eval;
    }
}

template <bool Shifted, typename FFType>
std::array<FFType, TranslatorFlavor::NUM_CONCATENATED_POLYS> TranslatorFlavor::reconstruct_concatenated_evaluations(
    AllEntities<FFType>& evals, std::span<const FFType> challenge)
{
    static constexpr size_t NUM_TOP_BITS = numeric::get_msb(CONCATENATION_GROUP_SIZE);

    std::array<FFType, CONCATENATION_GROUP_SIZE> lagrange_basis;
    for (size_t j = 0; j < CONCATENATION_GROUP_SIZE; j++) {
        lagrange_basis[j] = FFType(1);
        for (size_t bit = 0; bit < NUM_TOP_BITS; bit++) {
            const FFType& u = challenge[CONST_TRANSLATOR_LOG_N - NUM_TOP_BITS + bit];
            lagrange_basis[j] *= ((j >> bit) & 1) ? u : (FFType(1) - u);
        }
    }
    FFType padding_inv = lagrange_basis[0].invert();

    // Walk CONCAT_MAP: each row produces one concat-poly evaluation by accumulating its chunk
    // wires against the lagrange basis. Zero-padded slots (non-range chunk has 13 wires < CONCATENATION_GROUP_SIZE)
    // contribute zero and are simply not emitted.
    std::array<FFType, NUM_CONCATENATED_POLYS> result;
    size_t group_idx = 0;
#define ACCUMULATE_REF(name)                                                                                           \
    if constexpr (Shifted) {                                                                                           \
        acc += lagrange_basis[j] * evals.name##_shift;                                                                 \
    } else {                                                                                                           \
        acc += lagrange_basis[j] * evals.name;                                                                         \
    }                                                                                                                  \
    ++j;
#define RECONSTRUCT_GROUP(concat_name, group_macro)                                                                    \
    {                                                                                                                  \
        FFType acc(0);                                                                                                 \
        size_t j = 0;                                                                                                  \
        group_macro(ACCUMULATE_REF) result[group_idx++] = acc * padding_inv;                                           \
    }
    CONCAT_MAP(RECONSTRUCT_GROUP)
#undef ACCUMULATE_REF
#undef RECONSTRUCT_GROUP
    return result;
}

template <typename FFType>
std::array<FFType, TranslatorFlavor::NUM_FULL_CIRCUIT_EVALUATIONS> TranslatorFlavor::get_full_circuit_evaluations(
    AllEntities<FFType>& evals)
{
    std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS> result;
    size_t dst = 0;
    for (auto& entity : evals.get_full_circuit_entities()) {
        result[dst++] = entity;
    }
    return result;
}

template <typename FFType>
void TranslatorFlavor::set_full_circuit_evaluations(
    AllEntities<FFType>& evals, const std::array<FFType, NUM_FULL_CIRCUIT_EVALUATIONS>& full_circuit)
{
    size_t src = 0;
    for (auto& entity : evals.get_full_circuit_entities()) {
        entity = full_circuit[src++];
    }
}

template void TranslatorFlavor::compute_computable_precomputed<TranslatorFlavor::FF>(
    AllEntities<TranslatorFlavor::FF>&, std::span<const TranslatorFlavor::FF>);
template void TranslatorFlavor::set_minicircuit_evaluations<TranslatorFlavor::FF>(
    AllEntities<TranslatorFlavor::FF>&, const std::array<TranslatorFlavor::FF, NUM_MINICIRCUIT_EVALUATIONS>&);
template void TranslatorFlavor::complete_claimed_evaluations<TranslatorFlavor::FF>(
    AllEntities<TranslatorFlavor::FF>&, std::span<const TranslatorFlavor::FF>);
template void TranslatorFlavor::complete_full_circuit_evaluations<TranslatorFlavor::FF>(
    AllEntities<TranslatorFlavor::FF>&,
    const std::array<TranslatorFlavor::FF, NUM_FULL_CIRCUIT_EVALUATIONS>&,
    std::span<const TranslatorFlavor::FF>);
template std::array<TranslatorFlavor::FF, TranslatorFlavor::NUM_CONCATENATED_POLYS> TranslatorFlavor::
    reconstruct_concatenated_evaluations<false, TranslatorFlavor::FF>(AllEntities<TranslatorFlavor::FF>&,
                                                                      std::span<const TranslatorFlavor::FF>);
template std::array<TranslatorFlavor::FF, TranslatorFlavor::NUM_CONCATENATED_POLYS> TranslatorFlavor::
    reconstruct_concatenated_evaluations<true, TranslatorFlavor::FF>(AllEntities<TranslatorFlavor::FF>&,
                                                                     std::span<const TranslatorFlavor::FF>);
template std::array<TranslatorFlavor::FF, TranslatorFlavor::NUM_FULL_CIRCUIT_EVALUATIONS> TranslatorFlavor::
    get_full_circuit_evaluations<TranslatorFlavor::FF>(AllEntities<TranslatorFlavor::FF>&);
template void TranslatorFlavor::set_full_circuit_evaluations<TranslatorFlavor::FF>(
    AllEntities<TranslatorFlavor::FF>&, const std::array<TranslatorFlavor::FF, NUM_FULL_CIRCUIT_EVALUATIONS>&);

template void TranslatorFlavor::compute_computable_precomputed<TranslatorRecursiveFlavor::FF>(
    AllEntities<TranslatorRecursiveFlavor::FF>&, std::span<const TranslatorRecursiveFlavor::FF>);
template void TranslatorFlavor::set_minicircuit_evaluations<TranslatorRecursiveFlavor::FF>(
    AllEntities<TranslatorRecursiveFlavor::FF>&,
    const std::array<TranslatorRecursiveFlavor::FF, NUM_MINICIRCUIT_EVALUATIONS>&);
template void TranslatorFlavor::complete_claimed_evaluations<TranslatorRecursiveFlavor::FF>(
    AllEntities<TranslatorRecursiveFlavor::FF>&, std::span<const TranslatorRecursiveFlavor::FF>);
template void TranslatorFlavor::complete_full_circuit_evaluations<TranslatorRecursiveFlavor::FF>(
    AllEntities<TranslatorRecursiveFlavor::FF>&,
    const std::array<TranslatorRecursiveFlavor::FF, NUM_FULL_CIRCUIT_EVALUATIONS>&,
    std::span<const TranslatorRecursiveFlavor::FF>);
template std::array<TranslatorRecursiveFlavor::FF, TranslatorFlavor::NUM_CONCATENATED_POLYS> TranslatorFlavor::
    reconstruct_concatenated_evaluations<false, TranslatorRecursiveFlavor::FF>(
        AllEntities<TranslatorRecursiveFlavor::FF>&, std::span<const TranslatorRecursiveFlavor::FF>);
template std::array<TranslatorRecursiveFlavor::FF, TranslatorFlavor::NUM_CONCATENATED_POLYS> TranslatorFlavor::
    reconstruct_concatenated_evaluations<true, TranslatorRecursiveFlavor::FF>(
        AllEntities<TranslatorRecursiveFlavor::FF>&, std::span<const TranslatorRecursiveFlavor::FF>);
template void TranslatorFlavor::set_full_circuit_evaluations<TranslatorRecursiveFlavor::FF>(
    AllEntities<TranslatorRecursiveFlavor::FF>&,
    const std::array<TranslatorRecursiveFlavor::FF, NUM_FULL_CIRCUIT_EVALUATIONS>&);

TranslatorFlavor::ProverPolynomials::ProverPolynomials()
{
    const size_t circuit_size = 1 << CONST_TRANSLATOR_LOG_N;
    for (auto& ordered_range_constraint : get_ordered_range_constraints()) {
        ordered_range_constraint = Polynomial{ /*size*/ circuit_size - 1,
                                               /*largest possible index*/ circuit_size,
                                               1 };
    }

    // Initialize 5 concatenated polynomials (full circuit_size, shiftable with start_index=1)
    // Row 0 of block 0 is the no-op row where all values are zero.
    for (auto& concat_poly : get_concatenated()) {
        concat_poly = Polynomial{ /*size*/ circuit_size - 1,
                                  /*virtual_size*/ circuit_size,
                                  /*start_index*/ 1 };
    }
    z_perm = Polynomial{ /*size*/ circuit_size - 1,
                         /*virtual_size*/ circuit_size,
                         /*start_index*/ 1 };

    op = Polynomial{ MINI_CIRCUIT_SIZE, circuit_size };

    // All minicircuit wires (non-op-queue) are only non-zero in [1, MINI_CIRCUIT_SIZE)
    for (auto& poly : this->get_minicircuit_wires()) {
        if (poly.is_empty()) {
            poly = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - 1,
                               /*virtual_size*/ circuit_size,
                               /*start_index*/ 1 };
        }
    }

    // Op queue wires to be shifted
    for (auto& poly : this->get_op_queue_split_wires()) {
        if (poly.is_empty()) {
            poly = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - 1,
                               /*virtual_size*/ circuit_size,
                               /*start_index*/ 1 };
        }
    }

    // Initialize lagrange polynomials and the ordered extra range constraints numerator (the precomputed
    // polynomials) within the appropriate range they operate on
    lagrange_first = Polynomial{ /*size*/ 1, /*virtual_size*/ circuit_size };
    lagrange_result_row = Polynomial{ /*size*/ 1, /*virtual_size*/ circuit_size, /*start_index*/ RESULT_ROW };
    lagrange_even_in_minicircuit = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - RESULT_ROW - NUM_MASKED_ROWS_END,
                                               /*virtual_size*/ circuit_size,
                                               /*start_index=*/RESULT_ROW };
    lagrange_odd_in_minicircuit = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - RESULT_ROW - NUM_MASKED_ROWS_END - 1,
                                              /*virtual_size*/ circuit_size,
                                              /*start_index=*/RESULT_ROW + 1 };
    lagrange_last_in_minicircuit = Polynomial{ /*size*/ 1,
                                               /*virtual_size*/ circuit_size,
                                               /*start_index=*/MINI_CIRCUIT_SIZE - NUM_MASKED_ROWS_END - 1 };
    lagrange_mini_masking = Polynomial{ /*size*/ MINI_CIRCUIT_SIZE - RANDOMNESS_START,
                                        /*virtual_size*/ circuit_size,
                                        /*start_index=*/RANDOMNESS_START };
    // With concatenation, masking rows are scattered in concatenated polys: end of each of the 16 blocks
    // Must span full circuit since values go up to position 15*MINI+(MINI-1)
    lagrange_masking = Polynomial{ circuit_size, circuit_size };
    // Ordered masking: contiguous at the end (marks masking positions in ordered polynomials)
    lagrange_ordered_masking = Polynomial{ /*size*/ MAX_RANDOM_VALUES_PER_ORDERED,
                                           /*virtual_size*/ circuit_size,
                                           /*start_index*/ circuit_size - MAX_RANDOM_VALUES_PER_ORDERED };
    lagrange_last = Polynomial{ /*size*/ 1,
                                /*virtual_size*/ circuit_size,
                                /*start_index*/ circuit_size - 1 };
    // lagrange_real_last marks the last position with sorted values in ordered polynomials
    // (where we check maximum value = 2^14 - 1). With contiguous masking at the end,
    // this is at position circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1.
    lagrange_real_last = Polynomial{ /*size*/ 1,
                                     /*virtual_size*/ circuit_size,
                                     /*start_index*/ circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1 };
    ordered_extra_range_constraints_numerator =
        Polynomial{ /*size*/ SORTED_STEPS_COUNT * NUM_CONCATENATED_POLYS + MASKING_OVERFLOW_COLUMN,
                    /*virtual_size*/ circuit_size,
                    /*start_index*/ 0 };

    set_shifted();
}

TranslatorFlavor::AllValues TranslatorFlavor::ProverPolynomials::get_row(size_t row_idx) const
{
    AllValues result;
    for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
        // Translator polynomials have different support regions (start_index/end_index)
        // Return 0 for out-of-bounds access (which is the correct value outside support)
        if (row_idx >= polynomial.start_index() && row_idx < polynomial.end_index()) {
            result_field = polynomial[row_idx];
        } else {
            result_field = FF(0);
        }
    }
    return result;
}

void TranslatorFlavor::ProverPolynomials::set_shifted()
{
    for (auto [shifted, to_be_shifted] : zip_view(get_shifted(), get_all_to_be_shifted())) {
        shifted = to_be_shifted.shifted();
    }
}

TranslatorFlavor::CommitmentLabels::CommitmentLabels()
{
    // Concatenated polynomials (sent via get_non_opqueue_wires_and_ordered_range_constraints)
    this->concatenated_range_constraints_0 = "CONCATENATED_RANGE_CONSTRAINTS_0";
    this->concatenated_range_constraints_1 = "CONCATENATED_RANGE_CONSTRAINTS_1";
    this->concatenated_range_constraints_2 = "CONCATENATED_RANGE_CONSTRAINTS_2";
    this->concatenated_range_constraints_3 = "CONCATENATED_RANGE_CONSTRAINTS_3";
    this->concatenated_non_range = "CONCATENATED_NON_RANGE";

    // Ordered range constraints (sent via get_non_opqueue_wires_and_ordered_range_constraints)
    this->ordered_range_constraints_0 = "ORDERED_RANGE_CONSTRAINTS_0";
    this->ordered_range_constraints_1 = "ORDERED_RANGE_CONSTRAINTS_1";
    this->ordered_range_constraints_2 = "ORDERED_RANGE_CONSTRAINTS_2";
    this->ordered_range_constraints_3 = "ORDERED_RANGE_CONSTRAINTS_3";
    this->ordered_range_constraints_4 = "ORDERED_RANGE_CONSTRAINTS_4";

    // Grand product (committed separately)
    this->z_perm = "Z_PERM";
}

} // namespace bb
