#include "checksum_check.hpp"
#include "blake2b.hpp"
#include "transcript_loader.hpp"
#include <barretenberg/common/throw_or_abort.hpp>
#include <fstream>

namespace bb::ignition {

bool verify_transcript_checksum(const std::filesystem::path& path)
{
    auto file_size = std::filesystem::file_size(path);
    if (file_size <= BLAKE2B_HASH_SIZE) {
        throw_or_abort("Transcript file too small to contain checksum: " + path.string());
    }

    size_t data_size = file_size - BLAKE2B_HASH_SIZE;

    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw_or_abort("Cannot open transcript file: " + path.string());
    }

    // Read everything except the final 64 bytes in chunks to avoid loading the full
    // ~322 MB file into memory at once
    blake2b_state state;
    blake2b_init(&state, BLAKE2B_OUTBYTES);

    static constexpr size_t READ_BUF_SIZE = 1 << 20; // 1 MB
    std::vector<uint8_t> buf(READ_BUF_SIZE);
    size_t remaining = data_size;

    while (remaining > 0) {
        size_t to_read = std::min(remaining, READ_BUF_SIZE);
        file.read(reinterpret_cast<char*>(buf.data()), static_cast<std::streamsize>(to_read));
        if (!file) {
            throw_or_abort("Failed to read transcript data from: " + path.string());
        }
        blake2b_update(&state, buf.data(), to_read);
        remaining -= to_read;
    }

    std::array<uint8_t, BLAKE2B_OUTBYTES> computed{};
    blake2b_final(&state, computed.data(), computed.size());

    // Read the stored checksum (final 64 bytes)
    std::array<uint8_t, BLAKE2B_HASH_SIZE> stored{};
    file.read(reinterpret_cast<char*>(stored.data()), BLAKE2B_HASH_SIZE);
    if (!file) {
        throw_or_abort("Failed to read checksum from: " + path.string());
    }

    return computed == stored;
}

} // namespace bb::ignition
