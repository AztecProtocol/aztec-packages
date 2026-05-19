// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to MegaZKFlavor.
 * @details Mirrors MegaRecursiveFlavor_ but references MegaZKFlavor (reduced relation set, fewer
 * entities) so that the in-circuit recursive verifier evaluates the *same* polynomials and
 * relations as the native prover. Runs with ZK Sumcheck (HasZK = true) and without a Gemini
 * masking polynomial.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class MegaZKRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MegaZKFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = MegaZKFlavor::VIRTUAL_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = MegaZKFlavor::USE_SHORT_MONOMIALS;
    // Recursive verifier for MegaZK runs ZK Sumcheck.
    static constexpr bool HasZK = true;
    static constexpr bool HasGeminiMasking = false;
    static constexpr bool USE_PADDING = MegaZKFlavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = MegaZKFlavor::NUM_WIRES;
    static constexpr size_t NUM_ALL_ENTITIES = MegaZKFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = MegaZKFlavor::NUM_PRECOMPUTED_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = MegaZKFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaZKFlavor::NUM_SHIFTED_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaZKFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr bool HasDataBus = MegaZKFlavor::HasDataBus;
    static constexpr size_t NUM_BUS_COLUMNS = MegaZKFlavor::NUM_BUS_COLUMNS;
    // Per-relation capability bools — must match MegaZKFlavor (reduced relation set).
    static constexpr bool HasLogDerivLookup = MegaZKFlavor::HasLogDerivLookup;
    static constexpr bool HasElliptic = MegaZKFlavor::HasElliptic;
    static constexpr bool HasMemory = MegaZKFlavor::HasMemory;
    static constexpr bool HasNonNativeField = MegaZKFlavor::HasNonNativeField;
    static constexpr bool HasEccOpQueue = MegaZKFlavor::HasEccOpQueue;
    static constexpr bool UsesEtaPowers = MegaZKFlavor::UsesEtaPowers;
    static constexpr bool UsesBetaPowers = MegaZKFlavor::UsesBetaPowers;

    // Reuse MegaZK's relation tuple (instantiated over the stdlib FF).
    using Relations = MegaZKFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // Match the native flavor's batched length so prover/verifier univariates agree.
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return MegaZKFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = MegaZKFlavor::REPEATED_COMMITMENTS;

    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = MegaZKFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    class AllValues : public MegaZKFlavor::AllEntities<FF> {
      public:
        using Base = MegaZKFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    using WitnessCommitments = MegaZKFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = MegaZKFlavor::CommitmentLabels;
    static const CommitmentLabels& commitment_labels() { return MegaZKFlavor::commitment_labels(); }

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb
