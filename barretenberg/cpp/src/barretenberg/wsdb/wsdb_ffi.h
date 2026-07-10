#ifndef BB_WSDB_FFI_H
#define BB_WSDB_FFI_H

/*
 * Plain-C ABI for hosting the world state database (wsdb) IN-PROCESS. The
 * WorldState, the per-fork scheduler, and the generated dispatch live in the
 * `wsdb_ffi` library; the `aztec-wsdb` executable (out-of-process IPC) and any
 * in-process host (e.g. a small NAPI wrapper generated up the stack, or a
 * co-linked AVM sharing the same WorldState) are all thin consumers of this ABI.
 * The socket server just feeds each wire frame into `wsdb_call`. Barretenberg
 * itself stays free of any Node/NAPI knowledge — this surface is plain C.
 *
 * Handle-based (create/call/destroy) so the per-instance context (WorldState +
 * scheduler + dispatch) is explicit and several services can be co-hosted in one
 * process without symbol collisions. Dispatch is ASYNC: `wsdb_call` schedules the
 * request and the response is delivered through a callback, possibly from a
 * worker thread — preserving the concurrency the socket server relies on.
 */

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct wsdb_instance wsdb_instance_t;

/*
 * Predicate the scheduler consults to gate its inline fast path: return non-zero
 * if another request is already waiting behind this one (so the current one must
 * go through the pool rather than run on the calling thread). `ctx` is the value
 * passed as `has_pending_ctx` to wsdb_create. Pass NULL to always report "none
 * pending" — correct for a single-in-flight in-process host.
 */
typedef int (*wsdb_has_pending_fn)(void* ctx);

/*
 * Sink invoked with the response frame when a request completes (possibly from a
 * worker thread). `resp`/`resp_len` are valid only for the duration of the call —
 * copy if retained. `ctx` is the per-call value passed to wsdb_call.
 */
typedef void (*wsdb_respond_fn)(void* ctx, const uint8_t* resp, size_t resp_len);

/*
 * Create an in-process wsdb instance: builds the WorldState and the per-fork
 * scheduler that orders reads/writes, ready to dispatch requests. Config mirrors
 * the aztec-wsdb CLI (the JSON map strings are parsed internally) minus the
 * transport (socket path / ring sizes), which the host owns. `has_pending` (with
 * `has_pending_ctx`) gates the scheduler's inline fast path; pass NULL for a
 * single-in-flight host. Returns NULL on failure.
 */
wsdb_instance_t* wsdb_create(const char* data_dir,
                             const char* tree_heights_json,
                             const char* tree_prefill_json,
                             const char* map_sizes_json,
                             uint32_t threads,
                             uint32_t initial_header_generator_point,
                             const char* prefilled_public_data_json,
                             uint64_t genesis_timestamp,
                             wsdb_has_pending_fn has_pending,
                             void* has_pending_ctx);

/*
 * Dispatch one msgpack-encoded request frame. ASYNC: the frame is decoded and the
 * work scheduled synchronously (so `req` need only live for this call), but
 * `respond` may fire later from a worker thread — reads run concurrently and
 * writes serialize per fork (see WsdbScheduler). `respond_ctx` is passed back to
 * `respond` unchanged. Returns 0 if dispatched, non-zero on a synchronous failure
 * before any response was produced.
 */
int wsdb_call(
    wsdb_instance_t* instance, const uint8_t* req, size_t req_len, void* respond_ctx, wsdb_respond_fn respond);

/*
 * Destroy an instance. Must be called when idle (no in-flight wsdb_call): the
 * caller is responsible for quiescing dispatch (e.g. the socket server closes and
 * drains its reactor) before freeing.
 */
void wsdb_destroy(wsdb_instance_t* instance);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* BB_WSDB_FFI_H */
