#pragma once

#include "napi.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>

namespace ipc::napi {

/**
 * @brief A shared library exporting an ipc-codegen FFI entry, loaded into node.
 *
 * `new FfiLibrary(path, ffiName)` dlopens `path` and resolves the C contract `--ffi --server`
 * emits under `<ffiName>_ipc_ffi_*`. So a service ships a plain shared library with no Node-API
 * code in it, and this addon is the only one node loads.
 *
 *   call(input: Uint8Array): Buffer                 the process instance, on the calling thread
 *   callAsync(input: Uint8Array): Promise<Buffer>   the process instance, on the libuv thread pool
 *   hasInstances(): boolean                         whether the library exports FFI instances
 *   createInstance(): Instance                      a fresh instance of the service
 *   callInstance(instance, input, hostCall?): Buffer
 *   destroyInstance(instance): void
 *
 * The process instance (the FFI entry) is not thread-safe, so every call into it, from any
 * FfiLibrary over the library, holds that library's mutex. Instances share nothing, so separate
 * instances may be called from separate threads (node workers) at once; one instance is called
 * from one thread at a time. hostCall, a function (target: string, request: Uint8Array) =>
 * Uint8Array, answers the service's host calls for that one call, synchronously, on the calling
 * thread. The library is never unloaded: its service state lives as long as the process, as a
 * native addon's would.
 */
class FfiLibrary : public Napi::ObjectWrap<FfiLibrary> {
  public:
    using Entry = void (*)(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
    using Free = void (*)(void* ptr);
    using Alloc = void* (*)(size_t size);
    using Create = void* (*)();
    using CallInstance = void (*)(void* instance,
                                  const uint8_t* input,
                                  size_t input_len,
                                  uint8_t** output,
                                  size_t* output_len);
    using Destroy = void (*)(void* instance);

    /** One per loaded library, shared by every FfiLibrary over it. */
    struct Loaded {
        Entry entry = nullptr;
        Free free = nullptr;
        Alloc alloc = nullptr;
        // Null when the library predates FFI instances; createInstance then throws.
        Create create = nullptr;
        CallInstance call_instance = nullptr;
        Destroy destroy = nullptr;
        std::mutex mutex;
    };

    FfiLibrary(const Napi::CallbackInfo& info);

    Napi::Value call(const Napi::CallbackInfo& info);
    Napi::Value call_async(const Napi::CallbackInfo& info);
    Napi::Value has_instances(const Napi::CallbackInfo& info);
    Napi::Value create_instance(const Napi::CallbackInfo& info);
    Napi::Value call_instance(const Napi::CallbackInfo& info);
    Napi::Value destroy_instance(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

  private:
    std::shared_ptr<Loaded> loaded_;
    std::string name_;
};

} // namespace ipc::napi
