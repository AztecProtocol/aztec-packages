// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <utility>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {

/**
 * @brief The TranslatorProvingKey transforms a TranslatorCircuitBuilder into polynomial form suitable for proving.
 *
 * @details This class is responsible for:
 * - Transferring wire values from the circuit builder into polynomials
 * - Computing Lagrange selector polynomials
 * - Computing interleaved and ordered range constraint polynomials
 * - Distributing randomness for zero-knowledge
 *
 * Challenge values (batching_challenge_v, evaluation_input_x) are copied from the circuit
 * as they're needed by the prover after circuit construction is complete.
 */
class TranslatorProvingKey {
  public:
    using Flavor = TranslatorFlavor;
    using Circuit = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentKey = typename Flavor::CommitmentKey;

    // Size constants (copied from Flavor for convenience)
    static constexpr size_t MINI_CIRCUIT_SIZE = Flavor::MINI_CIRCUIT_SIZE;
    static constexpr size_t DYADIC_CIRCUIT_SIZE = Flavor::DYADIC_CIRCUIT_SIZE;
    static constexpr size_t DYADIC_MINI_CIRCUIT_SIZE_WITHOUT_MASKING = Flavor::DYADIC_MINI_CIRCUIT_SIZE_WITHOUT_MASKING;
    static constexpr size_t DYADIC_CIRCUIT_SIZE_WITHOUT_MASKING = Flavor::DYADIC_CIRCUIT_SIZE_WITHOUT_MASKING;

    // Static assertions to ensure circuit/flavor invariants are maintained
    static_assert(Flavor::NUM_WIRES == Circuit::NUM_WIRES,
                  "Wire count mismatch between TranslatorFlavor and TranslatorCircuitBuilder");
    static_assert(Flavor::RESULT_ROW == Circuit::RESULT_ROW,
                  "Result row index mismatch between TranslatorFlavor and TranslatorCircuitBuilder");
    static_assert(Flavor::MICRO_LIMB_BITS == Circuit::MICRO_LIMB_BITS,
                  "Micro limb bits mismatch between TranslatorFlavor and TranslatorCircuitBuilder");
    static_assert(Flavor::NUM_LIMB_BITS == Circuit::NUM_LIMB_BITS,
                  "Limb bits mismatch between TranslatorFlavor and TranslatorCircuitBuilder");
    static_assert(DYADIC_CIRCUIT_SIZE == MINI_CIRCUIT_SIZE * Flavor::INTERLEAVING_GROUP_SIZE,
                  "Dyadic circuit size must equal mini circuit size times interleaving group size");
    static_assert(DYADIC_MINI_CIRCUIT_SIZE_WITHOUT_MASKING < MINI_CIRCUIT_SIZE,
                  "Mini circuit size without masking must be smaller than full mini circuit size");

    std::shared_ptr<ProvingKey> proving_key;

    // Challenge values copied from circuit - needed by prover after circuit is consumed
    BF batching_challenge_v = { 0 };
    BF evaluation_input_x = { 0 };

    TranslatorProvingKey() = default;

    TranslatorProvingKey(const Circuit& circuit, const CommitmentKey& commitment_key = CommitmentKey())
        : batching_challenge_v(circuit.batching_challenge_v)
        , evaluation_input_x(circuit.evaluation_input_x)
    {
        BB_BENCH_NAME("TranslatorProvingKey(TranslatorCircuit&)");
        // Check that the Translator Circuit does not exceed the fixed upper bound, the current value amounts to
        // a number of EccOps sufficient for 28 app circuits
        vinfo("Translator circuit size: ", circuit.num_gates());
        BB_ASSERT_LTE(circuit.num_gates(),
                      Flavor::MINI_CIRCUIT_SIZE,
                      "The Translator circuit size has exceeded the fixed upper bound");

        proving_key = std::make_shared<ProvingKey>(std::move(commitment_key));
        auto wires = proving_key->polynomials.get_wires();
        // Parallelize across wires (thread-per-wire) instead of within each wire to reduce synchronization overhead.
        // With NUM_WIRES = 81 and max 2^14 elements per wire, having one thread per wire is more efficient
        // than spawning/joining threads repeatedly for each wire's element range.
        parallel_for(wires.size(), [&](size_t wire_idx) {
            auto& wire_poly = wires[wire_idx];
            const auto& wire = circuit.wires[wire_idx];
            for (size_t i = 0; i < circuit.num_gates(); i++) {
                if (i >= wire_poly.start_index() && i < wire_poly.end_index()) {
                    wire_poly.at(i) = circuit.get_variable(wire[i]);
                } else {
                    BB_ASSERT_EQ(circuit.get_variable(wire[i]), 0);
                }
            }
        });

        // Iterate over all circuit wire polynomials, except the ones representing the op queue, and add random values
        // at the end.
        for (size_t idx = Flavor::NUM_OP_QUEUE_WIRES; idx < wires.size(); idx++) {
            auto& wire = wires[idx];
            for (size_t i = wire.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i < wire.end_index(); i++) {
                wire.at(i) = FF::random_element();
            }
        }

        compute_lagrange_polynomials();

        // Construct the extra range constraint numerator which contains all the additional values in ordered range
        // constraints not present in the interleaved polynomials
        // NB this will always have a fixed size unless we change the allowed range
        compute_extra_range_constraint_numerator();

        // Construct the polynomials resulted from interleaving the small range constraints polynomials in each group
        // to be interleaved
        compute_interleaved_polynomials();

        // Construct the ordered polynomials, containing the values of the interleaved polynomials + enough values to
        // bridge the range from 0 to 3 (3 is the maximum difference between two consecutive values in the ordered range
        // constraint).
        compute_translator_range_constraint_ordered_polynomials();
    };

    /**
     * @brief Create the array of steps inserted in each ordered range constraint to ensure they respect the
     * appropriate structure for applying the DeltaRangeConstraint relation
     * @details The delta range relation enforces values of a polynomial are within a certain range ([0, 2¹⁴ - 1] for
     * translator). It achieves this efficiently  by sorting the polynomial and checking that the difference between two
     * adjacent values is no more than 3. In the event that the distribution of a polynomial is not uniform across the
     * range (e.g. p_1(x) = {0, 2^14 - 1, 2^14 - 1, 2^14 - 1}), to ensure the relation is still satisfied, we
     * concatenate the set of coefficients to a set of steps that span across the desired range.
     */
    static std::array<size_t, Flavor::SORTED_STEPS_COUNT> get_sorted_steps()
    {
        static const std::array<size_t, Flavor::SORTED_STEPS_COUNT> sorted_elements = [] {
            std::array<size_t, Flavor::SORTED_STEPS_COUNT> inner_array{};

            // The value we have to end polynomials with, 2¹⁴ - 1
            const size_t max_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;

            parallel_for([&](const ThreadChunk& chunk) {
                for (size_t idx : chunk.range(Flavor::SORTED_STEPS_COUNT)) {
                    inner_array[idx] = max_value - Flavor::SORT_STEP * idx;
                }
            });

            return inner_array;
        }();

        return sorted_elements;
    }

    void compute_lagrange_polynomials();

    void compute_extra_range_constraint_numerator();

    void compute_translator_range_constraint_ordered_polynomials();

    void compute_interleaved_polynomials();

    void split_interleaved_random_coefficients_to_ordered();
};
} // namespace bb
