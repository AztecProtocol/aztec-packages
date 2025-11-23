#pragma once

#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <cassert>
#include <cstring>
#include <iostream>
#include <span>

namespace bb::ipc {

inline bool ring_send_msg(SpscShm& ring, const void* data, size_t len, uint64_t timeout_ns)
{
    // Prevent sending messages larger than half the ring buffer capacity.
    // This simplifies wrap-around logic.
    assert(len <= ring.capacity() / 2);

    // Atomic send: claim space for entire message (length + data)
    size_t total_size = sizeof(uint32_t) + len;
    void* buf = ring.claim(total_size, static_cast<uint32_t>(timeout_ns));
    if (buf == nullptr) {
        return false; // Timeout or no space - nothing published yet (atomic failure)
    }

    // Write length prefix and message data together
    auto len_u32 = static_cast<uint32_t>(len);
    std::memcpy(buf, &len_u32, sizeof(uint32_t));
    std::memcpy(static_cast<uint8_t*>(buf) + sizeof(uint32_t), data, len);

    // Publish entire message atomically
    ring.publish(total_size);

    return true;
}

inline std::span<const uint8_t> ring_receive_msg(SpscShm& ring, uint64_t timeout_ns)
{
    // DEBUG: Add logging to track peek calls
    static int call_count = 0;
    call_count++;

    // Peek the length prefix (4 bytes)
    void* len_ptr = ring.peek(sizeof(uint32_t), static_cast<uint32_t>(timeout_ns));
    if (len_ptr == nullptr) {
        std::cerr << "DEBUG [" << call_count << "]: peek(4) returned nullptr (timeout)\n";
        return {}; // Timeout
    }
    std::cerr << "DEBUG [" << call_count << "]: peek(4) succeeded\n";

    // Read message length
    uint32_t msg_len = 0;
    std::memcpy(&msg_len, len_ptr, sizeof(uint32_t));
    std::cerr << "DEBUG [" << call_count << "]: msg_len = " << msg_len << "\n";

    // Now peek the message data
    void* msg_ptr = ring.peek(sizeof(uint32_t) + msg_len, static_cast<uint32_t>(timeout_ns));
    if (msg_ptr == nullptr) {
        std::cerr << "DEBUG [" << call_count << "]: peek(" << (sizeof(uint32_t) + msg_len)
                  << ") returned nullptr (timeout)\n";
        return {}; // Timeout
    }
    std::cerr << "DEBUG [" << call_count << "]: peek(" << (sizeof(uint32_t) + msg_len) << ") succeeded\n";

    // Return span directly into ring buffer (zero-copy!)
    return std::span<const uint8_t>(static_cast<const uint8_t*>(msg_ptr) + sizeof(uint32_t), msg_len);
}

} // namespace bb::ipc
