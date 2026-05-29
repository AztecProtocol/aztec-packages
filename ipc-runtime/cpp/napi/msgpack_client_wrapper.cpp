#include "msgpack_client_wrapper.hpp"

#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"

#include <cstdint>
#include <string>

namespace ipc::napi {

MsgpackClientWrapper::MsgpackClientWrapper(const Napi::CallbackInfo &info)
    : ObjectWrap(info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    throw Napi::TypeError::New(
        env, "First argument must be a string (shared memory name)");
  }
  std::string shm_name = info[0].As<Napi::String>();

  // Optional second arg: MPSC client slot id (defaults to 0).
  std::size_t client_id = 0;
  if (info.Length() >= 2 && info[1].IsNumber()) {
    client_id =
        static_cast<std::size_t>(info[1].As<Napi::Number>().Uint32Value());
  }

  // MPSC-SHM client — matches ipc::make_server which uses MPSC by default,
  // so the same shm_name can host multiple clients (each with a distinct slot).
  client_ = ipc::IpcClient::create_mpsc_shm(shm_name, client_id);

  if (!client_->connect()) {
    throw Napi::Error::New(env, "Failed to connect to shared memory server");
  }

  connected_ = true;
}

MsgpackClientWrapper::~MsgpackClientWrapper() {
  if (client_ && connected_) {
    client_->close();
  }
}

Napi::Value MsgpackClientWrapper::call(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!connected_) {
    throw Napi::Error::New(env, "Client is not connected");
  }

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    throw Napi::TypeError::New(env, "First argument must be a Buffer");
  }

  auto input_buffer = info[0].As<Napi::Buffer<uint8_t>>();
  const uint8_t *input_data = input_buffer.Data();
  size_t input_len = input_buffer.Length();

  // timeout_ns=0 means IMMEDIATE timeout (not infinite). Retry on backpressure.
  constexpr uint64_t TIMEOUT_NS = 1'000'000'000; // 1 second
  while (!client_->send(input_data, input_len, TIMEOUT_NS)) {
    // request ring full, consumer behind — retry
  }

  std::span<const uint8_t> response;
  while ((response = client_->receive(TIMEOUT_NS)).empty()) {
    // response not ready yet — retry
  }

  auto js_buffer =
      Napi::Buffer<uint8_t>::Copy(env, response.data(), response.size());
  client_->release(response.size());
  return js_buffer;
}

Napi::Value MsgpackClientWrapper::close(const Napi::CallbackInfo &info) {
  if (client_ && connected_) {
    client_->close();
    connected_ = false;
  }
  return info.Env().Undefined();
}

Napi::Function MsgpackClientWrapper::get_class(Napi::Env env) {
  return DefineClass(env, "MsgpackClient",
                     {
                         MsgpackClientWrapper::InstanceMethod(
                             "call", &MsgpackClientWrapper::call),
                         MsgpackClientWrapper::InstanceMethod(
                             "close", &MsgpackClientWrapper::close),
                     });
}

} // namespace ipc::napi
