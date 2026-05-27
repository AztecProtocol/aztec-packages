/**
 * @file acir_graph.cpp
 * @brief Opcode → witness hyperedges for ACIR connectivity analysis.
 */
#include "acir_graph.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include <stack>
#include <unordered_map>
#include <variant>

namespace acir_components_check {

namespace {
template <class... Ts> struct overloaded : Ts... {
    using Ts::operator()...;
};

void collect_expression_witnesses(std::vector<uint32_t>& witnesses, const Acir::Expression& expression)
{
    for (const auto& [_, lhs, rhs] : expression.mul_terms) {
        witnesses.push_back(lhs.value);
        witnesses.push_back(rhs.value);
    }
    for (const auto& [_, witness] : expression.linear_combinations) {
        witnesses.push_back(witness.value);
    }
}

void collect_function_input_witness(std::vector<uint32_t>& witnesses, const Acir::FunctionInput& input)
{
    if (std::holds_alternative<Acir::FunctionInput::Witness>(input.value)) {
        witnesses.push_back(std::get<Acir::FunctionInput::Witness>(input.value).value.value);
    }
}

template <typename Container> void collect_function_inputs(std::vector<uint32_t>& witnesses, const Container& inputs)
{
    for (const auto& input : inputs) {
        collect_function_input_witness(witnesses, input);
    }
}

template <typename Container> void collect_witnesses(std::vector<uint32_t>& witnesses, const Container& outputs)
{
    for (const auto& output : outputs) {
        witnesses.push_back(output.value);
    }
}

/** When predicate is constant zero, recursive aggregation is disabled in ACIR; skip adding edges
 *  so the graph matches what constraint synthesis effectively uses. */
bool is_disabled_recursive_aggregation(const Acir::BlackBoxFuncCall::RecursiveAggregation& recursion)
{
    auto predicate = acir_format::parse_input(recursion.predicate);
    return predicate.is_constant && predicate.value.is_zero();
}
} // namespace

void AcirGraph::add_constraint(const std::vector<uint32_t>& witnesses)
{
    if (witnesses.empty()) {
        return;
    }

    std::unordered_set<uint32_t> unique_witnesses(witnesses.begin(), witnesses.end());
    std::vector<uint32_t> ids(unique_witnesses.begin(), unique_witnesses.end());

    for (auto witness : ids) {
        adjacency_lists_[witness];
    }

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

void AcirGraph::process_acir_circuit(const Acir::Circuit& circuit)
{
    std::unordered_map<uint32_t, std::vector<uint32_t>> block_witnesses;

    for (const auto& opcode : circuit.opcodes) {
        std::visit(overloaded{ [&](const Acir::Opcode::AssertZero& assert_zero) {
                                  std::vector<uint32_t> witnesses;
                                  collect_expression_witnesses(witnesses, assert_zero.value);
                                  add_constraint(witnesses);
                              },
                               [&](const Acir::Opcode::BlackBoxFuncCall& black_box) {
                                   std::visit(overloaded{
                                                  [&](const Acir::BlackBoxFuncCall::AND& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_input_witness(witnesses, call.lhs);
                                                      collect_function_input_witness(witnesses, call.rhs);
                                                      witnesses.push_back(call.output.value);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::XOR& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_input_witness(witnesses, call.lhs);
                                                      collect_function_input_witness(witnesses, call.rhs);
                                                      witnesses.push_back(call.output.value);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::RANGE& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_input_witness(witnesses, call.input);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::AES128Encrypt& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, call.inputs);
                                                      collect_function_inputs(witnesses, *call.iv);
                                                      collect_function_inputs(witnesses, *call.key);
                                                      collect_witnesses(witnesses, call.outputs);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::Sha256Compression& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, *call.inputs);
                                                      collect_function_inputs(witnesses, *call.hash_values);
                                                      collect_witnesses(witnesses, *call.outputs);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::Blake2s& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, call.inputs);
                                                      collect_witnesses(witnesses, *call.outputs);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::Blake3& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, call.inputs);
                                                      collect_witnesses(witnesses, *call.outputs);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::EcdsaSecp256k1& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, *call.hashed_message);
                                                      collect_function_inputs(witnesses, *call.signature);
                                                      collect_function_inputs(witnesses, *call.public_key_x);
                                                      collect_function_inputs(witnesses, *call.public_key_y);
                                                      collect_function_input_witness(witnesses, call.predicate);
                                                      witnesses.push_back(call.output.value);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::EcdsaSecp256r1& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, *call.hashed_message);
                                                      collect_function_inputs(witnesses, *call.signature);
                                                      collect_function_inputs(witnesses, *call.public_key_x);
                                                      collect_function_inputs(witnesses, *call.public_key_y);
                                                      collect_function_input_witness(witnesses, call.predicate);
                                                      witnesses.push_back(call.output.value);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::MultiScalarMul& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      for (size_t i = 0; i + 1 < call.points.size(); i += 3) {
                                                          collect_function_input_witness(witnesses, call.points[i]);
                                                          collect_function_input_witness(witnesses, call.points[i + 1]);
                                                      }
                                                      collect_function_inputs(witnesses, call.scalars);
                                                      collect_function_input_witness(witnesses, call.predicate);
                                                      // skipping input/output is_infinite, it's unused (known)
                                                      witnesses.push_back((*call.outputs)[0].value);
                                                      witnesses.push_back((*call.outputs)[1].value);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::EmbeddedCurveAdd& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_input_witness(witnesses, (*call.input1)[0]);
                                                      collect_function_input_witness(witnesses, (*call.input1)[1]);
                                                      collect_function_input_witness(witnesses, (*call.input2)[0]);
                                                      collect_function_input_witness(witnesses, (*call.input2)[1]);
                                                      collect_function_input_witness(witnesses, call.predicate);
                                                      // skipping input/output is_infinite, it's unused (known)
                                                      witnesses.push_back((*call.outputs)[0].value);
                                                      witnesses.push_back((*call.outputs)[1].value);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::Keccakf1600& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, *call.inputs);
                                                      collect_witnesses(witnesses, *call.outputs);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::RecursiveAggregation& call) {
                                                      if (is_disabled_recursive_aggregation(call)) {
                                                          return;
                                                      }

                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, call.verification_key);
                                                      collect_function_inputs(witnesses, call.proof);
                                                      collect_function_inputs(witnesses, call.public_inputs);
                                                      collect_function_input_witness(witnesses, call.key_hash);
                                                      collect_function_input_witness(witnesses, call.predicate);
                                                      add_constraint(witnesses);
                                                  },
                                                  [&](const Acir::BlackBoxFuncCall::Poseidon2Permutation& call) {
                                                      std::vector<uint32_t> witnesses;
                                                      collect_function_inputs(witnesses, call.inputs);
                                                      collect_witnesses(witnesses, call.outputs);
                                                      add_constraint(witnesses);
                                                  } },
                                              black_box.value.value);
                               },
                               [&](const Acir::Opcode::MemoryInit& memory_init) {
                                   auto& witnesses = block_witnesses[memory_init.block_id.value];
                                   collect_witnesses(witnesses, memory_init.init);
                               },
                               [&](const Acir::Opcode::MemoryOp& memory_op) {
                                   auto& witnesses = block_witnesses[memory_op.block_id.value];
                                   witnesses.push_back(memory_op.op.index.value);
                                   witnesses.push_back(memory_op.op.value.value);
                               },
                               [&](const Acir::Opcode::BrilligCall&) {},
                               [&](const Acir::Opcode::Call&) {} },
                   opcode.value);
    }

    for (const auto& [_, witnesses] : block_witnesses) {
        add_constraint(witnesses);
    }
}

} // namespace acir_components_check
