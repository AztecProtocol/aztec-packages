#pragma once
/**
 * @brief ContractDBInterface backed by the generic host-call reverse channel.
 *
 * The in-process AVM asks the host (TypeScript) for contract data by invoking a
 * `host_call(target, bytes)` proxy instead of talking to a CDB socket. It speaks
 * the exact same CDB wire protocol as CdbIpcContractDB (same generated command
 * types, same [[name, payload]] framing) — only the transport differs. `target`
 * is fixed to the CDB service; the host routes it to the CDB handler.
 *
 * This is the native limb of the same mechanism the wasm build uses: the wasm
 * `host_call` import and this native function pointer share the (target, bytes)
 * contract, so the host-side router is identical for both.
 */

#include "barretenberg/avm/avm_ffi.h"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

#include <cstdint>
#include <optional>
#include <string>

namespace bb::avm {

class HostCallContractDB final : public avm2::simulation::ContractDBInterface {
  public:
    explicit HostCallContractDB(avm_host_call_fn host_call);
    ~HostCallContractDB() override;

    /** Set the fork ID stamped on CDB requests so the host routes them to the right PublicContractsDB. */
    void set_fork_id(uint64_t fork_id) { fork_id_ = fork_id; }

    std::optional<avm2::ContractInstance> get_contract_instance(const avm2::AztecAddress& address) const override;
    std::optional<avm2::ContractClass> get_contract_class(const avm2::ContractClassId& class_id) const override;
    std::optional<avm2::FF> get_bytecode_commitment(const avm2::ContractClassId& class_id) const override;
    std::optional<std::string> get_debug_function_name(const avm2::AztecAddress& address,
                                                       const avm2::FunctionSelector& selector) const override;

    void add_contracts(const avm2::ContractDeploymentData& contract_deployment_data) override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

  private:
    template <typename Cmd, typename Resp> Resp send(Cmd&& cmd) const;

    avm_host_call_fn host_call_;
    uint64_t fork_id_ = 0;
};

} // namespace bb::avm
