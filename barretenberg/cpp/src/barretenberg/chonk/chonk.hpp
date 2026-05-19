// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_prover.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/circuit_input.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#ifndef NDEBUG
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#endif
#include <algorithm>

namespace bb {

/**
 * @brief The IVC scheme used by the aztec client for private function execution
 * @details Combines HyperNova with Goblin to accumulate one circuit at a time with efficient EC group
 * operations. It is assumed that the circuits being accumulated correspond alternatingly to an app and a kernel, as is
 * the case in Aztec. Two recursive folding verifiers are appended to each kernel (except the first one) to verify the
 * folding of a previous kernel and an app/function circuit. Due to this structure it is enforced that the total number
 * of circuits being accumulated is even.
 *
 */
class Chonk {
    // CHONK: "Client Honk" - An UltraHonk variant with incremental folding and delayed non-native arithmetic.

  public:
    // `Flavor` retained as the "shape-superset" alias. Per-circuit accumulation actually uses the
    // slimmer MegaAppFlavor / MegaKernelFlavor variants below; folding is heterogeneous because the
    // Hypernova accumulator is just two batched polynomials.
    using Flavor = MegaFlavor;
    using AppFlavor = MegaAppFlavor;
    using KernelFlavor = MegaKernelFlavor;
    using HidingKernelFlavor = MegaZKFlavor;
    using MegaVerificationKey = Flavor::VerificationKey;
    using AppVerificationKey = AppFlavor::VerificationKey;
    using KernelVerificationKey = KernelFlavor::VerificationKey;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using ProverPolynomials = Flavor::ProverPolynomials;
    using Point = Flavor::Curve::AffineElement;
    using ProverInstance = ProverInstance_<Flavor>;
    using HidingKernelProverInstance = ProverInstance_<MegaZKFlavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using MegaProver = UltraProver_<Flavor>;
    using Transcript = NativeTranscript;
    // Recursive types
    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using AppRecursiveFlavor = MegaAppRecursiveFlavor;
    using KernelRecursiveFlavor = MegaKernelRecursiveFlavor;
    using StdlibFF = RecursiveFlavor::FF;
    using RecursiveCommitment = RecursiveFlavor::Commitment;
    using RecursiveVerifierInstance = VerifierInstance_<RecursiveFlavor>;
    using AppRecursiveVerifierInstance = VerifierInstance_<AppRecursiveFlavor>;
    using KernelRecursiveVerifierInstance = VerifierInstance_<KernelRecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using RecursiveVKAndHash = RecursiveFlavor::VKAndHash;
    using AppRecursiveVKAndHash = AppRecursiveFlavor::VKAndHash;
    using KernelRecursiveVKAndHash = KernelRecursiveFlavor::VKAndHash;
    using RecursiveTranscript = RecursiveFlavor::Transcript;
    using PairingPoints = stdlib::recursion::PairingPoints<stdlib::bn254<ClientCircuit>>;
    using KernelIO = bb::stdlib::recursion::honk::KernelIO;
    using HidingKernelIO = bb::stdlib::recursion::honk::HidingKernelIO<ClientCircuit>;
    using AppIO = bb::stdlib::recursion::honk::AppIO;
    using StdlibProof = stdlib::Proof<ClientCircuit>;
    using WitnessCommitments = RecursiveFlavor::WitnessCommitments;
    using AppWitnessCommitments = AppRecursiveFlavor::WitnessCommitments;
    using KernelWitnessCommitments = KernelRecursiveFlavor::WitnessCommitments;
    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using TableCommitments = std::array<RecursiveFlavor::Commitment, ClientCircuit::NUM_WIRES>;
    // Folding. The Hypernova accumulator (MultilinearBatchingVerifierClaim<Curve>) is flavor-agnostic,
    // so apps and kernels (each with their own slim flavor) fold into the same accumulator type.
    using FoldingProver = HypernovaFoldingProver;
    using DeciderProver = HypernovaDeciderProver;
    using ProverAccumulator = FoldingProver::Accumulator;
    using VerifierAccumulator = MultilinearBatchingVerifierClaim<curve::BN254>;
    using RecursiveVerifierAccumulator = MultilinearBatchingVerifierClaim<stdlib::bn254<ClientCircuit>>;

    // Result types for decomposed verification steps
    struct FoldingResult {
        std::optional<RecursiveVerifierAccumulator> output_accumulator;
        std::vector<PairingPoints> pairing_points;
    };

    struct PublicInputsResult {
        PairingPoints pairing_points;
        std::optional<StdlibFF> ecc_op_hash; // set only for kernels
    };

    /**
     * @brief Proof type determining recursive verification logic in kernel circuits.
     *
     * @details This enum has dual semantics depending on context:
     *
     * PROVER PERSPECTIVE (in `accumulate`): Type assigned to the circuit being accumulated.
     * State machine transitions based on `num_circuits_accumulated`:
     *   - OINK:     First app (circuit 0) - no prior accumulator, just Oink verification
     *   - HN:       Apps 1..n-3, inner kernels, and reset kernels - full HyperNova folding verification
     *   - HN_TAIL:  Circuit n-3 (last kernel before tail)
     *   - HN_FINAL: Circuit n-2 (tail kernel) - final folding + decider verification
     *   - MEGA:     Circuit n-1 (hiding kernel) - MegaZK proof, no folding
     *
     * VERIFIER PERSPECTIVE (in `complete_kernel_circuit_logic`): Type of the proof being verified.
     *   - If verifying OINK proof → this kernel is the init kernel (circuit 1)
     *   - If verifying HN proof → this kernel is an inner/reset kernel
     *   - If verifying HN_TAIL proof → this kernel IS the tail kernel (circuit n-2)
     *   - If verifying HN_FINAL proof → this kernel IS the hiding kernel (circuit n-1)
     *
     *
     * See `get_queue_type()` for assignment logic and README.md#circuit-structure for overview.
     */
    enum class QUEUE_TYPE : uint8_t { OINK, HN, HN_TAIL, HN_FINAL, MEGA };

    // `CircuitKind` and `CircuitVerificationKey` are the PXE/bbapi-facing tag + VK surface; see
    // `chonk/circuit_input.hpp`. Re-exported as nested aliases so existing `Chonk::CircuitKind`
    // callers keep working.
    using CircuitKind = bb::CircuitKind;
    using CircuitVerificationKey = bb::CircuitVerificationKey;

    // An entry in the native verification queue. Only App and Kernel kinds appear here — the
    // hiding kernel does not fold and never lands in the queue. The matching VK pointer is the one
    // selected by `kind`.
    struct VerifierInputs {
        std::vector<FF> proof; // oink or HN
        std::shared_ptr<AppVerificationKey> app_honk_vk;
        std::shared_ptr<KernelVerificationKey> kernel_honk_vk;
        QUEUE_TYPE type;
        CircuitKind kind = CircuitKind::App;

        [[nodiscard]] bool is_kernel() const { return kind == CircuitKind::Kernel; }

        // Uniform accessor: returns num_public_inputs from whichever VK is populated.
        [[nodiscard]] size_t num_public_inputs() const
        {
            return is_kernel() ? kernel_honk_vk->num_public_inputs : app_honk_vk->num_public_inputs;
        }
    };
    using VerificationQueue = std::deque<VerifierInputs>;

    // An entry in the stdlib verification queue. Mirrors `VerifierInputs` on the stdlib side.
    struct StdlibVerifierInputs {
        StdlibProof proof; // oink or HN
        std::shared_ptr<AppRecursiveVKAndHash> app_honk_vk_and_hash;
        std::shared_ptr<KernelRecursiveVKAndHash> kernel_honk_vk_and_hash;
        QUEUE_TYPE type;
        CircuitKind kind = CircuitKind::App;

        // App constructor
        StdlibVerifierInputs(StdlibProof proof_,
                             std::shared_ptr<AppRecursiveVKAndHash> app_vk_and_hash_,
                             QUEUE_TYPE type_)
            : proof(std::move(proof_))
            , app_honk_vk_and_hash(std::move(app_vk_and_hash_))
            , type(type_)
            , kind(CircuitKind::App)
        {}

        // Kernel constructor
        StdlibVerifierInputs(StdlibProof proof_,
                             std::shared_ptr<KernelRecursiveVKAndHash> kernel_vk_and_hash_,
                             QUEUE_TYPE type_)
            : proof(std::move(proof_))
            , kernel_honk_vk_and_hash(std::move(kernel_vk_and_hash_))
            , type(type_)
            , kind(CircuitKind::Kernel)
        {}

        [[nodiscard]] bool is_kernel() const { return kind == CircuitKind::Kernel; }
    };
    using StdlibVerificationQueue = std::deque<StdlibVerifierInputs>;

  private:
    // Transcript for Chonk prover (shared between Hiding kernel, Merge, ECCVM, and Translator)
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    // Transcript to be shared across the folding of K_{i-1} (kernel), A_{i} (app)
    std::shared_ptr<Transcript> prover_accumulation_transcript = std::make_shared<Transcript>();

    size_t num_circuits; // total number of circuits to be accumulated in the IVC
  public:
    size_t num_circuits_accumulated = 0; // number of circuits accumulated so far

    ProverAccumulator prover_accumulator; // current HN prover accumulator instance

    HonkProof decider_proof; // decider proof to be verified in the Hiding kernel

    VerifierAccumulator recursive_verifier_native_accum; // native verifier accumulator used in recursive folding
#ifndef NDEBUG
    VerifierAccumulator native_verifier_accum; //  native verifier accumulator used in prover folding
    FF native_verifier_accum_hash; // hash of the native verifier accumulator when entering recursive verification
    bool is_previous_circuit_a_kernel = true;
    bool has_last_app_been_accumulated = false;
#endif

    // PARALLEL QUEUES: These two queues must stay synchronized.
    // - verification_queue: Native proofs created by accumulate() (prover side)
    // - stdlib_verification_queue: Circuit witnesses for complete_kernel_circuit_logic() (verifier side)
    // The stdlib queue is populated from the native queue via instantiate_stdlib_verification_queue().
    VerificationQueue verification_queue;
    StdlibVerificationQueue stdlib_verification_queue;

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    Goblin goblin;

    // Hiding kernel prover state: built during accumulate_hiding_kernel(), consumed by prove().
    std::shared_ptr<HidingKernelProverInstance> hiding_prover_inst;
    std::shared_ptr<MegaZKVerificationKey> hiding_vk;

    size_t get_num_circuits() const { return num_circuits; }

    Goblin& get_goblin() { return goblin; }
    const Goblin& get_goblin() const { return goblin; }

    Chonk(size_t num_circuits);

    void instantiate_stdlib_verification_queue(ClientCircuit& circuit,
                                               const std::vector<StdlibCircuitVKAndHash>& input_keys = {});

    [[nodiscard("Pairing points should be accumulated")]] std::
        tuple<std::optional<RecursiveVerifierAccumulator>, std::vector<PairingPoints>, StdlibFF>
        recursive_verification_and_consistency_checks(
            ClientCircuit& circuit,
            const StdlibVerifierInputs& verifier_inputs,
            const std::optional<RecursiveVerifierAccumulator>& input_verifier_accumulator,
            const std::optional<StdlibFF>& running_hash,
            const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript);

    // Complete the logic of a kernel circuit (e.g. HN/merge recursive verification, databus consistency checks)
    void complete_kernel_circuit_logic(ClientCircuit& circuit);

    /**
     * @brief Accumulate a circuit into the running IVC.
     *
     * @details Single entry point for all three circuit kinds; behavior is selected at runtime by
     * `kind`:
     *   - `CircuitKind::App`          → MegaAppFlavor, fold into `prover_accumulator`.
     *   - `CircuitKind::Kernel`       → MegaKernelFlavor, fold (with the previous kernel's
     *                                   accumulator); HN_FINAL also runs the Decider.
     *   - `CircuitKind::HidingKernel` → MegaZKFlavor; build the prover instance only, proving is
     *                                   deferred to `prove()`.
     *
     * The caller must pass the matching VK variant alternative for `kind`; mismatches throw
     * `std::bad_variant_access`.
     */
    void accumulate(ClientCircuit& circuit, CircuitKind kind, const CircuitVerificationKey& vk);

    /**
     * @brief What kind of circuit Chonk expects next, derived from the IVC state machine.
     *
     * Callers that don't yet have an out-of-band tag (PXE will eventually carry one) can use this
     * to pick the matching VK type before calling `accumulate`.
     */
    [[nodiscard]] CircuitKind next_circuit_kind() const;

    ChonkProof prove();

    static void hide_op_queue_content_in_hiding(ClientCircuit& circuit);

    /**
     * @brief Get the hiding kernel verification key and hash for Chonk verification
     * @return VKAndHash containing the MegaZK verification key and its hash
     */
    std::shared_ptr<MegaZKFlavor::VKAndHash> get_hiding_kernel_vk_and_hash() const;

  private:
#ifndef NDEBUG
    /**
     * @brief Update native verifier accumulator. Useful for debugging.
     *
     * @param queue_entry The verifier inputs from the queue.
     * @param verifier_transcript Verifier transcript corresponding to the prover transcript.
     */
    void update_native_verifier_accumulator(const VerifierInputs& queue_entry,
                                            const std::shared_ptr<Transcript>& verifier_transcript);

    void debug_incoming_circuit(ClientCircuit& circuit,
                                const std::shared_ptr<ProverInstance>& prover_instance,
                                const std::shared_ptr<MegaVerificationKey>& precomputed_vk);
#endif

    PublicInputsResult process_kernel_public_inputs(std::vector<StdlibFF>& public_inputs,
                                                    KernelWitnessCommitments& witness_commitments,
                                                    const std::optional<StdlibFF>& prev_accum_hash);
    PublicInputsResult process_app_public_inputs(std::vector<StdlibFF>& public_inputs,
                                                 AppWitnessCommitments& witness_commitments);

    void accumulate_and_fold(ClientCircuit& circuit, CircuitKind kind, QUEUE_TYPE queue_type);

    void accumulate_hiding_kernel(ClientCircuit& circuit, const std::shared_ptr<MegaZKVerificationKey>& precomputed_vk);

    QUEUE_TYPE get_queue_type() const;
};

} // namespace bb
