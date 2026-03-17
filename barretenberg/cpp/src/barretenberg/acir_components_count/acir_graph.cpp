#include "acir_graph.hpp"

namespace acir_components_count {

uint32_t AcirGraph::to_vertex_id(const WoC& woc)
{
    if (!woc.is_constant) {
        return woc.index;
    }
    // Value-based caching for constants (mirrors circuit builder's put_constant_variable).
    auto [it, inserted] = constant_vertex_ids_.try_emplace(woc.value, next_const_id_);
    if (inserted) {
        next_const_id_++;
    }
    return it->second;
}

void AcirGraph::add_constraint(const std::vector<WoC>& witnesses)
{
    std::vector<uint32_t> ids;
    ids.reserve(witnesses.size());
    for (const auto& w : witnesses) {
        ids.push_back(to_vertex_id(w));
    }

    // Ensure all vertices exist (even isolated ones count as their own component)
    for (auto id : ids) {
        adjacency_lists_[id];
    }
    // Connect all pairs
    for (size_t i = 0; i < ids.size(); i++) {
        for (size_t j = i + 1; j < ids.size(); j++) {
            adjacency_lists_[ids[i]].insert(ids[j]);
            adjacency_lists_[ids[j]].insert(ids[i]);
        }
    }
}

size_t AcirGraph::count_components() const
{
    std::unordered_set<uint32_t> visited;
    size_t count = 0;

    for (const auto& [vertex, _] : adjacency_lists_) {
        if (visited.contains(vertex)) {
            continue;
        }
        // Iterative DFS
        std::stack<uint32_t> stack;
        stack.push(vertex);
        visited.insert(vertex);
        bool has_witness = false;
        while (!stack.empty()) {
            auto current = stack.top();
            stack.pop();
            if (current < witness_id_ceiling_) {
                has_witness = true;
            }
            auto it = adjacency_lists_.find(current);
            if (it != adjacency_lists_.end()) {
                for (auto neighbor : it->second) {
                    if (!visited.contains(neighbor)) {
                        visited.insert(neighbor);
                        stack.push(neighbor);
                    }
                }
            }
        }
        // Only count components that contain at least one witness vertex.
        if (has_witness) {
            count++;
        }
    }
    return count;
}

// Helper to convert a quad wire index to WoC. IS_CONSTANT sentinel maps to constant 0.
static WoC quad_wire_to_woc(uint32_t idx, const bb::fr& scaling)
{
    if (idx == bb::stdlib::IS_CONSTANT) {
        return WoC::from_constant(bb::fr::zero());
    }
    // If the scaling is zero, this wire is effectively unused (contributes nothing).
    // Treat as constant to avoid creating a spurious vertex.
    if (scaling == bb::fr::zero()) {
        return WoC::from_constant(bb::fr::zero());
    }
    return WoC::from_index(idx);
}

void AcirGraph::process_acir_constraints(const acir_format::AcirFormat& cs)
{
    witness_id_ceiling_ = next_const_id_;

    // --- QuadConstraint (mul_quad_<fr>) ---
    for (const auto& c : cs.quad_constraints) {
        std::vector<WoC> wits;
        wits.push_back(quad_wire_to_woc(c.a, c.a_scaling + c.mul_scaling));
        wits.push_back(quad_wire_to_woc(c.b, c.b_scaling + c.mul_scaling));
        wits.push_back(quad_wire_to_woc(c.c, c.c_scaling));
        wits.push_back(quad_wire_to_woc(c.d, c.d_scaling));
        add_constraint(wits);
    }

    // --- BigQuadConstraint (vector of QuadConstraint) ---
    for (const auto& big : cs.big_quad_constraints) {
        std::vector<WoC> wits;
        for (const auto& c : big) {
            wits.push_back(quad_wire_to_woc(c.a, c.a_scaling + c.mul_scaling));
            wits.push_back(quad_wire_to_woc(c.b, c.b_scaling + c.mul_scaling));
            wits.push_back(quad_wire_to_woc(c.c, c.c_scaling));
            wits.push_back(quad_wire_to_woc(c.d, c.d_scaling));
        }
        add_constraint(wits);
    }

    // --- LogicConstraint ---
    for (const auto& c : cs.logic_constraints) {
        std::vector<WoC> wits = { c.a, c.b };
        wits.push_back(WoC::from_index(c.result));
        add_constraint(wits);
    }

    // --- RangeConstraint ---
    for (const auto& c : cs.range_constraints) {
        add_constraint(std::vector<WoC>{ WoC::from_index(c.witness) });
    }

    // --- Sha256Compression ---
    for (const auto& c : cs.sha256_compression) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        wits.insert(wits.end(), c.hash_values.begin(), c.hash_values.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- Poseidon2Constraint ---
    for (const auto& c : cs.poseidon2_constraints) {
        std::vector<WoC> wits(c.state.begin(), c.state.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- EcAdd ---
    for (const auto& c : cs.ec_add_constraints) {
        std::vector<WoC> wits = {
            c.input1_x, c.input1_y, c.input1_infinite, c.input2_x, c.input2_y, c.input2_infinite
        };
        wits.push_back(WoC::from_index(c.result_x));
        wits.push_back(WoC::from_index(c.result_y));
        wits.push_back(WoC::from_index(c.result_infinite));
        wits.push_back(c.predicate);
        add_constraint(wits);
    }

    // --- MultiScalarMul ---
    for (const auto& c : cs.multi_scalar_mul_constraints) {
        std::vector<WoC> wits(c.points.begin(), c.points.end());
        wits.insert(wits.end(), c.scalars.begin(), c.scalars.end());
        wits.push_back(WoC::from_index(c.out_point_x));
        wits.push_back(WoC::from_index(c.out_point_y));
        wits.push_back(WoC::from_index(c.out_point_is_infinite));
        wits.push_back(c.predicate);
        add_constraint(wits);
    }

    // --- AES128Constraint ---
    for (const auto& c : cs.aes128_constraints) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        wits.insert(wits.end(), c.iv.begin(), c.iv.end());
        wits.insert(wits.end(), c.key.begin(), c.key.end());
        for (auto idx : c.outputs) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- EcdsaConstraint (k1 and r1) ---
    auto process_ecdsa = [this](const auto& c) {
        std::vector<WoC> wits;
        for (auto idx : c.hashed_message) {
            wits.push_back(WoC::from_index(idx));
        }
        for (auto idx : c.signature) {
            wits.push_back(WoC::from_index(idx));
        }
        for (auto idx : c.pub_x_indices) {
            wits.push_back(WoC::from_index(idx));
        }
        for (auto idx : c.pub_y_indices) {
            wits.push_back(WoC::from_index(idx));
        }
        wits.push_back(WoC::from_index(c.result));
        wits.push_back(c.predicate);
        add_constraint(wits);
    };
    for (const auto& c : cs.ecdsa_k1_constraints) {
        process_ecdsa(c);
    }
    for (const auto& c : cs.ecdsa_r1_constraints) {
        process_ecdsa(c);
    }

    // --- Blake2sConstraint ---
    for (const auto& c : cs.blake2s_constraints) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- Blake3Constraint ---
    for (const auto& c : cs.blake3_constraints) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- Keccakf1600 ---
    for (const auto& c : cs.keccak_permutations) {
        std::vector<WoC> wits(c.state.begin(), c.state.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- RecursionConstraint (honk, avm, hn, chonk) ---
    auto process_recursion = [this](const auto& c) {
        std::vector<WoC> wits;
        for (auto idx : c.key) {
            wits.push_back(WoC::from_index(idx));
        }
        for (auto idx : c.proof) {
            wits.push_back(WoC::from_index(idx));
        }
        for (auto idx : c.public_inputs) {
            wits.push_back(WoC::from_index(idx));
        }
        wits.push_back(WoC::from_index(c.key_hash));
        wits.push_back(c.predicate);
        add_constraint(wits);
    };
    for (const auto& c : cs.honk_recursion_constraints) {
        process_recursion(c);
    }
    for (const auto& c : cs.avm_recursion_constraints) {
        process_recursion(c);
    }
    for (const auto& c : cs.hn_recursion_constraints) {
        process_recursion(c);
    }
    for (const auto& c : cs.chonk_recursion_constraints) {
        process_recursion(c);
    }

    // --- BlockConstraint ---
    for (const auto& c : cs.block_constraints) {
        std::vector<WoC> wits;
        for (auto idx : c.init) {
            wits.push_back(WoC::from_index(idx));
        }
        for (const auto& op : c.trace) {
            wits.push_back(op.index);
            wits.push_back(op.value);
        }
        add_constraint(wits);
    }
}

} // namespace acir_components_count
