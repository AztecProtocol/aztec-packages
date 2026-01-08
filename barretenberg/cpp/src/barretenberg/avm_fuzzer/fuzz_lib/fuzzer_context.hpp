/// FuzzerContext holds environment data for fuzzer instruction generation and contract management.
/// Top-level fuzzers create and modify this context, but it's passed as const& to
/// instruction generation functions (read-only access during generation).

#pragma once

#include <memory>
#include <vector>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::fuzzer {

class FuzzerContext {
  public:
    FuzzerContext();
    ~FuzzerContext();

    // Disable copy (owns FuzzerContractDB)
    FuzzerContext(const FuzzerContext&) = delete;
    FuzzerContext& operator=(const FuzzerContext&) = delete;

    // Enable move
    FuzzerContext(FuzzerContext&& other) noexcept;
    FuzzerContext& operator=(FuzzerContext&& other) noexcept;

    // ---- Mutable API (for top-level fuzzers) ----

    /// @brief Register a contract from its bytecode
    /// @param bytecode The bytecode of the contract
    /// @return The address of the registered contract
    /// @note This function will also register the contract address in the world state
    FF register_contract_from_bytecode(const std::vector<uint8_t>& bytecode);

    /// @brief Add a contract address to the context (without registering a contract)
    void add_contract_address(FF address) { contract_addresses_.push_back(address); }

    /// @brief Clear all contract addresses and reset the contract DB
    void reset();

    // ---- Const API (for instruction generation, passed as const&) ----

    /// @brief Get a contract address by index (wraps around using modulo)
    /// @return The contract address, or FF::zero() if no contracts registered
    FF get_contract_address(size_t index) const
    {
        if (contract_addresses_.empty()) {
            return FF::zero();
        }
        return contract_addresses_[index % contract_addresses_.size()];
    }

    /// @brief Check if any contracts are registered
    bool has_contracts() const { return !contract_addresses_.empty(); }

    /// @brief Get the number of registered contracts
    size_t contract_count() const { return contract_addresses_.size(); }

    /// @brief Get the contract database for simulation
    FuzzerContractDB& get_contract_db() const { return *contract_db_; }

  private:
    std::vector<FF> contract_addresses_;
    std::unique_ptr<FuzzerContractDB> contract_db_;
};

} // namespace bb::avm2::fuzzer
