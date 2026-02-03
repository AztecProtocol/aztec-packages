#include "./graph_description_acir.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <unordered_map>
#include <unordered_set>

using namespace acir_format;
using namespace bb;
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
StaticAnalyzerAcir_<FF, CircuitBuilder>::StaticAnalyzerAcir_(AcirFormat constraint_system_in,
                                                             CircuitBuilder&& external_builder)
    : constraint_system(std::move(constraint_system_in))
    , program(constraint_system)
    , builder(std::move(external_builder))
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

/**
 * @brief Collect all inputs/outputs witnesses from ACIR BlackBox constraint
 * @details There is a list of functions that write input and output witnesses in constraint.
 * Then BB creates intermediate witnessess during constraints creation. In order to collect all
 * Intermediate witnesses for a given constraint analyzer collects initial witnesses for neighboring constraints.
 */
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
    for (auto it = opcode_constraint_map.begin(); it != opcode_constraint_map.end(); ++it) {
        auto& [opcode_idx, constraint_info] = *it;
        std::unordered_set<uint32_t> next_constraint_witnesses;
        auto next_it = std::next(it);
        if (next_it != opcode_constraint_map.end()) {
            next_constraint_witnesses = collect_witnesses_from_constraint(next_it->first);
        }
        bool result = false;
        switch (constraint_info.type) {
        case AcirConstraintType::LOGIC:
            result = process_logic_constraints(constraint_info.ptr);
            break;
        case AcirConstraintType::AES128:
            result = process_aes128_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::RANGE:
            result = process_range_constraints(constraint_info.ptr);
            break;
        case AcirConstraintType::QUAD:
            result = process_quad_constraints(constraint_info.ptr);
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

/**
 * @brief Recover a_chunk and b_chunk from lookup gates 1-5 (excluding gate 0)
 * @details This function reconstructs the original chunk values using ONLY gates 1-5.
 *          If gate 0's w_l or w_r is corrupted, the reconstructed values will differ
 *          from gate 0's values, allowing corruption detection.
 *
 *          Structure of lookup gates for UINT32:
 *          - Gate 0: w_l = a_chunk, w_r = b_chunk (full 32-bit values)
 *          - Gate 1: w_l = a_chunk >> 6, w_r = b_chunk >> 6
 *          - Gate 2: w_l = a_chunk >> 12, w_r = b_chunk >> 12
 *          - ...
 *          - Gate 5: w_l = a_chunk >> 30, w_r = b_chunk >> 30 (top 2 bits)
 *
 *          Reconstruction from gates 1-5:
 *          - We can recover bits [6:31] from gates 1-5
 *          - The reconstructed value has bottom 6 bits as zero
 *          - Compare: (gate0_value & ~0x3F) should equal reconstructed value
 *
 * @return Pair of (a_chunk, b_chunk) reconstructed from gates 1-5 (with bottom 6 bits = 0)
 */
template <typename FF, typename CircuitBuilder>
std::pair<uint256_t, uint256_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::recover_chunks_from_lookups(
    const plookup::MultiTable& multi_table, const size_t& init_gate_idx)
{
    const size_t num_lookups = multi_table.basic_table_ids.size();
    const uint256_t step_size = 64;

    const size_t num_accumulators = num_lookups - 1;
    uint256_t acc_a[num_accumulators], acc_b[num_accumulators];

    for (size_t i = 0; i < num_accumulators; i++) {
        size_t gate_idx = init_gate_idx + 1 + i;
        acc_a[i] = static_cast<uint256_t>(builder.get_variable(builder.blocks.lookup.w_l()[gate_idx]));
        acc_b[i] = static_cast<uint256_t>(builder.get_variable(builder.blocks.lookup.w_r()[gate_idx]));
    }

    uint256_t slice_a[num_accumulators], slice_b[num_accumulators];

    for (size_t i = 0; i < num_accumulators - 1; i++) {
        slice_a[i] = acc_a[i] - step_size * acc_a[i + 1];
        slice_b[i] = acc_b[i] - step_size * acc_b[i + 1];
    }
    slice_a[num_accumulators - 1] = acc_a[num_accumulators - 1];
    slice_b[num_accumulators - 1] = acc_b[num_accumulators - 1];

    uint256_t a_high = 0, b_high = 0;
    uint256_t power = 1;
    for (size_t i = 0; i < num_accumulators; i++) {
        a_high += slice_a[i] * power;
        b_high += slice_b[i] * power;
        power *= step_size;
    }

    // The result equals (original_value & ~0x3F), i.e., original with bottom 6 bits cleared
    uint256_t a_reconstructed = a_high * step_size;
    uint256_t b_reconstructed = b_high * step_size;

    return std::make_pair(a_reconstructed, b_reconstructed);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_quad_constraints(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const acir_format::QuadConstraint*>(ptr);
    if (constraint->a == bb::stdlib::IS_CONSTANT) {
        return false;
    }
    bool is_gate_created = false;
    std::array<uint32_t, 4> constraint_variables{ constraint->a, constraint->b, constraint->c, constraint->d };
    std::array<FF, 6> scalings{ constraint->mul_scaling, constraint->a_scaling, constraint->b_scaling,
                                constraint->c_scaling,   constraint->d_scaling, constraint->const_scaling };

    for (size_t i = 0; i < constraint_variables.size(); i++) {
        if (constraint_variables[i] == bb::stdlib::IS_CONSTANT) {
            constraint_variables[i] = builder.zero_idx();
        } else {
            constraint_variables[i] = analyzer.to_real(constraint_variables[i]);
        }
    }

    auto zero = builder.zero_idx();
    const auto var_it = std::find_if(constraint_variables.begin(),
                                     constraint_variables.end(),
                                     [zero](const uint32_t var_idx) { return var_idx != zero; });
    if (var_it != constraint_variables.end()) {
        auto arithmetic_blk_idx = analyzer.find_block_index(builder.blocks.arithmetic);
        if (!arithmetic_blk_idx) {
            return false;
        }
        std::vector<std::pair<size_t, size_t>> var_gates = analyzer.get_variable_gates(*var_it);
        for (const auto& [blk_idx, gate_idx] : var_gates) {
            if (blk_idx == *arithmetic_blk_idx) {
                std::vector<uint32_t> gate_indices{ builder.blocks.arithmetic.w_l()[gate_idx],
                                                    builder.blocks.arithmetic.w_r()[gate_idx],
                                                    builder.blocks.arithmetic.w_o()[gate_idx],
                                                    builder.blocks.arithmetic.w_4()[gate_idx] };
                gate_indices = analyzer.to_real(gate_indices);
                if (builder.blocks.arithmetic.q_arith()[gate_idx] == FF::one() &&
                    std::equal(constraint_variables.begin(),
                               constraint_variables.end(),
                               gate_indices.begin(),
                               gate_indices.end()) &&
                    scalings == std::array<FF, 6>({ builder.blocks.arithmetic.q_m()[gate_idx],
                                                    builder.blocks.arithmetic.q_1()[gate_idx],
                                                    builder.blocks.arithmetic.q_2()[gate_idx],
                                                    builder.blocks.arithmetic.q_3()[gate_idx],
                                                    builder.blocks.arithmetic.q_4()[gate_idx],
                                                    builder.blocks.arithmetic.q_c()[gate_idx] })) {
                    is_gate_created = true; // we found the correct gate. Can stop and return true
                    break;
                }
            } // continue looking for a gate for the given constraint
        }
    }
    return is_gate_created;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_logic_constraints(const ConstraintPtr& ptr)
{
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
        bool found_gate = false;
        for (auto [blk_idx, gate] : res_gates) {
            if (blk_idx != *arithmetic_blk_idx) {
                continue;
            }
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

    // Validate that all lookup for XOR and AND tables are correct
    // Note: result_chunks are in reverse order (from highest to lowest chunk)
    using namespace bb::plookup;
    const MultiTable& multi_table =
        constraint->is_xor_gate ? plookup::get_multitable(UINT32_XOR) : plookup::get_multitable(UINT32_AND);
    const size_t num_lookups = multi_table.basic_table_ids.size();
    const auto& lookup_tables = builder.get_lookup_tables();

    uint256_t a_accumulated = 0, b_accumulated = 0;
    uint32_t first_chunk_a_idx = 0, first_chunk_b_idx = 0;

    for (size_t i = 0; i < result_chunks.size(); i++) {
        uint32_t real_chunk_idx = analyzer.to_real(result_chunks[i]);
        auto chunk_variable_gates = analyzer.get_variable_gates(real_chunk_idx);

        bool found_valid_for_chunk = false;
        for (auto [blk_idx, gate] : chunk_variable_gates) {
            if (blk_idx != *lookup_blk_idx) {
                continue;
            }
            if (analyzer.to_real(lookup_block.w_o()[gate]) == real_chunk_idx) {
                bool correct_lookup = true;
                for (size_t lookup_idx = 0; lookup_idx < num_lookups; lookup_idx++) {
                    size_t gate_idx = gate + lookup_idx;
                    if (!(lookup_block.q_lookup()[gate_idx] == FF::one())) {
                        correct_lookup = false;
                        break;
                    }
                    if (lookup_block.w_4()[gate_idx] != builder.zero_idx()) {
                        correct_lookup = false;
                        break;
                    }
                    const bool is_last_lookup = (lookup_idx == num_lookups - 1);
                    BasicTableId expected_table = multi_table.basic_table_ids[lookup_idx];
                    auto table_index = static_cast<size_t>(static_cast<uint256_t>(lookup_block.q_3()[gate_idx]));
                    auto table_id = lookup_tables[table_index].id;

                    if (table_id != expected_table) {
                        correct_lookup = false;
                        break;
                    }
                    FF expected_q2 = is_last_lookup ? FF(0) : -multi_table.column_1_step_sizes[lookup_idx + 1];
                    FF expected_qm = is_last_lookup ? FF(0) : -multi_table.column_2_step_sizes[lookup_idx + 1];
                    FF expected_qc = is_last_lookup ? FF(0) : -multi_table.column_3_step_sizes[lookup_idx + 1];
                    if (!(lookup_block.q_1()[gate_idx].is_zero() && expected_q2 == lookup_block.q_2()[gate_idx] &&
                          expected_qm == lookup_block.q_m()[gate_idx] && expected_qc == lookup_block.q_c()[gate_idx] &&
                          lookup_block.q_4()[gate_idx].is_zero())) {
                        correct_lookup = false;
                        break;
                    }
                }

                if (!correct_lookup) {
                    return false;
                }

                uint256_t a_chunk = builder.get_variable(lookup_block.w_l()[gate]);
                uint256_t b_chunk = builder.get_variable(lookup_block.w_r()[gate]);
                uint256_t result_chunk = builder.get_variable(lookup_block.w_o()[gate]);

                // Verify operation correctness
                if (constraint->is_xor_gate ? (a_chunk ^ b_chunk) != result_chunk
                                            : (a_chunk & b_chunk) != result_chunk) {
                    return false;
                }

                auto [a_recovered, b_recovered] = recover_chunks_from_lookups(multi_table, gate);

                if (a_recovered != (a_chunk & ~uint256_t(0x3F)) || b_recovered != (b_chunk & ~uint256_t(0x3F))) {
                    return false;
                }

                // Option 5: Store first chunk wire indices for final_bits check
                if (i == 0) {
                    first_chunk_a_idx = analyzer.to_real(lookup_block.w_l()[gate]);
                    first_chunk_b_idx = analyzer.to_real(lookup_block.w_r()[gate]);
                }

                found_valid_for_chunk = true;
                // result_chunks are in reverse order: result_chunks[i] is chunk (num_chunks - 1 - i)
                auto scaling_factor = uint256_t(1) << (32 * (num_chunks - 1 - i));
                a_accumulated += a_chunk * scaling_factor;
                b_accumulated += b_chunk * scaling_factor;
                break;
            }
        } // block to process 1 result_chunk
        if (!found_valid_for_chunk) {
            return false;
        }
    }
    // if all chunks for lookup tables are correct => a_accumulated and b_accumulated should be equal to initial
    // values of a and b
    uint256_t a_init = constraint->a.is_constant ? uint256_t(constraint->a.value)
                                                 : uint256_t(builder.get_variable(constraint->a.index));
    uint256_t b_init = constraint->b.is_constant ? uint256_t(constraint->b.value)
                                                 : uint256_t(builder.get_variable(constraint->b.index));
    if (a_init != a_accumulated || b_init != b_accumulated) {
        return false;
    }

    // Check range constraints for a_chunk and b_chunk when num_bits % 32 != 0
    uint32_t final_bits = constraint->num_bits % 32;
    if (final_bits != 0) {
        if (!analyzer.validate_decompose_chain(first_chunk_a_idx, final_bits) ||
            !analyzer.validate_decompose_chain(first_chunk_b_idx, final_bits)) {
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
    // num bits > 14 => decompose_into_default_range => decompose chain with additional range constrains for
    // sublimbs
    const auto& variable_gates = analyzer.get_variable_gates(witness);

    if (num_bits == 1) {
        for (auto [block_idx, gate_idx] : variable_gates) {
            if (is_boolean_gate(block_idx, gate_idx)) {
                return true;
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

AcirGraph::AcirGraph(const acir_format::AcirFormat& constraint_system)
{
    // Process logic constraints
    for (const auto& constraint : constraint_system.logic_constraints) {
        add_variable_connection(constraint.a.index, constraint.b.index);
        add_variable_connection(constraint.a.index, constraint.result);
        add_variable_connection(constraint.b.index, constraint.result);
    }
    // Ignore range constraints, they do not connect to other variables

    // Process AES128 constraints
    // The number of edges produced by each AES128 is 65536 * NUM_BLOCKS ^ 2, where NUM_BLOCKS is msg_len // 16
    for (const auto& constraint : constraint_system.aes128_constraints) {
        for (const auto& input : constraint.inputs) {
            for (const auto& key_byte : constraint.key) {
                for (const auto& iv_byte : constraint.iv) {
                    for (const auto& output : constraint.outputs) {
                        add_variable_connection(input.index, output);
                        add_variable_connection(input.index, key_byte.index);
                        add_variable_connection(input.index, iv_byte.index);
                        add_variable_connection(key_byte.index, iv_byte.index);
                        add_variable_connection(key_byte.index, iv_byte.index);
                        add_variable_connection(key_byte.index, output);
                        add_variable_connection(iv_byte.index, output);
                    }
                }
            }
        }
    }

    // Process SHA256 compression constraints
    for (const auto& constraint : constraint_system.sha256_compression) {
        for (const auto& input : constraint.inputs) {
            for (const auto& hash_value : constraint.hash_values) {
                for (const auto& result : constraint.result) {
                    add_variable_connection(input.index, hash_value.index);
                    add_variable_connection(hash_value.index, result);
                    add_variable_connection(input.index, result);
                }
            }
        }
    }

    // Process ECDSA constraints
    // Thats really huge,  2^21 edges for each ECDSA constraint
    auto process_ecdsa_constraints = [this](const std::vector<acir_format::EcdsaConstraint>& ecdsa_constraints) {
        for (const auto& constraint : ecdsa_constraints) {
            for (const auto& hashed_message : constraint.hashed_message) {
                for (const auto& signature : constraint.signature) {
                    for (const auto& pub_x_index : constraint.pub_x_indices) {
                        for (const auto& pub_y_index : constraint.pub_y_indices) {
                            add_variable_connection(hashed_message, signature);
                            add_variable_connection(hashed_message, pub_x_index);
                            add_variable_connection(hashed_message, pub_y_index);
                            add_variable_connection(hashed_message, constraint.predicate.index);
                            add_variable_connection(signature, pub_x_index);
                            add_variable_connection(signature, pub_y_index);
                            add_variable_connection(signature, constraint.predicate.index);
                            add_variable_connection(pub_x_index, pub_y_index);
                            add_variable_connection(pub_x_index, constraint.predicate.index);
                            add_variable_connection(pub_y_index, constraint.predicate.index);
                            add_variable_connection(pub_x_index, constraint.result);
                            add_variable_connection(pub_y_index, constraint.result);
                            add_variable_connection(constraint.predicate.index, constraint.result);
                        }
                    }
                }
            }
        }
    };
    process_ecdsa_constraints(constraint_system.ecdsa_k1_constraints);
    process_ecdsa_constraints(constraint_system.ecdsa_r1_constraints);

    // Process Blake2s constraints
    for (const auto& constraint : constraint_system.blake2s_constraints) {
        for (const auto& input : constraint.inputs) {
            for (const auto& result : constraint.result) {
                add_variable_connection(input.blackbox_input.index, result);
            }
        }
    }

    // Process Blake3 constraints
    for (const auto& constraint : constraint_system.blake3_constraints) {
        for (const auto& input : constraint.inputs) {
            for (const auto& result : constraint.result) {
                add_variable_connection(input.blackbox_input.index, result);
            }
        }
    }

    // Process Keccak permutations constraints
    for (const auto& constraint : constraint_system.keccak_permutations) {
        for (const auto& state : constraint.state) {
            for (const auto& result : constraint.result) {
                add_variable_connection(state.index, result);
            }
        }
    }

    // Process Poseidon2 permutations constraints
    for (const auto& constraint : constraint_system.poseidon2_constraints) {
        for (const auto& state : constraint.state) {
            for (const auto& result : constraint.result) {
                add_variable_connection(state.index, result);
            }
        }
    }

    // Process MultiScalarMul constraints
    for (const auto& constraint : constraint_system.multi_scalar_mul_constraints) {
        for (const auto& point : constraint.points) {
            for (const auto& scalar : constraint.scalars) {
                add_variable_connection(point.index, scalar.index);
                add_variable_connection(point.index, constraint.predicate.index);
                add_variable_connection(scalar.index, constraint.predicate.index);
                add_variable_connection(constraint.predicate.index, constraint.out_point_x);
                add_variable_connection(constraint.predicate.index, constraint.out_point_y);
                add_variable_connection(constraint.predicate.index, constraint.out_point_is_infinite);
                add_variable_connection(constraint.out_point_x, constraint.out_point_y);
                add_variable_connection(constraint.out_point_x, constraint.out_point_is_infinite);
                add_variable_connection(constraint.out_point_y, constraint.out_point_is_infinite);
                add_variable_connection(constraint.out_point_x, point.index);
                add_variable_connection(constraint.out_point_y, point.index);
                add_variable_connection(constraint.out_point_is_infinite, point.index);
            }
        }
    }

    // Process EC_ADD constraints
    // I wish I could iterate over structure fields...
    for (const auto& constraint : constraint_system.ec_add_constraints) {
        // input1_x with others
        add_variable_connection(constraint.input1_x.index, constraint.input1_y.index);
        add_variable_connection(constraint.input1_x.index, constraint.input1_infinite.index);
        add_variable_connection(constraint.input1_x.index, constraint.input2_x.index);
        add_variable_connection(constraint.input1_x.index, constraint.input2_y.index);
        add_variable_connection(constraint.input1_x.index, constraint.input2_infinite.index);
        add_variable_connection(constraint.input1_x.index, constraint.predicate.index);
        add_variable_connection(constraint.input1_x.index, constraint.result_x);
        add_variable_connection(constraint.input1_x.index, constraint.result_y);
        add_variable_connection(constraint.input1_x.index, constraint.result_infinite);
        // input1_y with others (we can exclude input1_x)
        add_variable_connection(constraint.input1_y.index, constraint.input1_infinite.index);
        add_variable_connection(constraint.input1_y.index, constraint.input2_x.index);
        add_variable_connection(constraint.input1_y.index, constraint.input2_y.index);
        add_variable_connection(constraint.input1_y.index, constraint.input2_infinite.index);
        add_variable_connection(constraint.input1_y.index, constraint.predicate.index);
        add_variable_connection(constraint.input1_y.index, constraint.result_x);
        add_variable_connection(constraint.input1_y.index, constraint.result_y);
        add_variable_connection(constraint.input1_y.index, constraint.result_infinite);

        // input1_infinite with others (exclude input1_x and input1_y)
        add_variable_connection(constraint.input1_infinite.index, constraint.input2_x.index);
        add_variable_connection(constraint.input1_infinite.index, constraint.input2_y.index);
        add_variable_connection(constraint.input1_infinite.index, constraint.input2_infinite.index);
        add_variable_connection(constraint.input1_infinite.index, constraint.predicate.index);
        add_variable_connection(constraint.input1_infinite.index, constraint.result_x);
        add_variable_connection(constraint.input1_infinite.index, constraint.result_y);
        add_variable_connection(constraint.input1_infinite.index, constraint.result_infinite);

        // input2_x with others (exclude input1_x and input1_y and input1_infinite)
        add_variable_connection(constraint.input2_x.index, constraint.input2_y.index);
        add_variable_connection(constraint.input2_x.index, constraint.input2_infinite.index);
        add_variable_connection(constraint.input2_x.index, constraint.predicate.index);
        add_variable_connection(constraint.input2_x.index, constraint.result_x);
        add_variable_connection(constraint.input2_x.index, constraint.result_y);
        add_variable_connection(constraint.input2_x.index, constraint.result_infinite);

        // input2_y with others (exclude input1_x and input1_y and input1_infinite and input2_x)
        add_variable_connection(constraint.input2_y.index, constraint.input2_infinite.index);
        add_variable_connection(constraint.input2_y.index, constraint.predicate.index);
        add_variable_connection(constraint.input2_y.index, constraint.result_x);
        add_variable_connection(constraint.input2_y.index, constraint.result_y);
        add_variable_connection(constraint.input2_y.index, constraint.result_infinite);

        // input2_infinite with others (exclude input1_x and input1_y and input1_infinite and input2_x and input2_y)
        add_variable_connection(constraint.input2_infinite.index, constraint.predicate.index);
        add_variable_connection(constraint.input2_infinite.index, constraint.result_x);
        add_variable_connection(constraint.input2_infinite.index, constraint.result_y);
        add_variable_connection(constraint.input2_infinite.index, constraint.result_infinite);

        // predicate with others (exclude input1_x and input1_y and input1_infinite and input2_x and input2_y and
        // input2_infinite)
        add_variable_connection(constraint.predicate.index, constraint.result_x);
        add_variable_connection(constraint.predicate.index, constraint.result_y);
        add_variable_connection(constraint.predicate.index, constraint.result_infinite);

        // result_x with others (exclude input1_x and input1_y and input1_infinite and input2_x and input2_y and
        // input2_infinite and predicate)
        add_variable_connection(constraint.result_x, constraint.result_y);
        add_variable_connection(constraint.result_x, constraint.result_infinite);

        // result_y with others (exclude input1_x and input1_y and input1_infinite and input2_x and input2_y and
        // input2_infinite and predicate and result_x)
        add_variable_connection(constraint.result_y, constraint.result_infinite);
    }

    // Process Recursion constraints
    auto process_recursion_constraints =
        [this](const std::vector<acir_format::RecursionConstraint>& recursion_constraints) {
            for (const auto& constraint : recursion_constraints) {
                for (const auto& key : constraint.key) {
                    for (const auto& proof : constraint.proof) {
                        for (const auto& public_input : constraint.public_inputs) {
                            add_variable_connection(key, proof);
                            add_variable_connection(key, public_input);
                            add_variable_connection(key, constraint.key_hash);
                            add_variable_connection(key, constraint.predicate.index);
                            // Proof type is the constant
                            add_variable_connection(proof, public_input);
                            add_variable_connection(proof, constraint.key_hash);
                            add_variable_connection(proof, constraint.predicate.index);
                            add_variable_connection(public_input, constraint.key_hash);
                            add_variable_connection(public_input, constraint.predicate.index);
                            add_variable_connection(constraint.key_hash, constraint.predicate.index);
                        }
                    }
                }
            }
        };
    process_recursion_constraints(constraint_system.honk_recursion_constraints);
    process_recursion_constraints(constraint_system.avm_recursion_constraints);
    process_recursion_constraints(constraint_system.hn_recursion_constraints);
    process_recursion_constraints(constraint_system.chonk_recursion_constraints);

    // Process Quad constraints
    auto process_quad_constraints = [this](const std::vector<acir_format::QuadConstraint>& quad_constraints) {
        for (const auto& constraint : quad_constraints) {
            add_variable_connection(constraint.a, constraint.b);
            add_variable_connection(constraint.a, constraint.c);
            add_variable_connection(constraint.a, constraint.d);
            add_variable_connection(constraint.b, constraint.c);
            add_variable_connection(constraint.b, constraint.d);
            add_variable_connection(constraint.c, constraint.d);
        }
    };
    process_quad_constraints(constraint_system.quad_constraints);

    // Process Big Quad constraints
    for (const auto& constraint : constraint_system.big_quad_constraints) {
        process_quad_constraints(constraint);
    };

    // Process Block constraints
    for (const auto& constraint : constraint_system.block_constraints) {
        for (const auto& init_idx : constraint.init) {
            for (const auto& mem_op : constraint.trace) {
                add_variable_connection(init_idx, mem_op.index.index);
                add_variable_connection(init_idx, mem_op.value.index);
                add_variable_connection(mem_op.index.index, mem_op.value.index);
            }
        }
    };
}

uint32_t AcirGraph::get_components_count()
{
    std::unordered_set<uint32_t> visited;
    uint32_t components_count = 0;

    for (const auto& [vertex, _] : adjacency_list) {
        if (visited.contains(vertex)) {
            continue;
        }
        components_count += 1;

        std::vector<uint32_t> stack;
        stack.push_back(vertex);
        visited.insert(vertex);

        while (!stack.empty()) {
            uint32_t current = stack.back();
            stack.pop_back();

            auto it = adjacency_list.find(current);
            if (it == adjacency_list.end()) {
                continue;
            }

            for (uint32_t neighbor : it->second) {
                if (!visited.contains(neighbor)) {
                    visited.insert(neighbor);
                    stack.push_back(neighbor);
                }
            }
        }
    }

    return components_count;
}

void AcirGraph::add_variable_connection(uint32_t variable_1, uint32_t variable_2)
{
    adjacency_list[variable_1].insert(variable_2);
    adjacency_list[variable_2].insert(variable_1);
}

} // namespace cdg
