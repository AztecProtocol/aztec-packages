#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/log.hpp"
#include <cstdlib>
#include <stdexcept>
#ifdef STACKTRACES
#include <backward.hpp>
#endif

void throw_or_abort_impl [[noreturn]] (const char* err)
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
    info("abort: ", err);
    std::abort();
#endif
}
