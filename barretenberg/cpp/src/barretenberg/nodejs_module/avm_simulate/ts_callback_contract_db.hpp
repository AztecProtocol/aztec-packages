#pragma once

#include <memory>
#include <napi.h>
#include <optional>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::nodejs {

/**
 * @brief Implementation of ContractDBInterface that uses NAPI callbacks to TypeScript
 *
 * This class bridges C++ contract data queries to TypeScript's PublicContractsDB.
 * During simulation, when C++ needs contract instances or classes, it calls back
 * to TypeScript through thread-safe NAPI functions.
 *
 * Thread Safety:
 * - Uses Napi::ThreadSafeFunction to safely call TypeScript from C++ worker threads
 * - BlockingCall ensures synchronous execution with the JavaScript event loop
 *
 * Lifecycle:
 * - Thread-safe functions must be released after use to avoid memory leaks
 * - Caller is responsible for releasing TSFNs by calling release()
 */
class TsCallbackContractDB : public avm2::simulation::ContractDBInterface {
  public:
    /**
     * @brief Constructs a callback-based contracts database
     *
     * @param instanceCallback Thread-safe function to fetch contract instances from TypeScript
     *        Expected signature: (address: string) => Promise<Buffer | undefined>
     * @param classCallback Thread-safe function to fetch contract classes from TypeScript
     *        Expected signature: (classId: string) => Promise<Buffer | undefined>
     */
    TsCallbackContractDB(Napi::ThreadSafeFunction instanceCallback, Napi::ThreadSafeFunction classCallback);

    /**
     * @brief Fetches a contract instance by address
     *
     * Calls back to TypeScript to retrieve the contract instance. The TypeScript callback
     * should return a msgpack-serialized ContractInstanceHint buffer, or undefined if not found.
     *
     * @param address The contract address to lookup
     * @return std::optional<ContractInstance> The contract instance if found, nullopt otherwise
     */
    std::optional<bb::avm2::ContractInstance> get_contract_instance(
        const bb::avm2::AztecAddress& address) const override;

    /**
     * @brief Fetches a contract class by class ID
     *
     * Calls back to TypeScript to retrieve the contract class. The TypeScript callback
     * should return a msgpack-serialized ContractClassHint buffer, or undefined if not found.
     *
     * @param class_id The contract class ID to lookup
     * @return std::optional<ContractClass> The contract class if found, nullopt otherwise
     */
    std::optional<bb::avm2::ContractClass> get_contract_class(const bb::avm2::ContractClassId& class_id) const override;

    /**
     * @brief Releases the thread-safe function handles
     *
     * Must be called before destruction to properly clean up NAPI resources.
     * This tells Node.js that the C++ side is done with the callbacks.
     */
    void release();

  private:
    /**
     * @brief Helper to get bytecode commitment for a contract class
     *
     * Currently not implemented via callback - assumes commitment is embedded in ContractClassHint.
     * May be extended in the future if separate bytecode commitment lookups are needed.
     *
     * @param class_id The contract class ID
     * @return FF The bytecode commitment
     */
    bb::avm2::FF get_bytecode_commitment(const bb::avm2::ContractClassId& class_id) const;

    Napi::ThreadSafeFunction contract_instance_callback_;
    Napi::ThreadSafeFunction contract_class_callback_;

    // Track whether TSFNs have been released to avoid double-release
    mutable bool released_ = false;
};

} // namespace bb::nodejs
