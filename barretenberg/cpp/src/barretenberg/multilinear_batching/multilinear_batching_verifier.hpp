// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/flavor/multi_mega_recursive_flavor.hpp"
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
 *
 * Accepts pre-batched instance evaluations and commitments from the HypernovaFoldingVerifier,
 * which handles the interleaved batching externally.
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

    explicit MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript);

    /**
     * @brief Verify proof
     */
    std::pair<bool, VerifierClaim> verify_proof(const FF& batched_unshifted_instance_eval,
                                                const FF& batched_shifted_instance_eval,
                                                const std::vector<Commitment>& unshifted_instance_commitments,
                                                const std::vector<Commitment>& shifted_instance_commitments,
                                                const std::vector<FF>& unshifted_challenges,
                                                const std::vector<FF>& shifted_challenges,
                                                const std::vector<FF>& instance_challenge);

  private:
    std::shared_ptr<Transcript> transcript;

    /**
     * @brief Compute the target sum for the batching sumcheck from pre-batched evaluations.
     */
    FF compute_new_target_sum(const FF& alpha,
                              const FF& batched_unshifted_instance_eval,
                              const FF& batched_shifted_instance_eval,
                              const FF& accumulator_non_shifted_evaluation,
                              const FF& accumulator_shifted_evaluation) const;

    /**
     * @brief Compute the new claim after the batching sumcheck from pre-batched commitments.
     */
    VerifierClaim compute_new_claim(const SumcheckOutput<Flavor>& sumcheck_result,
                                    const std::vector<Commitment>& unshifted_instance_commitments,
                                    const std::vector<Commitment>& shifted_instance_commitments,
                                    const std::vector<FF>& unshifted_challenges,
                                    const std::vector<FF>& shifted_challenges,
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
                              const std::vector<FF>& instance_challenges);
};

} // namespace bb
