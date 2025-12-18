// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
//
// Recursive Chonk verifier for in-circuit verification of Chonk IVC proofs.
// See: chonk/README.md
//
#pragma once
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Recursive verifier for Chonk IVC proofs.
 * @details Creates circuit constraints that verify a Chonk proof, which consists of:
 *   1. MegaZK proof of the hiding kernel
 *   2. Goblin proof (Merge + ECCVM + Translator) - note: IPA is NOT verified here
 *
 * The hiding kernel proof is verified first to extract ECC op queue commitments,
 * which are then used as inputs to Goblin verification. Databus consistency is
 * checked between the kernel's return data and calldata commitments.
 *
 * Returns an Output containing deferred verification data: pairing points (BN254) and
 * an IPA claim (Grumpkin). Pairing points are aggregated at each rollup level and verified on L1.
 * IPA claims are carried in RollupIO through rollup levels, accumulated via IPA::accumulate,
 * and verified in-circuit at root rollup via IPA::full_verify_recursive.
 *
 * Uses Ultra arithmetization, as all ECC ops have to be performed in-circuit at this stage.
 */
class ChonkRecursiveVerifier {
    using Builder = UltraCircuitBuilder;                     // The circuit will be an Ultra circuit
    using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>; // The Hiding kernel verifier algorithm is MegaZK
    using RecursiveVerifierInstance = bb::VerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveVerifierInstance::VerificationKey;
    using MegaVerifier = bb::UltraVerifier_<RecursiveFlavor, HidingKernelIO<Builder>>;
    using GoblinVerifier = GoblinRecursiveVerifier;
    using Flavor = RecursiveFlavor::NativeFlavor;
    using VerificationKey = Flavor::VerificationKey;
    using Transcript = GoblinRecursiveVerifier::Transcript;

  public:
    using GoblinVerificationKey = Goblin::VerificationKey;
    using Output = GoblinRecursiveVerifier::ReductionResult;
    using RecursiveVKAndHash = RecursiveVerifierInstance::VKAndHash;
    using RecursiveVK = RecursiveFlavor::VerificationKey;

    /**
     * @brief Stdlib representation of a Chonk proof for recursive verification.
     * @details Contains the proof as circuit witness elements (field_t). Can be constructed from a native Chonk::Proof
     * or from a vector of witness indices.
     */
    struct StdlibProof {
        using StdlibHonkProof = bb::stdlib::Proof<Builder>;

        static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = Flavor::VIRTUAL_LOG_N)
        {
            return bb::Chonk::Proof::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n);
        }

        static constexpr size_t PROOF_LENGTH(size_t virtual_log_n = Flavor::VIRTUAL_LOG_N)
        {
            return bb::Chonk::Proof::PROOF_LENGTH(virtual_log_n);
        }

        StdlibHonkProof mega_proof;     // MegaZK proof of the hiding kernel circuit
        GoblinStdlibProof goblin_proof; // Goblin proof (Merge + ECCVM + IPA + Translator)

        StdlibProof(Builder& builder, const Chonk::Proof& proof)
            : mega_proof(builder, proof.mega_proof)
            , goblin_proof(builder, proof.goblin_proof)
        {}

        /**
         * @brief Construct a new Stdlib Proof object from indices in a builder
         *
         * @param proof_indices
         * @param virtual_log_n
         */
        StdlibProof(const std::vector<field_t<Builder>>& proof_indices,
                    size_t public_inputs_size,
                    size_t virtual_log_n = Flavor::VIRTUAL_LOG_N)
        {

            BB_ASSERT_EQ(proof_indices.size(),
                         PROOF_LENGTH(virtual_log_n) + public_inputs_size,
                         "Number of indices differs from the expected proof size.");

            auto it = proof_indices.begin();

            // Mega proof
            std::ptrdiff_t start_idx = 0;
            std::ptrdiff_t end_idx = static_cast<std::ptrdiff_t>(
                RecursiveFlavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) +
                HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE + public_inputs_size);
            mega_proof.insert(mega_proof.end(), it + start_idx, it + end_idx);

            // Merge proof
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(MERGE_PROOF_SIZE);
            goblin_proof.merge_proof.insert(goblin_proof.merge_proof.end(), it + start_idx, it + end_idx);

            // ECCVM proof (IPA is separate)
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
            goblin_proof.eccvm_proof.insert(goblin_proof.eccvm_proof.end(), it + start_idx, it + end_idx);

            // IPA proof
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(IPA_PROOF_LENGTH);
            goblin_proof.ipa_proof.insert(goblin_proof.ipa_proof.end(), it + start_idx, it + end_idx);

            // Translator proof
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
            goblin_proof.translator_proof.insert(goblin_proof.translator_proof.end(), it + start_idx, it + end_idx);

            BB_ASSERT_EQ(static_cast<uint32_t>(end_idx),
                         PROOF_LENGTH(virtual_log_n) + public_inputs_size,
                         "Reconstructed a Chonk proof of wrong the length from proof indices.");
        }
    };

    ChonkRecursiveVerifier(const std::shared_ptr<RecursiveVKAndHash>& stdlib_mega_vk_and_hash)
        : stdlib_mega_vk_and_hash(stdlib_mega_vk_and_hash) {};

    /**
     * @brief Recursively verify a Chonk proof and return deferred verification data
     * @details Creates circuit constraints that verify:
     *   1. MegaZK proof of the hiding kernel
     *   2. Databus consistency (kernel return data == calldata)
     *   3. Goblin proof (Merge + ECCVM + Translator) - reduces to pairing points and IPA claim
     *
     * Both pairing verification and IPA verification are deferred. The aggregated pairing points must be verified
     * elsewhere. The IPA claims are accumulated and deferred to root rollup.
     *
     * @param proof Stdlib Chonk proof containing mega_proof and goblin_proof
     * @return Output (GoblinVerifier::ReductionResult) containing pairing points and IPA claim for deferred
     * verification
     */
    [[nodiscard("IPA claim and pairing points must be accumulated")]] Output verify(const StdlibProof&);

  private:
    // VK and hash of the hiding kernel
    std::shared_ptr<RecursiveVKAndHash> stdlib_mega_vk_and_hash;
};
} // namespace bb::stdlib::recursion::honk
