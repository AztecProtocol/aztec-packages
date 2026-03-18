#include "components_check.hpp"

namespace acir_components_check {

static constexpr size_t NO_CIRCUIT_CC = SIZE_MAX;

std::vector<Error> ComponentsChecker::check()
{
    build_acir_component_map();
    build_circuit_component_map();
    return compare_components();
}

void ComponentsChecker::build_acir_component_map()
{
    AcirGraph acir_graph;
    acir_graph.process_acir_constraints(constraints_);
    acir_witness_map_ = acir_graph.get_witness_component_map();
}

void ComponentsChecker::build_circuit_component_map()
{
    cdg::UltraStaticAnalyzer analyzer(builder_);
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
            range_list_vars_.insert(builder_.real_variable_index[var_idx]);
        }
    }

    // Collect constant variable indices
    for (const auto& [_, var_idx] : builder_.constant_variable_indices) {
        constant_var_set_.insert(var_idx);
    }

    // Assign virtual CC ids for singletons and constants
    size_t next_virtual_id = circuit_cc.size();
    std::unordered_map<uint32_t, size_t> virtual_cc_ids;

    for (uint32_t i = 0; i <= max_witness_; i++) {
        uint32_t real_idx = builder_.real_variable_index[i];

        // In a real CC?
        if (auto it = circuit_var_to_cc_.find(real_idx); it != circuit_var_to_cc_.end()) {
            circuit_witness_map_[i] = it->second;
            continue;
        }

        // Mapped to a constant variable? (e.g., via assert_equal to zero_idx)
        if (constant_var_set_.contains(real_idx)) {
            if (!virtual_cc_ids.contains(real_idx)) {
                virtual_cc_ids[real_idx] = next_virtual_id++;
            }
            circuit_witness_map_[i] = virtual_cc_ids[real_idx];
            continue;
        }

        // Singleton: in a gate or range_list but not in any CC (degree-0)
        bool in_gate = gate_counts_.contains(real_idx) && gate_counts_.at(real_idx) > 0;
        bool in_range_list = range_list_vars_.contains(real_idx);
        if (in_gate || in_range_list) {
            if (!virtual_cc_ids.contains(real_idx)) {
                virtual_cc_ids[real_idx] = next_virtual_id++;
            }
            circuit_witness_map_[i] = virtual_cc_ids[real_idx];
            continue;
        }

        circuit_witness_map_[i] = NO_CIRCUIT_CC;
    }
}

std::vector<Error> ComponentsChecker::compare_components() const
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
            if (w > max_witness_) {
                continue;
            }
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
                if (w <= max_witness_) {
                    msg += "w" + std::to_string(w) + "(cc=";
                    auto cit = circuit_witness_map_.find(w);
                    if (cit != circuit_witness_map_.end() && cit->second != NO_CIRCUIT_CC) {
                        msg += std::to_string(cit->second);
                    } else {
                        msg += "none";
                    }
                    msg += ") ";
                }
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

std::string ComponentsChecker::format_witness_debug(uint32_t w) const
{
    uint32_t real_idx = builder_.real_variable_index[w];
    bool is_const = constant_var_set_.contains(real_idx);
    bool in_cc = circuit_var_to_cc_.contains(real_idx);
    bool has_gates = gate_counts_.contains(real_idx) && gate_counts_.at(real_idx) > 0;
    bool in_rl = range_list_vars_.contains(real_idx);
    auto b = [](bool v) { return v ? "true" : "false"; };
    return "w" + std::to_string(w) + "(real=" + std::to_string(real_idx) + ",const=" + b(is_const) + ",cc=" + b(in_cc) +
           ",gates=" + b(has_gates) + ",rl=" + b(in_rl) + ")";
}

} // namespace acir_components_check
