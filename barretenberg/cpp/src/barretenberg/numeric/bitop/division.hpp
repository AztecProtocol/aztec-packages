#pragma once

namespace bb::numeric {

template <typename T> constexpr inline T div_ceil(T a, T b)
{
    return (a + b - 1) / b;
}

} // namespace bb::numeric
