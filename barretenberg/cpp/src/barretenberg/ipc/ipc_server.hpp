#pragma once

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
     * @param timeout_ns Timeout in nanoseconds (0 = infinite)
     * @return Client ID that has data available, or -1 on timeout/error
     */
    virtual int wait_for_data(uint64_t timeout_ns) = 0;

    /**
     * @brief Receive a message from a specific client
     * @param client_id Client to receive from
     * @param buffer Buffer to store received message
     * @param max_len Maximum length to receive
     * @return Number of bytes received, or -1 on error
     */
    virtual ssize_t recv(int client_id, void* buffer, size_t max_len) = 0;

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
    virtual int accept(uint64_t timeout_ns)
    {
        (void)timeout_ns;
        return -1;
    }

    /**
     * @brief Run server event loop with handler
     *
     * Continuously waits for client requests and invokes handler.
     * Handler is responsible for deserializing request, processing, and serializing response.
     * This is a convenience method that encapsulates the typical server loop.
     *
     * Server exits gracefully when handler throws ShutdownRequested exception.
     *
     * @param handler Function to process requests and generate responses
     * @param max_message_size Maximum message size to allocate buffer for
     */
    virtual void run(const Handler& handler, size_t max_message_size)
    {
        std::vector<uint8_t> buffer(max_message_size);

        while (true) {
            // Try to accept new clients (non-blocking for socket servers)
            accept(0);

            int client_id = wait_for_data(100000000); // 100ms timeout
            if (client_id < 0) {
                continue;
            }

            ssize_t n = recv(client_id, buffer.data(), buffer.size());
            if (n <= 0) {
                continue;
            }

            try {
                auto response = handler(client_id, std::span<const uint8_t>(buffer.data(), static_cast<size_t>(n)));
                if (!response.empty()) {
                    send(client_id, response.data(), response.size());
                }
            } catch (const ShutdownRequested& shutdown) {
                // Send final response before shutting down
                if (!shutdown.response().empty()) {
                    send(client_id, shutdown.response().data(), shutdown.response().size());
                }
                // Graceful shutdown - exit loop and let destructors run
                return;
            }
        }
    }

    /**
     * @brief Run server event loop with handler (default 1MB buffer)
     * @param handler Function to process requests and generate responses
     */
    void run(const Handler& handler) { run(handler, static_cast<size_t>(1024) * 1024); }

    // Factory methods
    static std::unique_ptr<IpcServer> create_socket(const std::string& socket_path, int max_clients);
    static std::unique_ptr<IpcServer> create_shm(const std::string& base_name, size_t max_clients);
};

} // namespace bb::ipc
