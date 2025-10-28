#pragma once

#include <exception>
#include <iostream>
#include <sstream>

#include "../utility/stream.hpp"

namespace tf {

// Procedure: throw_se
// Throws the system error under a given error code.
template <typename... ArgsT>
// void throw_se(const char* fname, const size_t line, Error::Code c, ArgsT&&... args) {
void throw_re(const char* fname, const size_t line, ArgsT&&... args)
{
    std::ostringstream oss;
    oss << "[" << fname << ":" << line << "] ";
    // ostreamize(oss, std::forward<ArgsT>(args)...);
    (oss << ... << args);
    throw std::runtime_error(oss.str());
}

} // namespace tf

#define TF_THROW(...) tf::throw_re(__FILE__, __LINE__, __VA_ARGS__);
