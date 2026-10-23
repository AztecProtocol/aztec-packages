#pragma once
#include "log.hpp"
#include <stdexcept>
#include <string>

// Throws std::runtime_error, or under BB_NO_EXCEPTIONS logs the message and aborts.
void throw_or_abort_impl [[noreturn]] (char const* err);

inline void throw_or_abort [[noreturn]] (std::string const& err)
{
    throw_or_abort_impl(err.c_str());
}
