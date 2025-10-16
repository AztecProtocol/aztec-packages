#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <sys/types.h>

namespace bb::ipc {

/**
 * @brief Abstract interface for IPC client
 *
 * Provides a unified interface for connecting to IPC servers and exchanging messages.
 * Implementations handle transport-specific details (Unix domain sockets, shared memory, etc).
 */
class IpcClient {
  public:
    IpcClient() = default;
    virtual ~IpcClient() = default;

    // Abstract interface - no copy or move
    IpcClient(const IpcClient&) = delete;
    IpcClient& operator=(const IpcClient&) = delete;
    IpcClient(IpcClient&&) = delete;
    IpcClient& operator=(IpcClient&&) = delete;

    /**
     * @brief Connect to the server
     * @return true if connection successful, false otherwise
     */
    virtual bool connect() = 0;

    /**
     * @brief Send a message to the server
     * @param data Pointer to message data
     * @param len Length of message in bytes
     * @param timeout_ns Timeout in nanoseconds (0 = infinite)
     * @return true if sent successfully, false on error or timeout
     */
    virtual bool send(const void* data, size_t len, uint64_t timeout_ns) = 0;

    /**
     * @brief Receive a message from the server
     * @param buffer Buffer to store received message
     * @param max_len Maximum length to receive
     * @param timeout_ns Timeout in nanoseconds (0 = infinite)
     * @return Number of bytes received, or -1 on error/timeout
     */
    virtual ssize_t recv(void* buffer, size_t max_len, uint64_t timeout_ns) = 0;

    /**
     * @brief Close the connection
     */
    virtual void close() = 0;

    // Factory methods
    static std::unique_ptr<IpcClient> create_socket(const std::string& socket_path);
    static std::unique_ptr<IpcClient> create_shm(const std::string& base_name, size_t max_clients);
};

} // namespace bb::ipc
