#pragma once

#include "barretenberg/vm2_wsdb/generated/ipc_codegen/ipc_backend.hpp"
#include "barretenberg/vm2_wsdb/generated/wsdb_client.hpp"

namespace bb::wsdb {

// The generated wsdb client over ipc-runtime's transport (aztec-wsdb runs as its own process).
using WsdbIpcClient = WsdbApi<ipc_codegen::IpcBackend>;

} // namespace bb::wsdb
