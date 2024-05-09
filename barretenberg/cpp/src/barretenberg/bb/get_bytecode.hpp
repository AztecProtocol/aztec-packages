#pragma once
#include "exec_pipe.hpp"

/**
 * We can assume for now we're running on a unix like system and use the following to extract the bytecode.
 */
inline std::vector<uint8_t> get_bytecode(const std::string& bytecodePath)
{
    try {
        // Assume file is a raw ACIR program
        std::string command = "gunzip -c \"" + bytecodePath + "\"";
        return exec_pipe(command);
    } catch (...) {
        // Try reading it as if it were a Nargo build artifact
        std::string command = "jq -r '.bytecode' \"" + bytecodePath + "\" | base64 -d | gunzip -c";
        return exec_pipe(command);
    }
}
