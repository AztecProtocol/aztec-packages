#include "acir_graph.hpp"
#include <stack>

namespace acir_components_check {

void AcirGraph::add_constraint(const std::vector<WoC>& witnesses)
{
    // Extract non-constant witness indices
    std::vector<uint32_t> ids;
    ids.reserve(witnesses.size());
    for (const auto& w : witnesses) {
        if (!w.is_constant) {
            ids.push_back(w.index);
        }
    }

    // Connect all pairs
    for (size_t i = 0; i < ids.size(); i++) {
        for (size_t j = i + 1; j < ids.size(); j++) {
            adjacency_lists_[ids[i]].insert(ids[j]);
            adjacency_lists_[ids[j]].insert(ids[i]);
        }
    }
}

std::vector<std::vector<uint32_t>> AcirGraph::find_components() const
{
    std::vector<std::vector<uint32_t>> result;
    std::unordered_set<uint32_t> visited;

    for (const auto& [vertex, _] : adjacency_lists_) {
        if (visited.contains(vertex)) {
            continue;
        }
        std::vector<uint32_t> component;
        std::stack<uint32_t> stack;
        stack.push(vertex);
        visited.insert(vertex);
        while (!stack.empty()) {
            auto current = stack.top();
            stack.pop();
            component.push_back(current);
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
        result.push_back(std::move(component));
    }
    return result;
}

std::unordered_map<uint32_t, size_t> AcirGraph::get_witness_component_map() const
{
    auto components = find_components();
    std::unordered_map<uint32_t, size_t> witness_to_component;
    for (size_t comp_id = 0; comp_id < components.size(); comp_id++) {
        for (auto vertex : components[comp_id]) {
            witness_to_component[vertex] = comp_id;
        }
    }
    return witness_to_component;
}

// Helper: collect only real witness wires from a quad gate, skipping IS_CONSTANT sentinels.
namespace {
void collect_quad_witnesses(std::vector<WoC>& wits, const bb::mul_quad_<bb::fr>& c)
{
    if (c.a != bb::stdlib::IS_CONSTANT) {
        wits.push_back(WoC::from_index(c.a));
    }
    if (c.b != bb::stdlib::IS_CONSTANT) {
        wits.push_back(WoC::from_index(c.b));
    }
    if (c.c != bb::stdlib::IS_CONSTANT) {
        wits.push_back(WoC::from_index(c.c));
    }
    if (c.d != bb::stdlib::IS_CONSTANT) {
        wits.push_back(WoC::from_index(c.d));
    }
}
} // namespace

void AcirGraph::process_acir_constraints(const acir_format::AcirFormat& constraints)
{
    // --- QuadConstraint (mul_quad_<fr>) ---
    for (const auto& c : constraints.quad_constraints) {
        std::vector<WoC> wits;
        collect_quad_witnesses(wits, c);
        add_constraint(wits);
    }

    // --- BigQuadConstraint (vector of QuadConstraint) ---
    for (const auto& big : constraints.big_quad_constraints) {
        std::vector<WoC> wits;
        for (const auto& c : big) {
            collect_quad_witnesses(wits, c);
        }
        add_constraint(wits);
    }

    // --- LogicConstraint ---
    for (const auto& c : constraints.logic_constraints) {
        std::vector<WoC> wits = { c.a, c.b };
        wits.push_back(WoC::from_index(c.result));
        add_constraint(wits);
    }

    // --- RangeConstraint ---
    for (const auto& c : constraints.range_constraints) {
        add_constraint(std::vector<WoC>{ WoC::from_index(c.witness) });
    }

    // --- Sha256Compression ---
    for (const auto& c : constraints.sha256_compression) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        wits.insert(wits.end(), c.hash_values.begin(), c.hash_values.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- Poseidon2Constraint ---
    for (const auto& c : constraints.poseidon2_constraints) {
        std::vector<WoC> wits(c.state.begin(), c.state.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- EcAdd ---
    for (const auto& c : constraints.ec_add_constraints) {
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
    for (const auto& c : constraints.multi_scalar_mul_constraints) {
        std::vector<WoC> wits(c.points.begin(), c.points.end());
        wits.insert(wits.end(), c.scalars.begin(), c.scalars.end());
        wits.push_back(WoC::from_index(c.out_point_x));
        wits.push_back(WoC::from_index(c.out_point_y));
        wits.push_back(WoC::from_index(c.out_point_is_infinite));
        wits.push_back(c.predicate);
        add_constraint(wits);
    }

    // --- AES128Constraint ---
    for (const auto& c : constraints.aes128_constraints) {
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
    for (const auto& c : constraints.ecdsa_k1_constraints) {
        process_ecdsa(c);
    }
    for (const auto& c : constraints.ecdsa_r1_constraints) {
        process_ecdsa(c);
    }

    // --- Blake2sConstraint ---
    for (const auto& c : constraints.blake2s_constraints) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- Blake3Constraint ---
    for (const auto& c : constraints.blake3_constraints) {
        std::vector<WoC> wits(c.inputs.begin(), c.inputs.end());
        for (auto idx : c.result) {
            wits.push_back(WoC::from_index(idx));
        }
        add_constraint(wits);
    }

    // --- Keccakf1600 ---
    for (const auto& c : constraints.keccak_permutations) {
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
    for (const auto& c : constraints.honk_recursion_constraints) {
        process_recursion(c);
    }
    for (const auto& c : constraints.avm_recursion_constraints) {
        process_recursion(c);
    }
    for (const auto& c : constraints.hn_recursion_constraints) {
        process_recursion(c);
    }
    for (const auto& c : constraints.chonk_recursion_constraints) {
        process_recursion(c);
    }

    // --- BlockConstraint ---
    for (const auto& c : constraints.block_constraints) {
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

} // namespace acir_components_check
