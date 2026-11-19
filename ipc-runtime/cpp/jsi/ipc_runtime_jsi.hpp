#pragma once
/**
 * @file ipc_runtime_jsi.hpp
 * @brief The ipc-codegen FFI contract over JSI, for React Native: what the Node-API addon is to node.
 *
 * Hermes has no WebAssembly and no workers, so a service runs in a React Native app as its native
 * library, linked into the app, and its JavaScript client reaches it through the functions
 * install() puts on `globalThis.__ipcRuntimeJsi`:
 *
 *   createInstance(ffiName, library?)      an instance on a thread of its own; call() returns a promise
 *   createInstanceSync(ffiName, library?)  an instance on the JavaScript thread; callSync() returns the bytes
 *
 * Each instance has `call`/`callSync(request, hostCall?)` and `destroy()`. `hostCall(target,
 * request)` answers the instance's host calls: with a Uint8Array, or for an asynchronous instance
 * also with a promise of one, which its thread waits on while the JavaScript thread runs.
 *
 * A library is found by its FFI name: registered with register_ffi() (a static library, as on
 * iOS), else loaded from `library` when given, else as lib<ffiName>.so / lib<ffiName>.dylib, else
 * looked up among the symbols already in the process.
 */

#include <jsi/jsi.h>

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace ipc::jsi {

/** One library's FFI exports: `<ffiName>_ipc_ffi_*`. set_host_call is null for a library that has no host calls. */
struct FfiSymbols {
    void* (*create)() = nullptr;
    void (*call)(void* instance, const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len) =
        nullptr;
    void (*destroy)(void* instance) = nullptr;
    void* (*alloc)(size_t size) = nullptr;
    void (*free)(void* ptr) = nullptr;
    void (*set_host_call)(int32_t (*host_call)(const uint8_t* target,
                                               size_t target_len,
                                               const uint8_t* request,
                                               size_t request_len,
                                               uint8_t** response,
                                               size_t* response_len)) = nullptr;
};

/** Makes a library linked into the app reachable by its FFI name. */
void register_ffi(const std::string& ffi_name, const FfiSymbols& symbols);

/**
 * Runs a task on the JavaScript thread, with its runtime: React Native's CallInvoker::invokeAsync,
 * or a test host's event loop. Called from any thread.
 */
using RunOnJs = std::function<void(std::function<void(facebook::jsi::Runtime&)>)>;

/** Puts `__ipcRuntimeJsi` on the runtime's global object. Call on the JavaScript thread. */
void install(facebook::jsi::Runtime& runtime, RunOnJs run_on_js);

} // namespace ipc::jsi

/**
 * Declares a statically linked library's FFI exports, for registering them under its FFI name from a
 * translation unit of the app (where the linker keeps them):
 *
 *   IPC_RUNTIME_JSI_DECLARE_FFI(bb)
 *   ipc::jsi::register_ffi("bb", IPC_RUNTIME_JSI_SYMBOLS(bb));
 *
 * The _WITH_HOST_CALLS variants are for a library that makes host calls (exports set_host_call).
 */
#define IPC_RUNTIME_JSI_DECLARE_FFI(name)                                                                              \
    extern "C" void* name##_ipc_ffi_create();                                                                          \
    extern "C" void name##_ipc_ffi_call(void*, const uint8_t*, size_t, uint8_t**, size_t*);                            \
    extern "C" void name##_ipc_ffi_destroy(void*);                                                                     \
    extern "C" void* name##_ipc_ffi_alloc(size_t);                                                                     \
    extern "C" void name##_ipc_ffi_free(void*);

#define IPC_RUNTIME_JSI_DECLARE_FFI_WITH_HOST_CALLS(name)                                                              \
    IPC_RUNTIME_JSI_DECLARE_FFI(name)                                                                                  \
    extern "C" void name##_ipc_ffi_set_host_call(                                                                      \
        int32_t (*)(const uint8_t*, size_t, const uint8_t*, size_t, uint8_t**, size_t*));

#define IPC_RUNTIME_JSI_SYMBOLS(name)                                                                                  \
    ::ipc::jsi::FfiSymbols                                                                                             \
    {                                                                                                                  \
        .create = name##_ipc_ffi_create, .call = name##_ipc_ffi_call, .destroy = name##_ipc_ffi_destroy,               \
        .alloc = name##_ipc_ffi_alloc, .free = name##_ipc_ffi_free, .set_host_call = nullptr                           \
    }

#define IPC_RUNTIME_JSI_SYMBOLS_WITH_HOST_CALLS(name)                                                                  \
    ::ipc::jsi::FfiSymbols                                                                                             \
    {                                                                                                                  \
        .create = name##_ipc_ffi_create, .call = name##_ipc_ffi_call, .destroy = name##_ipc_ffi_destroy,               \
        .alloc = name##_ipc_ffi_alloc, .free = name##_ipc_ffi_free, .set_host_call = name##_ipc_ffi_set_host_call      \
    }
