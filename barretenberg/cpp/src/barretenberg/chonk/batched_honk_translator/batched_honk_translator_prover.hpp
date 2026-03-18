#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
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
 *
 * The MegaZK circuit is treated as a 2^17 circuit via its RowDisablingPolynomial (padding_indicator
 * = [1]*16 + [0]), so its contribution to round 16 is zero by construction.
 */
template <typename MegaFlavor, size_t MegaLogN> class BatchedHonkTranslatorProver {
  public:
    using FF = MegaFlavor::FF;
    using Curve = MegaFlavor::Curve;
    using MegaCommitmentKey = MegaFlavor::CommitmentKey;
    using MegaProverInstance = ProverInstance_<MegaFlavor>;
    using MegaVK = MegaFlavor::VerificationKey;
    using MegaProverRound = SumcheckProverRound<MegaFlavor>;
    using MegaPartialEvals = MegaFlavor::PartiallyEvaluatedMultivariates;
    using MegaSubrelationSeparators = std::array<FF, MegaFlavor::NUM_SUBRELATIONS - 1>;
    using TransProverRound = SumcheckProverRound<TranslatorFlavor>;
    using TransPartialEvals = TranslatorFlavor::PartiallyEvaluatedMultivariates;
    using TransSubrelationSeparators = std::array<FF, TranslatorFlavor::NUM_SUBRELATIONS - 1>;
    using ZKData = ZKSumcheckData<MegaFlavor>;
    using Transcript = NativeTranscript;

    static constexpr bool COMMITTED_SUMCHECK = MegaFlavor::HasZK;

    static constexpr size_t MAX_BATCHED_RELATION_PARTIAL_LENGTH =
        std::max(MegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH, TranslatorFlavor::BATCHED_RELATION_PARTIAL_LENGTH);
    using SumcheckRoundUnivariate = bb::Univariate<FF, MAX_BATCHED_RELATION_PARTIAL_LENGTH>;

    // Use committed sumcheck infrastructure: commits to round univariates and stores them for Shplemini.
    static constexpr bool IS_MEGA_LENGTH_SMALLER =
        MegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH < TranslatorFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    using RoundUnivariateHandlerType =
        std::conditional_t<IS_MEGA_LENGTH_SMALLER,
                           RoundUnivariateHandler<TranslatorFlavor, /*CommittedSumcheck=*/COMMITTED_SUMCHECK>,
                           RoundUnivariateHandler<MegaFlavor, /*CommittedSumcheck=*/COMMITTED_SUMCHECK>>;

    static constexpr size_t MEGA_LOG_N = MegaLogN;
    static constexpr bool IS_MEGA_SMALLER = MEGA_LOG_N <= TranslatorFlavor::CONST_TRANSLATOR_LOG_N;
    static constexpr size_t MIN_LOG_N = std::min(MEGA_LOG_N, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);
    static constexpr size_t JOINT_LOG_N = std::max(MEGA_LOG_N, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    BatchedHonkTranslatorProver(std::shared_ptr<MegaProverInstance> mega_instance,
                                std::shared_ptr<MegaVK> mega_vk,
                                std::shared_ptr<Transcript> transcript);

    HonkProof prove_mega_oink();
    HonkProof prove(std::shared_ptr<TranslatorProvingKey> translator_proving_key);

  private:
    std::shared_ptr<MegaProverInstance> mega_instance;
    std::shared_ptr<MegaVK> mega_vk;
    std::shared_ptr<TranslatorProvingKey> translator_key;
    std::shared_ptr<Transcript> transcript;

    // Translator relation parameters captured during execute_translator_oink()
    bb::RelationParameters<FF> translator_relation_parameters;

    // Sumcheck state accumulated during execute_joint_sumcheck_rounds()
    ZKData zk_sumcheck_data;
    std::vector<FF> joint_challenge;                 // (u_0, ..., u_16)
    MegaFlavor::AllValues mega_claimed_evals;        // Mega circuit evaluations at joint challenge
    TranslatorFlavor::AllValues trans_claimed_evals; // translator evaluations at joint challenge
    FF claimed_libra_evaluation;

    // Committed sumcheck: round univariates in monomial basis and their evaluations at {0, 1, challenge}
    std::vector<Polynomial<FF>> round_univariates_list;
    std::vector<std::array<FF, 3>> round_evaluations_list;

    void execute_mega_oink();
    void execute_translator_oink();
    void execute_joint_sumcheck_rounds();
    void execute_joint_pcs();
};

using BatchedChonkProver = BatchedHonkTranslatorProver<MegaZKFlavor, 16>;
using BatchedAvmProver = BatchedHonkTranslatorProver<MegaAvmFlavor, MegaAvmFlavor::VIRTUAL_LOG_N>;

} // namespace bb
