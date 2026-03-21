#pragma once
#include "barretenberg/flavor/poseidon2_final_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

namespace bb {

/**
 * @brief Standalone prover for verifying deferred Poseidon2 hashes.
 *
 * @details Modeled after TranslatorProver. Bypasses the standard
 * ProverInstance/OinkProver/UltraProver pipeline entirely.
 * Takes a list of Poseidon2 operations from the op queue, builds
 * witness polynomials, runs Sumcheck, and produces a KZG proof.
 *
 * No permutation argument, no lookups, no grand products — just
 * the Poseidon2SingleRowRelation verified via Sumcheck + KZG.
 */
class Poseidon2FinalProver {
  public:
    using Flavor = Poseidon2FinalFlavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using ProvingKey = typename Flavor::ProvingKey;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using PCS = typename Flavor::PCS;
    using Transcript = typename Flavor::Transcript;

    explicit Poseidon2FinalProver(const std::vector<Poseidon2OpQueue::Poseidon2Op>& ops,
                                  const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    HonkProof construct_proof();
    HonkProof export_proof();

  private:
    void build_witness(const std::vector<Poseidon2OpQueue::Poseidon2Op>& ops);
    void execute_commitments_round();
    void execute_relation_check_rounds();
    void execute_pcs_rounds();

    std::shared_ptr<ProvingKey> key;
    std::shared_ptr<Transcript> transcript;
    CommitmentLabels commitment_labels;
    RelationParameters<FF> relation_parameters;
    SumcheckOutput<Flavor> sumcheck_output;
};

} // namespace bb
