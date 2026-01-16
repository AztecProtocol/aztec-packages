// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

#include <vector>

namespace bb {

/**
 * @brief Multilinear batching verifier. Verifies claim reduction via sumcheck.
 * @details See: chonk/README.md#batching-claims-into-accumulator
 */
template <typename Flavor_> class MultilinearBatchingVerifier {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using Curve = typename Flavor::Curve;
    using Transcript = typename Flavor::Transcript;

    using Commitment = typename Flavor::Commitment;
    using Sumcheck = SumcheckVerifier<Flavor>;
    using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;
    using Proof = std::vector<FF>;

    using InstanceFlavor = std::conditional_t<std::is_same_v<Flavor, MultilinearBatchingFlavor>,
                                              MegaFlavor,
                                              MegaRecursiveFlavor_<MegaCircuitBuilder>>;
    using InstanceCommitments = InstanceFlavor::VerifierCommitments;
    using InstanceFF = InstanceFlavor::FF;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;

    explicit MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript);

    std::pair<bool, VerifierClaim> verify_proof(SumcheckOutput<InstanceFlavor>& instance_sumcheck,
                                                InstanceCommitments& verifier_commitments,
                                                const std::vector<InstanceFF>& unshifted_challenges,
                                                const std::vector<InstanceFF>& shifted_challenges);

  private:
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierClaim> accumulator_claim;
    std::shared_ptr<VerifierClaim> instance_claim;

    /**
     * @brief Utility to compute the new target sum for the batching sumcheck.
     */
    FF compute_new_target_sum(const FF& alpha,
                              SumcheckOutput<InstanceFlavor>& instance_sumcheck,
                              const std::vector<InstanceFF>& unshifted_challenges,
                              const std::vector<InstanceFF>& shifted_challenges,
                              const FF& accumulator_non_shifted_evaluation,
                              const FF& accumulator_shifted_evaluation) const;

    /**
     * @brief Compute: Σ(commitments[i] * scalars[i]) + accumulator_commitment * batching_challenge
     */
    template <size_t N>
    Commitment batch_instance_commitments_with_accumulator(RefArray<Commitment, N> instance_commitments,
                                                           const std::vector<FF>& instance_batching_scalars,
                                                           const Commitment& accumulator_commitment,
                                                           const FF& batching_challenge);

    /**
     * @brief Utility to compute the new claim after the batching sumcheck.
     */
    VerifierClaim compute_new_claim(const SumcheckOutput<Flavor>& sumcheck_result,
                                    InstanceCommitments& verifier_commitments,
                                    const std::vector<InstanceFF>& unshifted_challenges,
                                    const std::vector<InstanceFF>& shifted_challenges,
                                    const Commitment& non_shifted_accumulator_commitment,
                                    const Commitment& shifted_accumulator_commitment,
                                    const FF& batching_challenge);

    /**
     * @brief Verify that the prover used the correct eq polynomials.
     * @details The batching relation uses eq(r_acc, u) and eq(r_inst, u) to "select" the correct evaluation point.
     * The prover provides these as evaluations of witness polynomials, but the verifier can compute them directly from
     * the known challenges. This check ensures consistency.
     */
    bool check_eq_consistency(const SumcheckOutput<Flavor>& sumcheck_result,
                              const std::vector<FF>& accumulator_challenges,
                              const std::vector<InstanceFF>& instance_challenges);
};

} // namespace bb
