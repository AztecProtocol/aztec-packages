#include "barretenberg/common/log.hpp"
#include <stdexcept>
#ifdef STACKTRACES
#include <backward.hpp>
#endif

inline void abort_with_message [[noreturn]] (std::string const& err)
{
    info("abort: ", err);
    std::abort();
}

// Native implementation of throw_or_abort
extern "C" void throw_or_abort_impl [[noreturn]] (const char* err)
{

#ifdef STACKTRACES
    // Use backward library to print stack trace
    backward::StackTrace trace;
    trace.load_here(32);
    backward::Printer{}.print(trace);
#endif
#ifndef BB_NO_EXCEPTIONS
    throw std::runtime_error(err);
#else
    abort_with_message(err);
#endif
}
