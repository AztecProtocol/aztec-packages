#pragma once

#include "ipc_runtime/constants.hpp"
#include "ipc_runtime/shm/spsc_shm.hpp"
#include <cassert>
#include <cstring>
#include <iostream>
#include <span>
#include <stdexcept>

namespace ipc {

inline bool ring_send_msg(SpscShm& ring, const void* data, size_t len, uint64_t timeout_ns)
{
    // Prevent sending messages larger than half the ring buffer capacity.
    // This simplifies wrap-around logic.
    if (len > ring.capacity() / 2 - 4) {
        throw std::runtime_error("ring_send_msg: message too large for ring "
                                 "buffer, must be <= half capacity minus 4 bytes");
    }

    // Atomic send: claim space for entire message (length + data)
    size_t total_size = 4 + len;
    void* buf = ring.claim(total_size, timeout_ns);
    if (buf == nullptr) {
        return false; // Timeout or no space - nothing published yet (atomic
                      // failure)
    }

    // Write length prefix and message data together
    auto len_u32 = static_cast<uint32_t>(len);
    std::memcpy(buf, &len_u32, 4);
    std::memcpy(static_cast<uint8_t*>(buf) + 4, data, len);

    // Publish entire message atomically
    ring.publish(total_size);

    return true;
}

inline std::span<const uint8_t> ring_receive_msg(SpscShm& ring, uint64_t timeout_ns)
{
    // Peek the length prefix (4 bytes)
    void* len_ptr = ring.peek(4, timeout_ns);
    if (len_ptr == nullptr) {
        return {}; // Timeout
    }

    // Read message length
    uint32_t msg_len = 0;
    std::memcpy(&msg_len, len_ptr, 4);

    // Validate before waiting on the claimed size: the send side can never
    // legally publish more than capacity/2 - 4 bytes, so a larger prefix
    // means the ring is corrupt. Waiting would only ever time out.
    if (msg_len > MAX_FRAME_SIZE || msg_len > ring.capacity() / 2 - 4) {
        throw std::runtime_error("ring_receive_msg: corrupt length prefix (" + std::to_string(msg_len) +
                                 " bytes exceeds ring/frame limits)");
    }

    // Now peek the message data
    void* msg_ptr = ring.peek(4 + msg_len, timeout_ns);
    if (msg_ptr == nullptr) {
        return {}; // Timeout
    }

    // Return span directly into ring buffer (zero-copy!)
    return std::span<const uint8_t>(static_cast<const uint8_t*>(msg_ptr) + 4, msg_len);
}

} // namespace ipc
