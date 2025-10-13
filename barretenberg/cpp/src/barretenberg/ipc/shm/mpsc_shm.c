/* mpsc_shm.c — Multi-Producer Single-Consumer implementation */
#include "mpsc_shm.h"
#include <errno.h>
#include <fcntl.h>
#include <linux/futex.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

#if defined(__x86_64__) || defined(_M_X64)
#include <immintrin.h>
#define MPSC_PAUSE() _mm_pause()
#else
#define MPSC_PAUSE()                                                                                                   \
    do {                                                                                                               \
    } while (0)
#endif

/* ----- Utilities ----- */

static inline uint64_t mpsc_mono_ns_now(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000000ull + (uint64_t)ts.tv_nsec;
}

static inline int mpsc_futex_wait(volatile uint32_t* addr, uint32_t expect)
{
    return (int)syscall(SYS_futex, (uint32_t*)addr, FUTEX_WAIT, expect, NULL, NULL, 0);
}

static inline int mpsc_futex_wake(volatile uint32_t* addr, int n)
{
    return (int)syscall(SYS_futex, (uint32_t*)addr, FUTEX_WAKE, n, NULL, NULL, 0);
}

/* ----- Consumer Implementation ----- */

struct mpsc_consumer* mpsc_consumer_create(const char* name, size_t num_producers, size_t ring_capacity)
{
    if (!name || num_producers == 0) {
        errno = EINVAL;
        return NULL;
    }

    struct mpsc_consumer* c = (struct mpsc_consumer*)malloc(sizeof(struct mpsc_consumer));
    if (!c)
        return NULL;

    c->num_rings = num_producers;
    c->last_served = 0;
    c->doorbell_len = sizeof(struct mpsc_doorbell);

    /* Create doorbell shared memory */
    char doorbell_name[256];
    snprintf(doorbell_name, sizeof(doorbell_name), "%s_doorbell", name);

    c->doorbell_fd = shm_open(doorbell_name, O_RDWR | O_CREAT | O_EXCL, 0600);
    if (c->doorbell_fd < 0) {
        free(c);
        return NULL;
    }

    if (ftruncate(c->doorbell_fd, (off_t)c->doorbell_len) != 0) {
        int e = errno;
        close(c->doorbell_fd);
        shm_unlink(doorbell_name);
        free(c);
        errno = e;
        return NULL;
    }

    c->doorbell = (struct mpsc_doorbell*)mmap(NULL, c->doorbell_len, PROT_READ | PROT_WRITE, MAP_SHARED, c->doorbell_fd, 0);
    if (c->doorbell == MAP_FAILED) {
        int e = errno;
        close(c->doorbell_fd);
        shm_unlink(doorbell_name);
        free(c);
        errno = e;
        return NULL;
    }

    /* Initialize doorbell */
    memset(c->doorbell, 0, c->doorbell_len);
    atomic_store_explicit(&c->doorbell->seq, 0U, memory_order_release);

    /* Create all SPSC rings */
    c->rings = (struct spsc_shm**)malloc(sizeof(struct spsc_shm*) * num_producers);
    if (!c->rings) {
        int e = errno;
        munmap(c->doorbell, c->doorbell_len);
        close(c->doorbell_fd);
        shm_unlink(doorbell_name);
        free(c);
        errno = e;
        return NULL;
    }

    for (size_t i = 0; i < num_producers; i++) {
        char ring_name[256];
        snprintf(ring_name, sizeof(ring_name), "%s_ring_%zu", name, i);
        c->rings[i] = spsc_shm_create(ring_name, ring_capacity);
        if (!c->rings[i]) {
            /* Cleanup already created rings */
            for (size_t j = 0; j < i; j++) {
                char cleanup_name[256];
                snprintf(cleanup_name, sizeof(cleanup_name), "%s_ring_%zu", name, j);
                spsc_shm_close(c->rings[j]);
                spsc_shm_unlink(cleanup_name);
            }
            free(c->rings);
            munmap(c->doorbell, c->doorbell_len);
            close(c->doorbell_fd);
            shm_unlink(doorbell_name);
            free(c);
            return NULL;
        }
    }

    return c;
}

int mpsc_wait_for_data(struct mpsc_consumer* c, uint32_t spin_ns)
{
    /* Phase 1: Quick poll all rings starting from NEXT after last_served (round-robin) */
    for (size_t i = 0; i < c->num_rings; i++) {
        size_t idx = (c->last_served + 1 + i) % c->num_rings;
        if (spsc_available(c->rings[idx]) > 0) {
            c->last_served = idx;
            return (int)idx;
        }
    }

    /* Phase 2: Spin phase */
    if (spin_ns > 0) {
        uint64_t start = mpsc_mono_ns_now();
        do {
            for (size_t i = 0; i < c->num_rings; i++) {
                size_t idx = (c->last_served + 1 + i) % c->num_rings;
                if (spsc_available(c->rings[idx]) > 0) {
                    c->last_served = idx;
                    return (int)idx;
                }
            }
            MPSC_PAUSE();
        } while ((mpsc_mono_ns_now() - start) < spin_ns);
    }

    /* Phase 3: Sleep on doorbell */
    uint32_t seq = atomic_load_explicit(&c->doorbell->seq, memory_order_acquire);

    /* Check again before sleeping to avoid race */
    for (size_t i = 0; i < c->num_rings; i++) {
        size_t idx = (c->last_served + 1 + i) % c->num_rings;
        if (spsc_available(c->rings[idx]) > 0) {
            c->last_served = idx;
            return (int)idx;
        }
    }

    mpsc_futex_wait((volatile uint32_t*)&c->doorbell->seq, seq);

    /* After waking, poll again */
    for (size_t i = 0; i < c->num_rings; i++) {
        size_t idx = (c->last_served + 1 + i) % c->num_rings;
        if (spsc_available(c->rings[idx]) > 0) {
            c->last_served = idx;
            return (int)idx;
        }
    }

    return -1; /* No data available */
}

void* mpsc_peek(struct mpsc_consumer* c, size_t ring_idx, size_t* n)
{
    if (ring_idx >= c->num_rings) {
        if (n)
            *n = 0;
        return NULL;
    }
    return spsc_peek(c->rings[ring_idx], n);
}

void mpsc_release(struct mpsc_consumer* c, size_t ring_idx, size_t n)
{
    if (ring_idx >= c->num_rings)
        return;
    spsc_release(c->rings[ring_idx], n);
}

void mpsc_consumer_close(struct mpsc_consumer* c)
{
    if (!c)
        return;

    for (size_t i = 0; i < c->num_rings; i++) {
        if (c->rings[i])
            spsc_shm_close(c->rings[i]);
    }
    free(c->rings);

    if (c->doorbell)
        munmap(c->doorbell, c->doorbell_len);
    if (c->doorbell_fd >= 0)
        close(c->doorbell_fd);

    free(c);
}

int mpsc_unlink(const char* name, size_t num_producers)
{
    char doorbell_name[256];
    snprintf(doorbell_name, sizeof(doorbell_name), "%s_doorbell", name);
    shm_unlink(doorbell_name);

    for (size_t i = 0; i < num_producers; i++) {
        char ring_name[256];
        snprintf(ring_name, sizeof(ring_name), "%s_ring_%zu", name, i);
        spsc_shm_unlink(ring_name);
    }

    return 0;
}

/* ----- Producer Implementation ----- */

struct mpsc_producer* mpsc_producer_connect(const char* name, size_t producer_id)
{
    if (!name) {
        errno = EINVAL;
        return NULL;
    }

    struct mpsc_producer* p = (struct mpsc_producer*)malloc(sizeof(struct mpsc_producer));
    if (!p)
        return NULL;

    p->producer_id = producer_id;
    p->doorbell_len = sizeof(struct mpsc_doorbell);

    /* Connect to doorbell */
    char doorbell_name[256];
    snprintf(doorbell_name, sizeof(doorbell_name), "%s_doorbell", name);

    p->doorbell_fd = shm_open(doorbell_name, O_RDWR, 0600);
    if (p->doorbell_fd < 0) {
        free(p);
        return NULL;
    }

    p->doorbell = (struct mpsc_doorbell*)mmap(NULL, p->doorbell_len, PROT_READ | PROT_WRITE, MAP_SHARED, p->doorbell_fd, 0);
    if (p->doorbell == MAP_FAILED) {
        int e = errno;
        close(p->doorbell_fd);
        free(p);
        errno = e;
        return NULL;
    }

    /* Connect to assigned ring */
    char ring_name[256];
    snprintf(ring_name, sizeof(ring_name), "%s_ring_%zu", name, producer_id);
    p->ring = spsc_shm_connect(ring_name);
    if (!p->ring) {
        int e = errno;
        munmap(p->doorbell, p->doorbell_len);
        close(p->doorbell_fd);
        free(p);
        errno = e;
        return NULL;
    }

    return p;
}

void* mpsc_claim(struct mpsc_producer* p, size_t want, size_t* granted)
{
    return spsc_claim(p->ring, want, granted);
}

void mpsc_publish(struct mpsc_producer* p, size_t n)
{
    uint64_t head = atomic_load_explicit(&p->ring->ctrl->head, memory_order_relaxed);

    /* Update ring head (standard SPSC publish) */
    atomic_store_explicit(&p->ring->ctrl->head, head + n, memory_order_release);

    /* Always ring doorbell - spsc_claim() may have already advanced head during wrapping,
     * so we can't rely on was_empty check. Futex wake is cheap if no one is waiting. */
    atomic_fetch_add_explicit(&p->doorbell->seq, 1, memory_order_release);
    mpsc_futex_wake((volatile uint32_t*)&p->doorbell->seq, 1);
}

int mpsc_wait_for_space(struct mpsc_producer* p, size_t need, uint32_t spin_ns)
{
    return spsc_wait_for_space(p->ring, need, spin_ns);
}

void mpsc_producer_close(struct mpsc_producer* p)
{
    if (!p)
        return;

    if (p->ring)
        spsc_shm_close(p->ring);

    if (p->doorbell)
        munmap(p->doorbell, p->doorbell_len);
    if (p->doorbell_fd >= 0)
        close(p->doorbell_fd);

    free(p);
}
