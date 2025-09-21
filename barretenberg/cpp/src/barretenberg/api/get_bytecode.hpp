#pragma once
#include "exec_pipe.hpp"
#include <iostream>
#include <iterator>

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
    // Check if the file has a .json extension
    size_t dotPos = bytecodePath.find_last_of('.');
    if (dotPos != std::string::npos && bytecodePath.substr(dotPos) == ".json") {
        // Try reading json files as if they are a Nargo build artifact
        return bb::exec_pipe_with_stdin(bytecodePath, "jq -r '.bytecode' - | base64 -d | gunzip -c");
    }

    // For other extensions, assume file is a raw ACIR program
    return gunzip(bytecodePath);
}
