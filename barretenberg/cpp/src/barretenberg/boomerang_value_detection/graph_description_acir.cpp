#include "./graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/databus.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
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

// Check if the gate is a RAM/ROM access gate.
// The selectors are the same for RAM r/w and ROM r operations
// see apply_memory_selectors in ultra_circuit_builder.cpp
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::is_ram_rom_access_gate(size_t block_idx, size_t gate_idx)
{
    auto& block = builder.blocks.get()[block_idx];
    auto q_1 = block.q_1()[gate_idx];
    auto q_2 = block.q_2()[gate_idx];
    auto q_3 = block.q_3()[gate_idx];
    auto q_4 = block.q_4()[gate_idx];
    auto q_m = block.q_m()[gate_idx];
    auto q_memory = block.q_memory()[gate_idx];
    // q_1 == 1, q_2 == 0, q_3 == 0, q_4 == 0, q_m == 1, q_c == 0/1 (R:W for RAM), q_memory == 1
    return (q_1 == FF::one() && q_2 == FF::zero() && q_3 == FF::zero() && q_4 == FF::zero() && q_m == FF::one() &&
            q_memory == FF::one());
}

// Check if the gate is busread gate.
// These types of gates are only available in MegaCircuitBuilder.
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::is_busread_gate(size_t block_idx, size_t gate_idx, const BusId bus_idx)
{
    auto& block = builder.blocks.get()[block_idx];
    auto q_1 = block.q_1()[gate_idx];
    auto q_2 = block.q_2()[gate_idx];
    auto q_3 = block.q_3()[gate_idx];
    auto q_4 = block.q_4()[gate_idx];
    auto q_m = block.q_m()[gate_idx];
    auto q_c = block.q_c()[gate_idx];
    auto q_busread = block.q_busread()[gate_idx];

    // see mega_circuit_builder.cpp::apply_databus_selectors
    bool default_mask = (q_4 == FF::zero() && q_m == FF::zero() && q_c == FF::zero() && q_busread == FF::one());
    switch (bus_idx) {
    case BusId::CALLDATA: {
        return default_mask && q_1 == FF::one() && q_2 == FF::zero() && q_3 == FF::zero();
    }
    case BusId::SECONDARY_CALLDATA: {
        return default_mask && q_1 == FF::zero() && q_2 == FF::one() && q_3 == FF::zero();
    }
    case BusId::RETURNDATA: {
        return default_mask && q_1 == FF::zero() && q_2 == FF::zero() && q_3 == FF::one();
    }
    default: {
        return false;
    }
    }
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
        case AcirConstraintType::BLOCK:
            result = process_block_constraint(constraint_info.ptr);
        case AcirConstraintType::BIG_QUAD:
            result = process_big_quad_constraints(constraint_info.ptr);
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

// Checks that the ROM constraint is valid.
// Checks that for every element in the init and trace there is a corresponding gate in the rom_gates
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_rom_constraint(
    const BlockConstraint& constraint, const std::vector<std::pair<uint32_t, uint32_t>>& rom_gates)
{
    // Helper: For the given index and value, count the number of corresponding ROM gatess
    auto find_corresponding_mem_op_gate = [this, rom_gates, constraint](uint32_t index, uint32_t value) {
        return std::count_if(
            rom_gates.begin(), rom_gates.end(), [this, index, value](const std::pair<uint32_t, uint32_t>& gate) {
                auto block_idx = gate.first;
                auto gate_idx = gate.second;
                auto& block = builder.blocks.get()[block_idx];
                bool condition = true;
                // all other conditions are checked in is_rom_gate lamda
                condition &= block.q_c()[gate_idx] == FF::zero();         // q_c is always zero for ROM access
                condition &= block.w_o()[gate_idx] == builder.zero_idx(); // w_o is always zero_idx for ROM access
                condition &= builder.get_variable(block.w_l()[gate_idx]) == index; // w_l = mem_op.index
                condition &= builder.get_variable(block.w_r()[gate_idx]) == value; // w_r = mem_op.value
                return condition;
            });
    };
    // Validate init
    for (uint32_t init_idx = 0; init_idx < constraint.init.size(); init_idx++) {
        auto corresponding_gate_count = find_corresponding_mem_op_gate(init_idx, constraint.init[init_idx]);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for init", init_idx);
            return false; // no corresponding gate found
        } else if (corresponding_gate_count > 1) {
            throw std::runtime_error("Found multiple gates for the same init");
        }
    }

    // Validate trace
    for (uint32_t mem_op_idx = 0; mem_op_idx < constraint.trace.size(); mem_op_idx++) {
        if (constraint.trace[mem_op_idx].index.is_constant) {
            continue; // does not create gate on constant index
        }

        auto corresponding_gate_count =
            find_corresponding_mem_op_gate(analyzer.to_real(constraint.trace[mem_op_idx].index.index),
                                           analyzer.to_real(constraint.trace[mem_op_idx].value.index));
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for mem_op", mem_op_idx);
            return false; // no corresponding gate found
        } else if (corresponding_gate_count > 1) {
            throw std::runtime_error("Found multiple gates for the same mem_op");
        }
    }
    return true;
}

// Checks that the RAM constraint is valid.
// Checks that for every element in the init and trace there is a corresponding gate in the rom_gates
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_ram_constraint(
    const BlockConstraint& constraint, const std::vector<std::pair<uint32_t, uint32_t>>& ram_gates)
{
    // Helper: For the given index and value, count the number of corresponding RAM gatess
    auto find_corresponding_mem_op_gate = [this, ram_gates, constraint](
                                              uint32_t index, uint32_t value, bool is_write, uint32_t timestamp) {
        return std::count_if(
            ram_gates.begin(),
            ram_gates.end(),
            [this, index, value, is_write, timestamp](const std::pair<uint32_t, uint32_t>& gate) {
                auto block_idx = gate.first;
                auto gate_idx = gate.second;
                auto& block = builder.blocks.get()[block_idx];
                bool condition = true;
                // all other conditions are checked in is_ram_gate lamda
                condition &= block.q_c()[gate_idx] ==
                             (is_write ? FF::one() : FF::zero()); // q_c is one for write and zero for read
                condition &= builder.get_variable(block.w_o()[gate_idx]) == value; // w_o is not zero_idx for RAM access
                condition &= builder.get_variable(block.w_l()[gate_idx]) == index; // w_l = mem_op.index
                condition &= builder.get_variable(block.w_r()[gate_idx]) == timestamp; // w_r = timestamp
                return condition;
            });
    };

    // Process init.
    // see rom_ram_logic.cpp:init_RAM_element, it is just WRITE ram gate for each init element
    uint32_t timestamp = 0;
    for (uint32_t init_idx = 0; init_idx < constraint.init.size(); init_idx++) {
        auto corresponding_gate_count =
            find_corresponding_mem_op_gate(init_idx, constraint.init[init_idx], /*is_write=*/true, timestamp);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for init", init_idx);
            return false; // no corresponding gate found
        } else if (corresponding_gate_count > 1) {
            throw std::runtime_error("Found multiple gates for the same init");
        }
        timestamp++;
    }

    // Process trace.
    for (auto mem_op : constraint.trace) {
        auto corresponding_gate_count = find_corresponding_mem_op_gate(analyzer.to_real(mem_op.index.index),
                                                                       analyzer.to_real(mem_op.value.index),
                                                                       mem_op.access_type == AccessType::Write,
                                                                       timestamp);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for mem_op at timestamp", timestamp);
            return false; // no corresponding gate found
        }
        timestamp++;
    }
    return true;
}
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_block_constraint(const ConstraintPtr& ptr)
{
    [[maybe_unused]] auto is_calldata_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) -> bool {
        return is_busread_gate(block_idx, gate_idx, BusId::CALLDATA) ||
               is_busread_gate(block_idx, gate_idx, BusId::SECONDARY_CALLDATA);
    };
    [[maybe_unused]] auto is_returndata_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) -> bool {
        return is_busread_gate(block_idx, gate_idx, BusId::RETURNDATA);
    };
    // RAM/ROM access gates have the same selectors, but for ROM w_o is always zero_idx and for RAM w_o is
    // not zero_idx
    auto is_rom_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) -> bool {
        return is_ram_rom_access_gate(block_idx, gate_idx) &&
               builder.blocks.get()[block_idx].w_o()[gate_idx] == builder.zero_idx();
    };
    auto is_ram_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) -> bool {
        return is_ram_rom_access_gate(block_idx, gate_idx) &&
               builder.blocks.get()[block_idx].w_o()[gate_idx] != builder.zero_idx();
    };

    auto memory_block_idx = static_cast<uint32_t>(*analyzer.find_block_index(builder.blocks.memory));
    [[maybe_unused]] auto databus_block_idx = static_cast<uint32_t>(*analyzer.find_block_index(builder.blocks.busread));

    // Get gates from the given block index that satisfy the filter function
    auto get_gates = [this](const uint32_t block_idx,
                            const auto& filter_function) -> std::vector<std::pair<uint32_t, uint32_t>> {
        auto& block = builder.blocks.get()[block_idx];
        std::vector<std::pair<uint32_t, uint32_t>> gates;
        for (uint32_t gate_idx = 0; gate_idx < block.size(); gate_idx++) {
            if (filter_function(block_idx, gate_idx)) {
                gates.push_back(std::make_pair(block_idx, gate_idx));
            }
        }
        return gates;
    };

    const auto* block_constraint = std::get<const acir_format::BlockConstraint*>(ptr);
    switch (block_constraint->type) {
    case BlockType::ROM:
        return validate_rom_constraint(*block_constraint, get_gates(memory_block_idx, is_rom_gate));
    case BlockType::RAM:
        return validate_ram_constraint(*block_constraint, get_gates(memory_block_idx, is_ram_gate));
    default:
        throw std::runtime_error("Unexpected block constraint type");
    }

    return true;
}
template class StaticAnalyzerAcir_<fr, MegaCircuitBuilder>;
} // namespace cdg
