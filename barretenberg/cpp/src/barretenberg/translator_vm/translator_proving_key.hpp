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

    size_t mini_circuit_dyadic_size;
    size_t dyadic_circuit_size;
    std::shared_ptr<ProvingKey> proving_key;

    BF batching_challenge_v = { 0 };
    BF evaluation_input_x = { 0 };

    TranslatorProvingKey() = default;

    TranslatorProvingKey(size_t actual_mini_circuit_size)
    {
        compute_mini_circuit_dyadic_size(actual_mini_circuit_size);
        compute_dyadic_circuit_size();
        proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size, actual_mini_circuit_size);
    }

    TranslatorProvingKey(const Circuit& circuit, std::shared_ptr<CommitmentKey> commitment_key = nullptr)
        : batching_challenge_v(circuit.batching_challenge_v)
        , evaluation_input_x(circuit.evaluation_input_x)
    {
        PROFILE_THIS_NAME("TranslatorProvingKey(TranslatorCircuit&)");

        // WORKTODO: the methods below just set the constant values MINI_CIRCUIT_SIZE and 2^{CONST_TRANSLATOR_LOG_N}
        compute_mini_circuit_dyadic_size(circuit.num_gates);
        compute_dyadic_circuit_size();

        proving_key = std::make_shared<ProvingKey>(
            dyadic_circuit_size, std::move(commitment_key), /*actual_mini_ circuit_size=*/circuit.num_gates);

        // Populate the wire polynomials from the wire vectors in the circuit
        for (auto [wire_poly_, wire_] : zip_view(proving_key->polynomials.get_wires(), circuit.wires)) {
            auto& wire_poly = wire_poly_;
            const auto& wire = wire_;
            // WORKTODO: I think we should share memory here in the same way we do in the `DeciderProvingKey` class.
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

    inline void compute_dyadic_circuit_size()
    {

        // The actual circuit size is several times bigger than the trace in the circuit, because we use interleaving
        // to bring the degree of relations down, while extending the length.
        dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::INTERLEAVING_GROUP_SIZE;
    }

    inline void compute_mini_circuit_dyadic_size(size_t num_gates)
    {
        // Check that the Translator Circuit does not exceed the fixed upper bound, the current value 8192 corresponds
        // to 10 rounds of folding (i.e. 20 circuits)
        if (num_gates > Flavor::MINI_CIRCUIT_SIZE) {
            throw_or_abort("The Translator circuit size has exceeded the fixed upper bound");
        }
        mini_circuit_dyadic_size = Flavor::MINI_CIRCUIT_SIZE;
    }

    void compute_lagrange_polynomials();

    void compute_extra_range_constraint_numerator();

    void compute_translator_range_constraint_ordered_polynomials(bool masking = false);

    void compute_interleaved_polynomials();
};
} // namespace bb
