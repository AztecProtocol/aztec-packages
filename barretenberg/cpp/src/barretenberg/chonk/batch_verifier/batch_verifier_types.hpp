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

/**
 * @brief Configuration for the batch verifier service.
 */
struct BatchVerifierConfig {
    /** Number of cores for the trusted batch pipeline (used for both reduce and IPA phases). */
    uint32_t num_trusted_cores = 4;
    /** Number of cores (threads) dedicated to untrusted individual verification. */
    uint32_t num_untrusted_cores = 4;
    /** Number of trusted proofs to accumulate before forming a batch. */
    uint32_t trusted_batch_size = 64;
    /** Maximum number of pending requests before backpressure. */
    uint32_t max_pending = 1024;

    MSGPACK_FIELDS(num_trusted_cores, num_untrusted_cores, trusted_batch_size, max_pending);
    bool operator==(const BatchVerifierConfig&) const = default;
};

/**
 * @brief Status of a verification result.
 */
enum class VerifyStatus : uint8_t {
    OK = 0,
    FAILED = 1,
    CANCELLED = 2,
};

/**
 * @brief Result of a single proof verification, written to the output FIFO.
 */
struct VerifyResult {
    uint64_t request_id = 0;
    bool verified = false;
    uint8_t status = 0; // VerifyStatus as uint8_t for msgpack
    std::string error_message;
    std::string source;
    double time_in_queue_ms = 0;
    double time_in_verify_ms = 0;
    double time_in_sumcheck_ms = 0;
    double time_in_ipa_ms = 0;
    uint32_t batch_failure_count = 0;

    MSGPACK_FIELDS(request_id,
                   verified,
                   status,
                   error_message,
                   source,
                   time_in_queue_ms,
                   time_in_verify_ms,
                   time_in_sumcheck_ms,
                   time_in_ipa_ms,
                   batch_failure_count);
};

/**
 * @brief Internal representation of a queued verification request.
 */
struct VerifyRequest {
    uint64_t request_id = 0;
    ChonkProof proof;
    uint32_t vk_index = 0;
    bool trusted = false;
    std::string source;
    std::chrono::steady_clock::time_point enqueue_time;
};

} // namespace bb
