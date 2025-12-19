#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

/// @brief fuzz CPP vs JS simulator with the given fuzzer data
/// @param fuzzer_data the fuzzer data to use for fuzzing
/// @returns the simulator result if the results are the same
/// @throws an exception if the simulator results are different
SimulatorResult fuzz_against_ts_simulator(FuzzerData& fuzzer_data);

// Helper functions to create default contract class, instance, and tx
ContractClass create_default_class(const std::vector<uint8_t>& bytecode);
ContractInstance create_default_instance(const ContractClassId& class_id);
AztecAddress compute_contract_address(const ContractInstance& instance);
Tx create_default_tx(const AztecAddress& contract_address,
                     const AztecAddress& sender_address,
                     const std::vector<FF>& calldata,
                     const FF& transaction_fee,
                     bool is_static_call,
                     const Gas& gas_limit);
