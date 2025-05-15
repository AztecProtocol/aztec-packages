#pragma once
#include "log.hpp"
#include <string>

inline void abort_with_message [[noreturn]] (std::string const& err)
{
    info("abort: ", err);
    std::abort();
}

inline void throw_or_abort [[noreturn]] (std::string const& err)
{
#ifndef BB_NO_EXCEPTIONS
    throw std::runtime_error(err);
#else
    abort_with_message(err);
#endif
}
