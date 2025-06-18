// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

namespace bb {

template <IsUltraOrMegaHonk Flavor> class DeciderProver_ {
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
    using ZKData = ZKSumcheckData<Flavor>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<Flavor>;

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

    ZKData zk_sumcheck_data;

    SumcheckOutput<Flavor> sumcheck_output;

  private:
    HonkProof proof;
};

using UltraDeciderProver = DeciderProver_<UltraFlavor>;
using MegaDeciderProver = DeciderProver_<MegaFlavor>;
using MegaZKDeciderProver = DeciderProver_<MegaZKFlavor>;

} // namespace bb
