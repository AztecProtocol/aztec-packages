// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// We won't compile this class with Standard, but we will like want to compile it (at least for testing)
// with a flavor that uses the curve Grumpkin, or a flavor that does/does not have zk, etc.
class ECCVMProver {
  public:
    using Flavor = ECCVMFlavor;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using PCS = typename Flavor::PCS;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using Transcript = typename Flavor::Transcript;
    using TranslationEvaluations = bb::TranslationEvaluations_<FF>;
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using ZKData = ZKSumcheckData<Flavor>;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<Flavor>;
    using OpeningClaim = ProverOpeningClaim<typename Flavor::Curve>;

    explicit ECCVMProver(CircuitBuilder& builder,
                         const std::shared_ptr<Transcript>& transcript,
                         const std::shared_ptr<Transcript>& ipa_transcript = std::make_shared<Transcript>());

    BB_PROFILE void execute_wire_commitments_round();
    BB_PROFILE void execute_log_derivative_commitments_round();
    BB_PROFILE void execute_grand_product_computation_round();
    BB_PROFILE void execute_relation_check_rounds();
    BB_PROFILE void execute_pcs_rounds();
    BB_PROFILE void execute_transcript_consistency_univariate_opening_round();

    ECCVMProof export_proof();
    ECCVMProof construct_proof();
    void compute_translation_opening_claims();
    void commit_to_witness_polynomial(Polynomial& polynomial,
                                      const std::string& label,
                                      CommitmentKey::CommitType commit_type = CommitmentKey::CommitType::Default,
                                      const std::vector<std::pair<size_t, size_t>>& active_ranges = {});

    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript;

    size_t unmasked_witness_size;

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
