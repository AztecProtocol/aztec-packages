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

    // Allocate response buffer once (16MB should be enough for most responses)
    const size_t MAX_RESPONSE_SIZE = 16 * 1024 * 1024;
    response_buffer_.resize(MAX_RESPONSE_SIZE);

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

    // Send request (timeout 0 = infinite)
    if (!client_->send(input_data, input_len, 0)) {
        throw Napi::Error::New(env, "Failed to send msgpack request");
    }

    // Receive response using pre-allocated buffer
    ssize_t bytes_received = client_->recv(response_buffer_.data(), response_buffer_.size(), 0);
    if (bytes_received < 0) {
        throw Napi::Error::New(env, "Failed to receive msgpack response");
    }

    // Create JavaScript Buffer with the response
    return Napi::Buffer<uint8_t>::Copy(env, response_buffer_.data(), static_cast<size_t>(bytes_received));
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
