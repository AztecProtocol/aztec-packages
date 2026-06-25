#pragma once

#include "ipc_runtime/constants.hpp"

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <span>
#include <string>
#include <sys/types.h>
#include <unordered_map>
#include <utility>
#include <vector>

namespace ipc {

/**
 * @brief Abstract interface for IPC server
 *
 * Provides a unified interface for accepting client connections and exchanging
 * messages. Implementations handle transport-specific details (Unix domain
 * sockets, shared memory, etc).
 */
class IpcServer {
  public:
    IpcServer() = default;
    virtual ~IpcServer() = default;

    // Abstract interface - no copy or move
    IpcServer(const IpcServer&) = delete;
    IpcServer& operator=(const IpcServer&) = delete;
    IpcServer(IpcServer&&) = delete;
    IpcServer& operator=(IpcServer&&) = delete;

    /**
     * @brief Start listening for client connections
     * @return true if successful, false otherwise
     */
    virtual bool listen() = 0;

    /**
     * @brief Wait for data from any connected client
     *
     * @param timeout_ns Maximum time to wait in nanoseconds (0 = non-blocking
     * poll)
     * @return Client ID that has data available, or -1 on timeout/error
     */
    virtual int wait_for_data(uint64_t timeout_ns) = 0;

    /**
     * @brief Like wait_for_data, but also returns when `also_ready` becomes true.
     *
     * Used by run_reactor(): the reactor must wake not only on incoming request
     * data but also when a worker thread has posted a completed response that is
     * ready to send. `also_ready` is the "completion ready" predicate.
     *
     * The default implementation ignores the predicate and delegates to
     * wait_for_data(); that is correct for transports whose wakeup is latched
     * independently of the data path (sockets: the self-pipe sits in the same
     * epoll/kqueue set as the client fds, so notify() makes this return). SHM
     * has only a single futex doorbell, so MpscShmServer overrides this to
     * evaluate the predicate inside the same seq-latched window as its ring scan
     * — otherwise a notify() landing just before the futex_wait would be lost.
     *
     * A negative return means "woke, no client request to process" (timeout, a
     * completion wake, or shutdown). The caller drains completions regardless of
     * the return value, so conflating those cases is intentional.
     */
    virtual int wait_for_data_or_ready(uint64_t timeout_ns, const std::function<bool()>& also_ready)
    {
        (void)also_ready;
        return wait_for_data(timeout_ns);
    }

    /**
     * @brief Wake a thread blocked in wait_for_data_or_ready, without requesting
     * shutdown.
     *
     * Called by a worker thread after it posts a completed response, so the
     * reactor wakes promptly and sends it. Default is a no-op (a serial server
     * never blocks waiting on a cross-thread completion). Transports that back
     * run_reactor override this: sockets write the self-pipe; MPSC-SHM bumps the
     * doorbell seq then futex_wakes (mirroring a publish — a bare wake without a
     * seq bump would race).
     */
    virtual void notify() {}

    /**
     * @brief Non-blocking check for whether another request is already waiting.
     *
     * Used by run_reactor()'s inline fast path to distinguish "idle / sequential"
     * from "a burst is arriving". Must be cheap and side-effect-free — it is
     * polled per request at low load. The default polls via wait_for_data(0)
     * (fine for sockets: epoll is stateless); SHM overrides it with a check that
     * does not disturb its round-robin cursor or adaptive-spin state.
     */
    virtual bool has_pending_request() { return wait_for_data(0) >= 0; }

    /**
     * @brief Receive next message from a specific client
     *
     * Blocks until a complete message is available. Returns a span pointing to
     * the message data. For shared memory, this is a zero-copy view directly into
     * the ring buffer. For sockets, this is a view into an internal buffer.
     *
     * The message remains valid until release() is called with the message size.
     *
     * @param client_id Client to receive from
     * @return Span of message data (empty only on error/disconnect)
     */
    virtual std::span<const uint8_t> receive(int client_id) = 0;

    /**
     * @brief Release/consume the previously received message
     *
     * Must be called after receive() to advance to the next message.
     * For shared memory, this releases space in the ring buffer.
     * For sockets, this is a no-op (message already consumed during receive).
     *
     * @param client_id Client whose message to release
     * @param message_size Size of the message being released (from span.size())
     */
    virtual void release(int client_id, size_t message_size) = 0;

    /**
     * @brief Send a message to a specific client
     * @param client_id Client to send to
     * @param data Pointer to message data
     * @param len Length of message in bytes
     * @return true if sent successfully, false on error
     */
    virtual bool send(int client_id, const void* data, size_t len) = 0;

    /**
     * @brief Close the server and all client connections
     */
    virtual void close() = 0;

    /**
     * @brief Request graceful shutdown.
     *
     * Sets shutdown flag and wakes all blocked threads. After this returns, the
     * run() loop will exit on its next iteration. Call close() afterward to clean
     * up resources.
     */
    virtual void request_shutdown()
    {
        shutdown_requested_.store(true, std::memory_order_release);
        wakeup_all();
    }

    void request_shutdown_from_signal() noexcept { shutdown_requested_.store(true, std::memory_order_release); }

    /**
     * @brief Filesystem artifacts to remove if the process dies abnormally.
     *
     * Used by install_default_signal_handlers() to cache (at install time) the
     * socket paths / shared-memory names a fatal-signal handler should
     * best-effort unlink. Empty by default.
     */
    struct CleanupPaths {
        std::vector<std::string> unlink_paths;     // removed via ::unlink()
        std::vector<std::string> shm_unlink_names; // removed via ::shm_unlink()
    };
    virtual CleanupPaths cleanup_paths() const { return {}; }

    /**
     * @brief High-level request handler function type
     *
     * Takes client_id and request data, returns response data.
     * Every request gets exactly one response; an empty vector is sent as a
     * zero-length response frame.
     */
    using Handler = std::function<std::vector<uint8_t>(int client_id, std::span<const uint8_t> request)>;

    /**
     * @brief Asynchronous request handler used by run_reactor().
     *
     * The transport hands the application a request and a `respond` callback; the
     * application does everything else — decode/dispatch, any classification, any
     * ordering, and choice of thread — then calls `respond(response)` exactly once
     * when the result is ready (possibly later, on another thread). ipc-runtime
     * does not interpret the request; it only correlates the response (per-client
     * FIFO ordering, reorder stash, and wake) inside `respond`.
     *
     * This keeps all policy — concurrency, ordering, inline-vs-pool — on the
     * application side while ipc-runtime stays transport-only. The wsdb's handler
     * classifies the request, serializes writes per-fork, runs the generated
     * dispatch on a thread pool, and calls `respond` with the encoded result.
     *
     * The `request` span is owned by the runtime and stays valid until `respond`
     * is invoked, so a handler that defers work may capture the span and read it
     * on the worker thread. A `respond` of an empty vector is a valid zero-length
     * response.
     */
    using Respond = std::function<void(std::vector<uint8_t>)>;
    using AsyncHandler = std::function<void(int client_id, std::span<const uint8_t> request, Respond respond)>;

    /**
     * @brief Accept pending client connections without blocking (optional for
     * some transports)
     * @return Client ID if successful, -1 if no pending connection or error
     *
     * Note: Some transports (like shared memory) may not need explicit accept
     * calls.
     */
    virtual int accept() { return -1; }

    /**
     * @brief Run server event loop with handler
     *
     * Continuously waits for client requests and invokes handler.
     * Handler is responsible for deserializing request, processing, and
     * serializing response. This is a convenience method that encapsulates the
     * typical server loop.
     *
     * Uses peek/release pattern:
     * - peek() returns a span (zero-copy for SHM, internal buffer for sockets)
     * - handler processes the request
     * - release() explicitly consumes the message
     *
     * This design ensures no messages are lost and enables zero-copy for shared
     * memory.
     *
     * @param handler Function to process requests and generate responses
     */
    virtual void run(const Handler& handler)
    {
        while (!shutdown_requested_.load(std::memory_order_acquire)) {
            // Try to accept new clients (non-blocking for socket servers)
            accept();

            int client_id = wait_for_data(100000000); // 100ms timeout
            if (client_id < 0) {
                // Timeout or error - check shutdown flag on next iteration
                continue;
            }

            // Receive message (blocks until complete message available, zero-copy for
            // SHM). A null data() means error/timeout; a non-null empty span is a
            // valid zero-length request.
            auto request = receive(client_id);
            if (request.data() == nullptr) {
                continue;
            }

            // Always send the response frame — a zero-length response is still a
            // response, and skipping it would deadlock the waiting client.
            auto response = handler(client_id, request);
            send(client_id, response.data(), response.size());

            // Explicitly release/consume the message.
            release(client_id, request.size());
        }
    }

    /**
     * @brief Run the event loop as a non-blocking reactor driving an async
     * handler — the concurrent counterpart to run().
     *
     * The reactor thread owns ALL ring/socket I/O: it reads each request and is
     * the sole caller of send(). It never blocks on the handler. For each request
     * it copies the bytes into a runtime-owned buffer, release()s the ring slot
     * immediately, assigns a per-connection sequence number, and invokes the
     * handler with a `respond` callback. The handler does decode/dispatch, any
     * classification/ordering, and chooses its own thread; it calls `respond`
     * exactly once when the result is ready (inline or later, from any thread).
     *
     * Responses are sent in per-connection request order (a small reorder stash
     * keyed by the sequence number), so the wire stays FIFO with no request-id
     * envelope. Because only the reactor calls send(), each response ring keeps
     * its single-producer/lock-free property and writes are serial for free; the
     * only lock is over the in-process stash, never over a ring.
     *
     * All scheduling policy — concurrency, ordering, and any inline-vs-deferred
     * fast path — lives in the handler, not here. A handler that responds inline
     * on the reactor thread degrades this to a serial loop.
     */
    void run_reactor(const AsyncHandler& handler)
    {
        struct Conn {
            uint64_t next_send_seq = 0;                     // next sequence to release to the wire
            std::map<uint64_t, std::vector<uint8_t>> stash; // completed-but-not-yet-in-order responses
        };

        std::mutex mtx;                             // guards `conns` only (never a ring)
        std::unordered_map<int, Conn> conns;        // per-connection reorder state
        std::unordered_map<int, uint64_t> next_seq; // reactor-only: next sequence to assign
        std::atomic<int> inflight{ 0 };             // requests whose respond() has not fired

        // True iff some connection has its next-expected response ready. Called
        // (under mtx) inside the SHM wait's seq-latched window, so a response
        // posted just before the futex_wait is not slept through.
        auto have_ready = [&]() -> bool {
            std::lock_guard<std::mutex> lock(mtx);
            for (auto& [client, conn] : conns) {
                if (conn.stash.count(conn.next_send_seq) != 0) {
                    return true;
                }
            }
            return false;
        };

        // Reactor-only: emit every response that is now next-in-sequence. Collect
        // under the lock, then send() outside it — send() can block on ring
        // backpressure and must never hold the stash mutex.
        auto drain_and_send = [&]() {
            std::vector<std::pair<int, std::vector<uint8_t>>> ready;
            {
                std::lock_guard<std::mutex> lock(mtx);
                for (auto& [client, conn] : conns) {
                    auto it = conn.stash.find(conn.next_send_seq);
                    while (it != conn.stash.end()) {
                        ready.emplace_back(client, std::move(it->second));
                        conn.stash.erase(it);
                        conn.next_send_seq++;
                        it = conn.stash.find(conn.next_send_seq);
                    }
                }
            }
            for (auto& [client, bytes] : ready) {
                send(client, bytes.data(), bytes.size());
            }
        };

        while (!shutdown_requested_.load(std::memory_order_acquire)) {
            accept();

            int client_id = wait_for_data_or_ready(100000000, have_ready); // 100ms shutdown backstop
            drain_and_send();
            if (client_id < 0) {
                continue;
            }

            auto request = receive(client_id);
            if (request.data() == nullptr) {
                continue;
            }

            // Own the request bytes until respond() fires: the handler may defer
            // work to another thread and read the span there. release() the ring
            // slot now so the client can keep producing.
            auto buf = std::make_shared<std::vector<uint8_t>>(request.begin(), request.end());
            release(client_id, request.size());

            uint64_t seq = next_seq[client_id]++;
            inflight.fetch_add(1, std::memory_order_relaxed);

            // respond(): invoked exactly once, possibly on another thread. Stash
            // the response (push) then notify the reactor to send it — push before
            // notify so the reactor's have_ready predicate observes it and a SHM
            // wake is never lost. Holds `buf` alive until invoked. Captures reactor
            // locals by reference, valid because run_reactor does not return until
            // inflight hits 0 (quiesce) and the final respond drives it there.
            Respond respond = [this, client_id, seq, buf, &mtx, &conns, &inflight](std::vector<uint8_t> response) {
                {
                    std::lock_guard<std::mutex> lock(mtx);
                    conns[client_id].stash.emplace(seq, std::move(response));
                }
                inflight.fetch_sub(1, std::memory_order_release);
                notify();
            };

            handler(client_id, std::span<const uint8_t>(*buf), std::move(respond));
            drain_and_send(); // emit immediately if the handler responded inline
        }

        // Quiesce before returning: in-flight handlers capture this frame's state
        // (mtx, conns, inflight), so we must not unwind until every respond() has
        // fired.
        while (inflight.load(std::memory_order_acquire) > 0) {
            drain_and_send();
            wait_for_data_or_ready(10000000, have_ready);
        }
        drain_and_send();
    }

    // Factory methods.
    static std::unique_ptr<IpcServer> create_socket(const std::string& socket_path, int max_clients);
    // Single-client SHM: one request ring and one response ring. Use this
    // directly when the service only needs one producer/client.
    static std::unique_ptr<IpcServer> create_shm(const std::string& base_name,
                                                 size_t request_ring_size = DEFAULT_RING_SIZE,
                                                 size_t response_ring_size = DEFAULT_RING_SIZE);
    // Multi-producer SHM: one request ring per client slot and one response
    // ring per client slot. This is what make_server("*.shm") selects.
    static std::unique_ptr<IpcServer> create_mpsc_shm(const std::string& base_name,
                                                      size_t max_clients,
                                                      size_t request_ring_size = DEFAULT_RING_SIZE,
                                                      size_t response_ring_size = DEFAULT_RING_SIZE);

  protected:
    std::atomic<bool> shutdown_requested_{ false };

    /**
     * @brief Wake all blocked threads (for graceful shutdown)
     *
     * Wakes any threads blocked in wait_for_data() or other blocking operations.
     * Used by signal handlers to trigger graceful shutdown without waiting for
     * timeouts.
     */
    virtual void wakeup_all() {};
};

} // namespace ipc
