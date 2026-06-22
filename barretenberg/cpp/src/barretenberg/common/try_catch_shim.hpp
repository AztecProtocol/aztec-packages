#pragma once
#include "barretenberg/common/log.hpp"
#include <string>

// Tool to make header only libraries (i.e. CLI11 and msgpack, though it has a bundled copy)
// not use exceptions with minimally invaslive changes.
//
// Macros are guarded so any parent project (e.g. ipc_codegen/throw.hpp under
// codegen-emitted code) that predefines them wins. Same convention as
// ipc_codegen/throw.hpp, so the two headers can be #included in any order
// without redefinition warnings.

#ifndef THROW

#ifdef BB_NO_EXCEPTIONS
struct __AbortStream {
    void operator<< [[noreturn]] (const auto& error)
    {
        info(error.what());
        std::abort();
    }
};
#define THROW __AbortStream() <<
#define try if (true)
#define catch(...) if (false)
#define RETHROW
#else
#define THROW throw
#define RETHROW THROW
#endif

#endif // THROW
