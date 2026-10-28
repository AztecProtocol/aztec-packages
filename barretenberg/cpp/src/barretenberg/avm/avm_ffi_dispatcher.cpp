/**
 * @file avm_ffi_dispatcher.cpp
 * @brief Names the context the AVM handlers run over in the in-process FFI entry (avm_ipc_ffi_entry), the entry
 * bb-avm-sim.wasm exports.
 *
 * The in-process build has no sockets, so Simulate reaches the world state and the contract DB through its host:
 * the `ipc_runtime.host_call` import, with the targets "wsdb" and "cdb" (ipc-runtime's `hostCall` option binds them).
 * SimulateWithHints reads neither: its hints answer every read.
 */
#include "barretenberg/avm/avm_simulate.hpp"
#include "barretenberg/avm/avm_simulate_with_hints.hpp"
#include "barretenberg/avm/generated/avm_ffi.hpp"
#include "barretenberg/vm2_wsdb/generated/ipc_codegen/host_call_backend.hpp"

namespace bb::avm {

namespace {
/** The host's world state and contract DB, bound once: a HostCallBackend holds only its target's name. */
struct AvmFfiRequest {
    wsdb::WsdbIpcClient wsdb{ ipc_codegen::AnyBackend(ipc_codegen::HostCallBackend("wsdb")) };
    cdb::CdbIpcContractDB cdb{ ipc_codegen::AnyBackend(ipc_codegen::HostCallBackend("cdb")) };
};
} // namespace

template <>
void handle_simulate(AvmFfiRequest& request, wire::AvmSimulate&& command, Responder<wire::AvmSimulateResponse> respond)
{
    respond.ok(wire::AvmSimulateResponse{ .result = simulate(request.cdb, request.wsdb, command.inputs) });
}

template <>
void handle_simulate_with_hints(AvmFfiRequest& /*request*/,
                                wire::AvmSimulateWithHints&& command,
                                Responder<wire::AvmSimulateWithHintsResponse> respond)
{
    respond.ok(wire::AvmSimulateWithHintsResponse{ .result = simulate_with_hints(command.inputs) });
}

/**
 * @brief An instance behind the generated in-process FFI entry (see avm_ffi.hpp). The context holds no state of its
 * own, only the targets its host calls reach.
 */
std::unique_ptr<FfiInstance> ipc_ffi_create_instance()
{
    return std::make_unique<FfiContext<AvmFfiRequest>>();
}

} // namespace bb::avm
