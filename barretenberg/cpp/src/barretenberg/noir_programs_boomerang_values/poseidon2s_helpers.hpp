#pragma once
#include <optional>
#include <utility>

namespace poseidon2_helpers {
template <typename T, typename... Args> bool all_equal(const T& first, const Args&... rest)
{
    return ((first == rest) && ...);
}

enum GateIndex : size_t {
    tmp1 = 0, // tmp1 = s0 + s1 + 2*s3
    tmp2 = 1, // tmp2 = s2 + 2*s1 + s3
    v2 = 2,   // v2   = tmp2 + 4*s0 + 4*s1
    v1 = 3,   // v1   = v2 + tmp1
    v4 = 4,   // v4   = tmp1 + 4*s2 + 4*s3
    v3 = 5,   // v3   = v4 + tmp2
};

enum WireIndex : size_t {
    w_l = 0,
    w_r = 1,
    w_o = 2,
    w_4 = 3,
};
} // namespace poseidon2_helpers
