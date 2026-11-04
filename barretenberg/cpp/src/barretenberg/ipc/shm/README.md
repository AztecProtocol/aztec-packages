# Lock-Free Shared Memory Ring Buffers (C++)

This directory holds the ring buffers under the bb-local `bb::ipc` module. It is a fork of
[ipc-runtime's ring buffers](../../../../../../ipc-runtime/cpp/ipc_runtime/shm/README.md), and the two have
diverged. In particular, `bb::ipc` gates each futex wake on a `producer_blocked` / `consumer_blocked` flag,
which the ipc-runtime README warns against (see "Futex-based blocking" below). Read this file for `bb::ipc`
code only.

The buffers are lock-free, zero-copy SPSC and MPSC rings over POSIX shared memory (`shm_open` + `mmap` with
`MAP_SHARED`). Blocking uses futex on Linux and `os_sync_wait_on_address` on macOS (`futex.hpp`). SPSC is the
building block; MPSC composes per-producer SPSC rings with a doorbell. Control fields are cache-line aligned
to avoid false sharing.

## Architecture

### SPSC (Single-Producer Single-Consumer)

`SpscCtrl` (`spsc_shm.hpp`) is four cache lines, followed by the data buffer:

| Cache line | Fields | Owner |
|------------|--------|-------|
| 1 | `head` (bytes written), `wrap_head`, `producer_blocked` | producer |
| 2 | `tail` (bytes consumed), `consumer_blocked` | consumer |
| 3 | `capacity` (power of two) | immutable |
| 4 | `mask` (`capacity - 1`) | immutable |

Total size: `sizeof(SpscCtrl) + capacity`. Messages are variable-length; the ring pads when a message would
wrap (see below).

### MPSC (Multi-Producer Single-Consumer)

```
┌─────────────────────────────────────────────────┐
│         MPSC System (N producers)                │
│                                                  │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│   │ Producer │  │ Producer │  │ Producer │     │
│   │    0     │  │    1     │  │    2     │     │
│   └─────┬────┘  └─────┬────┘  └─────┬────┘     │
│         │             │             │           │
│         ▼             ▼             ▼           │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│   │ SPSC    │   │ SPSC    │   │ SPSC    │     │
│   │ Ring 0  │   │ Ring 1  │   │ Ring 2  │     │
│   └────┬────┘   └────┬────┘   └────┬────┘     │
│        │             │             │           │
│        └─────────────┼─────────────┘           │
│                      │                         │
│                ┌─────▼──────┐                  │
│                │  Doorbell  │◄─────────────────┤
│                │   Futex    │  (wake on data)  │
│                └─────┬──────┘                  │
│                      │                         │
│                ┌─────▼──────┐                  │
│                │  Consumer  │                  │
│                │ (polls all │                  │
│                │   rings)   │                  │
│                └────────────┘                  │
└─────────────────────────────────────────────────┘
```

**Key characteristics:**
- Each producer gets dedicated SPSC ring (no contention between producers)
- Consumer polls all rings in round-robin fashion
- Producers bump the doorbell on every publish and wake the consumer only if it is blocked
- Per-producer backpressure (full ring blocks only that producer)

## API Overview

All timeouts are `uint32_t` nanoseconds, so the longest single wait is about 4.29 s. A timeout of 0 is an
immediate, non-blocking check.

### SpscShm Class

```cpp
namespace bb::ipc {

class SpscShm {
public:
    // Factory methods
    static SpscShm create(const std::string& name, size_t min_capacity);  // rounds up to a power of two
    static SpscShm connect(const std::string& name);
    static bool unlink(const std::string& name);

    // Move-only (RAII)
    SpscShm(SpscShm&& other) noexcept;
    SpscShm& operator=(SpscShm&& other) noexcept;
    ~SpscShm();

    // Introspection
    uint64_t available() const;   // bytes ready to read
    uint64_t capacity() const;

    // Producer API: claim/publish must be paired
    void* claim(size_t want, uint32_t timeout_ns);   // nullptr on timeout
    void publish(size_t n);

    // Consumer API: peek/release must be paired
    void* peek(size_t want, uint32_t timeout_ns);    // nullptr on timeout
    void release(size_t n);

    // Blocking wait (adaptive spin, then futex). The header names the
    // second parameter spin_ns; it is the total timeout.
    bool wait_for_data(size_t need, uint32_t timeout_ns);
    bool wait_for_space(size_t need, uint32_t timeout_ns);

    // Wake all blocked waiters (graceful shutdown)
    void wakeup_all();
};

} // namespace bb::ipc
```

The wrap decision is stateless and derived only from the requested size. So every `claim(n)`/`publish(n)` by
the producer must be matched by a `peek(n)`/`release(n)` of the same `n` by the consumer (see the header
comment in `spsc_shm.hpp`).

### MpscConsumer / MpscProducer Classes

```cpp
namespace bb::ipc {

class MpscConsumer {
public:
    static MpscConsumer create(const std::string& name, size_t num_producers, size_t ring_capacity);
    static bool unlink(const std::string& name, size_t num_producers);   // doorbell + all rings

    int wait_for_data(uint32_t timeout_ns);                     // ring index with data, or -1
    void* peek(size_t ring_idx, size_t want, uint32_t timeout_ns);
    void release(size_t ring_idx, size_t n);
    void wakeup_all();
};

class MpscProducer {
public:
    static MpscProducer connect(const std::string& name, size_t producer_id);   // caller picks the id

    void* claim(size_t want, uint32_t timeout_ns);
    void publish(size_t n);   // rings the doorbell
};

} // namespace bb::ipc
```

Both classes are move-only.

## Usage

Use the framing helpers in `../shm_common.hpp`. `ring_send_msg` writes a 4-byte length prefix and the payload
in one claim; `ring_receive_msg` returns a span over the payload. The largest message is `capacity/2 - 4`
bytes; `ring_send_msg` throws on a larger one.

```cpp
#include "barretenberg/ipc/shm_common.hpp"

// Producer process
auto tx = bb::ipc::SpscShm::create("demo_ring", 1 << 20);
std::string msg = "hello";
bool sent = bb::ipc::ring_send_msg(tx, msg.data(), msg.size(), /*timeout_ns=*/1'000'000'000);

// Consumer process
auto rx = bb::ipc::SpscShm::connect("demo_ring");
auto payload = bb::ipc::ring_receive_msg(rx, /*timeout_ns=*/1'000'000'000);   // empty on timeout
if (!payload.empty()) {
    handle(payload);
    rx.release(4 + payload.size());   // length prefix + payload
}

// Cleanup, from either process
bb::ipc::SpscShm::unlink("demo_ring");
```

For several clients, use `MpscShmServer` / `MpscShmClient` (`../mpsc_shm_server.hpp`,
`../mpsc_shm_client.hpp`). They combine `MpscConsumer`/`MpscProducer` with a response ring per client and the
same framing.

## Implementation Details

### Padding and Wrapping

When a message would wrap around the ring boundary, automatic padding is inserted:

```
┌────────────────────────────────────────────────┐
│ [msg1] [msg2] [...............] [padding]      │
│                                  ^              │
│                                  └─ wrap point  │
└────────────────────────────────────────────────┘
 ^
 └─ next message starts at beginning
```

The consumer's `peek()` automatically skips padding, so callers never see it.

### Futex-based blocking

1. **Producer**: spins, then sets `producer_blocked` and sleeps on the `tail` futex.
2. **Consumer**: spins, then sets `consumer_blocked` and sleeps on the `head` futex.
3. **Wakeup**: `publish()` calls `futex_wake` on `head` only if `consumer_blocked` is set; `release()` calls
   it on `tail` only if `producer_blocked` is set (`spsc_shm.cpp`).

The MPSC doorbell (`mpsc_shm.hpp`) works the same way: `MpscProducer::publish()` always increments the
doorbell `seq`, and calls `futex_wake` only if the doorbell's `consumer_blocked` flag is set. The consumer
sleeps on `seq` only when all rings are empty.

ipc-runtime does not gate the wake: its README treats the flag/counter pair as a cross-process Dekker
handshake that can drop a wake, and it wakes unconditionally. Keep that in mind when debugging a stalled `bb::ipc`
waiter.

Spin is fixed at 100 µs (`SPIN_NS`) and is skipped after a call that found no data. It is not configurable.

### Ring Size

- Capacity is rounded up to a power of two
- Larger rings reduce wrapping overhead but use more memory
- Recommended: 1 MB (1 << 20) for most use cases
- Small messages (<1 KB): Can use smaller rings (256 KB)
- Large messages (>100 KB): Use larger rings (4-16 MB)

### Number of Producers (MPSC)

- More producers → more ring poll overhead for consumer
- Recommended: ≤8 producers for best performance
- Beyond that, consider multiple MPSC systems or alternative architecture

## Thread Safety

- **SPSC**: one producer thread and one consumer thread. Neither role can be shared across threads.
- **MPSC**: each `MpscProducer` must be used by one thread; many producers can run in parallel. The consumer
  must be one thread.

## Limitations

1. **Platform**: Linux and macOS only.
2. **Fixed size**: rings cannot be resized after creation.
3. **No security**: any process that can open the objects can read and write them.
4. **Cleanup**: at this layer you must call `unlink()` to remove `/dev/shm` objects. The SHM servers in `..`
   do it on `close()` and destruction.

## See Also

- Parent IPC module: [`../README.md`](../README.md)
- Tests: [`../shm.test.cpp`](../shm.test.cpp)
- Benchmarks: `barretenberg/cpp/build/bin/ipc_bench`
- Higher-level wrappers: `ShmClient` / `ShmServer` in [`../shm_client.hpp`](../shm_client.hpp)
