#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/interfaces/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

/**
 * @brief A contract instance manager optimized for fast simulation.
 *
 * This manager caches contract instance lookups to avoid repeated calls to the underlying
 * contract database. Unlike the gadget version, it does not emit events or perform
 * nullifier checks/update validation on each call - these are only needed for trace generation.
 *
 * The caching is safe because:
 * 1. Contract instances don't change during a transaction
 * 2. The underlying contract_db handles any deployed contracts via add_contracts()
 */
class PureContractInstanceManager : public ContractInstanceManagerInterface {
  public:
    PureContractInstanceManager(ContractDBInterface& contract_db)
        : contract_db(contract_db)
    {}

    std::optional<ContractInstance> get_contract_instance(const FF& contract_address) override
    {
        // Check cache first
        auto it = instance_cache.find(contract_address);
        if (it != instance_cache.end()) {
            return it->second;
        }

        // Not in cache - fetch from contract DB
        std::optional<ContractInstance> maybe_instance = contract_db.get_contract_instance(contract_address);

        // Cache the result (including nullopt for non-existent contracts)
        instance_cache[contract_address] = maybe_instance;

        return maybe_instance;
    }

  private:
    ContractDBInterface& contract_db;
    // Cache of contract address -> contract instance (or nullopt if not deployed)
    unordered_flat_map<AztecAddress, std::optional<ContractInstance>> instance_cache;
};

} // namespace bb::avm2::simulation
