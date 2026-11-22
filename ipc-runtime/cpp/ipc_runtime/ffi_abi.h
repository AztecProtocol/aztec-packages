#pragma once
/**
 * @file ffi_abi.h
 * @brief The in-process FFI of an ipc-codegen service: the one definition of its C contract.
 *
 * A service generated with --ffi exports these functions as `<ffi>_ipc_ffi_<name>`, where <ffi>
 * is its FFI name, so several services link into one binary. Every host that loads a service in
 * process (ipc-runtime's Node-API addon, the React Native JSI binding, ipc::serve_async, a wasm
 * worker) calls them through these types. Rust (ipc_runtime::async_host and the export_*_ffi!
 * macro), Zig (exportFfi) and TypeScript (the wasm host) implement or call the same contract and
 * must follow this file.
 *
 * Messages are msgpack command and response payloads, without a transport's length/id envelope.
 * Buffers handed across in either direction come from the library's own `alloc` and are released
 * with its `free` (malloc/free-compatible).
 *
 * Status codes (`deliver`, a host-call function): 0 means the bytes are the target service's
 * response (its error response included); anything else means the call never reached the
 * service, and the bytes are a message saying why.
 */

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* --- Synchronous instances --------------------------------------------- */

/* create(): a fresh instance, or NULL if the service failed to make one. */
typedef void* (*ipc_ffi_create_fn)(void);
/* call(): runs one command on `instance` and leaves the response in *output (from alloc). Returns
 * once the service has answered, which may be later and from another thread. Calls on one
 * instance do not overlap unless the service takes calls from many threads at once. */
typedef void (*ipc_ffi_call_fn)(
    void* instance, const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
typedef void (*ipc_ffi_destroy_fn)(void* instance);
typedef void* (*ipc_ffi_alloc_fn)(size_t size);
typedef void (*ipc_ffi_free_fn)(void* ptr);

/* A host-call function: sends `request` to the service the host binds to `target` and leaves its
 * answer in *response (from the calling library's alloc). Returns a status code, as above. Also
 * the contract of the `ipc_runtime.host_call` wasm import. */
typedef int32_t (*ipc_ffi_host_call_fn)(const uint8_t* target,
                                        size_t target_len,
                                        const uint8_t* request,
                                        size_t request_len,
                                        uint8_t** response,
                                        size_t* response_len);
/* set_host_call(): where a native library's host calls go. Until one is set, host calls fail.
 * Exported only by a library with host calls. */
typedef void (*ipc_ffi_set_host_call_fn)(ipc_ffi_host_call_fn host_call);

/* --- Asynchronous instances -------------------------------------------- */
/* A library has all four of create_async, submit, deliver and destroy_async, or none. Everything
 * on one instance runs on the thread that calls into it: its callbacks are called from inside
 * submit and deliver, or (for a service whose handlers answer from other threads) from any thread. */

/* Answers request `request_id` with `response`, which is valid only during the callback. Called
 * exactly once per submitted request. */
typedef void (*ipc_async_respond_fn)(void* host_ctx, uint64_t request_id, const uint8_t* response, size_t len);
/* Asks the host to send `request` to the service bound to `target`; the host answers later with
 * deliver(call_id, ...). Both buffers are valid only during the callback. */
typedef void (*ipc_async_call_fn)(void* host_ctx,
                                  uint64_t call_id,
                                  const uint8_t* target,
                                  size_t target_len,
                                  const uint8_t* request,
                                  size_t request_len);

/* create_async(): a fresh instance that answers through `respond` and calls out through `call`,
 * each passed `host_ctx`; NULL if the service failed to make one. */
typedef void* (*ipc_ffi_create_async_fn)(void* host_ctx, ipc_async_respond_fn respond, ipc_async_call_fn call);
/* submit(): hands the instance request `request_id`. It answers through respond, now or later. */
typedef void (*ipc_ffi_submit_fn)(void* instance, uint64_t request_id, const uint8_t* input, size_t input_len);
/* deliver(): the host's answer to call `call_id`, with a status code as above. */
typedef void (*ipc_ffi_deliver_fn)(
    void* instance, uint64_t call_id, int32_t status, const uint8_t* response, size_t response_len);

/* One service's asynchronous instances, as ipc_server_serve_async takes them. `destroy` is the
 * library's destroy_async. */
typedef struct {
    ipc_ffi_create_async_fn create;
    ipc_ffi_submit_fn submit;
    ipc_ffi_deliver_fn deliver;
    ipc_ffi_destroy_fn destroy;
} ipc_async_service_t;

#ifdef __cplusplus
} /* extern "C" */
#endif
