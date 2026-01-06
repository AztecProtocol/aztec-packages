// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Output type for recursive ultra verification
 * @details Contains pairing points for deferred verification  plus optional IPA claim (rollup) and kernel data (Hiding
 * Kernel).
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

    template <class IO> UltraRecursiveVerifierOutput(IO& inputs)
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

// Native verifier output
template <typename Flavor> struct UltraVerifierOutput {
  public:
    using Commitment = typename Flavor::Commitment;
    bool result = false;
    typename Flavor::Commitment kernel_return_data;
    std::array<Commitment, Flavor::NUM_WIRES> ecc_op_tables;

    UltraVerifierOutput() = default;

    template <class IO> UltraVerifierOutput(IO& inputs)
    {
        if constexpr (std::is_same_v<IO, HidingKernelIO>) {
            kernel_return_data = inputs.kernel_return_data;
            ecc_op_tables = inputs.ecc_op_tables;
        } else if constexpr (!std::is_same_v<IO, DefaultIO> && !std::is_same_v<IO, RollupIO>) {
            throw_or_abort("Invalid public input type.");
        }
    }
};

template <typename Flavor, class IO> class UltraVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Curve = typename Flavor::Curve;
    using VerificationKey = typename Flavor::VerificationKey;
    using Transcript = typename Flavor::Transcript;
    using Instance = VerifierInstance_<Flavor>;

    static constexpr bool IsRecursive = IsRecursiveFlavor<Flavor>;

    // Conditional types based on recursion
    using Builder = std::conditional_t<IsRecursive, typename Flavor::CircuitBuilder, void>;
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;

    using PublicInputs = std::vector<FF>;
    using Proof = typename Transcript::Proof;

    // Conditional output type: UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive
    using Output = std::conditional_t<IsRecursive,
                                      stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>,
                                      UltraVerifierOutput<Flavor>>;

    // IPA claim type: native uses curve::Grumpkin, recursive uses stdlib::grumpkin<Builder>
    using IPACurve = std::conditional_t<IsRecursive, stdlib::grumpkin<Builder>, curve::Grumpkin>;
    using IPAClaim = OpeningClaim<IPACurve>;

    /**
     * @brief Result of reducing ultra proof to pairing points check. Contains pairing points and the aggrefate result
     * of intermediate checks.
     */
    struct ReductionResult {
        PairingPoints pairing_points;     // KZG pairing points for deferred verification
        bool reduction_succeeded = false; // Sumcheck and libra evaluation consistency checks
    };

    /**
     * @brief Result of padding computation
     * @details Contains virtual log_n and padding indicator array for sumcheck/shplemini
     */
    struct PaddingData {
        size_t log_n;
        std::vector<FF> padding_indicator_array;
    };

    /**
     * @brief A constructor for native and recursive verifiers
     * @param vk_and_hash Contains verification key and its hash
     * @param transcript Transcript instance (optional, defaults to new transcript)
     *
     */
    using VKAndHash = typename Flavor::VKAndHash;
    explicit UltraVerifier_(const std::shared_ptr<VKAndHash>& vk_and_hash,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : vk_and_hash(vk_and_hash)
        , verifier_instance(std::make_shared<Instance>(vk_and_hash))
        , transcript(transcript)
    {
        if constexpr (!IsRecursive) {
            // Native only: create IPA transcript
            ipa_transcript = std::make_shared<Transcript>();
        } else {
            // Recursive only: extract builder from VKAndHash for later use
            // Safe since VKAndHash contains field_t elements (hash) with builder context
            builder = vk_and_hash->hash.get_context();
        }
    }

    /**
     * @brief Compute log_n and padding indicator array based on flavor configuration
     * @details Handles all combinations of native/recursive, ZK/non-ZK, and padding/no-padding:
     * - Non-ZK flavors: log_n from USE_PADDING, all 1s array
     * - ZK without padding: log_n from VK, all 1s array
     * - Native ZK with padding: VIRTUAL_LOG_N, simple loop comparison
     * - Recursive ZK with padding: VIRTUAL_LOG_N, in-circuit Lagrange computation
     * @return PaddingData containing log_n and padding_indicator_array
     */
    PaddingData process_padding() const;

    [[nodiscard("Reduction result should be verified")]] ReductionResult reduce_to_pairing_check(const Proof& proof);

    /**
     * @brief Split a combined rollup proof into honk and IPA components
     * @param combined_proof The concatenated [honk_proof | ipa_proof]
     * @return std::pair<Proof, Proof> The {honk_proof, ipa_proof} pair
     */
    std::pair<Proof, Proof> split_rollup_proof(const Proof& combined_proof) const
        requires(HasIPAAccumulator<Flavor>);

    /**
     * @brief Verify IPA proof for rollup circuits (native verifier only)
     * @param ipa_proof The IPA proof to verify
     * @param ipa_claim The IPA opening claim from public inputs
     * @return bool True if IPA verification succeeds
     */
    bool verify_ipa(const Proof& ipa_proof, const IPAClaim& ipa_claim)
        requires(!IsRecursiveFlavor<Flavor> && HasIPAAccumulator<Flavor>);

    /**
     * @brief Perform ultra verification
     * @details
     * For Rollup flavors, the proof is expected to be a combined [honk_proof | ipa_proof] and will be split
     * internally. For non-Rollup flavors, the proof is used as-is.
     *
     * - Native: Performs immediate pairing check (+ IPA verification for Rollup)
     * - Recursive: Returns pairing points (+ IPA proof for Rollup) for deferred verification
     *
     * @param proof The proof (combined with IPA for Rollup flavors)
     * @return Output (UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive)
     */
    Output verify_proof(const Proof& proof);

    /**
     * @brief Get the transcript (for accessing manifest in tests)
     */
    const std::shared_ptr<Transcript>& get_transcript() const { return transcript; }

    /**
     * @brief Get the verifier instance (for accessing VK and witness commitments in Chonk/Goblin)
     */
    const std::shared_ptr<Instance>& get_verifier_instance() const { return verifier_instance; }

    /**
     * @brief Get public inputs from the verifier instance
     */
    const PublicInputs& get_public_inputs() const { return verifier_instance->public_inputs; }

    /**
     * @brief Get witness commitments from the verifier instance
     */
    const typename Flavor::WitnessCommitments& get_witness_commitments() const
    {
        return verifier_instance->witness_commitments;
    }

    /**
     * @brief Get calldata commitment (MegaFlavor only)
     */
    const Commitment& get_calldata_commitment() const
        requires IsMegaFlavor<Flavor>
    {
        return verifier_instance->witness_commitments.calldata;
    }

    /**
     * @brief Get ECC op wire commitments as an array (MegaFlavor only)
     */
    auto get_ecc_op_wires() const
        requires IsMegaFlavor<Flavor>
    {
        return verifier_instance->witness_commitments.get_ecc_op_wires().get_copy();
    }

  private:
    std::shared_ptr<VKAndHash> vk_and_hash;
    std::shared_ptr<Instance> verifier_instance;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<Transcript> ipa_transcript; // Native only

    // Builder pointer (extracted from proof for recursive, nullptr for native)
    Builder* builder;
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
using MegaZKRecursiveVerifier = UltraVerifier_<MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                               stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>;

} // namespace bb
