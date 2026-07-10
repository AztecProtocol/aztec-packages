#include "barretenberg/avm/avm_ffi.h"

#include <napi.h>

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Thin NAPI wrapper over the avm_sim_ffi C ABI (barretenberg). Runs the AVM
// in-process — no bb-avm-sim subprocess. Deliberately tiny and generic: the
// only AVM-specific part is the constructor wiring its deps (wsdb/cdb paths);
// `call` is byte-in/byte-out and knows nothing about AVM commands. Barretenberg
// stays free of any Node/NAPI code; this wrapper is the in-process consumer of
// its C ABI, mirroring bb-avm-sim as the out-of-process consumer.
//
// `call` runs the (blocking) C ABI on a worker thread and returns a Promise:
// the AVM must NOT run on the JS thread, because it reaches contract data over
// the CDB socket whose server runs on that same event loop — a synchronous call
// would block the loop and deadlock against its own CDB requests. One instance
// serves one concurrent call (its clients aren't shared-thread-safe); a pool of
// instances gives concurrency, mirroring the out-of-process process pool.
namespace {

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

  // new InProcessAvm(wsdbPath, cdbPath) — connects to the WSDB + CDB servers
  // (Slice A keeps those out-of-process, reached over their sockets).
  InProcessAvm(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<InProcessAvm>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
      Napi::TypeError::New(
          env, "InProcessAvm(wsdbPath, cdbPath) expects two strings")
          .ThrowAsJavaScriptException();
      return;
    }
    std::string wsdb_path = info[0].As<Napi::String>().Utf8Value();
    std::string cdb_path = info[1].As<Napi::String>().Utf8Value();
    instance_ = avm_create_ipc(wsdb_path.c_str(), cdb_path.c_str());
    if (instance_ == nullptr) {
      Napi::Error::New(env, "avm_create_ipc failed")
          .ThrowAsJavaScriptException();
    }
  }

  ~InProcessAvm() override { free_instance(); }

  // call(request: Buffer): Promise<Buffer> — one msgpack AvmSimulate frame
  // in/out, run on a worker thread.
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
    // Copy the request out of the JS Buffer: it must stay valid on the worker
    // thread, independent of GC.
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
  }

  avm_instance_t *instance_ = nullptr;
};

} // namespace

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "InProcessAvm"),
              InProcessAvm::get_class(env));
  return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(avm_inprocess, Init)
