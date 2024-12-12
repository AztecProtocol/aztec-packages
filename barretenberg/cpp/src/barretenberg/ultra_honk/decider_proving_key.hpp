#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/composer/composer_lib.hpp"
#include "barretenberg/plonk_honk_shared/composer/permutation_lib.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/ultra_execution_trace.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/trace_to_polynomials/trace_to_polynomials.hpp"

namespace bb {
/**
 * @brief  A DeciderProvingKey is normally constructed from a finalized circuit and it contains all the information
 * required by an Mega Honk prover to create a proof. A DeciderProvingKey is also the result of running the
 * Protogalaxy prover, in which case it becomes a relaxed counterpart with the folding parameters (target sum and gate
 * challenges set to non-zero values).
 *
 * @details This is the equivalent of ω in the paper.
 */

template <IsUltraFlavor Flavor> class DeciderProvingKey_ {
    using Circuit = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Polynomial = typename Flavor::Polynomial;
    using RelationSeparator = typename Flavor::RelationSeparator;

    // Flag indicating whether the polynomials will be constructed with fixed block sizes for each gate type
    bool is_structured;

  public:
    using Trace = TraceToPolynomials<Flavor>;

    ProvingKey proving_key;

    bool is_accumulator = false;
    RelationSeparator alphas; // a challenge for each subrelation
    bb::RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accmumulator
    FF target_sum;
    size_t final_active_wire_idx{ 0 }; // idx of last non-trivial wire value in the trace
    size_t dyadic_circuit_size{ 0 };   // final power-of-2 circuit size

    size_t overflow_size{ 0 }; // size of the structured execution trace overflow

    DeciderProvingKey_(Circuit& circuit,
                       TraceSettings trace_settings = {},
                       std::shared_ptr<CommitmentKey> commitment_key = nullptr)
        : is_structured(trace_settings.structure.has_value())
    {
        PROFILE_THIS_NAME("DeciderProvingKey(Circuit&)");
        vinfo("Constructing DeciderProvingKey");
        auto start = std::chrono::steady_clock::now();

        circuit.finalize_circuit(/* ensure_nonzero = */ true);

        // If using a structured trace, set fixed block sizes, check their validity, and set the dyadic circuit size
        if constexpr (std::same_as<Circuit, UltraCircuitBuilder>) {
            dyadic_circuit_size = compute_dyadic_size(circuit); // set dyadic size directly from circuit block sizes
        } else if (std::same_as<Circuit, MegaCircuitBuilder>) {
            if (is_structured) {
                circuit.blocks.set_fixed_block_sizes(trace_settings); // The structuring is set
                circuit.blocks.summarize();
                move_structured_trace_overflow_to_overflow_block(circuit);
                overflow_size = circuit.blocks.overflow.size();
                dyadic_circuit_size = compute_structured_dyadic_size(circuit); // set the dyadic size accordingly
            } else {
                dyadic_circuit_size = compute_dyadic_size(circuit); // set dyadic size directly from circuit block sizes
            }
        }

        info("Finalized circuit size: ",
             circuit.num_gates,
             "\nLog dyadic circuit size: ",
             numeric::get_msb(dyadic_circuit_size));

        // Complete the public inputs execution trace block from circuit.public_inputs
        Trace::populate_public_inputs_block(circuit);
        circuit.blocks.compute_offsets(is_structured);

        // Find index of last non-trivial wire value in the trace
        for (auto& block : circuit.blocks.get()) {
            if (block.size() > 0) {
                final_active_wire_idx = block.trace_offset + block.size() - 1;
            }
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/905): This is adding ops to the op queue but NOT to
        // the circuit, meaning the ECCVM/Translator will use different ops than the main circuit. This will lead to
        // failure once https://github.com/AztecProtocol/barretenberg/issues/746 is resolved.
        if constexpr (IsMegaFlavor<Flavor>) {
            circuit.op_queue->append_nonzero_ops();
        }
        vinfo("allocating polynomials object in proving key...");
        {
            PROFILE_THIS_NAME("allocating proving key");

            proving_key = ProvingKey(dyadic_circuit_size, circuit.public_inputs.size(), commitment_key);
            // If not using structured trace OR if using structured trace but overflow has occurred (overflow block in
            // use), allocate full size polys
            // is_structured = false;
            if ((IsMegaFlavor<Flavor> && !is_structured) || (is_structured && circuit.blocks.has_overflow)) {
                // Allocate full size polynomials
                proving_key.polynomials = typename Flavor::ProverPolynomials(dyadic_circuit_size);
            } else { // Allocate only a correct amount of memory for each polynomial
                allocate_wires();

                allocate_permutation_argument_polynomials();

                allocate_selectors(circuit);

                allocate_table_lookup_polynomials(circuit);

                allocate_lagrange_polynomials();

                if constexpr (IsMegaFlavor<Flavor>) {
                    allocate_ecc_op_polynomials(circuit);
                }
                if constexpr (HasDataBus<Flavor>) {
                    allocate_databus_polynomials(circuit);
                }
            }
            // We can finally set the shifted polynomials now that all of the to_be_shifted polynomials are
            // defined.
            proving_key.polynomials.set_shifted(); // Ensure shifted wires are set correctly
        }

        // Construct and add to proving key the wire, selector and copy constraint polynomials
        vinfo("populating trace...");
        Trace::populate(circuit, proving_key, is_structured);

        {
            PROFILE_THIS_NAME("constructing prover instance after trace populate");

            // If Goblin, construct the databus polynomials
            if constexpr (IsMegaFlavor<Flavor>) {
                PROFILE_THIS_NAME("constructing databus polynomials");

                construct_databus_polynomials(circuit);
            }
        }
        // Set the lagrange polynomials
        proving_key.polynomials.lagrange_first.at(0) = 1;
        proving_key.polynomials.lagrange_last.at(final_active_wire_idx) = 1;

        {
            PROFILE_THIS_NAME("constructing lookup table polynomials");

            construct_lookup_table_polynomials<Flavor>(
                proving_key.polynomials.get_tables(), circuit, dyadic_circuit_size);
        }

        {
            PROFILE_THIS_NAME("constructing lookup read counts");

            construct_lookup_read_counts<Flavor>(proving_key.polynomials.lookup_read_counts,
                                                 proving_key.polynomials.lookup_read_tags,
                                                 circuit,
                                                 dyadic_circuit_size);
        }

        // Construct the public inputs array
        for (size_t i = 0; i < proving_key.num_public_inputs; ++i) {
            size_t idx = i + proving_key.pub_inputs_offset;
            proving_key.public_inputs.emplace_back(proving_key.polynomials.w_r[idx]);
        }

        if constexpr (HasIPAAccumulator<Flavor>) { // Set the IPA claim indices
            proving_key.ipa_claim_public_input_indices = circuit.ipa_claim_public_input_indices;
            proving_key.contains_ipa_claim = circuit.contains_ipa_claim;
            proving_key.ipa_proof = circuit.ipa_proof;
        }
        // Set the pairing point accumulator indices
        proving_key.pairing_point_accumulator_public_input_indices =
            circuit.pairing_point_accumulator_public_input_indices;
        proving_key.contains_pairing_point_accumulator = circuit.contains_pairing_point_accumulator;

        if constexpr (HasDataBus<Flavor>) { // Set databus commitment propagation data
            proving_key.databus_propagation_data = circuit.databus_propagation_data;
        }
        auto end = std::chrono::steady_clock::now();
        auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        vinfo("time to construct proving key: ", diff.count(), " ms.");
    }

    DeciderProvingKey_() = default;
    ~DeciderProvingKey_() = default;

    bool get_is_structured() { return is_structured; }

  private:
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    static constexpr size_t NUM_WIRES = Circuit::NUM_WIRES;

    size_t compute_dyadic_size(Circuit&);

    void allocate_wires();

    void allocate_permutation_argument_polynomials();

    void allocate_lagrange_polynomials();

    void allocate_selectors(const Circuit&);

    void allocate_table_lookup_polynomials(const Circuit&);

    void allocate_ecc_op_polynomials(const Circuit&)
        requires IsMegaFlavor<Flavor>;

    void allocate_databus_polynomials(const Circuit&)
        requires IsMegaFlavor<Flavor>;

    /**
     * @brief Compute dyadic size based on a structured trace with fixed block size
     *
     */
    size_t compute_structured_dyadic_size(Circuit& circuit) { return circuit.blocks.get_structured_dyadic_size(); }

    void construct_databus_polynomials(Circuit&)
        requires IsMegaFlavor<Flavor>;

    static void move_structured_trace_overflow_to_overflow_block(Circuit& circuit);
};

} // namespace bb
