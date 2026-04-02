// In WASM builds, throw_or_abort_impl is provided by the JavaScript environment
// (declared as WASM_IMPORT in throw_or_abort_impl.hpp). The JS implementation
// throws a catchable JS Error with the error message.
//
// For non-JS WASM runtimes (wasmtime), the import must also be provided.
// See barretenberg/cpp/scripts/wasmtime.sh for the wasmtime configuration.
//
// We guard out the C++ definition so the JS import is used instead of being
// shadowed by the local definition (which would call std::abort).
#ifndef __wasm__

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include <stdexcept>
#ifdef STACKTRACES
#include <backward.hpp>
#endif

inline void abort_with_message [[noreturn]] (std::string const& err)
{
    info("abort: ", err);
    std::abort();
}

// WASM_EXPORT ensures this symbol stays visible when compiling with -fvisibility=hidden.
WASM_EXPORT void throw_or_abort_impl [[noreturn]] (const char* err)
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

#endif // !__wasm__
