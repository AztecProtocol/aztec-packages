#pragma once
/**
 * @file bbapi_chonk.hpp
 * @brief Chonk-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for Chonk (Client-side Incrementally Verifiable Computation)
 * operations including circuit loading, accumulation, proving, verification key computation,
 * and the batch verifier service (start/queue/stop lifecycle).
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#ifdef BB_HAS_BATCH_VERIFIER_SERVICE
#include "barretenberg/chonk/batch_verifier_types.hpp"
#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include <atomic>
#include <mutex>
#endif

#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct ChonkStart
 * @brief Initialize a new Chonk instance for incremental proof accumulation
 *
 * @note Only one IVC request can be made at a time for each batch_request.
 */
struct ChonkStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStart";

    /**
     * @struct Response
     * @brief Empty response indicating successful initialization
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStartResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    // Number of circuits to be accumulated.
    uint32_t num_circuits;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(num_circuits);
    bool operator==(const ChonkStart&) const = default;
};

/**
 * @struct ChonkLoad
 * @brief Load a circuit into the Chonk instance for accumulation
 */
struct ChonkLoad {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkLoad";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit loading
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkLoadResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit to be loaded with its bytecode and verification key */
    CircuitInput circuit;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(circuit);
    bool operator==(const ChonkLoad&) const = default;
};

/**
 * @struct ChonkAccumulate
 * @brief Accumulate the previously loaded circuit into the IVC proof
 */
struct ChonkAccumulate {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkAccumulate";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit accumulation
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkAccumulateResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Serialized witness data for the last loaded circuit */
    std::vector<uint8_t> witness;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(witness);
    bool operator==(const ChonkAccumulate&) const = default;
};

/**
 * @struct ChonkProve
 * @brief Generate a proof for all accumulated circuits
 */
struct ChonkProve {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProve";

    /**
     * @struct Response
     * @brief Contains the generated IVC proof
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProveResponse";

        /** @brief Complete IVC proof for all accumulated circuits */
        ChonkProof proof;
        SERIALIZATION_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };
    Response execute(BBApiRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const ChonkProve&) const = default;
};

/**
 * @struct ChonkVerify
 * @brief Verify a Chonk proof with its verification key.
 *
 * @note valid=true proves that the supplied proof is consistent with the supplied VK. Callers that need canonical
 * protocol-circuit binding must choose the VK from the protocol artifact selected by the transaction/public inputs.
 */
struct ChonkVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkVerify";

    /**
     * @struct Response
     * @brief Contains the verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkVerifyResponse";

        /** @brief True if the proof is valid */
        bool valid;
        SERIALIZATION_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief The Chonk proof to verify */
    ChonkProof proof;
    /** @brief The verification key */
    std::vector<uint8_t> vk;
    Response execute(const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proof, vk);
    bool operator==(const ChonkVerify&) const = default;
};

/**
 * @struct ChonkVerifyFromFields
 * @brief Verify a Chonk proof passed as a flat field-element array (with public inputs prepended).
 *
 * The split into structured ChonkProof sub-proofs is done server-side via
 * ChonkProof::from_field_elements, so callers do not need to know the per-component sub-proof
 * sizes. This is the recommended entry point for TypeScript callers that hold the proof as a
 * flat Fr[] (e.g. from tx.chonkProof.attachPublicInputs).
 */
struct ChonkVerifyFromFields {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkVerifyFromFields";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkVerifyFromFieldsResponse";

        /** @brief True if the proof is valid */
        bool valid;
        SERIALIZATION_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief Flat proof field elements with public inputs prepended */
    std::vector<bb::fr> proof;
    /** @brief The verification key */
    std::vector<uint8_t> vk;
    Response execute(const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proof, vk);
    bool operator==(const ChonkVerifyFromFields&) const = default;
};

/**
 * @struct ChonkComputeVk
 * @brief Compute MegaHonk verification key for a circuit to be accumulated in Chonk
 *
 * @details Computes a VK for a circuit used by Chonk. The command keeps the existing wire schema;
 * Chonk owns the mapping from circuit role to concrete VK type.
 */
struct ChonkComputeVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkComputeVk";

    /**
     * @struct Response
     * @brief Contains the computed verification key in multiple formats
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkComputeVkResponse";

        /** @brief Serialized Chonk verification key in binary format */
        std::vector<uint8_t> bytes;
        /** @brief Verification key as array of field elements */
        std::vector<bb::fr> fields;
        SERIALIZATION_FIELDS(bytes, fields);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    /** @brief Existing wire flag selecting the hiding-kernel VK role. */
    bool use_zk_flavor = false;
    Response execute([[maybe_unused]] const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(circuit, use_zk_flavor);
    bool operator==(const ChonkComputeVk&) const = default;
};

/**
 * @struct ChonkCheckPrecomputedVk
 * @brief Verify that a precomputed verification key matches the circuit
 */
struct ChonkCheckPrecomputedVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkCheckPrecomputedVk";

    /**
     * @struct Response
     * @brief Contains the validation result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkCheckPrecomputedVkResponse";

        /** @brief True if the precomputed VK matches the circuit */
        bool valid;
        /** @brief The actual VK it should be. */
        std::vector<uint8_t> actual_vk;
        SERIALIZATION_FIELDS(valid, actual_vk);
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit with its precomputed verification key */
    CircuitInput circuit;
    /** @brief Existing wire flag selecting the hiding-kernel VK role. */
    bool use_zk_flavor = false;

    Response execute(const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(circuit, use_zk_flavor);
    bool operator==(const ChonkCheckPrecomputedVk&) const = default;
};

/**
 * @struct ChonkStats
 * @brief Get gate counts for a circuit
 */
struct ChonkStats {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStats";

    /**
     * @struct Response
     * @brief Contains gate count information
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStatsResponse";

        /** @brief Number of ACIR opcodes */
        uint32_t acir_opcodes;
        /** @brief Circuit size (total number of gates) */
        uint32_t circuit_size;
        /** @brief Optional: gate counts per opcode */
        std::vector<uint32_t> gates_per_opcode;
        SERIALIZATION_FIELDS(acir_opcodes, circuit_size, gates_per_opcode);
        bool operator==(const Response&) const = default;
    };

    /** @brief The circuit to analyze */
    CircuitInputNoVK circuit;
    /** @brief Whether to include detailed gate counts per opcode */
    bool include_gates_per_opcode;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(circuit, include_gates_per_opcode);
    bool operator==(const ChonkStats&) const = default;
};

/**
 * @struct ChonkBatchVerify
 * @brief Batch-verify multiple Chonk proofs with batched IPA SRS MSMs.
 */
struct ChonkBatchVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerify";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifyResponse";
        bool valid;
        SERIALIZATION_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    std::vector<ChonkProof> proofs;
    std::vector<std::vector<uint8_t>> vks;
    Response execute(const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proofs, vks);
    bool operator==(const ChonkBatchVerify&) const = default;
};

/**
 * @struct ChonkCompressProof
 * @brief Compress a Chonk proof to a compact byte representation
 *
 * @details Uses point compression and uniform 32-byte encoding to reduce proof size (~1.72x).
 */
struct ChonkCompressProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkCompressProof";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkCompressProofResponse";
        std::vector<uint8_t> compressed_proof;
        SERIALIZATION_FIELDS(compressed_proof);
        bool operator==(const Response&) const = default;
    };

    ChonkProof proof;
    Response execute(const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proof);
    bool operator==(const ChonkCompressProof&) const = default;
};

/**
 * @struct ChonkDecompressProof
 * @brief Decompress a compressed Chonk proof back to field elements
 *
 * @details Derives mega_num_public_inputs from the compressed size automatically.
 */
struct ChonkDecompressProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkDecompressProof";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkDecompressProofResponse";
        ChonkProof proof;
        SERIALIZATION_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> compressed_proof;
    Response execute(const BBApiRequest& request = {}) &&;
    SERIALIZATION_FIELDS(compressed_proof);
    bool operator==(const ChonkDecompressProof&) const = default;
};

#ifdef BB_HAS_BATCH_VERIFIER_SERVICE
/**
 * @brief FIFO-streaming batch verification service for Chonk proofs.
 *
 * Wraps ChonkBatchVerifier and streams results over a named pipe (FIFO)
 * as size-delimited msgpack payloads: [4-byte big-endian length][msgpack payload].
 *
 * Lifecycle: start() → enqueue() × N → stop()
 */
class ChonkBatchVerifierService {
  public:
    ChonkBatchVerifierService() = default;
    ~ChonkBatchVerifierService();

    ChonkBatchVerifierService(const ChonkBatchVerifierService&) = delete;
    ChonkBatchVerifierService& operator=(const ChonkBatchVerifierService&) = delete;

    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               uint32_t num_cores,
               uint32_t batch_size,
               const std::string& fifo_path);
    void enqueue(VerifyRequest request);
    void fail_request(uint64_t request_id, std::string error_message);
    void stop();
    bool is_running() const { return running_.load(); }

  private:
    bool write_result(VerifyResult result);
    bool ensure_fifo_open();
    void close_fifo_locked();
    bool fail_fifo_locked(const std::string& message);

    ChonkBatchVerifier verifier_;

    std::mutex fifo_mutex_;
    std::string fifo_path_;
    int fifo_fd_ = -1;
    std::atomic_bool running_ = false;
    std::atomic_bool fifo_failed_ = false;
};
#endif // BB_HAS_BATCH_VERIFIER_SERVICE

/**
 * @struct ChonkBatchVerifierStart
 * @brief Start the batch verifier service.
 */
struct ChonkBatchVerifierStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierStart";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierStartResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    std::vector<std::vector<uint8_t>> vks; // Serialized verification keys
    uint32_t num_cores = 0;                // 0 = auto
    uint32_t batch_size = 8;
    std::string fifo_path;

    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(vks, num_cores, batch_size, fifo_path);
    bool operator==(const ChonkBatchVerifierStart&) const = default;
};

/**
 * @struct ChonkBatchVerifierQueue
 * @brief Enqueue a proof for batch verification.
 */
struct ChonkBatchVerifierQueue {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierQueue";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierQueueResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    uint64_t request_id = 0;
    uint32_t vk_index = 0;
    std::vector<bb::fr> proof_fields;

    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(request_id, vk_index, proof_fields);
    bool operator==(const ChonkBatchVerifierQueue&) const = default;
};

/**
 * @struct ChonkBatchVerifierStop
 * @brief Stop the batch verifier service.
 */
struct ChonkBatchVerifierStop {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierStop";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierStopResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    Response execute(BBApiRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const ChonkBatchVerifierStop&) const = default;
};

} // namespace bb::bbapi
