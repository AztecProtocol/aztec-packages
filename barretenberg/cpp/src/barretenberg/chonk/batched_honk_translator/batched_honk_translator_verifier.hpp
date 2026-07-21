#pragma once

#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/verifier_commitments.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb {

/**
 * @brief Verifier for the batched MegaZK circuit + translator sumcheck and PCS.
 *
 * @details Mirrors BatchedHonkTranslatorProver in the verification direction. Processes the
 * MegaZK circuit's Oink proof and the translator's pre-sumcheck commitments on a shared transcript,
 * then verifies a single joint 17-round sumcheck and a single Shplemini / KZG reduction.
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
template <typename Curve> class BatchedHonkTranslatorVerifier_ {
  public:
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    // Select MegaZK flavor based on native vs recursive.
    using MegaZKFlavorT = std::conditional_t<IsRecursive, MegaZKRecursiveFlavor_<UltraCircuitBuilder>, MegaZKFlavor>;
    // Select translator flavor based on native vs recursive.
    using TransFlavor = std::conditional_t<IsRecursive, TranslatorRecursiveFlavor, TranslatorFlavor>;

    using FF = typename MegaZKFlavorT::FF;
    using Commitment = typename MegaZKFlavorT::Commitment;
    using MegaZKVerifierInstance = VerifierInstance_<MegaZKFlavorT>;
    using MegaZKVKAndHash = typename MegaZKFlavorT::VKAndHash;
    using Transcript = std::conditional_t<IsRecursive, UltraStdlibTranscript, NativeTranscript>;
    using MegaZKVerifierCommitments = typename VerifierCommitmentsConstructor<MegaZKFlavorT>::Commitments;
    using TransVerifierCommitments = typename TransFlavor::VerifierCommitments;

    // Proof type: stdlib::Proof<UltraCircuitBuilder> for recursive, HonkProof for native.
    using Proof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;

    // PairingPoints type.
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    // BF type from the translator flavor (BN254 base field elements).
    using TransBF = typename TransFlavor::BF;

    // Joint RepeatedCommitmentsData for Shplemini's remove_repeated_commitments optimization.
    // Joint unshifted = [Trans_unshifted(TU), MZK_unshifted(P+W)]. The translator's gemini_masking_poly
    // is at position 0 of unshifted and is consumed by Shplemini's offset=2 (Q + masking).
    // After Shplemini's offset=2, the virtual layout is:
    //   Unshifted: [Trans_rest(TU-1) | MZK_precomputed(P) | MZK_witness(W)]
    //   Shifted:   [MZK_shifted(S) | Trans_shifted(TS)]
    //
    // Range 1 (Translator merged): ordered(5)+z_perm(1)+concat(5) in unshifted ↔ same in shifted
    // Range 2 (MegaZK): witness[0..S-1] ↔ mega_zk_shifted[0..S-1]
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = [] {
        constexpr size_t TU = TranslatorFlavor::NUM_PCS_UNSHIFTED; // includes masking(1)
        constexpr size_t P = MegaZKFlavorT::NUM_PRECOMPUTED_ENTITIES;
        constexpr size_t W = MegaZKFlavorT::NUM_WITNESS_ENTITIES;
        constexpr size_t S = MegaZKFlavorT::NUM_SHIFTED_ENTITIES;
        // Translator repeated: ordered(5)+z_perm(1)+concat(5) in Trans_rest ↔ Trans_shifted
        // Trans_rest starts at virtual 0; repeated starts at ordered_extra(1)+op(1)=2
        constexpr size_t TRANS_REPEAT_START = TranslatorFlavor::REPEATED_COMMITMENTS.first.original_start;
        constexpr size_t TRANS_REPEAT_COUNT =
            TranslatorFlavor::REPEATED_COMMITMENTS.first.count + TranslatorFlavor::REPEATED_COMMITMENTS.second.count;
        // In shifted section: op_queue entries precede the repeated entries
        constexpr size_t TRANS_SHIFTED_SKIP = TranslatorFlavor::NUM_PCS_TO_BE_SHIFTED - TRANS_REPEAT_COUNT;
        return RepeatedCommitmentsData(TRANS_REPEAT_START,                        // Translator original in unshifted
                                       (TU - 1) + P + W + S + TRANS_SHIFTED_SKIP, // Translator duplicate in shifted
                                       TRANS_REPEAT_COUNT,                        // Translator count
                                       (TU - 1) + P,     // MegaZK original: witness start in unshifted
                                       (TU - 1) + P + W, // MegaZK duplicate: shifted start
                                       S);               // MegaZK count
    }();

    /**
     * @brief Result of the batched sumcheck/PCS reduction.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        bool reduction_succeeded = false;
    };

    /**
     * @brief Result of Phase 1 (MegaZK Oink verification).
     */
    struct OinkResult {
        std::vector<FF> public_inputs;
        std::array<Commitment, MegaZKFlavorT::NUM_WIRES> ecc_op_wires;
        Commitment kernel_calldata_commitment;
    };

    /**
     * @brief Construct the batched verifier with minimal state.
     * @details Only stores the VK and transcript. Proof data and ECCVM-derived params are passed
     * to the two-phase verification methods.
     */
    BatchedHonkTranslatorVerifier_(std::shared_ptr<MegaZKVKAndHash> mega_zk_vk_and_hash,
                                   std::shared_ptr<Transcript> transcript);

    /**
     * @brief Phase 1: Verify the MegaZK Oink phase on the shared transcript.
     * @details Loads mega_zk_proof into the transcript, runs OinkVerifier, stores verifier instance.
     * @return OinkResult with public inputs and ECC op wires.
     */
    OinkResult verify_mega_zk_oink(const Proof& mega_zk_proof);

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
                                     MegaZKVerifierCommitments& mega_zk_commitments,
                                     TransVerifierCommitments& trans_commitments);

    std::shared_ptr<MegaZKVKAndHash> mega_zk_vk_and_hash;
    std::shared_ptr<Transcript> transcript;

    // Verifier instance stored after verify_mega_zk_oink (provides accessors)
    std::shared_ptr<MegaZKVerifierInstance> mega_zk_verifier_instance;

    // Builder pointer (only meaningful for recursive, nullptr for native).
    std::conditional_t<IsRecursive, UltraCircuitBuilder*, std::nullptr_t> builder = nullptr;

    // Relation parameters populated during verify_mega_zk_oink / verify_translator_oink.
    bb::RelationParameters<FF> mega_zk_relation_parameters;
    bb::RelationParameters<FF> translator_relation_parameters;

    // State populated by verify_joint_sumcheck(), consumed by verify_joint_pcs().
    std::vector<FF> joint_challenge;
    typename MegaZKFlavorT::AllValues mega_zk_evals;
    typename TransFlavor::AllValues trans_evals;
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments;
    FF libra_evaluation;
    FF libra_challenge;

    // Committed sumcheck data: round univariate commitments and evaluations at {0, 1, challenge}.
    std::vector<Commitment> round_univariate_commitments;
    std::vector<std::array<FF, 3>> round_univariate_evaluations;
};

// Type aliases.
using BatchedHonkTranslatorVerifier = BatchedHonkTranslatorVerifier_<curve::BN254>;
using BatchedHonkTranslatorRecursiveVerifier = BatchedHonkTranslatorVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
