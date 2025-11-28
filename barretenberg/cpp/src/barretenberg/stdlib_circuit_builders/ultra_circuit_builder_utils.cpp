#include "./circuit_builder_base_utils.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/honk/execution_trace/ultra_execution_trace.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <unordered_set>

namespace bb {

template <typename CircuitBuilder>
std::unordered_set<uint32_t> get_real_variable_indices_set(const CircuitBuilder& builder)
{
    return std::unordered_set<uint32_t>(builder.real_variable_index.cbegin(), builder.real_variable_index.cend());
}

template <typename CircuitBuilder>
std::unordered_set<uint32_t> get_difference_real_variable_indices_states(const std::unordered_set<uint32_t>& fst_state, const CircuitBuilder& builder)
{
    std::unordered_set<uint32_t> diff;
    for (const auto& elem : builder.real_variable_index) {
        if (fst_state.find(elem) == fst_state.end()) {
            diff.emplace(elem);
        }
    }
    return diff;
}

// Explicit template instantiations
template std::unordered_set<uint32_t> get_real_variable_indices_set<UltraCircuitBuilder_<UltraExecutionTraceBlocks>>(
    const UltraCircuitBuilder_<UltraExecutionTraceBlocks>&);
template std::unordered_set<uint32_t> get_difference_real_variable_indices_states<UltraCircuitBuilder_<UltraExecutionTraceBlocks>>(
    const std::unordered_set<uint32_t>&, const UltraCircuitBuilder_<UltraExecutionTraceBlocks>&);
template std::unordered_set<uint32_t> get_real_variable_indices_set<MegaCircuitBuilder_<bb::fr>>(
    const MegaCircuitBuilder_<bb::fr>&);
template std::unordered_set<uint32_t> get_difference_real_variable_indices_states<MegaCircuitBuilder_<bb::fr>>(
    const std::unordered_set<uint32_t>&, const MegaCircuitBuilder_<bb::fr>&);
} // namespace bb
