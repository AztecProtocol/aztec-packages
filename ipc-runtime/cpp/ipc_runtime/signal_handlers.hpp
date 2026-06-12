#pragma once
/**
 * @file signal_handlers.hpp
 * @brief Default lifecycle signal handlers for IPC servers.
 *
 * Wires:
 *   - SIGTERM / SIGINT → IpcServer::request_shutdown_from_signal()
 *     (graceful drain; the run() loop exits on its next poll iteration)
 *   - SIGBUS / SIGSEGV → best-effort unlink of the server's socket/SHM
 *     files (cached at install time) + _Exit(128 + sig)
 *   - Parent-process death watch via prctl(PR_SET_PDEATHSIG) on Linux
 *     and a kqueue NOTE_EXIT watcher on macOS — so spawn-and-forget
 *     services die with their parent rather than turning into orphans.
 *
 * The reference is stored in a file-scope static, so this is a singleton:
 * exactly one IpcServer can be "registered" for the process. Calling
 * install_default_signal_handlers() a second time replaces the previous
 * registration.
 */

#include "ipc_runtime/ipc_server.hpp"

namespace ipc {

/**
 * @brief Install default lifecycle signal handlers + parent-death monitor.
 *
 * @param server Server instance the handlers control. Must outlive the
 *               handlers (i.e. live until normal exit). Re-calling
 *               replaces the registered server.
 */
void install_default_signal_handlers(IpcServer &server);

} // namespace ipc
