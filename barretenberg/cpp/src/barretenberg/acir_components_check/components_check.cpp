/**
 * @file components_check.cpp
 * @brief Maps each ACIR witness to a circuit-side component (real, virtual, or absent) and compares
 *        per ACIR component.
 */
#include "components_check.hpp"

namespace acir_components_check {

/** Sentinel: this ACIR witness has no acceptable circuit-side bucket (not in a CC, not constant,
 *  not a recognized singleton/range-list variable). Compare step emits UNCONSTRAINED for these. */
static constexpr size_t NO_CIRCUIT_CC = SIZE_MAX;

template <typename Builder> Builder make_analyzer_builder(const Builder& builder)
{
    Builder analyzer_builder = builder;
    if (analyzer_builder.real_variable_index.size() < analyzer_builder.get_variables().size()) {
        analyzer_builder.real_variable_index.resize(analyzer_builder.get_variables().size(),
                                                    analyzer_builder.zero_idx());
    }
    return analyzer_builder;
}

template <typename Builder> std::vector<Error> ComponentsChecker_<Builder>::check()
{
    build_acir_component_map();
    build_circuit_component_map();
    return compare_components();
}

template <typename Builder> void ComponentsChecker_<Builder>::build_acir_component_map()
{
    AcirGraph acir_graph;
    acir_graph.process_acir_circuit(acir_circuit_);
    acir_witness_map_ = acir_graph.get_witness_component_map();
}

template <typename Builder> void ComponentsChecker_<Builder>::build_circuit_component_map()
{
    // Real CCs: variables that share arithmetic gates form connected components.
    auto analyzer_builder = make_analyzer_builder(builder_);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(analyzer_builder);
    auto circuit_cc = analyzer.find_connected_components();

    // Map each circuit CC variable to its CC index
    for (size_t cc_id = 0; cc_id < circuit_cc.size(); cc_id++) {
        for (auto v : circuit_cc[cc_id].vars()) {
            circuit_var_to_cc_[v] = cc_id;
        }
    }

    // Collect gate counts
    gate_counts_ = analyzer.get_variables_gate_counts();

    // Collect range_list variables
    for (const auto& [_, range_list] : builder_.range_lists) {
        for (auto var_idx : range_list.variable_indices) {
            if (var_idx >= builder_.real_variable_index.size()) {
                continue;
            }
            range_list_vars_.insert(builder_.real_variable_index[var_idx]);
        }
    }

    // Collect constant variable indices
    for (const auto& [_, var_idx] : builder_.constant_variable_indices) {
        constant_var_set_.insert(var_idx);
    }

    // Virtual CC ids start after real analyzer CC ids: one id per distinct constant or
    // singleton/range-list real variable, so ACIR witnesses that only touch those paths do not
    // falsely SPLIT a component that is "together" in ACIR but not linked by arithmetic CCs.
    size_t next_virtual_id = circuit_cc.size();
    std::unordered_map<uint32_t, size_t> virtual_cc_ids;

    for (const auto& [witness, _] : acir_witness_map_) {
        if (witness >= builder_.real_variable_index.size()) {
            circuit_witness_map_[witness] = NO_CIRCUIT_CC;
            continue;
        }

        uint32_t real_idx = builder_.real_variable_index[witness];

        // In a real CC?
        if (auto it = circuit_var_to_cc_.find(real_idx); it != circuit_var_to_cc_.end()) {
            circuit_witness_map_[witness] = it->second;
            continue;
        }

        // Mapped to a constant variable? (e.g., via assert_equal to zero_idx)
        if (constant_var_set_.contains(real_idx)) {
            if (!virtual_cc_ids.contains(real_idx)) {
                virtual_cc_ids[real_idx] = next_virtual_id++;
            }
            circuit_witness_map_[witness] = virtual_cc_ids[real_idx];
            continue;
        }

        // Singleton: in a gate or range_list but not in any CC (degree-0)
        bool in_gate = gate_counts_.contains(real_idx) && gate_counts_.at(real_idx) > 0;
        bool in_range_list = range_list_vars_.contains(real_idx);
        if (in_gate || in_range_list) {
            if (!virtual_cc_ids.contains(real_idx)) {
                virtual_cc_ids[real_idx] = next_virtual_id++;
            }
            circuit_witness_map_[witness] = virtual_cc_ids[real_idx];
            continue;
        }

        circuit_witness_map_[witness] = NO_CIRCUIT_CC;
    }
}

template <typename Builder> std::vector<Error> ComponentsChecker_<Builder>::compare_components() const
{
    std::vector<Error> errors;

    // Group ACIR witnesses by their ACIR component
    std::unordered_map<size_t, std::vector<uint32_t>> acir_comp_witnesses;
    for (const auto& [witness, acir_comp] : acir_witness_map_) {
        acir_comp_witnesses[acir_comp].push_back(witness);
    }

    for (const auto& [acir_comp, witnesses] : acir_comp_witnesses) {
        std::unordered_set<size_t> circuit_ccs_seen;
        std::vector<uint32_t> unconstrained;

        for (auto w : witnesses) {
            auto it = circuit_witness_map_.find(w);
            if (it == circuit_witness_map_.end() || it->second == NO_CIRCUIT_CC) {
                unconstrained.push_back(w);
            } else {
                circuit_ccs_seen.insert(it->second);
            }
        }

        if (circuit_ccs_seen.size() > 1) {
            std::string msg = "ACIR component " + std::to_string(acir_comp) + " is split across " +
                              std::to_string(circuit_ccs_seen.size()) + " circuit components. Witnesses: ";
            for (auto w : witnesses) {
                msg += "w" + std::to_string(w) + "(cc=";
                auto cit = circuit_witness_map_.find(w);
                if (cit != circuit_witness_map_.end() && cit->second != NO_CIRCUIT_CC) {
                    msg += std::to_string(cit->second);
                } else {
                    msg += "none";
                }
                msg += ") ";
            }
            errors.push_back({ Error::Type::SPLIT, acir_comp, msg });
        }

        if (!unconstrained.empty()) {
            std::string msg = "ACIR component " + std::to_string(acir_comp) + " has " +
                              std::to_string(unconstrained.size()) + " witness(es) missing from circuit: ";
            for (auto w : unconstrained) {
                msg += format_witness_debug(w) + " ";
            }
            errors.push_back({ Error::Type::UNCONSTRAINED, acir_comp, msg });
        }
    }

    return errors;
}

template <typename Builder> std::string ComponentsChecker_<Builder>::format_witness_debug(uint32_t w) const
{
    if (w >= builder_.real_variable_index.size()) {
        return "w" + std::to_string(w) + "(real=missing,const=false,cc=false,gates=false,rl=false)";
    }

    uint32_t real_idx = builder_.real_variable_index[w];
    bool is_const = constant_var_set_.contains(real_idx);
    bool in_cc = circuit_var_to_cc_.contains(real_idx);
    bool has_gates = gate_counts_.contains(real_idx) && gate_counts_.at(real_idx) > 0;
    bool in_rl = range_list_vars_.contains(real_idx);
    auto b = [](bool v) { return v ? "true" : "false"; };
    return "w" + std::to_string(w) + "(real=" + std::to_string(real_idx) + ",const=" + b(is_const) + ",cc=" + b(in_cc) +
           ",gates=" + b(has_gates) + ",rl=" + b(in_rl) + ")";
}

// Explicit instantiations. Both UltraCircuitBuilder and MegaCircuitBuilder satisfy the field
// requirements (MegaCircuitBuilder_ inherits from UltraCircuitBuilder_).
template class ComponentsChecker_<bb::UltraCircuitBuilder>;
template class ComponentsChecker_<bb::MegaCircuitBuilder>;

} // namespace acir_components_check
