#pragma once
/**
 * @file batch_verifier_types.hpp
 * @brief Shared types for the batch IVC proof verification system.
 */

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include <chrono>
#include <cstdint>
#include <string>

namespace bb {

/** @brief Milliseconds elapsed since a time_point, as a double. */
inline double ms_since(std::chrono::steady_clock::time_point t0)
{
    return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
}

/** @brief Milliseconds between two time_points, as a double. */
inline double ms_between(std::chrono::steady_clock::time_point from, std::chrono::steady_clock::time_point to)
{
    return std::chrono::duration<double, std::milli>(to - from).count();
}

struct BatchVerifierConfig {
    uint32_t num_cores = 4;
    uint32_t batch_size = 64;

    MSGPACK_FIELDS(num_cores, batch_size);
    bool operator==(const BatchVerifierConfig&) const = default;
};

enum class VerifyStatus : uint8_t {
    OK = 0,
    FAILED = 1,
};

/**
 * @brief Result of a single proof verification, written to the output FIFO.
 */
struct VerifyResult {
    uint64_t request_id = 0;
    uint8_t status = 0; // VerifyStatus as uint8_t for msgpack
    std::string error_message;
    double time_in_queue_ms = 0;
    double time_in_verify_ms = 0;
    uint32_t batch_failure_count = 0;

    bool verified() const { return status == static_cast<uint8_t>(VerifyStatus::OK); }

    /** Construct a failure result for a given request. */
    static VerifyResult failed(uint64_t id, std::string error)
    {
        return { .request_id = id,
                 .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                 .error_message = std::move(error) };
    }

    MSGPACK_FIELDS(request_id, status, error_message, time_in_queue_ms, time_in_verify_ms, batch_failure_count);
};

/**
 * @brief Internal representation of a queued verification request.
 */
struct VerifyRequest {
    uint64_t request_id = 0;
    ChonkProof proof;
    uint32_t vk_index = 0;
    std::chrono::steady_clock::time_point enqueue_time;
};

} // namespace bb
