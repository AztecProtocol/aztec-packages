#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
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
     * @brief Receive a message from the server (zero-copy for shared memory)
     * @param timeout_ns Timeout in nanoseconds
     * @return Span of message data (empty on error/timeout)
     *
     * The span remains valid until release() is called or the next recv().
     * For shared memory: direct view into ring buffer (true zero-copy)
     * For sockets: view into internal buffer (eliminates one copy)
     *
     * Must be followed by release() to consume the message.
     */
    virtual std::span<const uint8_t> recv(uint64_t timeout_ns) = 0;

    /**
     * @brief Release the previously received message
     * @param message_size Size of the message being released (from span.size())
     *
     * Must be called after recv() to consume the message and free resources.
     * For shared memory: releases space in the ring buffer
     * For sockets: no-op (message already consumed during recv)
     */
    virtual void release(size_t message_size) = 0;

    /**
     * @brief Close the connection
     */
    virtual void close() = 0;

    // Factory methods
    static std::unique_ptr<IpcClient> create_socket(const std::string& socket_path);
    static std::unique_ptr<IpcClient> create_shm(const std::string& base_name, size_t max_clients);
};

} // namespace bb::ipc
