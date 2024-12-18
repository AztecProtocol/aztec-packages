#pragma once

#include "barretenberg/plonk_honk_shared/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <algorithm>

namespace bb {

/**
 * @brief The IVC scheme used by the aztec client for private function execution
 * @details Combines Protogalaxy with Goblin to accumulate one circuit at a time with efficient EC group
 * operations. It is assumed that the circuits being accumulated correspond alternatingly to an app and a kernel, as is
 * the case in Aztec. Two recursive folding verifiers are appended to each kernel (except the first one) to verify the
 * folding of a previous kernel and an app/function circuit. Due to this structure it is enforced that the total number
 * of circuits being accumulated is even.
 *
 */
class UltraVanillaClientIVC {

  public:
    using Flavor = UltraFlavor;
    using FF = Flavor::FF;
    using ClientCircuit = UltraCircuitBuilder;
    using PK = DeciderProvingKey_<Flavor>;

    using RecursiveFlavor = UltraRecursiveFlavor_<bb::UltraCircuitBuilder>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;

    using Proof = HonkProof;
    using VK = UltraFlavor::VerificationKey;

    // An entry in the native verification queue
    struct VerifierInputs {
        HonkProof proof;
        // std::shared_ptr<MegaVerificationKey> honk_verification_key;
        // QUEUE_TYPE type;
    };
    using VerificationQueue = std::vector<VerifierInputs>;

    // An entry in the stdlib verification queue
    struct StdlibVerifierInputs {
        StdlibProof<ClientCircuit> proof;
        // std::shared_ptr<RecursiveVerificationKey> honk_verification_key;
        // QUEUE_TYPE type;
    };

    using StdlibVerificationQueue = std::vector<StdlibVerifierInputs>;

  public:
    // ProverOutput fold_output; // prover accumulator and fold proof
    HonkProof previous_proof;

    stdlib::recursion::aggregation_state<stdlib::bn254<ClientCircuit>> verifier_accumulator;
    std::shared_ptr<VK> vk;

    // Set of tuples {proof, verification_key, type} to be recursively verified
    VerificationQueue verification_queue;

    std::shared_ptr<typename MegaFlavor::CommitmentKey> bn254_commitment_key;

    // We dynamically detect whether the input stack consists of one circuit, in which case we do not construct the
    // hiding circuit and instead simply prove the single input circuit.
    bool one_circuit = false;

    UltraVanillaClientIVC(const size_t dyadic_size)
        : bn254_commitment_key(std::make_shared<CommitmentKey<curve::BN254>>(dyadic_size))
    {}

    void accumulate(ClientCircuit& circuit, const std::shared_ptr<VK>& precomputed_vk = nullptr);

    Proof prove();

    static bool verify(const Proof& proof, const VK& vk);

    bool verify(const Proof& proof);

    bool prove_and_verify();
};
} // namespace bb