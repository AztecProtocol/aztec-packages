#include "./graph_description_acir.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include <algorithm>
#include <queue>
#include <unordered_map>
#include <unordered_set>

using namespace acir_format;
using namespace bb;
using namespace poseidon2_helpers;
using namespace sha256_helpers;

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

/**
 * @brief Check if a gate is an inverse gate (w_l * w_r = 1)
 *
 * Checks whether the gate at (block_idx, gate_idx) encodes the constraint w_l * w_r = 1,
 * which enforces that w_r is the multiplicative inverse of w_l.
 *
 */
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

/**
 * @brief Check if a gate is a boolean gate (w_l² - w_l = 0, i.e. w_l ∈ {0, 1})
 *
 */
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
std::vector<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_range_list_unconstrained_gates(
    const CircuitBuilder::RangeList& range_list)
{
    auto unconstrained_gates = sha256_helpers::find_unconstrained_arithmetic_gates(builder);
    std::vector<size_t> result;
    uint32_t range_tag = range_list.range_tag;

    auto& arith = builder.blocks.arithmetic;
    for (size_t gate_idx : unconstrained_gates) {
        std::array<uint32_t, 4> wire_indices = {
            arith.w_l()[gate_idx], arith.w_r()[gate_idx], arith.w_o()[gate_idx], arith.w_4()[gate_idx]
        };
        for (uint32_t wire_idx : wire_indices) {
            uint32_t real_idx = builder.real_variable_index[wire_idx];
            uint32_t tag = builder.real_variable_tags[real_idx];
            if (tag == range_tag && range_tag != bb::DEFAULT_TAG) {
                result.push_back(gate_idx);
                break;
            }
        }
    }
    return result;
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
 * Then BB creates intermediate witnesses during constraints creation. In order to collect all
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
            add_witness_if_not_constant(input, witness_indices);
        }
        for (uint32_t result : constraint->result) {
            witness_indices.insert(result);
        }
        break;
    }
    case AcirConstraintType::BLAKE3: {
        const auto* constraint = std::get<const Blake3Constraint*>(constraint_info.ptr);
        for (const auto& input : constraint->inputs) {
            add_witness_if_not_constant(input, witness_indices);
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
        const auto* constraint = std::get<const QuadConstraint*>(constraint_info.ptr);
        witness_indices.insert(constraint->a);
        witness_indices.insert(constraint->b);
        witness_indices.insert(constraint->c);
        witness_indices.insert(constraint->d);
        break;
    }
    case AcirConstraintType::BIG_QUAD: {
        const auto* constraint = std::get<const BigQuadConstraint*>(constraint_info.ptr);
        for (const auto& gate : *constraint) {
            if (gate.a != bb::stdlib::IS_CONSTANT) {
                witness_indices.insert(gate.a);
            }
            if (gate.b != bb::stdlib::IS_CONSTANT) {
                witness_indices.insert(gate.b);
            }
            if (gate.c != bb::stdlib::IS_CONSTANT) {
                witness_indices.insert(gate.c);
            }
            if (gate.d != bb::stdlib::IS_CONSTANT) {
                witness_indices.insert(gate.d);
            }
        }
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
        std::unordered_set<uint32_t> prev_constraint_witnesses;
        std::unordered_set<uint32_t> next_constraint_witnesses;
        auto next_it = std::next(it);
        if (next_it != opcode_constraint_map.end()) {
            next_constraint_witnesses = collect_witnesses_from_constraint(next_it->first);
        }
        if (it != opcode_constraint_map.begin()) {
            auto prev_it = std::prev(it);
            prev_constraint_witnesses = collect_witnesses_from_constraint(prev_it->first);
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
        case AcirConstraintType::BIG_QUAD:
            result = process_big_quad_constraints(constraint_info.ptr);
            break;
        case AcirConstraintType::POSEIDON2:
            result = process_poseidon2s_constraints(constraint_info.ptr);
            break;
        case AcirConstraintType::SHA256_COMPRESSION:
            result = process_sha256compression_constraint(constraint_info.ptr);
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
    std::vector<uint256_t> acc_a(num_accumulators), acc_b(num_accumulators);

    for (size_t i = 0; i < num_accumulators; i++) {
        size_t gate_idx = init_gate_idx + 1 + i;
        acc_a[i] = static_cast<uint256_t>(builder.get_variable(builder.blocks.lookup.w_l()[gate_idx]));
        acc_b[i] = static_cast<uint256_t>(builder.get_variable(builder.blocks.lookup.w_r()[gate_idx]));
    }

    std::vector<uint256_t> slice_a(num_accumulators), slice_b(num_accumulators);

    for (size_t i = 0; i < num_accumulators - 1; i++) {
        slice_a[i] = acc_a[i] - step_size * acc_a[i + 1];
        slice_b[i] = acc_b[i] - step_size * acc_b[i + 1];
    }
    slice_a[num_accumulators - 1] = acc_a[num_accumulators - 1];
    slice_b[num_accumulators - 1] = acc_b[num_accumulators - 1];

    uint256_t a_high = 0;
    uint256_t b_high = 0;
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
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_quad_constraints(const ConstraintPtr& ptr,
                                                                       bool include_next_gate_w_4)
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
        auto& arith_block = builder.blocks.arithmetic;
        std::vector<std::pair<size_t, size_t>> var_gates = analyzer.get_variable_gates(*var_it);
        for (const auto& [blk_idx, gate_idx] : var_gates) {
            if (&builder.blocks.get()[blk_idx] == &arith_block) {
                std::vector<uint32_t> gate_indices{ builder.blocks.arithmetic.w_l()[gate_idx],
                                                    builder.blocks.arithmetic.w_r()[gate_idx],
                                                    builder.blocks.arithmetic.w_o()[gate_idx],
                                                    builder.blocks.arithmetic.w_4()[gate_idx] };
                gate_indices = analyzer.to_real(gate_indices);
                if (include_next_gate_w_4) {
                    // Non-last gate in BigQuadConstraint: q_arith=2, q_m is doubled, validates next w4
                    bool correct_q_arith = builder.blocks.arithmetic.q_arith()[gate_idx] == FF(2);

                    // For q_arith=2 gates, create_big_mul_add_gate doubles q_m
                    std::array<FF, 6> expected_scalings = scalings;
                    expected_scalings[0] = FF(2) * scalings[0];

                    bool correct_selectors =
                        expected_scalings == std::array<FF, 6>({ builder.blocks.arithmetic.q_m()[gate_idx],
                                                                 builder.blocks.arithmetic.q_1()[gate_idx],
                                                                 builder.blocks.arithmetic.q_2()[gate_idx],
                                                                 builder.blocks.arithmetic.q_3()[gate_idx],
                                                                 builder.blocks.arithmetic.q_4()[gate_idx],
                                                                 builder.blocks.arithmetic.q_c()[gate_idx] });
                    bool correct_variables = std::equal(constraint_variables.begin(),
                                                        constraint_variables.end(),
                                                        gate_indices.begin(),
                                                        gate_indices.end());
                    if (correct_q_arith && correct_selectors && correct_variables) {
                        // Validate that the next gate's w_4 carries the correct accumulated value
                        FF next_w4_wire_value = builder.get_variable(constraint_variables[0]) *
                                                    builder.get_variable(constraint_variables[1]) *
                                                    constraint->mul_scaling +
                                                builder.get_variable(constraint_variables[0]) * constraint->a_scaling +
                                                builder.get_variable(constraint_variables[1]) * constraint->b_scaling +
                                                builder.get_variable(constraint_variables[2]) * constraint->c_scaling +
                                                builder.get_variable(constraint_variables[3]) * constraint->d_scaling +
                                                constraint->const_scaling;
                        next_w4_wire_value = -next_w4_wire_value;
                        bool correct_next_w4 =
                            builder.get_variable(builder.blocks.arithmetic.w_4()[gate_idx + 1]) == next_w4_wire_value;
                        bool correct_next_d_scaling = builder.blocks.arithmetic.q_4()[gate_idx + 1] == FF(-1);
                        if (correct_next_w4 && correct_next_d_scaling) {
                            is_gate_created = true;
                            break;
                        }
                    }
                } else {
                    // Standalone QUAD constraint or last gate in BigQuadConstraint: q_arith=1
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
                        is_gate_created = true;
                        break;
                    }
                } // continue looking for a gate for the given constraint
            }
        }
    }
    return is_gate_created;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_big_quad_constraints(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const acir_format::BigQuadConstraint*>(ptr);
    for (size_t i = 0; i < constraint->size(); i++) {
        bool is_last = (i == constraint->size() - 1);
        ConstraintPtr gate_ptr = static_cast<const acir_format::QuadConstraint*>(&(*constraint)[i]);
        if (!process_quad_constraints(gate_ptr, /*include_next_gate_w_4=*/!is_last)) {
            return false;
        }
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_logic_constraints(const ConstraintPtr& ptr)
{
    // Logic constraint consists of constraint.a, constraint.b, constraint.result, constraint.num_bits,
    // constraint.is_xor_gate
    const auto* constraint = std::get<const acir_format::LogicConstraint*>(ptr);
    auto& lookup_block = builder.blocks.lookup;
    auto& arithmetic_block = builder.blocks.arithmetic;
    // When both operands are constants, create_logic_constraint computes the result
    // at compile time without creating lookup gates. Verify the result directly.
    if (constraint->a.is_constant && constraint->b.is_constant) {
        uint256_t a_val(constraint->a.value);
        uint256_t b_val(constraint->b.value);
        uint256_t expected = constraint->is_xor_gate ? (a_val ^ b_val) : (a_val & b_val);
        uint256_t actual(builder.get_variable(constraint->result));
        return expected == actual;
    }

    const size_t num_chunks = (constraint->num_bits + 31) / 32;
    std::vector<uint32_t> result_chunks;
    uint32_t current_res = analyzer.to_real(constraint->result);

    // Trace through accumulation chain to collect result_chunks
    while (result_chunks.size() < num_chunks - 1) {
        auto res_gates = analyzer.get_variable_gates(current_res);
        bool found_gate = false;
        for (auto [blk_idx, gate] : res_gates) {
            if (&builder.blocks.get()[blk_idx] != &arithmetic_block) {
                continue;
            }
            if (analyzer.to_real(arithmetic_block.w_o()[gate]) == current_res) {
                // Found gate for operator +=, extract result_chunk and previous result witness index
                result_chunks.push_back(arithmetic_block.w_r()[gate]);
                current_res = analyzer.to_real(arithmetic_block.w_l()[gate]);
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
            if (&builder.blocks.get()[blk_idx] != &lookup_block) {
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
                    if (table_index >= lookup_tables.size()) {
                        correct_lookup = false;
                        break;
                    }
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
std::optional<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_block_index(const auto& block) const
{
    const auto& blocks_data = builder.blocks.get();
    for (size_t i = 0; i < blocks_data.size(); i++) {
        if (std::addressof(blocks_data[i]) == std::addressof(block)) {
            return i;
        }
    }
    return std::nullopt;
}

template <typename FF, typename CircuitBuilder>
std::optional<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_gate_matching_state(
    auto& block, const std::array<uint32_t, CircuitBuilder::NUM_WIRES>& state)
{
    std::optional<size_t> block_idx_opt = find_block_index(block);
    BB_ASSERT_EQ(block_idx_opt.has_value(), true);
    size_t block_idx = *block_idx_opt;
    const auto& block_gates = analyzer.get_variable_gates(state[0]);
    for (const auto& [block_id, gate_idx] : block_gates) {
        if (block_id == block_idx) {
            std::array<uint32_t, CircuitBuilder::NUM_WIRES> wires{
                block.w_l()[gate_idx], block.w_r()[gate_idx], block.w_o()[gate_idx], block.w_4()[gate_idx]
            };
            if (wires == state) {
                return gate_idx;
            }
        }
    }
    return std::nullopt;
}

/**
 * @brief Validates Poseidon2 constraint by checking circuit structure matches expected algorithm.
 *
 * Poseidon2 permutation structure:
 *   1. Initial matrix multiplication layer (6 arithmetic gates)
 *   2. First half of external rounds (rounds 0 to rounds_f/2 - 1)
 *   3. Internal rounds (rounds_f/2 to rounds_f/2 + rounds_p - 1)
 *   4. Second half of external rounds (rounds_f/2 + rounds_p to total_rounds - 1)
 *
 * Matrix multiplication layer creates 6 gates with this structure:
 *   | Gate | w_l  | w_r  | w_o  | w_4  | q_1 | q_2 | q_3 | q_4 | q_m | q_arith |Operation                    |
 *   |------|------|------|------|------|-----|-----|-----|-----|-----|-----|-----------------------------|
 *   | 0    | s[0] | s[1] | s[3] | tmp1 | 1   | 1   | 2   | -1  | 0   | 1   |tmp1 = s[0] + s[1] + 2*s[3]  |
 *   | 1    | s[2] | s[1] | s[3] | tmp2 | 1   | 2   | 1   | -1  | 0   | 1   |tmp2 = s[2] + 2*s[1] + s[3]  |
 *   | 2    | tmp2 | s[0] | s[1] | v2   | 1   | 4   | 4   | -1  | 0   | 1   |v2 = tmp2 + 4*s[0] + 4*s[1]  |
 *   | 3    | v2   | tmp1 | v1   | zero | 1   | 1   | -1  | 0   | 0   | 1   |v1 = v2 + tmp1               |
 *   | 4    | tmp1 | s[2] | s[3] | v4   | 1   | 4   | 4   | -1  | 0   | 1   |v4 = tmp1 + 4*s[2] + 4*s[3]  |
 *   | 5    | v4   | tmp2 | v3   | zero | 1   | 1   | -1  | 0   | 0   | 1   |v3 = v4 + tmp2               |
 *
 * Output state after matrix layer: [v1, v2, v3, v4]
 *
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_poseidon2s_constraints(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const acir_format::Poseidon2Constraint*>(ptr);
    const std::vector<WitnessOrConstant<FF>>& state = constraint->state;
    const std::vector<uint32_t>& result = constraint->result;
    constexpr size_t num_matrix_multiplication_gates = 6;
    const std::vector<FF> matrix_layer_selectors{
        FF(1), FF(1), FF(2),  FF(-1), FF(0), FF(1), // gate 0: tmp1 = s[0] + s[1] + 2*s[3]
        FF(1), FF(2), FF(1),  FF(-1), FF(0), FF(1), // gate 1: tmp2 = s[2] + 2*s[1] + s[3]
        FF(1), FF(4), FF(4),  FF(-1), FF(0), FF(1), // gate 2: v2 = tmp2 + 4*s[0] + 4*s[1]
        FF(1), FF(1), FF(-1), FF(0),  FF(0), FF(1), // gate 3: v1 = v2 + tmp1
        FF(1), FF(4), FF(4),  FF(-1), FF(0), FF(1), // gate 4: v4 = tmp1 + 4*s[2] + 4*s[3]
        FF(1), FF(1), FF(-1), FF(0),  FF(0), FF(1)  // gate 5: v3 = v4 + tmp2
    };

    // Convert state witnesses to real indices
    std::vector<uint32_t> state_indices;
    state_indices.reserve(state.size());
    for (size_t i = 0; i < state.size(); ++i) {
        state_indices.emplace_back(analyzer.to_real(state[i].index));
    }

    auto& arith_block = builder.blocks.arithmetic;
    auto& q1 = arith_block.q_1();
    auto& q2 = arith_block.q_2();
    auto& q3 = arith_block.q_3();
    auto& q4 = arith_block.q_4();
    auto& qc = arith_block.q_c();
    std::optional<size_t> arith_block_idx_opt = find_block_index(arith_block);
    BB_ASSERT_EQ(arith_block_idx_opt.has_value(), true);
    size_t arith_block_idx = *arith_block_idx_opt;

    // Step 1: Validate matrix multiplication layer (6 arithmetic gates)
    const auto& gates = analyzer.get_variable_gates(state_indices[0]);
    std::optional<std::array<uint32_t, CircuitBuilder::NUM_WIRES>> matrix_state;
    for (const auto& [block_idx, gate_idx] : gates) {
        // Filter: only process gates in the arithmetic block
        if (block_idx != arith_block_idx) {
            continue;
        }
        // Bounds check: ensure 6 sequential gates are available
        if (gate_idx + num_matrix_multiplication_gates > arith_block.size()) {
            continue;
        }
        bool correct_matrix_layer = true;
        // Find start gate for matrix multiplication layer
        // Gate 0 structure: w_l=s[0], w_r=s[1], w_o=s[3] (see matrix table above)
        if (arith_block.w_l()[gate_idx] == state_indices[0] && arith_block.w_r()[gate_idx] == state_indices[1] &&
            arith_block.w_o()[gate_idx] == state_indices[3]) {
            std::array<std::array<uint32_t, CircuitBuilder::NUM_WIRES>, num_matrix_multiplication_gates> wires;
            std::vector<FF> selectors;
            // collect q1, q2, q3, q4, q_m, q_arith => final size of the vector == (NUM_wires + 2) * 6
            selectors.reserve((CircuitBuilder::NUM_WIRES + 2) * num_matrix_multiplication_gates);

            for (size_t i = 0; i < num_matrix_multiplication_gates; ++i) {
                size_t cur_gate = gate_idx + i;
                wires[i] = { arith_block.w_l()[cur_gate],
                             arith_block.w_r()[cur_gate],
                             arith_block.w_o()[cur_gate],
                             arith_block.w_4()[cur_gate] };
                // Verify correctness of q_c selector for all gates can be done using equation correctness check
                std::array<FF, CircuitBuilder::NUM_WIRES> values{ builder.get_variable(arith_block.w_l()[cur_gate]),
                                                                  builder.get_variable(arith_block.w_r()[cur_gate]),
                                                                  builder.get_variable(arith_block.w_o()[cur_gate]),
                                                                  builder.get_variable(arith_block.w_4()[cur_gate]) };
                FF equation = q1[cur_gate] * values[w_l] + q2[cur_gate] * values[w_r] + q3[cur_gate] * values[w_o] +
                              q4[cur_gate] * values[w_4] + qc[cur_gate];
                correct_matrix_layer &= equation == FF::zero();
                selectors.emplace_back(q1[cur_gate]);
                selectors.emplace_back(q2[cur_gate]);
                selectors.emplace_back(q3[cur_gate]);
                selectors.emplace_back(q4[cur_gate]);
                selectors.emplace_back(arith_block.q_m()[cur_gate]);
                selectors.emplace_back(arith_block.q_arith()[cur_gate]);
            }

            correct_matrix_layer &= (selectors == matrix_layer_selectors);
            correct_matrix_layer &= all_equal(state_indices[0], wires[tmp1][w_l], wires[v2][w_r]);
            correct_matrix_layer &= all_equal(state_indices[1], wires[tmp2][w_r], wires[v2][w_o]);
            correct_matrix_layer &= all_equal(state_indices[2], wires[v4][w_r], wires[tmp2][w_l]);
            correct_matrix_layer &= all_equal(state_indices[3], wires[tmp1][w_o], wires[tmp2][w_o], wires[v4][w_o]);
            correct_matrix_layer &= all_equal(wires[tmp1][w_4], wires[v1][w_r], wires[v4][w_l]);
            correct_matrix_layer &= all_equal(wires[tmp2][w_4], wires[v2][w_l], wires[v3][w_r]);
            correct_matrix_layer &= all_equal(wires[v2][w_4], wires[v1][w_l]);
            correct_matrix_layer &= all_equal(wires[v4][w_4], wires[v3][w_l]);

            if (correct_matrix_layer) {
                matrix_state = { wires[v1][w_o], wires[v2][w_4], wires[v3][w_o], wires[v4][w_4] };
                break;
            }
        }
    }

    if (!matrix_state.has_value()) {
        return false;
    }
    {
        // Setup for round validation
        auto& state = matrix_state.value();
        using Poseidon2Perm = bb::stdlib::Poseidon2Permutation<CircuitBuilder>;
        using Params = crypto::Poseidon2Bn254ScalarFieldParams;
        static constexpr size_t rounds_f_half = Poseidon2Perm::rounds_f / 2;
        static constexpr size_t rounds_p = Poseidon2Perm::rounds_p;

        auto& ext_block = builder.blocks.poseidon2_external;
        auto& int_block = builder.blocks.poseidon2_internal;

        // Validates external rounds in poseidon2_external block.
        // External rounds apply S-box to all 4 state elements and use full round constants (q_1-q_4).
        // Each gate stores input state in wires; output state is in next row's wires.
        auto validate_external_rounds = [&](size_t start_idx, size_t num_rounds, size_t round_offset) -> bool {
            for (size_t round = 0; round < num_rounds; ++round) {
                size_t gate_idx = start_idx + round;
                size_t round_idx = round_offset + round;

                // Check: wires match current state, selectors match round constants, gate is enabled
                bool correct = ext_block.w_l()[gate_idx] == state[0] && ext_block.w_r()[gate_idx] == state[1] &&
                               ext_block.w_o()[gate_idx] == state[2] && ext_block.w_4()[gate_idx] == state[3] &&
                               ext_block.q_1()[gate_idx] == Params::round_constants[round_idx][0] &&
                               ext_block.q_2()[gate_idx] == Params::round_constants[round_idx][1] &&
                               ext_block.q_3()[gate_idx] == Params::round_constants[round_idx][2] &&
                               ext_block.q_4()[gate_idx] == Params::round_constants[round_idx][3] &&
                               ext_block.q_poseidon2_external()[gate_idx] == FF::one();

                if (!correct) {
                    return false;
                }

                // Output state is stored in next row (propagate_current_state_to_next_row)
                state = { ext_block.w_l()[gate_idx + 1],
                          ext_block.w_r()[gate_idx + 1],
                          ext_block.w_o()[gate_idx + 1],
                          ext_block.w_4()[gate_idx + 1] };
            }
            return true;
        };

        // Validates internal rounds in poseidon2_internal block.
        // Internal rounds apply S-box only to state[0] and use single round constant (q_1).
        auto validate_internal_rounds = [&](size_t start_idx, size_t num_rounds, size_t round_offset) -> bool {
            for (size_t round = 0; round < num_rounds; ++round) {
                size_t gate_idx = start_idx + round;
                size_t round_idx = round_offset + round;

                // Check: wires match current state, q_1 matches round constant, gate is enabled
                bool correct = int_block.w_l()[gate_idx] == state[0] && int_block.w_r()[gate_idx] == state[1] &&
                               int_block.w_o()[gate_idx] == state[2] && int_block.w_4()[gate_idx] == state[3] &&
                               int_block.q_1()[gate_idx] == Params::round_constants[round_idx][0] &&
                               int_block.q_poseidon2_internal()[gate_idx] == FF::one();

                if (!correct) {
                    return false;
                }

                // Output state is stored in next row
                state = { int_block.w_l()[gate_idx + 1],
                          int_block.w_r()[gate_idx + 1],
                          int_block.w_o()[gate_idx + 1],
                          int_block.w_4()[gate_idx + 1] };
            }
            return true;
        };

        // Step 2: Validate first half of external rounds (rounds 0 to rounds_f/2 - 1)
        // Find gate where current_state appears, then validate sequential round gates
        auto start_ext = find_gate_matching_state(ext_block, state);
        if (!start_ext || !validate_external_rounds(*start_ext, rounds_f_half, 0)) {
            return false;
        }

        // Step 3: Validate internal rounds (rounds_f/2 to rounds_f/2 + rounds_p - 1)
        auto start_int = find_gate_matching_state(int_block, state);
        if (!start_int || !validate_internal_rounds(*start_int, rounds_p, rounds_f_half)) {
            return false;
        }

        // Step 4: Validate second half of external rounds (rounds_f/2 + rounds_p to total_rounds - 1)
        auto start_final = find_gate_matching_state(ext_block, state);
        if (!start_final || !validate_external_rounds(*start_final, rounds_f_half, rounds_f_half + rounds_p)) {
            return false;
        }

        // Step 5: Verify final output matches constraint->result
        // Output may be connected via copy constraints (same real_variable_index)
        for (size_t i = 0; i < result.size(); ++i) {
            uint32_t final_witness = state[i];
            uint32_t result_witness = result[i];

            if (final_witness != result_witness) {
                uint32_t final_real = builder.real_variable_index[final_witness];
                uint32_t result_real = builder.real_variable_index[result_witness];
                if (final_real != result_real) {
                    return false;
                }
            }
        }
    }

    return true;
}

template <typename FF, typename CircuitBuilder>
std::optional<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_sha256_add_normalize_gate(uint32_t result_real,
                                                                                              uint32_t hash_real)
{
    static constexpr FF NEG_TWO_POW_32 = -FF(uint256_t(1) << 32);
    auto& arith = builder.blocks.arithmetic;
    std::optional<size_t> arith_block_idx_opt = find_block_index(arith);
    BB_ASSERT_EQ(arith_block_idx_opt.has_value(), true);
    std::vector<std::pair<size_t, size_t>> result_gates = analyzer.get_variable_gates(result_real);
    for (const auto& [blk_idx, gate_idx] : result_gates) {
        if (blk_idx != *arith_block_idx_opt) {
            continue;
        }
        if (analyzer.to_real(arith.w_4()[gate_idx]) != result_real) {
            continue;
        }
        // Check hash_values[i] is in w_r of same gate
        if (analyzer.to_real(arith.w_r()[gate_idx]) != hash_real) {
            continue;
        }
        // Check add_normalize selectors
        if (arith.q_1()[gate_idx] == FF::one() && arith.q_2()[gate_idx] == FF::one() &&
            arith.q_3()[gate_idx] == NEG_TWO_POW_32 && arith.q_4()[gate_idx] == FF::neg_one() &&
            arith.q_m()[gate_idx].is_zero() && arith.q_arith()[gate_idx] == FF::one()) {
            return gate_idx;
        }
    }
    return std::nullopt;
}

template <typename FF, typename CircuitBuilder>
std::optional<std::vector<size_t>> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_sha256_decompose_gate(
    uint32_t result_real)
{
    static constexpr FF DECOMPOSE_Q2 = FF(uint256_t(0x4000));
    static constexpr FF DECOMPOSE_Q3 = FF(uint256_t(0x10000000));
    auto& arith = builder.blocks.arithmetic;
    std::optional<size_t> arith_block_idx_opt = find_block_index(arith);
    BB_ASSERT_EQ(arith_block_idx_opt.has_value(), true);
    auto gates = analyzer.get_variable_gates(result_real);
    std::vector<size_t> gate_indices;
    for (const auto& [blk_idx, gate_idx] : gates) {
        if (&builder.blocks.get()[blk_idx] != &arith) {
            continue;
        }
        if (analyzer.to_real(arith.w_4()[gate_idx]) != result_real) {
            continue;
        }
        if (arith.q_1()[gate_idx] == FF::one() && arith.q_2()[gate_idx] == DECOMPOSE_Q2 &&
            arith.q_3()[gate_idx] == DECOMPOSE_Q3 && arith.q_4()[gate_idx] == FF::neg_one() &&
            arith.q_arith()[gate_idx] == FF::one()) {
            // Verify sublimbs (w_l, w_r, w_o) have range tags to distinguish from
            // internal SHA256 big_add gates that use the same selector pattern.
            bool sublimbs_in_range_list = true;
            for (uint32_t wire : { arith.w_l()[gate_idx], arith.w_r()[gate_idx], arith.w_o()[gate_idx] }) {
                uint32_t real = builder.real_variable_index[wire];
                if (builder.real_variable_tags[real] == bb::DEFAULT_TAG) {
                    sublimbs_in_range_list = false;
                    break;
                }
            }
            if (sublimbs_in_range_list) {
                gate_indices.emplace_back(gate_idx);
            }
        }
    }
    if (gate_indices.empty()) {
        return std::nullopt;
    }
    return gate_indices;
}

template <typename FF, typename CircuitBuilder>
std::vector<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_sha256_arithmetic_subtrace(
    const std::unordered_set<uint32_t>& seed_witnesses,
    const Sha256Compression* constraint,
    const std::unordered_set<uint32_t>& constraint_boundary)
{
    auto& arith_block = builder.blocks.arithmetic;
    std::optional<size_t> target_block_idx_opt = find_block_index(arith_block);
    BB_ASSERT_EQ(target_block_idx_opt.has_value(), true);
    // Working set: starts with seeds (excluding zero_idx), grows as new wires are discovered
    uint32_t zero_real = analyzer.to_real(builder.zero_idx());
    std::unordered_set<uint32_t> seen;
    std::vector<uint32_t> worklist;
    for (uint32_t w : seed_witnesses) {
        if (w != zero_real && seen.insert(w).second) {
            worklist.push_back(w);
        }
    }

    auto try_add = [&](uint32_t wire_idx) {
        uint32_t real_idx = analyzer.to_real(wire_idx);
        if (real_idx != zero_real && !constraint_boundary.contains(real_idx) && seen.insert(real_idx).second) {
            worklist.push_back(real_idx);
        }
    };

    std::set<size_t> gate_set;
    size_t subtrace_min_gate = arith_block.size();
    size_t subtrace_max_gate = 0;

    // Phase 1: collect intermediate witnesses only, track min and max gates as approximate subtrace start
    for (size_t i = 0; i < worklist.size(); ++i) {
        if (constraint_boundary.contains(worklist[i])) {
            continue;
        }
        const auto& gates = analyzer.get_variable_gates(worklist[i]);
        for (const auto& [block_idx, gate_idx] : gates) {
            if (block_idx != *target_block_idx_opt) {
                continue;
            }
            gate_set.insert(gate_idx);
            subtrace_min_gate = std::min(subtrace_min_gate, gate_idx);
            subtrace_max_gate = std::max(subtrace_max_gate, gate_idx);
            try_add(arith_block.w_l()[gate_idx]);
            try_add(arith_block.w_r()[gate_idx]);
            try_add(arith_block.w_o()[gate_idx]);
            try_add(arith_block.w_4()[gate_idx]);
        }
    }

    info("subtrace_min_gate == ", subtrace_min_gate);
    info("subtrace_max_gate == ", subtrace_max_gate);

    // Phase 2: Targeted arithmetic gates for constraint witnesses
    // Range-constrained witnesses: inputs[0], hash_values[3], hash_values[7] have decompose gates.
    // These are the first gates created by sha256_block, so pick the gate closest to subtrace start.
    // Cycle for will be organized in reverse order (inputs[0], hash_values[7], hash_values[3]). It helps to keep
    // invariant that decompose gate for current witness index is the closest gate to subtrace_min_gate
    // In the case of 1 constraint range-constrained witnesses will be in one decompose gate that we can add in the
    // gate_set without additional checks. Also we have to update subtrace_min_gate to get more accurate start of the
    // subtrace. What's more, inputs[0] and hash_values[3, 7] can share same witness index but in any case decompose
    // gates will be created, so distance between best gate and subtrace_min_gate should be > 0
    std::set<size_t> used_decompose_gates;
    for (uint32_t rc_witness : { analyzer.to_real(constraint->inputs[0].index),
                                 analyzer.to_real(constraint->hash_values[7].index),
                                 analyzer.to_real(constraint->hash_values[3].index) }) {
        auto decompose_gates_opt = find_sha256_decompose_gate(rc_witness);
        if (!decompose_gates_opt.has_value()) {
            continue;
        }
        if (decompose_gates_opt->size() > 1) {
            size_t best_gate = 0;
            for (size_t g : *decompose_gates_opt) {
                if (used_decompose_gates.contains(g)) {
                    continue;
                }
                if (g < subtrace_min_gate && g > best_gate) {
                    best_gate = g;
                }
            }
            if (best_gate != 0) {
                gate_set.insert(best_gate);
                used_decompose_gates.insert(best_gate);
                subtrace_min_gate = std::min(best_gate, subtrace_min_gate);
            }
            info("witness index rc == ", rc_witness, " best_gate == ", best_gate, "\n-----------");
        } else {
            gate_set.insert(decompose_gates_opt->front());
            subtrace_min_gate = std::min(subtrace_min_gate, decompose_gates_opt->front());
            info("subtrace_min_gate == ", subtrace_min_gate);
        }
    }
    // result[i]: decompose gate + add_normalize gate.
    // In the case of chained witnesses result[i] will be hash_init[i] for the next constraint.
    // They are last gates created by sha256_block, so pick the gate that is closest to subtrace end.
    // In the case of 1 constraint all result[i] should be one decompose gate that we can add in the gate_set without
    // additional checks. Also we have to update subtrace_max_gate to get more accurate end of the subtrace.
    auto itR = constraint->result.rbegin();
    auto itH = constraint->hash_values.rbegin();
    for (; itR != constraint->result.rend() && itH != constraint->hash_values.rend(); ++itR, ++itH) {
        auto decompose_gates_opt = find_sha256_decompose_gate(analyzer.to_real(*itR));
        if (decompose_gates_opt.has_value()) {
            if (decompose_gates_opt->size() > 1) {
                size_t best_gate = std::numeric_limits<size_t>::max();
                for (size_t g : *decompose_gates_opt) {
                    if (used_decompose_gates.contains(g)) {
                        continue;
                    }
                    if (g > subtrace_max_gate && g < best_gate) {
                        best_gate = g;
                    }
                }
                if (best_gate != std::numeric_limits<size_t>::max()) {
                    gate_set.insert(best_gate);
                    used_decompose_gates.insert(best_gate);
                    subtrace_max_gate = std::max(best_gate, subtrace_max_gate);
                }
                info("witness index ", *itR, " best_gate == ", best_gate, "\n-----------");
                gate_set.insert(best_gate);
            } else {
                gate_set.insert(decompose_gates_opt->front());
                subtrace_max_gate = std::max(subtrace_max_gate, decompose_gates_opt->front());
            }
        }
        std::optional<size_t> add_normalize_gate_opt =
            find_sha256_add_normalize_gate(analyzer.to_real(*itR), analyzer.to_real((*itH).index));
        if (add_normalize_gate_opt.has_value()) {
            gate_set.emplace(*add_normalize_gate_opt);
        }
    }
    return std::vector<size_t>(gate_set.begin(), gate_set.end());
}

/**
 * @brief Find the exact gate boundaries of a SHA256 subcircuit in both lookup and arithmetic blocks.
 *
 * Algorithm:
 * - Lookup block: Find first lookup gate (from last_lookup_gate_processed) containing hash_values[1]'s
 *   real index in w_l. Size is a known constant (2896 gates for standard all-witness SHA256).
 * - Arithmetic block: Find minimum arithmetic gate index from all constraint witnesses.
 */
template <typename FF, typename CircuitBuilder>
std::optional<Sha256SubcircuitBoundaries> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_sha256_subcircuit_boundaries(
    const acir_format::Sha256Compression* constraint)
{
    // Find lookup subtrace start: search for hash_values[1]'s real index in w_l of lookup block
    uint32_t hv1_real = analyzer.to_real(constraint->hash_values[1].index);
    auto& lookup_block = builder.blocks.lookup;

    std::vector<std::pair<size_t, size_t>> hv1_gates = analyzer.get_variable_gates(hv1_real);
    std::optional<size_t> lookup_start;
    lookup_start.emplace(lookup_block.size());
    for (const auto& block_gate : hv1_gates) {
        if (&builder.blocks.get()[block_gate.first] == &lookup_block &&
            analyzer.to_real(lookup_block.w_l()[block_gate.second]) == hv1_real) {
            lookup_start = std::min(*lookup_start, block_gate.second);
        }
    }
    if (*lookup_start == lookup_block.size()) {
        return std::nullopt;
    }

    std::unordered_set<uint32_t> constraint_boundary;
    for (size_t i = 0; i < constraint->result.size(); ++i) {
        constraint_boundary.insert(analyzer.to_real(constraint->result[i]));
    }

    // Collect ALL variables from the lookup subtrace as BFS seeds (including constraint witnesses).
    // Also build a set of lookup-subtrace intermediates (excluding constraint witnesses and zero_idx)
    // used later to filter out gates belonging to other constraints.
    uint32_t zero_real = analyzer.to_real(builder.zero_idx());
    std::unordered_set<uint32_t> sha256_vars;
    std::unordered_set<uint32_t> lookup_intermediates;
    std::unordered_set<uint32_t> all_constraint_witnesses;
    for (size_t i = 0; i < constraint->inputs.size(); ++i) {
        all_constraint_witnesses.insert(analyzer.to_real(constraint->inputs[i].index));
    }
    for (size_t i = 0; i < constraint->hash_values.size(); ++i) {
        all_constraint_witnesses.insert(analyzer.to_real(constraint->hash_values[i].index));
    }
    for (size_t i = 0; i < constraint->result.size(); ++i) {
        all_constraint_witnesses.insert(analyzer.to_real(constraint->result[i]));
    }
    for (size_t i = *lookup_start; i < *lookup_start + SHA256_LOOKUP_GATE_COUNT; ++i) {
        std::array<uint32_t, CircuitBuilder::NUM_WIRES> wires = {
            lookup_block.w_l()[i], lookup_block.w_r()[i], lookup_block.w_o()[i], lookup_block.w_4()[i]
        };
        // debug function to print info about gate
        bool gate_has_constraint_witness = false;
        for (uint32_t wire : wires) {
            uint32_t real = analyzer.to_real(wire);
            if (all_constraint_witnesses.contains(real)) {
                gate_has_constraint_witness = true;
                break;
            }
        }
        for (size_t w = 0; w < wires.size(); ++w) {
            uint32_t real = analyzer.to_real(wires[w]);
            sha256_vars.emplace(real);
            if (real != zero_real && !all_constraint_witnesses.contains(real)) {
                lookup_intermediates.insert(real);
            }
        }
        if (gate_has_constraint_witness) {
            static constexpr std::array<const char*, 4> wire_names = { "w_l", "w_r", "w_o", "w_4" };
            std::string gate_info = "  lookup gate " + std::to_string(i) + ":";
            for (size_t w = 0; w < 4; ++w) {
                uint32_t real = analyzer.to_real(wires[w]);
                gate_info += " " + std::string(wire_names[w]) + "=" + std::to_string(real);
                if (all_constraint_witnesses.contains(real)) {
                    gate_info += "(CW)";
                }
            }
            info(gate_info);
        }
    }

    // Debug: show which lookup-gathered vars are constraint witnesses (potential bleed sources)
    info("DEBUG find_sha256_subcircuit_boundaries:");
    info("  lookup_start=", *lookup_start, " sha256_vars.size()=", sha256_vars.size());
    info("  all_constraint_witnesses.size()=", all_constraint_witnesses.size());
    info("  lookup_intermediates.size()=", lookup_intermediates.size());
    info("  constraint_boundary (result[i] reals):");
    for (uint32_t cb : constraint_boundary) {
        info("    ", cb);
    }
    size_t seed_is_constraint_witness = 0;
    for (uint32_t v : sha256_vars) {
        if (all_constraint_witnesses.contains(v)) {
            seed_is_constraint_witness++;
        }
    }
    info("  seeds that are constraint witnesses: ", seed_is_constraint_witness);

    // find all arithmetic gates connected to SHA256 variables via wire expansion
    // Pass all_constraint_witnesses as boundary: BFS skips them to prevent cross-constraint bleed,
    // then adds their gates in a separate non-expanding phase.
    auto all_arith_gates = find_sha256_arithmetic_subtrace(sha256_vars, constraint, all_constraint_witnesses);
    if (all_arith_gates.empty()) {
        return std::nullopt;
    }

    auto& arith = builder.blocks.arithmetic;

    // find filler gates via range_list tag lookup.
    //  Collect tags from wires in Phase 1 gates, then find matching range_list filler gates.
    std::unordered_set<uint32_t> bounded_wire_tags;
    for (size_t g : all_arith_gates) {
        for (uint32_t wire_idx : { arith.w_l()[g], arith.w_r()[g], arith.w_o()[g], arith.w_4()[g] }) {
            uint32_t real_idx = builder.real_variable_index[wire_idx];
            uint32_t tag = builder.real_variable_tags[real_idx];
            if (tag != bb::DEFAULT_TAG) {
                bounded_wire_tags.insert(tag);
            }
        }
    }

    std::set<size_t> filler_gate_set;
    for (const auto& [target_range, range_list] : builder.range_lists) {
        if (bounded_wire_tags.count(range_list.range_tag)) {
            auto filler_gates = find_range_list_unconstrained_gates(range_list);
            filler_gate_set.insert(filler_gates.begin(), filler_gates.end());
        }
    }

    // Classify Phase 1 gates: separate constrained (non-zero selectors) from unconstrained
    Sha256SubcircuitBoundaries boundaries;
    boundaries.lookup = { *lookup_start, *lookup_start + SHA256_LOOKUP_GATE_COUNT - 1 };
    for (size_t g : all_arith_gates) {
        if (is_gate_unconstrained(arith, g)) {
            boundaries.unconstrained_gates.push_back(g);
        } else {
            boundaries.constrained_gates.push_back(g);
        }
    }
    // Add filler gates not already found by Phase 1
    for (size_t g : filler_gate_set) {
        if (!std::binary_search(all_arith_gates.begin(), all_arith_gates.end(), g)) {
            boundaries.unconstrained_gates.push_back(g);
        }
    }
    std::sort(boundaries.unconstrained_gates.begin(), boundaries.unconstrained_gates.end());
    return boundaries;
}

/**
 * @brief Find and validate an add_two gate given its three input witness indices.
 *
 * add_two(a, b, c) computes a + b + c and creates either:
 *   - big_mul_add_gate (3 non-const): w_l=a, w_r=b, w_o=c, w_4=result, q_4=-1
 *   - add_gate (2 non-const): w_l=first, w_r=second, w_o=result, q_3=-1
 *   - no gate (0-1 non-const): constants absorbed into field_t wrapper
 *
 * Use IS_CONSTANT for any argument that is constant.
 *
 * Validates: q_m=0, q_arith=1, structural output selector, gate equation == 0.
 * Returns gate index and the output wire's real variable index.
 */
template <typename FF, typename CircuitBuilder>
std::optional<AddTwoGateInfo> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_and_validate_add_two_gate(uint32_t a_real,
                                                                                                      uint32_t b_real,
                                                                                                      uint32_t c_real)
{
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;
    const bool a_const = (a_real == CONST);
    const bool b_const = (b_real == CONST);
    const bool c_const = (c_real == CONST);
    const size_t num_non_const =
        static_cast<size_t>(!a_const) + static_cast<size_t>(!b_const) + static_cast<size_t>(!c_const);

    // 0 or 1 non-constant: no gate created by add_two (constants absorbed into field_t wrapper)
    if (num_non_const < 2) {
        return std::nullopt;
    }

    auto& arith_block = builder.blocks.arithmetic;

    if (num_non_const == 3) {
        // big_mul_add_gate: w_l=a, w_r=b, w_o=c, w_4=result
        // Exact wire positions known — search directly.
        auto search_gates = analyzer.get_variable_gates(a_real);
        for (const auto& [blk_idx, gate_idx] : search_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith_block) {
                continue;
            }
            if (!arith_block.q_m()[gate_idx].is_zero() || arith_block.q_arith()[gate_idx] != FF(1)) {
                continue;
            }
            if (arith_block.q_4()[gate_idx] != FF::neg_one()) {
                continue;
            }
            uint32_t w_l_real = analyzer.to_real(arith_block.w_l()[gate_idx]);
            uint32_t w_r_real = analyzer.to_real(arith_block.w_r()[gate_idx]);
            uint32_t w_o_real = analyzer.to_real(arith_block.w_o()[gate_idx]);
            if (w_l_real != a_real || w_r_real != b_real || w_o_real != c_real) {
                continue;
            }
            // Equation check
            FF q_1 = arith_block.q_1()[gate_idx];
            FF q_2 = arith_block.q_2()[gate_idx];
            FF q_3 = arith_block.q_3()[gate_idx];
            FF q_4 = arith_block.q_4()[gate_idx];
            FF q_c = arith_block.q_c()[gate_idx];
            FF wl = builder.get_variable(arith_block.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith_block.w_r()[gate_idx]);
            FF wo = builder.get_variable(arith_block.w_o()[gate_idx]);
            FF w4 = builder.get_variable(arith_block.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero()) {
                continue;
            }
            return AddTwoGateInfo{ .gate_idx = gate_idx,
                                   .result_real = analyzer.to_real(arith_block.w_4()[gate_idx]) };
        }
    } else {
        // 2 non-const: add_gate created by operator+ chain. Wire order is not fixed.
        // Use position-independent find_arithmetic_gate, then verify add_gate selectors.
        std::vector<uint32_t> non_const_witnesses;
        if (!a_const) non_const_witnesses.push_back(a_real);
        if (!b_const) non_const_witnesses.push_back(b_real);
        if (!c_const) non_const_witnesses.push_back(c_real);

        auto candidates = find_arithmetic_gate(non_const_witnesses);
        for (size_t gi : candidates) {
            // Verify add_gate structure: q_3==-1, q_4==0
            if (arith_block.q_3()[gi] != FF::neg_one() || !arith_block.q_4()[gi].is_zero()) {
                continue;
            }
            return AddTwoGateInfo{ .gate_idx = gi,
                                   .result_real = analyzer.to_real(arith_block.w_o()[gi]) };
        }
    }

    return std::nullopt;
}

/**
 * @brief Find an add_two gate by searching backward from a known output witness.
 *
 * Matches two structural patterns:
 *   big_mul_add_gate: q_m=0, q_4=-1, q_arith=1 → output in w_4
 *   add_gate:         q_m=0, q_3=-1, q_4=0, q_arith=1 → output in w_o
 *
 * Validates gate equation == 0. Returns all wire real indices.
 */
template <typename FF, typename CircuitBuilder>
std::optional<AddTwoGateWires> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_add_two_gate_by_output(
    uint32_t output_real)
{
    auto& arith_block = builder.blocks.arithmetic;
    auto gates = analyzer.get_variable_gates(output_real);

    for (const auto& [blk_idx, gate_idx] : gates) {
        if (&builder.blocks.get()[blk_idx] != &arith_block) {
            continue;
        }

        FF q_m = arith_block.q_m()[gate_idx];
        FF q_arith = arith_block.q_arith()[gate_idx];
        if (!q_m.is_zero() || q_arith != FF::one()) {
            continue;
        }

        FF q_3 = arith_block.q_3()[gate_idx];
        FF q_4 = arith_block.q_4()[gate_idx];

        bool is_big_mul_add = (q_4 == FF::neg_one());
        bool is_add_gate = (q_3 == FF::neg_one() && q_4.is_zero());

        if (!is_big_mul_add && !is_add_gate) {
            continue;
        }

        uint32_t w_l_real = analyzer.to_real(arith_block.w_l()[gate_idx]);
        uint32_t w_r_real = analyzer.to_real(arith_block.w_r()[gate_idx]);
        uint32_t w_o_real = analyzer.to_real(arith_block.w_o()[gate_idx]);
        uint32_t w_4_real = analyzer.to_real(arith_block.w_4()[gate_idx]);

        // Verify output is on the expected wire
        if (is_big_mul_add && w_4_real != output_real) {
            continue;
        }
        if (is_add_gate && w_o_real != output_real) {
            continue;
        }

        // Gate equation check
        FF q_1 = arith_block.q_1()[gate_idx];
        FF q_2 = arith_block.q_2()[gate_idx];
        FF q_c = arith_block.q_c()[gate_idx];
        FF w_l_val = builder.get_variable(arith_block.w_l()[gate_idx]);
        FF w_r_val = builder.get_variable(arith_block.w_r()[gate_idx]);
        FF w_o_val = builder.get_variable(arith_block.w_o()[gate_idx]);
        FF w_4_val = builder.get_variable(arith_block.w_4()[gate_idx]);

        FF equation = q_m * w_l_val * w_r_val + q_1 * w_l_val + q_2 * w_r_val + q_3 * w_o_val + q_4 * w_4_val + q_c;
        if (equation != FF::zero()) {
            continue;
        }

        return AddTwoGateWires{ .gate_idx = gate_idx,
                                .w_l_real = w_l_real,
                                .w_r_real = w_r_real,
                                .w_o_real = w_o_real,
                                .w_4_real = w_4_real,
                                .is_big_mul_add = is_big_mul_add };
    }

    return std::nullopt;
}

/**
 * @brief Find an arithmetic gate matching specified wire positions.
 *
 * Searches for a gate where each non-IS_CONSTANT argument matches the corresponding wire.
 * IS_CONSTANT = "don't care" for that position. Validates q_m=0, q_arith=1, equation == 0.
 * Searches via the first non-IS_CONSTANT wire using get_variable_gates.
 */
template <typename FF, typename CircuitBuilder>
std::vector<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_arithmetic_gate(
    const std::vector<uint32_t>& gate_witnesses)
{
    std::vector<size_t> result;
    if (gate_witnesses.empty()) {
        return result;
    }

    auto& arith_block = builder.blocks.arithmetic;
    auto gates = analyzer.get_variable_gates(gate_witnesses[0]);

    for (const auto& [blk_idx, gate_idx] : gates) {
        if (&builder.blocks.get()[blk_idx] != &arith_block) {
            continue;
        }

        FF q_m = arith_block.q_m()[gate_idx];
        FF q_arith = arith_block.q_arith()[gate_idx];
        if (!q_m.is_zero() || q_arith != FF::one()) {
            continue;
        }

        uint32_t w_l_real = analyzer.to_real(arith_block.w_l()[gate_idx]);
        uint32_t w_r_real = analyzer.to_real(arith_block.w_r()[gate_idx]);
        uint32_t w_o_real = analyzer.to_real(arith_block.w_o()[gate_idx]);
        uint32_t w_4_real = analyzer.to_real(arith_block.w_4()[gate_idx]);
        std::unordered_set<uint32_t> gate_vars{ w_l_real, w_r_real, w_o_real, w_4_real };
        bool all_found = true;
        for (const auto& witness : gate_witnesses) {
            if (!gate_vars.contains(witness)) {
                all_found = false;
                break;
            }
        }
        if (!all_found) {
            continue;
        }
        // Gate equation check
        FF q_1 = arith_block.q_1()[gate_idx];
        FF q_2 = arith_block.q_2()[gate_idx];
        FF q_3 = arith_block.q_3()[gate_idx];
        FF q_4 = arith_block.q_4()[gate_idx];
        FF q_c = arith_block.q_c()[gate_idx];

        FF wl_val = builder.get_variable(arith_block.w_l()[gate_idx]);
        FF wr_val = builder.get_variable(arith_block.w_r()[gate_idx]);
        FF wo_val = builder.get_variable(arith_block.w_o()[gate_idx]);
        FF w4_val = builder.get_variable(arith_block.w_4()[gate_idx]);

        FF equation = q_m * wl_val * wr_val + q_1 * wl_val + q_2 * wr_val + q_3 * wo_val + q_4 * w4_val + q_c;
        if (equation != FF::zero()) {
            continue;
        }

        result.push_back(gate_idx);
    }

    return result;
}

/**
 * @brief Validate the choose_with_sigma1 component of a SHA256 compression round.
 *
 * choose_with_sigma1(e, f, g) computes Σ₁(e) + Ch(e,f,g) using:
 *   1. CH_INPUT lookup on e.normal (3 lookup gates, if e is non-constant)
 *   2. Arithmetic gate(s): first add_two (rotation + sparse combination), second add_two ("anchor gate")
 *   3. CH_OUTPUT lookup on choose_result_sparse (16 lookup gates)
 *
 * The anchor gate combines xor_result with 2*f.sparse + 3*g.sparse. Its structure:
 *
 * All 3 non-constant → big_mul_add_gate (4 wires):
 *   w_l=xor_result, w_r=f.sparse, w_o=g.sparse, w_4=result
 *   q_m=0, q_2=2, q_3=3, q_4=-1, q_arith=1
 *
 * 1 constant → add_gate (3 wires):
 *   Two non-constant witnesses on w_l/w_r, result on w_o
 *   q_m=0, q_3=-1, q_4=0, q_arith=1, q_c absorbs constant contribution
 *
 * 2 constants → no anchor gate (field_t wrapper carries constants to lookup)
 * 3 constants → entire block absent
 *
 * Validation: wire indices checked against expected witnesses, non-q_c selectors checked
 * against expected values, q_c validated implicitly via gate equation == 0.
 */
template <typename FF, typename CircuitBuilder>
Sha256SparseFunctionResult StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_sha256_sparse_function(
    const Sha256SparseFunctionParams& params)
{
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;
    const bool primary_const = (params.primary_sparse_real == CONST);
    const bool fst_const = (params.fst_sparse_real == CONST);
    const bool snd_const = (params.snd_sparse_real == CONST);

    auto& lookup_block = builder.blocks.lookup;
    auto& arith_block = builder.blocks.arithmetic;
    uint32_t discovered_primary_sparse = CONST; // set by first lambda when primary non-const

    // Lambda: when primary (e/a) non-const, validates INPUT lookup + first add_two + second add_two.
    // Sets discovered_primary_sparse. Returns choose_result_sparse witness index, or CONST on failure.
    auto validate_primary_non_constant_case = [&]() -> uint32_t {
        // Find INPUT lookup: primary_real in w_l, validate by hashing selectors
        auto primary_gates = analyzer.get_variable_gates(params.primary_sparse_real);
        for (const auto& [blk_idx, lookup_gate_idx] : primary_gates) {
            if (&builder.blocks.get()[blk_idx] != &lookup_block ||
                analyzer.to_real(lookup_block.w_l()[lookup_gate_idx]) != params.primary_sparse_real) {
                continue;
            }

            // Hash INPUT lookup selectors to confirm we found the right table
            std::vector<size_t> gate_indices{};
            for (size_t i = 0; i < params.input_gate_count; i++) {
                gate_indices.emplace_back(lookup_gate_idx + i);
            }
            size_t hash = sha256_helpers::compute_selector_hash_without_table_index(0, lookup_block, gate_indices);
            if (params.input_selector_hash != 0 && hash != params.input_selector_hash) {
                continue;
            }

            // Extract witnesses from lookup gates:
            //   rotation_result = C3[0] = w_o of gate 0
            //   sparse          = C2[0] = w_r of gate 0
            //   sparse_L        = C2[2] (choose) or C2[1] (majority) = w_r of gate +2 or +1
            uint32_t rotation_result = lookup_block.w_o()[lookup_gate_idx];
            uint32_t sparse = lookup_block.w_r()[lookup_gate_idx];
            discovered_primary_sparse = sparse; // propagate for the return value
            size_t sparse_L_offset = (params.type == Sha256SparseFunctionType::CHOOSE) ? 2 : 1;
            uint32_t sparse_L = lookup_block.w_r()[lookup_gate_idx + sparse_L_offset];

            // Find first add_two gate: rotation_result, sparse, sparse_L → xor_result
            // All 3 are non-const witnesses from the lookup — this MUST be a big_mul_add_gate.
            // find_and_validate_add_two_gate checks q_4==-1 for 3 non-const internally.
            auto first_add_two = find_and_validate_add_two_gate(rotation_result, sparse, sparse_L);
            if (!first_add_two.has_value()) {
                info("SHA256 ",
                     params.log_prefix,
                     ": first add_two gate not found (INPUT hash matched but gate missing)");
                return CONST;
            }
            uint32_t xor_result = first_add_two->result_real;
            size_t first_gate_idx = first_add_two->gate_idx;

            // Find second add_two: xor_result.add_two(fst_sparse, snd_sparse) → choose_result_sparse
            // find_and_validate_add_two_gate handles both 3-non-const (big_mul_add) and
            // 2-non-const (add_gate via find_arithmetic_gate) cases internally.
            uint32_t choose_result_sparse = CONST;

            if (!fst_const || !snd_const) {
                auto snd_add_two =
                    find_and_validate_add_two_gate(xor_result, params.fst_sparse_real, params.snd_sparse_real);
                if (snd_add_two.has_value()) {
                    choose_result_sparse = snd_add_two->result_real;
                    // Consecutive gate check: second add_two should immediately follow first
                    if (snd_add_two->gate_idx != first_gate_idx + 1) {
                        info("SHA256 ",
                             params.log_prefix,
                             ": second add_two gate not consecutive (expected ",
                             first_gate_idx + 1,
                             " got ",
                             snd_add_two->gate_idx,
                             ")");
                    }
                }
            } else {
                // Both fst and snd const → no gate, choose_result_sparse wraps xor_result
                choose_result_sparse = xor_result;
            }

            return choose_result_sparse;
        }
        return CONST;
    };

    // Lambda: when primary (e/a) is constant. No INPUT lookup, no first add_two.
    // Only the second add_two may exist depending on fst/snd constants.
    // Returns choose_result_sparse witness index, or CONST on failure / all constant.
    auto validate_primary_constant_case = [&]() -> uint32_t {
        if (fst_const && snd_const) {
            // All three constant → no gates at all
            return CONST;
        } else if (!fst_const && !snd_const) {
            // Both fst and snd non-const, primary const → add_gate via find_and_validate_add_two_gate
            auto gate = find_and_validate_add_two_gate(CONST, params.fst_sparse_real, params.snd_sparse_real);
            if (gate.has_value()) {
                return gate->result_real;
            }
            info("SHA256 ", params.log_prefix, ": anchor gate not found (primary const, fst+snd non-const)");
            return CONST;
        } else {
            // Exactly 1 of fst/snd non-const → no gate, sole non-const witness IS choose_result_sparse
            return !fst_const ? params.fst_sparse_real : params.snd_sparse_real;
        }
    };

    // Lambda: validate OUTPUT lookup (CH_OUTPUT or MAJ_OUTPUT) for choose_result_sparse.
    // Returns Sha256SparseFunctionResult with discovered_result (= w_r of first OUTPUT gate).
    auto validate_output_lookup = [&](uint32_t choose_result_sparse) -> Sha256SparseFunctionResult {
        if (choose_result_sparse == CONST) {
            // All constant — no OUTPUT lookup
            return { .valid = true, .primary_sparse_real = CONST, .result_real = CONST };
        }

        auto crs_gates = analyzer.get_variable_gates(choose_result_sparse);
        uint32_t discovered_result = CONST;
        size_t match_count = 0;
        bool correct_hash = false;

        // Check if choose_result_sparse needs normalization.
        // normalize() creates: w_l=original, w_r=zero_idx, w_o=normalized, w_4=zero_idx
        //   q_2=0, q_3=-1, q_arith=1
        // After matching the pattern, verify w_o appears in the lookup block's w_l.
        uint32_t lookup_input_real = choose_result_sparse;
        uint32_t zero_real = analyzer.to_real(builder.zero_idx());
        for (const auto& [blk_idx, gate_idx] : crs_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith_block) {
                continue;
            }
            // Selector pattern check
            if (analyzer.to_real(arith_block.w_l()[gate_idx]) != choose_result_sparse ||
                analyzer.to_real(arith_block.w_r()[gate_idx]) != zero_real ||
                analyzer.to_real(arith_block.w_4()[gate_idx]) != zero_real ||
                arith_block.q_2()[gate_idx] != FF::zero() ||
                arith_block.q_3()[gate_idx] != FF::neg_one() ||
                arith_block.q_arith()[gate_idx] != FF::one()) {
                continue;
            }
            // Connectivity check: w_o should appear in lookup w_l
            uint32_t normalized = analyzer.to_real(arith_block.w_o()[gate_idx]);
            auto norm_gates = analyzer.get_variable_gates(normalized);
            for (const auto& [bi2, gi2] : norm_gates) {
                if (&builder.blocks.get()[bi2] == &lookup_block &&
                    analyzer.to_real(lookup_block.w_l()[gi2]) == normalized) {
                    lookup_input_real = normalized;
                    break;
                }
            }
            if (lookup_input_real != choose_result_sparse) break;
        }

        // Search lookup by the (possibly normalized) witness
        auto lookup_gates = (lookup_input_real != choose_result_sparse)
            ? analyzer.get_variable_gates(lookup_input_real)
            : crs_gates;

        for (const auto& [blk_idx, gate_idx] : lookup_gates) {
            if (&builder.blocks.get()[blk_idx] != &lookup_block ||
                analyzer.to_real(lookup_block.w_l()[gate_idx]) != lookup_input_real) {
                continue;
            }
            match_count++;
            BB_ASSERT(match_count == 1); // choose_result_sparse should appear in exactly one OUTPUT lookup

            std::vector<size_t> gate_indices{};
            for (size_t i = 0; i < params.output_gate_count; i++) {
                gate_indices.emplace_back(gate_idx + i);
            }
            size_t hash = sha256_helpers::compute_selector_hash_without_table_index(0, lookup_block, gate_indices);
            correct_hash = (hash == params.output_selector_hash);
            discovered_result = analyzer.to_real(lookup_block.w_r()[gate_idx]);
        }

        if (match_count == 0) {
            info("SHA256 ", params.log_prefix, ": OUTPUT lookup not found for choose_result_sparse");
            return { .valid = false, .primary_sparse_real = CONST, .result_real = CONST };
        }

        return { .valid = correct_hash, .primary_sparse_real = CONST, .result_real = discovered_result };
    };

    uint32_t choose_result_sparse;
    if (!primary_const) {
        choose_result_sparse = validate_primary_non_constant_case();
    } else {
        choose_result_sparse = validate_primary_constant_case();
    }

    info("[SPARSE_RESULT] ", params.log_prefix, ": choose_result_sparse=", choose_result_sparse,
         " primary_sparse=", discovered_primary_sparse);
    auto output_result = validate_output_lookup(choose_result_sparse);
    return { .valid = output_result.valid,
             .primary_sparse_real = discovered_primary_sparse,
             .result_real = output_result.result_real };
}

/**
 * @brief Find and hash-validate a contiguous block of lookup gates.
 *
 * The output of read_from_1_to_2_table (lookup[C2][0]) appears in w_r of the first gate.
 * Locates that gate via output_real, then hashes gate_count consecutive gates' selectors.
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_sha256_lookup_block(uint32_t output_real,
                                                                           size_t gate_count,
                                                                           size_t expected_hash,
                                                                           const char* log_prefix)
{
    auto& lookup_block = builder.blocks.lookup;
    auto gates = analyzer.get_variable_gates(output_real);

    std::optional<size_t> start;
    for (const auto& [blk_idx, gate_idx] : gates) {
        if (&builder.blocks.get()[blk_idx] == &lookup_block &&
            analyzer.to_real(lookup_block.w_r()[gate_idx]) == output_real) {
            start = gate_idx;
            break;
        }
    }

    if (!start.has_value()) {
        info("SHA256 ", log_prefix, ": lookup output not found in w_r");
        return false;
    }

    if (*start + gate_count > lookup_block.size()) {
        info("SHA256 ", log_prefix, ": not enough lookup gates (need ", gate_count, ")");
        return false;
    }

    if (expected_hash != 0) {
        size_t hash = sha256_helpers::compute_selector_hash_without_table_index(0, lookup_block, *start, *start + gate_count - 1);
        if (hash != expected_hash) {
            info("SHA256 ", log_prefix, ": selector hash mismatch: got ", hash);
            return false;
        }
    }

    return true;
}


/**
 * @brief Validate one extend_witness iteration for W[i] (i >= 16, non-constant).
 *
 * Traces backward from W[i] through all extend_witness gates:
 *   9. Reduction: w_out → w_out_raw, divisor 2-bit range check
 *   8. w_out_raw = xor_result.add_two(W[i-16], W[i-7])
 *   7. xor_result = SHA256_WITNESS_OUTPUT lookup on xor_result_sparse
 *   5-6. add_two chains producing xor_result_sparse from left/right sparse limbs
 *   1-2. convert_witness lookups for W[i-15] and W[i-2]
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_extend_witness_iteration(uint32_t w_i_real,
                                                                                const std::array<uint32_t, 64>& w_real,
                                                                                const std::array<bool, 64>& w_const,
                                                                                size_t i)
{
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;
    bool result = true;

    bool w_left_const = w_const[i - 15];
    bool w_right_const = w_const[i - 2];
    bool xor_result_const = w_left_const && w_right_const;

    auto& arith_block = builder.blocks.arithmetic;
    [[maybe_unused]] auto& lookup_block = builder.blocks.lookup;

    // Step 9 lambda: validate reduction (w_out → w_out_raw)
    auto step9_reduction = [&](uint32_t w_i) -> std::optional<uint32_t> {
        static constexpr FF INV_POW_TWO = FF(2).pow(32).invert();
        static constexpr FF NEG_INV_POW_TWO = -INV_POW_TWO;

        auto w_i_gates = analyzer.get_variable_gates(w_i);
        for (const auto& [blk_idx, gate_idx] : w_i_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith_block) continue;
            if (!arith_block.q_m()[gate_idx].is_zero() || arith_block.q_arith()[gate_idx] != FF::one()) continue;

            FF q_1 = arith_block.q_1()[gate_idx];
            FF q_2 = arith_block.q_2()[gate_idx];
            FF q_3 = arith_block.q_3()[gate_idx];
            if (q_1 != INV_POW_TWO || q_2 != NEG_INV_POW_TWO || q_3 != FF::neg_one()) continue;

            if (analyzer.to_real(arith_block.w_r()[gate_idx]) != w_i) continue;

            // Equation check
            FF q_4 = arith_block.q_4()[gate_idx];
            FF q_c = arith_block.q_c()[gate_idx];
            FF wl = builder.get_variable(arith_block.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith_block.w_r()[gate_idx]);
            FF wo = builder.get_variable(arith_block.w_o()[gate_idx]);
            FF w4 = builder.get_variable(arith_block.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero()) continue;

            // Validate divisor range constraint (2 bits).
            // divisor (w_o) has non-zero additive_constant, so create_range_constraint(2)
            // normalizes it first. Find the normalize gate, then check the normalized
            // witness is in the range list.
            uint32_t divisor_raw = arith_block.w_o()[gate_idx];
            uint32_t divisor_real = analyzer.to_real(divisor_raw);
            uint32_t zero_real = analyzer.to_real(builder.zero_idx());

            // Search for normalize gate: w_l=divisor, w_r=zero, w_o=normalized, q_2=0, q_3=-1
            auto divisor_gates = analyzer.get_variable_gates(divisor_real);
            for (const auto& [bi2, gi2] : divisor_gates) {
                if (&builder.blocks.get()[bi2] != &arith_block) continue;
                if (analyzer.to_real(arith_block.w_l()[gi2]) != divisor_real) continue;
                if (analyzer.to_real(arith_block.w_r()[gi2]) != zero_real) continue;
                if (analyzer.to_real(arith_block.w_4()[gi2]) != zero_real) continue;
                if (arith_block.q_2()[gi2] != FF::zero() ||
                    arith_block.q_3()[gi2] != FF::neg_one() ||
                    arith_block.q_arith()[gi2] != FF::one()) continue;

                // Found normalize gate. Check normalized witness in range list for target_range=3
                uint32_t normalized_raw = arith_block.w_o()[gi2];
                if (!validate_range_constraint(normalized_raw, 2)) {
                    info("SHA256 extend_witness: divisor range constraint failed after normalization");
                }
                break;
            }

            return analyzer.to_real(arith_block.w_l()[gate_idx]);
        }
        return std::nullopt;
    };

    // --- Step 9: Validate reduction (w_out → w_out_raw) ---
    auto w_out_raw_opt = step9_reduction(w_i_real);
    if (!w_out_raw_opt.has_value()) {
        info("SHA256 extend_witness[", i, "]: step 9 (reduction) failed");
        return false;
    }
    uint32_t w_out_raw_real = *w_out_raw_opt;

    // Step 8 lambda: validate w_out_raw = xor_result.add_two(W[i-16], W[i-7]), discover xor_result
    // We know w_out_raw (the output). Search backward using find_add_two_gate_by_output,
    // then verify known wires (w_16, w_7) and discover xor_result.
    auto step8_w_out_raw = [&](uint32_t w_out_raw, uint32_t w_16, uint32_t w_7,
                               bool xor_const) -> std::optional<uint32_t> {
        const bool w16_const = (w_16 == CONST);
        const bool w7_const = (w_7 == CONST);
        const size_t num_non_const =
            static_cast<size_t>(!xor_const) + static_cast<size_t>(!w16_const) + static_cast<size_t>(!w7_const);

        if (num_non_const == 0) return std::nullopt;
        if (num_non_const == 1) return xor_const ? CONST : w_out_raw;

        // Find the add_two gate by its output
        auto gate = find_add_two_gate_by_output(w_out_raw);
        if (!gate.has_value()) return std::nullopt;

        // Collect gate wires and discover xor_result
        std::array<uint32_t, 4> wires = { gate->w_l_real, gate->w_r_real, gate->w_o_real, gate->w_4_real };
        uint32_t zero_real = analyzer.to_real(builder.zero_idx());

        // Verify known wires are present
        auto wire_present = [&](uint32_t w) {
            for (uint32_t gw : wires) { if (gw == w) return true; }
            return false;
        };
        if (!w16_const && !wire_present(w_16)) return std::nullopt;
        if (!w7_const && !wire_present(w_7)) return std::nullopt;

        // Discover xor_result: the wire that isn't w_16, w_7, w_out_raw, or zero
        for (uint32_t w : wires) {
            if (w != w_16 && w != w_7 && w != w_out_raw && w != zero_real) {
                return w;
            }
        }
        return xor_const ? std::optional<uint32_t>(CONST) : std::nullopt;
    };

    // --- Step 8: Validate w_out_raw add_two gate, discover xor_result ---
    auto xor_result_opt = step8_w_out_raw(w_out_raw_real, w_real[i - 16], w_real[i - 7], xor_result_const);
    if (!xor_result_opt.has_value()) {
        info("SHA256 extend_witness[", i, "]: step 8 (w_out_raw add_two) failed");
        return false;
    }
    uint32_t xor_result_real = *xor_result_opt;

    // --- Step 7: Validate SHA256_WITNESS_OUTPUT lookup ---
    if (xor_result_real != CONST) {
        static constexpr size_t WITNESS_OUTPUT_GATE_COUNT = 11;
        static constexpr size_t SHA256_WITNESS_OUTPUT_HASH = 13451944807746674629ULL;
        bool lookup_ok = validate_sha256_lookup_block(
            xor_result_real, WITNESS_OUTPUT_GATE_COUNT, SHA256_WITNESS_OUTPUT_HASH, "extend_witness_output");
        if (!lookup_ok) {
            info("SHA256 extend_witness[", i, "]: step 7 (WITNESS_OUTPUT lookup) failed");
            result = false;
        }

        // Discover xor_result_sparse from the lookup: it's in w_l of the first gate
        // where xor_result (= lookup[C2][0]) is in w_r
        uint32_t xor_result_sparse_real = CONST;
        auto& lookup_block = builder.blocks.lookup;
        auto xr_gates = analyzer.get_variable_gates(xor_result_real);
        for (const auto& [blk_idx, gate_idx] : xr_gates) {
            if (&builder.blocks.get()[blk_idx] == &lookup_block &&
                analyzer.to_real(lookup_block.w_r()[gate_idx]) == xor_result_real) {
                xor_result_sparse_real = analyzer.to_real(lookup_block.w_l()[gate_idx]);
                break;
            }
        }

        // Steps 5-6 lambda: validate add_two chains for xor_result_sparse
        auto step56_add_two_chains = [&](uint32_t xrs_real, bool wl_const, bool wr_const) -> bool {
            if ((wl_const && wr_const) || xrs_real == CONST) return true;
            bool ok = true;

            if (!wr_const) {
                // Right chain: 3 add_two gates
                auto gate_r3 = find_add_two_gate_by_output(xrs_real);
                if (!gate_r3.has_value()) { return false; }

                uint32_t prev_r2 = CONST;
                if (gate_r3->is_big_mul_add) {
                    prev_r2 = gate_r3->w_l_real;
                } else {
                    auto try_l = find_add_two_gate_by_output(gate_r3->w_l_real);
                    auto try_r = find_add_two_gate_by_output(gate_r3->w_r_real);
                    prev_r2 = try_l.has_value() ? gate_r3->w_l_real
                              : try_r.has_value() ? gate_r3->w_r_real : CONST;
                }
                if (prev_r2 != CONST) {
                    auto gate_r2 = find_add_two_gate_by_output(prev_r2);
                    if (!gate_r2.has_value()) { ok = false; }
                    else {
                        uint32_t prev_r1 = gate_r2->is_big_mul_add ? gate_r2->w_l_real : CONST;
                        if (!gate_r2->is_big_mul_add) {
                            auto tl = find_add_two_gate_by_output(gate_r2->w_l_real);
                            auto tr = find_add_two_gate_by_output(gate_r2->w_r_real);
                            prev_r1 = tl.has_value() ? gate_r2->w_l_real
                                       : tr.has_value() ? gate_r2->w_r_real : CONST;
                        }
                        if (prev_r1 != CONST && !find_add_two_gate_by_output(prev_r1).has_value()) ok = false;
                    }
                }
            }

            if (!wl_const) {
                // Left chain: 2 add_two gates, find left_xor_sparse first
                uint32_t lxs_real = CONST;
                if (!wr_const) {
                    auto gate_r3 = find_add_two_gate_by_output(xrs_real);
                    if (gate_r3.has_value()) {
                        if (gate_r3->is_big_mul_add) { lxs_real = gate_r3->w_o_real; }
                        else {
                            auto tl = find_add_two_gate_by_output(gate_r3->w_l_real);
                            auto tr = find_add_two_gate_by_output(gate_r3->w_r_real);
                            lxs_real = !tl.has_value() ? gate_r3->w_l_real
                                       : !tr.has_value() ? gate_r3->w_r_real : CONST;
                        }
                    }
                } else { lxs_real = xrs_real; }

                if (lxs_real != CONST) {
                    auto gate_l2 = find_add_two_gate_by_output(lxs_real);
                    if (!gate_l2.has_value()) { ok = false; }
                    else {
                        uint32_t prev_l = gate_l2->is_big_mul_add ? gate_l2->w_l_real : CONST;
                        if (!gate_l2->is_big_mul_add) {
                            auto tl = find_add_two_gate_by_output(gate_l2->w_l_real);
                            auto tr = find_add_two_gate_by_output(gate_l2->w_r_real);
                            prev_l = tl.has_value() ? gate_l2->w_l_real
                                     : tr.has_value() ? gate_l2->w_r_real : CONST;
                        }
                        if (prev_l != CONST && !find_add_two_gate_by_output(prev_l).has_value()) ok = false;
                    }
                }
            }
            return ok;
        };

        if (xor_result_sparse_real != CONST) {
            bool chains_ok = step56_add_two_chains(xor_result_sparse_real, w_left_const, w_right_const);
            if (!chains_ok) {
                info("SHA256 extend_witness[", i, "]: steps 5-6 (add_two chains) failed");
                result = false;
            }
        }
    }

    // Step 1-2 lambda: validate convert_witness lookups
    auto step12_convert_witness = [&](uint32_t w, size_t expected_hash) -> std::optional<std::pair<uint32_t, uint32_t>> {
        static constexpr size_t WITNESS_INPUT_GATE_COUNT = 4;
        auto gates = analyzer.get_variable_gates(w);
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] != &lookup_block) continue;
            if (analyzer.to_real(lookup_block.w_l()[gate_idx]) != w) continue;
            if (gate_idx + WITNESS_INPUT_GATE_COUNT > lookup_block.size()) return std::nullopt;
            if (expected_hash != 0) {
                size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
                    0, lookup_block, gate_idx, gate_idx + WITNESS_INPUT_GATE_COUNT - 1);
                if (hash != expected_hash) return std::nullopt;
            }
            return std::make_pair(analyzer.to_real(lookup_block.w_r()[gate_idx]),
                                  analyzer.to_real(lookup_block.w_o()[gate_idx]));
        }
        return std::nullopt;
    };

    // --- Steps 1-2: Validate convert_witness lookups ---
    static constexpr size_t SHA256_WITNESS_INPUT_HASH = 7184092506163549213ULL;

    if (!w_left_const) {
        auto cw_left = step12_convert_witness(w_real[i - 15], SHA256_WITNESS_INPUT_HASH);
        if (!cw_left.has_value()) {
            info("SHA256 extend_witness[", i, "]: step 1 (convert_witness left W[", i - 15, "]) failed");
            result = false;
        }
    }

    if (!w_right_const) {
        auto cw_right = step12_convert_witness(w_real[i - 2], SHA256_WITNESS_INPUT_HASH);
        if (!cw_right.has_value()) {
            info("SHA256 extend_witness[", i, "]: step 2 (convert_witness right W[", i - 2, "]) failed");
            result = false;
        }
    }

    return result;
}

/**
 * @brief Validate one SHA256 compression round and update state for the next round.
 *
 * Validates the following operations:
 *   1. ch = choose_with_sigma1(e, f, g)     — via validate_sha256_sparse_function
 *   2. maj = majority_with_sigma0(a, b, c)  — via validate_sha256_sparse_function
 *   3. T1 = ch.add_two(h, w[i] + K[i])     — via find_and_validate_add_two_gate
 *   4. e_new = add_normalize_unsafe(d, T1)  — via find_sha256_add_normalize_gate
 *   5. a_new = add_normalize_unsafe(T1, maj) — via find_sha256_add_normalize_gate
 *
 * After validation, updates state to reflect the SHA256 round rotation:
 *   h=g, g=f, f=e, e=d+T1, d=c, c=b, b=a, a=T1+maj
 *   Sparse forms: f_sparse=e_sparse (from choose), g_sparse=old_f_sparse,
 *                 b_sparse=a_sparse (from majority), c_sparse=old_b_sparse
 *
 * @param state  Mutable round state (real indices, IS_CONSTANT for constants). Updated in-place.
 * @param w_i_real  Real index of w[i], or IS_CONSTANT if constant.
 * @param round_idx  Round number (0..63) for selecting K[i].
 * @return true if all validations pass.
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_sha256comression_round(Sha256RoundState& state,
                                                                             uint32_t w_i_real,
                                                                             size_t round_idx,
                                                                             uint32_t& discovered_w_i_real)
{
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;
    bool result = true;
    discovered_w_i_real = w_i_real; // default: same as input (for i < 16 or constant case)

    auto idx_str = [](uint32_t idx) -> std::string {
        return idx == bb::stdlib::IS_CONSTANT ? "CONST" : std::to_string(idx);
    };
    info("[ROUND_DEBUG] round ",
         round_idx,
         ": a=",
         idx_str(state.a),
         " b=",
         idx_str(state.b),
         " c=",
         idx_str(state.c),
         " d=",
         idx_str(state.d),
         " e=",
         idx_str(state.e),
         " f=",
         idx_str(state.f),
         " g=",
         idx_str(state.g),
         " h=",
         idx_str(state.h),
         " b_sp=",
         idx_str(state.b_sparse),
         " c_sp=",
         idx_str(state.c_sparse),
         " f_sp=",
         idx_str(state.f_sparse),
         " g_sp=",
         idx_str(state.g_sparse),
         " w_i=",
         idx_str(w_i_real));

    // --- 1. Validate choose_with_sigma1(e, f, g) ---
    Sha256SparseFunctionParams choose_params{
        .type = Sha256SparseFunctionType::CHOOSE,
        .primary_sparse_real = state.e,
        .fst_sparse_real = state.f_sparse,
        .snd_sparse_real = state.g_sparse,
        .input_gate_count = 3,
        .output_gate_count = 16,
        .input_selector_hash = 10466947815291596779ULL,
        .output_selector_hash = 13586408269702787909ULL,
        .log_prefix = "choose",
    };

    auto choose_result = validate_sha256_sparse_function(choose_params);
    result &= choose_result.valid;
    uint32_t ch_real = choose_result.result_real;
    uint32_t e_sparse_real = choose_result.primary_sparse_real;

    // --- 2. Validate majority_with_sigma0(a, b, c) ---
    Sha256SparseFunctionParams majority_params{
        .type = Sha256SparseFunctionType::MAJORITY,
        .primary_sparse_real = state.a,
        .fst_sparse_real = state.b_sparse,
        .snd_sparse_real = state.c_sparse,
        .input_gate_count = 3,
        .output_gate_count = 11,
        .input_selector_hash = 43120264047308448ULL,
        .output_selector_hash = 13451944807746674629ULL,
        .log_prefix = "majority",
    };

    auto majority_result = validate_sha256_sparse_function(majority_params);
    result &= majority_result.valid;
    uint32_t maj_real = majority_result.result_real;
    uint32_t a_sparse_real = majority_result.primary_sparse_real;

    // --- 3. Validate T1 = ch.add_two(h, w[i] + K[i]) ---
    // Use find_arithmetic_gate to locate the T1 gate. Try all possible wire orderings
    // since operator+ chain may place arguments in different positions depending on constants.
    // big_mul_add_gate (3 non-const): w_l=ch, w_r=h, w_o=w[i], w_4=T1
    // add_gate (1 const): two non-const on w_l/w_r in either order, result on w_o
    bool T1_const = (ch_real == CONST) && (state.h == CONST) && (w_i_real == CONST);
    uint32_t T1_real = CONST;

    if (!T1_const) {
        size_t num_known_non_const = static_cast<size_t>(ch_real != CONST) + static_cast<size_t>(state.h != CONST) +
                                     static_cast<size_t>(w_i_real != CONST);

        if (num_known_non_const >= 2) {
            // Collect known non-const witnesses and find gate containing all of them
            std::vector<uint32_t> known_witnesses;
            if (ch_real != CONST) known_witnesses.push_back(ch_real);
            if (state.h != CONST) known_witnesses.push_back(state.h);
            if (w_i_real != CONST) known_witnesses.push_back(w_i_real);

            auto gate_candidates = find_arithmetic_gate(known_witnesses);

            if (!gate_candidates.empty()) {
                auto& arith_block = builder.blocks.arithmetic;
                size_t gi = gate_candidates[0];
                if (arith_block.q_4()[gi] == FF::neg_one()) {
                    // big_mul_add_gate: result in w_4
                    T1_real = analyzer.to_real(arith_block.w_4()[gi]);
                    discovered_w_i_real = analyzer.to_real(arith_block.w_o()[gi]);
                } else if (arith_block.q_3()[gi] == FF::neg_one()) {
                    // add_gate: result in w_o
                    T1_real = analyzer.to_real(arith_block.w_o()[gi]);
                    // Discover w[i] from w_l/w_r: the wire that isn't ch or h
                    uint32_t wl = analyzer.to_real(arith_block.w_l()[gi]);
                    uint32_t wr = analyzer.to_real(arith_block.w_r()[gi]);
                    if (wl != ch_real && wl != state.h) {
                        discovered_w_i_real = wl;
                    } else if (wr != ch_real && wr != state.h) {
                        discovered_w_i_real = wr;
                    }
                }
            } else {
                info("SHA256 round ", round_idx, ": T1 gate not found");
                result = false;
            }
        } else if (num_known_non_const == 1) {
            // No gate created, T1 wraps the sole witness
            if (ch_real != CONST)
                T1_real = ch_real;
            else if (state.h != CONST)
                T1_real = state.h;
            else
                T1_real = w_i_real;
        }
    }

    // --- 4. Validate e_new = add_normalize_unsafe(d, T1) ---
    // d.add_two(T1, overflow * -2^32)
    // big_mul_add: w_l=d, w_r=T1, w_o=overflow, w_4=e_new
    // T1 is on w_r for e_new (d is first arg to add_two)
    bool d_const = (state.d == CONST);
    uint32_t e_new_real = CONST;
    std::optional<size_t> e_new_gate_idx;
    static constexpr FF NEG_TWO_POW_32 = -FF(uint256_t(1) << 32);

    if (!(d_const && T1_const) && T1_real != CONST) {
        auto& arith_block = builder.blocks.arithmetic;
        auto t1_gates = analyzer.get_variable_gates(T1_real);
        for (const auto& [blk_idx, gate_idx] : t1_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith_block)
                continue;
            if (!arith_block.q_m()[gate_idx].is_zero() || arith_block.q_arith()[gate_idx] != FF::one())
                continue;
            FF q_2 = arith_block.q_2()[gate_idx];
            FF q_3 = arith_block.q_3()[gate_idx];
            if (q_3 != NEG_TWO_POW_32 && q_2 != NEG_TWO_POW_32)
                continue;

            // For e_new: T1 is on w_r (big_mul_add with d non-const) or either wire (add_gate with d const).
            // For a_new: T1 is on w_l. We distinguish by checking if d appears on w_l.
            uint32_t w_l_real = analyzer.to_real(arith_block.w_l()[gate_idx]);
            uint32_t w_r_real = analyzer.to_real(arith_block.w_r()[gate_idx]);

            bool is_e_gate = false;
            if (!d_const) {
                // d non-const: e_new gate has d on w_l and T1 on w_r
                is_e_gate = (w_l_real == state.d && w_r_real == T1_real);
            } else {
                // d const: e_new gate is add_gate with T1 on w_l or w_r.
                // Distinguish from a_new by: a_new gate also has T1, but with maj (or overflow).
                // e_new's other non-const wire is overflow (not maj). We can't easily tell from wires alone.
                // Use value check: e_new computes d+T1, a_new computes T1+maj. The q_c differs.
                // Simplest: check T1 is on a wire AND this isn't the a_new gate (found separately).
                // We'll find a_new first, then e_new is the other one.
                continue; // Handle d-const case after finding a_new
            }
            if (!is_e_gate)
                continue;

            // Equation check
            FF q_1 = arith_block.q_1()[gate_idx];
            FF q_4 = arith_block.q_4()[gate_idx];
            FF q_c = arith_block.q_c()[gate_idx];
            FF wl = builder.get_variable(arith_block.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith_block.w_r()[gate_idx]);
            FF wo = builder.get_variable(arith_block.w_o()[gate_idx]);
            FF w4 = builder.get_variable(arith_block.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero())
                continue;

            if (q_3 == NEG_TWO_POW_32) {
                e_new_real = analyzer.to_real(arith_block.w_4()[gate_idx]);
            } else {
                e_new_real = analyzer.to_real(arith_block.w_o()[gate_idx]);
            }
            e_new_gate_idx = gate_idx;
            break;
        }
    }

    // --- 5. Validate a_new = add_normalize_unsafe(T1, maj) ---
    // T1.add_two(maj, overflow * -2^32)
    // big_mul_add: w_l=T1, w_r=maj, w_o=overflow, w_4=a_new
    // T1 is on w_l for a_new (T1 is first arg to add_two)
    bool a_new_const = T1_const && (maj_real == CONST);
    uint32_t a_new_real = CONST;

    if (!a_new_const && T1_real != CONST) {
        auto& arith_block = builder.blocks.arithmetic;
        auto t1_gates = analyzer.get_variable_gates(T1_real);
        for (const auto& [blk_idx, gate_idx] : t1_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith_block)
                continue;
            if (e_new_gate_idx.has_value() && gate_idx == *e_new_gate_idx)
                continue;
            if (!arith_block.q_m()[gate_idx].is_zero() || arith_block.q_arith()[gate_idx] != FF::one())
                continue;
            FF q_2 = arith_block.q_2()[gate_idx];
            FF q_3 = arith_block.q_3()[gate_idx];
            if (q_3 != NEG_TWO_POW_32 && q_2 != NEG_TWO_POW_32)
                continue;

            // a_new: T1 is on w_l (big_mul_add) or either wire (add_gate with maj const)
            uint32_t w_l_real = analyzer.to_real(arith_block.w_l()[gate_idx]);
            if (!a_new_const && maj_real != CONST) {
                // maj non-const: a_new is big_mul_add with T1 on w_l and maj on w_r
                uint32_t w_r_real = analyzer.to_real(arith_block.w_r()[gate_idx]);
                if (w_l_real != T1_real || w_r_real != maj_real)
                    continue;
            } else {
                // maj const: add_gate, T1 on w_l or w_r
                if (w_l_real != T1_real) {
                    uint32_t w_r_real = analyzer.to_real(arith_block.w_r()[gate_idx]);
                    if (w_r_real != T1_real)
                        continue;
                }
            }

            // Equation check
            FF q_1 = arith_block.q_1()[gate_idx];
            FF q_4 = arith_block.q_4()[gate_idx];
            FF q_c = arith_block.q_c()[gate_idx];
            FF wl = builder.get_variable(arith_block.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith_block.w_r()[gate_idx]);
            FF wo = builder.get_variable(arith_block.w_o()[gate_idx]);
            FF w4 = builder.get_variable(arith_block.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero())
                continue;

            if (q_3 == NEG_TWO_POW_32) {
                a_new_real = analyzer.to_real(arith_block.w_4()[gate_idx]);
            } else {
                a_new_real = analyzer.to_real(arith_block.w_o()[gate_idx]);
            }
            break;
        }
    }

    // Handle d-const case for e_new: find via T1 excluding a_new gate
    if (e_new_real == CONST && d_const && T1_real != CONST && !T1_const) {
        auto& arith_block = builder.blocks.arithmetic;
        auto t1_gates = analyzer.get_variable_gates(T1_real);
        for (const auto& [blk_idx, gate_idx] : t1_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith_block)
                continue;
            // Skip the a_new gate we just found
            if (a_new_real != CONST) {
                uint32_t w4 = analyzer.to_real(arith_block.w_4()[gate_idx]);
                uint32_t wo = analyzer.to_real(arith_block.w_o()[gate_idx]);
                if (w4 == a_new_real || wo == a_new_real)
                    continue;
            }
            if (!arith_block.q_m()[gate_idx].is_zero() || arith_block.q_arith()[gate_idx] != FF::one())
                continue;
            FF q_2 = arith_block.q_2()[gate_idx];
            FF q_3 = arith_block.q_3()[gate_idx];
            if (q_3 != NEG_TWO_POW_32 && q_2 != NEG_TWO_POW_32)
                continue;

            FF q_1 = arith_block.q_1()[gate_idx];
            FF q_4 = arith_block.q_4()[gate_idx];
            FF q_c = arith_block.q_c()[gate_idx];
            FF wl = builder.get_variable(arith_block.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith_block.w_r()[gate_idx]);
            FF wo_val = builder.get_variable(arith_block.w_o()[gate_idx]);
            FF w4_val = builder.get_variable(arith_block.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo_val + q_4 * w4_val + q_c != FF::zero())
                continue;

            if (q_3 == NEG_TWO_POW_32) {
                e_new_real = analyzer.to_real(arith_block.w_4()[gate_idx]);
            } else {
                e_new_real = analyzer.to_real(arith_block.w_o()[gate_idx]);
            }
            e_new_gate_idx = gate_idx;
            break;
        }
    }

    if (e_new_real == CONST && !(d_const && T1_const)) {
        info("SHA256 round ", round_idx, ": e_new add_normalize gate not found");
        result = false;
    }
    if (a_new_real == CONST && !a_new_const) {
        info("SHA256 round ", round_idx, ": a_new add_normalize gate not found");
        result = false;
    }

    info("[ROUND_RESULT] round ",
         round_idx,
         ": ch=",
         idx_str(ch_real),
         " maj=",
         idx_str(maj_real),
         " T1=",
         idx_str(T1_real),
         " e_new=",
         idx_str(e_new_real),
         " a_new=",
         idx_str(a_new_real),
         " e_sp=",
         idx_str(e_sparse_real),
         " a_sp=",
         idx_str(a_sparse_real),
         " disc_w=",
         idx_str(discovered_w_i_real));

    // --- Update state for next round ---
    // h=g, g=f, f=e, e=d+T1, d=c, c=b, b=a, a=T1+maj
    uint32_t old_e = state.e;
    uint32_t old_f_sparse = state.f_sparse;
    uint32_t old_a = state.a;
    uint32_t old_b_sparse = state.b_sparse;

    state.h = state.g;
    state.g = state.f;
    state.f = old_e;
    state.e = e_new_real;
    state.d = state.c;
    state.c = state.b;
    state.b = old_a;
    state.a = a_new_real;

    // Sparse form rotation:
    //   e.sparse (from choose_with_sigma1) → next round's f_sparse
    //   a.sparse (from majority_with_sigma0) → next round's b_sparse
    state.g_sparse = old_f_sparse;
    state.f_sparse = e_sparse_real;
    state.c_sparse = old_b_sparse;
    state.b_sparse = a_sparse_real;

    return result;
}

/**
 * @brief Validates SHA256 compression constraint using multiple complementary checks:
 *
 * 1. Decompose chain check: Validate that range-constrained witnesses (hash_values[3],
 *    hash_values[7], inputs[0]) have correct 32-bit decompose chains.
 *
 * 2. Range list filler check: Validate that unconstrained arithmetic gates match
 *    expected filler counts for 14-bit and 4-bit range lists.
 *
 * 3. Witness connectivity check: Verify all constraint witnesses appear in their
 *    gates: hash_values[0, 1, 2, 4, 5, 6] and input[1..15] are decomposed using special plookup tables,
 *    result[i] and hash_values[i] are paired together through arithmetic gate
 *
 * 4. Arithmetic selector hash check: Verify that the full arithmetic and lookup subtrace
 *    selector hash matches the known-good hash for SHA256 compression.
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_sha256compression_constraint(const ConstraintPtr& ptr)
{
    constexpr size_t bit_range = 32;
    const auto* constraint = std::get<const acir_format::Sha256Compression*>(ptr);
    bool result = true;

    // Validate decompose chains on range-constrained ACIR witnesses
    // SHA256 calls create_range_constraint(32) on hash_values[3], hash_values[7], inputs[0]
    const std::array<const WitnessOrConstant<FF>, 3> range_constrained_witnesses = { constraint->hash_values[3],
                                                                                     constraint->hash_values[7],
                                                                                     constraint->inputs[0] };
    for (size_t rc_i = 0; rc_i < range_constrained_witnesses.size(); ++rc_i) {
        bool rc_ok = validate_range_constraint(analyzer.to_real(range_constrained_witnesses[rc_i].index), bit_range);
        if (!rc_ok) {
            info("SHA256 CHECK FAIL: decompose chain for range_constrained_witnesses[", rc_i, "]");
        }
        result &= rc_ok;
    }

    // Validate range list filler gates
    // 32-bit decompose uses 14-bit limbs (target=16383) and 4-bit remainder (target=15)
    constexpr uint64_t FULL_LIMB_RANGE = (1ULL << 14) - 1;
    constexpr uint64_t REMAINDER_RANGE = (1ULL << 4) - 1;

    auto full_info = sha256_helpers::validate_range_list_fillers(builder, FULL_LIMB_RANGE);
    auto rem_info = sha256_helpers::validate_range_list_fillers(builder, REMAINDER_RANGE);

    bool filler_ok =
        full_info.range_list_exists || full_info.count_matches || rem_info.range_list_exists || rem_info.count_matches;
    if (!filler_ok) {
        info("SHA256 CHECK FAIL: range list filler validation");
    }
    result &= filler_ok;

    auto& lookup_block = builder.blocks.lookup;
    [[maybe_unused]] auto& arith = builder.blocks.arithmetic;

    // Non-range-constrained hash_values in lookup w_l
    // hash_values[0,1,2,4,5,6] undergo SHA256 sparse decomposition via plookup tables
    // hash_values[3,7] are range-constrained — handled by other checks
    std::vector<size_t> non_range_constrained_hash_values_indices{ 0, 1, 2, 4, 5, 6 };
    for (auto& i : non_range_constrained_hash_values_indices) {
        uint32_t real_idx = analyzer.to_real(constraint->hash_values[i].index);
        auto gates = analyzer.get_variable_gates(real_idx);
        bool found = false;
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] == &lookup_block &&
                analyzer.to_real(lookup_block.w_l()[gate_idx]) == real_idx) {
                found = true;
                break;
            }
        }
        if (!found) {
            info("SHA256 CHECK FAIL: hash_values[", i, "] not in lookup w_l");
        }
        result &= found;
    }

    // inputs[1..15] must appear in lookup block w_l
    // Non-range-constrained inputs undergo SHA256_WITNESS_INPUT decomposition
    for (size_t i = 1; i < constraint->inputs.size(); ++i) {
        uint32_t real_idx = analyzer.to_real(constraint->inputs[i].index);
        auto gates = analyzer.get_variable_gates(real_idx);
        bool found = false;
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] == &lookup_block &&
                analyzer.to_real(lookup_block.w_l()[gate_idx]) == real_idx) {
                found = true;
                break;
            }
        }
        if (!found) {
            info("SHA256 CHECK FAIL: inputs[", i, "] not in lookup w_l");
        }
        result &= found;
    }

    auto compute_w_constant_flags = [&]() -> std::array<bool, 64> {
        std::array<bool, 64> w_const{};
        for (size_t i = 0; i < 16; ++i) {
            w_const[i] = constraint->inputs[i].is_constant;
        }
        for (size_t i = 16; i < 64; ++i) {
            w_const[i] = w_const[i - 15] && w_const[i - 2] && w_const[i - 7] && w_const[i - 16];
        }
        return w_const;
    };

    [[maybe_unused]] auto w_const = compute_w_constant_flags();

    // Validate arithmetic subtrace selector hash
    auto boundaries = find_sha256_subcircuit_boundaries(constraint);
    bool bounds_ok = boundaries.has_value();
    if (!bounds_ok) {
        info("SHA256 CHECK FAIL: subcircuit boundaries not found");
    }
    result &= bounds_ok;
    if (boundaries.has_value()) {
        bool sel_ok = validate_sha256_subcircuit_selectors(*boundaries);
        if (!sel_ok) {
            info("SHA256 CHECK FAIL: selector hash mismatch. constrained=",
                 boundaries->constrained_gates.size(),
                 " unconstrained=",
                 boundaries->unconstrained_gates.size());
        }
        result &= sel_ok;
    }
    return result;
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
    //
    const auto& variable_gates = analyzer.get_variable_gates(analyzer.to_real(witness));

    if (num_bits == 1) {
        for (auto [block_idx, gate_idx] : variable_gates) {
            if (is_boolean_gate(block_idx, gate_idx)) {
                return true;
            }
        }
        return false;
    }
    if (num_bits <= bb::UltraCircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM) {
        // Small range: arithmetic gate + range list entry
        uint64_t target_range = (1ULL << num_bits) - 1;
        auto it = builder.range_lists.find(target_range);
        if (it == builder.range_lists.end()) {
            return false;
        }
        const auto& range_list = it->second;
        return std::find(range_list.variable_indices.begin(), range_list.variable_indices.end(), witness) !=
               range_list.variable_indices.end();
    }
    // Large range: decompose_into_default_range creates sublimbs with big_add gates
    // Validate that the decompose chain was correctly created
    return analyzer.validate_decompose_chain(witness, num_bits);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_range_constraints(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const acir_format::RangeConstraint*>(ptr);
    return validate_range_constraint(constraint->witness, constraint->num_bits);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_sha256_subcircuit_selectors(
    const Sha256SubcircuitBoundaries& boundaries)
{
    static constexpr size_t SHA256_LOOKUP_SELECTOR_HASH = 1201492680789112893ULL;
    static constexpr size_t SHA256_ARITH_SELECTOR_HASH = 17755299155013926430ULL;

    size_t lookup_hash =
        compute_selector_hash(0, builder.blocks.lookup, boundaries.lookup.first, boundaries.lookup.last);

    // Hash unconstrained (filler) gates first, then chain constrained gates.
    // This matches the reference circuit layout where fillers precede constrained gates.
    // Hashing by group ensures the hash is independent of absolute gate positions —
    // critical when multiple SHA256 constraints share the same filler gates.
    size_t unconstrained_hash = compute_selector_hash(0, builder.blocks.arithmetic, boundaries.unconstrained_gates);
    size_t arith_hash =
        compute_selector_hash(unconstrained_hash, builder.blocks.arithmetic, boundaries.constrained_gates);

    return lookup_hash == SHA256_LOOKUP_SELECTOR_HASH && arith_hash == SHA256_ARITH_SELECTOR_HASH;
}

template class StaticAnalyzerAcir_<fr, UltraCircuitBuilder>;
} // namespace cdg
