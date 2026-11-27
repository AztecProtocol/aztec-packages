#include "ffi_library.hpp"

#include "napi.h"

#include <dlfcn.h>

#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace ipc::napi {

namespace {

// dlopen returns the same handle for every load of one file, so the handle identifies the library
// and its single service context.
std::shared_ptr<FfiLibrary::Loaded> load(const std::string& path, const std::string& ffi_name)
{
    static std::mutex registry_mutex;
    static std::map<void*, std::shared_ptr<FfiLibrary::Loaded>> registry;

    void* handle = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (handle == nullptr) {
        const char* error = dlerror();
        throw std::runtime_error(path + ": " + (error != nullptr ? error : "dlopen failed"));
    }
    std::lock_guard<std::mutex> lock(registry_mutex);
    auto& loaded = registry[handle];
    if (!loaded) {
        auto fresh = std::make_shared<FfiLibrary::Loaded>();
        const std::string entry_name = ffi_name + "_ipc_ffi_entry";
        const std::string free_name = ffi_name + "_ipc_ffi_free";
        fresh->entry = reinterpret_cast<FfiLibrary::Entry>(dlsym(handle, entry_name.c_str()));
        fresh->free = reinterpret_cast<FfiLibrary::Free>(dlsym(handle, free_name.c_str()));
        if (fresh->entry == nullptr || fresh->free == nullptr) {
            registry.erase(handle);
            throw std::runtime_error(path + ": does not export " + entry_name + " and " + free_name);
        }
        loaded = std::move(fresh);
    } else {
        // Drop the extra reference this dlopen took; the first one keeps the library loaded.
        dlclose(handle);
    }
    return loaded;
}

std::vector<uint8_t> run_entry(FfiLibrary::Loaded& loaded, const uint8_t* input, size_t input_len)
{
    uint8_t* output = nullptr;
    size_t output_len = 0;
    {
        std::lock_guard<std::mutex> lock(loaded.mutex);
        loaded.entry(input, input_len, &output, &output_len);
    }
    std::vector<uint8_t> response(output, output + output_len);
    loaded.free(output);
    return response;
}

Napi::Uint8Array input_arg(const Napi::CallbackInfo& info)
{
    if (info.Length() != 1 || !info[0].IsTypedArray() ||
        info[0].As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        throw Napi::TypeError::New(info.Env(), "expected one Uint8Array argument");
    }
    return info[0].As<Napi::Uint8Array>();
}

class CallWorker : public Napi::AsyncWorker {
  public:
    CallWorker(Napi::Env env, std::shared_ptr<FfiLibrary::Loaded> loaded, const Napi::Uint8Array& input)
        : Napi::AsyncWorker(env)
        , deferred_(Napi::Promise::Deferred::New(env))
        , loaded_(std::move(loaded))
        , input_(input.Data(), input.Data() + input.ByteLength())
    {}

    Napi::Promise promise() const { return deferred_.Promise(); }

    void Execute() override { response_ = run_entry(*loaded_, input_.data(), input_.size()); }

    void OnOK() override { deferred_.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), response_.data(), response_.size())); }

    void OnError(const Napi::Error& error) override { deferred_.Reject(error.Value()); }

  private:
    Napi::Promise::Deferred deferred_;
    std::shared_ptr<FfiLibrary::Loaded> loaded_;
    // Copied: the caller's buffer may be reused or collected before the worker runs.
    std::vector<uint8_t> input_;
    std::vector<uint8_t> response_;
};

} // namespace

FfiLibrary::FfiLibrary(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 2 || !info[0].IsString() || !info[1].IsString()) {
        throw Napi::TypeError::New(env, "expected (libraryPath: string, ffiName: string)");
    }
    try {
        loaded_ = load(info[0].As<Napi::String>(), info[1].As<Napi::String>());
    } catch (const std::exception& e) {
        throw Napi::Error::New(env, e.what());
    }
}

Napi::Value FfiLibrary::call(const Napi::CallbackInfo& info)
{
    Napi::Uint8Array input = input_arg(info);
    std::vector<uint8_t> response = run_entry(*loaded_, input.Data(), input.ByteLength());
    return Napi::Buffer<uint8_t>::Copy(info.Env(), response.data(), response.size());
}

Napi::Value FfiLibrary::call_async(const Napi::CallbackInfo& info)
{
    Napi::Uint8Array input = input_arg(info);
    auto* worker = new CallWorker(info.Env(), loaded_, input);
    Napi::Promise promise = worker->promise();
    worker->Queue(); // the worker deletes itself once it has settled the promise
    return promise;
}

Napi::Function FfiLibrary::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "FfiLibrary",
                       {
                           InstanceMethod("call", &FfiLibrary::call),
                           InstanceMethod("callAsync", &FfiLibrary::call_async),
                       });
}

} // namespace ipc::napi
