#include "msgpack_client_wrapper.hpp"

#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"

#include <chrono>
#include <cstdint>
#include <span>
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

  // Retry on backpressure, but with an overall deadline: this is a blocking
  // call on the Node main thread, and a dead/wedged server must surface as
  // an error rather than hanging the process forever.
  constexpr uint64_t TIMEOUT_NS = 1'000'000'000;        // 1s per attempt
  constexpr uint64_t CALL_DEADLINE_NS = 60'000'000'000; // 60s overall

  auto now_ns = [] {
    return static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now().time_since_epoch())
            .count());
  };
  const uint64_t start_ns = now_ns();

  while (!client_->send(input_data, input_len, TIMEOUT_NS)) {
    // request ring full, consumer behind — retry until the deadline
    if (now_ns() - start_ns > CALL_DEADLINE_NS) {
      throw Napi::Error::New(
          env, "IPC call timed out sending request (server unresponsive?)");
    }
  }

  // data() == nullptr means timeout; a non-null empty span is a valid
  // zero-length response.
  std::span<const uint8_t> response;
  while ((response = client_->receive(TIMEOUT_NS)).data() == nullptr) {
    if (now_ns() - start_ns > CALL_DEADLINE_NS) {
      throw Napi::Error::New(
          env,
          "IPC call timed out waiting for response (server unresponsive?)");
    }
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
