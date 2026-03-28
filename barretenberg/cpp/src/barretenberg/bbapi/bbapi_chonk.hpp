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

#ifndef __wasm__
#include "barretenberg/chonk/batch_verifier_types.hpp"
#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include <condition_variable>
#include <mutex>
#include <queue>
#include <thread>
#endif

#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct BbChonkStart
 * @brief Initialize a new Chonk instance for incremental proof accumulation
 *
 * @note Only one IVC request can be made at a time for each batch_request.
 */
struct BbChonkStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkStart";

    /**
     * @struct Response
     * @brief Empty response indicating successful initialization
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkStartResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    // Number of circuits to be accumulated.
    uint32_t num_circuits;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(num_circuits);
    bool operator==(const BbChonkStart&) const = default;
};

/**
 * @struct BbChonkLoad
 * @brief Load a circuit into the Chonk instance for accumulation
 */
struct BbChonkLoad {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkLoad";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit loading
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkLoadResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit to be loaded with its bytecode and verification key */
    CircuitInput circuit;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(circuit);
    bool operator==(const BbChonkLoad&) const = default;
};

/**
 * @struct BbChonkAccumulate
 * @brief Accumulate the previously loaded circuit into the IVC proof
 */
struct BbChonkAccumulate {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkAccumulate";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit accumulation
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkAccumulateResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Serialized witness data for the last loaded circuit */
    std::vector<uint8_t> witness;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(witness);
    bool operator==(const BbChonkAccumulate&) const = default;
};

/**
 * @struct BbChonkProve
 * @brief Generate a proof for all accumulated circuits
 */
struct BbChonkProve {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkProve";

    /**
     * @struct Response
     * @brief Contains the generated IVC proof
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkProveResponse";

        /** @brief Complete IVC proof for all accumulated circuits */
        ChonkProof proof;
        SERIALIZATION_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };
    Response execute(BbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const BbChonkProve&) const = default;
};

/**
 * @struct BbChonkVerify
 * @brief Verify a Chonk proof with its verification key
 */
struct BbChonkVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkVerify";

    /**
     * @struct Response
     * @brief Contains the verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkVerifyResponse";

        /** @brief True if the proof is valid */
        bool valid;
        SERIALIZATION_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief The Chonk proof to verify */
    ChonkProof proof;
    /** @brief The verification key */
    std::vector<uint8_t> vk;
    Response execute(const BbRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proof, vk);
    bool operator==(const BbChonkVerify&) const = default;
};

/**
 * @struct BbChonkComputeVk
 * @brief Compute MegaHonk verification key for a circuit to be accumulated in Chonk
 *
 * @details This unified command replaces the former ChonkComputeStandaloneVk and ChonkComputeIvcVk.
 * Both standalone circuits (to be accumulated) and the IVC hiding kernel use the same MegaVerificationKey,
 * so a single implementation suffices for all Chonk VK computation needs.
 */
struct BbChonkComputeVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkComputeVk";

    /**
     * @struct Response
     * @brief Contains the computed verification key in multiple formats
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkComputeVkResponse";

        /** @brief Serialized MegaVerificationKey in binary format */
        std::vector<uint8_t> bytes;
        /** @brief Verification key as array of field elements */
        std::vector<bb::fr> fields;
        SERIALIZATION_FIELDS(bytes, fields);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    Response execute([[maybe_unused]] const BbRequest& request = {}) &&;
    SERIALIZATION_FIELDS(circuit);
    bool operator==(const BbChonkComputeVk&) const = default;
};

/**
 * @struct BbChonkCheckPrecomputedVk
 * @brief Verify that a precomputed verification key matches the circuit
 */
struct BbChonkCheckPrecomputedVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkCheckPrecomputedVk";

    /**
     * @struct Response
     * @brief Contains the validation result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkCheckPrecomputedVkResponse";

        /** @brief True if the precomputed VK matches the circuit */
        bool valid;
        /** @brief The actual VK it should be. */
        std::vector<uint8_t> actual_vk;
        SERIALIZATION_FIELDS(valid, actual_vk);
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit with its precomputed verification key */
    CircuitInput circuit;

    Response execute(const BbRequest& request = {}) &&;
    SERIALIZATION_FIELDS(circuit);
    bool operator==(const BbChonkCheckPrecomputedVk&) const = default;
};

/**
 * @struct BbChonkStats
 * @brief Get gate counts for a circuit
 */
struct BbChonkStats {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkStats";

    /**
     * @struct Response
     * @brief Contains gate count information
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkStatsResponse";

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
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(circuit, include_gates_per_opcode);
    bool operator==(const BbChonkStats&) const = default;
};

/**
 * @struct BbChonkBatchVerify
 * @brief Batch-verify multiple Chonk proofs with a single IPA SRS MSM
 */
struct BbChonkBatchVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerify";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifyResponse";
        bool valid;
        SERIALIZATION_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    std::vector<ChonkProof> proofs;
    std::vector<std::vector<uint8_t>> vks;
    Response execute(const BbRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proofs, vks);
    bool operator==(const BbChonkBatchVerify&) const = default;
};

/**
 * @struct BbChonkCompressProof
 * @brief Compress a Chonk proof to a compact byte representation
 *
 * @details Uses point compression and uniform 32-byte encoding to reduce proof size (~1.72x).
 */
struct BbChonkCompressProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkCompressProof";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkCompressProofResponse";
        std::vector<uint8_t> compressed_proof;
        SERIALIZATION_FIELDS(compressed_proof);
        bool operator==(const Response&) const = default;
    };

    ChonkProof proof;
    Response execute(const BbRequest& request = {}) &&;
    SERIALIZATION_FIELDS(proof);
    bool operator==(const BbChonkCompressProof&) const = default;
};

/**
 * @struct BbChonkDecompressProof
 * @brief Decompress a compressed Chonk proof back to field elements
 *
 * @details Derives mega_num_public_inputs from the compressed size automatically.
 */
struct BbChonkDecompressProof {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkDecompressProof";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkDecompressProofResponse";
        ChonkProof proof;
        SERIALIZATION_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> compressed_proof;
    Response execute(const BbRequest& request = {}) &&;
    SERIALIZATION_FIELDS(compressed_proof);
    bool operator==(const BbChonkDecompressProof&) const = default;
};

#ifndef __wasm__
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
    void stop();
    bool is_running() const { return running_; }

  private:
    void writer_loop(const std::string& fifo_path);

    ChonkBatchVerifier verifier_;

    std::mutex result_mutex_;
    std::condition_variable result_cv_;
    std::queue<VerifyResult> result_queue_;
    bool writer_shutdown_ = false;
    std::thread writer_thread_;

    bool running_ = false;
};
#endif // __wasm__

/**
 * @struct BbChonkBatchVerifierStart
 * @brief Start the batch verifier service.
 */
struct BbChonkBatchVerifierStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifierStart";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifierStartResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    std::vector<std::vector<uint8_t>> vks; // Serialized verification keys
    uint32_t num_cores = 0;                // 0 = auto
    uint32_t batch_size = 8;
    std::string fifo_path;

    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(vks, num_cores, batch_size, fifo_path);
    bool operator==(const BbChonkBatchVerifierStart&) const = default;
};

/**
 * @struct BbChonkBatchVerifierQueue
 * @brief Enqueue a proof for batch verification.
 */
struct BbChonkBatchVerifierQueue {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifierQueue";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifierQueueResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    uint64_t request_id = 0;
    uint32_t vk_index = 0;
    std::vector<bb::fr> proof_fields;

    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(request_id, vk_index, proof_fields);
    bool operator==(const BbChonkBatchVerifierQueue&) const = default;
};

/**
 * @struct BbChonkBatchVerifierStop
 * @brief Stop the batch verifier service.
 */
struct BbChonkBatchVerifierStop {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifierStop";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbChonkBatchVerifierStopResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    Response execute(BbRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const BbChonkBatchVerifierStop&) const = default;
};

} // namespace bb::bbapi
