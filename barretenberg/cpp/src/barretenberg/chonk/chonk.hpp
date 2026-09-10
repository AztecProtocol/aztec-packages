// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_prover.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/circuit_input.hpp"
#include "barretenberg/chonk/kernel_completion.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"
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
    // Per-circuit accumulation uses these Mega flavors; folding is heterogeneous (different
    // flavors per slot) because the Hypernova accumulator only depends on `MultilinearBatchingFlavor`.
    using AppFlavor = MegaAppFlavor;
    using KernelFlavor = MegaKernelFlavor;
    using HidingKernelFlavor = MegaZKFlavor;
    using AppVerificationKey = AppFlavor::VerificationKey;
    using KernelVerificationKey = KernelFlavor::VerificationKey;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
    // Common to all Mega flavors (all BN254).
    using FF = bb::fr;
    using Commitment = curve::BN254::AffineElement;
    using HidingKernelProverInstance = ProverInstance_<HidingKernelFlavor>;
    // One circuit type per kind: each is `Flavor::CircuitBuilder`, so a circuit can only be proven with the
    // flavor whose relations constrain its arithmetization.
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using Transcript = NativeTranscript;
    // Folding: the Hypernova accumulator is flavor-agnostic, so all kinds share one accumulator type.
    using FoldingProver = HypernovaFoldingProver;
    using DeciderProver = HypernovaDeciderProver;
    using ProverAccumulator = FoldingProver::Accumulator;
    using VerifierAccumulator = MultilinearBatchingVerifierClaim<curve::BN254>;

    using CircuitKind = bb::CircuitKind;
    using CircuitVerificationKey = bb::CircuitVerificationKey;

    struct VerifierInputs {
        std::vector<FF> proof; // oink or HN
        std::shared_ptr<AppVerificationKey> app_honk_vk;
        std::shared_ptr<KernelVerificationKey> kernel_honk_vk;
        CircuitKind kind = CircuitKind::App;

        [[nodiscard]] bool is_kernel() const { return kind == CircuitKind::Kernel; }

        [[nodiscard]] size_t num_public_inputs() const
        {
            return static_cast<size_t>(is_kernel() ? kernel_honk_vk->num_public_inputs
                                                   : app_honk_vk->num_public_inputs);
        }
        [[nodiscard]] std::vector<FF> vk_to_field_elements() const
        {
            return is_kernel() ? kernel_honk_vk->to_field_elements() : app_honk_vk->to_field_elements();
        }
        [[nodiscard]] FF vk_hash() const { return is_kernel() ? kernel_honk_vk->hash() : app_honk_vk->hash(); }
    };
    using VerificationQueue = std::deque<VerifierInputs>;

  private:
    // Transcript for Chonk prover (shared between Hiding kernel, Merge, ECCVM, and Translator)
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    // Transcript to be shared across the folding of K_{i-1} (kernel), A_{i} (app)
    std::shared_ptr<Transcript> prover_accumulation_transcript = std::make_shared<Transcript>();

    std::vector<CircuitKind> circuit_kinds; // kind of every circuit in the IVC stack, in accumulation order
    size_t num_circuits;                    // total number of circuits to be accumulated in the IVC

    size_t num_circuits_accumulated = 0; // number of circuits accumulated so far

    std::shared_ptr<FoldingProver> folding_prover; // folds the current group; (re)created at each group start
#ifndef NDEBUG
    VerifierAccumulator native_verifier_accum;
    std::shared_ptr<HypernovaFoldingNativeVerifier> native_folding_verifier; // native cross-check of the current group
    std::shared_ptr<Transcript> native_verifier_accumulation_transcript = std::make_shared<Transcript>();
#endif

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    // Hiding kernel prover instance: built during accumulate_hiding_kernel(), consumed by prove().
    std::shared_ptr<HidingKernelProverInstance> hiding_prover_inst;

  protected:
    // Previous accumulator (output of the previous kernel's batch). Its polynomials are released once the hiding
    // kernel's decider proof is constructed.
    ProverAccumulator prover_accumulator;

  public:
    HonkProof
        multilinear_batch_proof; // current kernel's multilinear batching proof (consumed in its recursive verifier)

    HonkProof decider_proof; // decider proof to be verified in the Hiding kernel

    VerifierAccumulator recursive_verifier_native_accum; // native value of the previous accumulator

    // PARALLEL QUEUES: These two queues must stay synchronized.
    // - verification_queue: Native proofs created by accumulate() (prover side)
    // - stdlib_verification_queue: Circuit witnesses for complete_kernel_circuit_logic() (verifier side)
    // The stdlib queue is populated from the native queue via instantiate_stdlib_verification_queue().
    VerificationQueue verification_queue;

    // Kernel-side recursive verification stdlib, one instantiation per kernel arithmetization. Each owns its
    // own stdlib verification queue and databus depot.
    KernelCompletion<KernelCircuit> kernel_completion{ *this };
    KernelCompletion<HidingKernelCircuit> hiding_kernel_completion{ *this };

    Goblin goblin;

    // Hiding kernel VK: set during accumulate_hiding_kernel().
    std::shared_ptr<MegaZKVerificationKey> hiding_vk;

    /**
     * @brief Number of claims a kernel batches: the previous accumulator (absent for the init kernel) plus one
     * sumcheck claim per proof in the group. A single claim needs no batching proof.
     */
    static constexpr size_t group_claim_count(bool has_previous_accumulator, size_t group_size)
    {
        return (has_previous_accumulator ? 1 : 0) + group_size;
    }

    size_t get_num_circuits() const { return num_circuits; }

    Goblin& get_goblin() { return goblin; }
    const Goblin& get_goblin() const { return goblin; }

    Chonk(std::vector<CircuitKind> circuit_kinds);

    /**
     * @brief The kernel-side stdlib for the arithmetization of `Circuit`.
     */
    template <IsKernelCircuit Circuit> KernelCompletion<Circuit>& completion_for()
    {
        if constexpr (std::same_as<Circuit, KernelCircuit>) {
            return kernel_completion;
        } else {
            return hiding_kernel_completion;
        }
    }
    template <IsKernelCircuit Circuit> const KernelCompletion<Circuit>& completion_for() const
    {
        return const_cast<Chonk*>(this)->completion_for<Circuit>();
    }

    template <IsKernelCircuit Circuit>
    void instantiate_stdlib_verification_queue(Circuit& circuit,
                                               const std::vector<StdlibCircuitVKAndHash<Circuit>>& input_keys = {})
    {
        completion_for<Circuit>().instantiate_stdlib_verification_queue(circuit, input_keys);
    }

    // Complete the logic of a kernel circuit (e.g. HN/merge recursive verification, databus consistency checks)
    template <IsKernelCircuit Circuit> void complete_kernel_circuit_logic(Circuit& circuit)
    {
        completion_for<Circuit>().complete_kernel_circuit_logic(circuit);
    }

    /**
     * @brief Accumulate a circuit into the running IVC.
     *
     * @details Single entry point for circuit accumulation. Internally, it selects the correct flavor for
     * accumulation based on the kind of the circuit processed (which are provided to Chonk at construction):
     *   - `CircuitKind::App`          → MegaAppFlavor
     *   - `CircuitKind::Kernel`       → MegaKernelFlavor
     *   - `CircuitKind::HidingKernel` → MegaZKFlavor
     *
     * Each accumulation step:
     * - Transforms the incoming circuit into an Hypernova accumulator
     * - When the next circuit is a kernel, also produces the kernel's multilinear batching proof
     * - When the next circuit is the hiding kernel, also produces the decider proof
     *
     * If we are accumulating the hiding kernel, we construct its prover_instance.
     *
     * @note `Circuit`'s arithmetization fixes the kind being accumulated, and the caller must pass the VK
     * variant alternative matching it; mismatches throw `std::bad_variant_access`. Supplying a circuit whose
     * kind disagrees with `current_kind()` throws.
     */
    template <IsChonkCircuit Circuit> void accumulate(Circuit& circuit, const CircuitVerificationKey& vk);

    /**
     * @brief Kind of the circuit currently being accumulated (or, between accumulate calls, the next one expected).
     */
    [[nodiscard]] CircuitKind current_kind() const;

    /**
     * @brief Kind of the circuit that follows the one currently being accumulated, or CircuitKind::None if the
     * current circuit is the last in the stack.
     */
    [[nodiscard]] CircuitKind next_kind() const;

    /**
     * @brief Whether the kernel currently being completed is the init kernel (the first kernel, which carries
     * no accumulator from a previous kernel).
     * @details Derived from the group queued for verification: the init kernel's group begins with the first
     * app's proof, whereas every later kernel's group begins with the previous kernel's proof. Must be
     * called once the stdlib verification queue holds the current kernel's group.
     */
    template <IsKernelCircuit Circuit> [[nodiscard]] bool is_init_kernel() const
    {
        return completion_for<Circuit>().is_init_kernel();
    }

    /**
     * @brief Whether the circuit currently being accumulated/completed is the hiding kernel.
     * @details Derived from the circuit kinds supplied at construction: the hiding kernel is the final circuit
     * in the stack.
     */
    [[nodiscard]] bool is_hiding_kernel() const { return current_kind() == CircuitKind::HidingKernel; }

    /**
     * @brief Get the number of circuits accumulated by the IVC
     *
     */
    size_t get_num_circuits_accumulated() const { return num_circuits_accumulated; }

    /**
     * @brief Set the num circuits accumulated for mocking an IVC state. Used when writing VKs.
     *
     */
    void set_num_circuits_accumulated_for_mocking(const size_t num_circuits)
    {
        num_circuits_accumulated = num_circuits;
    }

    ChonkProof prove();

    /**
     * @brief Get the hiding kernel verification key and hash for Chonk verification
     * @return VKAndHash containing the MegaZK verification key and its hash
     */
    std::shared_ptr<MegaZKFlavor::VKAndHash> get_hiding_kernel_vk_and_hash() const;

  private:
#ifndef NDEBUG
    /**
     * @brief Natively verify the instance-to-accumulator sumcheck of the circuit just accumulated. Useful for
     * debugging.
     *
     * @param queue_entry The verifier inputs from the queue.
     */
    void verify_native_instance_sumcheck(const VerifierInputs& queue_entry);

    /**
     * @brief Templated native verification of the instance to accumulator sumcheck.
     *
     */
    template <typename NativeFlavor>
    void run_native_instance_sumcheck(const std::shared_ptr<typename NativeFlavor::VerificationKey>& honk_vk,
                                      const VerifierInputs& queue_entry);

    /**
     * @brief Natively verify the multilinear batching proof and update the native verifier
     * accumulator. Useful for debugging.
     *
     * @details Batches the previous accumulator (absent for the init group) with the
     * group's collected sumcheck claims, mirroring prove_multilinear_batching, and cross-checks the result against
     * the prover accumulator.
     */
    void update_native_verifier_accumulator(bool is_init_group);

    // Debug-only native verification of the decider proof against the final native verifier accumulator.
    void verify_decider_natively();

    // Debug-only logging for an incoming circuit being folded: validity, and whether its precomputed
    // VK matches the one derived during accumulation. Templated on the circuit's InstanceFlavor.
    template <typename InstanceFlavor>
    void debug_incoming_circuit(typename InstanceFlavor::CircuitBuilder& circuit,
                                const std::shared_ptr<ProverInstance_<InstanceFlavor>>& prover_instance,
                                const std::shared_ptr<typename InstanceFlavor::VerificationKey>& precomputed_vk);

#endif

    /**
     * @brief Turn the incoming instance into an accumulator. If a kernel follows, also produce a multilinear batching
     * proof.
     *
     */
    template <IsChonkCircuit Circuit> void accumulate_and_fold(Circuit& circuit, const CircuitVerificationKey& vk);

    /**
     * @brief Generate multilinear batching proof for the current group of accumulators.
     *
     * @details In between kernels, instances are turned into accumulators. When we reach the last app in a group, we
     * generate a single proof that batches the accumulators in the group into a single accumulator, which will be
     * propagated by the following kernel.
     *
     */
    void prove_multilinear_batching();

    template <typename InstanceFlavor>
    HonkProof instance_to_accumulator(typename InstanceFlavor::CircuitBuilder& circuit,
                                      const std::shared_ptr<typename InstanceFlavor::VerificationKey>& vk);

    void accumulate_hiding_kernel(HidingKernelCircuit& circuit,
                                  const std::shared_ptr<MegaZKVerificationKey>& precomputed_vk);
};

} // namespace bb
