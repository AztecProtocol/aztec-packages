// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_proving_key.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

namespace bb {
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

    // explicit MultilinearBatchingProver(const std::shared_ptr<MultilinearBatchingProvingKey>& key,
    //                                    const std::shared_ptr<Transcript>& transcript);
    explicit MultilinearBatchingProver(const std::shared_ptr<MultilinearBatchingProverClaim>& accumulator_claim,
                                       const std::shared_ptr<MultilinearBatchingProverClaim>& instance_claim,
                                       const std::shared_ptr<Transcript>& transcript);

    BB_PROFILE void execute_commitments_round();
    BB_PROFILE void execute_challenges_and_evaluations_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void compute_new_claim();
    HonkProof export_proof();
    HonkProof construct_proof();

    MultilinearBatchingProverClaim get_new_claim() { return new_claim; };

    std::shared_ptr<Transcript> transcript;

    std::shared_ptr<MultilinearBatchingProvingKey> key;

    MultilinearBatchingProverClaim new_claim;

    SumcheckOutput<Flavor> sumcheck_output;
    RelationParameters<FF> relation_parameters;
};

} // namespace bb
