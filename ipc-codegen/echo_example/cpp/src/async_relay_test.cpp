// The asynchronous FFI exports, driven by a host written here: a Relay calls
// out to the host's "peer", the host binds "peer" to the same instance, so each
// hop is another request submitted to the instance while the hops before it
// wait for their answers. Then the same Relay over the blocking FFI, where each
// hop's host call blocks on a fresh instance. The C++ twin of the Rust
// example's tests/async_relay.rs.
//
// Usage: async_relay_test

#include "generated/echo_client.hpp"
#include "generated/echo_ffi.hpp"
#include "generated/echo_ffi_backend.hpp"

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <exception>
#include <iostream>
#include <map>
#include <mutex>
#include <span>
#include <string>
#include <utility>
#include <variant>
#include <vector>

using RespondFn = void (*)(void *, uint64_t, const uint8_t *, size_t);
using CallFn = void (*)(void *, uint64_t, const uint8_t *, size_t,
                        const uint8_t *, size_t);
extern "C" {
void *echo_ipc_ffi_create_async(void *host_ctx, RespondFn respond, CallFn call);
void echo_ipc_ffi_submit(void *instance, uint64_t request_id,
                         const uint8_t *input, size_t input_len);
void echo_ipc_ffi_deliver(void *instance, uint64_t call_id, int32_t status,
                          const uint8_t *response, size_t response_len);
void echo_ipc_ffi_destroy_async(void *instance);
}

namespace {

int g_fail = 0;

void check(bool ok, const std::string &label) {
  std::cerr << (ok ? "  PASS: " : "  FAIL: ") << label << "\n";
  if (!ok)
    g_fail++;
}

struct Respond {
  uint64_t id;
  std::vector<uint8_t> bytes;
};
struct Call {
  uint64_t id;
  std::string target;
  std::vector<uint8_t> bytes;
};
using Event = std::variant<Respond, Call>;

/** The host's queue: the callbacks only record, so nothing calls into the
 * instance from inside them. */
struct Queue {
  std::mutex mutex;
  std::deque<Event> events;
  void push(Event event) {
    std::lock_guard<std::mutex> lock(mutex);
    events.push_back(std::move(event));
  }
  bool pop(Event &event) {
    std::lock_guard<std::mutex> lock(mutex);
    if (events.empty())
      return false;
    event = std::move(events.front());
    events.pop_front();
    return true;
  }
};

void on_respond(void *ctx, uint64_t id, const uint8_t *bytes, size_t len) {
  static_cast<Queue *>(ctx)->push(Respond{id, {bytes, bytes + len}});
}

void on_call(void *ctx, uint64_t id, const uint8_t *target, size_t target_len,
             const uint8_t *bytes, size_t len) {
  static_cast<Queue *>(ctx)->push(
      Call{id,
           std::string(reinterpret_cast<const char *>(target), target_len),
           {bytes, bytes + len}});
}

struct Outcome {
  std::vector<uint8_t> data;
  std::string error;
  size_t most_waiting = 0;
};

/** Runs one Relay on an asynchronous instance, routing `peer` back into it and
 * failing calls to any other target. */
Outcome run_relay(uint32_t hops, const std::string &peer) {
  Queue queue;
  void *instance = echo_ipc_ffi_create_async(&queue, on_respond, on_call);
  auto submit = [&](uint64_t id, const std::vector<uint8_t> &bytes) {
    echo_ipc_ffi_submit(instance, id, bytes.data(), bytes.size());
  };
  // The peer requests this host submitted, by request id: the call each one
  // answers.
  std::map<uint64_t, uint64_t> answers_call;
  uint64_t next_id = 1;
  Outcome outcome;
  submit(0, echo::EchoCodec::encode(
                echo::EchoRelay{.data = {9}, .hops = hops}));
  for (;;) {
    Event event;
    if (!queue.pop(event)) {
      outcome.error = "the instance went quiet";
      break;
    }
    if (auto *respond = std::get_if<Respond>(&event)) {
      if (respond->id == 0) {
        try {
          outcome.data = echo::EchoCodec::decode<echo::EchoRelayResponse>(
                             respond->bytes)
                             .data;
        } catch (const std::exception &e) {
          outcome.error = e.what();
        }
        break;
      }
      uint64_t call_id = answers_call.at(respond->id);
      answers_call.erase(respond->id);
      echo_ipc_ffi_deliver(instance, call_id, 0, respond->bytes.data(),
                           respond->bytes.size());
      continue;
    }
    auto &call = std::get<Call>(event);
    if (call.target == peer) {
      answers_call.emplace(next_id, call.id);
      outcome.most_waiting =
          std::max(outcome.most_waiting, answers_call.size());
      submit(next_id++, call.bytes);
    } else {
      std::string message = "no target " + call.target;
      echo_ipc_ffi_deliver(instance, call.id, 1,
                           reinterpret_cast<const uint8_t *>(message.data()),
                           message.size());
    }
  }
  echo_ipc_ffi_destroy_async(instance);
  return outcome;
}

/** Answers "peer" with a fresh blocking instance of the service. */
int32_t blocking_host_call(const uint8_t * /*target*/, size_t /*target_len*/,
                           const uint8_t *request, size_t request_len,
                           uint8_t **response, size_t *response_len) {
  void *instance = echo_ipc_ffi_create();
  echo_ipc_ffi_call(instance, request, request_len, response, response_len);
  echo_ipc_ffi_destroy(instance);
  return 0;
}

} // namespace

int main() {
  {
    auto outcome = run_relay(5, "peer");
    check(outcome.error.empty() &&
              outcome.data == std::vector<uint8_t>{9, 5, 4, 3, 2, 1},
          "a relay nests 5 hops on one asynchronous instance");
    check(outcome.most_waiting == 5,
          "every hop waits on the next, on the one instance");
  }
  {
    auto outcome = run_relay(0, "peer");
    check(outcome.data == std::vector<uint8_t>{9} && outcome.most_waiting == 0,
          "a relay of no hops answers at once");
  }
  {
    auto outcome = run_relay(2, "nobody");
    check(outcome.error.find("host_call peer: no target peer") !=
              std::string::npos,
          "a call the host cannot route fails the relay with the host's "
          "message (" +
              outcome.error + ")");
  }
  {
    echo_ipc_ffi_set_host_call(blocking_host_call);
    echo::EchoApi<echo::FfiBackend> api;
    check(api.relay({.data = {9}, .hops = 3}).data ==
              std::vector<uint8_t>{9, 3, 2, 1},
          "over the blocking FFI, each hop blocks on its host call");
    echo_ipc_ffi_set_host_call(nullptr);
  }

  if (g_fail > 0) {
    std::cerr << "async_relay_test: " << g_fail << " failure(s)\n";
    return 1;
  }
  std::cerr << "async_relay_test: all passed\n";
  return 0;
}
