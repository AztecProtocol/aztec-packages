#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief Prover for the batched MegaZK circuit + translator sumcheck and PCS.
 *
 * @details Runs the MegaZK circuit (MegaZK) and translator pre-sumcheck phases on a shared transcript,
 * then executes a single joint 17-round sumcheck and a single Shplemini/KZG reduction over both
 * circuits' polynomials. The joint round univariate is:
 *
 *   U_joint(x) = U_MZK(x) + α^{K_H} · U_translator(x)
 *
 * where K_H = MegaZKFlavor::NUM_SUBRELATIONS and α is drawn after all pre-sumcheck commitments.
 */
class BatchedHonkTranslatorProver {
  public:
    using FF = MegaZKFlavor::FF;
    using Curve = MegaZKFlavor::Curve;
    using MegaZKCommitmentKey = MegaZKFlavor::CommitmentKey;
    using MegaZKProverInstance = ProverInstance_<MegaZKFlavor>;
    using MegaZKVK = MegaZKFlavor::VerificationKey;
    using MegaZKProverRound = SumcheckProverRound<MegaZKFlavor>;
    using MegaZKPartialEvals = MegaZKFlavor::PartiallyEvaluatedMultivariates;
    using MegaZKSubrelationSeparators = std::array<FF, MegaZKFlavor::NUM_SUBRELATIONS - 1>;
    // Short-monomial round: runs the translator relation accumulation over length-2 edges. Produces an identical
    // round univariate (same BATCHED_RELATION_PARTIAL_LENGTH / NUM_SUBRELATIONS as TranslatorFlavor), so the joint
    // sumcheck, proof, and VK are unchanged. The partial-eval / AllValues types below stay on TranslatorFlavor since
    // TranslatorShortMonomialFlavor inherits them unchanged.
    using TransProverRound = SumcheckProverRound<TranslatorShortMonomialFlavor>;
    using TransPartialEvals = TranslatorFlavor::PartiallyEvaluatedMultivariates;
    using TransSubrelationSeparators = std::array<FF, TranslatorFlavor::NUM_SUBRELATIONS - 1>;
    using ZKData = ZKSumcheckData<MegaZKFlavor>;
    using Transcript = NativeTranscript;
    using SumcheckRoundUnivariate = bb::Univariate<FF, MegaZKFlavor::BATCHED_RELATION_PARTIAL_LENGTH>;

    // Translator log circuit size (= JOINT_LOG_N).
    static constexpr size_t JOINT_LOG_N = TranslatorFlavor::CONST_TRANSLATOR_LOG_N; // 17

    BatchedHonkTranslatorProver(std::shared_ptr<MegaZKProverInstance> mega_zk_instance,
                                std::shared_ptr<MegaZKVK> mega_zk_vk,
                                std::shared_ptr<Transcript> transcript);

    HonkProof prove_mega_zk_oink();
    HonkProof prove(std::shared_ptr<TranslatorProvingKey> translator_proving_key);

  private:
    std::shared_ptr<MegaZKProverInstance> mega_zk_inst;
    std::shared_ptr<MegaZKVK> mega_zk_vk;
    std::shared_ptr<TranslatorProvingKey> translator_key;
    std::shared_ptr<Transcript> transcript;

    // Translator relation parameters captured during execute_translator_oink()
    bb::RelationParameters<FF> translator_relation_parameters;

    // Sumcheck state accumulated during execute_joint_sumcheck_rounds()
    ZKData zk_sumcheck_data;
    std::vector<FF> joint_challenge;                 // (u_0, ..., u_16)
    MegaZKFlavor::AllValues mega_zk_claimed_evals;   // MegaZK circuit evaluations at joint challenge
    TranslatorFlavor::AllValues trans_claimed_evals; // translator evaluations at joint challenge
    FF claimed_libra_evaluation;

    // Committed sumcheck: round univariates in monomial basis and their evaluations at {0, 1, challenge}
    std::vector<Polynomial<FF>> round_univariates_list;
    std::vector<std::array<FF, 3>> round_evaluations_list;

    void execute_mega_zk_oink();
    void execute_translator_oink();
    void execute_joint_sumcheck_rounds();
    void execute_joint_pcs();
};

} // namespace bb
