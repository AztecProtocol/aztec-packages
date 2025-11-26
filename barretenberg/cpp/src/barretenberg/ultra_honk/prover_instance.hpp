// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/honk/composer/composer_lib.hpp"
#include "barretenberg/honk/composer/permutation_lib.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/honk/execution_trace/ultra_execution_trace.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/trace_to_polynomials/trace_to_polynomials.hpp"
#include <chrono>

namespace bb {

/**
 * @brief A ProverInstance is normally constructed from a finalized circuit and it contains all the information
 * required by a Mega Honk prover to create a proof.
 */

template <IsUltraOrMegaHonk Flavor_> class ProverInstance_ {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;

  private:
    using Circuit = typename Flavor::CircuitBuilder;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using Polynomial = typename Flavor::Polynomial;
    using SubrelationSeparator = typename Flavor::SubrelationSeparator;

    MetaData metadata; // circuit size and public inputs metadata
    // index of the last constrained wire in the execution trace; initialize to size_t::max to indicate uninitialized
    size_t final_active_wire_idx{ std::numeric_limits<size_t>::max() };

  public:
    using Trace = TraceToPolynomials<Flavor>;

    std::vector<FF> public_inputs;
    ProverPolynomials polynomials; // the multilinear polynomials used by the prover
    WitnessCommitments commitments;
    SubrelationSeparator alpha; // single challenge from which powers are computed for batching subrelations
    bb::RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;

    HonkProof ipa_proof; // utilized only for UltraRollupFlavor

    bool is_complete = false; // whether this instance has been completely populated
    std::vector<uint32_t> memory_read_records;
    std::vector<uint32_t> memory_write_records;

    CommitmentKey commitment_key;

    ActiveRegionData active_region_data; // specifies active regions of execution trace

    void set_dyadic_size(size_t size) { metadata.dyadic_size = size; }
    void set_final_active_wire_idx(size_t idx) { final_active_wire_idx = idx; }
    size_t dyadic_size() const { return metadata.dyadic_size; }
    size_t log_dyadic_size() const { return numeric::get_msb(dyadic_size()); }
    size_t pub_inputs_offset() const { return metadata.pub_inputs_offset; }
    size_t num_public_inputs() const
    {
        BB_ASSERT_EQ(metadata.num_public_inputs, public_inputs.size());
        return metadata.num_public_inputs;
    }
    MetaData get_metadata() const { return metadata; }
    size_t get_final_active_wire_idx() const
    {
        BB_ASSERT(final_active_wire_idx != std::numeric_limits<size_t>::max(),
                  "final_active_wire_idx has not been initialized");
        return final_active_wire_idx;
    }
    /** @brief Get the size of the active trace range (0 to the final active wire index) */
    size_t trace_active_range_size() const
    {
        return get_final_active_wire_idx() + 1; // +1 because index is inclusive
    }

    Flavor::PrecomputedData get_precomputed()
    {
        return typename Flavor::PrecomputedData{ polynomials.get_precomputed(), metadata };
    }

    ProverInstance_(Circuit& circuit, const CommitmentKey& commitment_key = CommitmentKey())
        : commitment_key(commitment_key)
    {
        BB_BENCH_NAME("ProverInstance(Circuit&)");
        vinfo("Constructing ProverInstance");
        auto start = std::chrono::steady_clock::now();

        // Check pairing point tagging: either no pairing points were created,
        // or all pairing points have been aggregated into a single equivalence class
        BB_ASSERT(circuit.pairing_points_tagging.has_single_pairing_point_tag(),
                  "Pairing points must all be aggregated together. Either no pairing points should be created, or "
                  "all created pairing points must be aggregated into a single pairing point. Found ",
                  circuit.pairing_points_tagging.num_unique_pairing_points(),
                  " different pairing points.");
        // Check pairing point tagging: check that the pairing points have been set to public
        BB_ASSERT(circuit.pairing_points_tagging.has_public_pairing_points() ||
                      !circuit.pairing_points_tagging.has_pairing_points(),
                  "Pairing points must be set to public in the circuit before constructing the ProverInstance.");

        // Decider proving keys can be constructed multiple times, hence, we check whether the circuit has been
        // finalized
        if (!circuit.circuit_finalized) {
            circuit.finalize_circuit(/* ensure_nonzero = */ true);
        }
        metadata.dyadic_size = compute_dyadic_size(circuit);

        // Find index of last non-trivial wire value in the trace
        circuit.blocks.compute_offsets(); // compute offset of each block within the trace
        for (auto& block : circuit.blocks.get()) {
            if (block.size() > 0) {
                final_active_wire_idx = block.trace_offset() + block.size() - 1;
            }
        }

        vinfo("allocating polynomials object in prover instance...");
        {
            BB_BENCH_NAME("allocating polynomials");

            populate_memory_records(circuit);

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

            // Set the shifted polynomials now that all of the to_be_shifted polynomials are defined.
            polynomials.set_shifted();
        }

        // Construct and add to proving key the wire, selector and copy constraint polynomials
        vinfo("populating trace...");
        Trace::populate(circuit, polynomials, active_region_data);

        {
            BB_BENCH_NAME("constructing prover instance after trace populate");

            // If Goblin, construct the databus polynomials
            if constexpr (IsMegaFlavor<Flavor>) {
                BB_BENCH_NAME("constructing databus polynomials");

                construct_databus_polynomials(circuit);
            }
        }
        // Set the lagrange polynomials
        polynomials.lagrange_first.at(0) = 1;
        polynomials.lagrange_last.at(final_active_wire_idx) = 1;

        {
            BB_BENCH_NAME("constructing lookup table polynomials");

            construct_lookup_table_polynomials<Flavor>(polynomials.get_tables(), circuit);
        }

        {
            BB_BENCH_NAME("constructing lookup read counts");

            construct_lookup_read_counts<Flavor>(polynomials.lookup_read_counts, polynomials.lookup_read_tags, circuit);
        }
        { // Public inputs handling
            metadata.num_public_inputs = circuit.blocks.pub_inputs.size();
            metadata.pub_inputs_offset = circuit.blocks.pub_inputs.trace_offset();
            for (size_t i = 0; i < metadata.num_public_inputs; ++i) {
                size_t idx = i + metadata.pub_inputs_offset;
                public_inputs.emplace_back(polynomials.w_r[idx]);
            }

            if constexpr (HasIPAAccumulator<Flavor>) { // Set the IPA claim indices
                ipa_proof = circuit.ipa_proof;
            }
        }
        auto end = std::chrono::steady_clock::now();
        auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        vinfo("time to construct proving key: ", diff.count(), " ms.");
    }

    ProverInstance_() = default;
    ProverInstance_(const ProverInstance_&) = delete;
    ProverInstance_(ProverInstance_&&) = delete;
    ProverInstance_& operator=(const ProverInstance_&) = delete;
    ProverInstance_& operator=(ProverInstance_&&) = delete;
    ~ProverInstance_() = default;

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
        requires HasDataBus<Flavor>;

    void construct_databus_polynomials(Circuit&)
        requires HasDataBus<Flavor>;

    void populate_memory_records(const Circuit& circuit);
};

} // namespace bb
