#include "msgpack_client_async.hpp"

#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"

#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace ipc::napi {

MsgpackClientAsync::MsgpackClientAsync(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        throw Napi::TypeError::New(env, "First argument must be a string (shared memory name)");
    }
    std::string shm_name = info[0].As<Napi::String>();

    std::size_t client_id = 0;
    if (info.Length() >= 2 && info[1].IsNumber()) {
        client_id = static_cast<std::size_t>(info[1].As<Napi::Number>().Uint32Value());
    }

    // MPSC-SHM client — matches ipc::make_server's default transport.
    client_ = ipc::IpcClient::create_mpsc_shm(shm_name, client_id);

    if (!client_->connect()) {
        throw Napi::Error::New(env, "Failed to connect to shared memory server");
    }
}

Napi::Value MsgpackClientAsync::setResponseCallback(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction()) {
        throw Napi::TypeError::New(env, "First argument must be a function");
    }

    // Store callback for lazy TSFN creation in acquire().
    js_callback_ = Napi::Persistent(info[0].As<Napi::Function>());

    // Start the response poller. Detached — runs until process exit; no need
    // for explicit shutdown.
    poll_thread_ = std::thread(&MsgpackClientAsync::poll_responses, this);
    poll_thread_.detach();

    return env.Undefined();
}

void MsgpackClientAsync::poll_responses()
{
    constexpr uint64_t TIMEOUT_NS = 1'000'000'000; // 1s

    while (true) {
        std::span<const uint8_t> response = client_->receive(TIMEOUT_NS);
        if (response.empty()) {
            continue; // timeout — keep polling
        }

        // Copy out — span is invalidated by release().
        auto* response_data = new std::vector<uint8_t>(response.begin(), response.end());
        client_->release(response.size());

        std::lock_guard<std::mutex> lock(tsfn_mutex_);
        auto status = tsfn_.NonBlockingCall(
            response_data, [](Napi::Env env, Napi::Function js_callback, std::vector<uint8_t>* data) {
                auto js_buffer = Napi::Buffer<uint8_t>::Copy(env, data->data(), data->size());
                js_callback.Call({ js_buffer });
                delete data;
            });
        if (status != napi_ok) {
            // Failed to queue — likely process exiting. Drop the response.
            delete response_data;
        }
    }
}

Napi::Value MsgpackClientAsync::call(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        throw Napi::TypeError::New(env, "First argument must be a Buffer");
    }

    auto input_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    const uint8_t* input_data = input_buffer.Data();
    size_t input_len = input_buffer.Length();

    // Non-blocking write (timeout_ns=0). TS owns the promise queue.
    if (!client_->send(input_data, input_len, 0)) {
        throw Napi::Error::New(env, "Failed to send request, ring buffer full. Make it bigger?");
    }

    return env.Undefined();
}

Napi::Value MsgpackClientAsync::acquire(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(tsfn_mutex_);

    if (ref_count_ == 0) {
        // Lazily create TSFN on 0 → 1.
        tsfn_ = Napi::ThreadSafeFunction::New(env,
                                              js_callback_.Value(),
                                              "IpcRuntimeShmResponseCallback",
                                              /*max_queue_size*/ 0,
                                              /*initial_thread_count*/ 1);
    }
    ref_count_++;
    return env.Undefined();
}

Napi::Value MsgpackClientAsync::release(const Napi::CallbackInfo& info)
{
    std::lock_guard<std::mutex> lock(tsfn_mutex_);
    ref_count_--;
    if (ref_count_ == 0) {
        tsfn_.Release(); // 1 → 0
    }
    return info.Env().Undefined();
}

Napi::Function MsgpackClientAsync::get_class(Napi::Env env)
{
    return DefineClass(
        env,
        "MsgpackClientAsync",
        {
            MsgpackClientAsync::InstanceMethod("setResponseCallback", &MsgpackClientAsync::setResponseCallback),
            MsgpackClientAsync::InstanceMethod("call", &MsgpackClientAsync::call),
            MsgpackClientAsync::InstanceMethod("acquire", &MsgpackClientAsync::acquire),
            MsgpackClientAsync::InstanceMethod("release", &MsgpackClientAsync::release),
        });
}

} // namespace ipc::napi
