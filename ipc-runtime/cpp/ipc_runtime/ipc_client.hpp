#pragma once

#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <span>
#include <string>
#include <sys/types.h>

namespace ipc {

// Passed as the MPSC-SHM client id to mean "atomically claim a free slot on
// connect" rather than pinning a specific one. This is the default for
// make_client / create_mpsc_shm; an explicit id is only used by tests.
inline constexpr std::size_t kAutoClientId = std::numeric_limits<std::size_t>::max();

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
     * @param timeout_ns Timeout in nanoseconds (0 = infinite)
     * @return Span of message data. data() == nullptr means error/timeout;
     *         a non-null span of size 0 is a valid zero-length message.
     *
     * The span remains valid until release() is called or the next recv().
     * For shared memory: direct view into ring buffer (true zero-copy)
     * For sockets: view into internal buffer (eliminates one copy)
     *
     * Must be followed by release() to consume the message.
     */
    virtual std::span<const uint8_t> receive(uint64_t timeout_ns) = 0;

    /**
     * @brief Wake any thread blocked in receive()/send() (for shutdown).
     *
     * Default no-op; SHM transports wake futex waiters on their rings.
     */
    virtual void wakeup() {}

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

    // Factory methods.
    static std::unique_ptr<IpcClient> create_socket(const std::string& socket_path);
    // Single-client SHM: one request ring and one response ring. Use this
    // directly when the service only needs one producer/client.
    static std::unique_ptr<IpcClient> create_shm(const std::string& base_name);
    // Multi-producer SHM: one request ring per client slot and one response
    // ring per client slot. This is what make_client("*.shm") selects.
    static std::unique_ptr<IpcClient> create_mpsc_shm(const std::string& base_name, size_t client_id = kAutoClientId);
};

/**
 * @brief Construct an IpcClient based on the input path's suffix.
 *
 * Recognised suffixes:
 *  - "*.sock" → IpcClient::create_socket(path)
 *  - "*.shm"  → IpcClient::create_mpsc_shm(<basename>, client_id)
 *
 * Returns nullptr if the suffix is not recognised. `shm_client_id` is only
 * consulted for the SHM path; it defaults to kAutoClientId, so each connecting
 * client atomically claims a distinct free slot (0..max_clients-1) on connect.
 *
 * @param input_path Path passed by the caller (often a CLI flag).
 * @param shm_client_id MPSC-SHM slot to pin, or kAutoClientId to self-allocate. Ignored for UDS.
 */
std::unique_ptr<IpcClient> make_client(const std::string& input_path, std::size_t shm_client_id = kAutoClientId);

} // namespace ipc
