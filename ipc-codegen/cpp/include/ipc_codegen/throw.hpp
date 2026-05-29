#pragma once
/**
 * @file throw.hpp
 * @brief THROW / RETHROW macros for code that compiles in both
 *        exception-enabled and -fno-exceptions modes.
 *
 * - Native (default): `THROW x` is equivalent to `throw x` — full exception
 *   semantics. `RETHROW` is bare `throw`.
 * - WASM / -fno-exceptions (`BB_NO_EXCEPTIONS` defined): `THROW x` evaluates
 *   `x` once (so its constructor still runs, matching observable behaviour)
 *   and then aborts. `RETHROW` is a bare `std::abort()`.
 *
 * Use through codegen output that needs to compile in both modes (msgpack-c
 * uses `THROW` internally; the codegen-emitted headers forward the
 * convention so consumers don't have to thread it through every include).
 *
 * The macros are defined inside an `#ifndef THROW` guard so callers that
 * predefine their own THROW/RETHROW (e.g. a parent project's exception
 * shim) can do so before this header is reached and we yield to whichever
 * variant the parent project wants.
 */

#ifndef THROW

#ifdef BB_NO_EXCEPTIONS
#include <cstdlib>

namespace ipc::detail {
struct AbortOnThrow {
  template <typename T>
  [[noreturn]] void operator<<(const T & /*ignored*/) const noexcept {
    std::abort();
  }
};
} // namespace ipc::detail

#define THROW ::ipc::detail::AbortOnThrow() <<
#define RETHROW std::abort()
// Redefine `try` / `catch` so code that uses raw keywords (e.g. msgpack-c's
// `try { ... } catch (...)`) still compiles under -fno-exceptions. The catch
// body is always-skipped dead code in this mode; we rely on \`throw\` becoming
// `abort()` for the error-propagation path.
#define try if (true)
#define catch(...) if (false)
#else
#define THROW throw
#define RETHROW throw
#endif // BB_NO_EXCEPTIONS

#endif // THROW
