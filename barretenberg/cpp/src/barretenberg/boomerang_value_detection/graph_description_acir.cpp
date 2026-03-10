#include "./graph_description_acir.hpp"
#include "barretenberg/boomerang_value_detection/helpers/aes_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/cycle_group_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/cycle_scalar_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/ecdsa_helpers.hpp"
#include "barretenberg/boomerang_value_detection/helpers/range_helpers.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include <optional>
#include <type_traits>
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

/* Check if the gate is a RAM/ROM access gate.
 * The selectors are the same for RAM r/w and ROM r operations
 * see apply_memory_selectors in ultra_circuit_builder.cpp
 * | gate type                    | q_mem | q_1 | q_2 | q_3 | q_4 | q_m | q_c |
 * | ---------------------------- | ----- | --- | --- | --- | --- | --- | --- |
 * | RAM/ROM access gate          | 1     | 1   | 0   | 0   | 0   | 1   | --- |
 * | RAM timestamp check          | 1     | 1   | 0   | 0   | 1   | 0   | --- |
 * | ROM consistency check        | 1     | 1   | 1   | 0   | 0   | 0   | --- |
 * | RAM consistency check        | 1     | 0   | 0   | 1   | 0   | 0   | 0   |
 */
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
    if constexpr (std::is_same_v<CircuitBuilder, UltraCircuitBuilder>) {
        return false;
    } else {
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
    analyzer.clear_consumed_gates();
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
        case AcirConstraintType::BLOCK:
            result = process_block_constraint(constraint_info.ptr);
            break;
        case AcirConstraintType::EC_ADD:
            result = process_ec_add_constraint(constraint_info.ptr);
            break;
        case AcirConstraintType::MULTI_SCALAR_MUL:
            result = process_multi_scalar_mul_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::ECDSA_K1:
        case AcirConstraintType::ECDSA_R1:
            result = process_ecdsa_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::BLAKE2S:
            result = process_blake2s_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::BLAKE3:
            result = process_blake3_constraints(constraint_info.ptr, next_constraint_witnesses);
            break;
        case AcirConstraintType::KECCAK_PERMUTATION:
            result = process_keccak_permutation_constraints(constraint_info.ptr);
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
 *          from gate 0's values, allowing cor/ruption detection.
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
    // if all chunks for lookup tables are correct => a_accumulated and b_accumulated should be equal to initial values
    // of a and b
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
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& /*next_constraint_witnesses*/)
{
    const auto* constraint = std::get<const acir_format::AES128Constraint*>(ptr);
    return validate_aes<FF>(analyzer, builder, *constraint);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_range_constraint(uint32_t witness, uint32_t num_bits)
{
    return cdg::validate_range_constraint<FF>(analyzer, builder, witness, num_bits);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_range_constraints(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const acir_format::RangeConstraint*>(ptr);
    return validate_range_constraint(constraint->witness, constraint->num_bits);
}

// Checks that the ROM constraint is valid.
// Checks that for every element in the init and trace there is a corresponding gate in the rom_gates
// We intentionally ignore assert_equal gates during validation
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_rom_constraint(
    const BlockConstraint& constraint, const std::vector<std::pair<uint32_t, uint32_t>>& rom_gates)
{
    // Helper: For the given index and value, count the number of corresponding ROM gates
    auto find_corresponding_rom_gates_count = [this, rom_gates, constraint](uint32_t index, uint32_t value) {
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
                condition &= builder.get_variable(block.w_4()[gate_idx]) ==
                             FF::zero(); // w_4 = record_witness, which is zero during vkgen
                return condition;
            });
    };
    // Validate init
    for (uint32_t init_idx = 0; init_idx < constraint.init.size(); init_idx++) {
        auto corresponding_gate_count = find_corresponding_rom_gates_count(init_idx, constraint.init[init_idx]);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for init", init_idx);
            return false; // no corresponding gate found
        }
    }

    // Validate trace
    for (uint32_t mem_op_idx = 0; mem_op_idx < constraint.trace.size(); mem_op_idx++) {
        if (constraint.trace[mem_op_idx].index.is_constant) {
            continue; // does not create gate on constant index
        }

        auto corresponding_gate_count =
            find_corresponding_rom_gates_count(analyzer.to_real(constraint.trace[mem_op_idx].index.index),
                                               analyzer.to_real(constraint.trace[mem_op_idx].value.index));
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for mem_op", mem_op_idx);
            return false; // no corresponding gate found
        }
    }
    return true;
}

// Checks that the RAM constraint is valid.
// Checks that for every element in the init and trace there is a corresponding gate in the rom_gates
// We intentionally ignore assert_equal gates during validation
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_ram_constraint(
    const BlockConstraint& constraint, const std::vector<std::pair<uint32_t, uint32_t>>& ram_gates)
{
    // Helper: For the given index and value, count the number of corresponding RAM gates
    auto find_corresponding_ram_gates_count = [this, ram_gates, constraint](
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
                condition &= builder.get_variable(block.w_4()[gate_idx]) ==
                             FF::zero(); // w_4 = record_witness, which is zero during vkgen
                return condition;
            });
    };

    // Process init.
    // see rom_ram_logic.cpp:init_RAM_element, it is just WRITE ram gate for each init element
    uint32_t timestamp = 0;
    for (uint32_t init_idx = 0; init_idx < constraint.init.size(); init_idx++) {
        auto corresponding_gate_count =
            find_corresponding_ram_gates_count(init_idx, constraint.init[init_idx], /*is_write=*/true, timestamp);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for init", init_idx);
            return false; // no corresponding gate found
        }
        timestamp++;
    }

    // Process trace.
    for (auto mem_op : constraint.trace) {
        auto corresponding_gate_count = find_corresponding_ram_gates_count(analyzer.to_real(mem_op.index.index),
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

// Checks that the calldata constraint is valid.
// Checks that for every element in the trace there is a corresponding calldata databus read gate
// We intentionally ignore assert_equal gates during validation
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_calldata_constraint(
    const BlockConstraint& constraint, const std::vector<std::pair<uint32_t, uint32_t>>& calldata_gates)
{
    // Helper: For the given index and value, count the number of corresponding calldata databus read gates
    auto find_corresponding_calldata_gates_count =
        [this, calldata_gates, constraint](const FF& index, const FF& value, bool is_primary) {
            return std::count_if(
                calldata_gates.begin(),
                calldata_gates.end(),
                [this, index, value, is_primary](const std::pair<uint32_t, uint32_t>& gate) {
                    auto block_idx = gate.first;
                    auto gate_idx = gate.second;
                    auto& block = builder.blocks.get()[block_idx];
                    bool condition = true;
                    // Databus read gate wires: w_l = value, w_r = index, w_o = 0, w_4 = 0
                    condition &= builder.get_variable(block.w_l()[gate_idx]) == value;
                    condition &= builder.get_variable(block.w_r()[gate_idx]) == index;
                    condition &= builder.get_variable(block.w_o()[gate_idx]) == FF::zero();
                    condition &= builder.get_variable(block.w_4()[gate_idx]) == FF::zero();
                    if (is_primary) {
                        condition &= block.q_1()[gate_idx] == FF::one();  // q_1 is one for primary calldata
                        condition &= block.q_2()[gate_idx] == FF::zero(); // q_2 is zero for primary calldata
                        condition &= block.q_3()[gate_idx] == FF::zero(); // q_3 is zero for primary calldata
                    } else {
                        condition &= block.q_1()[gate_idx] == FF::zero(); // q_1 is zero for secondary calldata
                        condition &= block.q_2()[gate_idx] == FF::one();  // q_2 is one for secondary calldata
                        condition &= block.q_3()[gate_idx] == FF::zero(); // q_3 is zero for secondary calldata
                    }
                    return condition;
                });
        };

    // Process trace.
    for (auto mem_op : constraint.trace) {
        auto corresponding_gate_count = find_corresponding_calldata_gates_count(
            mem_op.index.index, mem_op.value.index, constraint.calldata_id == CallDataType::Primary);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for mem_op", analyzer.to_real(mem_op.index.index));
            return false; // no corresponding gate found
        } else if (corresponding_gate_count > 1) {
            throw std::runtime_error("Found multiple gates for the same mem_op");
        }
    }
    return true;
}

// Checks that the returndata constraint is valid.
// Checks that for every element in the init there is a corresponding returndata databus read gate
// We intentionally ignore assert_equal gates during validation
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::validate_returndata_constraint(
    const BlockConstraint& constraint, const std::vector<std::pair<uint32_t, uint32_t>>& returndata_gates)
{
    // Helper: For the given index and value, count the number of corresponding returndata databus read gates
    auto find_corresponding_returndata_gates_count = [this, returndata_gates, constraint](const FF& index,
                                                                                          const FF& value) {
        return std::count_if(returndata_gates.begin(),
                             returndata_gates.end(),
                             [this, index, value](const std::pair<uint32_t, uint32_t>& gate) {
                                 auto block_idx = gate.first;
                                 auto gate_idx = gate.second;
                                 auto& block = builder.blocks.get()[block_idx];
                                 bool condition = true;
                                 // Databus read gate wires: w_l = value, w_r = index, w_o = 0, w_4 = 0
                                 condition &= builder.get_variable(block.w_l()[gate_idx]) == value;
                                 condition &= builder.get_variable(block.w_r()[gate_idx]) == index;
                                 condition &= builder.get_variable(block.w_o()[gate_idx]) == FF::zero();
                                 condition &= builder.get_variable(block.w_4()[gate_idx]) == FF::zero();
                                 // selectors are checked in is_returndata_gate lambda
                                 return condition;
                             });
    };

    for (uint32_t init_idx = 0; init_idx < constraint.init.size(); init_idx++) {
        auto corresponding_gate_count = find_corresponding_returndata_gates_count(init_idx, constraint.init[init_idx]);
        if (corresponding_gate_count == 0) {
            log_error("No corresponding gate found for init", init_idx);
            return false; // no corresponding gate found
        }
    }
    return true;
}
// Checks that the block constraint is valid.
// We intentionally ignore assert_equal gates during validation
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_block_constraint(const ConstraintPtr& ptr)
{
    auto is_calldata_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) {
        return is_busread_gate(block_idx, gate_idx, BusId::CALLDATA) ||
               is_busread_gate(block_idx, gate_idx, BusId::SECONDARY_CALLDATA);
    };
    auto is_returndata_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) {
        return is_busread_gate(block_idx, gate_idx, BusId::RETURNDATA);
    };

    // The only difference between ROM and RAM access is the w_o value
    // For ROM, w_o is zero_idx, for RAM, w_o is not zero_idx
    auto is_rom_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) {
        return is_ram_rom_access_gate(block_idx, gate_idx) &&
               builder.blocks.get()[block_idx].w_o()[gate_idx] == builder.zero_idx();
    };
    auto is_ram_gate = [this](const uint32_t block_idx, const uint32_t gate_idx) {
        return is_ram_rom_access_gate(block_idx, gate_idx) &&
               builder.blocks.get()[block_idx].w_o()[gate_idx] != builder.zero_idx();
    };

    auto find_block_index = [this](const auto& block) {
        auto blocks_data = builder.blocks.get();
        for (uint32_t i = 0; i < blocks_data.size(); i++) {
            if (std::addressof(blocks_data[i]) == std::addressof(block)) {
                return i;
            }
        }
        throw std::runtime_error("Block not found");
    };

    auto memory_block_idx = find_block_index(builder.blocks.memory);
    uint32_t databus_block_idx = 0;
    if constexpr (!std::is_same_v<CircuitBuilder, UltraCircuitBuilder>) {
        databus_block_idx = find_block_index(builder.blocks.busread);
    }

    const auto* block_constraint = std::get<const acir_format::BlockConstraint*>(ptr);
    switch (block_constraint->type) {
    case BlockType::ROM:
        return validate_rom_constraint(*block_constraint,
                                       analyzer.get_gates_by_filter_function(memory_block_idx, is_rom_gate));
    case BlockType::RAM:
        return validate_ram_constraint(*block_constraint,
                                       analyzer.get_gates_by_filter_function(memory_block_idx, is_ram_gate));
    case BlockType::CallData:
        if constexpr (std::is_same_v<CircuitBuilder, UltraCircuitBuilder>) {
            // Ultra does not support the databus; skip validation to mirror builder behavior.
            return true;
        }
        return validate_calldata_constraint(*block_constraint,
                                            analyzer.get_gates_by_filter_function(databus_block_idx, is_calldata_gate));
    case BlockType::ReturnData:
        if constexpr (std::is_same_v<CircuitBuilder, UltraCircuitBuilder>) {
            // Ultra does not support the databus; skip validation to mirror builder behavior.
            return true;
        }
        return validate_returndata_constraint(
            *block_constraint, analyzer.get_gates_by_filter_function(databus_block_idx, is_returndata_gate));
    default:
        throw std::runtime_error("Unexpected block constraint type");
    }

    return true;
}

// Checks that the ECADD constraint is valid.
// Verifies:
// 1. Both input points are asserted to be on curve
// 2. The result point is constrained to be input1 + input2 (via operator+ trace and assert_equal)
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_ec_add_constraint(const ConstraintPtr& ptr)
{
    const auto* constraint = std::get<const EcAdd*>(ptr);
    Point<FF> input1_point = { constraint->input1_x, constraint->input1_y, constraint->input1_infinite };
    Point<FF> input2_point = { constraint->input2_x, constraint->input2_y, constraint->input2_infinite };

    bool condition = true;

    // Compute real points for all inputs (get_real_point handles constant coordinates via constant folding).
    // On-curve check is only needed for non-constant points (constant points are validated at compile time).
    std::optional<RealPoint<CircuitBuilder>> real_input1, real_input2;
    real_input1 = get_real_point<FF>(analyzer, builder, input1_point, constraint->predicate);
    if (!real_input1.has_value()) {
        log_error("Real point 1 is not valid");
        condition = false;
    } else if (!is_point_constant(input1_point)) {
        condition &= is_on_curve_check_with_real_point<FF>(analyzer, builder, *real_input1);
    }
    real_input2 = get_real_point<FF>(analyzer, builder, input2_point, constraint->predicate);
    if (!real_input2.has_value()) {
        log_error("Real point 2 is not valid");
        condition = false;
    } else if (!is_point_constant(input2_point)) {
        condition &= is_on_curve_check_with_real_point<FF>(analyzer, builder, *real_input2);
    }

    if (!real_input1.has_value() || !real_input2.has_value()) {
        return false;
    }

    condition &= is_ec_add_result_constrained<FF>(analyzer,
                                                  builder,
                                                  *real_input1,
                                                  *real_input2,
                                                  constraint->result_x,
                                                  constraint->result_y,
                                                  constraint->result_infinite,
                                                  constraint->predicate);

    return condition;
}

// Verifies MSM constraint:
// 1. All input points are asserted to be on curve (via to_grumpkin_point)
// 2. All scalars are field-validated (via cycle_scalar + validate_split_in_field_unsafe)
// 3. The result is connected to batch_mul output via conditional_assign + assert_equal
//
// TODO(defkit): implement proper batch_mul tracing
// We intentionally skip tracing batch_mul internals. batch_mul is a complex multi-point
// multiplication algorithm (Straus/Pippenger) whose internal gate structure is too complex
// to trace statically. Instead, we verify that:
//   - All inputs are properly constrained (on-curve + scalar field validation)
//   - The batch_mul output is connected to the ACIR output via conditional_assign + assert_equal
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_multi_scalar_mul_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& /*next_constraint_witnesses*/)
{
    const auto* constraint = std::get<const MultiScalarMul*>(ptr);

    bool condition = true;

    // 1. Compute real points once and verify on-curve check for all input points
    for (size_t i = 0; i < constraint->points.size(); i += 3) {
        Point<FF> point = { constraint->points[i], constraint->points[i + 1], constraint->points[i + 2] };
        if (is_point_constant(point)) {
            continue;
        }
        auto real_point = get_real_point<FF>(analyzer, builder, point, constraint->predicate);
        if (!real_point.has_value()) {
            log_error("Real point is not valid");
            condition = false;
            continue;
        }
        condition &= is_on_curve_check_with_real_point<FF>(analyzer, builder, *real_point);
    }

    // 2. Verify cycle_scalar field validation for all scalars
    for (size_t i = 0; i < constraint->points.size(); i += 3) {
        size_t scalar_idx = 2 * (i / 3);
        condition &= is_cycle_scalar_constrained<FF>(analyzer,
                                                     builder,
                                                     constraint->scalars[scalar_idx],
                                                     constraint->scalars[scalar_idx + 1],
                                                     constraint->predicate);
    }

    // 3. Verify result connected via conditional_assign + assert_equal
    Point<FF> output_point = {
        WitnessOrConstant<FF>::from_index(constraint->out_point_x),
        WitnessOrConstant<FF>::from_index(constraint->out_point_y),
        WitnessOrConstant<FF>::from_index(constraint->out_point_is_infinite),
    };
    condition &= is_msm_result_constrained<FF>(analyzer, builder, output_point, *constraint);

    return condition;
}

// Verifies ECDSA constraint:
// 1. All input byte fields (hashed_message, r, s, pub_x, pub_y) have conditional_assign + 8-bit range constraints
// 2. The result is constrained to be boolean (from bool_ct result(result_field))
// 3. The result participates in bool_t conditional_assign + assert_equal chain
// We intentionally skip tracing ECDSA verification internals (biggroup/bigcurve).
// Instead, we verify that:
//   - All inputs are properly constrained (conditional_assign + 8-bit range)
//   - The result is boolean and connected to the verification output via conditional_assign + assert_equal
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_ecdsa_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& /*next_constraint_witnesses*/)
{
    const auto* constraint = std::get<const EcdsaConstraint*>(ptr);
    auto predicate_field = witness_or_constant_to_field<FF>(constraint->predicate, builder);

    bool condition = true;

    // 1. Validate all 5 input byte arrays: conditional_assign + 8-bit range
    auto scalar_defaults = compute_scalar_default_bytes<FF>();
    auto pub_x_defaults = compute_pubkey_default_bytes<FF>(constraint->type, /*is_x=*/true);
    auto pub_y_defaults = compute_pubkey_default_bytes<FF>(constraint->type, /*is_x=*/false);

    // r fields (first 32 bytes of signature)
    std::array<uint32_t, 32> r_indices;
    std::copy(constraint->signature.begin(), constraint->signature.begin() + 32, r_indices.begin());

    // s fields (second 32 bytes of signature)
    std::array<uint32_t, 32> s_indices;
    std::copy(constraint->signature.begin() + 32, constraint->signature.begin() + 64, s_indices.begin());

    condition &= is_ecdsa_input_bytes_constrained<FF>(
        analyzer, builder, constraint->hashed_message, predicate_field, scalar_defaults);
    condition &= is_ecdsa_input_bytes_constrained<FF>(analyzer, builder, r_indices, predicate_field, scalar_defaults);
    condition &= is_ecdsa_input_bytes_constrained<FF>(analyzer, builder, s_indices, predicate_field, scalar_defaults);
    condition &= is_ecdsa_input_bytes_constrained<FF>(
        analyzer, builder, constraint->pub_x_indices, predicate_field, pub_x_defaults);
    condition &= is_ecdsa_input_bytes_constrained<FF>(
        analyzer, builder, constraint->pub_y_indices, predicate_field, pub_y_defaults);

    // 2-3. Validate result: boolean gate + conditional_assign + assert_equal
    condition &= is_ecdsa_result_constrained<FF>(analyzer, builder, *constraint);

    return condition;
}

/**
 * @brief Verify blake2s/blake3 constraint: input bytes have 8-bit range constraints, outputs match stdlib IO.
 * @details Blake2s/blake3 inputs are bytes (8-bit values). For each non-constant input, we verify that an 8-bit
 * range constraint exists via limb lookup. For outputs, we use the IO registry (acir_opcode_io) to verify
 * that each output byte produced by the stdlib is connected to the corresponding constraint.result[i]
 * via assert_equal.
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_blake_constraint_internal(
    const std::vector<WitnessOrConstant<bb::fr>>& inputs, const std::array<uint32_t, 32>& result)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    // 1. Verify input byte range constraints
    for (const auto& input : inputs) {
        if (!input.is_constant) {
            // Each non-constant input byte must have an 8-bit range constraint
            if (!is_range_constrained_via_limb_lookup<FF>(analyzer, builder, input.index, 255)) {
                return false;
            }
        }
    }

    // 2. Look up the registered outputs for these inputs
    const auto& io_map = builder.acir_opcode_io.io_map;
    auto it = io_map.find(witness_or_constant_vector_from_vector<CircuitBuilder>(inputs));
    if (it == io_map.end()) {
        return false;
    }

    const auto& all_outputs = it->second;
    if (all_outputs.empty()) {
        return false;
    }

    for (const auto& outputs_vector : all_outputs) {
        // unexpected
        BB_ASSERT_EQ(outputs_vector.size(), result.size(), "Output size mismatch");

        auto condition = true;
        for (size_t i = 0; i < outputs_vector.size(); i++) {
            Field<CircuitBuilder> output_field{ outputs_vector[i].index,
                                                field_ct::from_witness_index(&builder, outputs_vector[i].index) };
            Field<CircuitBuilder> result_field{ result[i], field_ct::from_witness_index(&builder, result[i]) };
            condition &= is_assert_equal_exists<FF>(analyzer, builder, output_field, result_field);
        }
        if (condition) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Verify blake2s constraint
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_blake2s_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& /*next_constraint_witnesses*/)
{
    const auto* constraint = std::get<const acir_format::Blake2sConstraint*>(ptr);

    return process_blake_constraint_internal(constraint->inputs, constraint->result);
}

/**
 * @brief Verify blake3 constraint
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_blake3_constraints(
    const ConstraintPtr& ptr, const std::unordered_set<uint32_t>& /*next_constraint_witnesses*/)
{
    const auto* constraint = std::get<const acir_format::Blake3Constraint*>(ptr);

    return process_blake_constraint_internal(constraint->inputs, constraint->result);
}

/**
 * @brief Verify keccak permutation constraint by checking that stdlib outputs are connected to ACIR results.
 * @details The keccak stdlib registers its input->output witness mapping in builder.acir_opcode_io..
 * We look up the ACIR constraint's input indices in that map to find the actual output witness indices
 * produced by keccak, then verify that each output is connected to the corresponding constraint.result[i]
 * via assert_equal (i.e. they share the same real variable index).
 * Constant inputs use IS_CONSTANT as their key element (matching keccak::permutation_opcode behavior).
 */
template <typename FF, typename CircuitBuilder>
bool StaticAnalyzerAcir_<FF, CircuitBuilder>::process_keccak_permutation_constraints(const ConstraintPtr& ptr)
{
    using field_ct = bb::stdlib::field_t<CircuitBuilder>;

    const auto* constraint = std::get<const acir_format::Keccakf1600*>(ptr);

    auto input_indices = witness_or_constant_vector_from_vector<CircuitBuilder>(constraint->state);

    // Look up the registered outputs for these inputs
    const auto& io_map = builder.acir_opcode_io.io_map;
    auto it = io_map.find(input_indices);
    if (it == io_map.end()) {
        return false;
    }

    const auto& all_outputs = it->second;
    if (all_outputs.empty()) {
        return false;
    }

    // Iterate over all registered outputs for the case if multiple constraints with the same inputs are emitted.
    for (const auto& output : all_outputs) {
        // unexpected
        BB_ASSERT_EQ(output.size(), constraint->result.size(), "Output size mismatch");

        auto condition = true;
        // Verify each output is connected to the corresponding constraint result via assert_equal.
        for (size_t i = 0; i < output.size(); ++i) {
            // output is never constant
            Field<CircuitBuilder> output_field{ output[i].index,
                                                field_ct::from_witness_index(&builder, output[i].index) };
            Field<CircuitBuilder> result_field{ constraint->result[i],
                                                field_ct::from_witness_index(&builder, constraint->result[i]) };
            condition &= is_assert_equal_exists<FF>(analyzer, builder, output_field, result_field);
        }

        // If for all registered outputs assert_equal exists, return true
        if (condition) {
            return true;
        }
    }

    return false;
}

template class StaticAnalyzerAcir_<fr, MegaCircuitBuilder>;
template class StaticAnalyzerAcir_<fr, UltraCircuitBuilder>;
} // namespace cdg
