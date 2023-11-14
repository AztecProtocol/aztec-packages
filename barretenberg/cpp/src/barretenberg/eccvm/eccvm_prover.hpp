#pragma once
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/flavor/ecc_vm.hpp"
#include "barretenberg/goblin/translation_consistency_data.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace proof_system::honk {

// We won't compile this class with honk::flavor::Standard, but we will like want to compile it (at least for testing)
// with a flavor that uses the curve Grumpkin, or a flavor that does/does not have zk, etc.
template <ECCVMFlavor Flavor> class ECCVMProver_ {

    using FF = typename Flavor::FF;
    using PCS = typename Flavor::PCS;
    using PCSCommitmentKey = typename Flavor::CommitmentKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using Polynomial = typename Flavor::Polynomial;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using ClaimedEvaluations = typename Flavor::AllValues;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using Curve = typename Flavor::Curve;
    using Transcript = typename Flavor::Transcript;
    using GoblinTranslationConsistencyData = barretenberg::GoblinTranslationConsistencyData;

  public:
    explicit ECCVMProver_(std::shared_ptr<ProvingKey> input_key, std::shared_ptr<PCSCommitmentKey> commitment_key);

    void execute_preamble_round();
    void execute_wire_commitments_round();
    void execute_log_derivative_commitments_round();
    void execute_grand_product_computation_round();
    void execute_relation_check_rounds();
    void execute_univariatization_round();
    void execute_pcs_evaluation_round();
    void execute_batched_univariatization_shplonk_batched_quotient_round();
    void execute_batched_univariatization_shplonk_partial_evaluation_round();
    void execute_batched_univariatization_ipa_round();
    void execute_translation_consistency_check_shplonk_batched_quotient_round();
    void execute_translation_consistency_check_shplonk_partial_evaluation_round();
    void execute_translation_consistency_check_ipa_round();

    plonk::proof& export_proof();
    plonk::proof& construct_proof();

    Transcript transcript;

    GoblinTranslationConsistencyData translation_consistency_data;

    std::vector<FF> public_inputs;

    proof_system::RelationParameters<FF> relation_parameters;

    std::shared_ptr<ProvingKey> key;

    FF evaluation_challenge_x;

    // Container for spans of all polynomials required by the prover (i.e. all multivariates evaluated by Sumcheck).
    ProverPolynomials prover_polynomials;

    CommitmentLabels commitment_labels;

    // Container for d + 1 Fold polynomials produced by Gemini
    std::vector<Polynomial> gemini_polynomials;

    Polynomial batched_univariatization_batched_quotient_Q;      // batched quotient poly computed by Shplonk
    Polynomial translation_consistency_check_batched_quotient_Q; // batched quotient poly computed by Shplonk
    FF nu_challenge;                                             // needed in both Shplonk rounds

    Polynomial quotient_W;

    sumcheck::SumcheckOutput<Flavor> sumcheck_output;
    pcs::gemini::ProverOutput<Curve> gemini_output;
    pcs::gemini::ProverOutput<Curve> translation_consistency_check_data; // WORKTODO: move this struct
    pcs::shplonk::ProverOutput<Curve> batched_univariatization_shplonk_output;
    pcs::shplonk::ProverOutput<Curve> translation_consistency_check_shplonk_output;
    std::shared_ptr<PCSCommitmentKey> commitment_key;

    using Gemini = pcs::gemini::GeminiProver_<Curve>;
    using Shplonk = pcs::shplonk::ShplonkProver_<Curve>;

  private:
    plonk::proof proof;
};

extern template class ECCVMProver_<honk::flavor::ECCVM>;

} // namespace proof_system::honk
