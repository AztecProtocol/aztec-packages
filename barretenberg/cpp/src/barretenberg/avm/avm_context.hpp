#pragma once
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"

namespace bb::avm {
struct AvmContext {
    cdb::CdbIpcContractDB& cdb_client;
    wsdb::WsdbIpcClient& wsdb_client;
};
} // namespace bb::avm
