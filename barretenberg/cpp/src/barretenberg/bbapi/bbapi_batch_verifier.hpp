#pragma once
/**
 * @file bbapi_batch_verifier.hpp
 * @brief BBAPI RPC commands for the batch verifier service.
 *
 * Three commands control the service lifecycle:
 *   - ChonkBatchVerifierStart: initialize VKs, configure pipeline, start threads
 *   - ChonkBatchVerifierQueue: enqueue a proof for verification
 *   - ChonkBatchVerifierStop: stop the service and flush remaining results
 *
 * Results are streamed asynchronously via a named pipe (FIFO) specified at start time.
 *
 * Note: These commands are registered in the Command variant for both native and WASM builds
 * (for schema generation), but execute() is only implemented for native builds.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#ifndef __wasm__
#include "barretenberg/chonk/batch_verifier_types.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "chonk_batch_verifier_service.hpp"
#endif

#include <string>
#include <vector>

namespace bb::bbapi {

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
    uint32_t batch_size = 4;
    std::string fifo_path;

    Response execute(const BBApiRequest& request = {}) &&;
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
    std::vector<uint8_t> proof_fields; // Flat proof as concatenated 32-byte field elements

    Response execute(const BBApiRequest& request = {}) &&;
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

    Response execute(const BBApiRequest& request = {}) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const ChonkBatchVerifierStop&) const = default;
};

} // namespace bb::bbapi
