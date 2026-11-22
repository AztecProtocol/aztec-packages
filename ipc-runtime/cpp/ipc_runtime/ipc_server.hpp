#pragma once

#include "ipc_runtime/constants.hpp"

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <deque>
#include <exception>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <span>
#include <string>
#include <sys/types.h>
#include <thread>
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
     * doorbell seq then futex_wakes a blocked reactor (mirroring a publish — a bare
     * wake without a seq bump would race).
     */
    virtual void notify() {}

    /**
     * @brief Wake run_reactor's wait when `fd` is readable too, for fds the
     * caller reads itself (from run_reactor's on_wake); false where the
     * transport cannot (shared memory, whose wait is a futex, not an fd set).
     * Reactor thread only.
     */
    virtual bool can_watch_fds() const { return false; }
    virtual bool watch_fd(int fd)
    {
        (void)fd;
        return false;
    }
    /** @brief Stops watching `fd` (watch_fd). */
    virtual void unwatch_fd(int fd) { (void)fd; }

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
     * the message payload (the frame's request id is stripped into
     * `request_id`). For shared memory, this is a zero-copy view directly into
     * the ring buffer. For sockets, this is a view into an internal buffer.
     *
     * The message remains valid until release() is called with the message size.
     *
     * @param client_id Client to receive from
     * @param request_id Out: the client-assigned id to echo on the response
     * @return Span of message payload (empty only on error/disconnect)
     */
    virtual std::span<const uint8_t> receive(int client_id, uint64_t& request_id) = 0;

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
     * @brief Send a response frame to a specific client
     * @param client_id Client to send to
     * @param request_id Echoed request id (0 for server-initiated frames)
     * @param data Pointer to message payload
     * @param len Length of payload in bytes
     * @return true if sent successfully, false on error
     */
    virtual bool send(int client_id, uint64_t request_id, const void* data, size_t len) = 0;

    /**
     * @brief The largest response payload send() can deliver: half a shared-memory response ring
     * (less the frame header), or the frame limit on a stream transport.
     */
    virtual size_t max_response_size() const { return MAX_FRAME_SIZE - FRAME_ID_SIZE; }

    /** Makes the response sent in place of one larger than max_response_size(), from its size and the limit. */
    using OversizedResponse = std::function<std::vector<uint8_t>(size_t size, size_t limit)>;

    /**
     * @brief What run() and run_reactor() answer with when a response will not fit: a service passes
     * a function making its error response, so the caller is told why rather than left waiting.
     * Without one, an oversized response is a fatal error for run() and is dropped by run_reactor().
     */
    void set_oversized_response(OversizedResponse oversized) { oversized_ = std::move(oversized); }

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
            uint64_t request_id = 0;
            auto request = receive(client_id, request_id);
            if (request.data() == nullptr) {
                continue;
            }

            // Always send the response frame — a zero-length response is still a
            // response, and skipping it would deadlock the waiting client.
            try {
                auto response = handler(client_id, request);
                send_response(client_id, request_id, response);
            } catch (const std::exception& e) {
                // A handler or send failure here is unrecoverable for this
                // request — e.g. a response larger than the ring can never be
                // delivered — so the client would otherwise hang. Log the reason
                // and shut down cleanly instead of letting the exception reach
                // std::terminate (which dies silently). The client's death
                // detection then surfaces this with the server log path. (A
                // future per-request error frame could make this recoverable
                // without taking the server down.)
                fprintf(stderr, "ipc: fatal error serving client %d: %s\n", client_id, e.what());
                fflush(stderr);
                shutdown_requested_.store(true, std::memory_order_release);
                break;
            }

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
     * it invokes the handler with the request bytes, zero-copy where the transport
     * allows (a span into the SHM ring), and a `respond` callback. The span is
     * valid only until the handler returns: a handler that defers its work copies
     * what it needs (the generated dispatch decodes before it returns). The handler
     * does decode/dispatch, any classification/ordering, and chooses its own
     * thread; it calls `respond` exactly once when the result is ready (inline or
     * later, from any thread).
     *
     * A response given inline — on the reactor thread, before the handler returns —
     * is sent straight away, with no completion queue, lock or wakeup, so a service
     * whose handlers answer inline pays what run() does. Only a deferred response
     * goes through the queue and notify().
     *
     * Responses are sent in COMPLETION order, each carrying its request's echoed
     * id — clients correlate by id, so a slow request never delays a fast one's
     * response. Because only the reactor calls send(), each response ring keeps
     * its single-producer/lock-free property and writes are serial for free; the
     * only lock is over the in-process completion queue, never over a ring.
     *
     * All scheduling policy — concurrency, ordering, inline or deferred — lives in
     * the handler, not here. A handler that responds inline on the reactor thread
     * makes this a serial loop.
     *
     * `on_wake`, when set, runs on the reactor thread after every wake (a
     * request, a completion, a readable watch_fd() fd, or the timeout), for a
     * caller that drives other I/O from the same loop.
     */
    void run_reactor(const AsyncHandler& handler, const std::function<void()>& on_wake = {})
    {
        struct Completion {
            int client_id;
            uint64_t request_id;
            std::vector<uint8_t> response;
        };

        std::mutex mtx; // guards `completed` only (never a ring)
        std::deque<Completion> completed;
        // completed.size(), readable without the lock: the loop takes it only when there is something to send.
        std::atomic<size_t> completed_count{ 0 };
        std::atomic<int> deferred{ 0 }; // requests answered after their handler returned, not yet answered

        // The request whose handler is running on the reactor thread, and its response if the handler
        // gives it inline. Touched only on the reactor thread.
        struct Inline {
            uint64_t request_id = 0;
            int client_id = -1;
            bool running = false;
            std::optional<std::vector<uint8_t>> response;
        } current;
        const auto reactor_thread = std::this_thread::get_id();

        // Called inside the SHM wait's seq-latched window, so a
        // completion posted just before the futex_wait is not slept through.
        auto have_ready = [&]() -> bool { return completed_count.load(std::memory_order_acquire) > 0; };

        // Reactor-only: send every completed response. Collect under the lock,
        // then send() outside it — send() can block on ring backpressure and
        // must never hold the completion mutex. A send to a since-disconnected
        // client fails harmlessly (client ids are never reused).
        auto drain_and_send = [&]() {
            if (completed_count.load(std::memory_order_acquire) == 0) {
                return;
            }
            std::deque<Completion> ready;
            {
                std::lock_guard<std::mutex> lock(mtx);
                ready.swap(completed);
                completed_count.store(0, std::memory_order_relaxed);
            }
            for (auto& c : ready) {
                try {
                    send_response(c.client_id, c.request_id, c.response);
                } catch (const std::exception& e) {
                    // One undeliverable response must not take down the loop serving every other.
                    fprintf(stderr, "ipc: dropped the response to client %d: %s\n", c.client_id, e.what());
                    fflush(stderr);
                }
            }
        };

        while (!shutdown_requested_.load(std::memory_order_acquire)) {
            accept();

            int client_id = wait_for_data_or_ready(100000000, have_ready); // 100ms shutdown backstop
            if (on_wake) {
                on_wake();
            }
            drain_and_send();
            if (client_id < 0) {
                continue;
            }

            uint64_t request_id = 0;
            auto request = receive(client_id, request_id);
            if (request.data() == nullptr) {
                continue;
            }

            // respond(): invoked exactly once. On the reactor thread while this request's handler is
            // still running, it hands the response back for the loop to send below. Otherwise (from
            // another thread, or after the handler returned) it queues the completion then notifies
            // the reactor — push before notify so the reactor's have_ready predicate observes it and a
            // SHM wake is never lost. Captures reactor locals by reference, valid because run_reactor
            // does not return until every deferred response has been given (quiesce below).
            Respond respond = [&, client_id, request_id](std::vector<uint8_t> response) {
                if (current.running && current.request_id == request_id && current.client_id == client_id &&
                    std::this_thread::get_id() == reactor_thread) {
                    current.response = std::move(response);
                    return;
                }
                {
                    std::lock_guard<std::mutex> lock(mtx);
                    completed.push_back({ client_id, request_id, std::move(response) });
                    completed_count.store(completed.size(), std::memory_order_release);
                }
                deferred.fetch_sub(1, std::memory_order_release);
                notify();
            };

            current = Inline{ request_id, client_id, true, std::nullopt };
            // Counted before the handler runs: a handler that defers may be answered from another
            // thread before it even returns.
            deferred.fetch_add(1, std::memory_order_relaxed);
            handler(client_id, request, std::move(respond));
            current.running = false;
            // The span is the handler's only until it returns; the slot goes back to the client now.
            release(client_id, request.size());
            if (current.response) {
                deferred.fetch_sub(1, std::memory_order_relaxed);
                try {
                    send_response(client_id, request_id, *current.response);
                } catch (const std::exception& e) {
                    fprintf(stderr, "ipc: dropped the response to client %d: %s\n", client_id, e.what());
                    fflush(stderr);
                }
                current.response.reset();
            }
            drain_and_send(); // anything another thread answered meanwhile
        }

        // Quiesce before returning: in-flight handlers capture this frame's state
        // (mtx, completed, deferred), so we must not unwind until every respond()
        // has fired.
        while (deferred.load(std::memory_order_acquire) > 0) {
            drain_and_send();
            wait_for_data_or_ready(10000000, have_ready);
            if (on_wake) {
                on_wake();
            }
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
    // Serve an already-open fd pair (e.g. stdin/stdout when spawned with piped
    // stdio): a single implicit client, same framing as the socket transport.
    // This is what make_server("-") selects, with fds 0 and 1.
    static std::unique_ptr<IpcServer> create_pipe(int in_fd, int out_fd);
    // ring per client slot. This is what make_server("*.shm") selects.
    static std::unique_ptr<IpcServer> create_mpsc_shm(const std::string& base_name,
                                                      size_t max_clients,
                                                      size_t request_ring_size = DEFAULT_RING_SIZE,
                                                      size_t response_ring_size = DEFAULT_RING_SIZE);

  protected:
    std::atomic<bool> shutdown_requested_{ false };

    /** send(), with a response too large for the transport replaced as set_oversized_response() says. */
    bool send_response(int client_id, uint64_t request_id, const std::vector<uint8_t>& response)
    {
        if (oversized_ && response.size() > max_response_size()) {
            auto replacement = oversized_(response.size(), max_response_size());
            return send(client_id, request_id, replacement.data(), replacement.size());
        }
        return send(client_id, request_id, response.data(), response.size());
    }

    /**
     * @brief Wake all blocked threads (for graceful shutdown)
     *
     * Wakes any threads blocked in wait_for_data() or other blocking operations.
     * Used by signal handlers to trigger graceful shutdown without waiting for
     * timeouts.
     */
    virtual void wakeup_all() {};

  private:
    OversizedResponse oversized_;
};

} // namespace ipc
