// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <utility>

#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1317)
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

    static constexpr size_t mini_circuit_dyadic_size = Flavor::MINI_CIRCUIT_SIZE;
    // The actual circuit size is several times bigger than the trace in the circuit, because we use interleaving
    // to bring the degree of relations down, while extending the length.
    static constexpr size_t dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::INTERLEAVING_GROUP_SIZE;

    // Real mini and full circuit sizes i.e. the number of rows excluding those reserved for randomness (to achieve
    // hiding of polynomial commitments and evaluation). Bound to change, but it has to be even as translator works two
    // rows at a time
    static constexpr size_t dyadic_mini_circuit_size_without_masking =
        mini_circuit_dyadic_size - NUM_DISABLED_ROWS_IN_SUMCHECK;
    static constexpr size_t dyadic_circuit_size_without_masking =
        dyadic_circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE;

    std::shared_ptr<ProvingKey> proving_key;

    BF batching_challenge_v = { 0 };
    BF evaluation_input_x = { 0 };

    TranslatorProvingKey() = default;

    TranslatorProvingKey(const Circuit& circuit, std::shared_ptr<CommitmentKey> commitment_key = nullptr)
        : batching_challenge_v(circuit.batching_challenge_v)
        , evaluation_input_x(circuit.evaluation_input_x)
    {
        PROFILE_THIS_NAME("TranslatorProvingKey(TranslatorCircuit&)");
        // Check that the Translator Circuit does not exceed the fixed upper bound, the current value amounts to
        // a number of EccOps sufficient for 10 rounds of folding (so 20 circuits)
        if (circuit.num_gates > Flavor::MINI_CIRCUIT_SIZE - NUM_DISABLED_ROWS_IN_SUMCHECK) {
            throw_or_abort("The Translator circuit size has exceeded the fixed upper bound");
        }

        proving_key = std::make_shared<ProvingKey>(std::move(commitment_key));
        auto wires = proving_key->polynomials.get_wires();
        for (auto [wire_poly_, wire_] : zip_view(wires, circuit.wires)) {
            auto& wire_poly = wire_poly_;
            const auto& wire = wire_;
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1383)
            parallel_for_range(circuit.num_gates, [&](size_t start, size_t end) {
                for (size_t i = start; i < end; i++) {
                    if (i >= wire_poly.start_index() && i < wire_poly.end_index()) {
                        wire_poly.at(i) = circuit.get_variable(wire[i]);
                    } else {
                        ASSERT(circuit.get_variable(wire[i]) == 0);
                    }
                }
            });
        }

        // Iterate over all circuit wire polynomials, except the ones representing the op queue, and add random values
        // at the end.
        for (size_t idx = Flavor::NUM_OP_QUEUE_WIRES; idx < wires.size(); idx++) {
            auto& wire = wires[idx];
            for (size_t i = wire.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK; i < wire.end_index(); i++) {
                wire.at(i) = FF::random_element();
            }
        }

        // First and last lagrange polynomials (in the full circuit size)
        // Construct polynomials with odd and even indices set to 1 up to the minicircuit margin + lagrange
        // polynomials at second and second to last indices in the minicircuit
        compute_lagrange_polynomials();

        // Construct the extra range constraint numerator which contains all the additional values in the ordered range
        // constraints not present in the interleaved polynomials
        // NB this will always have a fixed size unless we change the allowed range
        compute_extra_range_constraint_numerator();

        // Construct the polynomials resulted from interleaving the small polynomials in each group
        compute_interleaved_polynomials();

        // Construct the ordered polynomials, containing the values of the interleaved polynomials + enough values to
        // bridge the range from 0 to 3 (3 is the maximum allowed range defined by the range constraint).
        compute_translator_range_constraint_ordered_polynomials();

        // Populate the first 4 ordered polynomials with the random values from the interleaved polynomials
        for (size_t i = 0; i < 4; i++) {
            auto& ordered = proving_key->polynomials.get_ordered_range_constraints()[i];
            auto& interleaved = proving_key->polynomials.get_interleaved()[i];
            for (size_t j = dyadic_circuit_size_without_masking; j < dyadic_circuit_size; j++) {
                ordered.at(j) = interleaved.at(j);
            }
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1341): Add random values to the last ordered range
        // constraint
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
        std::array<size_t, Flavor::SORTED_STEPS_COUNT> sorted_elements;
        // The value we have to end polynomials with, 2¹⁴ - 1
        const size_t max_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;

        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t num_threads = bb::calculate_num_threads_pow2(Flavor::SORTED_STEPS_COUNT, min_iterations_per_thread);
        size_t iterations_per_thread = Flavor::SORTED_STEPS_COUNT / num_threads; // actual iterations per thread
        size_t leftovers = Flavor::SORTED_STEPS_COUNT % num_threads;
        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread + (thread_idx == num_threads - 1 ? leftovers : 0);
            for (size_t idx = start; idx < end; idx++) {
                sorted_elements[idx] = max_value - Flavor::SORT_STEP * idx;
            }
        });
        return sorted_elements;
    }

    void compute_lagrange_polynomials();

    void compute_extra_range_constraint_numerator();

    void compute_translator_range_constraint_ordered_polynomials();

    void compute_interleaved_polynomials();
};
} // namespace bb
