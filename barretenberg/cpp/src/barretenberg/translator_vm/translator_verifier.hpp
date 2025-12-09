// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
 * @brief Unified translator verifier class for both native and recursive verification
 * @details Verifies the correctness of the Translator circuit which ensures that the ECCVM transcript
 * is consistent with the op queue data. Works for both native verification (returns PairingPoints
 * for external pairing check) and recursive verification (returns stdlib PairingPoints for aggregation).
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
     * @brief Result of translator verification
     * @details Contains pairing points for KZG verification and status of verification checks
     */
    struct VerificationResult {
        PairingPoints pairing_points;
        bool sumcheck_verified;
        bool consistency_checked;
    };

    // Native VK type for recursive constructor
    using NativeVerificationKey = TranslatorFlavor::VerificationKey;

    // Input type for translation data: BF for recursive, uint256_t for native evaluation_input_x/accumulated_result
    // Note: batching_challenge_v is always BF since it's an element of the BN254 base field
    using EvaluationInput = std::conditional_t<IsRecursive, BF, uint256_t>;
    using AccumulatedResult = std::conditional_t<IsRecursive, BF, uint256_t>;

    std::shared_ptr<VerificationKey> key;
    FF vk_hash;
    std::shared_ptr<Transcript> transcript;
    RelationParams relation_parameters;

    // Builder pointer (only used for recursive, nullptr for native)
    std::conditional_t<IsRecursive, Builder*, void*> builder = nullptr;

    /**
     * @brief Constructor for native verification
     * @details Creates a default-constructed verification key (TranslatorFlavor VK is constant)
     */
    TranslatorVerifier_(const std::shared_ptr<Transcript>& transcript)
        requires(!IsRecursive)
        : key(std::make_shared<VerificationKey>())
        , vk_hash(key->hash())
        , transcript(transcript)
    {}

    /**
     * @brief Constructor for native verification with explicit VK
     */
    TranslatorVerifier_(const std::shared_ptr<VerificationKey>& verifier_key,
                        const std::shared_ptr<Transcript>& transcript)
        requires(!IsRecursive)
        : key(verifier_key)
        , vk_hash(key->hash())
        , transcript(transcript)
    {}

    /**
     * @brief Constructor for recursive verification
     * @details Creates stdlib verification key from native VK, fixes witness values
     */
    TranslatorVerifier_(Builder* builder,
                        const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
                        const std::shared_ptr<Transcript>& transcript)
        requires(IsRecursive)
        : key(std::make_shared<VerificationKey>(builder, native_verifier_key))
        , vk_hash(stdlib::witness_t<Builder>(builder, native_verifier_key->hash()))
        , transcript(transcript)
        , builder(builder)
    {
        key->fix_witness();    // fixed to a constant
        vk_hash.fix_witness(); // fixed to a constant
    }

    /**
     * @brief Populate relation parameters with translation data from ECCVM verifier
     * @details Converts the translation challenges and accumulated result into limbs for use in Translator relations.
     * Native uses uint256_t::slice, recursive uses BF::binary_basis_limbs.
     */
    void put_translation_data_in_relation_parameters(const EvaluationInput& evaluation_input_x,
                                                     const BF& batching_challenge_v,
                                                     const AccumulatedResult& accumulated_result);

    /**
     * @brief Verify the translator proof
     * @details Verifies that the Translator circuit correctly processes the op queue transcript.
     * Returns verification result containing pairing points and check status.
     *
     * @param proof The translator proof
     * @param evaluation_input_x Challenge point for polynomial evaluation
     * @param batching_challenge_v Challenge for batching translation polynomials
     * @param accumulated_result The accumulated result from ECCVM verifier
     * @param op_queue_wire_commitments Commitments to op queue wires from merge protocol
     * @return VerificationResult containing pairing points and verification status
     */
    [[nodiscard("Verification result should be checked")]] VerificationResult verify_proof(
        const Proof& proof,
        const EvaluationInput& evaluation_input_x,
        const BF& batching_challenge_v,
        const AccumulatedResult& accumulated_result,
        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments);
};

// Type aliases
using TranslatorVerifier = TranslatorVerifier_<TranslatorFlavor>;
using TranslatorRecursiveVerifier = TranslatorVerifier_<TranslatorRecursiveFlavor>;

} // namespace bb
