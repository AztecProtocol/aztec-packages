#pragma once
/**
 * @file bbapi_batch_verifier.hpp
 * @brief BBAPI commands for the batch IVC proof verification service.
 *
 * Three commands expose the ChonkBatchVerifierService:
 *
 * - ChonkBatchVerifierStart: Initialize the service with VKs, output FIFO, and config
 * - ChonkBatchVerifierQueue: Queue a single proof for verification
 * - ChonkBatchVerifierStop: Shut down the service
 *
 * Results are streamed as size-delimited msgpack over a named FIFO pipe (not via RPC responses).
 *
 * @note Disabled for WASM builds — the threading model requires OS threads and FIFO support.
 */

#ifndef __wasm__

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/batch_verifier/chonk_batch_verifier_service.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct ChonkBatchVerifierStart
 * @brief Initialize the batch verifier service with VKs and configuration.
 */
struct ChonkBatchVerifierStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierStart";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierStartResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    std::vector<std::vector<uint8_t>> vks;
    std::string output_fifo_path;
    BatchVerifierConfig config;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(vks, output_fifo_path, config);
    bool operator==(const ChonkBatchVerifierStart&) const = default;
};

/**
 * @struct ChonkBatchVerifierQueue
 * @brief Queue a single proof for verification. Results come via the output FIFO.
 */
struct ChonkBatchVerifierQueue {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierQueue";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkBatchVerifierQueueResponse";
        bool accepted = false;
        MSGPACK_FIELDS(accepted);
        bool operator==(const Response&) const = default;
    };

    uint64_t request_id = 0;
    ChonkProof proof;
    uint32_t vk_index = 0;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(request_id, proof, vk_index);
    bool operator==(const ChonkBatchVerifierQueue&) const = default;
};

/**
 * @struct ChonkBatchVerifierStop
 * @brief Shut down the batch verifier service.
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

#endif // __wasm__
