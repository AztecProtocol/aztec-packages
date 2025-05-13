#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <memory>
#include <vector>

namespace bb {
inline std::vector<uint8_t> exec_pipe([[maybe_unused]] const std::string& command)
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
} // namespace bb
