// This file contains helper functions to compare simulation results from different AVM2 C++ simulator runs.
// It is needed as opposed to relying on operator== because some fields (like halting_message) are not compared (since
// they are known to be different)
#include "barretenberg/avm_fuzzer/fuzzer_comparison_helper.hpp"

#include <string>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"

using namespace bb::avm2;

bool compare_call_stack_metadata(const CallStackMetadata& a, const CallStackMetadata& b)
{
    if (a.timestamp != b.timestamp || a.phase != b.phase || a.contract_address != b.contract_address ||
        a.caller_pc != b.caller_pc || a.calldata != b.calldata || a.is_static_call != b.is_static_call ||
        a.gas_limit != b.gas_limit || a.output != b.output || a.reverted != b.reverted ||
        a.internal_call_stack_at_exit != b.internal_call_stack_at_exit || a.num_nested_calls != b.num_nested_calls) {
        return false;
    }
    // Compare nested calls recursively
    if (a.nested.size() != b.nested.size()) {
        return false;
    }
    for (size_t i = 0; i < a.nested.size(); ++i) {
        if (!compare_call_stack_metadata(a.nested[i], b.nested[i])) {
            return false;
        }
    }
    return true;
}

bool compare_call_stack_metadata_vec(const std::vector<CallStackMetadata>& a, const std::vector<CallStackMetadata>& b)
{
    if (a.size() != b.size()) {
        return false;
    }
    for (size_t i = 0; i < a.size(); ++i) {
        if (!compare_call_stack_metadata(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

bool compare_cpp_simulator_results(const std::vector<TxSimulationResult>& results)
{
    BB_ASSERT(results.size() >= 2, "Need at least 2 results to compare");
    BB_ASSERT(std::all_of(results.begin(),
                          results.end(),
                          [](const TxSimulationResult& result) { return result.public_inputs.has_value(); }),
              "All results must have public_inputs to compare");

    for (size_t i = 1; i < results.size(); ++i) {
        const auto& prev = results[i - 1];
        const auto& curr = results[i];

        std::vector<std::string> mismatches;

        // Compare TxSimulationResult fields
        if (prev.gas_used != curr.gas_used) {
            mismatches.push_back("gas_used");
        }
        if (prev.revert_code != curr.revert_code) {
            mismatches.push_back("revert_code");
        }
        if (prev.stats != curr.stats) {
            mismatches.push_back("stats");
        }
        if (prev.public_tx_effect != curr.public_tx_effect) {
            mismatches.push_back("public_tx_effect");
        }
        // call_stack_metadata uses custom comparison that ignores halting_message
        if (!compare_call_stack_metadata_vec(prev.call_stack_metadata, curr.call_stack_metadata)) {
            mismatches.push_back("call_stack_metadata");
        }

        // Compare public_inputs output fields (guaranteed present by assertion)
        const auto& pi_prev = prev.public_inputs.value();
        const auto& pi_curr = curr.public_inputs.value();

        if (pi_prev.end_tree_snapshots != pi_curr.end_tree_snapshots) {
            mismatches.push_back("public_inputs.end_tree_snapshots");
        }
        if (pi_prev.end_gas_used != pi_curr.end_gas_used) {
            mismatches.push_back("public_inputs.end_gas_used");
        }
        if (pi_prev.accumulated_data_array_lengths != pi_curr.accumulated_data_array_lengths) {
            mismatches.push_back("public_inputs.accumulated_data_array_lengths");
        }
        if (pi_prev.accumulated_data != pi_curr.accumulated_data) {
            mismatches.push_back("public_inputs.accumulated_data");
        }
        if (pi_prev.transaction_fee != pi_curr.transaction_fee) {
            mismatches.push_back("public_inputs.transaction_fee");
        }
        if (pi_prev.reverted != pi_curr.reverted) {
            mismatches.push_back("public_inputs.reverted");
        }

        if (!mismatches.empty()) {
            fuzz_info("=== Mismatch between results ", i - 1, " and ", i, " ===");
            for (const auto& field : mismatches) {
                fuzz_info("  MISMATCH in ", field);
            }
            return false;
        }
    }
    return true;
}
