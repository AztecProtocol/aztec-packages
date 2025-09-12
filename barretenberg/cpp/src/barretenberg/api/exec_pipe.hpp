#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <unistd.h>
#include <vector>

namespace bb {

// Unsafe version - DO NOT USE THIS DIRECTLY
inline std::vector<uint8_t> exec_pipe_unsafe([[maybe_unused]] const std::string& command)
{
#ifdef __wasm__
    throw_or_abort("Can't use popen() in wasm! Implement this functionality natively.");
#else
    // popen() with "r" captures only stdout; stderr is inherited unchanged.
    std::unique_ptr<FILE, int (*)(FILE*)> pipe(popen(command.c_str(), "r"), pclose); // NOLINT
    if (!pipe) {
        throw_or_abort("popen() failed: '" + command + "' due to " + strerror(errno));
    }

    std::vector<uint8_t> output;
    uint8_t buf[4096]; // NOLINT

    while (size_t n = fread(buf, 1, sizeof(buf), pipe.get())) {
        output.insert(output.end(), buf, buf + n);
    }
    return output;
#endif
}

// Just holds a path so we can have easy-to-analyze shell strings.
struct PathHoldingFile {
    std::string path;

    PathHoldingFile(const std::string& target)
    {
        // Use RNG to generate a random suffix for the temporary file
        auto& rng = numeric::get_randomness();
        uint64_t random_suffix = rng.get_random_uint64();

        auto temp_dir = std::filesystem::temp_directory_path();
        path = (temp_dir / ("bb_safe_" + std::to_string(random_suffix) + ".txt")).string();

        // Write the path to the temporary file
        std::ofstream f(path);
        f << target;
    }

    ~PathHoldingFile()
    {
        std::error_code ec;
        std::filesystem::remove(path, ec);
    }
    PathHoldingFile(const PathHoldingFile&) = delete;
    PathHoldingFile& operator=(const PathHoldingFile&) = delete;
    PathHoldingFile(const PathHoldingFile&&) = delete;
    PathHoldingFile& operator=(const PathHoldingFile&&) = delete;
};

// Helper function to execute a command with a safe file path (requires literal string prefixes)
template <size_t N> inline std::vector<uint8_t> exec_pipe_literal_string(const char (&command)[N])
{
    return exec_pipe_unsafe(command);
}

// Helper function to execute a command with a safe file path (requires literal string prefixes)
template <size_t N>
inline std::vector<uint8_t> exec_pipe_with_stdin(const std::string& file_path, const char (&command)[N] = "")
{
    PathHoldingFile temp(file_path);
    // Use command substitution to read the filename from the temporary file
    std::string full_command = "cat -- \"$(cat " + temp.path + ")\" | " + std::string(command);
    return exec_pipe_unsafe(full_command);
}

// Helper function to execute a command with a safe file path (requires literal string prefixes)
template <size_t N1, size_t N2 = 1>
inline std::vector<uint8_t> exec_pipe_with_number(const char (&command_prefix)[N1],
                                                  size_t number,
                                                  const char (&command_suffix)[N2] = "")
{
    std::string command = std::string(command_prefix) + std::to_string(number) + std::string(command_suffix);
    return exec_pipe_unsafe(command);
}
} // namespace bb
