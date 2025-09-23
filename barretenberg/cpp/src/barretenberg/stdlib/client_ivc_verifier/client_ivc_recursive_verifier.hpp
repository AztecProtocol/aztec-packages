// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursiveVerifier {
    using Builder = UltraCircuitBuilder;                     // The circuit will be an Ultra circuit
    using RecursiveFlavor = MegaZKRecursiveFlavor_<Builder>; // The hiding circuit verifier algorithm is MegaZK
    using RecursiveVerifierInstance = RecursiveVerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveVerifierInstance::VerificationKey;
    using FoldingVerifier = ProtogalaxyRecursiveVerifier_<RecursiveVerifierInstance>;
    using MegaVerifier = UltraRecursiveVerifier_<RecursiveFlavor>;
    using GoblinVerifier = GoblinRecursiveVerifier;
    using Flavor = RecursiveFlavor::NativeFlavor;
    using VerificationKey = Flavor::VerificationKey;
    using Transcript = GoblinRecursiveVerifier::Transcript;

  public:
    using GoblinVerificationKey = Goblin::VerificationKey;
    using Output = GoblinRecursiveVerifierOutput;
    using RecursiveVKAndHash = RecursiveVerifierInstance::VKAndHash;
    using RecursiveVK = RecursiveFlavor::VerificationKey;

    struct StdlibProof {
        using StdlibHonkProof = bb::stdlib::Proof<Builder>;
        using StdlibGoblinProof = GoblinRecursiveVerifier::StdlibProof;

        static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = Flavor::VIRTUAL_LOG_N)
        {
            return bb::ClientIVC::Proof::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n);
        }

        static constexpr size_t PROOF_LENGTH(size_t virtual_log_n = Flavor::VIRTUAL_LOG_N)
        {
            return bb::ClientIVC::Proof::PROOF_LENGTH(virtual_log_n);
        }

        StdlibHonkProof mega_proof; // proof of the hiding circuit
        StdlibGoblinProof goblin_proof;

        StdlibProof(Builder& builder, const ClientIVC::Proof& proof)
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

            // ECCVM pre-ipa proof
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH);
            goblin_proof.eccvm_proof.pre_ipa_proof.insert(
                goblin_proof.eccvm_proof.pre_ipa_proof.end(), it + start_idx, it + end_idx);

            // ECCVM ipa proof
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(IPA_PROOF_LENGTH);
            goblin_proof.eccvm_proof.ipa_proof.insert(
                goblin_proof.eccvm_proof.ipa_proof.end(), it + start_idx, it + end_idx);

            // Translator proof
            start_idx = end_idx;
            end_idx += static_cast<std::ptrdiff_t>(TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
            goblin_proof.translator_proof.insert(goblin_proof.translator_proof.end(), it + start_idx, it + end_idx);

            BB_ASSERT_EQ(static_cast<uint32_t>(end_idx),
                         PROOF_LENGTH(virtual_log_n) + public_inputs_size,
                         "Reconstructed a ClientIVC proof of wrong the length from proof indices.");
        }
    };

    ClientIVCRecursiveVerifier(Builder* builder, const std::shared_ptr<VerificationKey>& native_mega_vk)
        : builder(builder)
        , stdlib_mega_vk_and_hash(std::make_shared<RecursiveVKAndHash>(*builder, native_mega_vk)) {};

    ClientIVCRecursiveVerifier(Builder* builder, const std::shared_ptr<RecursiveVKAndHash>& stdlib_mega_vk_and_hash)
        : builder(builder)
        , stdlib_mega_vk_and_hash(stdlib_mega_vk_and_hash) {};

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] Output verify(const StdlibProof&);

  private:
    Builder* builder;
    // VK and hash of the hiding kernel
    std::shared_ptr<RecursiveVKAndHash> stdlib_mega_vk_and_hash;
};
} // namespace bb::stdlib::recursion::honk
