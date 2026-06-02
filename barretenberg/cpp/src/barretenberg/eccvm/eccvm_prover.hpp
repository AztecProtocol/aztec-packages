// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_short_monomial_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// The prover always runs sumcheck with the short-monomial flavor (faster sumcheck).
class ECCVMProver {
  public:
    using Flavor = ECCVMFlavor;
    using FF = Flavor::FF;
    using BF = Flavor::BF;
    using Commitment = Flavor::Commitment;
    using CommitmentKey = Flavor::CommitmentKey;
    using ProvingKey = Flavor::ProvingKey;
    using Polynomial = Flavor::Polynomial;
    using CommitmentLabels = Flavor::CommitmentLabels;
    using Transcript = Flavor::Transcript;
    using TranslationEvaluations = bb::TranslationEvaluations_<FF>;
    using CircuitBuilder = Flavor::CircuitBuilder;
    using ZKData = ZKSumcheckData<Flavor>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<Flavor>;
    using OpeningClaim = ProverOpeningClaim<Flavor::Curve>;
    using Proof = HonkProof;

    explicit ECCVMProver(CircuitBuilder& builder, const std::shared_ptr<Transcript>& transcript);

    BB_PROFILE void execute_preamble_round();
    BB_PROFILE void execute_wire_commitments_round();
    BB_PROFILE void execute_log_derivative_commitments_round();
    BB_PROFILE void execute_grand_product_computation_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void execute_pcs_rounds();
    BB_PROFILE void execute_transcript_consistency_univariate_opening_round();

    Proof export_proof();
    std::pair<Proof, OpeningClaim> construct_proof();
    void compute_translation_opening_claims();
    std::shared_ptr<Transcript> transcript;

    // The batch opening claim to be verified via IPA
    OpeningClaim batch_opening_claim;

    // Final ShplonkProver consumes an array consisting of Translation Opening Claims and a
    // `multivariate_to_univariate_opening_claim`
    static constexpr size_t NUM_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS + 1;
    std::array<OpeningClaim, NUM_OPENING_CLAIMS> opening_claims;

    TranslationEvaluations translation_evaluations;

    std::vector<FF> public_inputs;

    bb::RelationParameters<FF> relation_parameters;

    std::shared_ptr<ProvingKey> key;

    CommitmentLabels commitment_labels;
    ZKData zk_sumcheck_data;

    FF evaluation_challenge_x;
    FF batching_challenge_v;

    SumcheckOutput<Flavor> sumcheck_output;
};

} // namespace bb
