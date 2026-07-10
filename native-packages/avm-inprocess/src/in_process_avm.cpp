#include "barretenberg/avm/avm_ffi.h"

#include <napi.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <future>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

// Thin NAPI wrapper over the avm_sim_ffi C ABI (barretenberg). Runs the AVM
// in-process — no bb-avm-sim subprocess.
//
//   new InProcessAvm(wsdbPath, cdbPath)      -> Slice A: CDB over its socket
//   new InProcessAvm(wsdbPath, onHostCall)   -> Slice B: CDB via a host_call
//                                               into JS (no CDB socket)
//
// `call(request)` runs a simulation on a worker thread and returns a Promise.
// The AVM MUST run off the JS thread: for Slice A it blocks on the CDB socket
// (served by the event loop), and for Slice B it blocks on host_call into JS —
// either would deadlock on the JS thread. host_call is the generic reverse
// channel: onHostCall(target, req) routes to the right host service; it's the
// native twin of the wasm host_call import (same (target, bytes) contract).
namespace {

// Forward-declared C-linkage trampoline so avm_create_hostcall (a C ABI) gets a
// plain function pointer; it dispatches back to the owning InProcessAvm.
extern "C" void avm_host_call_trampoline(void *ctx, uint32_t target,
                                         const uint8_t *req, size_t req_len,
                                         uint8_t **resp_out,
                                         size_t *resp_len_out);

// Payload handed to the JS thread for one host_call. `resp` outlives this
// struct (shared with the async .then handlers), so the worker's future stays
// valid even though the JS resolution happens later.
struct HostCallData {
  uint32_t target;
  std::vector<uint8_t> req;
  std::shared_ptr<std::promise<std::vector<uint8_t>>> resp;
};

// Runs on the JS thread: invoke onHostCall(target, req) and wire its result
// (Buffer or Promise<Buffer>) to the shared promise.
void host_call_on_js(Napi::Env env, Napi::Function on_host_call,
                     HostCallData *data) {
  auto resp = data->resp; // copy the shared_ptr so it outlives `data`
  uint32_t target = data->target;
  Napi::Buffer<uint8_t> req_buf =
      Napi::Buffer<uint8_t>::Copy(env, data->req.data(), data->req.size());
  delete data;

  try {
    Napi::Value result =
        on_host_call.Call({Napi::Number::New(env, target), req_buf});
    if (result.IsPromise()) {
      Napi::Object promise = result.As<Napi::Object>();
      Napi::Function then = promise.Get("then").As<Napi::Function>();
      Napi::Function on_ok =
          Napi::Function::New(env, [resp](const Napi::CallbackInfo &info) {
            auto b = info[0].As<Napi::Buffer<uint8_t>>();
            resp->set_value(
                std::vector<uint8_t>(b.Data(), b.Data() + b.Length()));
            return info.Env().Undefined();
          });
      Napi::Function on_err =
          Napi::Function::New(env, [resp](const Napi::CallbackInfo &info) {
            std::string msg = info.Length() > 0 ? info[0].ToString().Utf8Value()
                                                : "onHostCall rejected";
            resp->set_exception(
                std::make_exception_ptr(std::runtime_error(msg)));
            return info.Env().Undefined();
          });
      then.Call(promise, {on_ok, on_err});
    } else {
      auto b = result.As<Napi::Buffer<uint8_t>>();
      resp->set_value(std::vector<uint8_t>(b.Data(), b.Data() + b.Length()));
    }
  } catch (const std::exception &e) {
    resp->set_exception(std::make_exception_ptr(
        std::runtime_error(std::string("onHostCall failed: ") + e.what())));
  }
}

// AsyncWorker that runs one avm_call off the JS thread and settles a Promise.
class CallWorker : public Napi::AsyncWorker {
public:
  CallWorker(Napi::Env env, avm_instance_t *instance,
             std::vector<uint8_t> request, Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env), instance_(instance),
        request_(std::move(request)), deferred_(deferred) {}

  void Execute() override {
    uint8_t *out = nullptr;
    size_t out_len = 0;
    int rc =
        avm_call(instance_, request_.data(), request_.size(), &out, &out_len);
    if (rc != 0) {
      SetError("avm_call failed");
      return;
    }
    response_.assign(out, out + out_len);
    std::free(out);
  }

  void OnOK() override {
    Napi::HandleScope scope(Env());
    deferred_.Resolve(
        Napi::Buffer<uint8_t>::Copy(Env(), response_.data(), response_.size()));
  }

  void OnError(const Napi::Error &e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
  }

private:
  avm_instance_t *instance_;
  std::vector<uint8_t> request_;
  std::vector<uint8_t> response_;
  Napi::Promise::Deferred deferred_;
};

class InProcessAvm : public Napi::ObjectWrap<InProcessAvm> {
public:
  static Napi::Function get_class(Napi::Env env) {
    return DefineClass(env, "InProcessAvm",
                       {
                           InstanceMethod("call", &InProcessAvm::call),
                           InstanceMethod("destroy", &InProcessAvm::destroy),
                       });
  }

  InProcessAvm(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<InProcessAvm>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString()) {
      Napi::TypeError::New(env, "InProcessAvm(wsdbPath, cdbPath|onHostCall)")
          .ThrowAsJavaScriptException();
      return;
    }
    std::string wsdb_path = info[0].As<Napi::String>().Utf8Value();

    if (info[1].IsString()) {
      // Slice A: contract data over the CDB socket.
      std::string cdb_path = info[1].As<Napi::String>().Utf8Value();
      instance_ = avm_create_ipc(wsdb_path.c_str(), cdb_path.c_str());
    } else if (info[1].IsFunction()) {
      // Slice B: contract data via host_call into JS. The TSFN lets the
      // worker-thread AVM call the (JS-thread) onHostCall and block for it.
      host_call_ = Napi::ThreadSafeFunction::New(
          env, info[1].As<Napi::Function>(), "avm_host_call", 0, 1);
      has_host_call_ = true;
      instance_ = avm_create_hostcall(wsdb_path.c_str(),
                                      &avm_host_call_trampoline, this);
    } else {
      Napi::TypeError::New(
          env,
          "second arg must be a cdb path (string) or onHostCall (function)")
          .ThrowAsJavaScriptException();
      return;
    }
    if (instance_ == nullptr) {
      Napi::Error::New(env, "failed to create in-process AVM")
          .ThrowAsJavaScriptException();
    }
  }

  ~InProcessAvm() override { free_instance(); }

  // Invoked (on the AVM worker thread) by the C trampoline for each host_call.
  void run_host_call(uint32_t target, const uint8_t *req, size_t req_len,
                     uint8_t **resp_out, size_t *resp_len_out) {
    *resp_out = nullptr;
    *resp_len_out = 0;
    auto *data = new HostCallData{
        target, std::vector<uint8_t>(req, req + req_len),
        std::make_shared<std::promise<std::vector<uint8_t>>>()};
    auto future = data->resp->get_future();
    napi_status status = host_call_.BlockingCall(data, host_call_on_js);
    if (status != napi_ok) {
      delete data; // the JS callback will not run
      return;
    }
    try {
      std::vector<uint8_t> resp =
          future.get(); // blocks the worker until JS resolves
      auto *buffer =
          static_cast<uint8_t *>(std::malloc(resp.empty() ? 1 : resp.size()));
      if (buffer == nullptr) {
        return;
      }
      std::memcpy(buffer, resp.data(), resp.size());
      *resp_out = buffer;
      *resp_len_out = resp.size();
    } catch (...) {
      // Leave *resp_out null → HostCallContractDB throws → avm_call errors.
    }
  }

  Napi::Value call(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (instance_ == nullptr) {
      deferred.Reject(
          Napi::Error::New(env, "InProcessAvm already destroyed").Value());
      return deferred.Promise();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
      deferred.Reject(
          Napi::TypeError::New(env, "call(request: Buffer) expects a Buffer")
              .Value());
      return deferred.Promise();
    }
    auto request = info[0].As<Napi::Buffer<uint8_t>>();
    std::vector<uint8_t> request_copy(request.Data(),
                                      request.Data() + request.Length());
    auto *worker =
        new CallWorker(env, instance_, std::move(request_copy), deferred);
    worker->Queue();
    return deferred.Promise();
  }

  Napi::Value destroy(const Napi::CallbackInfo &info) {
    free_instance();
    return info.Env().Undefined();
  }

private:
  void free_instance() {
    if (instance_ != nullptr) {
      avm_destroy(instance_);
      instance_ = nullptr;
    }
    if (has_host_call_) {
      host_call_.Release();
      has_host_call_ = false;
    }
  }

  avm_instance_t *instance_ = nullptr;
  Napi::ThreadSafeFunction host_call_;
  bool has_host_call_ = false;
};

extern "C" void avm_host_call_trampoline(void *ctx, uint32_t target,
                                         const uint8_t *req, size_t req_len,
                                         uint8_t **resp_out,
                                         size_t *resp_len_out) {
  static_cast<InProcessAvm *>(ctx)->run_host_call(target, req, req_len,
                                                  resp_out, resp_len_out);
}

} // namespace

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "InProcessAvm"),
              InProcessAvm::get_class(env));
  return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(avm_inprocess, Init)
