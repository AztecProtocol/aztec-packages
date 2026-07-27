#include "./graph_description_acir.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/noir_programs_boomerang_values/chonk_validation.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_validation.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_validation.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_finalize_verification.hpp"
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
    : constraint_system(circuit_buf_to_acir_format(std::move(acir_program_buf), IsMegaBuilder<CircuitBuilder>))
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
    auto q_arith = read_gate_selector(block, GateKind::Arith, gate_idx);
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
    auto q_arith = read_gate_selector(block, GateKind::Arith, gate_idx);
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
        break;
    }
    case AcirConstraintType::EC_ADD: {
        const auto* constraint = std::get<const EcAdd*>(constraint_info.ptr);
        add_witness_if_not_constant(constraint->input1_x, witness_indices);
        add_witness_if_not_constant(constraint->input1_y, witness_indices);
        add_witness_if_not_constant(constraint->input2_x, witness_indices);
        add_witness_if_not_constant(constraint->input2_y, witness_indices);
        add_witness_if_not_constant(constraint->predicate, witness_indices);
        witness_indices.insert(constraint->result_x);
        witness_indices.insert(constraint->result_y);
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
        // MemOp index/value are now direct witness indices
        for (const auto& mem_op : constraint->trace) {
            witness_indices.insert(mem_op.index);
            witness_indices.insert(mem_op.value);
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
        case AcirConstraintType::HONK_RECURSION:
        case AcirConstraintType::AVM_RECURSION:
        case AcirConstraintType::CHONK_RECURSION:
            result = process_recursion_constraints(constraint_info.ptr, next_constraint_witnesses);
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
        log_error("BIG_QUAD/QUAD validation failed: constraint.a is constant sentinel");
        return false;
    }
    bool is_gate_created = false;
    size_t arithmetic_candidates = 0;
    bool saw_q_arith_match = false;
    bool saw_selectors_match = false;
    bool saw_variables_match = false;
    bool saw_next_w4_match = false;
    bool saw_next_q4_match = false;
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
    if (var_it == constraint_variables.end()) {
        log_error("BIG_QUAD/QUAD validation failed: all constraint variables resolved to zero_idx");
        return false;
    }
    auto& arith_block = builder.blocks.arithmetic;
    std::vector<std::pair<size_t, size_t>> var_gates = analyzer.get_variable_gates(*var_it);
    if (var_gates.empty()) {
        log_error("BIG_QUAD/QUAD validation failed: no gates found for anchor variable ", *var_it);
        return false;
    }
    for (const auto& [blk_idx, gate_idx] : var_gates) {
        if (&builder.blocks.get()[blk_idx] != &arith_block) {
            continue;
        }
        arithmetic_candidates++;
        std::vector<uint32_t> gate_indices{ builder.blocks.arithmetic.w_l()[gate_idx],
                                            builder.blocks.arithmetic.w_r()[gate_idx],
                                            builder.blocks.arithmetic.w_o()[gate_idx],
                                            builder.blocks.arithmetic.w_4()[gate_idx] };
        gate_indices = analyzer.to_real(gate_indices);
        if (include_next_gate_w_4) {
            // Non-last gate in BigQuadConstraint: q_arith=2, q_m is doubled, validates next w4
            bool correct_q_arith = read_gate_selector(builder.blocks.arithmetic, GateKind::Arith, gate_idx) == FF(2);
            saw_q_arith_match = saw_q_arith_match || correct_q_arith;

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
            saw_selectors_match = saw_selectors_match || correct_selectors;
            bool correct_variables = std::equal(
                constraint_variables.begin(), constraint_variables.end(), gate_indices.begin(), gate_indices.end());
            saw_variables_match = saw_variables_match || correct_variables;
            if (correct_q_arith && correct_selectors && correct_variables) {
                if (gate_idx + 1 >= builder.blocks.arithmetic.size()) {
                    log_error("BIG_QUAD validation failed: expected next gate for chain link at gate ", gate_idx);
                    continue;
                }
                // Validate that the next gate's w_4 carries the correct accumulated value
                FF next_w4_wire_value = builder.get_variable(constraint_variables[0]) *
                                            builder.get_variable(constraint_variables[1]) * constraint->mul_scaling +
                                        builder.get_variable(constraint_variables[0]) * constraint->a_scaling +
                                        builder.get_variable(constraint_variables[1]) * constraint->b_scaling +
                                        builder.get_variable(constraint_variables[2]) * constraint->c_scaling +
                                        builder.get_variable(constraint_variables[3]) * constraint->d_scaling +
                                        constraint->const_scaling;
                next_w4_wire_value = -next_w4_wire_value;
                bool correct_next_w4 =
                    builder.get_variable(builder.blocks.arithmetic.w_4()[gate_idx + 1]) == next_w4_wire_value;
                bool correct_next_d_scaling = builder.blocks.arithmetic.q_4()[gate_idx + 1] == FF(-1);
                saw_next_w4_match = saw_next_w4_match || correct_next_w4;
                saw_next_q4_match = saw_next_q4_match || correct_next_d_scaling;
                if (correct_next_w4 && correct_next_d_scaling) {
                    is_gate_created = true;
                    break;
                }
            }
        } else {
            // Standalone QUAD constraint or last gate in BigQuadConstraint: q_arith=1
            bool correct_q_arith =
                read_gate_selector(builder.blocks.arithmetic, GateKind::Arith, gate_idx) == FF::one();
            bool correct_variables = std::equal(
                constraint_variables.begin(), constraint_variables.end(), gate_indices.begin(), gate_indices.end());
            bool correct_selectors = scalings == std::array<FF, 6>({ builder.blocks.arithmetic.q_m()[gate_idx],
                                                                     builder.blocks.arithmetic.q_1()[gate_idx],
                                                                     builder.blocks.arithmetic.q_2()[gate_idx],
                                                                     builder.blocks.arithmetic.q_3()[gate_idx],
                                                                     builder.blocks.arithmetic.q_4()[gate_idx],
                                                                     builder.blocks.arithmetic.q_c()[gate_idx] });
            saw_q_arith_match = saw_q_arith_match || correct_q_arith;
            saw_selectors_match = saw_selectors_match || correct_selectors;
            saw_variables_match = saw_variables_match || correct_variables;
            if (correct_q_arith && correct_variables && correct_selectors) {
                is_gate_created = true;
                break;
            }
        } // continue looking for a gate for the given constraint
    }
    if (!is_gate_created) {
        log_error("BIG_QUAD/QUAD validation failed: include_next_gate_w_4=",
                  include_next_gate_w_4,
                  " candidates=",
                  arithmetic_candidates,
                  " q_arith_match=",
                  saw_q_arith_match,
                  " selectors_match=",
                  saw_selectors_match,
                  " variables_match=",
                  saw_variables_match,
                  " next_w4_match=",
                  saw_next_w4_match,
                  " next_q4_match=",
                  saw_next_q4_match);
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
            log_error("BIG_QUAD validation failed: gate_in_chain=", i, "/", constraint->size(), " is_last=", is_last);
            return false;
        }
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_recursion_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& next_constraint_witnesses)
{
    (void)next_constraint_witnesses;
    const auto* constraint = std::get<const acir_format::RecursionConstraint*>(ptr);
    if (constraint == nullptr) {
        log_error("CHONK recursion validation failed: null recursion constraint");
        return false;
    }

    switch (static_cast<PROOF_TYPE>(constraint->proof_type)) {
    case PROOF_TYPE::CHONK:
        return process_chonk_recursion_constraint(constraint);
    case PROOF_TYPE::HONK:
        return process_honk_recursion_constraint(constraint);
    case PROOF_TYPE::ROLLUP_HONK:
    case PROOF_TYPE::ROOT_ROLLUP_HONK:
        return process_rollup_honk_recursion_constraint(constraint);
    default:
        log_error("recursion validation: unsupported proof_type ", static_cast<int>(constraint->proof_type));
        return false;
    }
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_chonk_recursion_constraint(
    const acir_format::RecursionConstraint* constraint)
{
    if (constraint == nullptr) {
        log_error("CHONK recursion validation failed: null constraint passed to process_chonk_recursion_constraint");
        return false;
    }
    const auto result = chonk_validation::validate<FF>(builder, analyzer, *constraint);
    if (!result.serialization_valid) {
        log_error("CHONK recursion validation failed: proof serialization");
    }
    if (!result.serialization_fingerprint_valid) {
        log_error("CHONK recursion validation failed: VK serialization fingerprint");
    }
    if (!result.serialization_witness_link_valid) {
        log_error("CHONK recursion validation failed: VK serialization witness link");
    }
    for (size_t idx = 0; idx < result.stages.size(); ++idx) {
        if (!result.stages[idx].fingerprint_valid) {
            log_error("CHONK recursion validation failed: stage ", idx, " fingerprint");
        }
        if (!result.stages[idx].witness_link_valid) {
            log_error("CHONK recursion validation failed: stage ", idx, " witness link");
        }
    }
    return result.all_valid;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_honk_recursion_constraint(
    const acir_format::RecursionConstraint* constraint)
{
    if (constraint == nullptr) {
        log_error("HONK recursion validation failed: null constraint");
        return false;
    }

    auto result = HonkRecursionValidation::validate_honk_recursion(builder, analyzer, *constraint, constraint->proof);
    if (!result.oink.is_valid) {
        log_error("HONK recursion validation failed: Oink stage");
        return false;
    }

    if (!result.preprocessor.is_valid) {
        log_error("HONK recursion validation failed: Preprocessor stage");
        return false;
    }

    if (!result.sumcheck.is_valid) {
        log_error("HONK recursion validation failed: Sumcheck stage");
        return false;
    }

    if (!result.shplemini.is_valid) {
        log_error("HONK recursion validation failed: Shplemini stage");
        return false;
    }

    if (!result.kzg.is_valid) {
        log_error("HONK recursion validation failed: KZG stage");
        return false;
    }

    return result.is_valid;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_rollup_honk_recursion_constraint(
    const acir_format::RecursionConstraint* constraint)
{
    if (constraint == nullptr) {
        log_error("ROLLUP_HONK recursion validation failed: null constraint");
        return false;
    }

    using RecursiveFlavor = bb::UltraRecursiveFlavor_<CircuitBuilder>;
    const size_t log_n = static_cast<size_t>(RecursiveFlavor::NativeFlavor::VIRTUAL_LOG_N);
    const size_t opcode_index = rollup_honk_opcode_count++;
    auto result = RollupHonkRecursionValidation::validate_rollup_honk_recursion<FF, CircuitBuilder, RecursiveFlavor>(
        builder, analyzer, *constraint, log_n, opcode_index, rollup_cursor_handoff);

    if (!result.layout.is_valid) {
        log_error("ROLLUP_HONK recursion validation failed: proof layout. proof_type=",
                  result.layout.proof_type_ok,
                  " proof_size=",
                  result.layout.proof_size_ok,
                  " commitments_fit=",
                  result.layout.oink_commitments_fit,
                  " ipa_tail=",
                  result.layout.ipa_tail_ok);
        return false;
    }

    if (!result.honk.is_valid) {
        log_error("ROLLUP_HONK recursion validation failed: HONK stages. oink=",
                  result.honk.oink.is_valid,
                  " preprocessor=",
                  result.honk.preprocessor.is_valid,
                  " sumcheck=",
                  result.honk.sumcheck.is_valid,
                  " shplemini=",
                  result.honk.shplemini.is_valid,
                  " kzg=",
                  result.honk.kzg.is_valid,
                  " output=",
                  result.output.is_valid,
                  " arith_cov=",
                  result.arith_coverage_valid);
        return false;
    }

    if (!result.ipa.is_valid) {
        log_error("ROLLUP_HONK recursion validation failed: IPA tail/claim. layout=",
                  result.ipa.layout_ok,
                  " tail_size=",
                  result.ipa.tail_size_ok,
                  " pass_through=",
                  result.ipa.pass_through_ok);
        return false;
    }

    if (!result.is_valid) {
        return false;
    }

    if (static_cast<PROOF_TYPE>(constraint->proof_type) == PROOF_TYPE::ROOT_ROLLUP_HONK) {
        rollup_cursor_handoff = result.handoff_end;
    }

    // ROOT_ROLLUP_HONK performs full IPA finalize (accumulate -> full_verify -> DefaultIO) once both
    // opcodes are processed, invisible to per-opcode dispatch. The analyzer only ever sees the
    // circuit after create_circuit already ran finalize(), so `before_opcodes` is recovered
    // arithmetically from the finalized builder rather than captured mid-construction.
    if (static_cast<PROOF_TYPE>(constraint->proof_type) == PROOF_TYPE::ROOT_ROLLUP_HONK && opcode_index == 1) {
        const acir_format::RecursionConstraint* opcode0_constraint = nullptr;
        for (const auto& rc : constraint_system.honk_recursion_constraints) {
            const auto rc_proof_type = static_cast<PROOF_TYPE>(rc.proof_type);
            if (rc_proof_type == PROOF_TYPE::ROLLUP_HONK || rc_proof_type == PROOF_TYPE::ROOT_ROLLUP_HONK) {
                opcode0_constraint = &rc;
                break;
            }
        }
        if (opcode0_constraint == nullptr) {
            log_error("ROOT_ROLLUP_HONK recursion validation failed: could not locate opcode 0 constraint");
            return false;
        }

        auto finalize_result = RollupHonkIpaFinalizeValidation::validate_root_rollup_ipa_finalize_from_acir<FF>(
            builder, analyzer, *opcode0_constraint, *constraint);
        // Per-opcode + accumulate must pass. full_verify/DefaultIO cascade may still be stale
        // after cursor-migrate (re-pin in a follow-up IPA round).
        if (!finalize_result.opcodes.is_valid || !finalize_result.accumulate.is_valid) {
            log_error("ROOT_ROLLUP_HONK recursion validation failed: IPA finalize. opcodes=",
                      finalize_result.opcodes.is_valid,
                      " entry_anchors=",
                      finalize_result.opcodes.entry_anchors_ok,
                      " accumulate=",
                      finalize_result.accumulate.is_valid,
                      " full_verify=",
                      finalize_result.full_verify.is_valid,
                      " default_io=",
                      finalize_result.default_io.is_valid);
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
        if (expected != actual) {
            log_error("LOGIC validation failed: constant-operand result mismatch; is_xor=",
                      constraint->is_xor_gate,
                      " num_bits=",
                      constraint->num_bits,
                      " result_witness=",
                      constraint->result);
        }
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
        log_error("LOGIC validation failed: chunk-chain reconstruction size mismatch; expected_chunks=",
                  num_chunks,
                  " actual_chunks=",
                  result_chunks.size(),
                  " num_bits=",
                  constraint->num_bits,
                  " result_witness_real=",
                  analyzer.to_real(constraint->result));
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
                    if (!(read_gate_selector(lookup_block, GateKind::Lookup, gate_idx) == FF::one())) {
                        log_error("LOGIC lookup mismatch: q_lookup!=1; is_xor=",
                                  constraint->is_xor_gate,
                                  " chunk_idx=",
                                  i,
                                  " gate=",
                                  gate_idx);
                        correct_lookup = false;
                        break;
                    }
                    if (lookup_block.w_4()[gate_idx] != builder.zero_idx()) {
                        log_error("LOGIC lookup mismatch: w_4 not zero; is_xor=",
                                  constraint->is_xor_gate,
                                  " chunk_idx=",
                                  i,
                                  " gate=",
                                  gate_idx);
                        correct_lookup = false;
                        break;
                    }
                    const bool is_last_lookup = (lookup_idx == num_lookups - 1);
                    BasicTableId expected_table = multi_table.basic_table_ids[lookup_idx];
                    auto table_index = static_cast<size_t>(static_cast<uint256_t>(lookup_block.q_3()[gate_idx]));
                    if (table_index == 0 || table_index > lookup_tables.size()) {
                        log_error("LOGIC lookup mismatch: table index out of bounds; is_xor=",
                                  constraint->is_xor_gate,
                                  " chunk_idx=",
                                  i,
                                  " gate=",
                                  gate_idx,
                                  " table_index=",
                                  table_index,
                                  " tables_size=",
                                  lookup_tables.size());
                        correct_lookup = false;
                        break;
                    }
                    auto table_id = lookup_tables[table_index - 1].id;
                    if (table_id != expected_table) {
                        log_error("LOGIC lookup mismatch: table id mismatch; is_xor=",
                                  constraint->is_xor_gate,
                                  " chunk_idx=",
                                  i,
                                  " gate=",
                                  gate_idx,
                                  " expected_table=",
                                  static_cast<size_t>(expected_table),
                                  " actual_table=",
                                  static_cast<size_t>(table_id));
                        correct_lookup = false;
                        break;
                    }
                    FF expected_q2 = is_last_lookup ? FF(0) : -multi_table.column_1_step_sizes[lookup_idx + 1];
                    FF expected_qm = is_last_lookup ? FF(0) : -multi_table.column_2_step_sizes[lookup_idx + 1];
                    FF expected_qc = is_last_lookup ? FF(0) : -multi_table.column_3_step_sizes[lookup_idx + 1];
                    if (!(lookup_block.q_1()[gate_idx].is_zero() && expected_q2 == lookup_block.q_2()[gate_idx] &&
                          expected_qm == lookup_block.q_m()[gate_idx] && expected_qc == lookup_block.q_c()[gate_idx] &&
                          lookup_block.q_4()[gate_idx].is_zero())) {
                        log_error("LOGIC lookup mismatch: selector mismatch; is_xor=",
                                  constraint->is_xor_gate,
                                  " chunk_idx=",
                                  i,
                                  " gate=",
                                  gate_idx,
                                  " expected(q1,q2,qm,qc,q4)=",
                                  FF(0),
                                  ",",
                                  expected_q2,
                                  ",",
                                  expected_qm,
                                  ",",
                                  expected_qc,
                                  ",",
                                  FF(0),
                                  " actual=",
                                  lookup_block.q_1()[gate_idx],
                                  ",",
                                  lookup_block.q_2()[gate_idx],
                                  ",",
                                  lookup_block.q_m()[gate_idx],
                                  ",",
                                  lookup_block.q_c()[gate_idx],
                                  ",",
                                  lookup_block.q_4()[gate_idx]);
                        correct_lookup = false;
                        break;
                    }
                }

                if (!correct_lookup) {
                    log_error("LOGIC validation failed: lookup gate layout/selectors mismatch; is_xor=",
                              constraint->is_xor_gate,
                              " chunk_idx=",
                              i,
                              " gate=",
                              gate);
                    return false;
                }

                uint256_t a_chunk = builder.get_variable(lookup_block.w_l()[gate]);
                uint256_t b_chunk = builder.get_variable(lookup_block.w_r()[gate]);
                uint256_t result_chunk = builder.get_variable(lookup_block.w_o()[gate]);

                // Verify operation correctness
                if (constraint->is_xor_gate ? (a_chunk ^ b_chunk) != result_chunk
                                            : (a_chunk & b_chunk) != result_chunk) {
                    log_error("LOGIC validation failed: boolean op result mismatch; is_xor=",
                              constraint->is_xor_gate,
                              " chunk_idx=",
                              i,
                              " gate=",
                              gate);
                    return false;
                }

                auto [a_recovered, b_recovered] = recover_chunks_from_lookups(multi_table, gate);

                if (a_recovered != (a_chunk & ~uint256_t(0x3F)) || b_recovered != (b_chunk & ~uint256_t(0x3F))) {
                    log_error("LOGIC validation failed: lookup chunk reconstruction mismatch; is_xor=",
                              constraint->is_xor_gate,
                              " chunk_idx=",
                              i,
                              " gate=",
                              gate);
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
            log_error("LOGIC validation failed: no valid lookup gate found for chunk; is_xor=",
                      constraint->is_xor_gate,
                      " chunk_idx=",
                      i,
                      " real_chunk_witness=",
                      real_chunk_idx);
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
        log_error("LOGIC validation failed: accumulated inputs do not match initial inputs; is_xor=",
                  constraint->is_xor_gate,
                  " num_bits=",
                  constraint->num_bits);
        return false;
    }

    // Check range constraints for a_chunk and b_chunk when num_bits % 32 != 0
    uint32_t final_bits = constraint->num_bits % 32;
    if (final_bits != 0) {
        if (!analyzer.validate_decompose_chain(first_chunk_a_idx, final_bits) ||
            !analyzer.validate_decompose_chain(first_chunk_b_idx, final_bits)) {
            log_error("LOGIC validation failed: final chunk range check failed; final_bits=",
                      final_bits,
                      " first_chunk_a_real=",
                      first_chunk_a_idx,
                      " first_chunk_b_real=",
                      first_chunk_b_idx);
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
    // Convert state witnesses to real indices
    std::array<uint32_t, 4> state_indices;
    for (size_t i = 0; i < 4; ++i) {
        state_indices[i] = analyzer.to_real(state[i].index);
    }

    auto& arith_block = builder.blocks.arithmetic;
    std::optional<size_t> arith_block_idx_opt = find_block_index(arith_block);
    BB_ASSERT_EQ(arith_block_idx_opt.has_value(), true);
    size_t arith_block_idx = *arith_block_idx_opt;

    // Step 1: Find and validate matrix multiplication layer (6 arithmetic gates)
    std::optional<std::array<uint32_t, 4>> matrix_state;
    for (const auto& [block_idx, gate_idx] : analyzer.get_variable_gates(state_indices[0])) {
        if (block_idx != arith_block_idx) {
            continue;
        }
        matrix_state = poseidon2_helpers::validate_matrix_mul_layer<FF>(builder, arith_block, state_indices, gate_idx);
        if (matrix_state.has_value()) {
            break;
        }
    }

    if (!matrix_state.has_value()) {
        return false;
    }

    // Steps 2-4: Validate full Poseidon2 permutation (external → internal → external)
    auto& perm_state = matrix_state.value();
    if (!poseidon2_helpers::validate_poseidon2_permutation<FF>(builder, analyzer, perm_state)) {
        return false;
    }

    // Step 5: Verify final output matches constraint->result
    // Output may be connected via copy constraints (same real_variable_index)
    for (size_t i = 0; i < result.size(); ++i) {
        uint32_t final_witness = perm_state[i];
        uint32_t result_witness = result[i];

        if (final_witness != result_witness) {
            uint32_t final_real = builder.real_variable_index[final_witness];
            uint32_t result_real = builder.real_variable_index[result_witness];
            if (final_real != result_real) {
                return false;
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
            arith.q_m()[gate_idx].is_zero() && read_gate_selector(arith, GateKind::Arith, gate_idx) == FF::one()) {
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
            read_gate_selector(arith, GateKind::Arith, gate_idx) == FF::one()) {
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
            if (!arith_block.q_m()[gate_idx].is_zero() ||
                read_gate_selector(arith_block, GateKind::Arith, gate_idx) != FF(1)) {
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
            return AddTwoGateInfo{ .gate_idx = gate_idx, .result_real = analyzer.to_real(arith_block.w_4()[gate_idx]) };
        }
    } else {
        // 2 non-const: add_gate created by operator+ chain. Wire order is not fixed.
        // Use position-independent find_arithmetic_gate, then verify add_gate selectors.
        std::vector<uint32_t> non_const_witnesses;
        if (!a_const)
            non_const_witnesses.push_back(a_real);
        if (!b_const)
            non_const_witnesses.push_back(b_real);
        if (!c_const)
            non_const_witnesses.push_back(c_real);

        auto candidates = find_arithmetic_gate(non_const_witnesses);
        for (size_t gi : candidates) {
            // Verify add_gate structure: q_3==-1, q_4==0
            if (arith_block.q_3()[gi] != FF::neg_one() || !arith_block.q_4()[gi].is_zero()) {
                continue;
            }
            return AddTwoGateInfo{ .gate_idx = gi, .result_real = analyzer.to_real(arith_block.w_o()[gi]) };
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
        FF q_arith = read_gate_selector(arith_block, GateKind::Arith, gate_idx);
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
 * @brief Find arithmetic gates where ALL given witness indices appear on any wire (position-independent).
 *
 * Validates q_m=0, q_arith=1, and gate equation == 0.
 * Searches via the first witness in the vector using get_variable_gates.
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
        FF q_arith = read_gate_selector(arith_block, GateKind::Arith, gate_idx);
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
 * @brief Validate a SHA256 sparse function (choose_with_sigma1 or majority_with_sigma0).
 *
 * Both functions share the same gate structure, parameterized by Sha256SparseFunctionParams:
 *   1. INPUT lookup on primary.normal (e or a), validated by selector hash
 *   2. First add_two: rotation_result + sparse + sparse_L → xor_result
 *   3. Second add_two: xor_result + fst_sparse + snd_sparse → choose_result_sparse
 *   4. OUTPUT lookup on choose_result_sparse, validated by selector hash
 *
 * When primary is constant, steps 1-2 are skipped. When fst and snd are both constant,
 * step 3 is skipped (choose_result_sparse = xor_result). When all are constant, no gates exist.
 *
 * Uses lookup_lower_bound to skip setup lookups (map_into_*_sparse_form) that share
 * the same table type and selector hash as round lookups.
 *
 * @return {valid, primary_sparse_real, result_real} — result_real is the OUTPUT lookup output.
 */
template <typename FF, typename CircuitBuilder>
Sha256SparseFunctionResult StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_sha256_sparse_function(
    const Sha256SparseFunctionParams& params, size_t lookup_lower_bound)
{
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;
    const bool primary_const = (params.primary_sparse_real == CONST);
    const bool fst_const = (params.fst_sparse_real == CONST);
    const bool snd_const = (params.snd_sparse_real == CONST);

    auto& lookup_block = builder.blocks.lookup;
    auto& arith_block = builder.blocks.arithmetic;
    uint32_t discovered_primary_sparse = CONST; // set by first lambda when primary non-const

    // Lambda: when primary (e/a) non-const, validates INPUT lookup + first add_two + second add_two.
    // Sets discovered_primary_sparse. Returns {success, choose_result_sparse}.
    // success=false means corruption detected. CONST result with success=true means all collapsed.
    auto validate_primary_non_constant_case = [&]() -> std::pair<bool, uint32_t> {
        // Find INPUT lookup: primary_real in w_l, validate by hashing selectors
        auto primary_gates = analyzer.get_variable_gates(params.primary_sparse_real);
        for (const auto& [blk_idx, lookup_gate_idx] : primary_gates) {
            if (&builder.blocks.get()[blk_idx] != &lookup_block || lookup_gate_idx < lookup_lower_bound ||
                analyzer.to_real(lookup_block.w_l()[lookup_gate_idx]) != params.primary_sparse_real) {
                continue;
            }

            // Hash INPUT lookup selectors to confirm we found the right table
            size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
                0, lookup_block, lookup_gate_idx, lookup_gate_idx + params.input_gate_count - 1);
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
                // With lookup_lower_bound filtering, setup lookups are already skipped.
                // If the INPUT hash matches but first add_two is missing, it's corruption.
                log_error("SHA256 ",
                          params.log_prefix,
                          ": first add_two gate not found (INPUT hash matched at gate ",
                          lookup_gate_idx,
                          ")");
                return { false, CONST };
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
                        log_error("SHA256 ",
                                  params.log_prefix,
                                  ": second add_two gate not consecutive (expected ",
                                  first_gate_idx + 1,
                                  " got ",
                                  snd_add_two->gate_idx,
                                  ")");
                    }
                } else {
                    // INPUT lookup and first add_two are valid but second add_two is missing — corruption.
                    log_error("SHA256 ",
                              params.log_prefix,
                              ": second add_two gate not found (first add_two valid at gate ",
                              first_gate_idx,
                              ")");
                    return { false, CONST };
                }
            } else {
                // Both fst and snd const → no gate, choose_result_sparse wraps xor_result
                choose_result_sparse = xor_result;
            }

            return { true, choose_result_sparse };
        }
        // No matching lookup candidate found with valid add_two gates
        return { false, CONST };
    };

    // Lambda: when primary (e/a) is constant. No INPUT lookup, no first add_two.
    // Only the second add_two may exist depending on fst/snd constants.
    // Returns {success, choose_result_sparse}. success=false means corruption.
    auto validate_primary_constant_case = [&]() -> std::pair<bool, uint32_t> {
        if (fst_const && snd_const) {
            // All three constant → no gates at all
            return { true, CONST };
        } else if (!fst_const && !snd_const) {
            // Both fst and snd non-const, primary const → add_gate via find_and_validate_add_two_gate
            auto gate = find_and_validate_add_two_gate(CONST, params.fst_sparse_real, params.snd_sparse_real);
            if (gate.has_value()) {
                return { true, gate->result_real };
            }
            log_error("SHA256 ", params.log_prefix, ": anchor gate not found (primary const, fst+snd non-const)");
            return { false, CONST };
        } else {
            // Exactly 1 of fst/snd non-const → no gate, sole non-const witness IS choose_result_sparse
            return { true, !fst_const ? params.fst_sparse_real : params.snd_sparse_real };
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
                arith_block.q_2()[gate_idx] != FF::zero() || arith_block.q_3()[gate_idx] != FF::neg_one() ||
                read_gate_selector(arith_block, GateKind::Arith, gate_idx) != FF::one()) {
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
            if (lookup_input_real != choose_result_sparse)
                break;
        }

        // Search lookup by the (possibly normalized) witness
        auto lookup_gates =
            (lookup_input_real != choose_result_sparse) ? analyzer.get_variable_gates(lookup_input_real) : crs_gates;

        for (const auto& [blk_idx, gate_idx] : lookup_gates) {
            if (&builder.blocks.get()[blk_idx] != &lookup_block ||
                analyzer.to_real(lookup_block.w_l()[gate_idx]) != lookup_input_real) {
                continue;
            }
            match_count++;
            BB_ASSERT(match_count == 1); // choose_result_sparse should appear in exactly one OUTPUT lookup

            size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
                0, lookup_block, gate_idx, gate_idx + params.output_gate_count - 1);
            correct_hash = (hash == params.output_selector_hash);
            discovered_result = analyzer.to_real(lookup_block.w_r()[gate_idx]);
        }

        if (match_count == 0) {
            log_error("SHA256 ", params.log_prefix, ": OUTPUT lookup not found for choose_result_sparse");
            return { .valid = false, .primary_sparse_real = CONST, .result_real = CONST };
        }

        return { .valid = correct_hash, .primary_sparse_real = CONST, .result_real = discovered_result };
    };

    auto [input_valid, choose_result_sparse] =
        !primary_const ? validate_primary_non_constant_case() : validate_primary_constant_case();

    if (!input_valid) {
        return { .valid = false, .primary_sparse_real = discovered_primary_sparse, .result_real = CONST };
    }

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
        log_error("SHA256 ", log_prefix, ": lookup output not found in w_r");
        return false;
    }

    if (*start + gate_count > lookup_block.size()) {
        log_error("SHA256 ", log_prefix, ": not enough lookup gates (need ", gate_count, ")");
        return false;
    }

    if (expected_hash != 0) {
        size_t hash =
            sha256_helpers::compute_selector_hash_without_table_index(0, lookup_block, *start, *start + gate_count - 1);
        if (hash != expected_hash) {
            log_error("SHA256 ", log_prefix, ": selector hash mismatch: got ", hash);
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
 *
 * Additionally validates 32-bit range constraints on W[62] and W[63].
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
            if (&builder.blocks.get()[blk_idx] != &arith_block)
                continue;
            if (!arith_block.q_m()[gate_idx].is_zero() ||
                read_gate_selector(arith_block, GateKind::Arith, gate_idx) != FF::one())
                continue;

            FF q_1 = arith_block.q_1()[gate_idx];
            FF q_2 = arith_block.q_2()[gate_idx];
            FF q_3 = arith_block.q_3()[gate_idx];
            if (q_1 != INV_POW_TWO || q_2 != NEG_INV_POW_TWO || q_3 != FF::neg_one())
                continue;

            if (analyzer.to_real(arith_block.w_r()[gate_idx]) != w_i)
                continue;

            // Equation check
            FF q_4 = arith_block.q_4()[gate_idx];
            FF q_c = arith_block.q_c()[gate_idx];
            FF wl = builder.get_variable(arith_block.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith_block.w_r()[gate_idx]);
            FF wo = builder.get_variable(arith_block.w_o()[gate_idx]);
            FF w4 = builder.get_variable(arith_block.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero())
                continue;

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
                if (&builder.blocks.get()[bi2] != &arith_block)
                    continue;
                if (analyzer.to_real(arith_block.w_l()[gi2]) != divisor_real)
                    continue;
                if (analyzer.to_real(arith_block.w_r()[gi2]) != zero_real)
                    continue;
                if (analyzer.to_real(arith_block.w_4()[gi2]) != zero_real)
                    continue;
                if (arith_block.q_2()[gi2] != FF::zero() || arith_block.q_3()[gi2] != FF::neg_one() ||
                    read_gate_selector(arith_block, GateKind::Arith, gi2) != FF::one())
                    continue;

                // Found normalize gate. Check normalized witness in range list for target_range=3
                uint32_t normalized_raw = arith_block.w_o()[gi2];
                if (!validate_range_constraint(normalized_raw, 2)) {
                    log_error("SHA256 extend_witness: divisor range constraint failed after normalization");
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
        log_error("SHA256 extend_witness[", i, "]: step 9 (reduction) failed");
        return false;
    }
    uint32_t w_out_raw_real = *w_out_raw_opt;

    // Step 8 lambda: validate w_out_raw = xor_result.add_two(W[i-16], W[i-7]), discover xor_result
    // We know w_out_raw (the output). Search backward using find_add_two_gate_by_output,
    // then verify known wires (w_16, w_7) and discover xor_result.
    auto step8_w_out_raw =
        [&](uint32_t w_out_raw, uint32_t w_16, uint32_t w_7, bool xor_const) -> std::optional<uint32_t> {
        const bool w16_const = (w_16 == CONST);
        const bool w7_const = (w_7 == CONST);
        const size_t num_non_const =
            static_cast<size_t>(!xor_const) + static_cast<size_t>(!w16_const) + static_cast<size_t>(!w7_const);

        if (num_non_const == 0)
            return std::nullopt;
        if (num_non_const == 1)
            return xor_const ? CONST : w_out_raw;

        // Find the add_two gate by its output
        auto gate = find_add_two_gate_by_output(w_out_raw);
        if (!gate.has_value())
            return std::nullopt;

        // Collect gate wires and discover xor_result
        std::array<uint32_t, 4> wires = { gate->w_l_real, gate->w_r_real, gate->w_o_real, gate->w_4_real };
        uint32_t zero_real = analyzer.to_real(builder.zero_idx());

        // Verify known wires are present
        auto wire_present = [&](uint32_t w) {
            for (uint32_t gw : wires) {
                if (gw == w)
                    return true;
            }
            return false;
        };
        if (!w16_const && !wire_present(w_16))
            return std::nullopt;
        if (!w7_const && !wire_present(w_7))
            return std::nullopt;

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
        log_error("SHA256 extend_witness[", i, "]: step 8 (w_out_raw add_two) failed");
        return false;
    }
    uint32_t xor_result_real = *xor_result_opt;

    // --- Step 7: Validate SHA256_WITNESS_OUTPUT lookup ---
    if (xor_result_real != CONST) {
        static constexpr size_t WITNESS_OUTPUT_GATE_COUNT = 11;
        static constexpr size_t SHA256_WITNESS_OUTPUT_HASH = sha256_helpers::SHA256_WITNESS_OUTPUT_HASH;
        bool lookup_ok = validate_sha256_lookup_block(
            xor_result_real, WITNESS_OUTPUT_GATE_COUNT, SHA256_WITNESS_OUTPUT_HASH, "extend_witness_output");
        if (!lookup_ok) {
            log_error("SHA256 extend_witness[", i, "]: step 7 (WITNESS_OUTPUT lookup) failed");
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
            if ((wl_const && wr_const) || xrs_real == CONST)
                return true;
            bool ok = true;

            if (!wr_const) {
                // Right chain: 3 add_two gates
                auto gate_r3 = find_add_two_gate_by_output(xrs_real);
                if (!gate_r3.has_value()) {
                    return false;
                }

                uint32_t prev_r2 = CONST;
                if (gate_r3->is_big_mul_add) {
                    prev_r2 = gate_r3->w_l_real;
                } else {
                    auto try_l = find_add_two_gate_by_output(gate_r3->w_l_real);
                    auto try_r = find_add_two_gate_by_output(gate_r3->w_r_real);
                    prev_r2 = try_l.has_value() ? gate_r3->w_l_real : try_r.has_value() ? gate_r3->w_r_real : CONST;
                }
                if (prev_r2 != CONST) {
                    auto gate_r2 = find_add_two_gate_by_output(prev_r2);
                    if (!gate_r2.has_value()) {
                        ok = false;
                    } else {
                        uint32_t prev_r1 = gate_r2->is_big_mul_add ? gate_r2->w_l_real : CONST;
                        if (!gate_r2->is_big_mul_add) {
                            auto tl = find_add_two_gate_by_output(gate_r2->w_l_real);
                            auto tr = find_add_two_gate_by_output(gate_r2->w_r_real);
                            prev_r1 = tl.has_value() ? gate_r2->w_l_real : tr.has_value() ? gate_r2->w_r_real : CONST;
                        }
                        if (prev_r1 != CONST && !find_add_two_gate_by_output(prev_r1).has_value())
                            ok = false;
                    }
                }
            }

            if (!wl_const) {
                // Left chain: 2 add_two gates, find left_xor_sparse first
                uint32_t lxs_real = CONST;
                if (!wr_const) {
                    auto gate_r3 = find_add_two_gate_by_output(xrs_real);
                    if (gate_r3.has_value()) {
                        if (gate_r3->is_big_mul_add) {
                            lxs_real = gate_r3->w_o_real;
                        } else {
                            auto tl = find_add_two_gate_by_output(gate_r3->w_l_real);
                            auto tr = find_add_two_gate_by_output(gate_r3->w_r_real);
                            lxs_real = !tl.has_value()   ? gate_r3->w_l_real
                                       : !tr.has_value() ? gate_r3->w_r_real
                                                         : CONST;
                        }
                    }
                } else {
                    lxs_real = xrs_real;
                }

                if (lxs_real != CONST) {
                    auto gate_l2 = find_add_two_gate_by_output(lxs_real);
                    if (!gate_l2.has_value()) {
                        ok = false;
                    } else {
                        uint32_t prev_l = gate_l2->is_big_mul_add ? gate_l2->w_l_real : CONST;
                        if (!gate_l2->is_big_mul_add) {
                            auto tl = find_add_two_gate_by_output(gate_l2->w_l_real);
                            auto tr = find_add_two_gate_by_output(gate_l2->w_r_real);
                            prev_l = tl.has_value() ? gate_l2->w_l_real : tr.has_value() ? gate_l2->w_r_real : CONST;
                        }
                        if (prev_l != CONST && !find_add_two_gate_by_output(prev_l).has_value())
                            ok = false;
                    }
                }
            }
            return ok;
        };

        if (xor_result_sparse_real != CONST) {
            bool chains_ok = step56_add_two_chains(xor_result_sparse_real, w_left_const, w_right_const);
            if (!chains_ok) {
                log_error("SHA256 extend_witness[", i, "]: steps 5-6 (add_two chains) failed");
                result = false;
            }
        }
    }

    // Step 1-2 lambda: validate convert_witness lookups
    auto step12_convert_witness = [&](uint32_t w,
                                      size_t expected_hash) -> std::optional<std::pair<uint32_t, uint32_t>> {
        static constexpr size_t WITNESS_INPUT_GATE_COUNT = 4;
        auto gates = analyzer.get_variable_gates(w);
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] != &lookup_block)
                continue;
            if (analyzer.to_real(lookup_block.w_l()[gate_idx]) != w)
                continue;
            if (gate_idx + WITNESS_INPUT_GATE_COUNT > lookup_block.size())
                return std::nullopt;
            size_t hash = sha256_helpers::compute_selector_hash_without_table_index(
                0, lookup_block, gate_idx, gate_idx + WITNESS_INPUT_GATE_COUNT - 1);
            if (hash != expected_hash)
                continue; // wrong table type — keep searching for the correct lookup
            return std::make_pair(analyzer.to_real(lookup_block.w_r()[gate_idx]),
                                  analyzer.to_real(lookup_block.w_o()[gate_idx]));
        }
        return std::nullopt;
    };

    // --- Steps 1-2: Validate convert_witness lookups ---
    static constexpr size_t SHA256_WITNESS_INPUT_HASH = sha256_helpers::SHA256_WITNESS_INPUT_HASH;

    if (!w_left_const) {
        auto cw_left = step12_convert_witness(w_real[i - 15], SHA256_WITNESS_INPUT_HASH);
        if (!cw_left.has_value()) {
            log_error("SHA256 extend_witness[", i, "]: step 1 (convert_witness left W[", i - 15, "]) failed");
            result = false;
        }
    }

    if (!w_right_const) {
        auto cw_right = step12_convert_witness(w_real[i - 2], SHA256_WITNESS_INPUT_HASH);
        if (!cw_right.has_value()) {
            log_error("SHA256 extend_witness[", i, "]: step 2 (convert_witness right W[", i - 2, "]) failed");
            result = false;
        }
    }

    // w[62] and w[63] have explicit 32-bit range constraints (all others are implicitly constrained via lookups)
    if (i == 62 || i == 63) {
        bool range_ok = validate_range_constraint(w_i_real, 32);
        if (!range_ok) {
            log_error("SHA256 extend_witness[", i, "]: 32-bit range constraint failed");
        }
        result &= range_ok;
    }

    return result;
}

/**
 * @brief Validate one SHA256 compression round and update state for the next round.
 *
 * Validates the following operations:
 *   1. ch = choose_with_sigma1(e, f, g)     — via validate_sha256_sparse_function
 *   2. maj = majority_with_sigma0(a, b, c)  — via validate_sha256_sparse_function
 *   3. T1 = ch.add_two(h, w[i] + K[i])     — via find_arithmetic_gate / case analysis
 *   4. e_new = add_normalize_unsafe(d, T1)  — via add_normalize gate search (NEG_TWO_POW_32 pattern)
 *   5. a_new = add_normalize_unsafe(T1, maj) — via add_normalize gate search
 *
 * After validation, updates state to reflect the SHA256 round rotation:
 *   h=g, g=f, f=e, e=d+T1, d=c, c=b, b=a, a=T1+maj
 *   Sparse forms: f_sparse=e_sparse (from choose), g_sparse=old_f_sparse,
 *                 b_sparse=a_sparse (from majority), c_sparse=old_b_sparse
 *
 * @param state  Mutable round state (real indices, IS_CONSTANT for constants). Updated in-place.
 * @param w_i_real  Real index of w[i], or IS_CONSTANT if constant.
 * @param w_i_const  Whether w[i] is constant.
 * @param round_idx  Round number (0..63).
 * @param discovered_w_i_real  Output: real index of w[i] discovered from gate wires (for extend_witness).
 * @return true if all validations pass.
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_sha256comression_round(
    Sha256RoundState& state, uint32_t w_i_real, bool w_i_const, size_t round_idx, uint32_t& discovered_w_i_real)
{
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;
    bool result = true;
    discovered_w_i_real = w_i_real; // default: same as input (for i < 16 or constant case)
    state.w_i_real = w_i_real;      // also store in state for extend_witness validation

    // --- 1. Validate choose_with_sigma1(e, f, g) ---
    Sha256SparseFunctionParams choose_params{
        .type = Sha256SparseFunctionType::CHOOSE,
        .primary_sparse_real = state.e,
        .fst_sparse_real = state.f_sparse,
        .snd_sparse_real = state.g_sparse,
        .input_gate_count = 3,
        .output_gate_count = 16,
        .input_selector_hash = sha256_helpers::SHA256_CH_INPUT_HASH,
        .output_selector_hash = sha256_helpers::SHA256_CH_OUTPUT_HASH,
        .log_prefix = "choose",
    };

    auto choose_result = validate_sha256_sparse_function(choose_params, state.lookup_lower_bound);
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
        .input_selector_hash = sha256_helpers::SHA256_MAJ_INPUT_HASH,
        .output_selector_hash = sha256_helpers::SHA256_MAJ_OUTPUT_HASH,
        .log_prefix = "majority",
    };

    auto majority_result = validate_sha256_sparse_function(majority_params, state.lookup_lower_bound);
    result &= majority_result.valid;
    uint32_t maj_real = majority_result.result_real;
    uint32_t a_sparse_real = majority_result.primary_sparse_real;

    // --- 3. Validate T1 = ch.add_two(h, w[i] + K[i]) ---
    // Lambda: find T1 gate, discover T1_real and w_i_real.
    // Returns {T1_real, discovered_w_i_real} or {CONST, CONST} if all constant.
    bool T1_const = (ch_real == CONST) && (state.h == CONST) && w_i_const;
    uint32_t T1_real = CONST;

    auto validate_T1_gate = [&]() -> std::pair<uint32_t, uint32_t> {
        if (T1_const) {
            return { CONST, CONST };
        }

        auto& ab = builder.blocks.arithmetic;

        // Both ch and h non-const: T1 = ch.add_two(h, w[i]+K[i]).
        // 3 non-const → big_mul_add (w_o=w[i], w_4=T1), 2 non-const → add_gate (w_o=T1, w[i] absorbed).
        if (ch_real != CONST && state.h != CONST) {
            auto gate_candidates = find_arithmetic_gate({ ch_real, state.h });
            for (size_t gi : gate_candidates) {
                uint32_t wo = analyzer.to_real(ab.w_o()[gi]);
                uint32_t w4 = analyzer.to_real(ab.w_4()[gi]);

                if (ab.q_4()[gi] == FF::neg_one()) {
                    return { w4, wo }; // big_mul_add: T1 in w_4, w[i] in w_o
                } else if (ab.q_3()[gi] == FF::neg_one()) {
                    return { wo, CONST }; // add_gate: T1 in w_o, w[i] constant
                }
            }
            log_error("SHA256 round", round_idx, ": T1 gate not found (ch+h non-const)");
            return { CONST, CONST };
        }

        // Both ch and h const, w[i] non-const: no gate, T1 wraps w[i] with absorbed constants.
        if (ch_real == CONST && state.h == CONST && !w_i_const) {
            return { w_i_real, w_i_real };
        }

        // Exactly one of ch/h non-const.
        uint32_t known = (ch_real != CONST) ? ch_real : state.h;

        if (w_i_const) {
            // w[i] constant: only 1 non-const total, no gate. T1 wraps the sole witness.
            return { known, CONST };
        }

        if (w_i_real != CONST) {
            // w[i] known and non-const: 2 non-const, find gate by {known, w[i]}.
            auto gate_candidates = find_arithmetic_gate({ known, w_i_real });
            for (size_t gi : gate_candidates) {
                if (ab.q_4()[gi] == FF::neg_one()) {
                    return { analyzer.to_real(ab.w_4()[gi]), w_i_real };
                } else if (ab.q_3()[gi] == FF::neg_one()) {
                    return { analyzer.to_real(ab.w_o()[gi]), w_i_real };
                }
            }
        }

        // w[i] unknown (not yet discovered): only 1 non-const, no gate. T1 wraps known.
        return { known, w_i_real };
    };

    // Skip T1 validation if we have no anchors (ch and h both const, w[i] unknown)
    bool t1_skipped = (ch_real == CONST && state.h == CONST && !w_i_const && w_i_real == CONST);
    if (!t1_skipped) {
        auto [t1, wi] = validate_T1_gate();
        T1_real = t1;
        if (wi != CONST) {
            discovered_w_i_real = wi;
            state.w_i_real = wi;
        }
    }

    // --- 4-5. Find e_new and a_new via add_normalize_unsafe ---
    bool d_const = (state.d == CONST);
    bool a_new_const = T1_const && (maj_real == CONST);
    uint32_t e_new_real = CONST;
    uint32_t a_new_real = CONST;
    static constexpr FF NEG_TWO_POW_32 = -FF(uint256_t(1) << 32);

    // Lambda: find add_normalize gate by searching from a known witness.
    // Returns {result_real, gate_idx} or {CONST, nullopt}.
    auto find_add_norm_gate = [&](uint32_t search_real,
                                  uint32_t exclude_result) -> std::pair<uint32_t, std::optional<size_t>> {
        auto& ab = builder.blocks.arithmetic;
        auto gates = analyzer.get_variable_gates(search_real);
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] != &ab)
                continue;
            if (!ab.q_m()[gate_idx].is_zero() || read_gate_selector(ab, GateKind::Arith, gate_idx) != FF::one())
                continue;
            FF q_2 = ab.q_2()[gate_idx];
            FF q_3 = ab.q_3()[gate_idx];
            if (q_3 != NEG_TWO_POW_32 && q_2 != NEG_TWO_POW_32)
                continue;
            // Equation check
            FF q_1 = ab.q_1()[gate_idx];
            FF q_4 = ab.q_4()[gate_idx];
            FF q_c = ab.q_c()[gate_idx];
            FF wl = builder.get_variable(ab.w_l()[gate_idx]);
            FF wr = builder.get_variable(ab.w_r()[gate_idx]);
            FF wo = builder.get_variable(ab.w_o()[gate_idx]);
            FF w4 = builder.get_variable(ab.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero())
                continue;
            uint32_t res =
                (q_3 == NEG_TWO_POW_32) ? analyzer.to_real(ab.w_4()[gate_idx]) : analyzer.to_real(ab.w_o()[gate_idx]);
            if (res == exclude_result)
                continue;
            return { res, gate_idx };
        }
        return { CONST, std::nullopt };
    };

    if (T1_real != CONST) {
        // Normal path: T1 known, search by T1 directly.
        // Distinguish e_new from a_new by checking state.d (for e_new) or maj (for a_new) on wires.
        auto& ab = builder.blocks.arithmetic;
        auto t1_gates = analyzer.get_variable_gates(T1_real);

        for (const auto& [blk_idx, gate_idx] : t1_gates) {
            if (&builder.blocks.get()[blk_idx] != &ab)
                continue;
            if (!ab.q_m()[gate_idx].is_zero() || read_gate_selector(ab, GateKind::Arith, gate_idx) != FF::one())
                continue;
            FF q_2 = ab.q_2()[gate_idx];
            FF q_3 = ab.q_3()[gate_idx];
            if (q_3 != NEG_TWO_POW_32 && q_2 != NEG_TWO_POW_32)
                continue;
            // Equation check
            FF q_1 = ab.q_1()[gate_idx];
            FF q_4 = ab.q_4()[gate_idx];
            FF q_c = ab.q_c()[gate_idx];
            FF wl = builder.get_variable(ab.w_l()[gate_idx]);
            FF wr = builder.get_variable(ab.w_r()[gate_idx]);
            FF wo = builder.get_variable(ab.w_o()[gate_idx]);
            FF w4 = builder.get_variable(ab.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero())
                continue;

            uint32_t res =
                (q_3 == NEG_TWO_POW_32) ? analyzer.to_real(ab.w_4()[gate_idx]) : analyzer.to_real(ab.w_o()[gate_idx]);
            uint32_t wl_real = analyzer.to_real(ab.w_l()[gate_idx]);
            uint32_t wr_real = analyzer.to_real(ab.w_r()[gate_idx]);

            // e_new gate: d.add_two(T1, overflow) — d on a wire when d non-const
            // a_new gate: T1.add_two(maj, overflow) — maj on a wire when maj non-const
            // When d or maj is const, their value is absorbed into q_c and not on any wire.
            bool has_d = !d_const && (wl_real == state.d || wr_real == state.d);
            bool has_maj = (maj_real != CONST) && (wl_real == maj_real || wr_real == maj_real);

            if (has_d && e_new_real == CONST) {
                e_new_real = res;

            } else if (has_maj && a_new_real == CONST) {
                a_new_real = res;

            } else if (e_new_real == CONST && !has_maj) {
                // Neither d nor maj on wires — this is either e_new (d const) or a_new (maj const).
                // Assign to e_new first (created first in sha256_block).
                e_new_real = res;

            } else if (a_new_real == CONST) {
                // Remaining gate is a_new
                a_new_real = res;
            }

            if (e_new_real != CONST && a_new_real != CONST)
                break;
        }
    } else if (t1_skipped) {
        // T1 unknown (ch and h const, w[i] non-const but unknown index).
        // Find e_new via state.d, or a_new via maj_real, then discover T1 from the gate.
        auto& ab = builder.blocks.arithmetic;

        if (!d_const) {
            // e_new gate: d.add_two(T1, overflow) — search by d
            auto [res, gi] = find_add_norm_gate(state.d, CONST);
            if (res != CONST && gi.has_value()) {
                e_new_real = res;
                // Discover T1 from the gate: the wire that isn't d, overflow, or result
                // In big_mul_add: w_l=d, w_r=T1. In add_gate: T1 absorbed or on w_l/w_r.
                uint32_t wr = analyzer.to_real(ab.w_r()[*gi]);
                if (wr != state.d && wr != e_new_real) {
                    T1_real = wr;
                    discovered_w_i_real = wr; // T1 wraps w[i]
                    state.w_i_real = wr;
                }
            }
        }

        if (maj_real != CONST) {
            // a_new gate: T1.add_two(maj, overflow) — search by maj
            auto [res, gi] = find_add_norm_gate(maj_real, e_new_real);
            if (res != CONST && gi.has_value()) {
                a_new_real = res;
                // Discover T1 if not yet found
                if (T1_real == CONST) {
                    uint32_t wl = analyzer.to_real(ab.w_l()[*gi]);
                    if (wl != maj_real && wl != a_new_real) {
                        T1_real = wl;
                        discovered_w_i_real = wl;
                        state.w_i_real = wl;
                    }
                }
            }
        }

        // If T1 discovered, find the remaining gate.
        // T1 appears in exactly 2 add_normalize gates (e_new and a_new).
        // One was already found above. Pass the found result as exclude_result
        // so find_add_norm_gate skips that gate and returns the other one.
        if (T1_real != CONST) {
            if (e_new_real == CONST) {
                auto [res, gi] = find_add_norm_gate(T1_real, a_new_real);
                if (res != CONST) {
                    e_new_real = res;
                }
            }
            if (a_new_real == CONST) {
                auto [res, gi] = find_add_norm_gate(T1_real, e_new_real);
                if (res != CONST) {
                    a_new_real = res;
                }
            }
        }
    }

    if (e_new_real == CONST && !(d_const && T1_const)) {
        log_error("SHA256 round", round_idx, ": e_new add_normalize gate not found");
        result = false;
    }
    if (a_new_real == CONST && !a_new_const) {
        log_error("SHA256 round", round_idx, ": a_new add_normalize gate not found");
        result = false;
    }

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
 * @brief Validates SHA256 compression constraint by tracing through the full circuit structure.
 *
 * Algorithm:
 *   0. All-constant fast path: if all inputs and hash_values are constant, verify result
 *      against native SHA256 computation — no circuit gates to validate.
 *   1. Range constraint check: validate 32-bit decompose chains for non-constant
 *      hash_values[3], hash_values[7], inputs[0].
 *   2. Lookup connectivity: verify non-constant hash_values[0,1,2,4,5,6] appear in lookup w_l.
 *   3. Initial state: build Sha256RoundState from constraint witnesses, find initial sparse
 *      forms (b_sparse, c_sparse, f_sparse, g_sparse) via lookup block with lower bound
 *      to disambiguate setup lookups from round lookups.
 *   4. 64-round loop: for each round, validate choose/majority sparse functions, T1 gate,
 *      e_new/a_new add_normalize gates, and extend_witness (rounds 16-63).
 *   5. Final range constraints: validate 32-bit range constraints on final a.normal and e.normal.
 *   6. Output validation: verify output[i] = add_normalize(state[i], h_init[i]) gate connectivity
 *      and 32-bit range constraints on all 8 result witnesses.
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_sha256compression_constraint(const ConstraintPtr& ptr)
{
    constexpr size_t bit_range = 32;
    const auto* constraint = std::get<const acir_format::Sha256Compression*>(ptr);
    bool result = true;

    // Check if all inputs and hash_values are constant
    bool all_constant = true;
    for (const auto& input : constraint->inputs) {
        if (!input.is_constant) {
            all_constant = false;
            break;
        }
    }
    if (all_constant) {
        for (const auto& hv : constraint->hash_values) {
            if (!hv.is_constant) {
                all_constant = false;
                break;
            }
        }
    }

    if (all_constant) {
        // No circuit gates created — just verify the result matches native SHA256
        std::array<uint32_t, 8> h_native;
        std::array<uint32_t, 16> in_native;
        std::transform(constraint->hash_values.begin(),
                       constraint->hash_values.end(),
                       h_native.begin(),
                       [](const auto& woc) { return static_cast<uint32_t>(uint256_t(woc.value)); });
        std::transform(constraint->inputs.begin(), constraint->inputs.end(), in_native.begin(), [](const auto& woc) {
            return static_cast<uint32_t>(uint256_t(woc.value));
        });
        auto expected = crypto::sha256_block(h_native, in_native);
        for (const auto& [res_idx, exp_val] : zip_view(constraint->result, expected)) {
            FF result_val = builder.get_variable(res_idx);
            if (result_val != FF(exp_val)) {
                log_error("SHA256 CHECK FAIL: all-constant result mismatch");
                return false;
            }
        }
        return true;
    }

    // Validate decompose chains on range-constrained ACIR witnesses
    // SHA256 calls create_range_constraint(32) on hash_values[3], hash_values[7], inputs[0]
    const std::array<const WitnessOrConstant<FF>, 3> range_constrained_witnesses = { constraint->hash_values[3],
                                                                                     constraint->hash_values[7],
                                                                                     constraint->inputs[0] };
    for (const auto& rc_witness : range_constrained_witnesses) {
        if (rc_witness.is_constant) {
            continue;
        }
        bool rc_ok = validate_range_constraint(analyzer.to_real(rc_witness.index), bit_range);
        if (!rc_ok) {
            log_error("SHA256 CHECK FAIL: decompose chain for range_constrained_witness");
        }
        result &= rc_ok;
    }

    auto& lookup_block = builder.blocks.lookup;
    [[maybe_unused]] auto& arith = builder.blocks.arithmetic;

    // Non-range-constrained hash_values in lookup w_l
    // hash_values[0,1,2,4,5,6] undergo SHA256 sparse decomposition via plookup tables
    // hash_values[3,7] are range-constrained — handled by other checks
    std::vector<size_t> non_range_constrained_hash_values_indices{ 0, 1, 2, 4, 5, 6 };
    for (auto& i : non_range_constrained_hash_values_indices) {
        if (constraint->hash_values[i].is_constant) {
            continue;
        }
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
            log_error("SHA256 CHECK FAIL: hash_values[", i, "] not in lookup w_l");
        }
        result &= found;
    }

    // we can precompute constant or non-constant status of extended witness result using first 16 inputs
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

    auto w_const = compute_w_constant_flags();

    // --- Step 1: Build initial round state from constraint ---
    constexpr uint32_t CONST = bb::stdlib::IS_CONSTANT;

    auto to_real_or_const = [&](const WitnessOrConstant<FF>& woc) -> uint32_t {
        return woc.is_constant ? CONST : analyzer.to_real(woc.index);
    };

    Sha256RoundState state;
    state.a = to_real_or_const(constraint->hash_values[0]);
    state.b = to_real_or_const(constraint->hash_values[1]);
    state.c = to_real_or_const(constraint->hash_values[2]);
    state.d = to_real_or_const(constraint->hash_values[3]);
    state.e = to_real_or_const(constraint->hash_values[4]);
    state.f = to_real_or_const(constraint->hash_values[5]);
    state.g = to_real_or_const(constraint->hash_values[6]);
    state.h = to_real_or_const(constraint->hash_values[7]);
    state.w_i_real = CONST;

    // --- Step 2: Find initial sparse forms from lookup block ---
    // b_sparse from map_into_maj_sparse_form(h[1]), c_sparse from h[2]
    // f_sparse from map_into_choose_sparse_form(h[5]), g_sparse from h[6]
    size_t lookup_lower_bound = 0;
    auto find_sparse_in_lookup = [&](uint32_t normal_real) -> uint32_t {
        if (normal_real == CONST) {
            return CONST;
        }
        for (size_t gi = lookup_lower_bound; gi < lookup_block.size(); ++gi) {
            if (builder.real_variable_index[lookup_block.w_l()[gi]] == normal_real) {
                lookup_lower_bound = gi + 1;
                return builder.real_variable_index[lookup_block.w_r()[gi]];
            }
        }
        return CONST;
    };

    // Order must match circuit: b(maj), c(maj), f(choose), g(choose)
    state.b_sparse = find_sparse_in_lookup(state.b);
    state.c_sparse = find_sparse_in_lookup(state.c);
    state.f_sparse = find_sparse_in_lookup(state.f);
    state.g_sparse = find_sparse_in_lookup(state.g);
    state.lookup_lower_bound = lookup_lower_bound; // past all setup lookups

    // --- Step 3: Build w_real array ---
    std::array<uint32_t, 64> w_real;
    w_real.fill(CONST);
    for (size_t i = 0; i < 16; ++i) {
        w_real[i] = to_real_or_const(constraint->inputs[i]);
    }

    static constexpr FF NEG_TWO_POW_32_OUT = -FF(uint256_t(1) << 32);
    // Lambda to find output addition gate: output[i] = add_normalize_unsafe(state[i], h_init[i])
    auto find_output_addition_gate = [&](uint32_t result_idx) -> std::optional<size_t> {
        uint32_t result_real = analyzer.to_real(result_idx);
        auto gates = analyzer.get_variable_gates(result_real);
        for (const auto& [blk_idx, gate_idx] : gates) {
            if (&builder.blocks.get()[blk_idx] != &arith)
                continue;
            if (!arith.q_m()[gate_idx].is_zero() || read_gate_selector(arith, GateKind::Arith, gate_idx) != FF::one())
                continue;
            FF q_2 = arith.q_2()[gate_idx];
            FF q_3 = arith.q_3()[gate_idx];
            if (q_3 != NEG_TWO_POW_32_OUT && q_2 != NEG_TWO_POW_32_OUT)
                continue;
            // Verify gate equation
            FF q_1 = arith.q_1()[gate_idx];
            FF q_4 = arith.q_4()[gate_idx];
            FF q_c = arith.q_c()[gate_idx];
            FF wl = builder.get_variable(arith.w_l()[gate_idx]);
            FF wr = builder.get_variable(arith.w_r()[gate_idx]);
            FF wo = builder.get_variable(arith.w_o()[gate_idx]);
            FF w4 = builder.get_variable(arith.w_4()[gate_idx]);
            if (q_1 * wl + q_2 * wr + q_3 * wo + q_4 * w4 + q_c != FF::zero())
                continue;
            // Verify that result_real is the output wire
            uint32_t res = (q_3 == NEG_TWO_POW_32_OUT) ? analyzer.to_real(arith.w_4()[gate_idx])
                                                       : analyzer.to_real(arith.w_o()[gate_idx]);
            if (res == result_real) {
                return gate_idx;
            }
        }
        return std::nullopt;
    };

    // --- Step 4: 64-round validation loop with extend_witness ---
    constexpr size_t num_rounds = 64;
    for (size_t i = 0; i < num_rounds; ++i) {
        uint32_t w_i_real = w_const[i] ? CONST : w_real[i];
        uint32_t discovered_w_i = CONST;

        bool round_ok = process_sha256comression_round(state, w_i_real, w_const[i], i, discovered_w_i);
        if (!round_ok) {
            log_error("SHA256 CHECK FAIL: compression round ", i);
        }
        result &= round_ok;
        if (!result) {
            break;
        }

        // Update w_real from discovered witness
        if (state.w_i_real != CONST) {
            w_real[i] = state.w_i_real;
        }

        // Validate extend_witness for w[i] >= 16 and non-constant
        if (i >= 16 && !w_const[i]) {
            if (w_real[i] == CONST) {
                log_error("SHA256 CHECK FAIL: w_real[", i, "] not discovered for extend_witness");
                result = false;
                break;
            }
            bool ew_ok = validate_extend_witness_iteration(w_real[i], w_real, w_const, i);
            if (!ew_ok) {
                log_error("SHA256 CHECK FAIL: extend_witness iteration ", i);
            }
            result &= ew_ok;
            if (!result) {
                break;
            }
        }
    }

    // --- Step 5: Validate 32-bit range constraints on final a and e ---
    // a.normal and e.normal are the only round outputs not already lookup-constrained.
    if (state.a != CONST) {
        bool a_range = validate_range_constraint(state.a, 32);
        if (!a_range) {
            log_error("SHA256 CHECK FAIL: final a.normal 32-bit range constraint");
        }
        result &= a_range;
    }
    if (state.e != CONST) {
        bool e_range = validate_range_constraint(state.e, 32);
        if (!e_range) {
            log_error("SHA256 CHECK FAIL: final e.normal 32-bit range constraint");
        }
        result &= e_range;
    }

    // --- Step 6: Validate output addition gates and final range constraints ---
    // After 64 rounds, state holds final {a, b, c, d, e, f, g, h}.
    // output[i] = add_normalize_unsafe(state_final[i], h_init[i], overflow_bits=1)
    // Then assert_equal(output[i], result_witness[i])
    // State mapping: a→result[0], b→result[1], ..., h→result[7]
    const std::array<uint32_t, 8> final_state = {
        state.a, state.b, state.c, state.d, state.e, state.f, state.g, state.h
    };
    const std::array<uint32_t, 8> h_init_real = {
        to_real_or_const(constraint->hash_values[0]), to_real_or_const(constraint->hash_values[1]),
        to_real_or_const(constraint->hash_values[2]), to_real_or_const(constraint->hash_values[3]),
        to_real_or_const(constraint->hash_values[4]), to_real_or_const(constraint->hash_values[5]),
        to_real_or_const(constraint->hash_values[6]), to_real_or_const(constraint->hash_values[7])
    };

    for (size_t i = 0; i < 8; ++i) {
        [[maybe_unused]] uint32_t result_real = analyzer.to_real(constraint->result[i]);
        // Verify the output is connected: result[i] should be the output of an add_normalize gate
        // that has state[i] and h_init[i] as inputs (or their values absorbed into q_c if constant).
        bool state_on_gate = (final_state[i] != CONST);
        bool hinit_on_gate = (h_init_real[i] != CONST);

        if (!state_on_gate && !hinit_on_gate) {
            // Both constant → result is constant too, no gate created
            // Just verify the result witness exists
            continue;
        }

        // Find the output addition gate for this result
        auto gate_idx = find_output_addition_gate(constraint->result[i]);
        if (!gate_idx.has_value()) {
            log_error("SHA256 CHECK FAIL: output gate not found for result[", i, "]");
            result = false;
            continue;
        }

        // Verify that the gate wires connect to state[i] and/or h_init[i]
        uint32_t wl_real = analyzer.to_real(arith.w_l()[*gate_idx]);
        uint32_t wr_real = analyzer.to_real(arith.w_r()[*gate_idx]);

        if (state_on_gate) {
            bool found_state = (wl_real == final_state[i] || wr_real == final_state[i]);
            if (!found_state) {
                log_error("SHA256 CHECK FAIL: output[", i, "] gate doesn't connect to final state");
                result = false;
            }
        }
        if (hinit_on_gate) {
            bool found_hinit = (wl_real == h_init_real[i] || wr_real == h_init_real[i]);
            if (!found_hinit) {
                log_error("SHA256 CHECK FAIL: output[", i, "] gate doesn't connect to h_init[", i, "]");
                result = false;
            }
        }

        // Validate that result[i] has a 32-bit range constraint.
        // add_normalize_unsafe returns field_t with (mult=1, add=0), so normalize() is a no-op.
        // The decompose chain is directly on the output wire of the add_normalize gate.
        uint32_t output_wire;
        FF q_3_gate = arith.q_3()[*gate_idx];
        if (q_3_gate == NEG_TWO_POW_32_OUT) {
            output_wire = arith.w_4()[*gate_idx]; // big_mul_add: result in w_4
        } else {
            output_wire = arith.w_o()[*gate_idx]; // add_gate: result in w_o
        }

        bool range_ok = validate_range_constraint(output_wire, 32);
        if (!range_ok) {
            log_error("SHA256 CHECK FAIL: result[", i, "] 32-bit range constraint");
        }
        result &= range_ok;
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

template class StaticAnalyzerAcir_<fr, MegaCircuitBuilder>;
template class StaticAnalyzerAcir_<fr, UltraCircuitBuilder>;
} // namespace cdg
