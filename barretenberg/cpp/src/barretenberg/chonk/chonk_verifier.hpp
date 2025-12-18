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
#include "barretenberg/constants.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Stdlib representation of a Chonk proof for recursive verification.
 * @details Contains the proof as circuit witness elements (field_t). Can be constructed from a native Chonk::Proof
 * or from a vector of witness indices.
 */
template <typename Builder> struct ChonkStdlibProof {
    using StdlibHonkProof = bb::stdlib::Proof<Builder>;
    using HidingKernelFlavor = MegaZKFlavor;
    using RecursiveHidingKernelFlavor = MegaZKRecursiveFlavor_<Builder>;

    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = HidingKernelFlavor::VIRTUAL_LOG_N)
    {
        return bb::Chonk::Proof::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n);
    }

    static constexpr size_t PROOF_LENGTH(size_t virtual_log_n = HidingKernelFlavor::VIRTUAL_LOG_N)
    {
        return bb::Chonk::Proof::PROOF_LENGTH(virtual_log_n);
    }

    StdlibHonkProof mega_proof;     // MegaZK proof of the hiding kernel circuit
    GoblinStdlibProof goblin_proof; // Goblin proof (Merge + ECCVM + IPA + Translator)

    ChonkStdlibProof(Builder& builder, const Chonk::Proof& proof)
        : mega_proof(builder, proof.mega_proof)
        , goblin_proof(builder, proof.goblin_proof)
    {}

    /**
     * @brief Construct a new Stdlib Proof object from indices in a builder
     *
     * @param proof_indices Field elements representing the proof
     * @param public_inputs_size Number of public inputs
     * @param virtual_log_n Virtual circuit size (log2)
     */
    ChonkStdlibProof(const std::vector<stdlib::field_t<Builder>>& proof_indices,
                     size_t public_inputs_size,
                     size_t virtual_log_n = HidingKernelFlavor::VIRTUAL_LOG_N)
    {
        BB_ASSERT_EQ(proof_indices.size(),
                     PROOF_LENGTH(virtual_log_n) + public_inputs_size,
                     "Number of indices differs from the expected proof size.");

        auto it = proof_indices.begin();

        // Mega proof
        std::ptrdiff_t start_idx = 0;
        std::ptrdiff_t end_idx = static_cast<std::ptrdiff_t>(
            RecursiveHidingKernelFlavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) +
            stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE + public_inputs_size);
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

/**
 * @brief Verifier for Chonk IVC proofs (both native and recursive).
 * @details Creates circuit constraints that verify a Chonk proof, which consists of:
 *   1. MegaZK proof of the hiding kernel
 *   2. Goblin proof (Merge + ECCVM + Translator) - note: IPA is NOT verified here in recursive mode
 *
 * The hiding kernel proof is verified first to extract ECC op queue commitments,
 * which are then used as inputs to Goblin verification. Databus consistency is
 * checked between the kernel's return data and calldata commitments.
 *
 * In recursive mode: Returns an Output containing deferred verification data: pairing points (BN254) and
 * an IPA claim (Grumpkin). Pairing points are aggregated at each rollup level and verified on L1.
 * IPA claims are carried in RollupIO through rollup levels, accumulated via IPA::accumulate,
 * and verified in-circuit at root rollup via IPA::full_verify_recursive.
 *
 * In native mode: Performs all verification including pairing check and IPA verification, returns bool.
 *
 * Recursive mode uses Ultra arithmetization, as all ECC ops have to be performed in-circuit.
 */
template <bool IsRecursive> class ChonkVerifier {
    // Conditional types based on recursion
    using Builder = std::conditional_t<IsRecursive, UltraCircuitBuilder, void>;
    using HidingKernelVerifier = std::conditional_t<IsRecursive, bb::MegaZKRecursiveVerifier, bb::MegaZKVerifier>;
    using GoblinVerifier = std::conditional_t<IsRecursive, bb::GoblinRecursiveVerifier, bb::GoblinVerifier>;
    using Transcript = typename GoblinVerifier::Transcript;
    using GoblinReductionResult = typename GoblinVerifier::ReductionResult;

  public:
    using GoblinVerificationKey = Goblin::VerificationKey;
    using Output = std::conditional_t<IsRecursive, GoblinRecursiveVerifier::ReductionResult, bool>;
    using VKAndHash = typename HidingKernelVerifier::VKAndHash;
    using VK = typename HidingKernelVerifier::VerificationKey;
    using Commitment = typename HidingKernelVerifier::Commitment;
    using Proof = std::conditional_t<IsRecursive, ChonkStdlibProof<Builder>, Chonk::Proof>;

    ChonkVerifier(const std::shared_ptr<VKAndHash>& vk_and_hash)
        : vk_and_hash(vk_and_hash)
    {}

    ChonkVerifier(const std::shared_ptr<VK>& vk)
        requires(!IsRecursive)
        : vk_and_hash(std::make_shared<VKAndHash>(vk))
    {}
    /**
     * @brief Verify a Chonk proof
     * @details
     * Recursive mode (IsRecursive=true):
     *   Creates circuit constraints that verify:
     *   1. MegaZK proof of the hiding kernel
     *   2. Databus consistency (kernel return data == calldata)
     *   3. Goblin proof (Merge + ECCVM + Translator) - reduces to pairing points and IPA claim
     *   Returns Output (GoblinVerifier::ReductionResult) containing pairing points and IPA claim for deferred
     *   verification. Both pairing verification and IPA verification are deferred.
     *
     * Native mode (IsRecursive=false):
     *   Performs full verification including:
     *   1. MegaZK proof of the hiding kernel
     *   2. Databus consistency (kernel return data == calldata)
     *   3. Goblin proof (Merge + ECCVM + Translator) with immediate pairing check
     *   4. IPA verification
     *   Returns bool indicating whether verification succeeded.
     *
     * @param proof Chonk proof (ChonkStdlibProof for recursive, Chonk::Proof for native mode)
     * @return Output (ReductionResult for recursive, bool for native)
     */
    [[nodiscard("IPA claim and pairing points must be accumulated")]] Output verify(const Proof& proof);

  private:
    // VK and hash of the hiding kernel
    std::shared_ptr<VKAndHash> vk_and_hash;
};

// Type aliases for ease of use
using ChonkNativeVerifier = ChonkVerifier<false>;
using ChonkRecursiveVerifier = ChonkVerifier<true>;

} // namespace bb
