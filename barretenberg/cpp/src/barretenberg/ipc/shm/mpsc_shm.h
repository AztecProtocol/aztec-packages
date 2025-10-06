/* mpsc_shm.h — Multi-Producer Single-Consumer via SPSC rings + doorbell futex */
#pragma once

#include "spsc_shm.h"
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Shared doorbell for waking consumer */
struct mpsc_doorbell {
    _Atomic uint32_t seq;
    uint8_t _pad[60]; /* Cache line alignment */
};

/* Consumer handle */
struct mpsc_consumer {
    struct spsc_shm** rings;
    size_t num_rings;
    struct mpsc_doorbell* doorbell;
    int doorbell_fd;
    size_t doorbell_len;
    size_t last_served; /* Round-robin fairness */
};

/* Producer handle */
struct mpsc_producer {
    struct spsc_shm* ring;
    struct mpsc_doorbell* doorbell;
    int doorbell_fd;
    size_t doorbell_len;
    size_t producer_id;
};

/* Consumer API */

/* Create MPSC consumer: doorbell + num_producers SPSC rings */
struct mpsc_consumer* mpsc_consumer_create(const char* name, size_t num_producers, size_t ring_capacity);

/* Wait for data on any ring. Returns ring index or -1 on timeout.
   spin_ns: nanoseconds to busy-wait before sleeping on doorbell */
int mpsc_wait_for_data(struct mpsc_consumer* c, uint32_t spin_ns);

/* Peek data from specific ring */
void* mpsc_peek(struct mpsc_consumer* c, size_t ring_idx, size_t* n);

/* Release data from specific ring */
void mpsc_release(struct mpsc_consumer* c, size_t ring_idx, size_t n);

/* Close consumer and cleanup */
void mpsc_consumer_close(struct mpsc_consumer* c);

/* Unlink all shared memory for this MPSC system */
int mpsc_unlink(const char* name, size_t num_producers);

/* Producer API */

/* Connect to MPSC system as producer_id */
struct mpsc_producer* mpsc_producer_connect(const char* name, size_t producer_id);

/* Claim space in producer's ring */
void* mpsc_claim(struct mpsc_producer* p, size_t want, size_t* granted);

/* Publish data to producer's ring (rings doorbell if was empty) */
void mpsc_publish(struct mpsc_producer* p, size_t n);

/* Wait for space in producer's ring */
int mpsc_wait_for_space(struct mpsc_producer* p, size_t need, uint32_t spin_ns);

/* Close producer */
void mpsc_producer_close(struct mpsc_producer* p);

#ifdef __cplusplus
}
#endif
