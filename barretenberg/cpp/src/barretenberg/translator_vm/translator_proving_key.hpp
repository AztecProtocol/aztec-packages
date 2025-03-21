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
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentKey = typename Flavor::CommitmentKey;

    size_t mini_circuit_dyadic_size;
    size_t dyadic_circuit_size;
    std::shared_ptr<ProvingKey> proving_key;

    BF batching_challenge_v = { 0 };
    BF evaluation_input_x = { 0 };

    TranslatorProvingKey() = default;

    TranslatorProvingKey(size_t mini_circuit_dyadic_size)
        : mini_circuit_dyadic_size(mini_circuit_dyadic_size)
        , dyadic_circuit_size(mini_circuit_dyadic_size * Flavor::INTERLEAVING_GROUP_SIZE)
        , proving_key(std::make_shared<ProvingKey>(dyadic_circuit_size))

    {
        proving_key->polynomials = Flavor::ProverPolynomials(mini_circuit_dyadic_size);
    }

    TranslatorProvingKey(const Circuit& circuit, std::shared_ptr<CommitmentKey> commitment_key = nullptr)
        : batching_challenge_v(circuit.batching_challenge_v)
        , evaluation_input_x(circuit.evaluation_input_x)
    {
        PROFILE_THIS_NAME("TranslatorProvingKey(TranslatorCircuit&)");

        compute_mini_circuit_dyadic_size(circuit);
        compute_dyadic_circuit_size();
        proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, std::move(commitment_key));
        proving_key->polynomials = Flavor::ProverPolynomials(mini_circuit_dyadic_size);

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

        // Creates the polynomials resulting from interleaving each group of range constraints into one polynomial.
        // These are not commited to.
        compute_interleaved_polynomials();

        // We also contruct ordered polynomials, which have the same values as interleaved ones + enough values to
        // bridge the range from 0 to maximum range defined by the range constraint.
        compute_translator_range_constraint_ordered_polynomials();
    };

    inline void compute_dyadic_circuit_size()
    {

        // The actual circuit size is several times bigger than the trace in the circuit, because we use interleaving
        // to bring the degree of relations down, while extending the length.
        dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::INTERLEAVING_GROUP_SIZE;
    }

    inline void compute_mini_circuit_dyadic_size(const Circuit& circuit)
    {
        // Check that the Translator Circuit does not exceed the fixed upper bound, the current value 8192 corresponds
        // to 10 rounds of folding (i.e. 20 circuits)
        if (circuit.num_gates > Flavor::TRANSLATOR_VM_FIXED_SIZE) {
            info("The Translator circuit size has exceeded the fixed upper bound");
            ASSERT(false);
        }
        mini_circuit_dyadic_size = Flavor::TRANSLATOR_VM_FIXED_SIZE;
    }

    void compute_lagrange_polynomials();

    void compute_extra_range_constraint_numerator();

    void compute_translator_range_constraint_ordered_polynomials();

    void compute_interleaved_polynomials();
};
} // namespace bb
