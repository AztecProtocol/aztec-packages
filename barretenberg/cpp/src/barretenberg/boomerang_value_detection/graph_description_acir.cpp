#include "./graph_description_acir.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <unordered_map>
#include <unordered_set>

using namespace acir_format;
using namespace bb;
using namespace bb::plookup;
namespace cdg {

template <typename FF, typename CircuitBuilder>
StaticAnalyzerAcir_<FF, CircuitBuilder>::StaticAnalyzerAcir_(std::vector<uint8_t>& acir_program_buf)
    : constraint_system(circuit_buf_to_acir_format(std::move(acir_program_buf)))
    , program(constraint_system)
    , builder(create_circuit<CircuitBuilder>(program))
    , analyzer(builder)
{}

template <typename FF, typename CircuitBuilder>
StaticAnalyzerAcir_<FF, CircuitBuilder>::StaticAnalyzerAcir_(AcirFormat constraint_system_in)
    : constraint_system(std::move(constraint_system_in))
    , program(constraint_system)
    , builder(create_circuit<CircuitBuilder>(program))
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
    return (q_m == FF::one() && q_c == FF(-1) && q_arith == FF::one() && q_1 == FF::zero() && q_2 == FF::zero() &&
            q_3 == FF::zero() && q_4 == FF::zero());
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::is_boolean_gate(size_t block_idx, size_t gate_idx)
{
    auto& block = builder.blocks.get()[block_idx];
    auto q_m = block.q_m()[gate_idx];
    auto q_c = block.q_c()[gate_idx];
    auto q_arith = block.q_arith()[gate_idx];
    auto q_1 = block.q_1()[gate_idx];
    auto q_2 = block.q_2()[gate_idx];
    auto q_3 = block.q_3()[gate_idx];
    auto q_4 = block.q_4()[gate_idx];
    return (q_arith == FF::one() && q_m == FF::one() && q_1 == FF(-1) && q_2 == FF::zero() && q_3 == FF::zero() &&
            q_4 == FF::zero() && q_c == FF::zero());
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
std::unordered_set<uint32_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::analyze_acir()
{
    auto [first_part, variables_in_one_gate] = analyzer.analyze_circuit(/*filter_cc=*/false);
    filter_false_positives(variables_in_one_gate);
    return variables_in_one_gate;
}

template <typename FF, typename CircuitBuilder>
std::unordered_set<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::get_incorrect_opcodes()
{
    std::unordered_set<size_t> incorrect_opcodes;
    process_constraint_system();
    for (auto& [opcode_idx, constraint_info] : opcode_constraint_map) {
        if (!constraint_info.processed_correctly) {
            incorrect_opcodes.emplace(opcode_idx);
        }
    }
    return incorrect_opcodes;
}

template <typename FF, typename CircuitBuilder>
void StaticAnalyzerAcir_<FF, CircuitBuilder>::add_witness_if_not_constant(const WitnessOrConstant<FF>& woc,
                                                                          std::unordered_set<uint32_t>& witness_indices)
{
    if (!woc.is_constant) {
        witness_indices.emplace(woc.index);
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_set<uint32_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::collect_witnesses_from_constraint(
    size_t opcode_idx)
{
    std::unordered_set<uint32_t> witness_indices;
    if (!opcode_constraint_map_built) {
        opcode_constraint_map = cdg::build_opcode_type_map(constraint_system);
        opcode_constraint_map_built = true;
    }
    auto it = opcode_constraint_map.find(opcode_idx);
    if (it == opcode_constraint_map.end()) {
        return witness_indices;
    }
    const auto& constraint_info = it->second;

    switch (constraint_info.type) {
    case AcirConstraintType::LOGIC: {
        const auto* constraint = std::get<const LogicConstraint*>(constraint_info.ptr);
        add_witness_if_not_constant(constraint->a, witness_indices);
        add_witness_if_not_constant(constraint->b, witness_indices);
        witness_indices.insert(constraint->result);
        break;
    }
    case AcirConstraintType::RANGE: {
        const auto* constraint = std::get<const RangeConstraint*>(constraint_info.ptr);
        witness_indices.insert(constraint->witness);
        break;
    }
    case AcirConstraintType::AES128: {
        const auto* constraint = std::get<const AES128Constraint*>(constraint_info.ptr);
        for (const auto& input : constraint->inputs) {
            add_witness_if_not_constant(input, witness_indices);
        }
        for (const auto& iv_elem : constraint->iv) {
            add_witness_if_not_constant(iv_elem, witness_indices);
        }
        for (const auto& key_elem : constraint->key) {
            add_witness_if_not_constant(key_elem, witness_indices);
        }
        for (uint32_t output : constraint->outputs) {
            witness_indices.insert(output);
        }
        break;
    }
    case AcirConstraintType::SHA256_COMPRESSION: {
        const auto* constraint = std::get<const Sha256Compression*>(constraint_info.ptr);
        for (const auto& input : constraint->inputs) {
            add_witness_if_not_constant(input, witness_indices);
        }
        for (const auto& hash_val : constraint->hash_values) {
            add_witness_if_not_constant(hash_val, witness_indices);
        }
        for (uint32_t result : constraint->result) {
            witness_indices.insert(result);
        }
        break;
    }
    case AcirConstraintType::ECDSA_K1:
    case AcirConstraintType::ECDSA_R1: {
        const auto* constraint = std::get<const EcdsaConstraint*>(constraint_info.ptr);
        for (uint32_t idx : constraint->hashed_message) {
            witness_indices.insert(idx);
        }
        for (uint32_t idx : constraint->signature) {
            witness_indices.insert(idx);
        }
        for (uint32_t idx : constraint->pub_x_indices) {
            witness_indices.insert(idx);
        }
        for (uint32_t idx : constraint->pub_y_indices) {
            witness_indices.insert(idx);
        }
        add_witness_if_not_constant(constraint->predicate, witness_indices);
        witness_indices.insert(constraint->result);
        break;
    }
    case AcirConstraintType::BLAKE2S: {
        const auto* constraint = std::get<const Blake2sConstraint*>(constraint_info.ptr);
        for (const auto& input : constraint->inputs) {
            add_witness_if_not_constant(input.blackbox_input, witness_indices);
        }
        for (uint32_t result : constraint->result) {
            witness_indices.insert(result);
        }
        break;
    }
    case AcirConstraintType::BLAKE3: {
        const auto* constraint = std::get<const Blake3Constraint*>(constraint_info.ptr);
        for (const auto& input : constraint->inputs) {
            add_witness_if_not_constant(input.blackbox_input, witness_indices);
        }
        for (uint32_t result : constraint->result) {
            witness_indices.insert(result);
        }
        break;
    }
    case AcirConstraintType::KECCAK_PERMUTATION: {
        const auto* constraint = std::get<const Keccakf1600*>(constraint_info.ptr);
        for (const auto& state_elem : constraint->state) {
            add_witness_if_not_constant(state_elem, witness_indices);
        }
        for (uint32_t result : constraint->result) {
            witness_indices.insert(result);
        }
        break;
    }
    case AcirConstraintType::POSEIDON2: {
        const auto* constraint = std::get<const Poseidon2Constraint*>(constraint_info.ptr);
        for (const auto& state_elem : constraint->state) {
            add_witness_if_not_constant(state_elem, witness_indices);
        }
        for (uint32_t result : constraint->result) {
            witness_indices.insert(result);
        }
        break;
    }
    case AcirConstraintType::MULTI_SCALAR_MUL: {
        const auto* constraint = std::get<const MultiScalarMul*>(constraint_info.ptr);
        for (const auto& point : constraint->points) {
            add_witness_if_not_constant(point, witness_indices);
        }
        for (const auto& scalar : constraint->scalars) {
            add_witness_if_not_constant(scalar, witness_indices);
        }
        add_witness_if_not_constant(constraint->predicate, witness_indices);
        witness_indices.insert(constraint->out_point_x);
        witness_indices.insert(constraint->out_point_y);
        witness_indices.insert(constraint->out_point_is_infinite);
        break;
    }
    case AcirConstraintType::EC_ADD: {
        const auto* constraint = std::get<const EcAdd*>(constraint_info.ptr);
        add_witness_if_not_constant(constraint->input1_x, witness_indices);
        add_witness_if_not_constant(constraint->input1_y, witness_indices);
        add_witness_if_not_constant(constraint->input1_infinite, witness_indices);
        add_witness_if_not_constant(constraint->input2_x, witness_indices);
        add_witness_if_not_constant(constraint->input2_y, witness_indices);
        add_witness_if_not_constant(constraint->input2_infinite, witness_indices);
        add_witness_if_not_constant(constraint->predicate, witness_indices);
        witness_indices.insert(constraint->result_x);
        witness_indices.insert(constraint->result_y);
        witness_indices.insert(constraint->result_infinite);
        break;
    }
    case AcirConstraintType::HONK_RECURSION:
    case AcirConstraintType::AVM_RECURSION:
    case AcirConstraintType::HN_RECURSION:
    case AcirConstraintType::CHONK_RECURSION: {
        const auto* constraint = std::get<const RecursionConstraint*>(constraint_info.ptr);
        for (uint32_t idx : constraint->key) {
            witness_indices.insert(idx);
        }
        for (uint32_t idx : constraint->proof) {
            witness_indices.insert(idx);
        }
        for (uint32_t idx : constraint->public_inputs) {
            witness_indices.insert(idx);
        }
        witness_indices.insert(constraint->key_hash);
        add_witness_if_not_constant(constraint->predicate, witness_indices);
        break;
    }
    case AcirConstraintType::QUAD: {
        const auto* constraint = std::get<const mul_quad_<FF>*>(constraint_info.ptr);
        witness_indices.insert(constraint->a);
        witness_indices.insert(constraint->b);
        witness_indices.insert(constraint->c);
        witness_indices.insert(constraint->d);
        break;
    }
    case AcirConstraintType::BLOCK: {
        const auto* constraint = std::get<const BlockConstraint*>(constraint_info.ptr);
        // init is now a vector of uint32_t witness indices
        for (const auto& init_idx : constraint->init) {
            witness_indices.insert(init_idx);
        }
        // MemOp now has WitnessOrConstant for index and value
        for (const auto& mem_op : constraint->trace) {
            add_witness_if_not_constant(mem_op.index, witness_indices);
            add_witness_if_not_constant(mem_op.value, witness_indices);
        }
        break;
    }
    }
    return witness_indices;
}

template <typename FF, typename CircuitBuilder>
void StaticAnalyzerAcir_<FF, CircuitBuilder>::process_constraint_system()
{
    if (!opcode_constraint_map_built) {
        opcode_constraint_map = cdg::build_opcode_type_map(constraint_system);
        opcode_constraint_map_built = true;
    }
    for (auto& [opcode_idx, constraint_info] : opcode_constraint_map) {
        std::unordered_set<uint32_t> next_constraint_witnesses = collect_witnesses_from_constraint(opcode_idx + 1);
        bool result = false;
        switch (constraint_info.type) {
        case AcirConstraintType::LOGIC:
            result = process_logic_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::AES128:
            result = process_aes128_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::RANGE:
            result = process_range_constraints(constraint_info.ptr);
            break;
        default:
            // Constraint type not yet implemented - mark as not processed
            result = false;
            break;
        }
        constraint_info.processed_correctly = result;
    }
    return;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_logic_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& next_constraint_witnesses)
{
    (void)next_constraint_witnesses;
    // Logic constraint consists of constraint.a, constraint.b, constraint.result, constraint.num_bits,
    // constraint.is_xor_gate
    const auto* constraint = std::get<const acir_format::LogicConstraint*>(ptr);
    auto lookup_blk_idx = analyzer.find_block_index(builder.blocks.lookup);
    auto arithmetic_blk_idx = analyzer.find_block_index(builder.blocks.arithmetic);

    if (!lookup_blk_idx || !arithmetic_blk_idx) {
        return false;
    }

    auto& arith_block = builder.blocks.get()[*arithmetic_blk_idx];
    auto& lookup_block = builder.blocks.get()[*lookup_blk_idx];
    const size_t num_chunks = (constraint->num_bits + 31) / 32;
    std::vector<uint32_t> result_chunks;
    uint32_t current_res = analyzer.to_real(constraint->result);

    // Trace through accumulation chain to collect result_chunks
    while (result_chunks.size() < num_chunks - 1) {
        auto res_gates = analyzer.get_variable_gates(current_res);
        // find arithmetic gate for last_result
        auto arithmetic_gates_it = res_gates.find(*arithmetic_blk_idx);
        if (arithmetic_gates_it == res_gates.end()) {
            break;
        }
        bool found_gate = false;
        for (const auto& gate : arithmetic_gates_it->second) {
            if (analyzer.to_real(arith_block.w_o()[gate]) == current_res) {
                // Found gate for operator +=, extract result_chunk and previous result witness index
                result_chunks.push_back(arith_block.w_r()[gate]);
                current_res = analyzer.to_real(arith_block.w_l()[gate]);
                found_gate = true;
                break;
            }
        }
        if (!found_gate) {
            break;
        }
    }

    result_chunks.push_back(current_res);

    if (result_chunks.size() != num_chunks) {
        return false;
    }

    // Validate that all lookup tables are correct XOR or AND tables
    for (size_t i = 0; i < result_chunks.size(); i++) {
        auto chunk_variable_gates = analyzer.get_variable_gates(analyzer.to_real(result_chunks[i]));
        auto lookup_gates_it = chunk_variable_gates.find(*lookup_blk_idx);
        if (lookup_gates_it == chunk_variable_gates.end()) {
            return false;
        }

        bool found_valid_plookup = false;
        for (const auto& gate : lookup_gates_it->second) {
            if (analyzer.to_real(lookup_block.w_o()[gate]) == analyzer.to_real(result_chunks[i])) {
                auto table_index = static_cast<size_t>(static_cast<uint64_t>(lookup_block.q_3()[gate]));
                auto table_id = builder.get_lookup_tables()[table_index].id;

                bool is_valid_table = false;
                if (constraint->is_xor_gate) {
                    is_valid_table = (table_id == BasicTableId::UINT_XOR_SLICE_6_ROTATE_0 ||
                                      table_id == BasicTableId::UINT_XOR_SLICE_2_ROTATE_0 ||
                                      table_id == BasicTableId::UINT_XOR_SLICE_4_ROTATE_0);
                } else {
                    is_valid_table = (table_id == BasicTableId::UINT_AND_SLICE_6_ROTATE_0 ||
                                      table_id == BasicTableId::UINT_AND_SLICE_2_ROTATE_0 ||
                                      table_id == BasicTableId::UINT_AND_SLICE_4_ROTATE_0);
                }

                if (is_valid_table) {
                    found_valid_plookup = true;
                    break;
                }
            }
        }

        if (!found_valid_plookup) {
            return false;
        }
    }

    // Check range constraints for a_chunk and b_chunk when num_bits % 32 != 0
    uint32_t final_bits = constraint->num_bits % 32;
    if (final_bits != 0) {
        auto first_chunk_gates = analyzer.get_variable_gates(analyzer.to_real(result_chunks[0]));
        auto first_lookup_it = first_chunk_gates.find(*lookup_blk_idx);
        if (first_lookup_it == first_chunk_gates.end()) {
            return false;
        }

        bool found_chunks = false;
        for (const auto& gate : first_lookup_it->second) {
            if (analyzer.to_real(lookup_block.w_o()[gate]) == analyzer.to_real(result_chunks[0])) {
                uint32_t a_chunk = analyzer.to_real(lookup_block.w_l()[gate]);
                uint32_t b_chunk = analyzer.to_real(lookup_block.w_r()[gate]);
                if (!analyzer.validate_decompose_chain(a_chunk, final_bits) ||
                    !analyzer.validate_decompose_chain(b_chunk, final_bits)) {
                    return false;
                }
                found_chunks = true;
                break;
            }
        }

        if (!found_chunks) {
            return false;
        }
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_aes128_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& next_constraint_witnesses)
{
    // AES128 constraint processing
    // TODO: Implement validation logic
    (void)ptr;
    (void)next_constraint_witnesses;
    return false; // Not yet implemented
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_range_constraint(uint32_t witness, uint32_t num_bits)
{
    // Range constraint consists of variable index and num bits to be constrained.
    // num bits == 1 => bool gate
    // num bits <= 14 => arithmetic gate + create_new_range_constraint <=> arithmetic gate + list[tag]
    // num bits > 14 => decompose_into_default_range => decompose chain with additional range constrains for sublimbs
    const auto& variable_gates = analyzer.get_variable_gates(witness);

    if (num_bits == 1) {
        for (const auto& [block_idx, gate_indices] : variable_gates) {
            for (const auto& gate_idx : gate_indices) {
                if (is_boolean_gate(block_idx, gate_idx)) {
                    return true;
                }
            }
        }
        return false;
    } else if (num_bits <= bb::UltraCircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM) {
        // Small range: arithmetic gate + range list entry
        uint64_t target_range = (1ULL << num_bits) - 1;
        auto it = builder.range_lists.find(target_range);
        if (it == builder.range_lists.end()) {
            return false;
        }
        const auto& range_list = it->second;
        return std::find(range_list.variable_indices.begin(), range_list.variable_indices.end(), witness) !=
               range_list.variable_indices.end();
    } else {
        // Large range: decompose_into_default_range creates sublimbs with big_add gates
        // Validate that the decompose chain was correctly created
        return analyzer.validate_decompose_chain(witness, num_bits);
    }
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_range_constraints(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const acir_format::RangeConstraint*>(ptr);
    return validate_range_constraint(constraint->witness, constraint->num_bits);
}

template class StaticAnalyzerAcir_<fr, UltraCircuitBuilder>;
} // namespace cdg
