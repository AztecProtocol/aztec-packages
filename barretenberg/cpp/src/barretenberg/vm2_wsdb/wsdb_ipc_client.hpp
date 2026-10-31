#pragma once

#include "barretenberg/vm2_wsdb/generated/ipc_codegen/any_backend.hpp"
#include "barretenberg/vm2_wsdb/generated/wsdb_client.hpp"

namespace bb::wsdb {

// The generated wsdb client over whichever backend reaches the world state: ipc-runtime's transport to aztec-wsdb
// in bb-avm-sim (ipc_codegen::IpcBackend), the host's host_call in bb-avm-sim.wasm (ipc_codegen::HostCallBackend).
using WsdbIpcClient = WsdbApi<ipc_codegen::AnyBackend>;

} // namespace bb::wsdb
