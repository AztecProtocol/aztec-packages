// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

/**
 * @brief ZK child of UltraFlavor_<BS> — adds ZK sumcheck, masking entities, and Libra commitments.
 * @details UltraZKFlavor_<1> is the individual-polynomial ZK Ultra flavor (gemini_masking_poly).
 *          UltraZKFlavor_<2> is the interleaved ZK flavor (no masking entities; masking provided
 *          externally in the batched flow, like MegaZKFlavor).
 */
template <size_t BATCH_SIZE_ = 1> class UltraZKFlavor_ : public UltraFlavor_<BATCH_SIZE_> {
  public:
    using Base = UltraFlavor_<BATCH_SIZE_>;
    using typename Base::Commitment;
    using typename Base::Curve;
    using typename Base::FF;
    using typename Base::VerificationKey;

    static constexpr size_t VIRTUAL_LOG_N = CONST_PROOF_SIZE_LOG_N;
    static constexpr bool HasZK = true;
    // BS=1: standalone UltraZK includes Gemini masking poly. BS>1: masking provided externally.
    static constexpr bool HasGeminiMasking = (BATCH_SIZE_ == 1);
    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Base::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to UltraZKFlavor_::BATCHED_RELATION_PARTIAL_LENGTH");

    // BS=1: 1 masking entity (gemini_masking_poly). BS>1: 0 (masking handled externally).
    static constexpr size_t NUM_MASKING_ENTITIES = HasGeminiMasking ? 1 : 0;

    static constexpr size_t NUM_ALL_ENTITIES = Base::NUM_ALL_ENTITIES + NUM_MASKING_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = Base::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_ENTITIES;
    static constexpr size_t NUM_WITNESS_ENTITIES = Base::NUM_WITNESS_ENTITIES + NUM_MASKING_ENTITIES;

    // Override AllEntities: BS=1 uses HasZK=true (includes masking poly), BS>1 uses false (no masking entities)
    template <typename DataType> using AllEntities = typename Base::template AllEntities_<DataType, HasGeminiMasking>;

    using AllValues = typename Base::template AllValues_<HasGeminiMasking>;
    using ProverPolynomials = typename Base::template ProverPolynomials_<HasGeminiMasking>;
    using PartiallyEvaluatedMultivariates = typename Base::template PartiallyEvaluatedMultivariates_<HasGeminiMasking>;
    using VerifierCommitments =
        typename Base::template VerifierCommitments_<Commitment, VerificationKey, HasGeminiMasking>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<Base::MAX_PARTIAL_RELATION_LENGTH>;

    // Interleaved types: for BS=1 these are empty; for BS>1 they carry the same structure as non-ZK
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = Base::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        Base::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;

    using Transcript = NativeTranscript;
    using VKAndHash = typename Base::VKAndHash;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        (BATCH_SIZE_ == 1)
            ? RepeatedCommitmentsData(Base::NUM_PRECOMPUTED_ENTITIES,
                                      Base::NUM_PRECOMPUTED_ENTITIES + Base::NUM_WITNESS_ENTITIES,
                                      Base::NUM_SHIFTED_ENTITIES,
                                      /*shplemini_offset=*/2) // Shplonk:Q + Gemini:masking_poly_comm
            : RepeatedCommitmentsData(NUM_ALL_INTERLEAVED_COMMITMENTS - Base::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS,
                                      NUM_ALL_INTERLEAVED_COMMITMENTS,
                                      Base::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        if constexpr (BATCH_SIZE_ == 1) {
            return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
        } else {
            const size_t pcs_log_n = log_n + Base::INTERLEAVING_LOG_K;
            return NUM_ALL_INTERLEAVED_COMMITMENTS + pcs_log_n + 2 + NUM_LIBRA_COMMITMENTS;
        }
    }
};

using UltraZKFlavor = UltraZKFlavor_<1>;
using DualUltraZKFlavor = UltraZKFlavor_<2>;

} // namespace bb
