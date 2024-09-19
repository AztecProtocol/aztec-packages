#pragma once
#include "barretenberg/execution_trace/execution_trace.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/arithmetization/mega_arithmetization.hpp"
#include "barretenberg/plonk_honk_shared/arithmetization/ultra_arithmetization.hpp"
#include "barretenberg/plonk_honk_shared/composer/composer_lib.hpp"
#include "barretenberg/plonk_honk_shared/composer/permutation_lib.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"

namespace bb {
/**
 * @brief  A DeciderProvingKey is normally constructed from a finalized circuit and it contains all the information
 * required by an Ultra Goblin Honk prover to create a proof. A DeciderProvingKey is also the result of running the
 * Protogalaxy prover, in which case it becomes a relaxed counterpart with the folding parameters (target sum and gate
 * challenges set to non-zero values).
 *
 * @details This is the equivalent of ω in the paper.
 */

template <class Flavor> class DeciderProvingKey_ {
    using Circuit = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Polynomial = typename Flavor::Polynomial;
    using RelationSeparator = typename Flavor::RelationSeparator;

    using Trace = ExecutionTrace_<Flavor>;

  public:
    ProvingKey proving_key;

    bool is_accumulator = false;
    RelationSeparator alphas; // a challenge for each subrelation
    bb::RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accmumulator
    FF target_sum;

    DeciderProvingKey_(Circuit& circuit,
                       TraceStructure trace_structure = TraceStructure::NONE,
                       std::shared_ptr<typename Flavor::CommitmentKey> commitment_key = nullptr)
    {
        BB_OP_COUNT_TIME_NAME("DeciderProvingKey(Circuit&)");
        circuit.finalize_circuit(/* ensure_nonzero = */ true);

        // Set flag indicating whether the polynomials will be constructed with fixed block sizes for each gate type
        const bool is_structured = (trace_structure != TraceStructure::NONE);

        // If using a structured trace, set fixed block sizes, check their validity, and set the dyadic circuit size
        if (is_structured) {
            circuit.blocks.set_fixed_block_sizes(trace_structure); // set the fixed sizes for each block
            circuit.blocks.check_within_fixed_sizes();             // ensure that no block exceeds its fixed size
            dyadic_circuit_size = compute_structured_dyadic_size(circuit); // set the dyadic size accordingly
        } else {
            dyadic_circuit_size = compute_dyadic_size(circuit); // set dyadic size directly from circuit block sizes
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/905): This is adding ops to the op queue but NOT to
        // the circuit, meaning the ECCVM/Translator will use different ops than the main circuit. This will lead to
        // failure once https://github.com/AztecProtocol/barretenberg/issues/746 is resolved.
        if constexpr (IsGoblinFlavor<Flavor>) {
            circuit.op_queue->append_nonzero_ops();
        }
        {
            ZoneScopedN("constructing proving key");

            proving_key = ProvingKey(dyadic_circuit_size, circuit.public_inputs.size(), commitment_key);
        }

        // Construct and add to proving key the wire, selector and copy constraint polynomials
        Trace::populate(circuit, proving_key, is_structured);
        ZoneScopedN("constructing prover instance after trace populate");

        // If Goblin, construct the databus polynomials
        if constexpr (IsGoblinFlavor<Flavor>) {
            construct_databus_polynomials(circuit);
        }

        // First and last lagrange polynomials (in the full circuit size)
        proving_key.polynomials.lagrange_first = Polynomial(1, dyadic_circuit_size, 0);
        proving_key.polynomials.lagrange_last = Polynomial(1, dyadic_circuit_size, dyadic_circuit_size - 1);
        proving_key.polynomials.lagrange_first.at(0) = 1;
        proving_key.polynomials.lagrange_last.at(dyadic_circuit_size - 1) = 1;

        construct_lookup_table_polynomials<Flavor>(proving_key.polynomials.get_tables(), circuit, dyadic_circuit_size);

        construct_lookup_read_counts<Flavor>(proving_key.polynomials.lookup_read_counts,
                                             proving_key.polynomials.lookup_read_tags,
                                             circuit,
                                             dyadic_circuit_size);

        // Construct the public inputs array
        for (size_t i = 0; i < proving_key.num_public_inputs; ++i) {
            size_t idx = i + proving_key.pub_inputs_offset;
            proving_key.public_inputs.emplace_back(proving_key.polynomials.w_r[idx]);
        }

        // Set the recursive proof indices
        proving_key.recursive_proof_public_input_indices = circuit.recursive_proof_public_input_indices;
        proving_key.contains_recursive_proof = circuit.contains_recursive_proof;

        if constexpr (IsGoblinFlavor<Flavor>) { // Set databus commitment propagation data
            proving_key.databus_propagation_data = circuit.databus_propagation_data;
        }

        // Allocate the lookup_inverses polynomial
        size_t q_lookup_offset = Flavor::has_zero_row ? 1 : 0;
        if constexpr (IsGoblinFlavor<Flavor>) {
            q_lookup_offset += circuit.blocks.ecc_op.get_fixed_size(is_structured);
        }
        q_lookup_offset += circuit.blocks.pub_inputs.get_fixed_size(is_structured) +
                           circuit.blocks.arithmetic.get_fixed_size(is_structured) +
                           circuit.blocks.delta_range.get_fixed_size(is_structured) +
                           circuit.blocks.elliptic.get_fixed_size(is_structured) +
                           circuit.blocks.aux.get_fixed_size(is_structured);
        const size_t tables_size = circuit.get_tables_size();
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1033): construct tables and counts at top of trace
        const size_t table_offset = dyadic_circuit_size - tables_size;
        const size_t lookup_inverses_start = std::min(q_lookup_offset, table_offset);
        const size_t lookup_inverses_end =
            std::max(q_lookup_offset + circuit.blocks.lookup.size(), table_offset + tables_size);
        proving_key.polynomials.lookup_inverses =
            Polynomial(lookup_inverses_end - lookup_inverses_start, dyadic_circuit_size, lookup_inverses_start);
        if constexpr (HasDataBus<Flavor>) {
            const size_t q_busread_end =
                q_lookup_offset + circuit.blocks.lookup.get_fixed_size(is_structured) + circuit.blocks.busread.size();
            // Allocate the databus inverse polynomials
            proving_key.polynomials.calldata_inverses =
                Polynomial(std::max(circuit.get_calldata().size(), q_busread_end), dyadic_circuit_size);
            proving_key.polynomials.secondary_calldata_inverses =
                Polynomial(std::max(circuit.get_secondary_calldata().size(), q_busread_end), dyadic_circuit_size);
            proving_key.polynomials.return_data_inverses =
                Polynomial(std::max(circuit.get_return_data().size(), q_busread_end), dyadic_circuit_size);
        }
        // Allocate the z_perm polynomial
        proving_key.polynomials.z_perm = Polynomial::shiftable(proving_key.circuit_size);

        // We can finally set the shifted polynomials now that all of the to_be_shifted polynomials are defined.
        proving_key.polynomials.set_shifted(); // Ensure shifted wires are set correctly
    }

    DeciderProvingKey_() = default;
    ~DeciderProvingKey_() = default;

  private:
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    static constexpr size_t NUM_WIRES = Circuit::NUM_WIRES;
    size_t dyadic_circuit_size = 0; // final power-of-2 circuit size

    size_t compute_dyadic_size(Circuit&);

    /**
     * @brief Compute dyadic size based on a structured trace with fixed block size
     *
     */
    size_t compute_structured_dyadic_size(Circuit& builder)
    {
        size_t minimum_size = builder.blocks.get_total_structured_size();
        return builder.get_circuit_subgroup_size(minimum_size);
    }

    void construct_databus_polynomials(Circuit&)
        requires IsGoblinFlavor<Flavor>;
};

} // namespace bb
