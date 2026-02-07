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
#include "barretenberg/flavor/multi_mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief Recursive counterpart to MultiMegaZKFlavor with interleaved commitments and ZK.
 * @details This flavor is used to instantiate a recursive verifier for ZK proofs created using
 * MultiMegaZKFlavor (the hiding kernel in Chonk IVC).
 *
 * Combines:
 *   - Interleaved commitments (10 witness + 8 precomputed) from MultiMegaRecursiveFlavor
 *   - ZK sumcheck with masking chunks in AllEntities
 *   - Libra commitments for ZK verification
 *
 * Key properties:
 *   - HasZK = true
 *   - 4 masking chunk evaluations in AllEntities (masking_chunk_0..3)
 *   - 10 interleaved witness commitments (9 base + W₁₀ masking)
 *   - Receives 3 Libra commitments for ZK sumcheck
 *   - Batches evaluations using Lagrange basis (same as non-ZK MultiMega)
 *
 * @note This flavor is used if the hiding kernel proof needs to be verified in-circuit.
 *       Currently, hiding kernel is verified natively (on L1), so this may not be immediately needed.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit.
 */
template <typename BuilderType> class MultiMegaZKRecursiveFlavor_ : public MultiMegaRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = MultiMegaZKFlavor;
    using Commitment = typename MultiMegaRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename MultiMegaRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename MultiMegaRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;

    // Get constants from NativeFlavor to ensure consistency
    static constexpr size_t VIRTUAL_LOG_N = NativeFlavor::VIRTUAL_LOG_N;
    static constexpr size_t NUM_WITNESS_ENTITIES = NativeFlavor::NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NativeFlavor::NUM_ALL_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NativeFlavor::NUM_UNSHIFTED_ENTITIES;

    // Inherit interleaving parameters
    static constexpr size_t INTERLEAVING_BATCH_SIZE = NativeFlavor::INTERLEAVING_BATCH_SIZE;
    static constexpr size_t INTERLEAVING_LOG_K = NativeFlavor::INTERLEAVING_LOG_K;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = NativeFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS =
        NativeFlavor::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = NativeFlavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

    // BATCHED_RELATION_PARTIAL_LENGTH increased by 1 for ZK (multiplied by Row Disabling Polynomial)
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;

    // Final PCS MSM size for ZK with interleaving
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NativeFlavor::FINAL_PCS_MSM_SIZE(log_n);
    }

    // AllValues with 4 masking chunks (matching NativeFlavor::AllEntities layout)
    class AllValues : public NativeFlavor::template AllEntities<FF> {
      public:
        using Base = NativeFlavor::template AllEntities<FF>;
        using Base::Base;
    };

    // VerifierCommitments with 4 masking chunks
    class VerifierCommitments : public NativeFlavor::template AllEntities<Commitment> {
      public:
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key)
        {
            for (auto [comm, precomputed_comm] :
                 zip_view(MultiMegaFlavor::PrecomputedEntities<Commitment>::get_all(), verification_key->get_all())) {
                comm = precomputed_comm;
            }
        }
    };

    // Use ZK interleaved witness commitments from NativeFlavor (10 members)
    using InterleavedCommitments = typename MultiMegaFlavor::template InterleavedWitnessCommitments_<Commitment, true>;

    using InterleavedCommitmentLabels = typename NativeFlavor::InterleavedCommitmentLabels;

    // Inherit interleaved precomputed from base
    using InterleavedPrecomputed = typename MultiMegaRecursiveFlavor_<BuilderType>::InterleavedPrecomputed;

    // Override get_unshifted_groups to include masking group (18 groups instead of 17)
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
