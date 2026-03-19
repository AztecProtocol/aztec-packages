#pragma once
#include <chrono>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#ifndef __wasm__
#include <unistd.h>
#endif

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb {

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

#ifndef __wasm__
/**
 * @brief Write a length-delimited frame to a file descriptor.
 *
 * Wire format: [4-byte big-endian payload length][payload bytes]
 * Matches the format expected by FifoFrameReader on the TypeScript side.
 *
 * @return true if the entire frame was written, false on write error.
 */
inline bool write_frame(int fd, const void* data, size_t len)
{
    if (len > UINT32_MAX) {
        return false;
    }
    auto len32 = static_cast<uint32_t>(len);

    // Combine header and payload into a single buffer for one write() syscall
    std::vector<uint8_t> frame(4 + len);
    frame[0] = static_cast<uint8_t>((len32 >> 24) & 0xFF);
    frame[1] = static_cast<uint8_t>((len32 >> 16) & 0xFF);
    frame[2] = static_cast<uint8_t>((len32 >> 8) & 0xFF);
    frame[3] = static_cast<uint8_t>(len32 & 0xFF);
    std::memcpy(frame.data() + 4, data, len);

    const auto* ptr = frame.data();
    size_t remaining = frame.size();
    while (remaining > 0) {
        auto written = ::write(fd, ptr, remaining);
        if (written <= 0) {
            return false;
        }
        ptr += written;
        remaining -= static_cast<size_t>(written);
    }
    return true;
}
#endif // __wasm__

} // namespace bb
