// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/chonk/circuit_input.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

#include <deque>
#include <optional>
#include <utility>
#include <vector>

namespace bb {

class Chonk;

/**
 * @brief The recursive-verification logic a kernel circuit carries.
 *
 * @details Chonk itself handles all three circuit kinds and drives accumulation; only the stdlib appended
 * *inside* a kernel lives here. This owns the state that exists solely for kernel completion: the stdlib
 * verification queue, which mirrors the IVC's native queue, and the databus depot.
 */
class KernelCompletion {
  public:
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using KernelRecursiveFlavor = MegaKernelRecursiveFlavor;
    using AppRecursiveFlavor = MegaAppRecursiveFlavor;
    // Recursive scalar / commitment / transcript shapes are common to the App and Kernel recursive flavors
    // (shared BN254 stdlib base), so these aliases are sourced from the kernel one.
    using StdlibFF = KernelRecursiveFlavor::FF;
    using RecursiveCurve = KernelRecursiveFlavor::Curve;
    using RecursiveCommitment = KernelRecursiveFlavor::Commitment;
    using RecursiveTranscript = KernelRecursiveFlavor::Transcript;
    using AppRecursiveVerifierInstance = VerifierInstance_<AppRecursiveFlavor>;
    using KernelRecursiveVerifierInstance = VerifierInstance_<KernelRecursiveFlavor>;
    using AppRecursiveVKAndHash = AppRecursiveFlavor::VKAndHash;
    using KernelRecursiveVKAndHash = KernelRecursiveFlavor::VKAndHash;
    using AppWitnessCommitments = AppRecursiveFlavor::WitnessCommitments;
    using KernelWitnessCommitments = KernelRecursiveFlavor::WitnessCommitments;
    using PairingPoints = stdlib::recursion::PairingPoints<RecursiveCurve>;
    using StdlibProof = stdlib::Proof<ClientCircuit>;
    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using KernelIO = stdlib::recursion::honk::KernelIO;
    using HidingKernelIO = stdlib::recursion::honk::HidingKernelIO<ClientCircuit>;
    using FoldingRecursiveVerifier = HypernovaFoldingRecursiveVerifier;
    // The decider is flavor-independent; the flavor supplies only HasZK (= false) and whether we are in-circuit.
    using RecursiveDeciderVerifier = HypernovaDeciderVerifier<KernelRecursiveFlavor>;
    using RecursiveVerifierAccumulator = MultilinearBatchingVerifierClaim<RecursiveCurve>;
    // Ecc running hash passed to the hiding kernel
    using EccOpRunningHash = StdlibFF;

    struct StdlibVerifierInputs {
        StdlibProof proof; // oink or HN
        std::shared_ptr<AppRecursiveVKAndHash> app_honk_vk_and_hash;
        std::shared_ptr<KernelRecursiveVKAndHash> kernel_honk_vk_and_hash;
        CircuitKind kind = CircuitKind::None;

        StdlibVerifierInputs(StdlibProof proof_, std::shared_ptr<AppRecursiveVKAndHash> app_vk_and_hash_)
            : proof(std::move(proof_))
            , app_honk_vk_and_hash(std::move(app_vk_and_hash_))
            , kind(CircuitKind::App)
        {}

        StdlibVerifierInputs(StdlibProof proof_, std::shared_ptr<KernelRecursiveVKAndHash> kernel_vk_and_hash_)
            : proof(std::move(proof_))
            , kernel_honk_vk_and_hash(std::move(kernel_vk_and_hash_))
            , kind(CircuitKind::Kernel)
        {}

        [[nodiscard]] bool is_kernel() const { return kind == CircuitKind::Kernel; }

        [[nodiscard]] size_t vk_num_public_inputs() const
        {
            return static_cast<size_t>(uint64_t(is_kernel() ? kernel_honk_vk_and_hash->vk->num_public_inputs.get_value()
                                                            : app_honk_vk_and_hash->vk->num_public_inputs.get_value()));
        }
    };
    using StdlibVerificationQueue = std::deque<StdlibVerifierInputs>;

    explicit KernelCompletion(Chonk& ivc)
        : ivc(ivc)
    {}

    // `ivc` is a back-reference to the owning Chonk, so a copy would refer to the *source's* Chonk rather than
    // its own. Copy/move assignment is already implicitly deleted by the reference member; construction is not,
    // and would silently produce that mis-binding. Deleting all four keeps Chonk uncopyable too, via this member.
    KernelCompletion(const KernelCompletion&) = delete;
    KernelCompletion& operator=(const KernelCompletion&) = delete;
    KernelCompletion(KernelCompletion&&) = delete;
    KernelCompletion& operator=(KernelCompletion&&) = delete;

    /**
     * @brief Instantiate a stdlib verification queue for use in the kernel completion logic
     * @details Construct a stdlib proof/verification_key for each entry in the IVC's native verification queue.
     * By default, both are constructed from their counterpart in the native queue. Alternatively, stdlib
     * verification keys can be provided directly as input to this method. (The latter option is used, for example,
     * when constructing recursive verifiers based on the verification key witnesses from an acir recursion
     * constraint. This option is not provided for proofs since valid proof witnesses are in general not known at
     * the time of acir constraint generation).
     */
    void instantiate_stdlib_verification_queue(ClientCircuit& circuit,
                                               const std::vector<StdlibCircuitVKAndHash>& input_keys = {});

    /**
     * @brief Append logic to complete a kernel circuit (HN/merge recursive verification, databus consistency
     * checks, public input propagation).
     */
    void complete_kernel_circuit_logic(ClientCircuit& circuit);

    /**
     * @brief Whether the kernel currently being completed is the init kernel (the first kernel, which carries
     * no accumulator from a previous kernel).
     * @details Derived from the group queued for verification: the init kernel's group begins with the first
     * app's proof, whereas every later kernel's group begins with the previous kernel's proof. Must be
     * called once the stdlib verification queue holds the current kernel's group.
     */
    [[nodiscard]] bool is_init_kernel() const;

    // PARALLEL QUEUES: this queue must stay synchronized with the IVC's native `verification_queue`.
    // - Chonk::verification_queue: native proofs created by accumulate() (prover side)
    // - stdlib_verification_queue: circuit witnesses for complete_kernel_circuit_logic() (verifier side)
    // The stdlib queue is populated from the native queue via instantiate_stdlib_verification_queue().
    StdlibVerificationQueue stdlib_verification_queue;

  private:
    // Result types for decomposed verification steps
    struct PublicInputsResult {
        PairingPoints pairing_points;
        std::optional<StdlibFF> ecc_op_hash; // set only for kernels
    };

    /**
     * @brief Run sumcheck on a single proof in the group and perform its databus/accumulator-hash consistency
     * checks.
     * @details Delegates to two steps: (1) sumcheck on the incoming instance to obtain its claim (no multilinear
     * batching), and (2) public inputs processing and databus consistency checks. Returns the resulting pairing
     * points and the updated ECC-op running hash. The claim is cached in the folding verifier and batched
     * together with the rest of the group at the end of the kernel.
     */
    [[nodiscard("Pairing points should be collected")]] std::pair<PairingPoints, EccOpRunningHash>
    recursive_verification_and_consistency_checks(const StdlibVerifierInputs& verifier_inputs,
                                                  FoldingRecursiveVerifier& folding_verifier,
                                                  const std::optional<StdlibFF>& prev_stdlib_acc_hash,
                                                  const std::optional<EccOpRunningHash>& running_ecc_op_hash);

    /**
     * @brief Reconstruct KernelIO from a verified kernel's public inputs, check that its databus return-data
     * commitments match the witness commitments and that its accumulator hash matches the carried one, and
     * return its pairing points and ECC op running hash. Records the kernel's return-data commitment in the
     * bus depot.
     *
     * @param public_inputs The public inputs extracted from the verifier instance that was folded into the
     * running accumulator
     * @param witness_commitments The witness commitments extracted from the verifier instance that was folded
     * into the running accumulator
     * @param prev_accum_hash The accumulator hash from the previous kernel
     */
    PublicInputsResult process_kernel_public_inputs(std::vector<StdlibFF>& public_inputs,
                                                    KernelWitnessCommitments& witness_commitments,
                                                    const std::optional<StdlibFF>& prev_accum_hash);

    /**
     * @brief Reconstruct AppIO from a verified app's public inputs and record its return-data commitment.
     */
    PublicInputsResult process_app_public_inputs(std::vector<StdlibFF>& public_inputs,
                                                 AppWitnessCommitments& witness_commitments);

    /**
     * @brief Adds two random non-ops to the hiding kernel for zero-knowledge.
     * @details See MERGE_PROTOCOL.md (ZK Considerations) for detailed analysis.
     */
    static void hide_op_queue_content(ClientCircuit& circuit);

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    Chonk& ivc;
};

} // namespace bb
