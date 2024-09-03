#pragma once
#include "log.hpp"
#include <string>

namespace bb {
inline void throw_or_abort [[noreturn]] (std::string const& err)
{
#ifndef __wasm__
    throw std::runtime_error(err);
#else
    abort_with_message(err);
#endif
}

inline void abort_with_message [[noreturn]] (std::string const& err)
{
    info("abort: ", err);
    std::abort();
}
} // namespace bb