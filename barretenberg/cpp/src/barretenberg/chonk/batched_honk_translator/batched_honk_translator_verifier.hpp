#pragma once

#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
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
    using MegaZKVerifierCommitments = typename MegaZKFlavorT::VerifierCommitments;
    using TransVerifierCommitments = typename TransFlavor::VerifierCommitments;

    // Proof type: stdlib::Proof<UltraCircuitBuilder> for recursive, HonkProof for native.
    using Proof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;

    // PairingPoints type.
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    // BF type from the translator flavor (BN254 base field elements).
    using TransBF = typename TransFlavor::BF;

    /**
     * @brief Result of the batched sumcheck/PCS reduction.
     */
    struct ReductionResult {
        PairingPoints pairing_points;
        bool reduction_succeeded = false;
    };

    /**
     * @brief Construct the batched verifier.
     *
     * @param mega_zk_vk_and_hash   Verification key + hash for the MegaZK circuit (MegaZK).
     * @param transcript           Shared Fiat-Shamir transcript.
     * @param mega_zk_proof         MegaZK circuit honk proof.
     * @param translator_proof     Translator honk proof.
     * @param evaluation_input_x   BF scalar from ECCVM (for translator relation parameters).
     * @param batching_challenge_v BF scalar from ECCVM.
     * @param accumulated_result   BF accumulated result from ECCVM.
     * @param op_queue_wire_commitments Commitments to op-queue wires from the merge protocol.
     */
    BatchedHonkTranslatorVerifier_(
        std::shared_ptr<MegaZKVKAndHash> mega_zk_vk_and_hash,
        std::shared_ptr<Transcript> transcript,
        const Proof& mega_zk_proof,
        const Proof& translator_proof,
        const TransBF& evaluation_input_x,
        const TransBF& batching_challenge_v,
        const TransBF& accumulated_result,
        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments);

    /**
     * @brief Reduce both proofs to a single KZG pairing check.
     * @return ReductionResult with pairing points and a success flag.
     */
    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_to_pairing_check();

  private:
    // Methods mirroring the prover's structure.
    MegaZKVerifierCommitments verify_mega_zk_oink();
    TransVerifierCommitments verify_translator_oink();
    bool verify_joint_sumcheck();
    ReductionResult verify_joint_pcs(bool sumcheck_verified,
                                     MegaZKVerifierCommitments& mega_zk_commitments,
                                     TransVerifierCommitments& trans_commitments);

    std::shared_ptr<MegaZKVKAndHash> mega_zk_vk_and_hash;
    std::shared_ptr<Transcript> transcript;
    Proof mega_zk_proof;
    Proof translator_proof;

    // Translator-specific parameters from ECCVM verifier.
    TransBF evaluation_input_x;
    TransBF batching_challenge_v;
    TransBF accumulated_result;
    std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> op_queue_wire_commitments;

    // Builder pointer (only meaningful for recursive, nullptr for native).
    std::conditional_t<IsRecursive, UltraCircuitBuilder*, std::nullptr_t> builder = nullptr;

    // Relation parameters populated during verify_mega_zk_oink / verify_translator_oink.
    bb::RelationParameters<FF> mega_zk_relation_parameters;
    bb::RelationParameters<FF> translator_relation_parameters;

    // State populated by verify_joint_sumcheck(), consumed by verify_joint_pcs().
    std::vector<FF> joint_challenge;
    typename MegaZKFlavorT::AllValues mega_zk_evals;
    typename TransFlavor::AllValues trans_evals;
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments;
    FF libra_evaluation;
    FF libra_challenge;
};

// Type aliases.
using BatchedHonkTranslatorVerifier = BatchedHonkTranslatorVerifier_<curve::BN254>;
using BatchedHonkTranslatorRecursiveVerifier = BatchedHonkTranslatorVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
