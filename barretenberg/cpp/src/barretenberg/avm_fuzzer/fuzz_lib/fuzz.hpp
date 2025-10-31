#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

/// @brief fuzz CPP vs JS simulator with the given fuzzer data
/// @param fuzzer_data the fuzzer data to use for fuzzing
/// @returns the simulator result if the results are the same
/// @throws an exception if the simulator results are different
SimulatorResult fuzz(FuzzerData& fuzzer_data);
