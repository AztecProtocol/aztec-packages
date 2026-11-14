#pragma once

#include "napi.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>

namespace ipc::napi {

/**
 * @brief A shared library exporting an ipc-codegen FFI entry, loaded into node.
 *
 * `new FfiLibrary(path, ffiName)` dlopens `path` and resolves `<ffiName>_ipc_ffi_entry` and
 * `<ffiName>_ipc_ffi_free`, the C contract `--ffi --server` emits. So a service ships a plain
 * shared library with no Node-API code in it, and this addon is the only one node loads.
 *
 *   call(input: Uint8Array): Buffer                 runs on the calling thread
 *   callAsync(input: Uint8Array): Promise<Buffer>   runs on the libuv thread pool
 *
 * The FFI entry is not thread-safe, so every call into one library, from any FfiLibrary over it,
 * holds that library's mutex. The library is never unloaded: its service state lives as long as
 * the process, as a native addon's would.
 */
class FfiLibrary : public Napi::ObjectWrap<FfiLibrary> {
  public:
    using Entry = void (*)(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
    using Free = void (*)(void* ptr);

    /** One per loaded library, shared by every FfiLibrary over it. */
    struct Loaded {
        Entry entry = nullptr;
        Free free = nullptr;
        std::mutex mutex;
    };

    FfiLibrary(const Napi::CallbackInfo& info);

    Napi::Value call(const Napi::CallbackInfo& info);
    Napi::Value call_async(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

  private:
    std::shared_ptr<Loaded> loaded_;
};

} // namespace ipc::napi
