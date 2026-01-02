// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
//
// Recursive Chonk verifier for in-circuit verification of Chonk IVC proofs.
// See: chonk/README.md
//
#pragma once
#include "barretenberg/chonk/chonk_proof.hpp"
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
 * @brief Verifier for Chonk IVC proofs (both native and recursive).
 * @details Consists of:
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
    using HidingKernelIO =
        std::conditional_t<IsRecursive, stdlib::recursion::honk::HidingKernelIO<Builder>, bb::HidingKernelIO>;
    using PairingPoints = typename GoblinVerifier::ReductionResult::PairingPoints;
    using IPAClaim = typename GoblinVerifier::ReductionResult::IPAClaim;
    using IPAProof = typename GoblinVerifier::ReductionResult::IPAProof;
    using MergeCommitments = typename GoblinVerifier::MergeVerifier::InputCommitments;

    // Number of pairing point sets aggregated in recursive verification (PI, PCS, Merge, Translator)
    static constexpr size_t NUM_PAIRING_POINTS = 4;

  public:
    /**
     * @brief Result of Chonk verification reduction (recursive mode only)
     * @details Contains aggregated pairing points and IPA verification data for deferred verification
     */
    struct ReductionResult {
        PairingPoints pairing_points; // Aggregated pairing points (PI + PCS + Merge + Translator)
        IPAClaim ipa_claim;           // IPA opening claim from ECCVM (Grumpkin curve)
        IPAProof ipa_proof;           // IPA proof for verifying the claim
        bool all_checks_passed;       // Reduction checks passed (sumcheck, evaluations, etc.)
    };

    using Output = std::conditional_t<IsRecursive, ReductionResult, bool>;
    using VKAndHash = typename HidingKernelVerifier::VKAndHash;
    using VK = typename HidingKernelVerifier::VerificationKey;
    using Commitment = typename HidingKernelVerifier::Commitment;
    using Proof = std::conditional_t<IsRecursive, ChonkStdlibProof, ChonkProof>;

    ChonkVerifier(const std::shared_ptr<VKAndHash>& vk_and_hash)
        : vk_and_hash(vk_and_hash)
        , transcript(std::make_shared<Transcript>())
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
     * @param proof Chonk proof (ChonkStdlibProof for recursive, ChonkProof for native mode)
     * @return Output (ReductionResult for recursive, bool for native)
     */
    [[nodiscard("IPA claim and pairing points must be accumulated")]] Output verify(const Proof& proof);

  private:
    // VK and hash of the hiding kernel
    std::shared_ptr<VKAndHash> vk_and_hash;
    // Shared transcript for all verifiers
    std::shared_ptr<Transcript> transcript;
};

// Type aliases for ease of use
using ChonkNativeVerifier = ChonkVerifier<false>;
using ChonkRecursiveVerifier = ChonkVerifier<true>;

} // namespace bb
