// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <utility>

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

namespace bb {

class MultilinearBatchingRecursiveFlavor {
  public:
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MultilinearBatchingFlavor;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

    // An upper bound on the size of the MultilinearBatching-circuits. `CONST_PG_LOG_N` bounds the log circuit sizes in
    // the CIVC context. `MEGA_AVM_LOG_N` is determined by the size of the AVMRecursiveVerifier.
    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = NativeFlavor::HasZK;
    // Indicates that this flavor runs with Multilinear Batching.
    static constexpr bool IS_MULTILINEAR_BATCHING = NativeFlavor::IS_MULTILINEAR_BATCHING;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = NativeFlavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = 4;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = 6;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 0;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 4;
    // The number of shifted witness entities including derived witness entities
    static constexpr size_t NUM_SHIFTED_WITNESSES = 2;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF> using Relations_ = std::tuple<bb::MultilinearBatchingRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();
    static_assert(MAX_TOTAL_RELATION_LENGTH == 3);
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t num_frs_comm = NativeFlavor::num_frs_comm;
    static constexpr size_t num_frs_fr = NativeFlavor::num_frs_comm;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenges for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    // Whether or not the first row of the execution trace is reserved for 0s to enable shifts
    static constexpr bool has_zero_row = false;

    // WireEntities for basic witness entities
    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_non_shifted_accumulator, // column 0
                              w_non_shifted_instance,    // column 1
                              w_evaluations_accumulator, // column 2
                              w_evaluations_instance);   // column 3
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     * Combines WireEntities + DerivedEntities.
     */
    template <typename DataType> class WitnessEntities : public WireEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); };

        MSGPACK_FIELDS(this->w_non_shifted_accumulator,
                       this->w_non_shifted_instance,
                       this->w_evaluations_accumulator,
                       this->w_evaluations_instance);
    };

    /**
     * @brief Class for ShiftedEntities, containing the shifted witness polynomials.
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_shifted_accumulator, // column 0
                              w_shifted_instance     // column 1
        );
        auto get_shifted() { return RefArray{ w_shifted_accumulator, w_shifted_instance }; };
    };

  public:
    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + "ShiftedEntities". It could be
     * implemented as such, but we have this now.
     */
    template <typename DataType>
    class AllEntities : public WitnessEntities<DataType>, public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_unshifted() { return WitnessEntities<DataType>::get_all(); };
        auto get_witness() { return WitnessEntities<DataType>::get_all(); };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
    };

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            w_non_shifted_accumulator = "W_NON_SHIFTED_ACCUMULATOR";
            w_non_shifted_instance = "W_NON_SHIFTED_INSTANCE";
            w_evaluations_accumulator = "W_EVALUATIONS_ACCUMULATOR";
            w_evaluations_instance = "W_EVALUATIONS_INSTANCE";
            w_shifted_accumulator = "W_SHIFTED_ACCUMULATOR";
            w_shifted_instance = "W_SHIFTED_INSTANCE";
        };
    };
};

} // namespace bb
