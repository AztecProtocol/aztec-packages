// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"
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
class ClientIVC {

  public:
    using Flavor = MegaFlavor;
    using MegaVerificationKey = Flavor::VerificationKey;
    using MegaZKVerificationKey = MegaZKFlavor::VerificationKey;
    using FF = Flavor::FF;
    using Point = Flavor::Curve::AffineElement;
    using FoldProof = std::vector<FF>;
    using ProverInstance = ProverInstance_<Flavor>;
    using DeciderZKProvingKey = ProverInstance_<MegaZKFlavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using DeciderProver = DeciderProver_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<VerifierInstance>;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using MegaProver = UltraProver_<Flavor>;
    using MegaVerifier = UltraVerifier_<Flavor>;
    using Transcript = NativeTranscript;

    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using RecursiveVerifierInstance = stdlib::recursion::honk::RecursiveVerifierInstance_<RecursiveFlavor>;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using RecursiveVKAndHash = RecursiveFlavor::VKAndHash;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtogalaxyRecursiveVerifier_<RecursiveVerifierInstance>;
    using OinkRecursiveVerifier = stdlib::recursion::honk::OinkRecursiveVerifier_<RecursiveFlavor>;
    using DeciderRecursiveVerifier = stdlib::recursion::honk::DeciderRecursiveVerifier_<RecursiveFlavor>;
    using RecursiveTranscript = RecursiveFlavor::Transcript;

    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using PairingPoints = stdlib::recursion::PairingPoints<ClientCircuit>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingPoints>;
    using KernelIO = bb::stdlib::recursion::honk::KernelIO;
    using HidingKernelIO = bb::stdlib::recursion::honk::HidingKernelIO<ClientCircuit>;
    using AppIO = bb::stdlib::recursion::honk::AppIO;
    using StdlibProof = stdlib::Proof<ClientCircuit>;
    using StdlibFF = RecursiveFlavor::FF;
    using WitnessCommitments = RecursiveFlavor::WitnessCommitments;

    // Merge commitments
    using TableCommitments = std::array<RecursiveFlavor::Commitment, ClientCircuit::NUM_WIRES>;

    /**
     * @brief A full proof for the IVC scheme containing a Mega proof showing correctness of the hiding circuit (which
     * recursive verified the last folding and decider proof) and a Goblin proof (translator VM, ECCVM and last merge
     * proof).
     *
     * @details This proof will be zero-knowledge.
     */
    struct Proof {
        HonkProof mega_proof;
        GoblinProof goblin_proof;

        /**
         * @brief The size of a ClientIVC proof without backend-added public inputs
         *
         * @param virtual_log_n
         * @return constexpr size_t
         */
        static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = MegaZKFlavor::VIRTUAL_LOG_N)
        {
            return /*mega_proof*/ MegaZKFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) +
                   /*merge_proof*/ MERGE_PROOF_SIZE +
                   /*eccvm pre-ipa proof*/ (ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH) +
                   /*eccvm ipa proof*/ IPA_PROOF_LENGTH +
                   /*translator*/ TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
        }

        /**
         * @brief The size of a ClientIVC proof with backend-added public inputs: HidingKernelIO
         *
         * @param virtual_log_n
         * @return constexpr size_t
         */
        static constexpr size_t PROOF_LENGTH(size_t virtual_log_n = MegaZKFlavor::VIRTUAL_LOG_N)
        {
            return PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) +
                   /*public_inputs*/ bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;
        }

        size_t size() const;

        /**
         * @brief Serialize proof to field elements
         *
         * @return std::vector<FF>
         */
        std::vector<FF> to_field_elements() const;

        static Proof from_field_elements(const std::vector<ClientIVC::FF>& fields);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1299): The following msgpack methods are generic
        // and should leverage some kind of shared msgpack utility.
        msgpack::sbuffer to_msgpack_buffer() const;

        /**
         * @brief Very quirky method to convert a msgpack buffer to a "heap" buffer
         * @details This method results in a buffer that is double-size-prefixed with the buffer size. This is to mimmic
         * the original bb.js behavior which did a *out_proof = to_heap_buffer(to_buffer(proof));
         *
         * @return uint8_t* Double size-prefixed msgpack buffer
         */
        uint8_t* to_msgpack_heap_buffer() const;
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIVCProof";

        class DeserializationError : public std::runtime_error {
          public:
            DeserializationError(const std::string& msg)
                : std::runtime_error(std::string("Client IVC Proof deserialization error: ") + msg)
            {}
        };

        static Proof from_msgpack_buffer(uint8_t const*& buffer);
        static Proof from_msgpack_buffer(const msgpack::sbuffer& buffer);

        void to_file_msgpack(const std::string& filename) const;
        static Proof from_file_msgpack(const std::string& filename);

        MSGPACK_FIELDS(mega_proof, goblin_proof);
        bool operator==(const Proof& other) const = default;
    };

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

    // Specifies proof type or equivalently the type of recursive verification to be performed on a given proof
    enum class QUEUE_TYPE {
        OINK,
        PG,
        PG_FINAL, // the final PG verification, used in hiding kernel
        PG_TAIL,  // used in tail to indicate special handling of merge for ZK
        MEGA
    };

    // An entry in the native verification queue
    struct VerifierInputs {
        std::vector<FF> proof; // oink or PG
        std::shared_ptr<MegaVerificationKey> honk_vk;
        QUEUE_TYPE type;
        bool is_kernel = false;
    };
    using VerificationQueue = std::deque<VerifierInputs>;

    // An entry in the stdlib verification queue
    struct StdlibVerifierInputs {
        StdlibProof proof; // oink or PG
        std::shared_ptr<RecursiveVKAndHash> honk_vk_and_hash;
        QUEUE_TYPE type;
        bool is_kernel = false;
    };
    using StdlibVerificationQueue = std::deque<StdlibVerifierInputs>;

    // Utility for tracking the max size of each block across the full IVC
    ExecutionTraceUsageTracker trace_usage_tracker;

  private:
    // Transcript for CIVC prover (shared between Hiding circuit, Merge, ECCVM, and Translator)
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    // Transcript to be shared across the folding of K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n}
    std::shared_ptr<Transcript> prover_accumulation_transcript = std::make_shared<Transcript>();

    size_t num_circuits; // total number of circuits to be accumulated in the IVC
  public:
    size_t num_circuits_accumulated = 0; // number of circuits accumulated so far

    std::shared_ptr<ProverInstance> prover_accumulator; // current PG prover accumulator instance
    HonkProof decider_proof;                            // decider proof to be verified in the hiding circuit

    std::shared_ptr<VerifierInstance>
        recursive_verifier_native_accum;                     // native verifier accumulator used in recursive folding
    std::shared_ptr<VerifierInstance> native_verifier_accum; //  native verifier accumulator used in prover folding

    // Set of tuples {proof, verification_key, type (Oink/PG)} to be recursively verified
    VerificationQueue verification_queue;
    // Set of tuples {stdlib_proof, stdlib_verification_key, type} corresponding to the native verification queue
    StdlibVerificationQueue stdlib_verification_queue;

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    // Settings related to the use of fixed block sizes for each gate in the execution trace
    TraceSettings trace_settings;

    typename MegaFlavor::CommitmentKey bn254_commitment_key;

    Goblin goblin;

    size_t get_num_circuits() const { return num_circuits; }

    ClientIVC(size_t num_circuits, TraceSettings trace_settings = {});

    void instantiate_stdlib_verification_queue(ClientCircuit& circuit,
                                               const std::vector<std::shared_ptr<RecursiveVKAndHash>>& input_keys = {});

    [[nodiscard("Pairing points should be accumulated")]] std::
        tuple<std::shared_ptr<RecursiveVerifierInstance>, PairingPoints, TableCommitments>
        perform_recursive_verification_and_databus_consistency_checks(
            ClientCircuit& circuit,
            const StdlibVerifierInputs& verifier_inputs,
            const std::shared_ptr<RecursiveVerifierInstance>& input_verifier_accumulator,
            const TableCommitments& T_prev_commitments,
            const std::shared_ptr<RecursiveTranscript>& accumulation_recursive_transcript);

    // Complete the logic of a kernel circuit (e.g. PG/merge recursive verification, databus consistency checks)
    void complete_kernel_circuit_logic(ClientCircuit& circuit);

    /**
     * @brief Perform prover work for accumulation (e.g. PG folding, merge proving)
     *
     * @param circuit The incoming statement
     * @param precomputed_vk The verification key of the incoming statement OR a mocked key whose metadata needs to be
     * set using the proving key produced from `circuit` in order to pass some assertions in the Oink prover.
     * @param mock_vk A boolean to say whether the precomputed vk should have its metadata set.
     */
    void accumulate(ClientCircuit& circuit, const std::shared_ptr<MegaVerificationKey>& precomputed_vk);

    Proof prove();

    static void hide_op_queue_accumulation_result(ClientCircuit& circuit);
    static void hide_op_queue_content_in_tail(ClientCircuit& circuit);
    static void hide_op_queue_content_in_hiding(ClientCircuit& circuit);

    static bool verify(const Proof& proof, const VerificationKey& vk);

    HonkProof construct_decider_proof(const std::shared_ptr<Transcript>& transcript);

    VerificationKey get_vk() const;

  private:
    /**
     * @brief Runs either Oink or PG native verifier to update the native verifier accumulator
     *
     * @param queue_entry The verifier inputs from the queue.
     * @param verifier_transcript Verifier transcript corresponding to the prover transcript.
     */
    void update_native_verifier_accumulator(const VerifierInputs& queue_entry,
                                            const std::shared_ptr<Transcript>& verifier_transcript);

    HonkProof construct_oink_proof(const std::shared_ptr<ProverInstance>& prover_instance,
                                   const std::shared_ptr<MegaVerificationKey>& honk_vk,
                                   const std::shared_ptr<Transcript>& transcript);

    HonkProof construct_pg_proof(const std::shared_ptr<ProverInstance>& prover_instance,
                                 const std::shared_ptr<MegaVerificationKey>& honk_vk,
                                 const std::shared_ptr<Transcript>& transcript,
                                 bool is_kernel);

    HonkProof construct_honk_proof_for_hiding_kernel(ClientCircuit& circuit,
                                                     const std::shared_ptr<MegaVerificationKey>& verification_key);

    QUEUE_TYPE get_queue_type() const;

    static std::shared_ptr<RecursiveVerifierInstance> perform_oink_recursive_verification(
        ClientCircuit& circuit,
        const std::shared_ptr<RecursiveVerifierInstance>& verifier_instance,
        const std::shared_ptr<RecursiveTranscript>& transcript,
        const StdlibProof& proof);

    static std::shared_ptr<RecursiveVerifierInstance> perform_pg_recursive_verification(
        ClientCircuit& circuit,
        const std::shared_ptr<RecursiveVerifierInstance>& verifier_accumulator,
        const std::shared_ptr<RecursiveVerifierInstance>& verifier_instance,
        const std::shared_ptr<RecursiveTranscript>& transcript,
        const StdlibProof& proof,
        std::optional<StdlibFF>& prev_accum_hash,
        bool is_kernel);
};

// Serialization methods for ClientIVC::VerificationKey
inline void read(uint8_t const*& it, ClientIVC::VerificationKey& vk)
{
    using serialize::read;

    size_t num_frs = ClientIVC::VerificationKey::calc_num_data_types();

    // Read exactly num_frs field elements from the buffer
    std::vector<bb::fr> field_elements(num_frs);
    for (auto& element : field_elements) {
        read(it, element);
    }

    // Then use from_field_elements to populate the verification key
    vk.from_field_elements(field_elements);
}

inline void write(std::vector<uint8_t>& buf, ClientIVC::VerificationKey const& vk)
{
    using serialize::write;

    // Convert to field elements and write them directly without length prefix
    auto field_elements = vk.to_field_elements();
    for (const auto& element : field_elements) {
        write(buf, element);
    }
}

} // namespace bb
