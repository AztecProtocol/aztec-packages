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
        {

            PROFILE_THIS_NAME("allocating proving key");

            proving_key = ProvingKey(dyadic_circuit_size, circuit.public_inputs.size(), commitment_key);
            // If not using structured trace OR if using structured trace but overflow has occurred (overflow block in
            // use), allocate full size polys
            // is_structured = false;
            if ((IsMegaFlavor<Flavor> && !is_structured) || (is_structured && circuit.blocks.has_overflow)) {
                // Allocate full size polynomials
                proving_key.polynomials = typename Flavor::ProverPolynomials(dyadic_circuit_size);
                vinfo("allocated polynomials object in proving key");
            } else { // Allocate only a correct amount of memory for each polynomial
                // Allocate the wires and selectors polynomials
                {
                    PROFILE_THIS_NAME("allocating wires");

                    for (auto& wire : proving_key.polynomials.get_wires()) {
                        wire = Polynomial::shiftable(proving_key.circuit_size);
                    }
                }
                {
                    PROFILE_THIS_NAME("allocating gate selectors");

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

                    // Set the other non-gate selector polynomials to full size
                    for (auto& selector : proving_key.polynomials.get_non_gate_selectors()) {
                        selector = Polynomial(proving_key.circuit_size);
                    }
                }
                if constexpr (IsMegaFlavor<Flavor>) {
                    PROFILE_THIS_NAME("allocating ecc op wires and selector");

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

                    proving_key.polynomials.databus_id = Polynomial(MAX_DATABUS_SIZE, proving_key.circuit_size);
                }
                const size_t max_tables_size =
                    std::min(static_cast<size_t>(MAX_LOOKUP_TABLES_SIZE), dyadic_circuit_size - 1);
                size_t table_offset = dyadic_circuit_size - max_tables_size;
                {
                    PROFILE_THIS_NAME("allocating table polynomials");

                    ASSERT(dyadic_circuit_size > max_tables_size);

                    // Allocate the table polynomials
                    if constexpr (IsUltraFlavor<Flavor>) {
                        for (auto& poly : proving_key.polynomials.get_tables()) {
                            poly = Polynomial(max_tables_size, dyadic_circuit_size, table_offset);
                        }
                    }
                }
                {
                    PROFILE_THIS_NAME("allocating sigmas and ids");

                    for (auto& sigma : proving_key.polynomials.get_sigmas()) {
                        sigma = Polynomial(proving_key.circuit_size);
                    }
                    for (auto& id : proving_key.polynomials.get_ids()) {
                        id = Polynomial(proving_key.circuit_size);
                    }
                }
                {
                    ZoneScopedN("allocating lookup read counts and tags");
                    // Allocate the read counts and tags polynomials
                    proving_key.polynomials.lookup_read_counts =
                        Polynomial(max_tables_size, dyadic_circuit_size, table_offset);
                    proving_key.polynomials.lookup_read_tags =
                        Polynomial(max_tables_size, dyadic_circuit_size, table_offset);
                }
                {
                    ZoneScopedN("allocating lookup and databus inverses");
                    // Allocate the lookup_inverses polynomial
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

                    // Allocate the z_perm polynomial
                    vinfo("constructing z_perm...");
                    proving_key.polynomials.z_perm = Polynomial::shiftable(proving_key.circuit_size);
                    vinfo("done constructing z_perm.");
                }

                {
                    PROFILE_THIS_NAME("allocating lagrange polynomials");

                    // First and last lagrange polynomials (in the full circuit size)
                    proving_key.polynomials.lagrange_first = Polynomial(
                        /* size=*/1, /*virtual size=*/dyadic_circuit_size, /*start_idx=*/0);

                    // Even though lagrange_last has a single non-zero element, we cannot set its size to 0 as different
                    // keys being folded might have lagrange_last set at different indexes and folding does not work
                    // correctly unless the polynomial is allocated in the correct range to accomodate this
                    proving_key.polynomials.lagrange_last = Polynomial(
                        /* size=*/dyadic_circuit_size, /*virtual size=*/dyadic_circuit_size, /*start_idx=*/0);
                }
            }
            vinfo("allocated polynomials object in proving key");
            // We can finally set the shifted polynomials now that all of the to_be_shifted polynomials are
            // defined.
            proving_key.polynomials.set_shifted(); // Ensure shifted wires are set correctly
        }

        // Construct and add to proving key the wire, selector and copy constraint polynomials
        vinfo("populating trace...");
        Trace::populate(circuit, proving_key, is_structured);
        vinfo("done populating trace.");

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
