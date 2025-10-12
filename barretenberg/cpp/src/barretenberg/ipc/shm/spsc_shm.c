/* spsc_shm.c — implementation */
#include "spsc_shm.h"

#include <errno.h>
#include <fcntl.h>
#include <linux/futex.h>
#include <stdalign.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#if defined(__x86_64__) || defined(_M_X64)
#include <immintrin.h>
#define SPSC_PAUSE() _mm_pause()
#else
#define SPSC_PAUSE()                                                                                                   \
    do {                                                                                                               \
    } while (0)
#endif

/* ----- utilities ----- */

static inline uint64_t pow2_ceil_u64(uint64_t x)
{
    if (x < 2)
        return 2;
    x--;
    x |= x >> 1;
    x |= x >> 2;
    x |= x >> 4;
    x |= x >> 8;
    x |= x >> 16;
    x |= x >> 32;
    return x + 1;
}

static inline uint64_t mono_ns_now(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts); // typically vDSO
    return (uint64_t)ts.tv_sec * 1000000000ull + (uint64_t)ts.tv_nsec;
}

/* futex helpers */
static inline int futex_wait(volatile uint32_t* addr, uint32_t expect)
{
    return (int)syscall(SYS_futex, (uint32_t*)addr, FUTEX_WAIT, expect, NULL, NULL, 0);
}
static inline int futex_wake(volatile uint32_t* addr, int n)
{
    return (int)syscall(SYS_futex, (uint32_t*)addr, FUTEX_WAKE, n, NULL, NULL, 0);
}

/* ----- API impl ----- */

struct spsc_shm* spsc_shm_create(const char* name, size_t min_capacity)
{
    if (!name) {
        errno = EINVAL;
        return NULL;
    }

    size_t cap = (size_t)pow2_ceil_u64(min_capacity);
    size_t map_len = sizeof(struct spsc_ctrl) + cap;

    int fd = shm_open(name, O_RDWR | O_CREAT | O_EXCL, 0600);
    if (fd < 0)
        return NULL;

    if (ftruncate(fd, (off_t)map_len) != 0) {
        int e = errno;
        close(fd);
        shm_unlink(name);
        errno = e;
        return NULL;
    }

    void* mem = mmap(NULL, map_len, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (mem == MAP_FAILED) {
        int e = errno;
        close(fd);
        shm_unlink(name);
        errno = e;
        return NULL;
    }

    memset(mem, 0, map_len);
    struct spsc_ctrl* ctrl = (struct spsc_ctrl*)mem;

    // Initialize non-atomic fields first
    ctrl->capacity = cap;
    ctrl->mask = cap - 1;

    // Initialize atomics with release ordering to ensure capacity/mask are visible
    atomic_store_explicit(&ctrl->head, 0ULL, memory_order_release);
    atomic_store_explicit(&ctrl->tail, 0ULL, memory_order_release);
    atomic_store_explicit(&ctrl->data_seq, 0U, memory_order_release);
    atomic_store_explicit(&ctrl->space_seq, 0U, memory_order_release);

    struct spsc_shm* r = (struct spsc_shm*)malloc(sizeof *r);
    if (!r) {
        int e = errno;
        munmap(mem, map_len);
        close(fd);
        shm_unlink(name);
        errno = e;
        return NULL;
    }

    r->fd = fd;
    r->map_len = map_len;
    r->ctrl = ctrl;
    r->buf = (uint8_t*)(ctrl + 1);
    return r;
}

struct spsc_shm* spsc_shm_connect(const char* name)
{
    if (!name) {
        errno = EINVAL;
        return NULL;
    }

    int fd = shm_open(name, O_RDWR, 0600);
    if (fd < 0)
        return NULL;

    struct stat st;
    if (fstat(fd, &st) != 0) {
        int e = errno;
        close(fd);
        errno = e;
        return NULL;
    }
    size_t map_len = (size_t)st.st_size;

    void* mem = mmap(NULL, map_len, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (mem == MAP_FAILED) {
        int e = errno;
        close(fd);
        errno = e;
        return NULL;
    }

    struct spsc_shm* r = (struct spsc_shm*)malloc(sizeof *r);
    if (!r) {
        int e = errno;
        munmap(mem, map_len);
        close(fd);
        errno = e;
        return NULL;
    }

    r->fd = fd;
    r->map_len = map_len;
    r->ctrl = (struct spsc_ctrl*)mem;
    r->buf = (uint8_t*)(r->ctrl + 1);

    // Ensure initialization is visible before use (pairs with release in create)
    (void)atomic_load_explicit(&r->ctrl->head, memory_order_acquire);

    return r;
}

void spsc_shm_close(struct spsc_shm* r)
{
    if (!r)
        return;
    munmap(r->ctrl, r->map_len);
    close(r->fd);
    free(r);
}

int spsc_shm_unlink(const char* name)
{
    return shm_unlink(name);
}

uint64_t spsc_available(const struct spsc_shm* r)
{
    uint64_t head = atomic_load_explicit(&r->ctrl->head, memory_order_acquire);
    uint64_t tail = atomic_load_explicit(&r->ctrl->tail, memory_order_acquire);
    return head - tail;
}

uint64_t spsc_free_space(const struct spsc_shm* r)
{
    uint64_t cap = r->ctrl->capacity;
    uint64_t used = spsc_available(r);
    return cap - used;
}

void* spsc_claim(struct spsc_shm* r, size_t want, size_t* n)
{
    uint64_t cap = r->ctrl->capacity;
    uint64_t mask = r->ctrl->mask;

    uint64_t head = atomic_load_explicit(&r->ctrl->head, memory_order_relaxed);
    uint64_t tail = atomic_load_explicit(&r->ctrl->tail, memory_order_acquire);

    uint64_t freeb = cap - (head - tail);
    if (freeb == 0) {
        if (n)
            *n = 0;
        return NULL;
    }
    if (want > freeb)
        want = (size_t)freeb;

    uint64_t pos = head & mask;
    uint64_t till_end = cap - pos;
    size_t grant = (size_t)((want <= till_end) ? want : till_end);

    if (n)
        *n = grant;
    return r->buf + pos;
}

void spsc_publish(struct spsc_shm* r, size_t n)
{
    // Check if queue was empty before publish
    uint64_t head = atomic_load_explicit(&r->ctrl->head, memory_order_relaxed);
    uint64_t tail = atomic_load_explicit(&r->ctrl->tail, memory_order_acquire);
    int was_empty = (head == tail);

    atomic_store_explicit(&r->ctrl->head, head + n, memory_order_release);

    if (was_empty) {
        atomic_fetch_add_explicit(&r->ctrl->data_seq, 1, memory_order_release);
        futex_wake((volatile uint32_t*)&r->ctrl->data_seq, 1);
    }
}

void* spsc_peek(struct spsc_shm* r, size_t* n)
{
    uint64_t cap = r->ctrl->capacity;
    uint64_t mask = r->ctrl->mask;

    uint64_t head = atomic_load_explicit(&r->ctrl->head, memory_order_acquire);
    uint64_t tail = atomic_load_explicit(&r->ctrl->tail, memory_order_relaxed);

    uint64_t avail = head - tail;
    if (avail == 0) {
        if (n)
            *n = 0;
        return NULL;
    }

    uint64_t pos = tail & mask;
    uint64_t till_end = cap - pos;
    size_t grant = (size_t)((avail <= till_end) ? avail : till_end);

    if (n)
        *n = grant;
    return r->buf + pos;
}

void spsc_release(struct spsc_shm* r, size_t n)
{
    uint64_t tail = atomic_load_explicit(&r->ctrl->tail, memory_order_relaxed);
    uint64_t head = atomic_load_explicit(&r->ctrl->head, memory_order_acquire);
    uint64_t cap = r->ctrl->capacity;

    int was_full = ((head - tail) == cap);

    atomic_store_explicit(&r->ctrl->tail, tail + n, memory_order_release);

    if (was_full) {
        atomic_fetch_add_explicit(&r->ctrl->space_seq, 1, memory_order_release);
        futex_wake((volatile uint32_t*)&r->ctrl->space_seq, 1);
    }
}

/* Spin for spin_ns, then futex sleep on empty->nonempty */
int spsc_wait_for_data(struct spsc_shm* r, uint32_t spin_ns)
{
    if (spsc_available(r))
        return 1;

    if (spin_ns) {
        uint64_t start = mono_ns_now();
        do {
            if (spsc_available(r))
                return 1;
            SPSC_PAUSE();
        } while ((mono_ns_now() - start) < spin_ns);
    }

    if (spsc_available(r))
        return 1;
    uint32_t seq = atomic_load_explicit(&r->ctrl->data_seq, memory_order_acquire);
    if (spsc_available(r))
        return 1;
    futex_wait((volatile uint32_t*)&r->ctrl->data_seq, seq);
    return spsc_available(r) != 0;
}

/* Spin for spin_ns, then futex sleep on full->has-space */
int spsc_wait_for_space(struct spsc_shm* r, size_t need, uint32_t spin_ns)
{
    if (spsc_free_space(r) >= need)
        return 1;

    if (spin_ns) {
        uint64_t start = mono_ns_now();
        do {
            if (spsc_free_space(r) >= need)
                return 1;
            SPSC_PAUSE();
        } while ((mono_ns_now() - start) < spin_ns);
    }

    if (spsc_free_space(r) >= need)
        return 1;
    uint32_t seq = atomic_load_explicit(&r->ctrl->space_seq, memory_order_acquire);
    if (spsc_free_space(r) >= need)
        return 1;
    futex_wait((volatile uint32_t*)&r->ctrl->space_seq, seq);
    return spsc_free_space(r) >= need;
}
