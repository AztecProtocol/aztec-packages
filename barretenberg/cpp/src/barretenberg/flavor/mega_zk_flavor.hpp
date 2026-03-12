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

    // The degree has to be increased because the relation is multiplied by the Row Disabling Polynomial
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Base::BATCHED_RELATION_PARTIAL_LENGTH + 1;
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH,
                  "LIBRA_UNIVARIATES_LENGTH must be equal to MegaZKFlavor_::BATCHED_RELATION_PARTIAL_LENGTH");

    // Masking entity count: 1 (gemini_masking_poly) for BS=1, BS (masking_chunk_0..BS-1) for BS>1
    static constexpr size_t NUM_MASKING_ENTITIES = (BATCH_SIZE_ > 1) ? BATCH_SIZE_ : 1;

    static constexpr size_t NUM_ALL_ENTITIES = Base::NUM_ALL_ENTITIES + NUM_MASKING_ENTITIES;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = Base::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_ENTITIES;
    // For BS=1: gemini_masking_poly is counted as a witness entity
    // For BS>1: masking chunks flow through interleaved groups, not the individual witness list
    static constexpr size_t NUM_WITNESS_ENTITIES =
        (BATCH_SIZE_ == 1) ? (Base::NUM_WITNESS_ENTITIES + 1) : Base::NUM_WITNESS_ENTITIES;

    // Override AllEntities to use ZK version (includes masking entities via MegaMaskingEntities_)
    template <typename DataType> using AllEntities = typename Base::template AllEntities_<DataType, HasZK>;

    using AllValues = typename Base::template AllValues_<HasZK>;
    using ProverPolynomials = typename Base::template ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = typename Base::template PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = typename Base::template VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<Base::MAX_PARTIAL_RELATION_LENGTH>;

    // Interleaved types: for BS=1 these are empty types; for BS>1 they carry the ZK masking members
    template <typename DataType>
    using InterleavedWitnessCommitments = typename Base::template InterleavedWitnessCommitments_<DataType, HasZK>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;
    using InterleavedCommitmentLabels = typename Base::template InterleavedCommitmentLabels_<HasZK>;

    // For BS>1+ZK: +1 interleaved witness group for masking. For BS=1: stays 0.
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS =
        Base::NUM_INTERLEAVED_WITNESS_COMMITMENTS + ((BATCH_SIZE_ > 1) ? 1 : 0);
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        Base::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;

    using Transcript = NativeTranscript;
    using VKAndHash = typename Base::VKAndHash;

    // BS=1: repeated commitments optimization applies. BS>1: pre-batching eliminates it.
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        (BATCH_SIZE_ == 1) ? RepeatedCommitmentsData(Base::NUM_PRECOMPUTED_ENTITIES,
                                                     Base::NUM_PRECOMPUTED_ENTITIES + Base::NUM_WITNESS_ENTITIES,
                                                     Base::NUM_SHIFTED_ENTITIES,
                                                     2 /* SHPLEMINI_OFFSET: Shplonk:Q + Gemini:masking_poly_comm */)
                           : RepeatedCommitmentsData();

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        if constexpr (BATCH_SIZE_ == 1) {
            return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
        } else {
            const size_t pcs_log_n = log_n + Base::INTERLEAVING_LOG_K;
            return pcs_log_n + 4 + NUM_LIBRA_COMMITMENTS;
        }
    }

    // BS>1 ZK: override group accessors to include masking chunks before the shiftable groups
    template <typename Entities>
    static auto get_unshifted_groups(Entities& e)
        requires(BATCH_SIZE_ > 1)
    {
        auto groups = Base::get_unshifted_groups(e);
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        auto insert_pos = groups.end() - Base::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
        groups.insert(insert_pos,
                      Group{ &e.masking_chunk_0, &e.masking_chunk_1, &e.masking_chunk_2, &e.masking_chunk_3 });
        return groups;
    }

    template <typename Entities>
    static auto get_unshifted_groups_mut(Entities& e)
        requires(BATCH_SIZE_ > 1)
    {
        auto groups = Base::get_unshifted_groups_mut(e);
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T*>;
        auto insert_pos = groups.end() - Base::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
        groups.insert(insert_pos,
                      Group{ &e.masking_chunk_0, &e.masking_chunk_1, &e.masking_chunk_2, &e.masking_chunk_3 });
        return groups;
    }
};

using MegaZKFlavor = MegaZKFlavor_<1>;
using MultiMegaZKFlavor = MegaZKFlavor_<4>;

} // namespace bb
