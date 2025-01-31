#pragma once
#include <utility>

#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
class TranslatorProvingKey {
  public:
    using Flavor = TranslatorFlavor;
    using Circuit = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using CommitmentKey = typename Flavor::CommitmentKey;

    size_t mini_circuit_dyadic_size;
    size_t dyadic_circuit_size;
    std::shared_ptr<ProvingKey> proving_key;

    BF batching_challenge_v = { 0 };
    BF evaluation_input_x = { 0 };

    TranslatorProvingKey() = default;

    TranslatorProvingKey(std::shared_ptr<ProvingKey>& proving_key, size_t mini_circuit_dyadic_size)
        : mini_circuit_dyadic_size(mini_circuit_dyadic_size)
        , dyadic_circuit_size(proving_key->circuit_size)
        , proving_key(proving_key)

    {
        ASSERT(mini_circuit_dyadic_size * Flavor::CONCATENATION_GROUP_SIZE == dyadic_circuit_size);
    }

    TranslatorProvingKey(const Circuit& circuit, std::shared_ptr<CommitmentKey> commitment_key = nullptr)
        : batching_challenge_v(circuit.batching_challenge_v)
        , evaluation_input_x(circuit.evaluation_input_x)
    {
        PROFILE_THIS_NAME("TranslatorProvingKey(TranslatorCircuit&)");

        compute_mini_circuit_dyadic_size(circuit);
        compute_dyadic_circuit_size();
        proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, std::move(commitment_key));

        // Populate the wire polynomials from the wire vectors in the circuit constructor. Note: In goblin translator
        // wires
        // come as is, since they have to reflect the structure of polynomials in the first 4 wires, which we've
        // commited to
        for (auto [wire_poly_, wire_] : zip_view(proving_key->polynomials.get_wires(), circuit.wires)) {
            auto& wire_poly = wire_poly_;
            auto& wire = wire_;
            parallel_for_range(circuit.num_gates, [&](size_t start, size_t end) {
                for (size_t i = start; i < end; i++) {
                    if (i >= wire_poly.start_index() && i < wire_poly.end_index()) {
                        wire_poly.at(i) = circuit.get_variable(wire[i]);
                    } else {
                        ASSERT(wire[i] == 0);
                    }
                }
            });
        }

        // First and last lagrange polynomials (in the full circuit size)
        proving_key->polynomials.lagrange_first.at(0) = 1;
        proving_key->polynomials.lagrange_last.at(dyadic_circuit_size - 1) = 1;

        // Compute polynomials with odd and even indices set to 1 up to the minicircuit margin + lagrange
        // polynomials at second and second to last indices in the minicircuit
        compute_lagrange_polynomials();

        // Compute the numerator for the permutation argument with several repetitions of steps bridging 0 and
        // maximum range constraint compute_extra_range_constraint_numerator();
        compute_extra_range_constraint_numerator();

        // We construct concatenated versions of range constraint polynomials, where several polynomials are
        // concatenated
        // into one. These polynomials are not commited to.
        compute_concatenated_polynomials();

        // We also contruct ordered polynomials, which have the same values as concatenated ones + enough values to
        // bridge
        // the range from 0 to maximum range defined by the range constraint.
        compute_translator_range_constraint_ordered_polynomials();
    };

    inline void compute_dyadic_circuit_size()
    {

        // The actual circuit size is several times bigger than the trace in the circuit, because we use concatenation
        // to bring the degree of relations down, while extending the length.
        dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::CONCATENATION_GROUP_SIZE;
    }

    inline void compute_mini_circuit_dyadic_size(const Circuit& circuit)
    {
        const size_t total_num_gates = std::max(circuit.num_gates, Flavor::MINIMUM_MINI_CIRCUIT_SIZE);
        // Next power of 2
        mini_circuit_dyadic_size = circuit.get_circuit_subgroup_size(total_num_gates);
    }

    void compute_lagrange_polynomials();

    void compute_extra_range_constraint_numerator();

    void compute_concatenated_polynomials();

    void compute_translator_range_constraint_ordered_polynomials();
};
} // namespace bb