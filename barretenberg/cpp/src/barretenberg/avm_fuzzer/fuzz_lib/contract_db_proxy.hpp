/// Singleton proxy class for FuzzerContractDB
#pragma once

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::fuzzer {

class ContractDBProxy {
  private:
    static ContractDBProxy* instance;
    ContractDBProxy();

    FuzzerContractDB* contract_db;
    std::vector<FF> registered_contract_addresses;

  public:
    static ContractDBProxy* get_instance();

    /// @brief Register a contract from its bytecode
    /// @param bytecode The bytecode of the contract
    /// @return The address of the registered contract
    /// @note This function will also register the contract address in the world state
    /// Adds the contract address to the registered_contract_addresses vector
    static FF register_contract_from_bytecode(const std::vector<uint8_t>& bytecode);

    static void reset_instance();

    FuzzerContractDB* get_contract_db() const { return contract_db; }

    /// @brief Get the address of a function by index
    /// @return registered_contract_addresses[index % (registered_contract_addresses.size())]
    FF get_function_address(size_t index);
};
} // namespace bb::avm2::fuzzer
