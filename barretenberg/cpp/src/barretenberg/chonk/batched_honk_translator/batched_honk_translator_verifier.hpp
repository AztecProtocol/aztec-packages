#pragma once

#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Verifier for the batched Mega circuit + translator sumcheck and PCS.
 *
 * @details Mirrors BatchedHonkTranslatorProver in the verification direction. Processes the
 * Mega circuit's Oink proof and the translator's pre-sumcheck commitments on a shared transcript,
 * then verifies a single joint sumcheck and a single Shplemini / KZG reduction.
 *
 * The final joint relation check is:
 *   FRV_joint = rdp_MZK · FRV_MZK(u) + α^{K_H} · FRV_translator(u) + libra_eval · libra_challenge
 *
 * where rdp_H is the row-disabling polynomial for the MegaZK circuit evaluated at the joint
 * sumcheck challenge, and TranslatorFlavor does not use row-disabling (UseRowDisablingPolynomial
 * is false for TranslatorFlavor).
 *
 * @tparam Curve  curve::BN254 for native verification, stdlib::bn254<Builder> for recursive.
 */
template <typename MegaFlavor, size_t MegaLogN, typename Curve> class BatchedHonkTranslatorVerifier_ {
  public:
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    // Select translator flavor based on native vs recursive.
    using TransFlavor = std::conditional_t<IsRecursive, TranslatorRecursiveFlavor, TranslatorFlavor>;

    using FF = typename MegaFlavor::FF;
    using Commitment = typename MegaFlavor::Commitment;
    using MegaVerifierInstance = VerifierInstance_<MegaFlavor>;
    using MegaVKAndHash = typename MegaFlavor::VKAndHash;
    using Transcript = std::conditional_t<IsRecursive, UltraStdlibTranscript, NativeTranscript>;
    using MegaVerifierCommitments = typename MegaFlavor::VerifierCommitments;
    using TransVerifierCommitments = typename TransFlavor::VerifierCommitments;

    // Proof type: stdlib::Proof<UltraCircuitBuilder> for recursive, HonkProof for native.
    using Proof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;

    // PairingPoints type.
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    // BF type from the translator flavor (BN254 base field elements).
    using TransBF = typename TransFlavor::BF;

    // Joint RepeatedCommitmentsData for Shplemini's remove_repeated_commitments optimization.
    // Joint unshifted = [Trans_unshifted(TU), Mega_unshifted(P+W)]. The translator's gemini_masking_poly
    // is at position 0 of unshifted.
    //
    // Shplemini's remove_repeated_commitments applies offset = HasZK ? 2 : 1 (Q + masking vs Q only).
    // When HasZK=true (MegaZK), offset=2 consumes Q and the translator's masking poly, so the virtual
    // layout starts after the masking poly (TU-1 remaining translator entries).
    // When HasZK=false (MegaAvm), offset=1 consumes only Q, so the masking poly remains in the virtual
    // layout (TU translator entries remain).
    //
    // After offset, the virtual layout is:
    //   Unshifted: [Trans_rest(TU - masking_consumed) | Mega_precomputed(P) | Mega_witness(W)]
    //   Shifted:   [Mega_shifted(S) | Trans_shifted(TS)]
    //
    // Range 1 (Translator merged): ordered(5)+z_perm(1)+concat(5) in unshifted ↔ same in shifted
    // Range 2 (Mega): witness[0..S-1] ↔ mega_shifted[0..S-1]
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = [] {
        constexpr size_t TU = TranslatorFlavor::NUM_PCS_UNSHIFTED; // includes masking(1)
        constexpr size_t P = MegaFlavor::NUM_PRECOMPUTED_ENTITIES;
        constexpr size_t W = MegaFlavor::NUM_WITNESS_ENTITIES;
        constexpr size_t S = MegaFlavor::NUM_SHIFTED_ENTITIES;
        // When HasZK=true, offset=2 consumes the masking poly; when false, offset=1 does not.
        // The number of translator entries remaining in the virtual layout differs accordingly.
        constexpr size_t MASKING_CONSUMED = MegaFlavor::HasZK ? 1 : 0;
        constexpr size_t TRANS_VIRTUAL = TU - MASKING_CONSUMED; // translator entries after offset
        // Translator repeated: ordered(5)+z_perm(1)+concat(5) in Trans_rest ↔ Trans_shifted
        // Trans_rest starts at virtual 0; repeated starts at ordered_extra(1)+op(1)=2
        constexpr size_t TRANS_REPEAT_START =
            TranslatorFlavor::REPEATED_COMMITMENTS.first.original_start + (1 - MASKING_CONSUMED);
        constexpr size_t TRANS_REPEAT_COUNT =
            TranslatorFlavor::REPEATED_COMMITMENTS.first.count + TranslatorFlavor::REPEATED_COMMITMENTS.second.count;
        // In shifted section: op_queue entries precede the repeated entries
        constexpr size_t TRANS_SHIFTED_SKIP = TranslatorFlavor::NUM_PCS_TO_BE_SHIFTED - TRANS_REPEAT_COUNT;
        return RepeatedCommitmentsData(TRANS_REPEAT_START, // Translator original in unshifted
                                       TRANS_VIRTUAL + P + W + S +
                                           TRANS_SHIFTED_SKIP, // Translator duplicate in shifted
                                       TRANS_REPEAT_COUNT,     // Translator count
                                       TRANS_VIRTUAL + P,      // Mega original: witness start in unshifted
                                       TRANS_VIRTUAL + P + W,  // Mega duplicate: shifted start
                                       S);                     // Mega count
    }();

    static constexpr size_t MEGA_LOG_N = MegaLogN;
    static constexpr bool IS_MEGA_SMALLER = MEGA_LOG_N <= TranslatorFlavor::CONST_TRANSLATOR_LOG_N;
    static constexpr size_t MIN_LOG_N = std::min(MEGA_LOG_N, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);
    static constexpr size_t JOINT_LOG_N = std::max(MEGA_LOG_N, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    static constexpr bool COMMITTED_SUMCHECK = MegaFlavor::HasZK;
    static constexpr bool IS_MEGA_LENGTH_SMALLER =
        MegaFlavor::BATCHED_RELATION_PARTIAL_LENGTH < TransFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    using SumcheckVerifierRoundType = std::conditional_t<IS_MEGA_LENGTH_SMALLER,
                                                         SumcheckVerifierRound<TransFlavor, COMMITTED_SUMCHECK>,
                                                         SumcheckVerifierRound<MegaFlavor, COMMITTED_SUMCHECK>>;

    /**
     * @brief Result of the batched sumcheck/PCS reduction.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        bool reduction_succeeded = false;
    };

    /**
     * @brief Result of Phase 1 (MegaZK Oink verification).
     * @details Contains the data that callers need between Phase 1 and Phase 2.
     */
    struct OinkResult {
        std::vector<FF> public_inputs;
        Commitment calldata_commitment;
        std::array<Commitment, MegaFlavor::NUM_WIRES> ecc_op_wires;
    };

    /**
     * @brief Construct the batched verifier with minimal state.
     * @details Only stores the VK and transcript. Proof data and ECCVM-derived params are passed
     * to the two-phase verification methods.
     */
    BatchedHonkTranslatorVerifier_(std::shared_ptr<MegaVKAndHash> mega_vk_and_hash,
                                   std::shared_ptr<Transcript> transcript);

    /**
     * @brief Phase 1: Verify the MegaZK Oink phase on the shared transcript.
     * @details Loads mega_zk_proof into the transcript, runs OinkVerifier, stores verifier instance.
     * @return OinkResult with public inputs, calldata commitment, and ECC op wires.
     */
    OinkResult verify_mega_oink(const Proof& mega_proof);

    /**
     * @brief Phase 2: Verify translator Oink + joint sumcheck + joint PCS.
     * @details Called after merge and ECCVM verification have been performed on the shared transcript.
     * Loads joint_proof, runs translator oink, joint sumcheck, and joint PCS.
     * @return ReductionResult with pairing points and a success flag.
     */
    [[nodiscard("Verification result should be checked")]] ReductionResult verify(
        const Proof& joint_proof,
        const TransBF& evaluation_input_x,
        const TransBF& batching_challenge_v,
        const TransBF& accumulated_result,
        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments);

  private:
    // Methods mirroring the prover's structure.
    TransVerifierCommitments verify_translator_oink(
        const Proof& joint_proof,
        const TransBF& evaluation_input_x,
        const TransBF& batching_challenge_v,
        const TransBF& accumulated_result,
        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments);
    bool verify_joint_sumcheck();
    ReductionResult verify_joint_pcs(bool sumcheck_verified,
                                     MegaVerifierCommitments& mega_commitments,
                                     TransVerifierCommitments& trans_commitments);

    std::shared_ptr<MegaVKAndHash> mega_vk_and_hash;
    std::shared_ptr<Transcript> transcript;

    // Verifier instance stored after verify_mega_oink (provides accessors)
    std::shared_ptr<MegaVerifierInstance> mega_verifier_instance;

    // Builder pointer (only meaningful for recursive, nullptr for native).
    std::conditional_t<IsRecursive, UltraCircuitBuilder*, std::nullptr_t> builder = nullptr;

    // Relation parameters populated during verify_mega_oink / verify_translator_oink.
    bb::RelationParameters<FF> mega_relation_parameters;
    bb::RelationParameters<FF> translator_relation_parameters;

    // State populated by verify_joint_sumcheck(), consumed by verify_joint_pcs().
    std::vector<FF> joint_challenge;
    typename MegaFlavor::AllValues mega_evals;
    typename TransFlavor::AllValues trans_evals;
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments;
    FF libra_evaluation = FF(0);
    FF libra_challenge = FF(0);

    // Committed sumcheck data: round univariate commitments and evaluations at {0, 1, challenge}.
    std::vector<Commitment> round_univariate_commitments;
    std::vector<std::array<FF, 3>> round_univariate_evaluations;
};

// Type aliases.
using BatchedChonkVerifier = BatchedHonkTranslatorVerifier_<MegaZKFlavor, 16, curve::BN254>;
using BatchedChonkRecursiveVerifier =
    BatchedHonkTranslatorVerifier_<MegaZKRecursiveFlavor_<UltraCircuitBuilder>, 16, stdlib::bn254<UltraCircuitBuilder>>;

using BatchedAvmRecursiveVerifier = BatchedHonkTranslatorVerifier_<MegaAvmRecursiveFlavor_<UltraCircuitBuilder>,
                                                                   MEGA_AVM_LOG_N,
                                                                   stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
