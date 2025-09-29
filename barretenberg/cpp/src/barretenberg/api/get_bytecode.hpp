#pragma once
#include "exec_pipe.hpp"
#include <filesystem>
#include <iostream>
#include <iterator>

/**
 * When compiling with zig, we're using zigs main.zig as an entrypoint.
 * The zig code provides a C ABI compatible function to get the bytecode using std features.
 * Avoids the need for popen calls to external programs.
 */
#ifdef __zig__
extern "C" const uint8_t* get_bytecode(char const* path, size_t* out_len);

inline std::vector<uint8_t> get_bytecode(const std::string& bytecodePath)
{
    size_t len = 0;
    const uint8_t* ptr = get_bytecode(bytecodePath.c_str(), &len);
    const auto result = std::vector<uint8_t>(ptr, ptr + len);
    free((void*)ptr);
    return result;
}
#else
/**
 * We can assume for now we're running on a unix like system and use the following to extract the bytecode.
 */
inline std::vector<uint8_t> gunzip(const std::string& path)
{
    return bb::exec_pipe_with_stdin(path, "gunzip -c");
}

inline std::vector<uint8_t> get_bytecode(const std::string& bytecodePath)
{
    if (bytecodePath == "-") {
        return { (std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>() };
    }
    std::filesystem::path filePath = bytecodePath;
    if (filePath.extension() == ".json") {
        // Try reading json files as if they are a Nargo build artifact
        return bb::exec_pipe_with_stdin(bytecodePath, "jq -r '.bytecode' - | base64 -d | gunzip -c");
    }

    // For other extensions, assume file is a raw ACIR program
    return gunzip(bytecodePath);
}
#endif

// Filesystem path overload for convenience.
inline std::vector<uint8_t> get_bytecode(const std::filesystem::path& bytecodePath)
{
    return get_bytecode(bytecodePath.string());
}
