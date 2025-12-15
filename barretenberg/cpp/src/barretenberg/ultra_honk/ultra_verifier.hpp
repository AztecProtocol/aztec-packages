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

    // Native constructor: takes verification key directly
    explicit UltraVerifier_(
        const std::shared_ptr<VerificationKey>& vk,
        VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key = VerifierCommitmentKey<curve::Grumpkin>(),
        const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : stored_vk(vk)
        , transcript(transcript)
        , ipa_verification_key(std::move(ipa_verification_key))
    {
        if constexpr (!IsRecursive) {
            verifier_instance = std::make_shared<Instance>(vk);
            ipa_transcript = std::make_shared<Transcript>();
        }
        // For recursive: verifier_instance created in reduce_to_claims after extracting builder
    }

    // Recursive constructor: takes builder pointer and VKAndHash (matches old UltraRecursiveVerifier_ API)
    template <typename VKAndHash>
    explicit UltraVerifier_(Builder* builder_ptr,
                            const std::shared_ptr<VKAndHash>& vk_and_hash,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        requires IsRecursive
        : stored_vk(vk_and_hash->vk)
        , transcript(transcript)
        , builder(builder_ptr)
    {
        verifier_instance = std::make_shared<Instance>(builder_ptr, vk_and_hash);
    }

    /**
     * @brief Reduce ultra proof to verification claims (works for both native and recursive)
     * @details Contains all shared verification logic: Oink, Sumcheck, Shplemini
     * @return ReductionResult with pairing points and IPA claim for deferred verification
     */
    [[nodiscard("Reduction result should be verified")]] ReductionResult reduce_to_claims(const Proof& proof);

    /**
     * @brief Perform ultra verification
     * @details
     * - Native: Calls reduce_to_claims() then performs immediate pairing check (+ IPA for rollup flavors)
     * - Recursive: Calls reduce_to_claims() and returns pairing points for deferred verification
     *
     * For IPA flavors, the second parameter allows passing ipa_proof separately (for backward compatibility).
     *
     * @return Output (UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive)
     */
    Output verify_proof(const Proof& proof, const Proof& ipa_proof = {});

    std::shared_ptr<VerificationKey> stored_vk; // Stored for recursive case
    std::shared_ptr<Instance> verifier_instance;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript = std::make_shared<Transcript>(); // Native only
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key;                 // Native only

    // Builder pointer (only used for recursive, nullptr for native)
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
using MegaZKVerifier = UltraVerifier_<MegaZKFlavor, DefaultIO>;

} // namespace bb
