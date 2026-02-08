// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MultiMegaFlavor with interleaved commitments.
 * @details This flavor is used to instantiate a recursive Mega Honk verifier for proofs created using
 * MultiMegaFlavor. Key differences from MegaRecursiveFlavor:
 *   - Handles 9 interleaved witness commitments (vs 24 individual)
 *   - Handles 8 interleaved precomputed commitments (vs 31 individual)
 *   - Verifier computes Lagrange basis for evaluation batching
 *   - +2 Gemini rounds (log(n)+2) due to interleaving (k=2)
 *
 * The recursive verifier:
 *   1. Receives individual polynomial evaluations from sumcheck
 *   2. Receives interleaving challenges (u₀, u₁) from transcript
 *   3. Computes Lagrange basis: Lⱼ(u₀, u₁) for j ∈ {0,1,2,3}
 *   4. Batches evaluations: F(u) = Σⱼ fⱼ(u) · Lⱼ(u₀, u₁)
 *   5. Verifies batched commitments via Shplemini with full challenge vector
 *
 * @note Curve types are stdlib types (e.g., field_t instead of FF) since this runs in-circuit.
 *       No Prover types are defined since we only verify in circuits.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit.
 */
template <typename BuilderType> class MultiMegaRecursiveFlavor_ : public MegaRecursiveFlavor_<BuilderType> {
  public:
    using CircuitBuilder = BuilderType;
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::Element;
    using NativeFlavor = MultiMegaFlavor;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    // Inherit interleaving parameters from native flavor
    static constexpr size_t INTERLEAVING_BATCH_SIZE = NativeFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = NativeFlavor::INTERLEAVING_LOG_K;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = NativeFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS =
        NativeFlavor::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NativeFlavor::NUM_UNSHIFTED_ENTITIES;

    static constexpr bool HasZK = false;

    // Labels are string-based and can be inherited directly from the native flavor
    using InterleavedCommitmentLabels = typename NativeFlavor::InterleavedCommitmentLabels;
    using CommitmentLabels = typename NativeFlavor::CommitmentLabels;
    static constexpr bool USE_PADDING = NativeFlavor::USE_PADDING;

    // BATCHED_RELATION_PARTIAL_LENGTH must match native flavor
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = BATCHED_RELATION_PARTIAL_LENGTH + 1;

    // Final PCS MSM size includes interleaved commitments
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    // Reuse native flavor's InterleavedWitnessCommitments template (works with any DataType including stdlib types)
    template <typename DataType>
    using InterleavedWitnessCommitments = NativeFlavor::InterleavedWitnessCommitments_<DataType, HasZK>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    // Reuse native flavor's InterleavedPrecomputedCommitments template (only accessed via get_all())
    template <typename DataType_>
    using InterleavedPrecomputedCommitments = NativeFlavor::InterleavedPrecomputedCommitments<DataType_>;
    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    // AllValues contains all polynomial evaluations received from the prover
    // Note: Individual polynomial evaluations, NOT batched (batching happens in verifier)
    class AllValues : public MegaFlavor::AllEntities_<FF, HasZK> {
      public:
        using Base = MegaFlavor::AllEntities_<FF, HasZK>;
        using Base::Base;
    };

    /**
     * @brief Verification key for recursive MultiMegaFlavor with interleaved precomputed commitments.
     * @details Contains 8 interleaved precomputed commitments instead of 31 individual ones.
     *          Uses StdlibVerificationKey_ (circuit-compatible) referencing the native
     * MultiMegaFlavor::VerificationKey.
     */
    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   InterleavedPrecomputedCommitments<Commitment>,
                                                   NativeFlavor::VerificationKey>;

    // VerifierCommitments includes interleaved commitments
    // The base VerifierCommitments_ handles individual polynomial commitments for relations,
    // but we also need to track interleaved commitments for PCS verification
    using VerifierCommitments = MegaFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = NativeFlavor::REPEATED_COMMITMENTS;

    // Forward static group methods to the native flavor (they work on any entity type with matching member names)
    template <typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        return NativeFlavor::get_unshifted_groups(e);
    }
    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        return NativeFlavor::get_to_be_shifted_groups(e);
    }
    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        return NativeFlavor::get_shifted_groups(e);
    }
};

} // namespace bb
