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
    uint32_t target, const uint8_t* req, size_t req_len, uint8_t** resp_out, size_t* resp_len_out);

/*
 * Create an in-process AVM that reaches world state over a socket (`wsdb_path`)
 * but contract data via the host-call proxy instead of a CDB socket (Slice B:
 * one fewer socket between the in-process AVM and the host). Returns NULL on
 * failure.
 */
avm_instance_t* avm_create_hostcall(const char* wsdb_path, avm_host_call_fn host_call);

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
