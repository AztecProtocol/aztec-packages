#include "ffi_library.hpp"

#include "napi.h"

#include <dlfcn.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace ipc::napi {

namespace {

/** The host-call function of the instance call in progress on this thread, if it gave one. */
struct HostCalls {
    Napi::Env env;
    Napi::Function fn;
    FfiLibrary::Alloc alloc;
};
thread_local HostCalls* host_calls = nullptr;

/** Sets this thread's host-call function for one call, and restores the previous one after. */
class HostCallScope {
  public:
    explicit HostCallScope(HostCalls* calls)
        : previous_(host_calls)
    {
        host_calls = calls;
    }
    HostCallScope(const HostCallScope&) = delete;
    HostCallScope& operator=(const HostCallScope&) = delete;
    HostCallScope(HostCallScope&&) = delete;
    HostCallScope& operator=(HostCallScope&&) = delete;
    ~HostCallScope() { host_calls = previous_; }

  private:
    HostCalls* previous_;
};

/** A host call's answer: the response bytes in a buffer the library frees, and the status. */
int32_t answer(FfiLibrary::Alloc alloc,
               const uint8_t* bytes,
               size_t len,
               int32_t status,
               uint8_t** response,
               size_t* response_len)
{
    auto* out = static_cast<uint8_t*>(alloc(len));
    if (len > 0) {
        std::memcpy(out, bytes, len);
    }
    *response = out;
    *response_len = len;
    return status;
}

int32_t fail(FfiLibrary::Alloc alloc, const std::string& message, uint8_t** response, size_t* response_len)
{
    return answer(alloc, reinterpret_cast<const uint8_t*>(message.data()), message.size(), 1, response, response_len);
}

/**
 * Every loaded library's host-call function (<ffiName>_ipc_ffi_set_host_call): answered by the
 * host-call function the instance call in progress on this thread was given.
 */
int32_t host_call(const uint8_t* target,
                  size_t target_len,
                  const uint8_t* request,
                  size_t request_len,
                  uint8_t** response,
                  size_t* response_len)
{
    HostCalls* calls = host_calls;
    if (calls == nullptr) {
        // No call of ours is on this thread to say which library is asking; the caller frees with
        // std::free, which every library's alloc is compatible with.
        static constexpr char message[] =
            "host_call: nothing is bound for this call's host calls (pass hostCall to callInstance)";
        // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
        return answer(std::malloc, reinterpret_cast<const uint8_t*>(message), sizeof(message) - 1, 1, response,
                      response_len);
    }
    Napi::Env env = calls->env;
    Napi::HandleScope scope(env);
    Napi::Value result;
    try {
        result = calls->fn.Call({ Napi::String::New(env, reinterpret_cast<const char*>(target), target_len),
                                  Napi::Buffer<uint8_t>::Copy(env, request, request_len) });
    } catch (const Napi::Error& e) {
        return fail(calls->alloc, e.Message(), response, response_len);
    }
    if (!result.IsTypedArray() || result.As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        return fail(calls->alloc, "the host-call function must return a Uint8Array synchronously", response,
                    response_len);
    }
    auto bytes = result.As<Napi::Uint8Array>();
    return answer(calls->alloc, bytes.Data(), bytes.ByteLength(), 0, response, response_len);
}

using SetHostCall = void (*)(decltype(&host_call));

template <typename Fn> Fn symbol(void* handle, const std::string& name)
{
    return reinterpret_cast<Fn>(dlsym(handle, name.c_str()));
}

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
        fresh->entry = symbol<FfiLibrary::Entry>(handle, entry_name);
        fresh->free = symbol<FfiLibrary::Free>(handle, free_name);
        if (fresh->entry == nullptr || fresh->free == nullptr) {
            registry.erase(handle);
            throw std::runtime_error(path + ": does not export " + entry_name + " and " + free_name);
        }
        fresh->alloc = symbol<FfiLibrary::Alloc>(handle, ffi_name + "_ipc_ffi_alloc");
        fresh->create = symbol<FfiLibrary::Create>(handle, ffi_name + "_ipc_ffi_create");
        fresh->call_instance = symbol<FfiLibrary::CallInstance>(handle, ffi_name + "_ipc_ffi_call");
        fresh->destroy = symbol<FfiLibrary::Destroy>(handle, ffi_name + "_ipc_ffi_destroy");
        if (fresh->alloc == nullptr || fresh->call_instance == nullptr || fresh->destroy == nullptr) {
            fresh->create = nullptr;
        }
        if (auto set_host_call = symbol<SetHostCall>(handle, ffi_name + "_ipc_ffi_set_host_call")) {
            set_host_call(&host_call);
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

/** Holds an instance for JS; destroyInstance ends it, and collection ends it if that never ran. */
struct Instance {
    std::shared_ptr<FfiLibrary::Loaded> loaded;
    void* handle = nullptr;
    bool busy = false;
};

Instance* instance_arg(const Napi::CallbackInfo& info, const std::string& name)
{
    if (info.Length() < 1 || !info[0].IsExternal()) {
        throw Napi::TypeError::New(info.Env(), "expected an instance from createInstance()");
    }
    auto* instance = info[0].As<Napi::External<Instance>>().Data();
    if (instance->handle == nullptr) {
        throw Napi::Error::New(info.Env(), name + ": instance used after destroyInstance()");
    }
    return instance;
}

} // namespace

FfiLibrary::FfiLibrary(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 2 || !info[0].IsString() || !info[1].IsString()) {
        throw Napi::TypeError::New(env, "expected (libraryPath: string, ffiName: string)");
    }
    try {
        name_ = info[1].As<Napi::String>();
        loaded_ = load(info[0].As<Napi::String>(), name_);
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

Napi::Value FfiLibrary::create_instance(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (loaded_->create == nullptr) {
        throw Napi::Error::New(env, name_ + ": the library does not export FFI instances");
    }
    void* handle = loaded_->create();
    if (handle == nullptr) {
        throw Napi::Error::New(env, name_ + ": the service failed to create an instance");
    }
    return Napi::External<Instance>::New(
        env, new Instance{ .loaded = loaded_, .handle = handle }, [](Napi::Env, Instance* instance) {
            if (instance->handle != nullptr) {
                instance->loaded->destroy(instance->handle);
            }
            delete instance;
        });
}

Napi::Value FfiLibrary::call_instance(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    Instance* instance = instance_arg(info, name_);
    if (info.Length() < 2 || !info[1].IsTypedArray() ||
        info[1].As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        throw Napi::TypeError::New(env, "expected a Uint8Array input");
    }
    if (instance->busy) {
        // A host call reaching back into the instance it came from.
        throw Napi::Error::New(env, name_ + ": instance called while a call on it is in progress");
    }
    // Copied: a host call may run JS that touches the caller's buffer.
    Napi::Uint8Array input_array = info[1].As<Napi::Uint8Array>();
    std::vector<uint8_t> input(input_array.Data(), input_array.Data() + input_array.ByteLength());
    bool has_host_calls = info.Length() >= 3 && info[2].IsFunction();
    HostCalls calls{ env, has_host_calls ? info[2].As<Napi::Function>() : Napi::Function(), instance->loaded->alloc };
    uint8_t* output = nullptr;
    size_t output_len = 0;
    {
        HostCallScope scope(has_host_calls ? &calls : nullptr);
        instance->busy = true;
        instance->loaded->call_instance(instance->handle, input.data(), input.size(), &output, &output_len);
        instance->busy = false;
    }
    Napi::Value response = Napi::Buffer<uint8_t>::Copy(env, output, output_len);
    instance->loaded->free(output);
    return response;
}

Napi::Value FfiLibrary::destroy_instance(const Napi::CallbackInfo& info)
{
    Instance* instance = instance_arg(info, name_);
    if (instance->busy) {
        throw Napi::Error::New(info.Env(), name_ + ": instance destroyed while a call on it is in progress");
    }
    instance->loaded->destroy(instance->handle);
    instance->handle = nullptr;
    return info.Env().Undefined();
}

Napi::Function FfiLibrary::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "FfiLibrary",
                       {
                           InstanceMethod("call", &FfiLibrary::call),
                           InstanceMethod("callAsync", &FfiLibrary::call_async),
                           InstanceMethod("createInstance", &FfiLibrary::create_instance),
                           InstanceMethod("callInstance", &FfiLibrary::call_instance),
                           InstanceMethod("destroyInstance", &FfiLibrary::destroy_instance),
                       });
}

} // namespace ipc::napi
