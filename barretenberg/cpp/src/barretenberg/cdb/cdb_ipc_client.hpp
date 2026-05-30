#pragma once
/**
 * @brief ContractDBInterface adapter over the generated CDB IPC client.
 *
 * Translates ContractDBInterface calls (AVM domain types) into
 * CdbIpcClient command structs, delegating IPC transport to the
 * auto-generated client.
 */

#include "barretenberg/cdb/generated/cdb_ipc_client.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

#include <memory>
#include <string>

namespace bb::cdb {

class CdbIpcContractDB final : public avm2::simulation::ContractDBInterface {
  public:
    explicit CdbIpcContractDB(const std::string& socket_path);
    ~CdbIpcContractDB() override;

    /** Set the fork ID used to route CDB requests to the correct PublicContractsDB. */
    void set_fork_id(uint64_t fork_id) { fork_id_ = fork_id; }
    uint64_t get_fork_id() const { return fork_id_; }

    // ContractDBInterface implementation
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
    std::unique_ptr<CdbIpcClient> client_;
    uint64_t fork_id_ = 0;
};

} // namespace bb::cdb
