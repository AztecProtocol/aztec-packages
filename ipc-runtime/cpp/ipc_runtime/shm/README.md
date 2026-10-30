# Lock-Free Shared Memory Ring Buffers (C++)

Lock-free, zero-copy SPSC and MPSC ring buffers over POSIX shared memory (`shm_open` + `mmap` with `MAP_SHARED`), with futex blocking (`os_sync_wait_on_address` on macOS). There are no mutexes. Every publish/release makes one `futex_wake` syscall, which is cheap when no thread waits. Waiters spin briefly, then sleep on a futex. SPSC is the building block; MPSC composes per-producer SPSC rings with a doorbell. Control fields are cache-line aligned to avoid false sharing.

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
- Shared doorbell futex: producers bump the doorbell and wake the consumer on every publish
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
(`ring_send_msg` / `ring_receive_msg`), which add the 4-byte length prefix
plus the 8-byte request id and take care of the matched claim/peek sizing.
The largest message is `capacity/2 - 12` bytes; `ring_send_msg` throws on a
larger one.

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
        ipc::ring_send_msg(tx, /*request_id=*/1, msg.data(), msg.size(), 1'000'000'000);
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
        uint64_t request_id = 0;
        auto msg = ipc::ring_receive_msg(rx, 1'000'000'000, request_id);
        if (msg.data() == nullptr) {
            continue; // timeout
        }
        std::cout << "Received: " << std::string(msg.begin(), msg.end()) << "\n";
        rx.release(4 + 8 + msg.size()); // length prefix + request id + payload
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
1. **SpscCtrl** (control block, 4 cache lines = 256 bytes)
   - `head` + `wrap_head` (producer line)
   - `tail` (consumer line)
   - `capacity` and `mask` (immutable)
   - Futex waits use `head`/`tail` directly
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
    // Number of producer slots, written once by the consumer at create()
    std::atomic<uint32_t> num_slots;
    // (+ cache-line padding)
};
```

A per-slot owner table follows the doorbell in the same mapping
(`mpsc_slot_owners`): one pid per producer slot, 0 when free. A client that
connects with `kAutoClientId` claims the lowest free slot, or one owned by a
dead process, through `MpscSlotClaim`. That slot index is its producer id.
`ServerOptions::max_shm_clients` (default 2) sets the number of slots.

**Protocol:**
1. Producer publishes data to its SPSC ring
2. Producer increments the doorbell seq and calls `futex_wake` unconditionally
3. Consumer wakes up, polls all rings in round-robin
4. Consumer sleeps on the doorbell seq only when all rings are empty

This ensures the consumer wakes promptly when any producer has data, while minimizing futex overhead when rings stay populated.

## Performance Tuning

### Spin Time

Spin is fixed at 100 µs (`SPIN_NS` in `spsc_shm.cpp` and `mpsc_shm.cpp`) and is
skipped after a call that found no data. It is not configurable.

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

### SPSC
- **One producer thread**, **one consumer thread**
- No internal synchronization needed (lock-free by design)
- Cannot share producer or consumer role across threads

### MPSC
- Each `MpscProducer` must be used by one thread. Many producers can run in parallel.
- The consumer must be one thread.

## Limitations

1. **Platform**: Linux and macOS (futex / `os_sync_wait_on_address`); other platforms fail the build
2. **Capacity**: Rounded up to a power of two
3. **Fixed size**: Cannot resize after creation
4. **No security**: All processes with access can read/write shared memory
5. **Cleanup**: At this layer you must call `unlink()` to remove `/dev/shm` objects. `IpcServer` does it for you.

## See Also

- Parent IPC module: [ipc-runtime README](../../../README.md)
- Tests: [`../shm.test.cpp`](../shm.test.cpp)
- Benchmarks: build a harness against the `ipc_runtime` CMake target.
- Higher-level wrappers: `ShmClient` / `ShmServer` in [`../shm_client.hpp`](../shm_client.hpp)
