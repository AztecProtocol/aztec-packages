#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

/// @brief fuzz CPP vs JS simulator with the given fuzzer data
/// @param fuzzer_data the fuzzer data to use for fuzzing
/// @param context the fuzzer context for contract management
/// @returns the simulator result if the results are the same
/// @throws an exception if the simulator results are different
SimulatorResult fuzz_against_ts_simulator(FuzzerData& fuzzer_data, bb::avm2::fuzzer::FuzzerContext& context);
