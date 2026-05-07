// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

namespace bb {

/**
 * @brief Prover for multilinear batching - reduces two polynomial evaluation claims to one via sumcheck.
 *
 * @details Given two claims:
 *   - Accumulator: P_acc(r_acc) = v_acc with commitment [P_acc]
 *   - Instance: P_inst(r_inst) = v_inst with commitment [P_inst]
 *
 * The prover runs sumcheck on the relation:
 *   sum_x [ P_acc(x) * eq(x, r_acc) + P_inst(x) * eq(x, r_inst) ] = v_acc + v_inst
 *
 * This reduces both claims to evaluations at a new random point u. The output claim is:
 *   P_new(u) = v_new with [P_new] = [P_inst] + γ * [P_acc]
 *
 * where P_new = P_inst + γ * P_acc and γ is derived from the transcript.
 *
 * Usage:
 *   1. Construct with two claims (takes ownership via move)
 *   2. Call construct_proof() to run the protocol
 *   3. Call compute_new_claim() to get the batched output claim
 *
 * See also: chonk/README.md#batching-claims-into-accumulator
 */
class MultilinearBatchingProver {
  public:
    using Flavor = MultilinearBatchingFlavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using ProvingKey = typename Flavor::ProvingKey;
    using Transcript = typename Flavor::Transcript;

    /**
     * @brief Construct prover from two claims to be batched.
     * @param accumulator_claim The accumulated claim from previous folding rounds
     * @param instance_claim The new instance claim to batch with the accumulator
     * @param transcript Shared transcript for Fiat-Shamir
     */
    MultilinearBatchingProver(MultilinearBatchingProverClaim&& accumulator_claim,
                              MultilinearBatchingProverClaim&& instance_claim,
                              std::shared_ptr<Transcript> transcript);

    /**
     * @brief Execute sumcheck to reduce two evaluation claims to one at a random point u.
     */
    BB_PROFILE void execute_relation_check_rounds();

    /**
     * @brief Compute the batched output claim after sumcheck.
     * @details Combines claims: P_new = P_inst + γ * P_acc at the sumcheck challenge point u.
     * Polynomials are updated in place and moved to avoid allocation.
     */
    BB_PROFILE MultilinearBatchingProverClaim compute_new_claim();

    HonkProof export_proof();

    /**
     * @brief Construct a multilinear batching proof.
     * @details Call compute_new_claim() after to get the batched output claim.
     */
    HonkProof construct_proof();

    std::shared_ptr<Transcript> transcript;
    ProvingKey key;
    SumcheckOutput<Flavor> sumcheck_output;
};

} // namespace bb
