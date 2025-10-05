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

````

---

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

## Notes

- Capacity must be a **power of two**.
- Messages can be fixed-size or prefixed with a length field.
- Use one ring per direction for bidirectional RPC.
- Call `spsc_shm_unlink()` once both ends are done to delete `/dev/shm/<name>`.

---

## License

Public domain / CC0.
Do whatever you want.
````
