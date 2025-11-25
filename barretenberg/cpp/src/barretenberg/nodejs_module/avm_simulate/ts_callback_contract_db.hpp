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
     * @param addContractsCallback Thread-safe function to add contracts
     *        Expected signature: (contractDeploymentData: Buffer) => Promise<void>
     * @param bytecodeCommitmentCallback Thread-safe function to fetch bytecode commitments
     *        Expected signature: (classId: string) => Promise<Buffer | undefined>
     * @param debugNameCallback Thread-safe function to fetch debug function names
     *        Expected signature: (address: string, selector: string) => Promise<string | undefined>
     * @param createCheckpointCallback Thread-safe function to create a checkpoint
     *        Expected signature: () => Promise<void>
     * @param commitCheckpointCallback Thread-safe function to commit a checkpoint
     *        Expected signature: () => Promise<void>
     * @param revertCheckpointCallback Thread-safe function to revert a checkpoint
     *        Expected signature: () => Promise<void>
     */
    TsCallbackContractDB(Napi::ThreadSafeFunction instanceCallback,
                         Napi::ThreadSafeFunction classCallback,
                         Napi::ThreadSafeFunction addContractsCallback,
                         Napi::ThreadSafeFunction bytecodeCommitmentCallback,
                         Napi::ThreadSafeFunction debugNameCallback,
                         Napi::ThreadSafeFunction createCheckpointCallback,
                         Napi::ThreadSafeFunction commitCheckpointCallback,
                         Napi::ThreadSafeFunction revertCheckpointCallback);

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
     * @brief Adds contracts from deployment data
     *
     * @param contract_deployment_data The contract deployment data
     */
    void add_contracts(const bb::avm2::ContractDeploymentData& contract_deployment_data) override;

    /**
     * @brief Fetches bytecode commitment for a contract class
     *
     * @param class_id The contract class ID
     * @return std::optional<FF> The bytecode commitment if found, nullopt otherwise
     */
    std::optional<bb::avm2::FF> get_bytecode_commitment(const bb::avm2::ContractClassId& class_id) const override;

    /**
     * @brief Fetches debug function name for a contract function
     *
     * @param address The contract address
     * @param selector The function selector
     * @return std::optional<std::string> The function name if found, nullopt otherwise
     */
    std::optional<std::string> get_debug_function_name(const bb::avm2::AztecAddress& address,
                                                       const bb::avm2::FF& selector) const override;

    /**
     * @brief Creates a new checkpoint
     *
     * Creates a checkpoint in the TypeScript contracts DB, enabling rollbacks to current state.
     */
    void create_checkpoint() override;

    /**
     * @brief Commits the current checkpoint
     *
     * Accepts the current checkpoint's state as latest.
     */
    void commit_checkpoint() override;

    /**
     * @brief Reverts the current checkpoint
     *
     * Discards the current checkpoint's state and rolls back to the previous checkpoint.
     */
    void revert_checkpoint() override;

    /**
     * @brief Releases the thread-safe function handles
     *
     * Must be called before destruction to properly clean up NAPI resources.
     * This tells Node.js that the C++ side is done with the callbacks.
     */
    void release();

  private:
    Napi::ThreadSafeFunction contract_instance_callback_;
    Napi::ThreadSafeFunction contract_class_callback_;
    Napi::ThreadSafeFunction add_contracts_callback_;
    Napi::ThreadSafeFunction bytecode_commitment_callback_;
    Napi::ThreadSafeFunction debug_name_callback_;
    Napi::ThreadSafeFunction create_checkpoint_callback_;
    Napi::ThreadSafeFunction commit_checkpoint_callback_;
    Napi::ThreadSafeFunction revert_checkpoint_callback_;

    // Track whether TSFNs have been released to avoid double-release
    mutable bool released_ = false;
};

} // namespace bb::nodejs
