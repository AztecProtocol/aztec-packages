// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <utility>

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

namespace bb {

class MultilinearBatchingRecursiveFlavor {
  public:
    using NativeFlavor = MultilinearBatchingFlavor;
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using PCS = KZG<Curve>;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using Transcript = StdlibTranscript<Builder>;

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
    static constexpr size_t NUM_WIRES = NativeFlavor::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;

    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>
    using Relations_ =
        std::tuple<bb::MultilinearBatchingAccumulatorRelation<FF>, bb::MultilinearBatchingInstanceRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = NativeFlavor::MAX_PARTIAL_RELATION_LENGTH;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenges for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    class AllValues : public NativeFlavor::AllEntities<FF> {
      public:
        using Base = NativeFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using CommitmentLabels = NativeFlavor::CommitmentLabels;
};

} // namespace bb
