#include "barretenberg/common/log.hpp"
#include <stdexcept>

inline void abort_with_message [[noreturn]] (std::string const& err)
{
    info("abort: ", err);
    std::abort();
}

// Native implementation of throw_or_abort
extern "C" void throw_or_abort_impl [[noreturn]] (const char* err)
{
#ifndef BB_NO_EXCEPTIONS
    throw std::runtime_error(err);
#else
    abort_with_message(err);
#endif
}
