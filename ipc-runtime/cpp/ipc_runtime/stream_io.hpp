#pragma once
/**
 * @file stream_io.hpp
 * @brief Payload reads shared by the stream transports (UDS and pipe).
 */

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace ipc {

/** First allocation step when reading a payload; later steps double. */
inline constexpr size_t PAYLOAD_READ_CHUNK = 1024 * 1024;

/**
 * Read a `len`-byte payload into `buffer` at `offset`, growing the buffer only
 * as bytes arrive.
 *
 * Stream frames carry no limit below the u32 length field, so a desynced or
 * corrupt prefix can claim up to 4 GiB. Allocating the claimed size up front
 * would commit that memory before a single payload byte shows up; growing in
 * doubling steps keeps the allocation within twice what the peer actually sent.
 *
 * @param read_exact Reads exactly `n` bytes into `dst`, returning 1 on success,
 *        0 on EOF and -1 on error (the transports' existing read helpers).
 * @return The first non-success result of `read_exact`, or 1.
 */
template <typename ReadExact>
int read_payload(std::vector<uint8_t>& buffer, size_t offset, size_t len, ReadExact&& read_exact)
{
    // Keep at least one byte so data() is non-null for zero-length messages
    // (null data() signals failure to callers).
    if (buffer.size() < std::max<size_t>(offset, 1)) {
        buffer.resize(std::max<size_t>(offset, 1));
    }
    size_t received = 0;
    while (received < len) {
        size_t step = std::min(len - received, std::max(PAYLOAD_READ_CHUNK, received));
        if (buffer.size() < offset + received + step) {
            buffer.resize(offset + received + step);
        }
        int result = read_exact(buffer.data() + offset + received, step);
        if (result != 1) {
            return result;
        }
        received += step;
    }
    return 1;
}

} // namespace ipc
