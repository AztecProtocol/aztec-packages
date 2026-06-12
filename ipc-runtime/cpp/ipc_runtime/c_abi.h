#ifndef IPC_RUNTIME_C_ABI_H
#define IPC_RUNTIME_C_ABI_H

/*
 * Plain-C ABI for ipc-runtime.
 *
 * Non-C++ consumers (Rust, Zig, ...) bind to this header to use the same
 * UDS + MPSC-SHM transport that C++ services use. Opaque handles wrap
 * the C++ IpcServer / IpcClient objects; functions return status codes
 * instead of exceptions; std::span / std::function become explicit
 * (ptr, len) pairs and free function pointers.
 *
 * Lifetimes:
 *  - `ipc_server_t*` and `ipc_client_t*` are owned. Pass to ipc_server_destroy
 *    / ipc_client_destroy when done; until then the pointer is non-null.
 *  - Bytes returned by ipc_server_receive / ipc_client_receive remain valid
 *    until the matching `_release` call (or transport tear-down). Caller
 *    must NOT free them.
 *  - In ipc_server_run, the response buffer the handler writes to *resp_out
 *    is owned by the handler; the runtime copies it before send and does
 *    NOT free it. Either return a buffer the runtime can memcpy from and
 *    forget, or manage with a static buffer.
 *
 * Threading: all functions are blocking; one caller per handle.
 * ipc_client_connect retries on the calling thread (no internal threads);
 * the only thread the runtime spawns is the macOS parent-death watcher
 * installed by ipc_install_default_signal_handlers.
 */

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* --- Status codes ------------------------------------------------------ */

/* Only the codes the runtime actually produces. IPC_ERR_RECV covers
 * receive timeout and disconnect; a successful zero-length response is
 * IPC_OK with *out_len == 0. */
typedef enum { IPC_OK = 0, IPC_ERR_RECV = -5 } ipc_status_t;

/* --- Options ----------------------------------------------------------- */

typedef struct {
  size_t max_shm_clients;        /* default: 2 */
  size_t shm_request_ring_size;  /* default: 4 MiB */
  size_t shm_response_ring_size; /* default: 4 MiB */
  int socket_backlog;            /* default: 1 */
} ipc_server_options_t;

/* Populate `opts` with the same defaults ipc::ServerOptions{} provides. */
void ipc_server_options_default(ipc_server_options_t *opts);

/* --- Server ------------------------------------------------------------ */

typedef struct ipc_server ipc_server_t;

/* Pick UDS vs MPSC-SHM by suffix. Returns NULL if suffix unrecognised. */
ipc_server_t *ipc_make_server(const char *path,
                              const ipc_server_options_t *opts);

ipc_server_t *ipc_server_create_socket(const char *path, int max_clients);
ipc_server_t *ipc_server_create_mpsc_shm(const char *base_name,
                                         size_t max_clients,
                                         size_t request_ring_size,
                                         size_t response_ring_size);

void ipc_server_destroy(ipc_server_t *server);

bool ipc_server_listen(ipc_server_t *server);
void ipc_server_close(ipc_server_t *server);
void ipc_server_request_shutdown(ipc_server_t *server);

/* Returns client_id ≥ 0, or -1 on timeout/error. */
int ipc_server_wait_for_data(ipc_server_t *server, uint64_t timeout_ns);

/* On success: *out / *out_len reference an internal buffer valid until
 * ipc_server_release(). Returns IPC_OK or a negative status. */
ipc_status_t ipc_server_receive(ipc_server_t *server, int client_id,
                                const uint8_t **out, size_t *out_len);

void ipc_server_release(ipc_server_t *server, int client_id, size_t msg_size);

bool ipc_server_send(ipc_server_t *server, int client_id, const uint8_t *data,
                     size_t len);

/* Convenience event loop. The handler is called for each incoming message;
 * it writes the response into a buffer it owns and stores the pointer +
 * length in *resp_out / *resp_len_out. The runtime copies the response
 * into its send path and does not free the handler's buffer — the handler
 * is responsible (e.g. via a thread-local arena).
 *
 * Every request gets exactly one response; leaving *resp_out unset (or
 * setting *resp_len_out = 0) sends a zero-length response frame. To exit
 * the loop, call ipc_server_request_shutdown() from inside the handler.
 */
typedef void (*ipc_server_handler_fn)(int client_id, const uint8_t *req,
                                      size_t req_len, uint8_t **resp_out,
                                      size_t *resp_len_out, void *ctx);

void ipc_server_run(ipc_server_t *server, ipc_server_handler_fn handler,
                    void *ctx);

/* Install SIGTERM/SIGINT graceful-shutdown + SIGBUS/SIGSEGV close +
 * parent-death monitoring (prctl on linux, kqueue NOTE_EXIT on macOS) wired to
 * `server`. */
void ipc_install_default_signal_handlers(ipc_server_t *server);

/* --- Client ------------------------------------------------------------ */

typedef struct ipc_client ipc_client_t;

ipc_client_t *ipc_make_client(const char *path, size_t shm_client_id);

ipc_client_t *ipc_client_create_socket(const char *socket_path);
ipc_client_t *ipc_client_create_mpsc_shm(const char *base_name,
                                         size_t client_id);

void ipc_client_destroy(ipc_client_t *client);

bool ipc_client_connect(ipc_client_t *client);
void ipc_client_close(ipc_client_t *client);

bool ipc_client_send(ipc_client_t *client, const uint8_t *data, size_t len,
                     uint64_t timeout_ns);

/* On success: IPC_OK with *out / *out_len referencing an internal buffer
 * valid until ipc_client_release(). A zero-length response is IPC_OK with
 * *out_len == 0 (still followed by ipc_client_release(0)). IPC_ERR_RECV
 * means timeout or disconnect. timeout_ns == 0 means infinite. */
ipc_status_t ipc_client_receive(ipc_client_t *client, uint64_t timeout_ns,
                                const uint8_t **out, size_t *out_len);

void ipc_client_release(ipc_client_t *client, size_t msg_size);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* IPC_RUNTIME_C_ABI_H */
