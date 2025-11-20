#include "./graph_description_acir.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <unordered_map>
#include <unordered_set>

using namespace acir_format;
using namespace bb;
namespace cdg {

template <typename FF, typename CircuitBuilder>
StaticAnalyzerAcir_<FF, CircuitBuilder>::StaticAnalyzerAcir_(std::vector<uint8_t>& acir_program_buf)
    : constraint_system(program_buf_to_acir_format(std::move(acir_program_buf)).at(0))
    , program(constraint_system)
    , builder(create_circuit(program))
    , analyzer(builder)
{}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::is_inverse_gate(size_t block_idx, size_t gate_idx)
{
    auto& block = builder.blocks.get()[block_idx];
    auto q_m = block.q_m()[gate_idx];
    auto q_c = block.q_c()[gate_idx];
    auto q_arith = block.q_arith()[gate_idx];
    auto q_1 = block.q_1()[gate_idx];
    auto q_2 = block.q_2()[gate_idx];
    auto q_3 = block.q_3()[gate_idx];
    auto q_4 = block.q_4()[gate_idx];
    return (q_m == FF::one() && q_c == FF(-1) && q_arith == FF(1) && q_1 == FF::zero() && q_2 == FF::zero() &&
            q_3 == FF::zero() && q_4 == FF::zero());
}

template <typename FF, typename CircuitBuilder>
void StaticAnalyzerAcir_<FF, CircuitBuilder>::filter_false_positives(
    std::unordered_set<uint32_t>& variables_in_one_gate)
{
    for (auto it = variables_in_one_gate.begin(); it != variables_in_one_gate.end();) {
        std::unordered_map<std::size_t, std::vector<std::size_t>> var_gates = analyzer.get_variable_gates(*it);
        BB_ASSERT(var_gates.size() == 1 && var_gates.begin()->second.size() == 1);
        if (is_inverse_gate(var_gates.begin()->first, var_gates.begin()->second[0])) {
            it = variables_in_one_gate.erase(it);
        } else {
            ++it;
        }
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_set<uint32_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::get_unconstrained_variables()
{
    std::unordered_set<uint32_t> unconstrained_vars;
    const auto& variable_gate_count = analyzer.get_variable_gate_count();
    for (const auto& elem : constraint_system.constrained_witness) {
        if (variable_gate_count.find(elem) == variable_gate_count.end()) {
            unconstrained_vars.insert(elem);
        } else {
            if (variable_gate_count.at(elem) == 0) {
                unconstrained_vars.insert(elem);
            }
        }
    }
    return unconstrained_vars;
}

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::process_constraint_system()
{
    auto connected_components = analyzer.find_connected_components();
    return;
}

template <typename FF, typename CircuitBuilder>
void StaticAnalyzerAcir_<FF, CircuitBuilder>::process_logic_constraints()
{
    for (size_t i = 0; i < constraint_system.logic_constraints.size(); i++) {
        [[maybe_unused]] const auto& constraint = constraint_system.logic_constraints.at(i);
        // in this case we use invariant that variable res from create_logic_gate function was appended in the
        // logic_witnesses after logic constrait were processed. So, we can use the same index as index of logic
        // constraint
        return;
    }
}

template <typename FF, typename CircuitBuilder>
void StaticAnalyzerAcir_<FF, CircuitBuilder>::process_aes128_constraints()
{
    // First, find all connected components
    auto connected_components = analyzer.find_connected_components();

    // Build a map from witness index to connected component index
    // This leverages the single-component invariant for O(1) lookups
    std::unordered_map<uint32_t, size_t> witness_to_cc;
    for (size_t cc_idx = 0; cc_idx < connected_components.size(); cc_idx++) {
        for (uint32_t var_idx : connected_components[cc_idx].vars()) {
            witness_to_cc[var_idx] = cc_idx;
        }
    }

    // Process each AES128 constraint
    for (size_t i = 0; i < constraint_system.aes128_constraints.size(); i++) {
        const auto& constraint = constraint_system.aes128_constraints[i];

        std::vector<uint32_t> constraint_witnesses;

        for (const auto& input : constraint.inputs) {
            if (!input.is_constant) {
                constraint_witnesses.push_back(input.index);
            }
        }

        for (const auto& iv_elem : constraint.iv) {
            if (!iv_elem.is_constant) {
                constraint_witnesses.push_back(iv_elem.index);
            }
        }

        for (const auto& key_elem : constraint.key) {
            if (!key_elem.is_constant) {
                constraint_witnesses.push_back(key_elem.index);
            }
        }

        for (uint32_t output_idx : constraint.outputs) {
            constraint_witnesses.push_back(output_idx);
        }

        // Leverage single-component invariant: find CC using any witness
        // All witnesses from this constraint belong to the same CC
        if (!constraint_witnesses.empty()) {
            // Convert to real indices for lookup
            uint32_t real_idx = analyzer.to_real(constraint_witnesses[0])

                                    auto it = witness_to_cc.find(real_idx);
            if (it != witness_to_cc.end()) {
                // Found the connected component - store its variables
                aes128_subgraphs.push_back(connected_components[it->second].vars());
            }
        }
    }
}

template <typename FF, typename CircuitBuilder>
std::pair<std::unordered_set<uint32_t>, std::unordered_set<uint32_t>> StaticAnalyzerAcir_<FF, CircuitBuilder>::
    analyze_acir()
{
    std::unordered_set<uint32_t> variables_in_one_gate = analyzer.analyze_circuit().second;
    filter_false_positives(variables_in_one_gate);
    std::unordered_set<uint32_t> unconstrained_vars = get_unconstrained_variables();
    return std::make_pair(variables_in_one_gate, std::move(unconstrained_vars));
}

template class StaticAnalyzerAcir_<fr, UltraCircuitBuilder>;
} // namespace cdg
