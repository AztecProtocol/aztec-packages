#pragma once
/**
 * @file msgpack_include.hpp
 * @brief The one sanctioned way to include <msgpack.hpp> from generated code.
 *
 * Under BB_NO_EXCEPTIONS (-fno-exceptions, e.g. WASM) msgpack-c's raw
 * try/catch blocks do not compile, so they are rewritten to always-taken /
 * dead branches for the duration of this include only. THROW (see throw.hpp)
 * aborts in that mode, so the catch bodies are unreachable. Defining macros
 * named after keywords is ill-formed if any standard-library header is
 * preprocessed while they are active — hence the tight scope and #undef.
 */

#include "throw.hpp"
// msgpack-c 7.0.0 uses std::remove_volatile and friends without including <type_traits>; libc++ in
// wasi-sdk does not provide it transitively.
#include <type_traits>

#ifdef BB_NO_EXCEPTIONS
#define try if (true)
#define catch(...) if (false)
#include <msgpack.hpp>
#undef try
#undef catch
#else
#include <msgpack.hpp>
#endif
