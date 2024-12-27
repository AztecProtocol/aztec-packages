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
#include "barretenberg/stdlib_circuit_builders/ultra_starknet_flavor.hpp"

namespace bb {
/**
 * @brief  A DeciderProvingKey is normally constructed from a finalized circuit and it contains all the information
 * required by an Mega Honk prover to create a proof. A DeciderProvingKey is also the result of running the
 * Protogalaxy prover, in which case it becomes a relaxed counterpart with the folding parameters (target sum and gate
 * challenges set to non-zero values).
 *
 * @details This is the equivalent of ω in the paper.
 */

template <IsHonkFlavor Flavor> class DeciderProvingKey_ {
    using Circuit = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Polynomial = typename Flavor::Polynomial;
    using RelationSeparator = typename Flavor::RelationSeparator;

    using Trace = ExecutionTrace_<Flavor>;

    // Flag indicating whether the polynomials will be constructed with fixed block sizes for each gate type
    bool is_structured;

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
        : is_structured(trace_structure != TraceStructure::NONE)
    {
        PROFILE_THIS_NAME("DeciderProvingKey(Circuit&)");
        vinfo("DeciderProvingKey(Circuit&)");
        vinfo("creating decider proving key");

        circuit.finalize_circuit(/* ensure_nonzero = */ true);

        info("Finalized circuit size: ", circuit.num_gates);

        // If using a structured trace, set fixed block sizes, check their validity, and set the dyadic circuit size
        if (is_structured) {
            circuit.blocks.set_fixed_block_sizes(trace_structure); // set the fixed sizes for each block
            circuit.blocks.check_within_fixed_sizes();             // ensure that no block exceeds its fixed size
            dyadic_circuit_size = compute_structured_dyadic_size(circuit); // set the dyadic size accordingly
        } else {
            dyadic_circuit_size = compute_dyadic_size(circuit); // set dyadic size directly from circuit block sizes
        }

        info("Log dyadic circuit size: ", numeric::get_msb(dyadic_circuit_size));

        // Complete the public inputs execution trace block from circuit.public_inputs
        Trace::populate_public_inputs_block(circuit);
        circuit.blocks.compute_offsets(is_structured);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/905): This is adding ops to the op queue but NOT to
        // the circuit, meaning the ECCVM/Translator will use different ops than the main circuit. This will lead to
        // failure once https://github.com/AztecProtocol/barretenberg/issues/746 is resolved.
        if constexpr (IsGoblinFlavor<Flavor>) {
            circuit.op_queue->append_nonzero_ops();
        }
        {

            PROFILE_THIS_NAME("constructing proving key");
            vinfo("constructing proving key");

            proving_key = ProvingKey(dyadic_circuit_size, circuit.public_inputs.size(), commitment_key);
            if (IsGoblinFlavor<Flavor> && !is_structured) {
                // Allocate full size polynomials
                proving_key.polynomials = typename Flavor::ProverPolynomials(dyadic_circuit_size);
            } else { // Allocate only a correct amount of memory for each polynomial
                // Allocate the wires and selectors polynomials
                {
                    PROFILE_THIS_NAME("allocating wires");
                    vinfo("allocating wires");

                    for (auto& wire : proving_key.polynomials.get_wires()) {
                        wire = Polynomial::shiftable(proving_key.circuit_size);
                    }
                }
                {
                    PROFILE_THIS_NAME("allocating gate selectors");
                    vinfo("allocating gate selectors");

                    // Define gate selectors over the block they are isolated to
                    for (auto [selector, block] :
                         zip_view(proving_key.polynomials.get_gate_selectors(), circuit.blocks.get_gate_blocks())) {

                        // TODO(https://github.com/AztecProtocol/barretenberg/issues/914): q_arith is currently used
                        // in aux block.
                        if (&block == &circuit.blocks.arithmetic) {
                            size_t arith_size = circuit.blocks.aux.trace_offset -
                                                circuit.blocks.arithmetic.trace_offset +
                                                circuit.blocks.aux.get_fixed_size(is_structured);
                            selector = Polynomial(
                                arith_size, proving_key.circuit_size, circuit.blocks.arithmetic.trace_offset);
                        } else {
                            selector = Polynomial(
                                block.get_fixed_size(is_structured), proving_key.circuit_size, block.trace_offset);
                        }
                    }
                }
                {
                    PROFILE_THIS_NAME("allocating non-gate selectors");
                    vinfo("allocating non-gate selectors");

                    // Set the other non-gate selector polynomials to full size
                    for (auto& selector : proving_key.polynomials.get_non_gate_selectors()) {
                        selector = Polynomial(proving_key.circuit_size);
                    }
                }
                if constexpr (IsGoblinFlavor<Flavor>) {
                    PROFILE_THIS_NAME("allocating ecc op wires and selector");
                    vinfo("allocating ecc op wires and selector");

                    // Allocate the ecc op wires and selector
                    const size_t ecc_op_block_size = circuit.blocks.ecc_op.get_fixed_size(is_structured);
                    const size_t op_wire_offset = Flavor::has_zero_row ? 1 : 0;
                    for (auto& wire : proving_key.polynomials.get_ecc_op_wires()) {
                        wire = Polynomial(ecc_op_block_size, proving_key.circuit_size, op_wire_offset);
                    }
                    proving_key.polynomials.lagrange_ecc_op =
                        Polynomial(ecc_op_block_size, proving_key.circuit_size, op_wire_offset);
                }

                if constexpr (HasDataBus<Flavor>) {
                    proving_key.polynomials.calldata = Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.calldata_read_counts =
                        Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.calldata_read_tags = Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.secondary_calldata = Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.secondary_calldata_read_counts =
                        Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.secondary_calldata_read_tags =
                        Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.return_data = Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.return_data_read_counts =
                        Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                    proving_key.polynomials.return_data_read_tags =
                        Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);

                    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1107): Restricting databus_id to
                    // databus_size leads to failure.
                    // const size_t databus_size = std::max({ calldata.size(), secondary_calldata.size(),
                    // return_data.size() });
                    proving_key.polynomials.databus_id = Polynomial(proving_key.circuit_size, proving_key.circuit_size);
                }
                const size_t max_tables_size =
                    std::min(static_cast<size_t>(MAX_LOOKUP_TABLES_SIZE), dyadic_circuit_size - 1);
                size_t table_offset = dyadic_circuit_size - max_tables_size;
                {
                    PROFILE_THIS_NAME("allocating table polynomials");
                    vinfo("allocating table polynomials");

                    ASSERT(dyadic_circuit_size > max_tables_size);

                    // Allocate the table polynomials
                    if constexpr (IsHonkFlavor<Flavor>) {
                        for (auto& poly : proving_key.polynomials.get_tables()) {
                            poly = typename Flavor::Polynomial(max_tables_size, dyadic_circuit_size, table_offset);
                        }
                    }
                }
                {
                    PROFILE_THIS_NAME("allocating sigmas and ids");
                    vinfo("allocating sigmas and ids");

                    for (auto& sigma : proving_key.polynomials.get_sigmas()) {
                        sigma = typename Flavor::Polynomial(proving_key.circuit_size);
                    }
                    for (auto& id : proving_key.polynomials.get_ids()) {
                        id = typename Flavor::Polynomial(proving_key.circuit_size);
                    }
                }
                {
                    ZoneScopedN("allocating lookup read counts and tags");
                    // Allocate the read counts and tags polynomials
                    vinfo("allocating lookup read counts and tags");
                    proving_key.polynomials.lookup_read_counts =
                        typename Flavor::Polynomial(max_tables_size, dyadic_circuit_size, table_offset);
                    proving_key.polynomials.lookup_read_tags =
                        typename Flavor::Polynomial(max_tables_size, dyadic_circuit_size, table_offset);
                }
                {
                    ZoneScopedN("allocating lookup and databus inverses");
                    // Allocate the lookup_inverses polynomial
                    vinfo("allocating lookup and databus inverses");
                    const size_t lookup_offset = static_cast<size_t>(circuit.blocks.lookup.trace_offset);
                    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1033): construct tables and counts
                    // at top of trace
                    const size_t table_offset =
                        dyadic_circuit_size -
                        std::min(dyadic_circuit_size - 1, static_cast<size_t>(MAX_LOOKUP_TABLES_SIZE));
                    const size_t lookup_inverses_start = std::min(lookup_offset, table_offset);
                    const size_t lookup_inverses_end =
                        std::min(dyadic_circuit_size,
                                 std::max(lookup_offset + circuit.blocks.lookup.get_fixed_size(is_structured),
                                          table_offset + MAX_LOOKUP_TABLES_SIZE));
                    proving_key.polynomials.lookup_inverses = Polynomial(
                        lookup_inverses_end - lookup_inverses_start, dyadic_circuit_size, lookup_inverses_start);
                    if constexpr (HasDataBus<Flavor>) {
                        const size_t q_busread_end =
                            circuit.blocks.busread.trace_offset + circuit.blocks.busread.get_fixed_size(is_structured);
                        // Allocate the databus inverse polynomials
                        proving_key.polynomials.calldata_inverses =
                            Polynomial(std::max(circuit.get_calldata().size(), q_busread_end), dyadic_circuit_size);
                        proving_key.polynomials.secondary_calldata_inverses = Polynomial(
                            std::max(circuit.get_secondary_calldata().size(), q_busread_end), dyadic_circuit_size);
                        proving_key.polynomials.return_data_inverses =
                            Polynomial(std::max(circuit.get_return_data().size(), q_busread_end), dyadic_circuit_size);
                    }
                }
                {
                    PROFILE_THIS_NAME("constructing z_perm");
                    vinfo("constructing z_perm");

                    // Allocate the z_perm polynomial
                    proving_key.polynomials.z_perm = Polynomial::shiftable(proving_key.circuit_size);
                }

                {
                    PROFILE_THIS_NAME("allocating lagrange polynomials");
                    vinfo("allocating lagrange polynomials");

                    // First and last lagrange polynomials (in the full circuit size)
                    proving_key.polynomials.lagrange_first = Polynomial(1, dyadic_circuit_size, 0);
                    proving_key.polynomials.lagrange_last = Polynomial(1, dyadic_circuit_size, dyadic_circuit_size - 1);
                }
            }
            // We can finally set the shifted polynomials now that all of the to_be_shifted polynomials are
            // defined.
            proving_key.polynomials.set_shifted(); // Ensure shifted wires are set correctly
        }

        // Construct and add to proving key the wire, selector and copy constraint polynomials
        Trace::populate(circuit, proving_key, is_structured);

        {
            PROFILE_THIS_NAME("constructing prover instance after trace populate");
            vinfo("constructing prover instance after trace populate");

            // If Goblin, construct the databus polynomials
            if constexpr (IsGoblinFlavor<Flavor>) {
                PROFILE_THIS_NAME("constructing databus polynomials");
                vinfo("constructing databus polynomials");

                construct_databus_polynomials(circuit);
            }
        }
        // Set the lagrange polynomials
        proving_key.polynomials.lagrange_first.at(0) = 1;
        proving_key.polynomials.lagrange_last.at(dyadic_circuit_size - 1) = 1;

        {
            PROFILE_THIS_NAME("constructing lookup table polynomials");
            vinfo("constructing lookup table polynomials");

            construct_lookup_table_polynomials<Flavor>(
                proving_key.polynomials.get_tables(), circuit, dyadic_circuit_size);
        }

        {
            PROFILE_THIS_NAME("constructing lookup read counts");
            vinfo("constructing lookup read counts");

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

        // Set the recursive proof indices
        proving_key.recursive_proof_public_input_indices = circuit.recursive_proof_public_input_indices;
        proving_key.contains_recursive_proof = circuit.contains_recursive_proof;

        if constexpr (IsGoblinFlavor<Flavor>) { // Set databus commitment propagation data
            proving_key.databus_propagation_data = circuit.databus_propagation_data;
        }
    }

    DeciderProvingKey_() = default;
    ~DeciderProvingKey_() = default;

    bool get_is_structured() { return is_structured; }

  private:
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    static constexpr size_t NUM_WIRES = Circuit::NUM_WIRES;
    size_t dyadic_circuit_size = 0; // final power-of-2 circuit size

    size_t compute_dyadic_size(Circuit&);

    /**
     * @brief Compute dyadic size based on a structured trace with fixed block size
     *
     */
    size_t compute_structured_dyadic_size(Circuit& circuit)
    {
        size_t minimum_size = circuit.blocks.get_total_structured_size();
        return circuit.get_circuit_subgroup_size(minimum_size);
    }

    void construct_databus_polynomials(Circuit&)
        requires IsGoblinFlavor<Flavor>;
};

} // namespace bb
