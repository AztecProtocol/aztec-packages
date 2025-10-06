# spsc_shm — ultra-low-latency shared-memory ring for IPC

A minimal, lock-free **single-producer / single-consumer (SPSC)** ring buffer
built on Linux `shm_open` + `mmap`.
Hot path has **no syscalls**, only atomic counters and cache-friendly memory ops.
When idle, it spins briefly, then sleeps via `futex` (low power, no polling).

---

## Features

- Zero-copy IPC between two processes.
- No locks, no malloc, no syscalls in hot path.
- Adaptive spin + futex sleep for efficient latency/power balance.
- Uses only `stdatomic.h` and system calls (`shm_open`, `mmap`, `futex`).
- Portable C11, x86-64 friendly (uses `_mm_pause`).

---

## Build

```bash
cc -O3 -std=c11 spsc_shm.c producer.c -lrt -o producer
cc -O3 -std=c11 spsc_shm.c consumer.c -lrt -o consumer
```

## Example: simple message passing

**producer.c**

```c
#include "spsc_shm.h"
#include <string.h>
#include <stdio.h>

int main(void) {
    struct spsc_shm *tx = spsc_shm_create("/demo_ring", 1 << 20); // 1 MiB
    if (!tx) { perror("create"); return 1; }

    const char *msg = "hello from producer";
    size_t len = strlen(msg) + 1;

    for (;;) {
        if (!spsc_wait_for_space(tx, len, 20000)) continue; // spin 20 µs then sleep
        size_t n; void *p = spsc_claim(tx, len, &n);
        memcpy(p, msg, len);
        spsc_publish(tx, len);
        printf("sent: %s\n", msg);
        usleep(500000); // 0.5 s for demo
    }
}
```

**consumer.c**

```c
#include "spsc_shm.h"
#include <stdio.h>
#include <string.h>

int main(void) {
    struct spsc_shm *rx = spsc_shm_connect("/demo_ring");
    if (!rx) { perror("connect"); return 1; }

    for (;;) {
        if (!spsc_wait_for_data(rx, 20000)) continue; // spin 20 µs then sleep
        size_t n; void *p = spsc_peek(rx, &n);
        if (n) {
            printf("recv: %s\n", (char*)p);
            spsc_release(rx, n);
        }
    }
}
```

Run in two terminals:

```bash
./consumer
./producer
```

Output:

```
recv: hello from producer
recv: hello from producer
...
```

When finished, clean up:

```bash
# run once (creator side)
spsc_shm_unlink("/demo_ring");
```

---

## Typical latency

| Path type                      |     Approx round-trip latency |
| ------------------------------ | ----------------------------: |
| Pipe/socket (syscalls)         |                       6–15 µs |
| `spsc_shm` (busy + futex idle) | **0.3–1 µs hot**, 3–6 µs cold |

---

## API summary

| Function                                         | Description                                |
| ------------------------------------------------ | ------------------------------------------ |
| `spsc_shm_create(name, bytes)`                   | Create and initialize shared memory region |
| `spsc_shm_connect(name)`                         | Attach to existing region                  |
| `spsc_shm_close(r)`                              | Unmap and close                            |
| `spsc_shm_unlink(name)`                          | Remove kernel object                       |
| `spsc_claim(r, want, &n)` / `spsc_publish(r, n)` | Producer writes `n` bytes                  |
| `spsc_peek(r, &n)` / `spsc_release(r, n)`        | Consumer reads `n` bytes                   |
| `spsc_wait_for_space(r, need, spin_ns)`          | Wait for write space                       |
| `spsc_wait_for_data(r, spin_ns)`                 | Wait for data                              |

---

## Multi-Producer Single-Consumer (MPSC)

The MPSC implementation layers on top of SPSC rings, using a shared "doorbell" futex to coordinate consumer wakeup across multiple producers.

**Architecture:**

- Each producer gets a dedicated SPSC ring (lock-free, no contention between producers)
- Shared doorbell futex: single wakeup point for consumer
- Consumer polls all rings in round-robin fashion, then sleeps on doorbell
- Producers ring doorbell only on empty→non-empty transition

**Key characteristics:**

- Lock-free producer fast path
- Fair round-robin consumer scheduling
- Per-producer backpressure (full ring only blocks that producer)
- Doorbell adds minimal overhead (~0 when rings stay non-empty)

### MPSC Example

**Consumer process:**

```c
#include "mpsc_shm.h"
#include <stdio.h>

int main(void) {
    // Create MPSC with 3 producers
    struct mpsc_consumer* consumer = mpsc_consumer_create("my_mpsc", 3, 1 << 20);
    if (!consumer) { perror("mpsc_consumer_create"); return 1; }

    for (;;) {
        // Wait for data from any producer (returns producer ring index)
        int ring_idx = mpsc_wait_for_data(consumer, 20000); // spin 20 µs then sleep
        if (ring_idx < 0) continue;

        // Process data from producer ring_idx
        size_t n;
        void* data = mpsc_peek(consumer, ring_idx, &n);
        if (n > 0) {
            printf("Received %zu bytes from producer %d\n", n, ring_idx);
            // Process data...
            mpsc_release(consumer, ring_idx, n);
        }
    }

    mpsc_consumer_close(consumer);
    return 0;
}
```

**Producer processes (3 separate processes):**

```c
#include "mpsc_shm.h"
#include <string.h>
#include <stdio.h>

int main(int argc, char** argv) {
    int producer_id = atoi(argv[1]); // 0, 1, or 2

    // Connect to MPSC as producer_id
    struct mpsc_producer* producer = mpsc_producer_connect("my_mpsc", producer_id);
    if (!producer) { perror("mpsc_producer_connect"); return 1; }

    char msg[64];
    snprintf(msg, sizeof(msg), "hello from producer %d", producer_id);
    size_t len = strlen(msg) + 1;

    for (;;) {
        // Wait for space in this producer's ring
        if (!mpsc_wait_for_space(producer, len, 20000)) continue;

        size_t granted;
        void* buf = mpsc_claim(producer, len, &granted);
        if (granted >= len) {
            memcpy(buf, msg, len);
            mpsc_publish(producer, len); // Rings doorbell if consumer was idle
            printf("Sent: %s\n", msg);
        }
        usleep(500000); // 0.5 s for demo
    }

    mpsc_producer_close(producer);
    return 0;
}
```

**Run in four terminals:**

```bash
# Terminal 1: Consumer
./consumer

# Terminal 2-4: Producers
./producer 0
./producer 1
./producer 2
```

**Cleanup:**

```bash
mpsc_unlink("my_mpsc", 3);  // Removes doorbell + 3 rings
```

### MPSC Performance

Performance characteristics from benchmark (3 producers @ max rate):

- SPSC roundtrip: **~14 µs** (no contention)
- MPSC roundtrip: **~40 µs** (3-way contention, ~3x as expected)
- Doorbell overhead: negligible when rings remain populated

See `benchmark/poseidon2_bench/poseidon2.bench.cpp` for full SPSC and MPSC usage examples.

---

## Notes

- Capacity must be a **power of two**.
- Messages can be fixed-size or prefixed with a length field.
- Use one ring per direction for bidirectional RPC.
- Call `spsc_shm_unlink()` once both ends are done to delete `/dev/shm/<name>`.
- For MPSC, call `mpsc_unlink(name, num_producers)` to clean up all shared memory.

---

## License

Public domain / CC0.
Do whatever you want.
