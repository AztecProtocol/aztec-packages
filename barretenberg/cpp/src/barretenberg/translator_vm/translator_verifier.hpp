// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

namespace bb {

/**
 * @brief Translator verifier class that verifies the proof of the Translator circuit.
 * @tparam Flavor Either TranslatorFlavor (native) or TranslatorRecursiveFlavor (recursive)
 */
template <typename Flavor> class TranslatorVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Curve = typename Flavor::Curve;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using Transcript = typename Flavor::Transcript;
    using RelationParams = RelationParameters<FF>;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using Builder = std::conditional_t<IsRecursive, typename Flavor::CircuitBuilder, void>;

    // Use stdlib PairingPoints for recursive, native PairingPoints for native
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    // Proof type: stdlib::Proof for recursive, HonkProof for native
    using Proof = std::conditional_t<IsRecursive, stdlib::Proof<Builder>, HonkProof>;

    /**
     * @brief Result of reducing translator proof to pairing check
     * @details Contains pairing points for deferred KZG verification and status of internal checks. The pairing
     * points must be verified externally.
     */
    struct ReductionResult {
        PairingPoints pairing_points;     // KZG pairing points for deferred verification
        bool reduction_succeeded = false; // Aggregate of sumcheck and consistency checks
    };

    /**
     * @brief Unified constructor for both native and recursive verification
     * @details For recursive case, extracts builder from proof elements via get_context().
     * TranslatorFlavor VK is constant, so it's default-constructed.
     *
     * @param transcript Transcript for proof verification
     * @param proof The translator proof
     * @param evaluation_input_x Challenge point for polynomial evaluation (from ECCVM)
     * @param batching_challenge_v Challenge for batching translation polynomials (from ECCVM)
     * @param accumulated_result The accumulated result from ECCVM verifier
     * @param op_queue_wire_commitments Commitments to op queue wires from merge protocol
     */
    TranslatorVerifier_(std::shared_ptr<Transcript> transcript,
                        const Proof& proof,
                        const BF& evaluation_input_x,
                        const BF& batching_challenge_v,
                        const BF& accumulated_result,
                        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments)
        : transcript(std::move(transcript))
        , proof(proof)
        , evaluation_input_x(evaluation_input_x)
        , batching_challenge_v(batching_challenge_v)
        , accumulated_result(accumulated_result)
        , op_queue_wire_commitments(op_queue_wire_commitments)
    {
        // Translator VK is constant
        auto native_vk = std::make_shared<TranslatorFlavor::VerificationKey>();
        if constexpr (IsRecursive) {
            // Extract builder from proof - safe since transcript cannot hash non-witness elements
            builder = proof.back().get_context();
            key = std::make_shared<VerificationKey>(builder, native_vk);
            vk_hash = stdlib::witness_t<Builder>(builder, native_vk->hash());
            key->fix_witness();
            vk_hash.fix_witness();
        } else {
            key = native_vk;
            vk_hash = native_vk->hash();
        }
    }

    /**
     * @brief Reduce the translator proof to a pairing check
     * @details Verifies the Translator circuit's internal checks (sumcheck, Libra evaluations consistency) and reduces
     * all polynomial opening claims to a KZG pairing check. This method does NOT perform the final pairing
     * verification - it returns pairing points that must be verified externally.
     *
     * The Translator proves correct translation between BN254 and Grumpkin curve operations. It bridges the ECCVM
     * (which operates on Grumpkin) with the main circuit constraints (which operate on BN254).
     *
     * @return ReductionResult containing:
     *   - pairing_points: KZG pairing check points to be verified externally
     *   - reduction_succeeded: true if sumcheck and consistency checks passed
     */
    [[nodiscard("Verification result should be checked")]] ReductionResult reduce_to_pairing_check();

    /**
     * @brief Get the verification key
     * @return Shared pointer to the verification key
     */
    std::shared_ptr<VerificationKey> get_verification_key() const { return key; }

  private:
    std::shared_ptr<VerificationKey> key;
    FF vk_hash;
    std::shared_ptr<Transcript> transcript;
    Proof proof;
    RelationParams relation_parameters;

    // Translation inputs from ECCVM verifier
    BF evaluation_input_x;
    BF batching_challenge_v;
    BF accumulated_result;
    std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> op_queue_wire_commitments;

    // Builder pointer (only used for recursive, nullptr for native)
    std::conditional_t<IsRecursive, Builder*, void*> builder = nullptr;

    /**
     * @brief Populate relation parameters with translation data from ECCVM verifier
     * @details Converts the translation challenges and accumulated result into limbs.
     * - evaluation_input_x and batching_challenge_v: 5 limbs (4 binary + 1 prime), see TranslatorNonNativeFieldRelation
     * - accumulated_result: 4 binary limbs only as they are sufficient for equality checking, see
     * TranslatorAccumulatorTransferRelationImpl
     * Native uses uint256_t::slice, recursive uses BF::binary_basis_limbs.
     */
    void put_translation_data_in_relation_parameters();
};

// Type aliases
using TranslatorVerifier = TranslatorVerifier_<TranslatorFlavor>;
using TranslatorRecursiveVerifier = TranslatorVerifier_<TranslatorRecursiveFlavor>;

} // namespace bb
