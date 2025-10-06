/* spsc_shm.h — single-producer/single-consumer shared-memory ring (Linux, x86-64 friendly)
 *
 * - Zero-copy between processes via MAP_SHARED.
 * - One producer, one consumer. No locks. Hot path has no syscalls.
 * - Adaptive spin, then futex sleep/wake on empty/full transitions.
 * - Variable-length or fixed-slot messages (you decide the framing).
 *
 * Build: cc -O3 -std=c11 spsc_shm.c your_app.c -lrt
 */

#ifndef SPSC_SHM_H
#define SPSC_SHM_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
#include <atomic>
#define SPSC_ATOMIC(T) std::atomic<T>
extern "C" {
#else
#include <stdalign.h>
#include <stdatomic.h>
#define SPSC_ATOMIC(T) _Atomic T
#endif

#ifndef SPSC_CACHELINE
#define SPSC_CACHELINE 64
#endif

struct spsc_ctrl {
    alignas(SPSC_CACHELINE) SPSC_ATOMIC(uint64_t) head; // bytes written
    char _pad0[SPSC_CACHELINE - sizeof(SPSC_ATOMIC(uint64_t))];

    alignas(SPSC_CACHELINE) SPSC_ATOMIC(uint64_t) tail; // bytes consumed
    char _pad1[SPSC_CACHELINE - sizeof(SPSC_ATOMIC(uint64_t))];

    // Futex-sequencers (increment on empty->nonempty and full->has-space)
    alignas(SPSC_CACHELINE) SPSC_ATOMIC(uint32_t) data_seq;
    alignas(SPSC_CACHELINE) SPSC_ATOMIC(uint32_t) space_seq;
    char _pad2[SPSC_CACHELINE - sizeof(SPSC_ATOMIC(uint32_t)) * 2];

    alignas(SPSC_CACHELINE) uint64_t capacity; // power of two
    alignas(SPSC_CACHELINE) uint64_t mask;     // capacity - 1
    // uint8_t buffer[capacity] follows...
};

struct spsc_shm {
    int fd;
    size_t map_len;
    struct spsc_ctrl* ctrl;
    uint8_t* buf;
};

/* Lifecycle */
struct spsc_shm* spsc_shm_create(const char* name, size_t min_capacity);
struct spsc_shm* spsc_shm_connect(const char* name);
void spsc_shm_close(struct spsc_shm* r);
int spsc_shm_unlink(const char* name);

/* Introspection */
uint64_t spsc_available(const struct spsc_shm* r);  // bytes ready to read
uint64_t spsc_free_space(const struct spsc_shm* r); // bytes free to write

/* Producer API */
void* spsc_claim(struct spsc_shm* r, size_t want, size_t* n); // contiguous grant (may wrap later)
void spsc_publish(struct spsc_shm* r, size_t n);

/* Consumer API */
void* spsc_peek(struct spsc_shm* r, size_t* n); // contiguous readable region
void spsc_release(struct spsc_shm* r, size_t n);

/* Adaptive wait (spin for spin_ns, then futex sleep). Returns 1 if ready afterward, else 0. */
int spsc_wait_for_data(struct spsc_shm* r, uint32_t spin_ns);
int spsc_wait_for_space(struct spsc_shm* r, size_t need, uint32_t spin_ns);

#ifdef __cplusplus
}
#endif

#endif /* SPSC_SHM_H */
