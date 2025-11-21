#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <sys/types.h>
#include <utility>
#include <vector>

namespace bb::ipc {

/**
 * @brief Exception thrown by handler to signal graceful shutdown
 *
 * Carries the response data to be sent before shutting down.
 */
class ShutdownRequested : public std::exception {
    std::vector<uint8_t> response_;

  public:
    explicit ShutdownRequested(std::vector<uint8_t> response)
        : response_(std::move(response))
    {}
    const std::vector<uint8_t>& response() const { return response_; }
    const char* what() const noexcept override { return "Server shutdown requested"; }
};

/**
 * @brief Abstract interface for IPC server
 *
 * Provides a unified interface for accepting client connections and exchanging messages.
 * Implementations handle transport-specific details (Unix domain sockets, shared memory, etc).
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
     * @param timeout_ns Maximum time to wait in nanoseconds (0 = non-blocking poll)
     * @return Client ID that has data available, or -1 on timeout/error
     */
    virtual int wait_for_data(uint64_t timeout_ns) = 0;

    /**
     * @brief Receive next message from a specific client
     *
     * Blocks until a complete message is available. Returns a span pointing to the message data.
     * For shared memory, this is a zero-copy view directly into the ring buffer.
     * For sockets, this is a view into an internal buffer.
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
     * Sets shutdown flag and wakes all blocked threads. Safe to call from signal handlers.
     * After this returns, the run() loop will exit on its next iteration.
     * Call close() afterward to clean up resources.
     */
    virtual void request_shutdown()
    {
        shutdown_requested_.store(true, std::memory_order_release);
        wakeup_all();
    }

    /**
     * @brief High-level request handler function type
     *
     * Takes client_id and request data, returns response data.
     * Return empty vector to skip sending a response.
     */
    using Handler = std::function<std::vector<uint8_t>(int client_id, std::span<const uint8_t> request)>;

    /**
     * @brief Accept a new client connection (optional for some transports)
     * @param timeout_ns Timeout in nanoseconds (0 = non-blocking, <0 = infinite)
     * @return Client ID if successful, -1 if no pending connection or error
     *
     * Note: Some transports (like shared memory) may not need explicit accept calls.
     */
    virtual int accept() { return -1; }

    /**
     * @brief Run server event loop with handler
     *
     * Continuously waits for client requests and invokes handler.
     * Handler is responsible for deserializing request, processing, and serializing response.
     * This is a convenience method that encapsulates the typical server loop.
     *
     * Uses peek/release pattern:
     * - peek() returns a span (zero-copy for SHM, internal buffer for sockets)
     * - handler processes the request
     * - release() explicitly consumes the message
     *
     * This design ensures no messages are lost and enables zero-copy for shared memory.
     *
     * Server exits gracefully when handler throws ShutdownRequested exception.
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

            // Receive message (blocks until complete message available, zero-copy for SHM)
            auto request = receive(client_id);
            if (request.empty()) {
                continue;
            }

            try {
                auto response = handler(client_id, request);
                if (!response.empty()) {
                    send(client_id, response.data(), response.size());
                }

                // Explicitly release/consume the message
                release(client_id, request.size());
            } catch (const ShutdownRequested& shutdown) {
                // Release message before shutting down
                release(client_id, request.size());

                // Send final response before shutting down
                if (!shutdown.response().empty()) {
                    send(client_id, shutdown.response().data(), shutdown.response().size());
                }
                // Graceful shutdown - exit loop and let destructors run
                return;
            }
        }
    }

    // Factory methods
    static std::unique_ptr<IpcServer> create_socket(const std::string& socket_path, int max_clients);
    static std::unique_ptr<IpcServer> create_shm(const std::string& base_name,
                                                 size_t max_clients,
                                                 size_t request_ring_size = static_cast<size_t>(1024 * 1024),
                                                 size_t response_ring_size = static_cast<size_t>(1024 * 1024));

  protected:
    std::atomic<bool> shutdown_requested_{ false };

    /**
     * @brief Wake all blocked threads (for graceful shutdown)
     *
     * Wakes any threads blocked in wait_for_data() or other blocking operations.
     * Used by signal handlers to trigger graceful shutdown without waiting for timeouts.
     */
    virtual void wakeup_all() {};
};

} // namespace bb::ipc
