#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <vector>

namespace bb::ipc {

/**
 * @brief Abstract interface for IPC server
 *
 * Provides a unified interface for accepting client connections and exchanging messages.
 * Implementations handle transport-specific details (Unix domain sockets, shared memory, etc).
 */
class IpcServer {
  public:
    virtual ~IpcServer() = default;

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
    virtual int wait_for_data(uint64_t timeout_ns = 0) = 0;

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
     * @brief Run server event loop with handler
     *
     * Continuously waits for client requests and invokes handler.
     * Handler is responsible for deserializing request, processing, and serializing response.
     * This is a convenience method that encapsulates the typical server loop.
     *
     * @param handler Function to process requests and generate responses
     * @param max_message_size Maximum message size to allocate buffer for (default 1MB)
     */
    virtual void run(Handler handler, size_t max_message_size = 1024 * 1024)
    {
        std::vector<uint8_t> buffer(max_message_size);

        while (true) {
            int client_id = wait_for_data(100000000); // 100ms timeout
            if (client_id < 0) {
                continue;
            }

            ssize_t n = recv(client_id, buffer.data(), buffer.size());
            if (n <= 0) {
                continue;
            }

            auto response = handler(client_id, std::span<const uint8_t>(buffer.data(), static_cast<size_t>(n)));
            if (!response.empty()) {
                send(client_id, response.data(), response.size());
            }
        }
    }

    // Factory methods
    static std::unique_ptr<IpcServer> create_socket(const std::string& socket_path, int max_clients);
    static std::unique_ptr<IpcServer> create_shm(const std::string& base_name, size_t max_clients);
};

} // namespace bb::ipc
