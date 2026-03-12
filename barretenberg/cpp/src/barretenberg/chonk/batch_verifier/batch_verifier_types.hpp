#pragma once
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb {

/**
 * @brief Configuration for the batch verifier service.
 */
struct BatchVerifierConfig {
    uint32_t num_cores = 0;  // 0 = auto-detect
    uint32_t batch_size = 4; // Number of proofs to accumulate before batch-checking
};

/**
 * @brief Status codes for verification results.
 */
enum class VerifyStatus : uint8_t {
    OK = 0,
    FAILED = 1,
};

/**
 * @brief Result of verifying a single proof within a batch.
 */
struct VerifyResult {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "VerifyResult";

    uint64_t request_id = 0;
    uint8_t status = static_cast<uint8_t>(VerifyStatus::FAILED);
    std::string error_message;
    double time_in_queue_ms = 0;
    double time_in_verify_ms = 0;
    uint32_t batch_failure_count = 0; // Number of bisection levels to identify failure

    bool verified() const { return status == static_cast<uint8_t>(VerifyStatus::OK); }

    static VerifyResult failed(uint64_t id, std::string msg)
    {
        return { .request_id = id,
                 .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                 .error_message = std::move(msg) };
    }

    SERIALIZATION_FIELDS(request_id, status, error_message, time_in_queue_ms, time_in_verify_ms, batch_failure_count);
    bool operator==(const VerifyResult&) const = default;
};

/**
 * @brief A request to verify a single Chonk proof.
 */
struct VerifyRequest {
    uint64_t request_id = 0;
    uint32_t vk_index = 0; // Index into the VK list provided at start
    ChonkProof proof;
    std::chrono::steady_clock::time_point enqueue_time;
};

} // namespace bb
