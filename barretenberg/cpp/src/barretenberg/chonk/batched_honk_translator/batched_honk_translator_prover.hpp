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
 * @brief Prover for the batched hiding kernel + translator sumcheck and PCS.
 *
 * @details Runs the hiding kernel (MegaZK) and translator pre-sumcheck phases on a shared transcript,
 * then executes a single joint 17-round sumcheck and a single Shplemini/KZG reduction over both
 * circuits' polynomials. The joint round univariate is:
 *
 *   U_joint(x) = U_hiding(x) + α^{K_H} · U_translator(x)
 *
 * where K_H = MegaZKFlavor::NUM_SUBRELATIONS and α is drawn after all pre-sumcheck commitments.
 *
 * The hiding kernel is treated as a 2^17 circuit via its RowDisablingPolynomial (padding_indicator
 * = [1]*16 + [0]), so its contribution to round 16 is zero by construction.
 */
class BatchedHonkTranslatorProver {
  public:
    using HidingFlavor = MegaZKFlavor;
    using HidingFF = HidingFlavor::FF;
    using HidingCurve = HidingFlavor::Curve;
    using HidingCommitmentKey = HidingFlavor::CommitmentKey;
    using HidingProverInstance = ProverInstance_<HidingFlavor>;
    using HidingVK = HidingFlavor::VerificationKey;
    using HidingProverRound = SumcheckProverRound<HidingFlavor>;
    using HidingPartialEvals = HidingFlavor::PartiallyEvaluatedMultivariates;
    using HidingSubrelationSeparators = std::array<HidingFF, HidingFlavor::NUM_SUBRELATIONS - 1>;
    using TransProverRound = SumcheckProverRound<TranslatorFlavor>;
    using TransPartialEvals = TranslatorFlavor::PartiallyEvaluatedMultivariates;
    using TransSubrelationSeparators = std::array<HidingFF, TranslatorFlavor::NUM_SUBRELATIONS - 1>;
    using ZKData = ZKSumcheckData<HidingFlavor>;
    using Transcript = NativeTranscript;
    using SumcheckRoundUnivariate = bb::Univariate<HidingFF, HidingFlavor::BATCHED_RELATION_PARTIAL_LENGTH>;

    // Translator log circuit size (= JOINT_LOG_N).
    static constexpr size_t JOINT_LOG_N = TranslatorFlavor::CONST_TRANSLATOR_LOG_N; // 17

    /**
     * @brief Proof output from the batched prover.
     * @details The verifier expects two separate proof segments:
     *   - hiding_proof: Oink (pre-sumcheck) data for the hiding kernel.
     *   - translator_and_joint_proof: Translator pre-sumcheck data + joint sumcheck + joint PCS.
     * These are produced by calling transcript->export_proof() after each phase.
     */
    struct Proof {
        HonkProof hiding_proof;               ///< Oink proof of the hiding kernel
        HonkProof translator_and_joint_proof; ///< Translator pre-sumcheck + joint sumcheck + PCS
    };

    BatchedHonkTranslatorProver(std::shared_ptr<HidingProverInstance> hiding_prover_instance,
                                std::shared_ptr<HidingVK> hiding_vk,
                                std::shared_ptr<TranslatorProvingKey> translator_key,
                                std::shared_ptr<Transcript> transcript);

    Proof construct_proof();

  private:
    std::shared_ptr<HidingProverInstance> hiding_prover_inst;
    std::shared_ptr<HidingVK> hiding_vk;
    std::shared_ptr<TranslatorProvingKey> translator_key;
    std::shared_ptr<Transcript> transcript;

    // Prover state populated during construction
    bb::RelationParameters<HidingFF> translator_relation_parameters;

    // Sumcheck state accumulated during execute_joint_sumcheck_rounds()
    ZKData zk_sumcheck_data;
    std::vector<HidingFF> joint_challenge;           // (u_0, ..., u_16)
    HidingFlavor::AllValues hiding_claimed_evals;    // hiding kernel evaluations at joint challenge
    TranslatorFlavor::AllValues trans_claimed_evals; // translator evaluations at joint challenge
    HidingFF claimed_libra_evaluation;

    void execute_hiding_kernel_oink();
    void execute_translator_pre_sumcheck();
    void execute_joint_sumcheck_rounds();
    void execute_joint_pcs();
};

} // namespace bb
