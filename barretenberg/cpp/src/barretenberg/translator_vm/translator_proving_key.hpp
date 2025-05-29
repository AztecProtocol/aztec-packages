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
    using Range = std::pair<size_t, size_t>;

    static constexpr size_t mini_circuit_dyadic_size = Flavor::MINI_CIRCUIT_SIZE;
    // The actual circuit size is several times bigger than the trace in the circuit, because we use interleaving
    // to bring the degree of relations down, while extending the length.

    static constexpr size_t dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::INTERLEAVING_GROUP_SIZE;
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
        if (circuit.num_gates > Flavor::MINI_CIRCUIT_SIZE) {
            throw_or_abort("The Translator circuit size has exceeded the fixed upper bound");
        }

        proving_key = std::make_shared<ProvingKey>(std::move(commitment_key));

        // Populate the wire polynomials from the wire vectors in the circuit
        for (auto [wire_poly_, wire_] : zip_view(proving_key->polynomials.get_wires(), circuit.wires)) {
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

        // First and last lagrange polynomials (in the full circuit size)
        proving_key->polynomials.lagrange_first.at(0) = 1;
        proving_key->polynomials.lagrange_real_first.at(0) = 1;
        proving_key->polynomials.lagrange_real_last.at(dyadic_circuit_size - 1) = 1;
        proving_key->polynomials.lagrange_last.at(dyadic_circuit_size - 1) = 1;

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
    };

    void compute_lagrange_polynomials();

    void compute_extra_range_constraint_numerator(bool masking = false);

    void compute_translator_range_constraint_ordered_polynomials(bool masking = false);

    void compute_interleaved_polynomials();

    static std::vector<size_t> get_sorted_steps()
    {
        std::vector<size_t> sorted_elements(Flavor::SORTED_STEPS_COUNT);
        const size_t max_value = (1 << Flavor::MICRO_LIMB_BITS) - 1;
        size_t i = 0;
        for (auto& value : sorted_elements) {
            value = max_value - Flavor::SORT_STEP * i;
            i++;
        }
        return sorted_elements;
    }

    // The masking will go away because everything is going to be masked by default
    static Range get_range_of_real_values_in_mini_polynomial(Polynomial& polynomial, bool masking = false)
    {
        size_t start_index = (masking ? NUM_DISABLED_ROWS_IN_SUMCHECK : 0);
        size_t end_index = masking ? polynomial.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK : polynomial.end_index();
        return { start_index, end_index };
    }

    // static Range get_range_of_random_values_in_mini_polynomial(Polynomial& polynomial)
    // {
    //     return { polynomial.end_index() - NUM_DISABLED_ROWS_IN_SUMCHECK, polynomial.end_index() };
    // }

    static Range get_range_of_real_values_in_full_polynomial(Polynomial& polynomial, bool masking = false)
    {
        size_t is_masking = masking ? 1 : 0;
        size_t start =
            masking ? NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE : polynomial.start_index();
        return {
            start, polynomial.end_index() - is_masking * NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE
        };
    }

    static size_t get_real_circuit_size(bool masking = false)
    {
        return dyadic_circuit_size -
               //    (static_cast<size_t>(masking) * NUM_DISABLED_ROWS_IN_SUMCHECK * Flavor::INTERLEAVING_GROUP_SIZE);
               static_cast<size_t>(2) * static_cast<size_t>(masking) * NUM_DISABLED_ROWS_IN_SUMCHECK *
                   Flavor::INTERLEAVING_GROUP_SIZE;
    }

    // not sure i need this
    static void add_random_values_to_polynomial(Polynomial& polynomial)
    {
        auto [start, end] =
            get_range_of_real_values_in_full_polynomial(polynomial, true); // TODO: masking is not supported yet
        for (size_t i = polynomial.start_index(); i < start; i++) {
            polynomial.at(i) = FF::random_element();
        }

        for (size_t i = end; i < polynomial.end_index(); i++) {
            polynomial.at(i) = FF::random_element();
        }
    }

    static void populate_polynomial_with_real_values(Polynomial& polynomial,
                                                     std::vector<uint32_t> values,
                                                     [[maybe_unused]] bool masking = false)
    {
        // auto [start, end] = get_range_of_real_values_in_full_polynomial(polynomial, masking);
        // BB_ASSERT_LTE(values.size() + start, polynomial.end_index());
        for (size_t i = polynomial.start_index(); i < values.size(); i++) {
            polynomial.at(i) = values[i];
        }
    }
};
} // namespace bb
