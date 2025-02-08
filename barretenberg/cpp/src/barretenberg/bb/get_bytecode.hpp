#pragma once
#include "exec_pipe.hpp"
#include <filesystem>
#include <iostream>
#include <iterator>

/**
 * We can assume for now we're running on a unix like system and use the following to extract the bytecode.
 */
inline std::vector<uint8_t> gunzip(const std::string& path)
{
    std::string command = "gunzip -c \"" + path + "\"";
    return exec_pipe(command);
}

inline std::vector<uint8_t> get_bytecode(const std::string& bytecodePath)
{
    if (bytecodePath == "-") {
        return { (std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>() };
    }
    std::filesystem::path filePath = bytecodePath;
    if (filePath.extension() == ".json") {
        // Try reading json files as if they are a Nargo build artifact
        std::string command = "jq -r '.bytecode' \"" + bytecodePath + "\" | base64 -d | gunzip -c";
        return exec_pipe(command);
    }

    // For other extensions, assume file is a raw ACIR program
    return gunzip(bytecodePath);
}
