#pragma once

#include <cstdint>
#include <random>
#include <tuple>
#include <vector>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/avm_fuzzer/mutations/bytecode.hpp"
#include "barretenberg/avm_fuzzer/mutations/tx_data.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

// A transaction with multiple enqueued calls and tx-level parameters
// Almost identical to the fast simulation input
struct FuzzerTxData {
    // Enqueued calls data
    std::vector<FuzzerData> input_programs;
    // These are the contract classes and instances that will be registered to addresses in the WS
    // The contract addresses may contain duplicates if multiple contracts derive to the same address
    std::vector<ContractClassWithCommitment> contract_classes;
    std::vector<ContractInstance> contract_instances;
    std::vector<AztecAddress> contract_addresses;

    Tx tx; // This tx has placeholders for enqueued calls, they will be filled in during fuzzing
    GlobalVariables global_variables;
    ProtocolContracts protocol_contracts;

    // Public data tree writes to be applied during state setup (e.g., for bytecode upgrades)
    std::vector<bb::crypto::merkle_tree::PublicDataLeafValue> public_data_writes;
    std::vector<FF> note_hashes;

    SERIALIZATION_FIELDS(input_programs,
                         contract_classes,
                         contract_instances,
                         contract_addresses,
                         tx,
                         global_variables,
                         protocol_contracts,
                         public_data_writes,
                         note_hashes);
};

inline std::ostream& operator<<(std::ostream& os, const FuzzerTxData& data)
{
    os << "FuzzerTxData { "
       << "\n  tx: " << data.tx << ","
       << "\n  global_variables: " << data.global_variables << ","
       << "\n  protocol_contracts: " << data.protocol_contracts << "\n}";
    return os;
}

using Bytecode = std::vector<uint8_t>;
using ContractArtifacts = std::tuple<Bytecode, ContractClassWithCommitment, ContractInstance>;
using FuzzerContext = bb::avm2::fuzzer::FuzzerContext;

// Mutation configuration
enum class FuzzerTxDataMutationType : uint8_t {
    TxFuzzerDataMutation,
    TxMutation,
    BytecodeMutation,
    ContractClassMutation,
    ContractInstanceMutation,
    GlobalVariablesMutation,
    ProtocolContractsMutation
};

using FuzzerTxDataMutationConfig = WeightedSelectionConfig<FuzzerTxDataMutationType, 7>;

constexpr FuzzerTxDataMutationConfig FUZZER_TX_DATA_MUTATION_CONFIGURATION = FuzzerTxDataMutationConfig({
    { FuzzerTxDataMutationType::TxFuzzerDataMutation, 20 },
    { FuzzerTxDataMutationType::TxMutation, 10 },
    { FuzzerTxDataMutationType::BytecodeMutation, 1 },
    { FuzzerTxDataMutationType::ContractClassMutation, 1 },
    { FuzzerTxDataMutationType::ContractInstanceMutation, 1 },
    { FuzzerTxDataMutationType::GlobalVariablesMutation, 4 },
    { FuzzerTxDataMutationType::ProtocolContractsMutation, 4 },
});

constexpr FuzzerTxDataMutationConfig FUZZER_TX_DATA_MUTATION_CONFIGURATION_WITHOUT_BYTECODE_MUTATION =
    FuzzerTxDataMutationConfig({
        { FuzzerTxDataMutationType::TxFuzzerDataMutation, 50 },
        { FuzzerTxDataMutationType::TxMutation, 0 },
        { FuzzerTxDataMutationType::BytecodeMutation, 0 },
        { FuzzerTxDataMutationType::ContractClassMutation, 0 },
        { FuzzerTxDataMutationType::ContractInstanceMutation, 0 },
        { FuzzerTxDataMutationType::GlobalVariablesMutation, 0 },
        { FuzzerTxDataMutationType::ProtocolContractsMutation, 0 },
    });

// Build bytecode and contract artifacts from fuzzer data
ContractArtifacts build_bytecode_and_artifacts(FuzzerData& fuzzer_data);

// Create a default FuzzerTxData with sensible defaults
FuzzerTxData create_default_tx_data(std::mt19937_64& rng, FuzzerContext& context);
FuzzerTxData create_default_tx_data(FuzzerContext& context);

// Setup fuzzer state: register contracts and addresses in the world state
void setup_fuzzer_state(bb::avm2::fuzzer::FuzzerWorldStateManager& ws_mgr,
                        bb::avm2::fuzzer::FuzzerContractDB& contract_db,
                        const FuzzerTxData& tx_data);

// Fund the fee payer with enough balance for the transaction
void fund_fee_payer(bb::avm2::fuzzer::FuzzerWorldStateManager& ws_mgr, const Tx& tx);

// Run the C++ simulator on a full transaction with multiple enqueued calls
SimulatorResult fuzz_tx(bb::avm2::fuzzer::FuzzerWorldStateManager& ws_mgr,
                        bb::avm2::fuzzer::FuzzerContractDB& contract_db,
                        FuzzerTxData& tx_data);

// Run the prover fuzzer: fast simulation, hint collection, comparison, check_circuit, prove, and verify
// Returns simulation result on success, throws if the input should be rejected
TxSimulationResult fuzz_prover(bb::avm2::fuzzer::FuzzerWorldStateManager& ws_mgr,
                               bb::avm2::fuzzer::FuzzerContractDB& contract_db,
                               FuzzerTxData& tx_data);

// Run the prover fuzzer with fault injection: generate proving inputs, generate events, mutate events, fill
// trace, check circuit. If mutated events pass check_circuit, throw an exception.
void fuzz_prover_with_fault_injection(bb::avm2::fuzzer::FuzzerWorldStateManager& ws_mgr,
                                      bb::avm2::fuzzer::FuzzerContractDB& contract_db,
                                      FuzzerTxData& tx_data);

// Common custom mutator logic shared between fuzzers
// Returns the new size of the mutated data, or 0 if mutation failed
size_t mutate_tx_data(FuzzerContext& context,
                      uint8_t* serialized_fuzzer_data,
                      size_t serialized_fuzzer_data_size,
                      size_t max_size,
                      unsigned int seed,
                      FuzzerTxDataMutationConfig mutation_config = FUZZER_TX_DATA_MUTATION_CONFIGURATION);

void populate_context_from_tx_data(FuzzerContext& context, const FuzzerTxData& tx_data);

bool compare_cpp_simulator_results(const std::vector<TxSimulationResult>& results);
