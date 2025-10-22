// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/dsl/acir_format/avm2_recursion_constraint.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#ifndef __wasm__
#include "barretenberg/vm2/i_avm_api.hpp"
#include "barretenberg/vm2_stub/avm_loader.hpp"
#endif

namespace acir_format {

/**
 * @brief Add constraints associated with recursive verification of an AVM2 proof using Goblin
 * @details This function delegates to the AVM implementation loaded at runtime.
 * If AVM is not available, this will throw a runtime error.
 *
 * @param builder
 * @param input
 * @param has_valid_witness_assignments
 * @return HonkRecursionConstraintOutput {pairing agg object, ipa claim, ipa proof}
 */
HonkRecursionConstraintOutput<Builder> create_avm2_recursion_constraints_goblin(
    [[maybe_unused]] Builder& builder,
    [[maybe_unused]] const RecursionConstraint& input,
    [[maybe_unused]] bool has_valid_witness_assignments)
{
#ifndef __wasm__
    auto* api = bb::get_or_load_avm_api();
    if (api != nullptr) {
        return api->create_recursion_constraints(builder, input, has_valid_witness_assignments);
    }
    throw_or_abort("AVM is not supported. Please provide libvm2.so/dylib for full AVM support.");
#else
    throw_or_abort("AVM is not supported in WASM builds.");
#endif
}

} // namespace acir_format
