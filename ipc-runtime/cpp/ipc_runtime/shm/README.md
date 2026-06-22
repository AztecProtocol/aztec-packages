# Lock-Free Shared Memory Ring Buffers (C++)

Ultra-low-latency shared-memory ring buffers for inter-process communication using modern C++. Built on POSIX `shm_open` + `mmap` with lock-free atomics and efficient futex-based blocking (Linux futex; `os_sync_wait_on_address` on macOS).

## Features

- **Zero-copy IPC** between processes via MAP_SHARED
- **Lock-free**: No mutexes, no syscalls in hot path
- **Adaptive blocking**: Brief spin, then futex sleep for power efficiency
- **Single-Producer Single-Consumer (SPSC)**: Lock-free ring buffer building block
- **Multi-Producer Single-Consumer (MPSC)**: Compositional layer using SPSC + doorbell
- **Modern C++**: RAII, move semantics, factory methods
- **Cache-optimized**: Careful alignment to avoid false sharing

## Performance

| Operation                          | Latency          | Notes                          |
|------------------------------------|------------------|--------------------------------|
| SPSC roundtrip (hot)               | 0.3–1 µs         | No contention, busy loop       |
| SPSC roundtrip (cold)              | 3–6 µs           | After futex wakeup             |
| MPSC roundtrip (3 producers, hot)  | ~40 µs           | 3-way contention               |
| Pipe/socket (for comparison)       | 6–15 µs          | Requires syscalls              |

*Measured on AMD Ryzen 9 5950X, Ubuntu 24.04, small messages (<1KB)*

## Architecture

### SPSC (Single-Producer Single-Consumer)

```
┌──────────────────────────────────────────────────┐
│              SpscCtrl (control block)             │
│  ┌────────────────────────────────────────────┐  │
│  │ head + wrap_head                           │  │
│  │   (producer-owned, cacheline-aligned)      │  │
│  │ tail                                       │  │
│  │   (consumer-owned, cacheline-aligned)      │  │
│  │ capacity, mask (immutable)                 │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│              Data buffer (power-of-2 size)        │
│  ┌────────────────────────────────────────────┐  │
│  │  [producer writes here]  [consumer reads]  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Key characteristics:**
- **Lock-free**: Producer and consumer never block each other
- **Cache-friendly**: head/tail separated by cache line to avoid false sharing
- **Variable-length messages**: Automatic padding when wrapping around ring
- **Efficient blocking**: Spin briefly, then futex sleep/wake

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
- Shared doorbell futex: producers ring on empty→non-empty transition
- Per-producer backpressure (full ring blocks only that producer)

## API Overview

All timeouts are in nanoseconds. At this layer `timeout_ns == 0` means an
immediate (non-blocking) check; the higher-level `IpcClient`/`IpcServer`
wrappers translate their public "0 = infinite" convention before calling in.

### SpscShm Class

```cpp
namespace ipc {

class SpscShm {
public:
    // Factory methods
    static SpscShm create(const std::string& name, size_t min_capacity);
    static SpscShm connect(const std::string& name);
    static bool unlink(const std::string& name);

    // Move-only (RAII)
    SpscShm(SpscShm&& other) noexcept;
    SpscShm& operator=(SpscShm&& other) noexcept;
    ~SpscShm();

    // Introspection
    uint64_t available() const;   // bytes ready to read
    uint64_t capacity() const;

    // Producer API: claim/publish must be paired, with sizes exactly
    // matching the consumer's peek/release pair.
    void* claim(size_t want, uint64_t timeout_ns);  // nullptr on timeout
    void publish(size_t n);

    // Consumer API
    void* peek(size_t want, uint64_t timeout_ns);   // nullptr on timeout
    void release(size_t n);

    // Blocking wait (adaptive spin, then futex)
    bool wait_for_data(size_t need, uint64_t timeout_ns);
    bool wait_for_space(size_t need, uint64_t timeout_ns);

    // Wake all blocked waiters (graceful shutdown)
    void wakeup_all();
};

} // namespace ipc
```

The wrap decision is stateless and derived purely from the requested size,
so every `claim(n)`/`publish(n)` by the producer must be matched by a
`peek(n)`/`release(n)` of the same `n` by the consumer (see the header
comment in `spsc_shm.hpp`).

### MpscConsumer / MpscProducer Classes

```cpp
namespace ipc {

class MpscConsumer {
public:
    // Factory
    static MpscConsumer create(const std::string& name,
                               size_t num_producers,
                               size_t ring_capacity);
    static bool unlink(const std::string& name, size_t num_producers);

    // Move-only (RAII)
    MpscConsumer(MpscConsumer&& other) noexcept;
    ~MpscConsumer();

    // Consumer API
    int wait_for_data(uint64_t timeout_ns);  // ring index with data, or -1
    void* peek(size_t ring_idx, size_t want, uint64_t timeout_ns);
    void release(size_t ring_idx, size_t n);
    void wakeup_all();
};

class MpscProducer {
public:
    // Factory
    static MpscProducer connect(const std::string& name, size_t producer_id);

    // Move-only (RAII)
    MpscProducer(MpscProducer&& other) noexcept;
    ~MpscProducer();

    // Producer API
    void* claim(size_t want, uint64_t timeout_ns);
    void publish(size_t n);  // rings the doorbell
};

} // namespace ipc
```

## Usage Examples

These use the message framing helpers from `../shm_common.hpp`
(`ring_send_msg` / `ring_receive_msg`), which add a 4-byte length prefix and
take care of the matched claim/peek sizing.

**Producer process:**
```cpp
#include "ipc_runtime/shm_common.hpp"
#include <string>

int main() {
    // Create ring buffer (1 MiB capacity); consumer connects by name.
    auto tx = ipc::SpscShm::create("/demo_ring", 1 << 20);

    std::string msg = "hello from producer";
    while (true) {
        // Blocks up to 1s for ring space; false on timeout.
        ipc::ring_send_msg(tx, msg.data(), msg.size(), 1'000'000'000);
    }
}
```

**Consumer process:**
```cpp
#include "ipc_runtime/shm_common.hpp"
#include <iostream>

int main() {
    auto rx = ipc::SpscShm::connect("/demo_ring");

    while (true) {
        // Blocks up to 1s for a whole message; empty data() on timeout.
        auto msg = ipc::ring_receive_msg(rx, 1'000'000'000);
        if (msg.data() == nullptr) {
            continue; // timeout
        }
        std::cout << "Received: " << std::string(msg.begin(), msg.end()) << "\n";
        rx.release(4 + msg.size()); // length prefix + payload
    }
}
```

**Cleanup:**
```cpp
// When done (from either process)
ipc::SpscShm::unlink("/demo_ring");
```

For multi-producer setups, prefer the higher-level `MpscShmServer` /
`MpscShmClient` (`../mpsc_shm_server.hpp`, `../mpsc_shm_client.hpp`), which
wire `MpscConsumer`/`MpscProducer` together with per-client response rings
and the same framing.

## Implementation Details

### Memory Layout

The shared memory region contains:
1. **SpscCtrl** (control block, 256 bytes)
   - Atomic head/tail counters (cache-line aligned)
   - Futex sequencers for sleep/wake
   - Capacity and mask (immutable)
2. **Data buffer** (power-of-2 size, follows control block)

Total size: `sizeof(SpscCtrl) + capacity`

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

### Futex-Based Blocking

Instead of busy-waiting forever:
1. **Producer**: Spins briefly checking for space, then sleeps on the `tail` futex (armed against the current tail value)
2. **Consumer**: Spins briefly checking for data, then sleeps on the `head` futex (armed against the current head value)
3. **Wakeup**: The other side calls `futex_wake` unconditionally after publishing/releasing. `futex_wait` re-checks the armed value atomically under the futex bucket lock, so a publish/release that races the sleep returns `EAGAIN` instead of sleeping.

This provides:
- Low latency when active (spin catches transitions)
- Low power when idle (futex sleep)
- No thundering herd (one waker, one sleeper)

> The wake is intentionally unconditional — do **not** gate it on a
> `consumer_blocked`/`producer_blocked` flag to skip the syscall when no one is
> waiting. That would be a cross-process Dekker handshake between the flag and
> the head/tail word, which races and can drop the wake, stranding a waiter on
> already-published data. A `futex_wake` with no waiter is a cheap no-op, so the
> unconditional wake costs effectively nothing on the idle-consumer path.

### MPSC Doorbell

The doorbell is a simple futex counter in shared memory:

```cpp
struct alignas(64) MpscDoorbell {
    // Producer-written (incremented in publish())
    alignas(64) std::atomic<uint32_t> seq;
    // (+ cache-line padding)
};
```

**Protocol:**
1. Producer publishes data to its SPSC ring
2. Producer increments the doorbell seq and calls `futex_wake` unconditionally
3. Consumer wakes up, polls all rings in round-robin
4. Consumer sleeps on the doorbell seq only when all rings are empty

This ensures the consumer wakes promptly when any producer has data, while minimizing futex overhead when rings stay populated.

## Performance Tuning

### Spin Time

The `spin_ns` parameter controls busy-wait duration before sleeping:

- **Low latency**: Use longer spin (e.g., 100 µs) to avoid futex overhead
- **Power efficiency**: Use shorter spin (e.g., 1 µs) to sleep sooner
- **Recommended**: 10-20 µs balances latency and power

### Ring Size

- Must be **power of two**
- Larger rings reduce wrapping overhead but use more memory
- Recommended: 1 MB (1 << 20) for most use cases
- Small messages (<1 KB): Can use smaller rings (256 KB)
- Large messages (>100 KB): Use larger rings (4-16 MB)

### Number of Producers (MPSC)

- More producers → more ring poll overhead for consumer
- Recommended: ≤8 producers for best performance
- Beyond that, consider multiple MPSC systems or alternative architecture

## Thread Safety

### SPSC
- **One producer thread**, **one consumer thread**
- No internal synchronization needed (lock-free by design)
- Cannot share producer or consumer role across threads

### MPSC
- **Multiple producer threads** (one per producer instance)
- **One consumer thread**
- Each producer is independent (no contention)
- Consumer must be single-threaded

## Limitations

1. **Platform**: Linux and macOS (futex / `os_sync_wait_on_address`); other platforms fail the build
2. **Capacity**: Must be power of two
3. **Fixed size**: Cannot resize after creation
4. **No security**: All processes with access can read/write shared memory
5. **Manual cleanup**: Must call `unlink()` to remove `/dev/shm` objects

## Comparison with Other IPC Mechanisms

| Mechanism          | Latency    | Throughput | Complexity | Use Case                |
|--------------------|------------|------------|------------|-------------------------|
| Pipe               | 6-15 µs    | 150K/s     | Low        | Simple IPC              |
| Unix Socket        | 6-15 µs    | 150K/s     | Low        | Network-like API        |
| SPSC Ring          | 0.3-1 µs   | 1M/s       | Medium     | Ultra-low latency       |
| MPSC Ring          | ~3 µs      | 700K/s     | Medium     | Multiple producers      |
| POSIX MQ           | 10-20 µs   | 100K/s     | Medium     | Message queue semantics |

## See Also

- Parent IPC module: [`../README.md`](../README.md)
- Tests: [`../shm.test.cpp`](../shm.test.cpp)
- Benchmarks: build a harness against the `ipc_runtime` CMake target.
- Higher-level wrappers: `ShmClient` / `ShmServer` in [`../shm_client.hpp`](../shm_client.hpp)

## License

See repository root for license details.
