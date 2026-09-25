/**
 * The three environment functions barretenberg declares in barretenberg/env, implemented for the
 * wasm reactor. The native build gets them from the env module; this one gets them from here, so
 * the module asks its host for nothing but WASI.
 *
 * Everything here reaches the host through wasi-libc, which is why barretenberg/wasi carries no
 * WASI stubs of its own: a module that answers its own fd_write cannot have its output routed by
 * whoever embeds it.
 */
#include "barretenberg/common/wasm_export.hpp"
#include <cstdint>
#include <cstdlib>
#include <iostream>

extern "C" {

// WASM_EXPORT ensures these symbols stay visible when compiling with -fvisibility=hidden.

/** Logs to stderr with the module's linear memory size, the wasm counterpart of native peak RSS. */
WASM_EXPORT void logstr(char const* msg)
{
    constexpr size_t PAGES_PER_MIB = 16; // 64 KiB pages
    const size_t mib = __builtin_wasm_memory_size(0) / PAGES_PER_MIB;
    std::cerr << msg << " (mem: " << mib << " MiB)\n";
}

/**
 * Only reached when HARDWARE_CONCURRENCY is unset, which an embedder is expected to put in the
 * module's WASI environment. Wasm has no way to ask how many cores the machine has.
 */
WASM_EXPORT uint32_t env_hardware_concurrency()
{
    return 1;
}

/**
 * The wasm build compiles without exceptions, so a throw cannot unwind: report and exit. The
 * embedder sees proc_exit, which its WASI implementation turns back into an exception.
 */
WASM_EXPORT void throw_or_abort_impl [[noreturn]] (char const* err)
{
    std::cerr << "abort: " << err << "\n" << std::flush;
    _Exit(1);
}
}
