#pragma once
/**
 * @file cdb_execute.hpp
 * @brief CDB is a TypeScript server — no C++ request context needed.
 *        This header exists for consistency with other services.
 */

namespace bb::cdb {
// CDB commands are executed by the TypeScript server.
// The C++ side only uses the generated IPC client (cdb_ipc_client_gen.hpp).
} // namespace bb::cdb
