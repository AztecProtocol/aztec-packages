#pragma once
#include "barretenberg/env/throw_or_abort_impl.hpp"
#include "log.hpp"
#include <string>

inline void throw_or_abort [[noreturn]] (std::string const& err)
{
    throw_or_abort_impl(err.c_str());
}
