#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_wrapper.hpp"
#include "barretenberg/ipc/ipc_client.hpp"
#include "napi.h"
#include <cstdint>
#include <vector>

using namespace bb::nodejs::msgpack_client;

MsgpackClientWrapper::MsgpackClientWrapper(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    // Arg 0: shared memory base name (string)
    if (info.Length() < 1 || !info[0].IsString()) {
        throw Napi::TypeError::New(env, "First argument must be a string (shared memory name)");
    }
    std::string shm_name = info[0].As<Napi::String>();

    // Arg 1: max clients (number, default 1)
    size_t max_clients = 1;
    if (info.Length() > 1 && info[1].IsNumber()) {
        max_clients = info[1].As<Napi::Number>().Uint32Value();
    }

    // Create shared memory client
    client_ = bb::ipc::IpcClient::create_shm(shm_name, max_clients);

    // Connect to bb server
    if (!client_->connect()) {
        throw Napi::Error::New(env, "Failed to connect to shared memory server");
    }

    connected_ = true;
}

MsgpackClientWrapper::~MsgpackClientWrapper()
{
    if (client_ && connected_) {
        client_->close();
    }
}

Napi::Value MsgpackClientWrapper::call(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (!connected_) {
        throw Napi::Error::New(env, "Client is not connected");
    }

    // Arg 0: msgpack buffer to send
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        throw Napi::TypeError::New(env, "First argument must be a Buffer");
    }

    auto input_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    const uint8_t* input_data = input_buffer.Data();
    size_t input_len = input_buffer.Length();

    // Send request with retry on backpressure (1s timeout per attempt)
    // NOTE: timeout_ns=0 means IMMEDIATE timeout (not infinite wait!)
    // Loop until send succeeds - handles case where consumer is temporarily behind
    constexpr uint64_t TIMEOUT_NS = 1000000000; // 1 second
    while (!client_->send(input_data, input_len, TIMEOUT_NS)) {
        // Ring buffer full, consumer is behind - retry
    }

    // Receive response with retry (1s timeout per attempt)
    // Loop until response is ready - handles case where server is processing
    std::span<const uint8_t> response;
    while ((response = client_->recv(TIMEOUT_NS)).empty()) {
        // Response not ready yet, server is processing - retry
    }

    // Create JavaScript Buffer with the response (copy to JS land)
    auto js_buffer = Napi::Buffer<uint8_t>::Copy(env, response.data(), response.size());

    // Release the message (for shared memory this frees space in ring buffer)
    client_->release(response.size());

    return js_buffer;
}

Napi::Value MsgpackClientWrapper::close(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (client_ && connected_) {
        client_->close();
        connected_ = false;
    }

    return env.Undefined();
}

Napi::Function MsgpackClientWrapper::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "MsgpackClient",
                       {
                           MsgpackClientWrapper::InstanceMethod("call", &MsgpackClientWrapper::call),
                           MsgpackClientWrapper::InstanceMethod("close", &MsgpackClientWrapper::close),
                       });
}
