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
#include "barretenberg/stdlib/protogalaxy_verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
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
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderZKProvingKey = DeciderProvingKey_<MegaZKFlavor>;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using DeciderProver = DeciderProver_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<Flavor>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using MegaProver = UltraProver_<Flavor>;
    using MegaVerifier = UltraVerifier_<Flavor>;
    using Transcript = NativeTranscript;

    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using RecursiveDeciderVerificationKeys =
        bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using OinkRecursiveVerifier = stdlib::recursion::honk::OinkRecursiveVerifier_<RecursiveFlavor>;
    using DeciderRecursiveVerifier = stdlib::recursion::honk::DeciderRecursiveVerifier_<RecursiveFlavor>;
    using RecursiveTranscript = RecursiveFlavor::Transcript;

    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using PairingPoints = stdlib::recursion::PairingPoints<ClientCircuit>;
    using PublicPairingPoints = stdlib::PublicInputComponent<PairingPoints>;

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

        size_t size() const;

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
    };

    struct VerificationKey {
        std::shared_ptr<MegaVerificationKey> mega;
        std::shared_ptr<ECCVMVerificationKey> eccvm;
        std::shared_ptr<TranslatorVerificationKey> translator;

        MSGPACK_FIELDS(mega, eccvm, translator);
    };

    enum class QUEUE_TYPE { OINK, PG }; // for specifying type of proof in the verification queue

    // An entry in the native verification queue
    struct VerifierInputs {
        std::vector<FF> proof; // oink or PG
        std::shared_ptr<MegaVerificationKey> honk_verification_key;
        QUEUE_TYPE type;
    };
    using VerificationQueue = std::deque<VerifierInputs>;

    // An entry in the stdlib verification queue
    struct StdlibVerifierInputs {
        StdlibProof<ClientCircuit> proof; // oink or PG
        std::shared_ptr<RecursiveVerificationKey> honk_verification_key;
        QUEUE_TYPE type;
    };
    using StdlibVerificationQueue = std::deque<StdlibVerifierInputs>;

    // Utility for tracking the max size of each block across the full IVC
    ExecutionTraceUsageTracker trace_usage_tracker;

  private:
    using ProverFoldOutput = FoldingResult<Flavor>;

    // Transcript for CIVC prover (shared between Hiding circuit, Merge, ECCVM, and Translator)
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    // Transcript to be shared across the folding of K_{i-1} (kernel), A_{i,1} (app), .., A_{i, n}
    std::shared_ptr<Transcript> accumulation_transcript = std::make_shared<Transcript>();

  public:
    ProverFoldOutput fold_output; // prover accumulator and fold proof
    HonkProof mega_proof;

    std::shared_ptr<DeciderVerificationKey> verifier_accumulator; // verifier accumulator
    std::shared_ptr<MegaVerificationKey> honk_vk; // honk vk to be completed and folded into the accumulator

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

    bool initialized = false; // Is the IVC accumulator initialized

    ClientIVC(TraceSettings trace_settings = {});

    void instantiate_stdlib_verification_queue(
        ClientCircuit& circuit, const std::vector<std::shared_ptr<RecursiveVerificationKey>>& input_keys = {});

    [[nodiscard("Pairing points should be accumulated")]] PairingPoints
    perform_recursive_verification_and_databus_consistency_checks(
        ClientCircuit& circuit,
        const StdlibVerifierInputs& verifier_inputs,
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
    void accumulate(ClientCircuit& circuit,
                    const std::shared_ptr<MegaVerificationKey>& precomputed_vk = nullptr,
                    const bool mock_vk = false);

    Proof prove();

    std::shared_ptr<ClientIVC::DeciderZKProvingKey> construct_hiding_circuit_key();
    static void hide_op_queue_accumulation_result(ClientCircuit& circuit);
    HonkProof construct_and_prove_hiding_circuit();

    static bool verify(const Proof& proof, const VerificationKey& vk);

    bool verify(const Proof& proof) const;

    bool prove_and_verify();

    HonkProof decider_prove() const;

    VerificationKey get_vk() const;
};

} // namespace bb
