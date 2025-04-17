#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <vector>

inline std::vector<uint8_t> exec_pipe([[maybe_unused]] std::string const& command)
{
#ifdef __wasm__
    throw_or_abort("Can't use popen() in wasm! Implement this functionality natively.");
#else
    FILE* pipe = popen(command.c_str(), "r");
    if (!pipe) {
        throw_or_abort("popen() failed! Can't run: " + command);
    }

    std::vector<uint8_t> result;
    while (!feof(pipe)) {
        uint8_t buffer[128];
        size_t count = fread(buffer, 1, sizeof(buffer), pipe);
        result.insert(result.end(), buffer, buffer + count);
    }

    pclose(pipe);
    return result;
#endif
}
