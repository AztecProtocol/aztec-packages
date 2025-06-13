// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"

namespace bb {
class TranslatorProver {
  public:
    using Flavor = TranslatorFlavor;
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using PCS = typename Flavor::PCS;
    using Transcript = typename Flavor::Transcript;
    using ZKData = ZKSumcheckData<Flavor>;

    explicit TranslatorProver(const std::shared_ptr<TranslatorProvingKey>& key,
                              const std::shared_ptr<Transcript>& transcript);

    BB_PROFILE void execute_preamble_round();
    BB_PROFILE void execute_wire_and_sorted_constraints_commitments_round();
    BB_PROFILE void execute_grand_product_computation_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void execute_pcs_rounds();
    void commit_to_witness_polynomial(Polynomial& polynomial, const std::string& label);
    HonkProof export_proof();
    HonkProof construct_proof();

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    std::shared_ptr<TranslatorProvingKey> key;

    CommitmentLabels commitment_labels;

    ZKData zk_sumcheck_data;

    SumcheckOutput<Flavor> sumcheck_output;

  private:
    HonkProof proof;
};

} // namespace bb
