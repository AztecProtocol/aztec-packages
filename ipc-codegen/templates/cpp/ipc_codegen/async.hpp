/**
 * @file async.hpp
 * @brief Asynchronous instances: a service whose handlers call out to another
 * service (a host call) and co_await the answer, while the instance keeps
 * taking requests.
 *
 * A handler that calls out starts a coroutine and answers from it:
 *
 *   template <> void handle_relay(Ctx&, wire::Relay&& cmd,
 * Responder<wire::RelayResponse> respond)
 *   {
 *       ipc_codegen::spawn(relay(std::move(cmd), std::move(respond)));
 *   }
 *   ipc_codegen::Async<void> relay(wire::Relay cmd,
 * Responder<wire::RelayResponse> respond)
 *   {
 *       PeerAsyncApi<ipc_codegen::AsyncHostCall>
 * peer(ipc_codegen::AsyncHostCall("peer")); respond.ok(co_await
 * peer.relay(...));
 *   }
 *
 * On an AsyncInstance, a co_awaited host call hands the host a call (call id,
 * target, request) and suspends the coroutine. The instance returns to its
 * host, which may submit further requests (one the call itself leads to,
 * nested on the same instance, included). The host's answer comes back
 * through AsyncInstance::deliver, which resumes the coroutine where it left
 * off. Everything runs on the thread driving the instance, inside submit() and
 * deliver(), so a handler needs no locking and no threads.
 *
 * Anywhere else (a blocking FFI call, a server answering one request at a
 * time), there is no instance to suspend to: spawn() runs the coroutine at
 * once, and each host call is made with HostCallBackend, blocking until its
 * answer.
 *
 * Guarded by a fixed macro rather than #pragma once, like
 * host_call_backend.hpp: every service's generated directory carries its own
 * copy.
 */
#ifndef IPC_CODEGEN_ASYNC_HPP
#define IPC_CODEGEN_ASYNC_HPP

#include "host_call_backend.hpp"
#include "throw.hpp"

#include <coroutine>
#include <cstdint>
#include <exception>
#include <functional>
#include <memory>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <variant>
#include <vector>

namespace ipc_codegen {

/**
 * A lazy coroutine producing a T: it starts when co_awaited (or spawn()ed) and
 * resumes its awaiter when it finishes. An exception it throws is rethrown to
 * its awaiter.
 */
template <typename T> class [[nodiscard]] Async {
public:
  struct promise_type;
  using Handle = std::coroutine_handle<promise_type>;

  struct FinalAwaiter {
    bool await_ready() noexcept { return false; }
    std::coroutine_handle<> await_suspend(Handle h) noexcept {
      auto continuation = h.promise().continuation;
      return continuation ? continuation : std::noop_coroutine();
    }
    void await_resume() noexcept {}
  };

  struct PromiseBase {
    std::coroutine_handle<> continuation;
    std::exception_ptr error;

    std::suspend_always initial_suspend() noexcept { return {}; }
    FinalAwaiter final_suspend() noexcept { return {}; }
    void unhandled_exception() noexcept { error = std::current_exception(); }
  };

  struct promise_type : PromiseBase {
    std::optional<T> value;
    Async get_return_object() { return Async(Handle::from_promise(*this)); }
    template <typename U> void return_value(U &&v) {
      value.emplace(std::forward<U>(v));
    }
  };

  Async(Async &&other) noexcept : handle_(std::exchange(other.handle_, {})) {}
  Async(const Async &) = delete;
  Async &operator=(const Async &) = delete;
  Async &operator=(Async &&) = delete;
  ~Async() {
    if (handle_) {
      handle_.destroy();
    }
  }

  bool await_ready() const noexcept { return false; }
  std::coroutine_handle<>
  await_suspend(std::coroutine_handle<> awaiter) noexcept {
    handle_.promise().continuation = awaiter;
    return handle_;
  }
  T await_resume() {
    auto &promise = handle_.promise();
    if (promise.error) {
      std::rethrow_exception(promise.error);
    }
    return std::move(*promise.value);
  }

  /** @internal Hands the coroutine to spawn(). */
  Handle release() { return std::exchange(handle_, {}); }

private:
  explicit Async(Handle handle) : handle_(handle) {}
  Handle handle_;
};

template <> struct Async<void>::promise_type : Async<void>::PromiseBase {
  Async get_return_object() { return Async(Handle::from_promise(*this)); }
  void return_void() noexcept {}
};

template <> inline void Async<void>::await_resume() {
  if (handle_.promise().error) {
    std::rethrow_exception(handle_.promise().error);
  }
}

/**
 * What an asynchronous instance hands its host. A handler may answer from
 * another thread, so both may be called on any thread; a host must queue them
 * rather than call back into the instance from inside either.
 */
class AsyncHost {
public:
  virtual ~AsyncHost() = default;
  /** The response to the request submitted as `request_id`. */
  virtual void respond(uint64_t request_id,
                       std::span<const uint8_t> response) = 0;
  /** A call to the service the host binds to `target`; its answer comes back
   * through AsyncInstance::deliver. */
  virtual void call(uint64_t call_id, std::string_view target,
                    std::span<const uint8_t> request) = 0;
};

namespace detail {

/** A call out awaiting its answer. */
struct CallSlot {
  std::coroutine_handle<> waiting;
  int32_t status = 0;
  std::vector<uint8_t> bytes;
};

/** One instance's coroutines in flight: the calls they wait on, by call id. */
struct Driver {
  AsyncHost *host = nullptr;
  uint64_t next_call = 0;
  std::unordered_map<uint64_t, CallSlot *> calls;
  /** Coroutines spawn()ed and not yet finished, destroyed with the instance. */
  std::unordered_map<void *, std::coroutine_handle<>> running;
};

/** The instance this thread is driving, inside its submit() or deliver(). */
inline Driver *&current_driver() {
  thread_local Driver *driver = nullptr;
  return driver;
}

class Enter {
public:
  explicit Enter(Driver *driver)
      : previous_(std::exchange(current_driver(), driver)) {}
  Enter(const Enter &) = delete;
  Enter &operator=(const Enter &) = delete;
  ~Enter() { current_driver() = previous_; }

private:
  Driver *previous_;
};

/** The detached top of a spawn()ed coroutine, which unregisters itself from its
 * driver when done. */
struct Detached {
  struct promise_type {
    Driver *driver = nullptr;
    Detached get_return_object() {
      return {std::coroutine_handle<promise_type>::from_promise(*this)};
    }
    std::suspend_always initial_suspend() noexcept { return {}; }
    auto final_suspend() noexcept {
      if (driver != nullptr) {
        driver->running.erase(
            std::coroutine_handle<promise_type>::from_promise(*this).address());
      }
      return std::suspend_never{};
    }
    void return_void() noexcept {}
    void unhandled_exception() noexcept {}
  };
  std::coroutine_handle<promise_type> handle;
};

inline Detached run_detached(Async<void> task) { co_await std::move(task); }

} // namespace detail

/**
 * Starts `task`, which nothing awaits: on the instance this thread is driving,
 * it runs until its first host call and carries on as answers are delivered;
 * anywhere else it runs to completion before spawn() returns. An exception
 * that escapes it is dropped, so a handler answers its own errors.
 */
inline void spawn(Async<void> task) {
  auto detached = detail::run_detached(std::move(task));
  auto *driver = detail::current_driver();
  detached.handle.promise().driver = driver;
  if (driver != nullptr) {
    driver->running.emplace(detached.handle.address(), detached.handle);
  }
  detached.handle.resume();
}

/**
 * An asynchronous backend reaching whatever the host binds to `target`: its
 * call() is co_awaited, suspending the coroutine on an AsyncInstance and
 * blocking through HostCallBackend anywhere else. Thrown errors are those of
 * HostCallBackend: "host_call <target>: <the host's message>".
 */
class AsyncHostCall {
public:
  explicit AsyncHostCall(std::string target) : target_(std::move(target)) {}

  class Awaiter {
  public:
    Awaiter(std::string target, std::vector<uint8_t> request)
        : target_(std::move(target)), request_(std::move(request)) {}

    bool await_ready() {
      driver_ = detail::current_driver();
      if (driver_ != nullptr) {
        return false;
      }
      try {
        slot_.bytes = HostCallBackend(target_).call(request_);
      } catch (...) {
        error_ = std::current_exception();
      }
      return true;
    }

    void await_suspend(std::coroutine_handle<> waiting) {
      slot_.waiting = waiting;
      uint64_t call_id = driver_->next_call++;
      driver_->calls.emplace(call_id, &slot_);
      driver_->host->call(call_id, target_, request_);
    }

    std::vector<uint8_t> await_resume() {
      if (error_) {
        std::rethrow_exception(error_);
      }
      if (slot_.status != 0) {
        THROW std::runtime_error(
            "host_call " + target_ + ": " +
            std::string(slot_.bytes.begin(), slot_.bytes.end()));
      }
      return std::move(slot_.bytes);
    }

  private:
    std::string target_;
    std::vector<uint8_t> request_;
    detail::Driver *driver_ = nullptr;
    detail::CallSlot slot_;
    std::exception_ptr error_;
  };

  Awaiter call(std::span<const uint8_t> request) const {
    return Awaiter(target_,
                   std::vector<uint8_t>(request.begin(), request.end()));
  }

private:
  std::string target_;
};

/**
 * An instance of a service driven without blocking: requests go in through
 * submit(), answers to its host calls through deliver(), and its responses and
 * calls out go to its AsyncHost. One thread at a time drives it, and the host
 * never calls into it from inside its callbacks. `Service` is the generated
 * <ns>::Service.
 */
template <typename Service> class AsyncInstance {
public:
  AsyncInstance(std::unique_ptr<Service> service, AsyncHost &host)
      : service_(std::move(service)) {
    driver_.host = &host;
  }
  AsyncInstance(const AsyncInstance &) = delete;
  AsyncInstance &operator=(const AsyncInstance &) = delete;
  ~AsyncInstance() {
    // Coroutines still waiting on calls: their frames end here, unanswered.
    auto running = std::move(driver_.running);
    for (auto &[address, handle] : running) {
      handle.destroy();
    }
  }

  /** Runs a request, answered (now or once its host calls are answered) through
   * the host's respond(). */
  void submit(uint64_t request_id, std::span<const uint8_t> request) {
    detail::Enter enter(&driver_);
    AsyncHost *host = driver_.host;
    service_->dispatcher()(request,
                           [host, request_id](std::vector<uint8_t> response) {
                             host->respond(request_id, response);
                           });
  }

  /**
   * The host's answer to call `call_id`: 0 and the service's response, or
   * non-zero and the host's message saying why the call never reached a
   * service.
   */
  void deliver(uint64_t call_id, int32_t status,
               std::span<const uint8_t> response) {
    detail::Enter enter(&driver_);
    auto slot = driver_.calls.find(call_id);
    if (slot == driver_.calls.end()) {
      return;
    }
    detail::CallSlot *waiting = slot->second;
    driver_.calls.erase(slot);
    waiting->status = status;
    waiting->bytes.assign(response.begin(), response.end());
    waiting->waiting.resume();
  }

private:
  std::unique_ptr<Service> service_;
  detail::Driver driver_;
};

} // namespace ipc_codegen

#endif // IPC_CODEGEN_ASYNC_HPP
