#include "acir_graph.hpp"

namespace acir_components_count {

using WoC = acir_format::WitnessOrConstant<bb::fr>;

void AcirGraph::add_constraint(const std::vector<WoC>& witnesses)
{
    // Extract non-constant witness indices
    std::vector<uint32_t> indices;
    for (const auto& w : witnesses) {
        if (!w.is_constant) {
            indices.push_back(w.index);
        }
    }
    add_constraint(indices);
}

void AcirGraph::add_constraint(const std::vector<uint32_t>& indices)
{
    // Ensure all vertices exist (even isolated ones count as their own component)
    for (auto idx : indices) {
        adjacency_lists_[idx]; // default-inserts empty set if missing
    }
    // Connect all pairs
    for (size_t i = 0; i < indices.size(); i++) {
        for (size_t j = i + 1; j < indices.size(); j++) {
            adjacency_lists_[indices[i]].insert(indices[j]);
            adjacency_lists_[indices[j]].insert(indices[i]);
        }
    }
}

size_t AcirGraph::count_components() const
{
    std::unordered_set<uint32_t> visited;
    size_t count = 0;

    for (const auto& [vertex, _] : adjacency_lists_) {
        if (visited.count(vertex) != 0) {
            continue;
        }
        // Iterative DFS
        std::stack<uint32_t> stack;
        stack.push(vertex);
        visited.insert(vertex);
        while (!stack.empty()) {
            auto current = stack.top();
            stack.pop();
            auto it = adjacency_lists_.find(current);
            if (it != adjacency_lists_.end()) {
                for (auto neighbor : it->second) {
                    if (visited.count(neighbor) == 0) {
                        visited.insert(neighbor);
                        stack.push(neighbor);
                    }
                }
            }
        }
        count++;
    }
    return count;
}

void AcirGraph::process_acir_constraints(const acir_format::AcirFormat& cs)
{
    // --- QuadConstraint (mul_quad_<fr>) ---
    for (const auto& c : cs.quad_constraints) {
        add_constraint(std::vector<uint32_t>{ c.a, c.b, c.c, c.d });
    }

    // --- BigQuadConstraint (vector of QuadConstraint) ---
    for (const auto& big : cs.big_quad_constraints) {
        // All quads in a BigQuadConstraint are part of the same expression
        std::vector<uint32_t> indices;
        for (const auto& c : big) {
            indices.push_back(c.a);
            indices.push_back(c.b);
            indices.push_back(c.c);
            indices.push_back(c.d);
        }
        add_constraint(indices);
    }

    // --- LogicConstraint ---
    for (const auto& c : cs.logic_constraints) {
        std::vector<WoC> wits = { c.a, c.b };
        wits.push_back(WoC::from_index(c.result));
        add_constraint(wits);
    }

    // --- RangeConstraint ---
    for (const auto& c : cs.range_constraints) {
        add_constraint(std::vector<uint32_t>{ c.witness });
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
        add_constraint(wits);
    }

    // --- MultiScalarMul ---
    for (const auto& c : cs.multi_scalar_mul_constraints) {
        std::vector<WoC> wits(c.points.begin(), c.points.end());
        wits.insert(wits.end(), c.scalars.begin(), c.scalars.end());
        wits.push_back(WoC::from_index(c.out_point_x));
        wits.push_back(WoC::from_index(c.out_point_y));
        wits.push_back(WoC::from_index(c.out_point_is_infinite));
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
        std::vector<uint32_t> indices(c.hashed_message.begin(), c.hashed_message.end());
        indices.insert(indices.end(), c.signature.begin(), c.signature.end());
        indices.insert(indices.end(), c.pub_x_indices.begin(), c.pub_x_indices.end());
        indices.insert(indices.end(), c.pub_y_indices.begin(), c.pub_y_indices.end());
        indices.push_back(c.result);
        add_constraint(indices);
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
        std::vector<uint32_t> indices(c.key.begin(), c.key.end());
        indices.insert(indices.end(), c.proof.begin(), c.proof.end());
        indices.insert(indices.end(), c.public_inputs.begin(), c.public_inputs.end());
        indices.push_back(c.key_hash);
        add_constraint(indices);
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
