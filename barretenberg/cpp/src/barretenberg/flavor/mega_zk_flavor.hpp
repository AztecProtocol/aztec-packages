// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"

namespace bb {

/**
 * @brief ZK child of MegaFlavor_<BS> — adds ZK sumcheck, masking entities, and Libra commitments.
 * @details MegaZKFlavor_<1> is the individual-polynomial ZK Mega flavor (gemini_masking_poly).
 *          MegaZKFlavor_<4> is the interleaved ZK flavor (masking_chunk_0..3) for the hiding kernel.
 */
template <size_t BATCH_SIZE_ = 1> class MegaZKFlavor_ : public MegaFlavor_<BATCH_SIZE_> {
  public:
    using Base = MegaFlavor_<BATCH_SIZE_>;
    using typename Base::Commitment;
    using typename Base::Curve;
    using typename Base::FF;
    using typename Base::VerificationKey;

    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;
    static constexpr bool HasZK = true;
    // MegaZK never includes a standalone Gemini masking poly — the translator provides it in the batched flow.
    static constexpr bool HasGeminiMasking = false;
    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Base::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MegaZKFlavor_::BATCHED_RELATION_PARTIAL_LENGTH");

    // MegaZK has no masking entities in its layout (translator provides masking in the batched flow)
    static constexpr size_t NUM_MASKING_ENTITIES = 0;

    static constexpr size_t NUM_ALL_ENTITIES = Base::NUM_ALL_ENTITIES + NUM_MASKING_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = Base::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_ENTITIES;
    // For BS=1: no extra witness entity (masking is handled outside entity layout)
    // For BS>1: masking chunks flow through interleaved groups, not the individual witness list
    static constexpr size_t NUM_WITNESS_ENTITIES = Base::NUM_WITNESS_ENTITIES;

    // Override AllEntities to use ZK version (includes masking entities via MegaMaskingEntities_)
    template <typename DataType> using AllEntities = typename Base::template AllEntities_<DataType, false>;

    using AllValues = typename Base::template AllValues_<false>;
    using ProverPolynomials = typename Base::template ProverPolynomials_<false>;
    using PartiallyEvaluatedMultivariates = typename Base::template PartiallyEvaluatedMultivariates_<false>;
    using VerifierCommitments = typename Base::template VerifierCommitments_<Commitment, VerificationKey, false>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<Base::MAX_PARTIAL_RELATION_LENGTH>;

    // Interleaved types: for BS=1 these are empty types; for BS>1 they carry the ZK masking members
    template <typename DataType>
    using InterleavedWitnessCommitments = typename Base::template InterleavedWitnessCommitments_<DataType, false>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;
    using InterleavedCommitmentLabels = typename Base::template InterleavedCommitmentLabels_<false>;

    // No extra interleaved groups — masking is handled by the translator in the batched flow.
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = Base::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        Base::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;

    using Transcript = NativeTranscript;
    using VKAndHash = typename Base::VKAndHash;

    // BS=1: no gemini_masking_poly in entity layout, default shplemini_offset=1. BS>1: offset=1 (masking is
    // interleaved).
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        (BATCH_SIZE_ == 1)
            ? RepeatedCommitmentsData(Base::NUM_PRECOMPUTED_ENTITIES,
                                      Base::NUM_PRECOMPUTED_ENTITIES + Base::NUM_WITNESS_ENTITIES,
                                      Base::NUM_SHIFTED_ENTITIES)
            : RepeatedCommitmentsData(NUM_ALL_INTERLEAVED_COMMITMENTS - Base::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS,
                                      NUM_ALL_INTERLEAVED_COMMITMENTS,
                                      Base::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        if constexpr (BATCH_SIZE_ == 1) {
            // BS=1 ZK: use individual entity count (includes gemini_masking_poly)
            return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
        } else {
            // BS>1 ZK: use interleaved commitment count (includes masking group)
            const size_t pcs_log_n = log_n + Base::INTERLEAVING_LOG_K;
            return NUM_ALL_INTERLEAVED_COMMITMENTS + pcs_log_n + 2 + NUM_LIBRA_COMMITMENTS;
        }
    }

    // No group accessor overrides — MegaZK has no masking entities. Base class accessors are used directly.
};

using MegaZKFlavor = MegaZKFlavor_<1>;
using MultiMegaZKFlavor = MegaZKFlavor_<4>;

} // namespace bb
