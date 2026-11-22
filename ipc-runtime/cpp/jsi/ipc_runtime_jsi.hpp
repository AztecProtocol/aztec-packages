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
 *   hasAsyncInstances(ffiName, library?)   whether the library exports asynchronous instances
 *   createAsyncInstance(ffiName, library, onEvent)
 *                                          an asynchronous instance on a thread of its own (see below)
 *
 * Each instance has `call`/`callSync(request, hostCall?)` and `destroy()`. `hostCall(target,
 * request)` answers the instance's host calls: with a Uint8Array, or for an asynchronous instance
 * also with a promise of one, which its thread waits on while the JavaScript thread runs.
 *
 * An asynchronous instance (the library's <ffiName>_ipc_ffi_create_async and the rest) has
 * `submit(requestId, request)`, `deliver(callId, status, response)` and `destroy()`, none of which
 * blocks; it reports on the JavaScript thread through `onEvent(kind, id, target, bytes)`: kind 0 the
 * response to request `id`, kind 1 a host call `id` to `target`, answered with deliver(). It keeps
 * taking requests while its host calls are out, so a host call may lead back into it.
 *
 * A library is found by its FFI name: registered with register_ffi() (a static library, as on
 * iOS), else loaded from `library` when given, else as lib<ffiName>.so / lib<ffiName>.dylib, else
 * looked up among the symbols already in the process.
 */

#include "ipc_runtime/ffi_abi.h"

#include <jsi/jsi.h>

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace ipc::jsi {

/**
 * One library's FFI exports: `<ffiName>_ipc_ffi_*` (ipc_runtime/ffi_abi.h). set_host_call is null for
 * a library that has no host calls.
 */
struct FfiSymbols {
    ipc_ffi_create_fn create = nullptr;
    ipc_ffi_call_fn call = nullptr;
    ipc_ffi_destroy_fn destroy = nullptr;
    ipc_ffi_alloc_fn alloc = nullptr;
    ipc_ffi_free_fn free = nullptr;
    ipc_ffi_set_host_call_fn set_host_call = nullptr;
    /** The asynchronous instances, for a library that has them (all four, or none). */
    ipc_ffi_create_async_fn create_async = nullptr;
    ipc_ffi_submit_fn submit = nullptr;
    ipc_ffi_deliver_fn deliver = nullptr;
    ipc_ffi_destroy_fn destroy_async = nullptr;
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
 * The _WITH_HOST_CALLS variants are for a library that makes host calls (exports set_host_call), and
 * the _ASYNC ones for a library that also has asynchronous instances (exports create_async and the rest).
 */
#define IPC_RUNTIME_JSI_DECLARE_FFI(name)                                                                              \
    extern "C" void* name##_ipc_ffi_create();                                                                          \
    extern "C" void name##_ipc_ffi_call(void*, const uint8_t*, size_t, uint8_t**, size_t*);                            \
    extern "C" void name##_ipc_ffi_destroy(void*);                                                                     \
    extern "C" void* name##_ipc_ffi_alloc(size_t);                                                                     \
    extern "C" void name##_ipc_ffi_free(void*);

#define IPC_RUNTIME_JSI_DECLARE_FFI_WITH_HOST_CALLS(name)                                                              \
    IPC_RUNTIME_JSI_DECLARE_FFI(name)                                                                                  \
    extern "C" void name##_ipc_ffi_set_host_call(ipc_ffi_host_call_fn);

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

#define IPC_RUNTIME_JSI_DECLARE_FFI_ASYNC(name)                                                                        \
    IPC_RUNTIME_JSI_DECLARE_FFI_WITH_HOST_CALLS(name)                                                                  \
    extern "C" void* name##_ipc_ffi_create_async(void*, ipc_async_respond_fn, ipc_async_call_fn);                       \
    extern "C" void name##_ipc_ffi_submit(void*, uint64_t, const uint8_t*, size_t);                                    \
    extern "C" void name##_ipc_ffi_deliver(void*, uint64_t, int32_t, const uint8_t*, size_t);                          \
    extern "C" void name##_ipc_ffi_destroy_async(void*);

#define IPC_RUNTIME_JSI_SYMBOLS_ASYNC(name)                                                                            \
    ::ipc::jsi::FfiSymbols                                                                                             \
    {                                                                                                                  \
        .create = name##_ipc_ffi_create, .call = name##_ipc_ffi_call, .destroy = name##_ipc_ffi_destroy,               \
        .alloc = name##_ipc_ffi_alloc, .free = name##_ipc_ffi_free, .set_host_call = name##_ipc_ffi_set_host_call,     \
        .create_async = name##_ipc_ffi_create_async, .submit = name##_ipc_ffi_submit,                                  \
        .deliver = name##_ipc_ffi_deliver, .destroy_async = name##_ipc_ffi_destroy_async                               \
    }
