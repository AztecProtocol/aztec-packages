#pragma once
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <ios>
#include <sstream>
#include <string_view>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace bb {
inline size_t get_file_size(std::string const& filename)
{
    // Open the file in binary mode and move to the end.
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file) {
        return 0;
    }

    file.seekg(0, std::ios::end);
    return (size_t)file.tellg();
}

inline std::vector<uint8_t> read_file(const std::string& filename, size_t bytes = 0)
{
    // Used for stdin and non-seekable fds (pipes, process substitution) where we don't know the
    // size in advance. Reads in 64 KiB chunks to avoid the O(n²) reallocation pattern that arises
    // from the istreambuf_iterator range constructor.
    constexpr size_t CHUNK = 65536;
    auto read_chunked = [](int fd, const std::string& name) {
        std::vector<uint8_t> result;
        size_t total = 0;
        ssize_t n = 0;
        while (true) {
            // Standard libraries will usually do geometric capacity growth here so that copying is amortized.
            result.resize(total + CHUNK);
            n = ::read(fd, result.data() + total, CHUNK);
            if (n <= 0) {
                break;
            }
            total += static_cast<size_t>(n);
        }
        result.resize(total);
        if (n < 0) {
            THROW std::runtime_error("Failed to read from " + name + ": " + strerror(errno));
        }
        return result;
    };

    // "-" is the conventional sentinel for stdin.
    if (filename == "-") {
        return read_chunked(STDIN_FILENO, "stdin");
    }

    // std::filesystem::file_size is a single stat() call — no seek-to-end / rewind needed.
    // The error_code overload returns -1 and sets ec instead of throwing for non-regular
    // files (pipes, devices), which we treat as "unknown size" and handle with chunked I/O.
    std::error_code ec;
    auto raw_size = std::filesystem::file_size(filename, ec);
    std::optional<size_t> file_size = ec ? std::nullopt : std::optional<size_t>(static_cast<size_t>(raw_size));

    int fd = open(filename.c_str(), O_RDONLY);
    if (fd == -1) {
        THROW std::runtime_error("Unable to open file: " + filename + " (" + strerror(errno) + ")");
    }

    std::vector<uint8_t> fileData;
    if (!file_size.has_value()) {
        // Size unknown (pipe, device, etc.): read without pre-allocation.
        fileData = read_chunked(fd, filename);
    } else {
        // Pre-allocate exactly what we need: either the caller's limit or the whole file.
        // Using POSIX read() directly avoids the extra buffering layer of std::ifstream.
        size_t to_read = bytes == 0 ? *file_size : bytes;
        fileData.resize(to_read);
        size_t total = 0;
        while (total < to_read) {
            ssize_t got = ::read(fd, fileData.data() + total, static_cast<unsigned int>(to_read - total));
            if (got < 0) {
                close(fd);
                THROW std::runtime_error("Failed to read file: " + filename + " (" + strerror(errno) + ")");
            }
            if (got == 0) {
                break; // Unexpected EOF (file shrunk between stat and read).
            }
            total += static_cast<size_t>(got);
        }
        fileData.resize(total); // Shrink if the file was shorter than expected.
    }
    close(fd);
    return fileData;
}

inline void write_file(const std::string& filename, std::span<const uint8_t> data)
{
    // For regular files, truncate and create if missing (O_TRUNC | O_CREAT).
    // For FIFOs/pipes the file already exists and O_CREAT/O_TRUNC are no-ops, so
    // the same flags work uniformly for both cases — no need to stat() first.
    int fd = open(filename.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd == -1) {
        THROW std::runtime_error("Failed to open file for writing: " + filename + " (" + strerror(errno) + ")");
    }

    // Loop to handle short writes (required by POSIX, common on pipes and sockets).
    size_t total_written = 0;
    while (total_written < data.size()) {
        ssize_t written =
            ::write(fd, data.data() + total_written, static_cast<unsigned int>(data.size() - total_written));
        if (written < 0) {
            close(fd);
            THROW std::runtime_error("Failed to write to file: " + filename + " (" + strerror(errno) + ")");
        }
        total_written += static_cast<size_t>(written);
    }
    close(fd);
}

template <typename Fr> inline std::string field_elements_to_json(const std::vector<Fr>& fields)
{
    std::stringstream ss;
    ss << "[";
    for (size_t i = 0; i < fields.size(); ++i) {
        ss << '"' << fields[i] << '"';
        if (i != fields.size() - 1) {
            ss << ",";
        }
    }
    ss << "]";
    return ss.str();
}

/**
 * @brief Read a verification key file with an actionable error message if not found.
 *
 * @param vk_path Path to the verification key file
 * @return std::vector<uint8_t> The verification key bytes
 * @throws std::runtime_error with actionable message if vk file not found
 */
inline std::vector<uint8_t> read_vk_file(const std::filesystem::path& vk_path)
{
    try {
        return read_file(vk_path.string());
    } catch (const std::runtime_error&) {
        THROW std::runtime_error("Unable to open file: " + vk_path.string() +
                                 "\nGenerate a vk during proving by running `bb prove` with an additional `--write_vk` "
                                 "flag, or run `bb write_vk` to generate a standalone vk."
                                 "\nIf you already have a vk file, specify its path with `--vk_path <path>`.");
    }
}

template <typename T>
inline std::vector<T> many_from_buffer_exact(const std::vector<uint8_t>& buffer, std::string_view object_name)
{
    if (buffer.size() % sizeof(T) != 0) {
        THROW std::runtime_error(std::string(object_name) + " size must be a multiple of " + std::to_string(sizeof(T)) +
                                 " bytes, got " + std::to_string(buffer.size()));
    }
    return ::many_from_buffer<T>(buffer);
}

// On Windows, std::filesystem::path uses wide strings (wchar_t) and doesn't implicitly convert
// to std::string. On Linux/macOS (libstdc++), the conversion is implicit so these aren't needed.
#ifdef _WIN32
inline size_t get_file_size(const std::filesystem::path& filename)
{
    return get_file_size(filename.string());
}

inline std::vector<uint8_t> read_file(const std::filesystem::path& filename, size_t bytes = 0)
{
    return read_file(filename.string(), bytes);
}

inline void write_file(const std::filesystem::path& filename, std::span<const uint8_t> data)
{
    write_file(filename.string(), data);
}
#endif

} // namespace bb
