// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/chonk/chonk_base.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
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
class Chonk : public IVCBase {
    // CHONK: "Client Honk" - An UltraHonk variant with incremental folding and delayed non-native arithmetic.

  public:
    using Flavor = MegaFlavor;
    using MegaVerificationKey = Flavor::VerificationKey;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using ProverPolynomials = Flavor::ProverPolynomials;
    using Point = Flavor::Curve::AffineElement;
    using ProverInstance = ProverInstance_<Flavor>;
    using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using MegaProver = UltraProver_<Flavor>;
    using Transcript = NativeTranscript;
    // Recursive types
    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using StdlibFF = RecursiveFlavor::FF;
    using RecursiveCommitment = RecursiveFlavor::Commitment;
    using RecursiveVerifierInstance = VerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using RecursiveVKAndHash = RecursiveFlavor::VKAndHash;
    using RecursiveTranscript = RecursiveFlavor::Transcript;
    using PairingPoints = stdlib::recursion::PairingPoints<stdlib::bn254<ClientCircuit>>;
    using KernelIO = bb::stdlib::recursion::honk::KernelIO;
    using HidingKernelIO = bb::stdlib::recursion::honk::HidingKernelIO<ClientCircuit>;
    using AppIO = bb::stdlib::recursion::honk::AppIO;
    using StdlibProof = stdlib::Proof<ClientCircuit>;
    using WitnessCommitments = RecursiveFlavor::WitnessCommitments;
    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using TableCommitments = std::array<RecursiveFlavor::Commitment, ClientCircuit::NUM_WIRES>;
    // Folding
    using FoldingProver = HypernovaFoldingProver;
    using FoldingVerifier = HypernovaFoldingVerifier<Flavor>;
    using RecursiveFoldingVerifier = HypernovaFoldingVerifier<RecursiveFlavor>;
    using DeciderProver = HypernovaDeciderProver;
    using RecursiveDeciderVerifier = HypernovaDeciderVerifier<RecursiveFlavor>;
    using ProverAccumulator = FoldingProver::Accumulator;
    using VerifierAccumulator = FoldingVerifier::Accumulator;
    using RecursiveVerifierAccumulator = RecursiveFoldingVerifier::Accumulator;

    struct VerificationKey {
        std::shared_ptr<MegaVerificationKey> mega;
        std::shared_ptr<ECCVMVerificationKey> eccvm;
        std::shared_ptr<TranslatorVerificationKey> translator;

        /**
         * @brief Calculate the number of field elements needed for serialization
         * @return size_t Number of field elements
         */
        static size_t calc_num_data_types()
        {
            return MegaVerificationKey::calc_num_data_types() + ECCVMVerificationKey::calc_num_data_types() +
                   TranslatorVerificationKey::calc_num_data_types();
        }

        /**
         * @brief Serialize verification key to field elements
         * @return std::vector<bb::fr> The serialized field elements
         */
        std::vector<bb::fr> to_field_elements() const
        {
            std::vector<bb::fr> elements;

            auto mega_elements = mega->to_field_elements();
            elements.insert(elements.end(), mega_elements.begin(), mega_elements.end());

            auto eccvm_elements = eccvm->to_field_elements();
            elements.insert(elements.end(), eccvm_elements.begin(), eccvm_elements.end());

            auto translator_elements = translator->to_field_elements();
            elements.insert(elements.end(), translator_elements.begin(), translator_elements.end());

            return elements;
        }

        /**
         * @brief Deserialize verification key from field elements
         * @param elements The field elements to deserialize from
         * @return size_t Number of field elements read
         */
        size_t from_field_elements(std::span<const bb::fr> elements)
        {
            size_t read_idx = 0;

            mega = std::make_shared<MegaVerificationKey>();
            size_t mega_read = mega->from_field_elements(elements.subspan(read_idx));
            read_idx += mega_read;

            eccvm = std::make_shared<ECCVMVerificationKey>();
            size_t eccvm_read = eccvm->from_field_elements(elements.subspan(read_idx));
            read_idx += eccvm_read;

            translator = std::make_shared<TranslatorVerificationKey>();
            size_t translator_read = translator->from_field_elements(elements.subspan(read_idx));
            read_idx += translator_read;

            return read_idx;
        }
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
     *   - HN_TAIL:  Circuit n-3 (last kernel before tail) - adds ZK masking at op queue start
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

    // An entry in the native verification queue
    struct VerifierInputs {
        std::vector<FF> proof; // oink or HN
        std::shared_ptr<MegaVerificationKey> honk_vk;
        QUEUE_TYPE type;
        bool is_kernel = false;
    };
    using VerificationQueue = std::deque<VerifierInputs>;

    // An entry in the stdlib verification queue
    struct StdlibVerifierInputs {
        StdlibProof proof; // oink or HN
        std::shared_ptr<RecursiveVKAndHash> honk_vk_and_hash;
        QUEUE_TYPE type;
        bool is_kernel = false;
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
#endif

    // PARALLEL QUEUES: These two queues must stay synchronized.
    // - verification_queue: Native proofs created by accumulate() (prover side)
    // - stdlib_verification_queue: Circuit witnesses for complete_kernel_circuit_logic() (verifier side)
    // The stdlib queue is populated from the native queue via instantiate_stdlib_verification_queue().
    VerificationQueue verification_queue;
    StdlibVerificationQueue stdlib_verification_queue;

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    typename MegaFlavor::CommitmentKey bn254_commitment_key;

    Goblin goblin;

    size_t get_num_circuits() const { return num_circuits; }

    // IVCBase interface
    Goblin& get_goblin() override { return goblin; }
    const Goblin& get_goblin() const override { return goblin; }

    Chonk(size_t num_circuits);

    void instantiate_stdlib_verification_queue(ClientCircuit& circuit,
                                               const std::vector<std::shared_ptr<RecursiveVKAndHash>>& input_keys = {});

    [[nodiscard("Pairing points should be accumulated")]] std::
        tuple<std::optional<RecursiveVerifierAccumulator>, std::vector<PairingPoints>, TableCommitments>
        perform_recursive_verification_and_databus_consistency_checks(
            ClientCircuit& circuit,
            const StdlibVerifierInputs& verifier_inputs,
            const std::optional<RecursiveVerifierAccumulator>& input_verifier_accumulator,
            const TableCommitments& T_prev_commitments,
            const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript);

    // Complete the logic of a kernel circuit (e.g. HN/merge recursive verification, databus consistency checks)
    void complete_kernel_circuit_logic(ClientCircuit& circuit);

    /**
     * @brief Perform prover work for accumulation (e.g. HN folding, merge proving)
     *
     * @param circuit The incoming statement
     * @param precomputed_vk The verification key of the incoming statement OR a mocked key whose metadata needs to be
     * set using the proving key produced from `circuit` in order to pass some assertions in the Oink prover.
     * @param mock_vk A boolean to say whether the precomputed vk should have its metadata set.
     */
    void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk) override;

    ChonkProof prove();

    static void hide_op_queue_accumulation_result(ClientCircuit& circuit);
    static void hide_op_queue_content_in_tail(ClientCircuit& circuit);
    static void hide_op_queue_content_in_hiding(ClientCircuit& circuit);

    VerificationKey get_vk() const;

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

    HonkProof construct_honk_proof_for_hiding_kernel(ClientCircuit& circuit,
                                                     const std::shared_ptr<MegaVerificationKey>& verification_key);

    QUEUE_TYPE get_queue_type() const;
};

// Serialization methods for Chonk::VerificationKey
inline void read(uint8_t const*& it, Chonk::VerificationKey& vk)
{
    using serialize::read;

    size_t num_frs = Chonk::VerificationKey::calc_num_data_types();

    // Read exactly num_frs field elements from the buffer
    std::vector<bb::fr> field_elements(num_frs);
    for (auto& element : field_elements) {
        read(it, element);
    }

    // Then use from_field_elements to populate the verification key
    vk.from_field_elements(field_elements);
}

inline void write(std::vector<uint8_t>& buf, Chonk::VerificationKey const& vk)
{
    using serialize::write;

    // Convert to field elements and write them directly without length prefix
    auto field_elements = vk.to_field_elements();
    for (const auto& element : field_elements) {
        write(buf, element);
    }
}

} // namespace bb
