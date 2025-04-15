#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/databus/databus.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"
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
    using FoldProof = std::vector<FF>;
    using MergeProof = std::vector<FF>;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderZKProvingKey = DeciderProvingKey_<MegaZKFlavor>;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;
    using ClientCircuit = MegaCircuitBuilder; // can only be Mega
    using DeciderProver = DeciderProver_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<DeciderProvingKeys>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;
    using MegaProver = UltraProver_<Flavor>;
    using MegaVerifier = UltraVerifier_<Flavor>;
    using RecursiveMergeVerifier = stdlib::recursion::goblin::MergeRecursiveVerifier_<ClientCircuit>;

    using RecursiveFlavor = MegaRecursiveFlavor_<bb::MegaCircuitBuilder>;
    using RecursiveDeciderVerificationKeys =
        bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using RecursiveDeciderVerificationKey = RecursiveDeciderVerificationKeys::DeciderVK;
    using RecursiveVerificationKey = RecursiveFlavor::VerificationKey;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtogalaxyRecursiveVerifier_<RecursiveDeciderVerificationKeys>;
    using OinkRecursiveVerifier = stdlib::recursion::honk::OinkRecursiveVerifier_<RecursiveFlavor>;
    using DeciderRecursiveVerifier = stdlib::recursion::honk::DeciderRecursiveVerifier_<RecursiveFlavor>;

    using DataBusDepot = stdlib::DataBusDepot<ClientCircuit>;
    using AggregationObject = stdlib::recursion::aggregation_state<ClientCircuit>;

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

        size_t size() const { return mega_proof.size() + goblin_proof.size(); }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1299): The following msgpack methods are generic
        // and should leverage some kind of shared msgpack utility.
        msgpack::sbuffer to_msgpack_buffer() const
        {
            msgpack::sbuffer buffer;
            msgpack::pack(buffer, *this);
            return buffer;
        }

        /**
         * @brief Very quirky method to convert a msgpack buffer to a "heap" buffer
         * @details This method results in a buffer that is double-size-prefixed with the buffer size. This is to mimmic
         * the original bb.js behavior which did a *out_proof = to_heap_buffer(to_buffer(proof));
         *
         * @return uint8_t* Double size-prefixed msgpack buffer
         */
        uint8_t* to_msgpack_heap_buffer() const
        {
            msgpack::sbuffer buffer = to_msgpack_buffer();

            std::vector<uint8_t> buf(buffer.data(), buffer.data() + buffer.size());
            return to_heap_buffer(buf);
        }

        class DeserializationError : public std::runtime_error {
          public:
            DeserializationError(const std::string& msg)
                : std::runtime_error(std::string("Client IVC Proof deserialization error: ") + msg)
            {}
        };

        static Proof from_msgpack_buffer(uint8_t const*& buffer)
        {
            auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);

            msgpack::sbuffer sbuf;
            sbuf.write(reinterpret_cast<char*>(uint8_buffer.data()), uint8_buffer.size());

            return from_msgpack_buffer(sbuf);
        }

        static Proof from_msgpack_buffer(const msgpack::sbuffer& buffer)
        {
            msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
            msgpack::object obj = oh.get();
            Proof proof;
            obj.convert(proof);
            return proof;
        }

        void to_file_msgpack(const std::string& filename) const
        {
            msgpack::sbuffer buffer = to_msgpack_buffer();
            std::ofstream ofs(filename, std::ios::binary);
            if (!ofs.is_open()) {
                throw_or_abort("Failed to open file for writing.");
            }
            ofs.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
            ofs.close();
        }

        static Proof from_file_msgpack(const std::string& filename)
        {
            std::ifstream ifs(filename, std::ios::binary);
            if (!ifs.is_open()) {
                throw_or_abort("Failed to open file for reading.");
            }

            ifs.seekg(0, std::ios::end);
            size_t file_size = static_cast<size_t>(ifs.tellg());
            ifs.seekg(0, std::ios::beg);

            std::vector<char> buffer(file_size);
            ifs.read(buffer.data(), static_cast<std::streamsize>(file_size));
            ifs.close();
            msgpack::sbuffer msgpack_buffer;
            msgpack_buffer.write(buffer.data(), file_size);

            return Proof::from_msgpack_buffer(msgpack_buffer);
        }

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
        std::vector<FF> merge_proof;
        std::shared_ptr<MegaVerificationKey> honk_verification_key;
        QUEUE_TYPE type;
    };
    using VerificationQueue = std::vector<VerifierInputs>;

    // An entry in the stdlib verification queue
    struct StdlibVerifierInputs {
        StdlibProof<ClientCircuit> proof; // oink or PG
        StdlibProof<ClientCircuit> merge_proof;
        std::shared_ptr<RecursiveVerificationKey> honk_verification_key;
        QUEUE_TYPE type;
    };

    using StdlibVerificationQueue = std::vector<StdlibVerifierInputs>;

    // Utility for tracking the max size of each block across the full IVC
    ExecutionTraceUsageTracker trace_usage_tracker;

  private:
    using ProverFoldOutput = FoldingResult<Flavor>;

  public:
    ProverFoldOutput fold_output; // prover accumulator and fold proof
    HonkProof mega_proof;

    std::shared_ptr<DeciderVerificationKey> verifier_accumulator; // verifier accumulator
    std::shared_ptr<MegaVerificationKey> honk_vk; // honk vk to be completed and folded into the accumulator

    // Set of tuples {proof, verification_key, type} to be recursively verified
    VerificationQueue verification_queue;
    // Set of tuples {stdlib_proof, stdlib_verification_key, type} corresponding to the native verification queue
    StdlibVerificationQueue stdlib_verification_queue;

    // Management of linking databus commitments between circuits in the IVC
    DataBusDepot bus_depot;

    // Settings related to the use of fixed block sizes for each gate in the execution trace
    TraceSettings trace_settings;

    std::shared_ptr<typename MegaFlavor::CommitmentKey> bn254_commitment_key;

    Goblin goblin;

    bool initialized = false; // Is the IVC accumulator initialized

    ClientIVC(TraceSettings trace_settings = {})
        : trace_usage_tracker(trace_settings)
        , trace_settings(trace_settings)
        , goblin(bn254_commitment_key)
    {
        // Allocate BN254 commitment key based on the max dyadic Mega structured trace size and translator circuit size.
        // https://github.com/AztecProtocol/barretenberg/issues/1319): Account for Translator only when it's necessary
        size_t commitment_key_size =
            std::max(trace_settings.dyadic_size(), 1UL << TranslatorFlavor::CONST_TRANSLATOR_LOG_N);
        info("BN254 commitment key size: ", commitment_key_size);
        bn254_commitment_key = std::make_shared<CommitmentKey<curve::BN254>>(commitment_key_size);
    }

    void instantiate_stdlib_verification_queue(
        ClientCircuit& circuit, const std::vector<std::shared_ptr<RecursiveVerificationKey>>& input_keys = {});

    void perform_recursive_verification_and_databus_consistency_checks(ClientCircuit& circuit,
                                                                       const StdlibVerifierInputs& verifier_inputs);

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

    std::pair<std::shared_ptr<ClientIVC::DeciderZKProvingKey>, MergeProof> construct_hiding_circuit_key();
    std::pair<HonkProof, MergeProof> construct_and_prove_hiding_circuit();

    static bool verify(const Proof& proof, const VerificationKey& vk);

    bool verify(const Proof& proof) const;

    bool prove_and_verify();

    HonkProof decider_prove() const;

    std::vector<std::shared_ptr<MegaVerificationKey>> precompute_folding_verification_keys(
        std::vector<ClientCircuit> circuits);

    VerificationKey get_vk() const
    {
        return { honk_vk, std::make_shared<ECCVMVerificationKey>(), std::make_shared<TranslatorVerificationKey>() };
    }
};
} // namespace bb
