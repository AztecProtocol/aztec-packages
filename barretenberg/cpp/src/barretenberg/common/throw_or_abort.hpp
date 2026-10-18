#pragma once
#include "barretenberg/env/throw_or_abort_impl.hpp"
#include "log.hpp"
#include <stdexcept>
#include <string>

inline void throw_or_abort [[noreturn]] (std::string const& err)
{
#if defined(__wasm__) && !defined(BB_NO_EXCEPTIONS)
    // Throw inside the module, so catch blocks such as bbapi's error responses see it. The JavaScript environment's
    // throw_or_abort_impl throws a JS error, which unwinds the module without running them or any destructors.
    throw std::runtime_error(err);
#else
    throw_or_abort_impl(err.c_str());
#endif
}
