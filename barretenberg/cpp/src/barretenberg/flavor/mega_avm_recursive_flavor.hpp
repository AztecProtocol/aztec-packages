// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MegaAvmFlavor.
 * @details Used by the outer Ultra circuit when recursively verifying the Mega proof of the inner AVM recursive
 * verifier. Mirrors MegaAvmFlavor's entity/relation set, with stdlib curve / field types.
 */
template <typename BuilderType> class MegaAvmRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MegaAvmFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = MegaAvmFlavor::VIRTUAL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = MegaAvmFlavor::USE_SHORT_MONOMIALS;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = MegaAvmFlavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = MegaAvmFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaAvmFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaAvmFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaAvmFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaAvmFlavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaAvmFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr bool HasDataBus = MegaAvmFlavor::HasDataBus;
    static constexpr size_t NUM_BUS_COLUMNS = MegaAvmFlavor::NUM_BUS_COLUMNS;
    static constexpr bool HasLogDerivLookup = MegaAvmFlavor::HasLogDerivLookup;
    static constexpr bool HasElliptic = MegaAvmFlavor::HasElliptic;
    static constexpr bool HasMemory = MegaAvmFlavor::HasMemory;
    static constexpr bool HasNonNativeField = MegaAvmFlavor::HasNonNativeField;
    static constexpr bool HasEccOpQueue = MegaAvmFlavor::HasEccOpQueue;
    static constexpr bool UsesEtaPowers = MegaAvmFlavor::UsesEtaPowers;
    static constexpr bool UsesBetaPowers = MegaAvmFlavor::UsesBetaPowers;

    using Relations = MegaAvmFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return MegaAvmFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaAvmFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t NUM_SUBRELATIONS = MegaAvmFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    class AllValues : public MegaAvmFlavor::AllEntities<FF> {
      public:
        using Base = MegaAvmFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    using WitnessCommitments = MegaAvmFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaAvmFlavor::CommitmentLabels;
    static const CommitmentLabels& commitment_labels() { return MegaAvmFlavor::commitment_labels(); }

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
