# Lock-Free Shared Memory Ring Buffers (C++)

Ultra-low-latency shared-memory ring buffers for inter-process communication using modern C++. Built on Linux `shm_open` + `mmap` with lock-free atomics and efficient futex-based blocking.

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
│  │ head (producer-owned, cacheline-aligned)   │  │
│  │ tail (consumer-owned, cacheline-aligned)   │  │
│  │ data_seq, space_seq (futex sequencers)    │  │
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

### SpscShm Class

```cpp
namespace bb::ipc {

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
    uint64_t free_space() const;  // bytes free to write

    // Producer API
    void* claim(size_t want, size_t* granted);  // Claim write space
    void publish(size_t n);                      // Commit n bytes

    // Consumer API
    void* peek(size_t* n);   // Peek read space (auto-skips padding)
    void release(size_t n);  // Release n bytes

    // Blocking wait (spin, then futex)
    bool wait_for_data(uint32_t spin_ns);
    bool wait_for_space(size_t need, uint32_t spin_ns);
};

} // namespace bb::ipc
```

### MpscConsumer / MpscProducer Classes

```cpp
namespace bb::ipc {

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
    int wait_for_data(uint32_t spin_ns);          // Returns ring index with data
    void* peek(size_t ring_idx, size_t* n);       // Peek specific ring
    void release(size_t ring_idx, size_t n);      // Release from specific ring
};

class MpscProducer {
public:
    // Factory
    static MpscProducer connect(const std::string& name, size_t producer_id);

    // Move-only (RAII)
    MpscProducer(MpscProducer&& other) noexcept;
    ~MpscProducer();

    // Producer API
    void* claim(size_t want, size_t* granted);
    void publish(size_t n);  // Rings doorbell if needed
    bool wait_for_space(size_t need, uint32_t spin_ns);
};

} // namespace bb::ipc
```

## Usage Examples

### SPSC: Simple Message Passing

**Producer process:**
```cpp
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <string>

using namespace bb::ipc;

int main() {
    // Create ring buffer (1 MB capacity)
    auto tx = SpscShm::create("/demo_ring", 1 << 20);

    std::string msg = "hello from producer";

    while (true) {
        // Wait for space (spin 20 µs, then futex)
        if (!tx.wait_for_space(msg.size(), 20000)) {
            continue;
        }

        // Claim write space
        size_t granted;
        void* buf = tx.claim(msg.size(), &granted);

        // Write message
        std::memcpy(buf, msg.data(), msg.size());
        tx.publish(msg.size());

        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
}
```

**Consumer process:**
```cpp
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <iostream>

using namespace bb::ipc;

int main() {
    // Connect to existing ring
    auto rx = SpscShm::connect("/demo_ring");

    while (true) {
        // Wait for data (spin 20 µs, then futex)
        if (!rx.wait_for_data(20000)) {
            continue;
        }

        // Peek data
        size_t n;
        void* data = rx.peek(&n);

        if (n > 0) {
            std::cout << "Received: " << std::string((char*)data, n) << "\n";
            rx.release(n);
        }
    }
}
```

**Cleanup:**
```cpp
// When done (from either process)
SpscShm::unlink("/demo_ring");
```

### MPSC: Multiple Producers, Single Consumer

**Consumer process:**
```cpp
#include "barretenberg/ipc/shm/mpsc_shm.hpp"
#include <iostream>

using namespace bb::ipc;

int main() {
    // Create MPSC with 3 producers, 1 MB rings
    auto consumer = MpscConsumer::create("my_mpsc", 3, 1 << 20);

    while (true) {
        // Wait for data from any producer
        int ring_idx = consumer.wait_for_data(20000);  // spin 20 µs, then futex
        if (ring_idx < 0) continue;

        // Process data from that producer
        size_t n;
        void* data = consumer.peek(ring_idx, &n);

        if (n > 0) {
            std::cout << "Received " << n << " bytes from producer "
                      << ring_idx << "\n";
            // Process data...
            consumer.release(ring_idx, n);
        }
    }
}
```

**Producer processes (3 separate processes):**
```cpp
#include "barretenberg/ipc/shm/mpsc_shm.hpp"
#include <string>

using namespace bb::ipc;

int main(int argc, char** argv) {
    int producer_id = std::stoi(argv[1]);  // 0, 1, or 2

    // Connect as producer
    auto producer = MpscProducer::connect("my_mpsc", producer_id);

    std::string msg = "hello from producer " + std::to_string(producer_id);

    while (true) {
        // Wait for space in our ring
        if (!producer.wait_for_space(msg.size(), 20000)) {
            continue;
        }

        // Claim space and write
        size_t granted;
        void* buf = producer.claim(msg.size(), &granted);

        if (granted >= msg.size()) {
            std::memcpy(buf, msg.data(), msg.size());
            producer.publish(msg.size());  // Rings doorbell
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
}
```

**Cleanup:**
```cpp
MpscConsumer::unlink("my_mpsc", 3);  // Removes doorbell + 3 rings
```

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
1. **Producer**: Spins briefly checking for space, then sleeps on `space_seq` futex
2. **Consumer**: Spins briefly checking for data, then sleeps on `data_seq` futex
3. **Wakeup**: Incrementing sequencer + `futex_wake` wakes sleeping side

This provides:
- Low latency when active (spin catches transitions)
- Low power when idle (futex sleep)
- No thundering herd (one waker, one sleeper)

### MPSC Doorbell

The doorbell is a simple futex counter in shared memory:

```cpp
struct alignas(64) MpscDoorbell {
    std::atomic<uint32_t> seq;
    uint8_t _pad[60];  // Cache line padding
};
```

**Protocol:**
1. Producer publishes data to its SPSC ring
2. If ring was empty (first message), increment doorbell seq and call `futex_wake`
3. Consumer wakes up, polls all rings in round-robin
4. Consumer sleeps on doorbell only when all rings are empty

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

1. **Platform**: Linux-only (uses futex, though portable to other POSIX with modifications)
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
- Benchmarks: `barretenberg/cpp/build-no-avm/bin/ipc_bench`
- Higher-level wrappers: `ShmClient` / `ShmServer` in [`../shm_client.hpp`](../shm_client.hpp)

## License

Part of Barretenberg cryptographic library.
See repository root for license details.
