#include "msgpack_client_wrapper.hpp"

#include "ipc_runtime/blocking_call.hpp"
#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"

#include <cstdint>
#include <span>
#include <string>

namespace ipc::napi {

MsgpackClientWrapper::MsgpackClientWrapper(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        throw Napi::TypeError::New(env, "First argument must be a string (shared memory name)");
    }
    std::string shm_name = info[0].As<Napi::String>();

    // Optional second arg pins a specific MPSC slot; otherwise self-allocate one
    // on connect (kAutoClientId).
    std::size_t client_id = ipc::kAutoClientId;
    if (info.Length() >= 2 && info[1].IsNumber()) {
        client_id = static_cast<std::size_t>(info[1].As<Napi::Number>().Uint32Value());
    }

    // Optional third arg: the server's pid, so a call can tell a dead server
    // from a slow one. Without it, calls wait indefinitely.
    if (info.Length() >= 3 && info[2].IsNumber()) {
        server_pid_ = static_cast<pid_t>(info[2].As<Napi::Number>().Int32Value());
    }

    // MPSC-SHM client — matches ipc::make_server which uses MPSC by default,
    // so the same shm_name can host multiple clients (each with a distinct slot).
    client_ = ipc::IpcClient::create_mpsc_shm(shm_name, client_id);

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

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        throw Napi::TypeError::New(env, "First argument must be a Buffer");
    }

    auto input_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    const uint8_t* input_data = input_buffer.Data();
    size_t input_len = input_buffer.Length();

    // Node's main thread is held for the whole call, so the server's exit event
    // can't run: call_blocking checks whether the server is alive itself.
    auto result = ipc::call_blocking(*client_, input_data, input_len, server_pid_);
    if (result.status == ipc::BlockingCallResult::Status::TooLarge) {
        throw Napi::Error::New(env, "IPC request too large for the shared-memory ring");
    }
    if (result.status == ipc::BlockingCallResult::Status::ServerExited) {
        auto err = Napi::Error::New(env, "IPC server process exited");
        err.Set("serverExited", Napi::Boolean::New(env, true));
        err.Set("exitCode",
                result.server_exit.code >= 0 ? Napi::Value(Napi::Number::New(env, result.server_exit.code))
                                             : env.Null());
        err.Set("signal",
                result.server_exit.signal >= 0 ? Napi::Value(Napi::Number::New(env, result.server_exit.signal))
                                               : env.Null());
        throw err;
    }
    std::span<const uint8_t> response = result.response;

    auto js_buffer = Napi::Buffer<uint8_t>::Copy(env, response.data(), response.size());
    client_->release(response.size());
    return js_buffer;
}

Napi::Value MsgpackClientWrapper::close(const Napi::CallbackInfo& info)
{
    if (client_ && connected_) {
        client_->close();
        connected_ = false;
    }
    return info.Env().Undefined();
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

} // namespace ipc::napi
