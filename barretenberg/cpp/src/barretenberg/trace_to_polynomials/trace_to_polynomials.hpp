// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/honk/composer/permutation_lib.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb {

template <class Flavor> class TraceToPolynomials {
    using Builder = typename Flavor::CircuitBuilder;
    using Polynomial = typename Flavor::Polynomial;
    using FF = typename Flavor::FF;
    using ExecutionTrace = typename Builder::ExecutionTrace;
    using Wires = std::array<SlabVector<uint32_t>, Builder::NUM_WIRES>;
    using ProvingKey = typename Flavor::ProvingKey;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

  public:
    static constexpr size_t NUM_WIRES = Builder::NUM_WIRES;

    static constexpr size_t NUM_SELECTORS = Builder::ExecutionTrace::NUM_SELECTORS;

    /**
     * @brief Given a circuit, populate a proving key with wire polys, selector polys, and sigma/id polys
     * @note By default, this method constructs an exectution trace that is sorted by gate type. Optionally, it
     * constructs a trace that is both sorted and "structured" in the sense that each block/gate-type has a fixed amount
     * of space within the wire polynomials, regardless of how many actual constraints of each type exist. This is
     * useful primarily for folding since it guarantees that the set of relations that must be executed at each row is
     * consistent across all folding steps.
     *
     * @param builder
     * @param is_structured whether or not the trace is to be structured with a fixed block size
     */
    static void populate(Builder& builder, ProverPolynomials&, ActiveRegionData&);

  private:
    // /**
    //  * @brief Add the memory records indicating which rows correspond to RAM/ROM reads/writes
    //  * @details The 4th wire of RAM/ROM read/write gates is generated at proving time as a linear combination of the
    //  * first three wires scaled by powers of a challenge. To know on which rows to perform this calculation, we must
    //  * store the indices of read/write gates in the proving key. In the builder, we store the row index of these
    //  gates
    //  * within the block containing them. To obtain the row index in the trace at large, we simply increment these
    //  * indices by the offset at which that block is placed into the trace.
    //  *
    //  * @param trace_data
    //  * @param builder
    //  * @param proving_key
    //  */
    // static void add_memory_records_to_proving_key(Builder& builder, ProverPolynomials&);

    /**
     * @brief Populate wire polynomials, selector polynomials and copy cycles from raw circuit data
     *
     * @param builder
     * @param proving_key
     * @return std::vector<CyclicPermutation> copy cycles describing the copy constraints in the circuit
     */
    static std::vector<CyclicPermutation> populate_wires_and_selectors_and_compute_copy_cycles(Builder& builder,
                                                                                               ProverPolynomials&,
                                                                                               ActiveRegionData&);

    /**
     * @brief Construct and add the goblin ecc op wires to the proving key
     * @details The ecc op wires vanish everywhere except on the ecc op block, where they contain a copy of the ecc op
     * data assumed already to be present in the corrresponding block of the conventional wires in the proving key.
     *
     * @param builder
     * @param proving_key
     */
    static void add_ecc_op_wires_to_proving_key(Builder& builder, ProverPolynomials&)
        requires IsMegaFlavor<Flavor>;
};

} // namespace bb
