#pragma once
/**
 * @file wsdb_ffi_service.hpp
 * @brief Opening and closing the in-process aztec-wsdb behind its generated FFI entry (wsdb_labs_ipc_ffi_entry).
 */
#include "wsdb/generated/wsdb_ffi.hpp"

/**
 * Opens the in-process wsdb. args are the `aztec-wsdb msgpack run` options other than the transport ones
 * (e.g. "-d", "<dir>", "--tree-heights", "{0:42,...}", "-t", "4"). Returns 0 on success; prints and returns non-zero
 * on bad options or if it is already open.
 */
IPC_FFI_EXPORT int wsdb_labs_ffi_open(int argc, const char* const* args);

/** Closes the in-process wsdb, waiting for in-flight work. */
IPC_FFI_EXPORT void wsdb_labs_ffi_close();
