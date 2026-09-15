#pragma once

#include <iostream>
#include <sstream>
#include <string>

// Minimal logging for wsdb, replacing barretenberg's common/log.hpp with no bb dependency.
// Note: we deliberately do NOT define a free `format(...)` here — lmdblib already provides
// one (azteclabs::lmdblib::format), and the merkle/storage code pulls it in via lmdblib; defining
// a second `format` in namespace bb would make every call ambiguous.
namespace azteclabs::wsdb {

namespace detail {
template <typename... Args> std::string log_concat(Args&&... args)
{
    std::ostringstream os;
    (os << ... << args);
    return os.str();
}
} // namespace detail

template <typename... Args> void info(Args&&... args)
{
    std::cout << detail::log_concat(std::forward<Args>(args)...) << std::endl;
}

template <typename... Args> void error(Args&&... args)
{
    std::cerr << detail::log_concat(std::forward<Args>(args)...) << std::endl;
}

} // namespace azteclabs::wsdb
