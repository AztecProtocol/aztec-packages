#include "service_thread.hpp"

#include "napi.h"

#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace ipc::napi {

namespace {

void set_error(std::vector<uint8_t>& bytes, std::string_view message)
{
    bytes.assign(message.begin(), message.end());
}

/** A plain Uint8Array (not a node Buffer, whose type would leak into decoded results) holding a copy of `bytes`. */
Napi::Uint8Array to_uint8_array(Napi::Env env, const std::vector<uint8_t>& bytes)
{
    auto buffer = Napi::ArrayBuffer::New(env, bytes.size());
    if (!bytes.empty()) {
        std::memcpy(buffer.Data(), bytes.data(), bytes.size());
    }
    return Napi::Uint8Array::New(env, bytes.size(), buffer, 0);
}

} // namespace

/** Host calls of the instance in one slot: a sibling directly, anything else through JS. */
class ServiceThread::Router : public HostCallRouter {
  public:
    Router(ServiceThread& thread, int64_t slot)
        : thread_(thread)
        , slot_(slot)
    {}

    int32_t route(std::string_view target,
                  const uint8_t* request,
                  size_t request_len,
                  std::vector<uint8_t>& answer) override
    {
        const auto& siblings = thread_.slots_.at(slot_).siblings;
        auto sibling = siblings.find(std::string(target));
        if (sibling != siblings.end()) {
            return thread_.call_slot(sibling->second, request, request_len, answer);
        }
        return thread_.ask_js(slot_, target, request, request_len, answer);
    }

  private:
    ServiceThread& thread_;
    int64_t slot_;
};

ServiceThread::ServiceThread(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction() || (info.Length() >= 2 && !info[1].IsFunction())) {
        throw Napi::TypeError::New(env, "expected (onHostCall: function, onAsyncEvent?: function)");
    }
    on_host_call_ = Napi::Persistent(info[0].As<Napi::Function>());
    if (info.Length() >= 2) {
        on_async_event_ = Napi::Persistent(info[1].As<Napi::Function>());
    }
    tsfn_ = Tsfn::New(env, "ipc-runtime service thread", 0, 1, this);
    // Idle until something is in flight (see enqueue).
    tsfn_.Unref(env);
    if (const char* spin = std::getenv("IPC_NAPI_SPIN_US")) {
        spin_ = std::chrono::microseconds(std::strtol(spin, nullptr, 10));
    }
    thread_ = std::thread([this] { run(); });
    // Added after the thread-safe function's own hook, so it runs first: hooks run in reverse order.
    env_ = env;
    cleanup_hooked_ = napi_add_env_cleanup_hook(env, &ServiceThread::on_env_cleanup, this) == napi_ok;
}

ServiceThread::~ServiceThread()
{
    // Collected without destroy(): nothing is in flight, or JS would still hold this object.
    remove_cleanup_hook();
    stop();
}

void ServiceThread::on_env_cleanup(void* self)
{
    auto* thread = static_cast<ServiceThread*>(self);
    thread->cleanup_hooked_ = false;
    thread->stop();
}

void ServiceThread::remove_cleanup_hook()
{
    if (cleanup_hooked_) {
        cleanup_hooked_ = false;
        napi_remove_env_cleanup_hook(env_, &ServiceThread::on_env_cleanup, this);
    }
}

void ServiceThread::stop()
{
    if (!thread_.joinable()) {
        return;
    }
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stopping_ = true;
        if (waiting_ != nullptr) {
            {
                std::lock_guard<std::mutex> wait_lock(waiting_->mutex);
                if (!waiting_->done) {
                    waiting_->status = 1;
                    set_error(waiting_->bytes, "the environment is shutting down");
                    waiting_->done = true;
                }
            }
            waiting_->answered.notify_one();
        }
        jobs_.push_back(Job{ .kind = Job::Kind::Stop });
        queued_++;
    }
    has_jobs_.notify_one();
    thread_.join();
    tsfn_.Release();
}

Napi::Promise ServiceThread::enqueue(Napi::Env env, Job job)
{
    auto* deferred = new Napi::Promise::Deferred(Napi::Promise::Deferred::New(env));
    Napi::Promise promise = deferred->Promise();
    job.deferred = deferred;
    if (in_flight_++ == 0) {
        tsfn_.Ref(env);
    }
    {
        std::lock_guard<std::mutex> lock(mutex_);
        jobs_.push_back(std::move(job));
        queued_++;
    }
    has_jobs_.notify_one();
    return promise;
}

Napi::Value ServiceThread::load(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        throw Napi::Error::New(env, "service thread destroyed");
    }
    if (info.Length() != 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsObject()) {
        throw Napi::TypeError::New(env, "expected (libraryPath: string, ffiName: string, siblings: object)");
    }
    Job job{ .kind = Job::Kind::Load, .slot = next_slot_ };
    try {
        job.loaded = load_library(info[0].As<Napi::String>(), info[1].As<Napi::String>());
    } catch (const std::exception& e) {
        throw Napi::Error::New(env, e.what());
    }
    Napi::Object siblings = info[2].As<Napi::Object>();
    Napi::Array names = siblings.GetPropertyNames();
    for (uint32_t i = 0; i < names.Length(); i++) {
        std::string name = names.Get(i).As<Napi::String>();
        int64_t sibling = siblings.Get(name).As<Napi::Number>().Int64Value();
        if (sibling < 0 || sibling >= next_slot_) {
            throw Napi::Error::New(env, "host-call target \"" + name + "\" is not an instance loaded on this thread");
        }
        job.siblings.emplace(std::move(name), sibling);
    }
    next_slot_++;
    return enqueue(env, std::move(job));
}

Napi::Value ServiceThread::load_async(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        throw Napi::Error::New(env, "service thread destroyed");
    }
    if (info.Length() != 2 || !info[0].IsString() || !info[1].IsString()) {
        throw Napi::TypeError::New(env, "expected (libraryPath: string, ffiName: string)");
    }
    if (on_async_event_.IsEmpty()) {
        throw Napi::Error::New(env, "this service thread was made without onAsyncEvent");
    }
    Job job{ .kind = Job::Kind::LoadAsync, .slot = next_slot_ };
    try {
        job.loaded = load_library(info[0].As<Napi::String>(), info[1].As<Napi::String>());
    } catch (const std::exception& e) {
        throw Napi::Error::New(env, e.what());
    }
    if (job.loaded->create_async == nullptr) {
        throw Napi::Error::New(env,
                               info[0].As<Napi::String>().Utf8Value() + ": exports no asynchronous instances (" +
                                   info[1].As<Napi::String>().Utf8Value() + "_ipc_ffi_create_async)");
    }
    next_slot_++;
    return enqueue(env, std::move(job));
}

void ServiceThread::enqueue_unsettled(Napi::Env env, Job job, bool pending)
{
    if (pending) {
        outstanding_[job.slot]++;
        if (in_flight_++ == 0) {
            tsfn_.Ref(env);
        }
    }
    {
        std::lock_guard<std::mutex> lock(mutex_);
        jobs_.push_back(std::move(job));
        queued_++;
    }
    has_jobs_.notify_one();
}

Napi::Value ServiceThread::submit(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        throw Napi::Error::New(env, "service thread destroyed");
    }
    if (info.Length() != 3 || !info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsTypedArray() ||
        info[2].As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        throw Napi::TypeError::New(env, "expected (slot: number, requestId: number, input: Uint8Array)");
    }
    auto input = info[2].As<Napi::Uint8Array>();
    enqueue_unsettled(env,
                      Job{ .kind = Job::Kind::Submit,
                           .slot = info[0].As<Napi::Number>().Int64Value(),
                           .input = std::vector<uint8_t>(input.Data(), input.Data() + input.ByteLength()),
                           .id = static_cast<uint64_t>(info[1].As<Napi::Number>().Int64Value()) },
                      true);
    return env.Undefined();
}

Napi::Value ServiceThread::deliver(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        return env.Undefined();
    }
    if (info.Length() != 4 || !info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsNumber() ||
        !info[3].IsTypedArray() || info[3].As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        throw Napi::TypeError::New(env, "expected (slot: number, callId: number, status: number, bytes: Uint8Array)");
    }
    auto bytes = info[3].As<Napi::Uint8Array>();
    enqueue_unsettled(env,
                      Job{ .kind = Job::Kind::Deliver,
                           .slot = info[0].As<Napi::Number>().Int64Value(),
                           .input = std::vector<uint8_t>(bytes.Data(), bytes.Data() + bytes.ByteLength()),
                           .id = static_cast<uint64_t>(info[1].As<Napi::Number>().Int64Value()),
                           .status = info[2].As<Napi::Number>().Int32Value() },
                      false);
    return env.Undefined();
}

void ServiceThread::on_async_respond(void* ctx, uint64_t request_id, const uint8_t* response, size_t len)
{
    auto* async = static_cast<AsyncCtx*>(ctx);
    auto message = std::make_unique<ToJs>();
    message->kind = ToJs::Kind::AsyncRespond;
    message->slot = async->slot;
    message->id = request_id;
    message->bytes.assign(response, response + len);
    async->thread->post(std::move(message));
}

void ServiceThread::on_async_call(
    void* ctx, uint64_t call_id, const uint8_t* target, size_t target_len, const uint8_t* request, size_t len)
{
    auto* async = static_cast<AsyncCtx*>(ctx);
    auto message = std::make_unique<ToJs>();
    message->kind = ToJs::Kind::AsyncCall;
    message->slot = async->slot;
    message->id = call_id;
    message->target.assign(reinterpret_cast<const char*>(target), target_len);
    message->bytes.assign(request, request + len);
    async->thread->post(std::move(message));
}

Napi::Value ServiceThread::call(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        throw Napi::Error::New(env, "service thread destroyed");
    }
    if (info.Length() != 2 || !info[0].IsNumber() || !info[1].IsTypedArray() ||
        info[1].As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        throw Napi::TypeError::New(env, "expected (slot: number, input: Uint8Array)");
    }
    auto input = info[1].As<Napi::Uint8Array>();
    // Copied: the caller may reuse its buffer as soon as this returns.
    return enqueue(env,
                   Job{ .kind = Job::Kind::Call,
                        .slot = info[0].As<Napi::Number>().Int64Value(),
                        .input = std::vector<uint8_t>(input.Data(), input.Data() + input.ByteLength()) });
}

Napi::Value ServiceThread::unload(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        return Napi::Promise::Deferred::New(env).Promise();
    }
    if (info.Length() != 1 || !info[0].IsNumber()) {
        throw Napi::TypeError::New(env, "expected (slot: number)");
    }
    // Requests still out on an instance being ended never get a response: stop counting them.
    auto outstanding = outstanding_.find(info[0].As<Napi::Number>().Int64Value());
    if (outstanding != outstanding_.end()) {
        in_flight_ -= outstanding->second;
        outstanding_.erase(outstanding);
        if (in_flight_ == 0) {
            tsfn_.Unref(env);
        }
    }
    return enqueue(env, Job{ .kind = Job::Kind::Unload, .slot = info[0].As<Napi::Number>().Int64Value() });
}

Napi::Value ServiceThread::answer(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 3 || !info[0].IsExternal() || !info[1].IsNumber() || !info[2].IsTypedArray() ||
        info[2].As<Napi::TypedArray>().TypedArrayType() != napi_uint8_array) {
        throw Napi::TypeError::New(env, "expected (token, status: number, bytes: Uint8Array)");
    }
    auto* wait = info[0].As<Napi::External<HostCallWait>>().Data();
    auto bytes = info[2].As<Napi::Uint8Array>();
    {
        std::lock_guard<std::mutex> lock(wait->mutex);
        if (wait->done) {
            throw Napi::Error::New(env, "host call answered twice");
        }
        wait->status = info[1].As<Napi::Number>().Int32Value();
        wait->bytes.assign(bytes.Data(), bytes.Data() + bytes.ByteLength());
        wait->done = true;
    }
    wait->answered.notify_one();
    return env.Undefined();
}

Napi::Value ServiceThread::destroy(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (destroyed_) {
        auto deferred = Napi::Promise::Deferred::New(env);
        deferred.Resolve(env.Undefined());
        return deferred.Promise();
    }
    destroyed_ = true;
    return enqueue(env, Job{ .kind = Job::Kind::Stop });
}

bool ServiceThread::post(std::unique_ptr<ToJs> message)
{
    if (tsfn_.BlockingCall(message.get()) != napi_ok) {
        return false;
    }
    message.release(); // call_js owns it now
    return true;
}

void ServiceThread::call_js(Napi::Env env, Napi::Function, ServiceThread* self, ToJs* raw)
{
    std::unique_ptr<ToJs> message(raw);
    if (message->kind == ToJs::Kind::AsyncRespond || message->kind == ToJs::Kind::AsyncCall) {
        if (env == nullptr) {
            return;
        }
        bool respond = message->kind == ToJs::Kind::AsyncRespond;
        try {
            self->on_async_event_.Call({ Napi::Number::New(env, static_cast<double>(message->slot)),
                                         Napi::Number::New(env, respond ? 0 : 1),
                                         Napi::Number::New(env, static_cast<double>(message->id)),
                                         Napi::String::New(env, message->target),
                                         to_uint8_array(env, message->bytes) });
        } catch (const Napi::Error&) {
            // The event handler's own failure; the instance carries on.
        }
        if (respond) {
            auto outstanding = self->outstanding_.find(message->slot);
            if (outstanding != self->outstanding_.end() && outstanding->second > 0) {
                outstanding->second--;
                if (--self->in_flight_ == 0) {
                    self->tsfn_.Unref(env);
                }
            }
        }
        return;
    }
    if (message->kind == ToJs::Kind::HostCall) {
        HostCallWait* wait = message->wait;
        auto fail = [&](std::string_view error) {
            {
                std::lock_guard<std::mutex> lock(wait->mutex);
                if (wait->done) {
                    return;
                }
                wait->status = 1;
                set_error(wait->bytes, error);
                wait->done = true;
            }
            wait->answered.notify_one();
        };
        if (env == nullptr) {
            fail("the environment is shutting down");
            return;
        }
        try {
            self->on_host_call_.Call({ Napi::Number::New(env, static_cast<double>(message->slot)),
                                       Napi::String::New(env, message->target),
                                       to_uint8_array(env, message->bytes),
                                       Napi::External<HostCallWait>::New(env, wait) });
        } catch (const Napi::Error& e) {
            fail(e.Message());
        }
        return;
    }

    std::unique_ptr<Napi::Promise::Deferred> deferred(message->deferred);
    if (env == nullptr || deferred == nullptr) {
        return;
    }
    if (message->failed) {
        deferred->Reject(Napi::Error::New(env, message->error).Value());
    } else {
        switch (message->value) {
        case ToJs::Value::Bytes:
            deferred->Resolve(to_uint8_array(env, message->bytes));
            break;
        case ToJs::Value::Slot:
            deferred->Resolve(Napi::Number::New(env, static_cast<double>(message->slot)));
            break;
        case ToJs::Value::None:
            deferred->Resolve(env.Undefined());
            break;
        }
    }
    if (message->stopped) {
        self->remove_cleanup_hook();
        self->thread_.join();
        self->tsfn_.Release();
        return;
    }
    if (--self->in_flight_ == 0) {
        self->tsfn_.Unref(env);
    }
}

void ServiceThread::run()
{
    for (;;) {
        Job job;
        if (spin_.count() > 0 && queued_.load(std::memory_order_acquire) == 0) {
            auto until = std::chrono::steady_clock::now() + spin_;
            while (queued_.load(std::memory_order_acquire) == 0 && std::chrono::steady_clock::now() < until) {
            }
        }
        {
            std::unique_lock<std::mutex> lock(mutex_);
            has_jobs_.wait(lock, [this] { return !jobs_.empty(); });
            job = std::move(jobs_.front());
            jobs_.pop_front();
            queued_--;
        }
        bool stop = job.kind == Job::Kind::Stop;
        run_job(job);
        if (stop) {
            return;
        }
    }
}

void ServiceThread::run_job(Job& job)
{
    auto message = std::make_unique<ToJs>();
    message->deferred = job.deferred;
    switch (job.kind) {
    case Job::Kind::Load: {
        void* handle = job.loaded->create();
        if (handle == nullptr) {
            message->failed = true;
            message->error = "the service failed to create an instance";
            break;
        }
        slots_.emplace(job.slot, Slot{ .loaded = job.loaded, .handle = handle, .siblings = std::move(job.siblings) });
        message->value = ToJs::Value::Slot;
        message->slot = job.slot;
        break;
    }
    case Job::Kind::LoadAsync: {
        auto ctx = std::make_unique<AsyncCtx>(AsyncCtx{ .thread = this, .slot = job.slot });
        void* handle =
            job.loaded->create_async(ctx.get(), &ServiceThread::on_async_respond, &ServiceThread::on_async_call);
        if (handle == nullptr) {
            message->failed = true;
            message->error = "the service failed to create an instance";
            break;
        }
        slots_.emplace(job.slot, Slot{ .loaded = job.loaded, .handle = handle, .async = std::move(ctx) });
        message->value = ToJs::Value::Slot;
        message->slot = job.slot;
        break;
    }
    case Job::Kind::Submit:
    case Job::Kind::Deliver: {
        auto slot = slots_.find(job.slot);
        if (slot == slots_.end() || !slot->second.async) {
            if (job.kind == Job::Kind::Submit) {
                static constexpr std::string_view error = "no asynchronous instance is loaded in this slot";
                AsyncCtx ctx{ .thread = this, .slot = job.slot };
                // The service's own error frame is not available here; a status-free error string
                // is what reaches the caller (as the response bytes).
                on_async_respond(&ctx, job.id, reinterpret_cast<const uint8_t*>(error.data()), error.size());
            }
            break;
        }
        if (job.kind == Job::Kind::Submit) {
            slot->second.loaded->submit(slot->second.handle, job.id, job.input.data(), job.input.size());
        } else {
            slot->second.loaded->deliver(slot->second.handle, job.id, job.status, job.input.data(), job.input.size());
        }
        break;
    }
    case Job::Kind::Call: {
        if (!slots_.contains(job.slot)) {
            message->failed = true;
            message->error = "no instance is loaded in slot " + std::to_string(job.slot);
            break;
        }
        int32_t status = call_slot(job.slot, job.input.data(), job.input.size(), message->bytes);
        if (status != 0) {
            message->failed = true;
            message->error.assign(message->bytes.begin(), message->bytes.end());
            message->bytes.clear();
            break;
        }
        message->value = ToJs::Value::Bytes;
        break;
    }
    case Job::Kind::Unload: {
        auto slot = slots_.find(job.slot);
        if (slot != slots_.end()) {
            (slot->second.async ? slot->second.loaded->destroy_async
                                : slot->second.loaded->destroy)(slot->second.handle);
            slots_.erase(slot);
        }
        break;
    }
    case Job::Kind::Stop:
        // In reverse load order: an instance may hold a sibling loaded before it.
        for (auto slot = slots_.rbegin(); slot != slots_.rend(); ++slot) {
            (slot->second.async ? slot->second.loaded->destroy_async
                                : slot->second.loaded->destroy)(slot->second.handle);
        }
        slots_.clear();
        message->stopped = job.deferred != nullptr;
        break;
    }
    if (job.deferred != nullptr) {
        post(std::move(message));
    }
}

int32_t ServiceThread::call_slot(int64_t slot_id, const uint8_t* input, size_t input_len, std::vector<uint8_t>& output)
{
    Slot& slot = slots_.at(slot_id);
    if (slot.busy) {
        // A chain of host calls reaching back into an instance mid-call.
        set_error(output, "instance called while a call on it is in progress");
        return 1;
    }
    Router router(*this, slot_id);
    uint8_t* bytes = nullptr;
    size_t len = 0;
    {
        HostCallScope scope(&router, slot.loaded->alloc);
        slot.busy = true;
        slot.loaded->call_instance(slot.handle, input, input_len, &bytes, &len);
        slot.busy = false;
    }
    output.assign(bytes, bytes + len);
    slot.loaded->free(bytes);
    return 0;
}

int32_t ServiceThread::ask_js(
    int64_t slot, std::string_view target, const uint8_t* request, size_t len, std::vector<uint8_t>& answer)
{
    HostCallWait wait;
    auto message = std::make_unique<ToJs>();
    message->kind = ToJs::Kind::HostCall;
    message->slot = slot;
    message->target = std::string(target);
    message->bytes.assign(request, request + len);
    message->wait = &wait;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (stopping_) {
            set_error(answer, "the environment is shutting down");
            return 1;
        }
        waiting_ = &wait;
    }
    bool posted = post(std::move(message));
    if (posted) {
        std::unique_lock<std::mutex> lock(wait.mutex);
        wait.answered.wait(lock, [&wait] { return wait.done; });
    }
    {
        // stop() may still be signalling `wait`: it must not go out of scope before stop() lets go.
        std::lock_guard<std::mutex> lock(mutex_);
        waiting_ = nullptr;
    }
    if (!posted) {
        set_error(answer, "the environment is shutting down");
        return 1;
    }
    answer = std::move(wait.bytes);
    return wait.status;
}

Napi::Function ServiceThread::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "ServiceThread",
                       {
                           InstanceMethod("load", &ServiceThread::load),
                           InstanceMethod("call", &ServiceThread::call),
                           InstanceMethod("unload", &ServiceThread::unload),
                           InstanceMethod("answer", &ServiceThread::answer),
                           InstanceMethod("destroy", &ServiceThread::destroy),
                           InstanceMethod("loadAsync", &ServiceThread::load_async),
                           InstanceMethod("submit", &ServiceThread::submit),
                           InstanceMethod("deliver", &ServiceThread::deliver),
                       });
}

} // namespace ipc::napi
