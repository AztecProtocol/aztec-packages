#pragma once
#include "exec_pipe.hpp"
#include <filesystem>
#include <iostream>
#include <iterator>
#include <vector>

// Parse JSON and extract base64-encoded gzipped bytecode
std::vector<uint8_t> get_bytecode_from_json(const std::string& jsonPath);

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
        return get_bytecode_from_json(bytecodePath);
    }

    // For other extensions, assume file is a raw ACIR program
    return gunzip(bytecodePath);
}
