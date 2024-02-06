#pragma once
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <IsUltraFlavor Flavor> class UltraProver_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using Curve = typename Flavor::Curve;
    using Instance = ProverInstance_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    explicit UltraProver_(const std::shared_ptr<Instance>&,
                          const std::shared_ptr<CommitmentKey>&,
                          const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    BBERG_PROFILE void execute_preamble_round();
    BBERG_PROFILE void execute_wire_commitments_round();
    BBERG_PROFILE void execute_sorted_list_accumulator_round();
    BBERG_PROFILE void execute_log_derivative_inverse_round();
    BBERG_PROFILE void execute_grand_product_computation_round();
    BBERG_PROFILE void execute_relation_check_rounds();
    BBERG_PROFILE void execute_zeromorph_rounds();

    HonkProof& export_proof();
    HonkProof& construct_proof();

    std::shared_ptr<Instance> instance;

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    CommitmentLabels commitment_labels;

    Polynomial quotient_W;

    SumcheckOutput<Flavor> sumcheck_output;

    std::shared_ptr<CommitmentKey> commitment_key;

    using ZeroMorph = ZeroMorphProver_<Curve>;

  private:
    HonkProof proof;
};

using UltraProver = UltraProver_<UltraFlavor>;
using GoblinUltraProver = UltraProver_<GoblinUltraFlavor>;

} // namespace bb
