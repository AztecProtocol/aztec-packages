#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/mega_v2_flavor.hpp"

namespace bb {

/**
 * @brief Child class of MegaV2Flavor that runs with ZK Sumcheck.
 *
 * @details Used for the Hiding Kernel in ChonkV2 IVC. Follows the same pattern
 * as MegaZKFlavor extends MegaFlavor.
 */
class MegaV2ZKFlavor : public bb::MegaV2Flavor {
  public:
    static constexpr size_t VIRTUAL_LOG_N = HIDING_KERNEL_LOG_N;
    static constexpr bool HasZK = true;
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MegaV2Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1;

    template <typename DataType> using AllEntities = MegaV2Flavor::AllEntities_<DataType, HasZK>;

    static constexpr size_t NUM_WITNESS_ENTITIES = MegaV2Flavor::NUM_WITNESS_ENTITIES + NUM_MASKING_POLYNOMIALS;
    static constexpr size_t NUM_ALL_ENTITIES = MegaV2Flavor::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaV2Flavor::NUM_UNSHIFTED_ENTITIES + NUM_MASKING_POLYNOMIALS;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = MegaV2Flavor::VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
    }

    using AllValues = MegaV2Flavor::AllValues_<HasZK>;
    using ProverPolynomials = MegaV2Flavor::ProverPolynomials_<HasZK>;
    using PartiallyEvaluatedMultivariates = MegaV2Flavor::PartiallyEvaluatedMultivariates_<HasZK>;
    using VerifierCommitments = MegaV2Flavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    using Transcript = NativeTranscript;
    using VKAndHash = MegaV2Flavor::VKAndHash;
};

} // namespace bb
