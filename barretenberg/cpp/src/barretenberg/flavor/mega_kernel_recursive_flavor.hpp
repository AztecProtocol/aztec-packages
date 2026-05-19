// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MegaKernelFlavor.
 * @details Used when a Mega kernel circuit recursively verifies a folding proof of a prior kernel.
 * The recursive verifier always lives inside `MegaCircuitBuilder`, so this is a plain
 * (non-template) class.
 */
class MegaKernelRecursiveFlavor {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MegaKernelFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = MegaKernelFlavor::VIRTUAL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = MegaKernelFlavor::USE_SHORT_MONOMIALS;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = MegaKernelFlavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = MegaKernelFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaKernelFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaKernelFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaKernelFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaKernelFlavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaKernelFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr bool HasDataBus = MegaKernelFlavor::HasDataBus;
    static constexpr size_t NUM_BUS_COLUMNS = MegaKernelFlavor::NUM_BUS_COLUMNS;
    static constexpr bool HasLogDerivLookup = MegaKernelFlavor::HasLogDerivLookup;
    static constexpr bool HasElliptic = MegaKernelFlavor::HasElliptic;
    static constexpr bool HasMemory = MegaKernelFlavor::HasMemory;
    static constexpr bool HasNonNativeField = MegaKernelFlavor::HasNonNativeField;
    static constexpr bool HasEccOpQueue = MegaKernelFlavor::HasEccOpQueue;
    static constexpr bool UsesEtaPowers = MegaKernelFlavor::UsesEtaPowers;
    static constexpr bool UsesBetaPowers = MegaKernelFlavor::UsesBetaPowers;

    using Relations = MegaKernelFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return MegaKernelFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaKernelFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t NUM_SUBRELATIONS = MegaKernelFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    class AllValues : public MegaKernelFlavor::AllEntities<FF> {
      public:
        using Base = MegaKernelFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   NativeFlavor::VerificationKey>;
    using WitnessCommitments = MegaKernelFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaKernelFlavor::CommitmentLabels;
    static const CommitmentLabels& commitment_labels() { return MegaKernelFlavor::commitment_labels(); }

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
