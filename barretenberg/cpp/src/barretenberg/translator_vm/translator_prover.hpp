#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_proving_key.hpp"

namespace bb {

// We won't compile this class with Standard, but we will like want to compile it (at least for testing)
// with a flavor that uses the curve Grumpkin, or a flavor that does/does not have zk, etc.
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
    static constexpr size_t MINIMUM_MINI_CIRCUIT_SIZE = 2048;
    size_t total_num_gates = 0;          // num_gates (already include zero row offset) (used to compute dyadic size)
    size_t dyadic_circuit_size = 0;      // final power-of-2 circuit size
    size_t mini_circuit_dyadic_size = 0; // The size of the small circuit that contains non-range constraint relations

    explicit TranslatorProver(const std::shared_ptr<TranslatorProvingKey>& key,
                              const std::shared_ptr<Transcript>& transcript);

    BB_PROFILE void execute_preamble_round();
    BB_PROFILE void execute_wire_and_sorted_constraints_commitments_round();
    BB_PROFILE void execute_grand_product_computation_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void execute_pcs_rounds();
    HonkProof export_proof();
    HonkProof construct_proof();

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    std::shared_ptr<TranslatorProvingKey> key;

    CommitmentLabels commitment_labels;

    std::shared_ptr<ZKData> zk_sumcheck_data;

    SumcheckOutput<Flavor> sumcheck_output;

  private:
    HonkProof proof;
};

} // namespace bb
