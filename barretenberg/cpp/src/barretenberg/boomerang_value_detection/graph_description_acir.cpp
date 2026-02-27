#include "./graph_description_acir.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
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
    const auto* constraint = std::get<const acir_format::Sha256Compression*>(ptr);
    bool result = true;

    // Validate decompose chains on range-constrained ACIR witnesses
    // SHA256 calls create_range_constraint(32) on hash_values[3], hash_values[7], inputs[0]
    const std::array<const WitnessOrConstant<FF>, 3> range_constrained_witnesses = { constraint->hash_values[3],
                                                                                     constraint->hash_values[7],
                                                                                     constraint->inputs[0] };
    for (const auto& woc : range_constrained_witnesses) {
        result &= validate_range_constraint(woc.index, 32);
    }

    // Validate range list filler gates
    // 32-bit decompose uses 14-bit limbs (target=16383) and 4-bit remainder (target=15)
    constexpr uint64_t FULL_LIMB_RANGE = (1ULL << 14) - 1;
    constexpr uint64_t REMAINDER_RANGE = (1ULL << 4) - 1;

    auto full_info = sha256_helpers::validate_range_list_fillers(builder, FULL_LIMB_RANGE);
    auto rem_info = sha256_helpers::validate_range_list_fillers(builder, REMAINDER_RANGE);

    result &=
        full_info.range_list_exists || full_info.count_matches || rem_info.range_list_exists || rem_info.count_matches;

    auto& lookup_block = builder.blocks.lookup;
    auto& arith = builder.blocks.arithmetic;
    // selector constants for direct gate validation
    const FF NEG_TWO_POW_32 = -FF(uint256_t(1) << 32);
    const FF DECOMPOSE_Q2 = FF(uint256_t(0x4000));
    const FF DECOMPOSE_Q3 = FF(uint256_t(0x10000000));

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
        result &= found;
    }

    // result[i] paired with hash_values[i] in add_normalize gate
    // Final output: intermediate + hash_values[i] - 2^32 * overflow = result[i]
    // result[i] must be at w_4, hash_values[i] at w_r, with add_normalize selectors
    for (size_t i = 0; i < 8; ++i) {
        uint32_t hash_real = analyzer.to_real(constraint->hash_values[i].index);
        uint32_t result_real = analyzer.to_real(constraint->result[i]);
        auto result_gates = analyzer.get_variable_gates(result_real);
        bool found = false;
        for (const auto& [blk_idx, gate_idx] : result_gates) {
            if (&builder.blocks.get()[blk_idx] != &arith) {
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
                found = true;
                break;
            }
        }
        result &= found;
    }

    // Result witnesses in decompose chain w_4 (output range check)
    // Each result[i] must also appear in w_4 of a decompose chain gate
    for (size_t i = 0; i < 8; ++i) {
        uint32_t real_idx = analyzer.to_real(constraint->result[i]);
        auto gates = analyzer.get_variable_gates(real_idx);
        bool found = false;
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] != &arith) {
                continue;
            }
            if (analyzer.to_real(arith.w_4()[gate_idx]) != real_idx) {
                continue;
            }
            if (arith.q_1()[gate_idx] == FF::one() && arith.q_2()[gate_idx] == DECOMPOSE_Q2 &&
                arith.q_3()[gate_idx] == DECOMPOSE_Q3 && arith.q_4()[gate_idx] == FF::neg_one() &&
                arith.q_arith()[gate_idx] == FF::one()) {
                found = true;
                break;
            }
        }
        result &= found;
    }

    // Validate arithmetic subtrace selector hash
    auto boundaries = find_sha256_subcircuit_boundaries(*constraint);
    std::string print = boundaries.has_value() ? "true" : "false";
    result &= boundaries.has_value();
    if (boundaries.has_value()) {
        result &= validate_sha256_subcircuit_selectors(*boundaries);
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
std::vector<size_t> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_subtrace_gates(
    const std::unordered_set<uint32_t>& seed_witnesses, size_t target_block_idx)
{
    auto& target_block = builder.blocks.get()[target_block_idx];

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
        if (real_idx != zero_real && seen.insert(real_idx).second) {
            worklist.push_back(real_idx);
        }
    };

    std::set<size_t> gate_set;
    for (size_t i = 0; i < worklist.size(); ++i) {
        const auto& gates = analyzer.get_variable_gates(worklist[i]);
        for (const auto& [block_idx, gate_idx] : gates) {
            if (block_idx != target_block_idx)
                continue;
            gate_set.insert(gate_idx);
            try_add(target_block.w_l()[gate_idx]);
            try_add(target_block.w_r()[gate_idx]);
            try_add(target_block.w_o()[gate_idx]);
            try_add(target_block.w_4()[gate_idx]);
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
 *   Size is a known constant 2363 gates.
 */
template <typename FF, typename CircuitBuilder>
std::optional<Sha256SubcircuitBoundaries> StaticAnalyzerAcir_<FF, CircuitBuilder>::find_sha256_subcircuit_boundaries(
    const acir_format::Sha256Compression& constraint)
{
    static constexpr size_t SHA256_LOOKUP_GATE_COUNT = 2896;
    static constexpr size_t ARITHMETIC_BLOCK_IDX = 2;

    // Find lookup subtrace start: search for hash_values[1]'s real index in w_l of lookup block
    uint32_t hv1_real = analyzer.to_real(constraint.hash_values[1].index);
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

    // Find arithmetic subtrace start by collecting ALL variables from the lookup subtrace.
    // Constraint witnesses alone miss intermediate variables that occupy earlier arithmetic gates.
    // The lookup subtrace contains wire indices for sparse limbs, accumulators, etc. that are
    // reused in arithmetic gates for normalization and computation.
    std::unordered_set<uint32_t> sha256_vars;
    for (size_t i = *lookup_start; i < *lookup_start + SHA256_LOOKUP_GATE_COUNT; ++i) {
        sha256_vars.emplace(analyzer.to_real(lookup_block.w_l()[i]));
        sha256_vars.emplace(analyzer.to_real(lookup_block.w_r()[i]));
        sha256_vars.emplace(analyzer.to_real(lookup_block.w_o()[i]));
        sha256_vars.emplace(analyzer.to_real(lookup_block.w_4()[i]));
    }
    // Also add constraint witnesses (inputs, hash_values, results)
    for (size_t i = 0; i < 16; ++i) {
        sha256_vars.emplace(analyzer.to_real(constraint.inputs[i].index));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_vars.emplace(analyzer.to_real(constraint.hash_values[i].index));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_vars.emplace(analyzer.to_real(constraint.result[i]));
    }

    // find all arithmetic gates connected to SHA256 variables via wire expansion
    auto all_arith_gates = find_subtrace_gates(sha256_vars, ARITHMETIC_BLOCK_IDX);
    if (all_arith_gates.empty()) {
        return std::nullopt;
    }

    // find filler gates via range_list tag lookup.
    //  Collect tags from wires in Phase 1 gates, then find matching range_list filler gates.
    auto& arith = builder.blocks.arithmetic;
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
