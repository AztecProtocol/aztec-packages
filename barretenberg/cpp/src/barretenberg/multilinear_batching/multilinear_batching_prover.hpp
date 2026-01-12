// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

namespace bb {

/**
 * @brief Multilinear batching prover. Reduces evaluation claims at different points to a single claim via sumcheck.
 * @details See: chonk/README.md#batching-claims-into-accumulator
 *
 * The prover takes ownership of accumulator and instance claims, constructing its internal ProvingKey.
 * Lifecycle:
 *   1. Prover constructed with claims (moved in, now owned by prover's key)
 *   2. Prover runs sumcheck on the key
 *   3. New claim computed from key + sumcheck output
 */
class MultilinearBatchingProver {
  public:
    using Flavor = MultilinearBatchingFlavor;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using PCS = typename Flavor::PCS;
    using Transcript = typename Flavor::Transcript;

    MultilinearBatchingProver(MultilinearBatchingProverClaim&& accumulator_claim,
                              MultilinearBatchingProverClaim&& instance_claim,
                              std::shared_ptr<Transcript> transcript);

    BB_PROFILE void execute_commitments_round();
    BB_PROFILE void execute_challenges_and_evaluations_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE MultilinearBatchingProverClaim compute_new_claim();
    HonkProof export_proof();
    HonkProof construct_proof();

    std::shared_ptr<Transcript> transcript;
    ProvingKey key; // Owned proving key constructed from moved-in claims
    SumcheckOutput<Flavor> sumcheck_output;
};

} // namespace bb
