#pragma once
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb {

template <IsUltraFlavor Flavor> class DeciderProver_ {
    using FF = typename Flavor::FF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using PCS = typename Flavor::PCS;
    using DeciderPK = DeciderProvingKey_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    explicit DeciderProver_(const std::shared_ptr<DeciderPK>&,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());

    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void execute_pcs_rounds();

    HonkProof export_proof();
    HonkProof construct_proof();

    std::shared_ptr<DeciderPK> proving_key;

    std::shared_ptr<Transcript> transcript;

    bb::RelationParameters<FF> relation_parameters;

    CommitmentLabels commitment_labels;

    Polynomial quotient_W;

    ZKSumcheckData<Flavor> zk_sumcheck_data;

    SumcheckOutput<Flavor> sumcheck_output;

  private:
    HonkProof proof;
};

using UltraDeciderProver = DeciderProver_<UltraFlavor>;
using MegaDeciderProver = DeciderProver_<MegaFlavor>;
using MegaZKDeciderProver = DeciderProver_<MegaZKFlavor>;

} // namespace bb
