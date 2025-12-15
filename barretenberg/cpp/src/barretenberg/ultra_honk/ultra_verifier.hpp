// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/honk_verifier/recursive_verifier_instance.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
#include <any>

namespace bb::stdlib::recursion::honk {

/**
 * @brief Output type for recursive ultra verification
 * @details Contains pairing points for deferred verification in outer circuit,
 * plus optional IPA claim (rollup) and kernel data (chonk).
 */
template <typename Builder> struct UltraRecursiveVerifierOutput {
    using Curve = bn254<Builder>;
    using FF = typename Curve::ScalarField;
    using G1 = typename Curve::Group;

    PairingPoints<Curve> points_accumulator;
    OpeningClaim<grumpkin<Builder>> ipa_claim;
    stdlib::Proof<Builder> ipa_proof;
    G1 kernel_return_data;
    std::array<G1, Builder::NUM_WIRES> ecc_op_tables; // Ecc op tables' commitments (HidingKernel/Chonk only)
    FF mega_hash;                                     // Hash of public inputs and VK (GoblinAvmRecursiveVerifier only)

    UltraRecursiveVerifierOutput() = default;

    template <class IO>
    UltraRecursiveVerifierOutput(IO& inputs)
        : points_accumulator(inputs.pairing_inputs)
    {
        if constexpr (std::is_same_v<IO, RollupIO>) {
            ipa_claim = inputs.ipa_claim;
        } else if constexpr (std::is_same_v<IO, HidingKernelIO<Builder>>) {
            kernel_return_data = inputs.kernel_return_data;
            ecc_op_tables = inputs.ecc_op_tables;
        } else if constexpr (std::is_same_v<IO, GoblinAvmIO<Builder>>) {
            mega_hash = inputs.mega_hash;
        } else if constexpr (!std::is_same_v<IO, DefaultIO<Builder>>) {
            throw_or_abort("Invalid public input type.");
        }
    }
};

} // namespace bb::stdlib::recursion::honk

namespace bb {

// Instance type selection helper (pattern from OinkVerifier)
template <typename Flavor, bool = IsRecursiveFlavor<Flavor>> struct UltraVerifierInstanceType {
    using type = VerifierInstance_<Flavor>;
};

template <typename Flavor> struct UltraVerifierInstanceType<Flavor, true> {
    using type = bb::stdlib::recursion::honk::RecursiveVerifierInstance_<Flavor>;
};

/**
 * @brief Split a combined rollup proof into honk and IPA components
 * @details For rollup flavors, proofs are concatenated: [honk_proof | ipa_proof]
 * This helper extracts them based on the verification key's public input count.
 * Works for both native and recursive (stdlib) proofs/VKs.
 *
 * @tparam Proof The proof type (native std::vector<fr> or stdlib::Proof<Builder>)
 * @tparam VK The verification key type (native or recursive)
 * @param combined_proof The concatenated proof
 * @param vk The verification key (to determine split point from num_public_inputs)
 * @return std::pair<Proof, Proof> The {honk_proof, ipa_proof} pair
 */
template <typename Proof, class VK> auto split_rollup_proof(const Proof& combined_proof, const std::shared_ptr<VK>& vk)
{
    // Get num_public_inputs - works for both native and recursive VKs
    size_t num_public_inputs = [&]() {
        if constexpr (requires { vk->num_public_inputs.get_value(); }) {
            // Recursive VK: field_t<Builder>
            return static_cast<size_t>(static_cast<uint32_t>(vk->num_public_inputs.get_value()));
        } else {
            // Native VK: uint32_t
            return static_cast<size_t>(vk->num_public_inputs);
        }
    }();

    // Calculate split point
    const size_t HONK_PROOF_LENGTH = UltraRollupFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() - IPA_PROOF_LENGTH;
    const std::ptrdiff_t honk_proof_with_pub_inputs_length =
        static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);

    // Extract proofs (infer type from combined_proof)
    using ProofVec = std::decay_t<decltype(combined_proof)>;
    ProofVec honk_proof(combined_proof.begin(), combined_proof.begin() + honk_proof_with_pub_inputs_length);
    ProofVec ipa_proof(combined_proof.begin() + honk_proof_with_pub_inputs_length, combined_proof.end());

    return std::make_pair(honk_proof, ipa_proof);
}

template <typename Flavor, class IO> class UltraVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Curve = typename Flavor::Curve;
    using VerificationKey = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;

    // Recursion detection
    static constexpr bool IsRecursive = IsRecursiveFlavor<Flavor>;

    // Conditional types based on recursion
    using Builder = std::conditional_t<IsRecursive, typename Flavor::CircuitBuilder, void>;
    using Instance = typename UltraVerifierInstanceType<Flavor>::type;
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    using PublicInputs = std::vector<FF>;
    using Proof = typename Transcript::Proof;

    // Native verifier output (immediate verification result)
    struct UltraVerifierOutput {
      public:
        bool result;
        Commitment kernel_return_data;
        std::array<Commitment, Flavor::NUM_WIRES> ecc_op_tables;

        UltraVerifierOutput() = default;

        explicit operator bool() const { return result; }
    };

    // Conditional output type: UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive
    using Output = std::
        conditional_t<IsRecursive, stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>, UltraVerifierOutput>;

    // IPA claim type: native uses curve::Grumpkin, recursive uses stdlib::grumpkin<Builder>
    using IPACurve = std::conditional_t<IsRecursive, stdlib::grumpkin<Builder>, curve::Grumpkin>;
    using IPAClaim = OpeningClaim<IPACurve>;

    /**
     * @brief Result of reducing ultra proof to verification claims
     * @details Contains pairing points for deferred KZG verification, IPA claim (for rollup),
     * and status of internal checks. Works for both native and recursive verification.
     */
    struct ReductionResult {
        PairingPoints pairing_points;     // KZG pairing points for deferred verification
        bool reduction_succeeded = false; // Sumcheck and consistency checks
    };

    /**
     * @brief Unified constructor for both native and recursive verifiers
     * @param vk_and_hash VKAndHash wrapper containing verification key and its hash
     * @param transcript Transcript instance (optional, defaults to new transcript)
     *
     * For native: verifier_instance created immediately
     * For recursive: builder extracted from vk_and_hash, then verifier_instance created
     */
    using VKAndHash = typename Flavor::VKAndHash;
    explicit UltraVerifier_(const std::shared_ptr<VKAndHash>& vk_and_hash,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : stored_vk_and_hash(vk_and_hash)
        , transcript(transcript)
    {
        if constexpr (!IsRecursive) {
            // Native: create verifier_instance immediately
            verifier_instance = std::make_shared<Instance>(vk_and_hash->vk);
            ipa_transcript = std::make_shared<Transcript>();
        } else {
            // Recursive: extract builder from VKAndHash and create verifier_instance
            // Safe since VKAndHash contains field_t elements (hash) with builder context
            builder = vk_and_hash->hash.get_context();
            verifier_instance = std::make_shared<Instance>(builder, vk_and_hash);
        }
    }

    /**
     * @brief Reduce ultra proof to verification claims (works for both native and recursive)
     * @details Contains all shared verification logic: Oink, Sumcheck, Shplemini
     * @return ReductionResult with pairing points and IPA claim for deferred verification
     */
    [[nodiscard("Reduction result should be verified")]] ReductionResult reduce_to_claims(const Proof& proof);

    /**
     * @brief Perform ultra verification for non-IPA flavors
     * @details
     * - Native: Calls reduce_to_claims() then performs immediate pairing check
     * - Recursive: Calls reduce_to_claims() and returns pairing points for deferred verification
     *
     * @return Output (UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive)
     */
    Output verify_proof(const Proof& proof)
        requires(!HasIPAAccumulator<Flavor>);

    /**
     * @brief Perform ultra verification for IPA flavors (rollup)
     * @details
     * - Native: Calls reduce_to_claims() then performs immediate pairing check + IPA verification
     * - Recursive: Calls reduce_to_claims() and returns pairing points and IPA proof for deferred verification
     *
     * @param proof The honk proof
     * @param ipa_proof IPA proof (passed separately)
     * @return Output (UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive)
     *
     * @note Use split_rollup_proof() helper to extract proofs if you have a combined proof
     */
    Output verify_proof(const Proof& proof, const Proof& ipa_proof)
        requires(HasIPAAccumulator<Flavor>);

    std::shared_ptr<VKAndHash> stored_vk_and_hash; // Uniform for both native and recursive
    std::shared_ptr<Instance> verifier_instance;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript = std::make_shared<Transcript>(); // Native only

    // Builder pointer (extracted from proof for recursive, nullptr for native)
    std::conditional_t<IsRecursive, Builder*, void*> builder = nullptr;
};

// Native verifier type aliases
using UltraVerifier = UltraVerifier_<UltraFlavor, DefaultIO>;
using UltraZKVerifier = UltraVerifier_<UltraZKFlavor, DefaultIO>;
using UltraRollupVerifier = UltraVerifier_<UltraRollupFlavor, RollupIO>;
using UltraKeccakVerifier = UltraVerifier_<UltraKeccakFlavor, DefaultIO>;
using UltraKeccakZKVerifier = UltraVerifier_<UltraKeccakZKFlavor, DefaultIO>;
#ifdef STARKNET_GARAGA_FLAVORS
using UltraStarknetVerifier = UltraVerifier_<UltraStarknetFlavor, DefaultIO>;
using UltraStarknetZKVerifier = UltraVerifier_<UltraStarknetZKFlavor, DefaultIO>;
#endif
using MegaVerifier = UltraVerifier_<MegaFlavor, DefaultIO>;
using MegaZKVerifier = UltraVerifier_<MegaZKFlavor, HidingKernelIO>;

} // namespace bb
