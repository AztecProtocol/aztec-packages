// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MegaAppFlavor.
 * @details Used when a Mega kernel circuit recursively verifies a folding proof of a prior app.
 * The recursive verifier always lives inside `MegaCircuitBuilder`, so this is a plain
 * (non-template) class.
 */
class MegaAppRecursiveFlavor {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MegaAppFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = MegaAppFlavor::VIRTUAL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = MegaAppFlavor::USE_SHORT_MONOMIALS;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = MegaAppFlavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = MegaAppFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaAppFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaAppFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaAppFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaAppFlavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaAppFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr bool HasDataBus = MegaAppFlavor::HasDataBus;
    static constexpr size_t NUM_BUS_COLUMNS = MegaAppFlavor::NUM_BUS_COLUMNS;
    static constexpr bool HasLogDerivLookup = MegaAppFlavor::HasLogDerivLookup;
    static constexpr bool HasElliptic = MegaAppFlavor::HasElliptic;
    static constexpr bool HasMemory = MegaAppFlavor::HasMemory;
    static constexpr bool HasNonNativeField = MegaAppFlavor::HasNonNativeField;
    static constexpr bool HasEccOpQueue = MegaAppFlavor::HasEccOpQueue;

    using Relations = MegaAppFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return MegaAppFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaAppFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t NUM_SUBRELATIONS = MegaAppFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    class AllValues : public MegaAppFlavor::AllEntities<FF> {
      public:
        using Base = MegaAppFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   NativeFlavor::VerificationKey>;
    using WitnessCommitments = MegaAppFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaAppFlavor::CommitmentLabels;
    static const CommitmentLabels& commitment_labels() { return MegaAppFlavor::commitment_labels(); }

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
