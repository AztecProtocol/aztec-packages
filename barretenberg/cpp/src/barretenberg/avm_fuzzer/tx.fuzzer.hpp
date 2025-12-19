#pragma once

#include <cstdint>
#include <random>
#include <tuple>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

// A transaction with multiple enqueued calls and tx-level parameters
// Almost identical to the fast simulation input
struct FuzzerTxData {
    // Enqueued calls data
    std::vector<FuzzerData> input_programs;
    // These are the contract classes and instances that will be registered to addresses in the WS
    std::vector<ContractClass> contract_classes;
    std::vector<ContractInstance> contract_instances;
    std::vector<AztecAddress> contract_addresses;

    Tx tx; // This tx has placeholders for enqueued calls, they will be filled in during fuzzing
    GlobalVariables global_variables;
    ProtocolContracts protocol_contracts;

    MSGPACK_FIELDS(input_programs,
                   contract_classes,
                   contract_instances,
                   contract_addresses,
                   tx,
                   global_variables,
                   protocol_contracts);
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
using ContractArtifacts = std::tuple<Bytecode, ContractClass, ContractInstance>;

// Mutation configuration
enum class TxDataMutationType : uint8_t {
    TxMutation,
    // todo: implement other mutation types
    // BytecodeMutation,
    // ContractClassMutation,
    // ContractInstanceMutation,
    // GlobalVariablesMutation,
    // ProtocolContractsMutation
};

// Build bytecode and contract artifacts from fuzzer data
ContractArtifacts build_bytecode_and_artifacts(FuzzerData& fuzzer_data);

// Create a default FuzzerTxData with sensible defaults
FuzzerTxData create_default_tx_data();

// Run the differential fuzzer comparing CPP vs JS simulator
SimulatorResult fuzz_tx(FuzzerTxData& tx_data);

// Common custom mutator logic shared between fuzzers
// Returns the new size of the mutated data, or 0 if mutation failed
size_t mutate_tx_data(uint8_t* serialized_fuzzer_data,
                      size_t serialized_fuzzer_data_size,
                      size_t max_size,
                      unsigned int seed);
