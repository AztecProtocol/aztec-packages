#ifndef BB_AVM_FFI_H
#define BB_AVM_FFI_H

/*
 * Plain-C ABI for running the AVM simulator IN-PROCESS (no bb-avm-sim
 * subprocess). The AVM dispatch + command handlers live in the `avm_sim_ffi`
 * library; the `bb-avm-sim` executable (out-of-process IPC) and any in-process
 * host (e.g. a small NAPI wrapper generated up the stack, pointed at this
 * library) are both thin consumers of this ABI. Barretenberg itself stays free
 * of any Node/NAPI knowledge — this surface is plain C.
 *
 * Handle-based (create/call/destroy) rather than a single global entry so the
 * per-instance context (WSDB + CDB) is explicit and several services can be
 * co-hosted in one process without symbol collisions.
 */

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct avm_instance avm_instance_t;

/*
 * Create an in-process AVM instance. Slice A: world state (WSDB) and contract
 * data (CDB) are still reached as IPC clients over their sockets, so this takes
 * their socket paths and connects (with retry). Returns NULL on failure.
 */
avm_instance_t* avm_create_ipc(const char* wsdb_path, const char* cdb_path);

/*
 * Generic host-call proxy: the in-process AVM invokes this to reach a
 * host-resident service (e.g. TypeScript's contracts DB). `target` selects which
 * service; `req`/`resp` are msgpack frames. `*resp_out` must be a malloc'd buffer
 * the AVM frees. This is the native twin of the wasm `host_call` import — same
 * (target, bytes) contract — so a wasm build routes through the identical shape.
 */
typedef void (*avm_host_call_fn)(
    void* ctx, uint32_t target, const uint8_t* req, size_t req_len, uint8_t** resp_out, size_t* resp_len_out);

/*
 * Create an in-process AVM that reaches world state over a socket (`wsdb_path`)
 * but contract data via the host-call proxy instead of a CDB socket (Slice B:
 * one fewer socket between the in-process AVM and the host). `ctx` is passed
 * back to `host_call` on each invocation (e.g. the host's ThreadSafeFunction
 * handle). Returns NULL on failure.
 */
avm_instance_t* avm_create_hostcall(const char* wsdb_path, avm_host_call_fn host_call, void* ctx);

/*
 * Synchronous world-state byte transport the in-process AVM calls for each wsdb
 * request. `*resp_out` must be a malloc'd buffer the AVM frees. Unlike the CDB
 * host-call (which reaches TS), world state stays C++↔C++: the host implements
 * this by driving the wsdb dispatch directly (e.g. bridging to `wsdb_call` on a
 * co-hosted WorldState), so leaf reads never bounce through JS.
 */
typedef void (*avm_wsdb_call_fn)(
    void* ctx, const uint8_t* req, size_t req_len, uint8_t** resp_out, size_t* resp_len_out);

/*
 * Create an in-process AVM with NO sockets: world state is reached through the
 * `wsdb_call` byte transport (a co-hosted WorldState in the same process) and
 * contract data through the `host_call` proxy. This is the Slice C shape — the
 * AVM and the host share one WorldState with zero child processes. `wsdb_ctx` /
 * `host_ctx` are passed back to their respective callbacks. Returns NULL on
 * failure.
 */
avm_instance_t* avm_create_inprocess(avm_wsdb_call_fn wsdb_call,
                                     void* wsdb_ctx,
                                     avm_host_call_fn host_call,
                                     void* host_ctx);

/*
 * Run one simulation: `request` is a msgpack-encoded AvmSimulate request frame,
 * the response frame is returned via *out / *out_len. On success returns 0 and
 * *out is a malloc'd buffer the caller must free(); on failure returns non-zero
 * and *out is left unset.
 */
int avm_call(avm_instance_t* instance, const uint8_t* request, size_t request_len, uint8_t** out, size_t* out_len);

void avm_destroy(avm_instance_t* instance);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* BB_AVM_FFI_H */
