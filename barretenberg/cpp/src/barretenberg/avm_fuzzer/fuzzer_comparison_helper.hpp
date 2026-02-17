#pragma once

#include <vector>

#include "barretenberg/vm2/common/avm_io.hpp"

using namespace bb::avm2;

// Compare CallStackMetadata ignoring halting_message (recursive for nested calls)
bool compare_call_stack_metadata(const CallStackMetadata& a, const CallStackMetadata& b);

// Compare vectors of CallStackMetadata ignoring halting_message
bool compare_call_stack_metadata_vec(const std::vector<CallStackMetadata>& a, const std::vector<CallStackMetadata>& b);

// Compare TxSimulationResult objects and report mismatches
// Ignores halting_message in call_stack_metadata
// Returns true if all results match, false otherwise
bool compare_cpp_simulator_results(const std::vector<TxSimulationResult>& results);
