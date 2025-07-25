// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * @file ultra_circuit_builder.cpp
 * @author Luke (ledwards2225) and Kesha (Rumata888)
 * @brief This file contains the implementation of field-agnostic UltraCircuitBuilder class that defines the logic
 * of ultra-style circuits and is intended for the use in UltraHonk
 *
 */
#include "ultra_circuit_builder.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "rom_ram_logic.hpp"

#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <execution>
#include <unordered_map>
#include <unordered_set>

namespace bb {

template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::finalize_circuit(const bool ensure_nonzero)
{
    /**
     * First of all, add the gates related to ROM arrays and range lists.
     * Note that the total number of rows in an Ultra program can be divided as following:
     *  1. arithmetic gates:  n_computation (includes all computation gates)
     *  2. rom/memory gates:  n_rom
     *  3. range list gates:  n_range
     *  4. public inputs:     n_pub
     *
     * Now we have two variables referred to as `n` in the code:
     *  1. ComposerBase::n => refers to the size of the witness of a given program,
     *  2. proving_key::n => the next power of two ≥ total witness size.
     *
     * In this case, we have composer.num_gates = n_computation before we execute the following two functions.
     * After these functions are executed, the composer's `n` is incremented to include the ROM
     * and range list gates. Therefore we have:
     * composer.num_gates = n_computation + n_rom + n_range.
     *
     * Its necessary to include the (n_rom + n_range) gates at this point because if we already have a
     * proving key, and we just return it without including these ROM and range list gates, the overall
     * circuit size would not be correct (resulting in the code crashing while performing FFT
     * operations).
     *
     * Therefore, we introduce a boolean flag `circuit_finalized` here. Once we add the rom and range gates,
     * our circuit is finalized, and we must not to execute these functions again.
     */
    if (!circuit_finalized) {
        if (ensure_nonzero) {
            add_gates_to_ensure_all_polys_are_non_zero();
        }
        process_non_native_field_multiplications();
#ifndef ULTRA_FUZZ
        this->rom_ram_logic.process_ROM_arrays(this);
        this->rom_ram_logic.process_RAM_arrays(this);
        process_range_lists();
#endif
        populate_public_inputs_block();
        circuit_finalized = true;
    } else {
        // Gates added after first call to finalize will not be processed since finalization is only performed once
        info("WARNING: Redundant call to finalize_circuit(). Is this intentional?");
    }
}

/**
 * @brief Ensure all polynomials have at least one non-zero coefficient to avoid commiting to the zero-polynomial
 *
 * @param in Structure containing variables and witness selectors
 */
// TODO(#423): This function adds valid (but arbitrary) gates to ensure that the circuit which includes
// them will not result in any zero-polynomials. It also ensures that the first coefficient of the wire
// polynomials is zero, which is required for them to be shiftable.
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::add_gates_to_ensure_all_polys_are_non_zero()
{
    // q_m, q_1, q_2, q_3, q_4
    blocks.arithmetic.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.arithmetic.q_m().emplace_back(1);
    blocks.arithmetic.q_1().emplace_back(1);
    blocks.arithmetic.q_2().emplace_back(1);
    blocks.arithmetic.q_3().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(1);
    blocks.arithmetic.q_c().emplace_back(0);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_arith().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;

    // q_delta_range
    blocks.delta_range.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.delta_range.q_m().emplace_back(0);
    blocks.delta_range.q_1().emplace_back(0);
    blocks.delta_range.q_2().emplace_back(0);
    blocks.delta_range.q_3().emplace_back(0);
    blocks.delta_range.q_4().emplace_back(0);
    blocks.delta_range.q_c().emplace_back(0);
    blocks.delta_range.q_delta_range().emplace_back(1);
    blocks.delta_range.q_arith().emplace_back(0);
    blocks.delta_range.q_lookup_type().emplace_back(0);
    blocks.delta_range.q_elliptic().emplace_back(0);
    blocks.delta_range.q_memory().emplace_back(0);
    blocks.delta_range.q_nnf().emplace_back(0);
    blocks.delta_range.q_poseidon2_external().emplace_back(0);
    blocks.delta_range.q_poseidon2_internal().emplace_back(0);

    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.delta_range.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
    create_dummy_gate(blocks.delta_range, this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);

    // q_elliptic
    blocks.elliptic.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.elliptic.q_m().emplace_back(0);
    blocks.elliptic.q_1().emplace_back(0);
    blocks.elliptic.q_2().emplace_back(0);
    blocks.elliptic.q_3().emplace_back(0);
    blocks.elliptic.q_4().emplace_back(0);
    blocks.elliptic.q_c().emplace_back(0);
    blocks.elliptic.q_delta_range().emplace_back(0);
    blocks.elliptic.q_arith().emplace_back(0);
    blocks.elliptic.q_lookup_type().emplace_back(0);
    blocks.elliptic.q_elliptic().emplace_back(1);
    blocks.elliptic.q_memory().emplace_back(0);
    blocks.elliptic.q_nnf().emplace_back(0);
    blocks.elliptic.q_poseidon2_external().emplace_back(0);
    blocks.elliptic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.elliptic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
    create_dummy_gate(blocks.elliptic, this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);

    // q_memory
    blocks.memory.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.memory.q_m().emplace_back(0);
    blocks.memory.q_1().emplace_back(0);
    blocks.memory.q_2().emplace_back(0);
    blocks.memory.q_3().emplace_back(0);
    blocks.memory.q_4().emplace_back(0);
    blocks.memory.q_c().emplace_back(0);
    blocks.memory.q_delta_range().emplace_back(0);
    blocks.memory.q_arith().emplace_back(0);
    blocks.memory.q_lookup_type().emplace_back(0);
    blocks.memory.q_elliptic().emplace_back(0);
    blocks.memory.q_memory().emplace_back(1);
    blocks.memory.q_nnf().emplace_back(0);
    blocks.memory.q_poseidon2_external().emplace_back(0);
    blocks.memory.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.memory.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
    create_dummy_gate(blocks.memory, this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);

    // q_nnf
    blocks.nnf.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.nnf.q_m().emplace_back(0);
    blocks.nnf.q_1().emplace_back(0);
    blocks.nnf.q_2().emplace_back(0);
    blocks.nnf.q_3().emplace_back(0);
    blocks.nnf.q_4().emplace_back(0);
    blocks.nnf.q_c().emplace_back(0);
    blocks.nnf.q_delta_range().emplace_back(0);
    blocks.nnf.q_arith().emplace_back(0);
    blocks.nnf.q_lookup_type().emplace_back(0);
    blocks.nnf.q_elliptic().emplace_back(0);
    blocks.nnf.q_memory().emplace_back(0);
    blocks.nnf.q_nnf().emplace_back(1);
    blocks.nnf.q_poseidon2_external().emplace_back(0);
    blocks.nnf.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.nnf.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
    create_dummy_gate(blocks.nnf, this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);

    // Add nonzero values in w_4 and q_c (q_4*w_4 + q_c --> 1*1 - 1 = 0)
    this->one_idx = put_constant_variable(FF::one());
    create_big_add_gate({ this->zero_idx, this->zero_idx, this->zero_idx, this->one_idx, 0, 0, 0, 1, -1 });

    // Take care of all polys related to lookups (q_lookup, tables, sorted, etc)
    // by doing a dummy lookup with a special table.
    // Note: the 4th table poly is the table index: this is not the value of the table
    // type enum but rather the index of the table in the list of all tables utilized
    // in the circuit. Therefore we naively need two different basic tables (indices 0, 1)
    // to get a non-zero value in table_4.
    // The multitable operates on 2-bit values, so the maximum is 3
    uint32_t left_value = 3;
    uint32_t right_value = 3;

    FF left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
    FF right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();

    uint32_t left_witness_index = this->add_variable(left_witness_value);
    uint32_t right_witness_index = this->add_variable(right_witness_value);
    const auto dummy_accumulators = plookup::get_lookup_accumulators(
        plookup::MultiTableId::HONK_DUMMY_MULTI, left_witness_value, right_witness_value, true);
    auto read_data = create_gates_from_plookup_accumulators(
        plookup::MultiTableId::HONK_DUMMY_MULTI, dummy_accumulators, left_witness_index, right_witness_index);

    update_used_witnesses(left_witness_index);
    update_used_witnesses(right_witness_index);
    std::array<std::vector<uint32_t>, 3> parse_read_data{ read_data[plookup::ColumnIdx::C1],
                                                          read_data[plookup::ColumnIdx::C2],
                                                          read_data[plookup::ColumnIdx::C3] };
    for (const auto& column : parse_read_data) {
        for (const auto& index : column) {
            update_used_witnesses(index);
        }
    }

    // mock a poseidon external gate, with all zeros as input
    blocks.poseidon2_external.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.poseidon2_external.q_m().emplace_back(0);
    blocks.poseidon2_external.q_1().emplace_back(0);
    blocks.poseidon2_external.q_2().emplace_back(0);
    blocks.poseidon2_external.q_3().emplace_back(0);
    blocks.poseidon2_external.q_c().emplace_back(0);
    blocks.poseidon2_external.q_arith().emplace_back(0);
    blocks.poseidon2_external.q_4().emplace_back(0);
    blocks.poseidon2_external.q_delta_range().emplace_back(0);
    blocks.poseidon2_external.q_lookup_type().emplace_back(0);
    blocks.poseidon2_external.q_elliptic().emplace_back(0);
    blocks.poseidon2_external.q_memory().emplace_back(0);
    blocks.poseidon2_external.q_nnf().emplace_back(0);
    blocks.poseidon2_external.q_poseidon2_external().emplace_back(1);
    blocks.poseidon2_external.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.poseidon2_external.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;

    // dummy gate to be read into by previous poseidon external gate via shifts
    this->create_dummy_gate(blocks.poseidon2_external, this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);

    // mock a poseidon internal gate, with all zeros as input
    blocks.poseidon2_internal.populate_wires(this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.poseidon2_internal.q_m().emplace_back(0);
    blocks.poseidon2_internal.q_1().emplace_back(0);
    blocks.poseidon2_internal.q_2().emplace_back(0);
    blocks.poseidon2_internal.q_3().emplace_back(0);
    blocks.poseidon2_internal.q_c().emplace_back(0);
    blocks.poseidon2_internal.q_arith().emplace_back(0);
    blocks.poseidon2_internal.q_4().emplace_back(0);
    blocks.poseidon2_internal.q_delta_range().emplace_back(0);
    blocks.poseidon2_internal.q_lookup_type().emplace_back(0);
    blocks.poseidon2_internal.q_elliptic().emplace_back(0);
    blocks.poseidon2_internal.q_memory().emplace_back(0);
    blocks.poseidon2_internal.q_nnf().emplace_back(0);
    blocks.poseidon2_internal.q_poseidon2_external().emplace_back(0);
    blocks.poseidon2_internal.q_poseidon2_internal().emplace_back(1);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.poseidon2_internal.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;

    // dummy gate to be read into by previous poseidon internal gate via shifts
    create_dummy_gate(blocks.poseidon2_internal, this->zero_idx, this->zero_idx, this->zero_idx, this->zero_idx);
}

/**
 * @brief Create an addition gate, where in.a * in.a_scaling + in.b * in.b_scaling + in.c * in.c_scaling +
 * in.const_scaling = 0
 *
 * @details Arithmetic selector is set to 1, all other gate selectors are 0. Multiplication selector is set to 0
 *
 * @param in A structure with variable indexes and selector values for the gate.
 */
template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::create_add_gate(const add_triple_<FF>& in)
{
    this->assert_valid_variables({ in.a, in.b, in.c });

    blocks.arithmetic.populate_wires(in.a, in.b, in.c, this->zero_idx);
    blocks.arithmetic.q_m().emplace_back(0);
    blocks.arithmetic.q_1().emplace_back(in.a_scaling);
    blocks.arithmetic.q_2().emplace_back(in.b_scaling);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief Create a big multiplication-addition gate, where in.a * in.b * in.mul_scaling + in.a * in.a_scaling + in.b *
 * in.b_scaling + in.c * in.c_scaling + in.d * in.d_scaling + in.const_scaling = 0. If include_next_gate_w_4 is enabled,
 * then this sum also adds the value of the 4-th witness at the next index.
 *
 * @param in Structure with variable indexes and wire selector values
 * @param include_next_gate_w_4 Switches on/off the addition of w_4 at the next index
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_big_mul_add_gate(const mul_quad_<FF>& in,
                                                                   const bool include_next_gate_w_4)
{
    this->assert_valid_variables({ in.a, in.b, in.c, in.d });
    blocks.arithmetic.populate_wires(in.a, in.b, in.c, in.d);
    blocks.arithmetic.q_m().emplace_back(include_next_gate_w_4 ? in.mul_scaling * FF(2) : in.mul_scaling);
    blocks.arithmetic.q_1().emplace_back(in.a_scaling);
    blocks.arithmetic.q_2().emplace_back(in.b_scaling);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_arith().emplace_back(include_next_gate_w_4 ? 2 : 1);
    blocks.arithmetic.q_4().emplace_back(in.d_scaling);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief Create a big addition gate, where in.a * in.a_scaling + in.b * in.b_scaling + in.c *
 * in.c_scaling + in.d * in.d_scaling + in.const_scaling = 0. If include_next_gate_w_4 is enabled, then the sum also
 * adds the value of the 4-th witness at the next index.
 *
 * @param in Structure with variable indexes and wire selector values
 * @param include_next_gate_w_4 Switches on/off the addition of w_4 at the next index
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_big_add_gate(const add_quad_<FF>& in,
                                                               const bool include_next_gate_w_4)
{
    this->assert_valid_variables({ in.a, in.b, in.c, in.d });
    blocks.arithmetic.populate_wires(in.a, in.b, in.c, in.d);
    blocks.arithmetic.q_m().emplace_back(0);
    blocks.arithmetic.q_1().emplace_back(in.a_scaling);
    blocks.arithmetic.q_2().emplace_back(in.b_scaling);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_arith().emplace_back(include_next_gate_w_4 ? 2 : 1);
    blocks.arithmetic.q_4().emplace_back(in.d_scaling);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief A legacy method that was used to extract a bit from c-4d by using gate selectors in the
 * Turboplonk, but is simulated here for ultraplonk
 *
 * @param in Structure with variables and witness selector values
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_big_add_gate_with_bit_extraction(const add_quad_<FF>& in)
{
    // This method is an artifact of a turbo plonk feature that implicitly extracts
    // a high or low bit from a base-4 quad and adds it into the arithmetic gate relationship.
    // This has been removed in the plookup composer due to it's infrequent use not being worth the extra
    // cost incurred by the prover for the extra field muls required.

    // We have wires a, b, c, d, where
    // a + b + c + d + 6 * (extracted bit) = 0
    // (extracted bit) is the high bit pulled from c - 4d

    this->assert_valid_variables({ in.a, in.b, in.c, in.d });

    const uint256_t quad = this->get_variable(in.c) - this->get_variable(in.d) * 4;
    const auto lo_bit = quad & uint256_t(1);
    const auto hi_bit = (quad & uint256_t(2)) >> 1;
    const auto lo_idx = this->add_variable(lo_bit);
    const auto hi_idx = this->add_variable(hi_bit);
    // lo + hi * 2 - c + 4 * d = 0
    create_big_add_gate({
        lo_idx,
        hi_idx,
        in.c,
        in.d,
        1,
        2,
        -1,
        4,
        0,
    });

    // create temporary variable t = in.a * in.a_scaling + 6 * hi_bit
    const auto t = this->get_variable(in.a) * in.a_scaling + FF(hi_bit) * 6;
    const auto t_idx = this->add_variable(t);
    create_big_add_gate({
        in.a,
        hi_idx,
        t_idx,
        this->zero_idx,
        in.a_scaling,
        6,
        -1,
        0,
        0,
    });
    // (t = a + 6 * hi_bit) + b + c + d = 0
    create_big_add_gate({
        t_idx,
        in.b,
        in.c,
        in.d,
        1,
        in.b_scaling,
        in.c_scaling,
        in.d_scaling,
        in.const_scaling,
    });
}
/**
 * @brief Create a basic multiplication gate q_m * a * b + q_1 * a + q_2 * b + q_3 * c + q_4 * d + q_c = 0 (q_arith = 1)
 *
 * @param in Structure containing variables and witness selectors
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_big_mul_gate(const mul_quad_<FF>& in)
{
    this->assert_valid_variables({ in.a, in.b, in.c, in.d });

    blocks.arithmetic.populate_wires(in.a, in.b, in.c, in.d);
    blocks.arithmetic.q_m().emplace_back(in.mul_scaling);
    blocks.arithmetic.q_1().emplace_back(in.a_scaling);
    blocks.arithmetic.q_2().emplace_back(in.b_scaling);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(in.d_scaling);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

// Creates a width-4 addition gate, where the fourth witness must be a boolean.
// Can be used to normalize a 32-bit addition
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_balanced_add_gate(const add_quad_<FF>& in)
{
    this->assert_valid_variables({ in.a, in.b, in.c, in.d });

    blocks.arithmetic.populate_wires(in.a, in.b, in.c, in.d);
    blocks.arithmetic.q_m().emplace_back(0);
    blocks.arithmetic.q_1().emplace_back(in.a_scaling);
    blocks.arithmetic.q_2().emplace_back(in.b_scaling);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(in.d_scaling);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
    // Why 3? TODO: return to this
    // The purpose of this gate is to do enable lazy 32-bit addition.
    // Consider a + b = c mod 2^32
    // We want the 4th wire to represent the quotient:
    // w1 + w2 = w4 * 2^32 + w3
    // If we allow this overflow 'flag' to range from 0 to 3, instead of 0 to 1,
    // we can get away with chaining a few addition operations together with basic add gates,
    // before having to use this gate.
    // (N.B. a larger value would be better, the value '3' is for Turbo backwards compatibility.
    // In Turbo this method uses a custom gate,
    // where we were limited to a 2-bit range check by the degree of the custom gate identity.
    create_new_range_constraint(in.d, 3);
}
/**
 * @brief Create a multiplication gate with q_m * a * b + q_3 * c + q_const = 0
 *
 * @details q_arith == 1
 *
 * @param in Structure containing variables and witness selectors
 */
template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::create_mul_gate(const mul_triple_<FF>& in)
{
    this->assert_valid_variables({ in.a, in.b, in.c });

    blocks.arithmetic.populate_wires(in.a, in.b, in.c, this->zero_idx);
    blocks.arithmetic.q_m().emplace_back(in.mul_scaling);
    blocks.arithmetic.q_1().emplace_back(0);
    blocks.arithmetic.q_2().emplace_back(0);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}
/**
 * @brief Generate an arithmetic gate equivalent to x^2 - x = 0, which forces x to be 0 or 1
 *
 * @param variable_index the variable which needs to be constrained
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_bool_gate(const uint32_t variable_index)
{
    this->assert_valid_variables({ variable_index });

    blocks.arithmetic.populate_wires(variable_index, variable_index, this->zero_idx, this->zero_idx);
    blocks.arithmetic.q_m().emplace_back(1);
    blocks.arithmetic.q_1().emplace_back(-1);
    blocks.arithmetic.q_2().emplace_back(0);
    blocks.arithmetic.q_3().emplace_back(0);
    blocks.arithmetic.q_c().emplace_back(0);
    blocks.arithmetic.q_delta_range().emplace_back(0);

    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief A plonk gate with disabled (set to zero) fourth wire. q_m * a * b + q_1 * a + q_2 * b + q_3
 * * c + q_const = 0
 *
 * @param in Structure containing variables and witness selectors
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_poly_gate(const poly_triple_<FF>& in)
{
    this->assert_valid_variables({ in.a, in.b, in.c });

    blocks.arithmetic.populate_wires(in.a, in.b, in.c, this->zero_idx);
    blocks.arithmetic.q_m().emplace_back(in.q_m);
    blocks.arithmetic.q_1().emplace_back(in.q_l);
    blocks.arithmetic.q_2().emplace_back(in.q_r);
    blocks.arithmetic.q_3().emplace_back(in.q_o);
    blocks.arithmetic.q_c().emplace_back(in.q_c);
    blocks.arithmetic.q_delta_range().emplace_back(0);

    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief Create an elliptic curve addition gate
 *
 * @details x and y are defined over scalar field.
 *
 * @param in Elliptic curve point addition gate parameters, including the affine coordinates of the two points being
 * added, the resulting point coordinates and the selector values that describe whether the second point is negated.
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_ecc_add_gate(const ecc_add_gate_<FF>& in)
{
    /**
     * gate structure:
     * | 1  | 2  | 3  | 4  |
     * | -- | x1 | y1 | -- |
     * | x2 | x3 | y3 | y2 |
     * we can chain successive ecc_add_gates if x3 y3 of previous gate equals x1 y1 of current gate
     **/

    this->assert_valid_variables({ in.x1, in.x2, in.x3, in.y1, in.y2, in.y3 });

    auto& block = blocks.elliptic;

    bool previous_elliptic_gate_exists = block.size() > 0;
    bool can_fuse_into_previous_gate = previous_elliptic_gate_exists;
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1482): scrutinize and clean up this logic
    if (can_fuse_into_previous_gate) {
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.w_r()[block.size() - 1] == in.x1);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.w_o()[block.size() - 1] == in.y1);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_3()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_4()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_1()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_arith()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_m()[block.size() - 1] == 0);
    }

    if (can_fuse_into_previous_gate) {
        block.q_1()[block.size() - 1] = in.sign_coefficient;
        block.q_elliptic()[block.size() - 1] = 1;
    } else {
        block.populate_wires(this->zero_idx, in.x1, in.y1, this->zero_idx);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_1().emplace_back(in.sign_coefficient);

        block.q_arith().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_delta_range().emplace_back(0);
        block.q_lookup_type().emplace_back(0);
        block.q_elliptic().emplace_back(1);
        block.q_memory().emplace_back(0);
        block.q_nnf().emplace_back(0);
        block.q_poseidon2_external().emplace_back(0);
        block.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        ++this->num_gates;
    }
    create_dummy_gate(block, in.x2, in.x3, in.y3, in.y2);
}

/**
 * @brief Create an elliptic curve doubling gate
 *
 * @param in Elliptic curve point doubling gate parameters
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_ecc_dbl_gate(const ecc_dbl_gate_<FF>& in)
{
    auto& block = blocks.elliptic;

    /**
     * gate structure:
     * | 1  | 2  | 3  | 4  |
     * | -  | x1 | y1 | -  |
     * | -  | x3 | y3 | -  |
     * we can chain an ecc_add_gate + an ecc_dbl_gate if x3 y3 of previous add_gate equals x1 y1 of current gate
     * can also chain double gates together
     **/
    this->assert_valid_variables({ in.x1, in.x3, in.y1, in.y3 });

    bool previous_elliptic_gate_exists = block.size() > 0;
    bool can_fuse_into_previous_gate = previous_elliptic_gate_exists;
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1482): scrutinize and clean up this logic
    if (can_fuse_into_previous_gate) {
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.w_r()[block.size() - 1] == in.x1);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.w_o()[block.size() - 1] == in.y1);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_arith()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_lookup_type()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_memory()[block.size() - 1] == 0);
        can_fuse_into_previous_gate = can_fuse_into_previous_gate && (block.q_nnf()[block.size() - 1] == 0);
    }

    if (can_fuse_into_previous_gate) {
        block.q_elliptic()[block.size() - 1] = 1;
        block.q_m()[block.size() - 1] = 1;
    } else {
        block.populate_wires(this->zero_idx, in.x1, in.y1, this->zero_idx);
        block.q_elliptic().emplace_back(1);
        block.q_m().emplace_back(1);
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_delta_range().emplace_back(0);
        block.q_lookup_type().emplace_back(0);
        block.q_memory().emplace_back(0);
        block.q_nnf().emplace_back(0);
        block.q_poseidon2_external().emplace_back(0);
        block.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        ++this->num_gates;
    }
    create_dummy_gate(block, this->zero_idx, in.x3, in.y3, this->zero_idx);
}

/**
 * @brief Add a gate equating a particular witness to a constant, fixing its value
 *
 * @param witness_index The index of the witness we are fixing
 * @param witness_value The value we are fixing it to
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::fix_witness(const uint32_t witness_index, const FF& witness_value)
{
    this->assert_valid_variables({ witness_index });

    blocks.arithmetic.populate_wires(witness_index, this->zero_idx, this->zero_idx, this->zero_idx);
    blocks.arithmetic.q_m().emplace_back(0);
    blocks.arithmetic.q_1().emplace_back(1);
    blocks.arithmetic.q_2().emplace_back(0);
    blocks.arithmetic.q_3().emplace_back(0);
    blocks.arithmetic.q_c().emplace_back(-witness_value);
    blocks.arithmetic.q_arith().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.q_delta_range().emplace_back(0);
    blocks.arithmetic.q_lookup_type().emplace_back(0);
    blocks.arithmetic.q_elliptic().emplace_back(0);
    blocks.arithmetic.q_memory().emplace_back(0);
    blocks.arithmetic.q_nnf().emplace_back(0);
    blocks.arithmetic.q_poseidon2_external().emplace_back(0);
    blocks.arithmetic.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        blocks.arithmetic.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

template <typename ExecutionTrace>
uint32_t UltraCircuitBuilder_<ExecutionTrace>::put_constant_variable(const FF& variable)
{
    if (constant_variable_indices.contains(variable)) {
        return constant_variable_indices.at(variable);
    } else {
        uint32_t variable_index = this->add_variable(variable);
        fix_witness(variable_index, variable);
        constant_variable_indices.insert({ variable, variable_index });
        return variable_index;
    }
}

/**
 * @brief Get the basic table with provided ID from the set of tables for the present circuit; create it if it doesnt
 * yet exist
 *
 * @tparam ExecutionTrace
 * @param id
 * @return plookup::BasicTable&
 */
template <typename ExecutionTrace>
plookup::BasicTable& UltraCircuitBuilder_<ExecutionTrace>::get_table(const plookup::BasicTableId id)
{
    for (plookup::BasicTable& table : lookup_tables) {
        if (table.id == id) {
            return table;
        }
    }
    // Table doesn't exist! So try to create it.
    lookup_tables.emplace_back(plookup::create_basic_table(id, lookup_tables.size()));
    return lookup_tables.back();
}

/**
 * @brief Perform a series of lookups, one for each 'row' in read_values.
 */

template <typename ExecutionTrace>
plookup::ReadData<uint32_t> UltraCircuitBuilder_<ExecutionTrace>::create_gates_from_plookup_accumulators(
    const plookup::MultiTableId& id,
    const plookup::ReadData<FF>& read_values,
    const uint32_t key_a_index,
    std::optional<uint32_t> key_b_index)
{
    const auto& multi_table = plookup::get_multitable(id);
    const size_t num_lookups = read_values[plookup::ColumnIdx::C1].size();
    plookup::ReadData<uint32_t> read_data;
    for (size_t i = 0; i < num_lookups; ++i) {
        // get basic lookup table; construct and add to builder.lookup_tables if not already present
        auto& table = get_table(multi_table.basic_table_ids[i]);

        table.lookup_gates.emplace_back(read_values.lookup_entries[i]); // used for constructing sorted polynomials

        const auto first_idx = (i == 0) ? key_a_index : this->add_variable(read_values[plookup::ColumnIdx::C1][i]);
        const auto second_idx = (i == 0 && (key_b_index.has_value()))
                                    ? key_b_index.value()
                                    : this->add_variable(read_values[plookup::ColumnIdx::C2][i]);
        const auto third_idx = this->add_variable(read_values[plookup::ColumnIdx::C3][i]);

        read_data[plookup::ColumnIdx::C1].push_back(first_idx);
        read_data[plookup::ColumnIdx::C2].push_back(second_idx);
        read_data[plookup::ColumnIdx::C3].push_back(third_idx);
        this->assert_valid_variables({ first_idx, second_idx, third_idx });

        blocks.lookup.q_lookup_type().emplace_back(FF(1));
        blocks.lookup.q_3().emplace_back(FF(table.table_index));
        blocks.lookup.populate_wires(first_idx, second_idx, third_idx, this->zero_idx);
        blocks.lookup.q_1().emplace_back(0);
        blocks.lookup.q_2().emplace_back((i == (num_lookups - 1) ? 0 : -multi_table.column_1_step_sizes[i + 1]));
        blocks.lookup.q_m().emplace_back((i == (num_lookups - 1) ? 0 : -multi_table.column_2_step_sizes[i + 1]));
        blocks.lookup.q_c().emplace_back((i == (num_lookups - 1) ? 0 : -multi_table.column_3_step_sizes[i + 1]));
        blocks.lookup.q_arith().emplace_back(0);
        blocks.lookup.q_4().emplace_back(0);
        blocks.lookup.q_delta_range().emplace_back(0);
        blocks.lookup.q_elliptic().emplace_back(0);
        blocks.lookup.q_memory().emplace_back(0);
        blocks.lookup.q_nnf().emplace_back(0);
        blocks.lookup.q_poseidon2_external().emplace_back(0);
        blocks.lookup.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            blocks.lookup.pad_additional();
        }
        check_selector_length_consistency();
        ++this->num_gates;
    }
    return read_data;
}

/**
 * Generalized Permutation Methods
 **/
template <typename ExecutionTrace>
typename UltraCircuitBuilder_<ExecutionTrace>::RangeList UltraCircuitBuilder_<ExecutionTrace>::create_range_list(
    const uint64_t target_range)
{
    RangeList result;
    const auto range_tag = get_new_tag(); // current_tag + 1;
    const auto tau_tag = get_new_tag();   // current_tag + 2;
    create_tag(range_tag, tau_tag);
    create_tag(tau_tag, range_tag);
    result.target_range = target_range;
    result.range_tag = range_tag;
    result.tau_tag = tau_tag;

    uint64_t num_multiples_of_three = (target_range / DEFAULT_PLOOKUP_RANGE_STEP_SIZE);

    result.variable_indices.reserve((uint32_t)num_multiples_of_three);
    for (uint64_t i = 0; i <= num_multiples_of_three; ++i) {
        const uint32_t index = this->add_variable(i * DEFAULT_PLOOKUP_RANGE_STEP_SIZE);
        result.variable_indices.emplace_back(index);
        assign_tag(index, result.range_tag);
    }
    {
        const uint32_t index = this->add_variable(target_range);
        result.variable_indices.emplace_back(index);
        assign_tag(index, result.range_tag);
    }
    // Need this because these variables will not appear in the witness otherwise
    create_dummy_constraints(result.variable_indices);

    return result;
}

// range constraint a value by decomposing it into limbs whose size should be the default range constraint size

template <typename ExecutionTrace>
std::vector<uint32_t> UltraCircuitBuilder_<ExecutionTrace>::decompose_into_default_range(
    const uint32_t variable_index, const uint64_t num_bits, const uint64_t target_range_bitnum, std::string const& msg)
{
    this->assert_valid_variables({ variable_index });

    BB_ASSERT_GT(num_bits, 0U);

    uint256_t val = (uint256_t)(this->get_variable(variable_index));

    // If the value is out of range, set the CircuitBuilder error to the given msg.
    if (val.get_msb() >= num_bits && !this->failed()) {
        this->failure(msg);
    }

    const uint64_t sublimb_mask = (1ULL << target_range_bitnum) - 1;

    /**
     * TODO: Support this commented-out code!
     * At the moment, `decompose_into_default_range` generates a minimum of 1 arithmetic gate.
     * This is not strictly required iff num_bits <= target_range_bitnum.
     * However, this produces an edge-case where a variable is range-constrained but NOT present in an arithmetic gate.
     * This in turn produces an unsatisfiable circuit (see `create_new_range_constraint`). We would need to check for
     * and accommodate/reject this edge case to support not adding addition gates here if not reqiured
     * if (num_bits <= target_range_bitnum) {
     *     const uint64_t expected_range = (1ULL << num_bits) - 1ULL;
     *     create_new_range_constraint(variable_index, expected_range);
     *     return { variable_index };
     * }
     **/
    std::vector<uint64_t> sublimbs;
    std::vector<uint32_t> sublimb_indices;

    const bool has_remainder_bits = (num_bits % target_range_bitnum != 0);
    const uint64_t num_limbs = (num_bits / target_range_bitnum) + has_remainder_bits;
    const uint64_t last_limb_size = num_bits - ((num_bits / target_range_bitnum) * target_range_bitnum);
    const uint64_t last_limb_range = ((uint64_t)1 << last_limb_size) - 1;

    uint256_t accumulator = val;
    for (size_t i = 0; i < num_limbs; ++i) {
        sublimbs.push_back(accumulator.data[0] & sublimb_mask);
        accumulator = accumulator >> target_range_bitnum;
    }
    for (size_t i = 0; i < sublimbs.size(); ++i) {
        const auto limb_idx = this->add_variable(sublimbs[i]);
        sublimb_indices.emplace_back(limb_idx);
        if ((i == sublimbs.size() - 1) && has_remainder_bits) {
            create_new_range_constraint(limb_idx, last_limb_range);
        } else {
            create_new_range_constraint(limb_idx, sublimb_mask);
        }
    }

    const uint64_t num_limb_triples = (num_limbs / 3) + ((num_limbs % 3) != 0);
    const uint64_t leftovers = (num_limbs % 3) == 0 ? 3 : (num_limbs % 3);

    accumulator = val;
    uint32_t accumulator_idx = variable_index;

    for (size_t i = 0; i < num_limb_triples; ++i) {
        const bool real_limbs[3]{
            (i == (num_limb_triples - 1) && (leftovers < 1)) ? false : true,
            (i == (num_limb_triples - 1) && (leftovers < 2)) ? false : true,
            (i == (num_limb_triples - 1) && (leftovers < 3)) ? false : true,
        };

        const uint64_t round_sublimbs[3]{
            real_limbs[0] ? sublimbs[3 * i] : 0,
            real_limbs[1] ? sublimbs[3 * i + 1] : 0,
            real_limbs[2] ? sublimbs[3 * i + 2] : 0,
        };
        const uint32_t new_limbs[3]{
            real_limbs[0] ? sublimb_indices[3 * i] : this->zero_idx,
            real_limbs[1] ? sublimb_indices[3 * i + 1] : this->zero_idx,
            real_limbs[2] ? sublimb_indices[3 * i + 2] : this->zero_idx,
        };
        const uint64_t shifts[3]{
            target_range_bitnum * (3 * i),
            target_range_bitnum * (3 * i + 1),
            target_range_bitnum * (3 * i + 2),
        };
        uint256_t new_accumulator = accumulator - (uint256_t(round_sublimbs[0]) << shifts[0]) -
                                    (uint256_t(round_sublimbs[1]) << shifts[1]) -
                                    (uint256_t(round_sublimbs[2]) << shifts[2]);

        create_big_add_gate(
            {
                new_limbs[0],
                new_limbs[1],
                new_limbs[2],
                accumulator_idx,
                uint256_t(1) << shifts[0],
                uint256_t(1) << shifts[1],
                uint256_t(1) << shifts[2],
                -1,
                0,
            },
            ((i == num_limb_triples - 1) ? false : true));
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1450): this is probably creating an unused
        // wire/variable in the circuit, in the last iteration of the loop.
        accumulator_idx = this->add_variable(new_accumulator);
        accumulator = new_accumulator;
    }
    return sublimb_indices;
}

/**
 * @brief Constrain a variable to a range
 *
 * @details Checks if the range [0, target_range] already exists. If it doesn't, then creates a new range. Then tags
 * variable as belonging to this set.
 *
 * @param variable_index
 * @param target_range
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_new_range_constraint(const uint32_t variable_index,
                                                                       const uint64_t target_range,
                                                                       std::string const msg)
{
    if (uint256_t(this->get_variable(variable_index)).data[0] > target_range) {
        if (!this->failed()) {
            this->failure(msg);
        }
    }
    if (range_lists.count(target_range) == 0) {
        range_lists.insert({ target_range, create_range_list(target_range) });
    }

    const auto existing_tag = this->real_variable_tags[this->real_variable_index[variable_index]];
    auto& list = range_lists[target_range];

    // If the variable's tag matches the target range list's tag, do nothing.
    if (existing_tag != list.range_tag) {
        // If the variable is 'untagged' (i.e., it has the dummy tag), assign it the appropriate tag.
        // Otherwise, find the range for which the variable has already been tagged.
        if (existing_tag != DUMMY_TAG) {
            bool found_tag = false;
            for (const auto& r : range_lists) {
                if (r.second.range_tag == existing_tag) {
                    found_tag = true;
                    if (r.first < target_range) {
                        // The variable already has a more restrictive range check, so do nothing.
                        return;
                    } else {
                        // The range constraint we are trying to impose is more restrictive than the existing range
                        // constraint. It would be difficult to remove an existing range check. Instead deep-copy the
                        // variable and apply a range check to new variable
                        const uint32_t copied_witness = this->add_variable(this->get_variable(variable_index));
                        create_add_gate({ .a = variable_index,
                                          .b = copied_witness,
                                          .c = this->zero_idx,
                                          .a_scaling = 1,
                                          .b_scaling = -1,
                                          .c_scaling = 0,
                                          .const_scaling = 0 });
                        // Recurse with new witness that has no tag attached.
                        create_new_range_constraint(copied_witness, target_range, msg);
                        return;
                    }
                }
            }
            ASSERT(found_tag);
        }
        assign_tag(variable_index, list.range_tag);
        list.variable_indices.emplace_back(variable_index);
    }
}

template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::process_range_list(RangeList& list)
{
    this->assert_valid_variables(list.variable_indices);

    BB_ASSERT_GT(list.variable_indices.size(), 0U);

    // replace witness index in variable_indices with the real variable index i.e. if a copy constraint has been
    // applied on a variable after it was range constrained, this makes sure the indices in list point to the updated
    // index in the range list so the set equivalence does not fail
    for (uint32_t& x : list.variable_indices) {
        x = this->real_variable_index[x];
    }
    // remove duplicate witness indices to prevent the sorted list set size being wrong!
    std::sort(list.variable_indices.begin(), list.variable_indices.end());
    auto back_iterator = std::unique(list.variable_indices.begin(), list.variable_indices.end());
    list.variable_indices.erase(back_iterator, list.variable_indices.end());

    // go over variables
    // iterate over each variable and create mirror variable with same value - with tau tag
    // need to make sure that, in original list, increments of at most 3
    std::vector<uint32_t> sorted_list;
    sorted_list.reserve(list.variable_indices.size());
    for (const auto variable_index : list.variable_indices) {
        const auto& field_element = this->get_variable(variable_index);
        const uint32_t shrinked_value = (uint32_t)field_element.from_montgomery_form().data[0];
        sorted_list.emplace_back(shrinked_value);
    }

#ifdef NO_PAR_ALGOS
    std::sort(sorted_list.begin(), sorted_list.end());
#else
    std::sort(std::execution::par_unseq, sorted_list.begin(), sorted_list.end());
#endif
    // list must be padded to a multipe of 4 and larger than 4 (gate_width)
    constexpr size_t gate_width = NUM_WIRES;
    size_t padding = (gate_width - (list.variable_indices.size() % gate_width)) % gate_width;

    std::vector<uint32_t> indices;
    indices.reserve(padding + sorted_list.size());

    if (list.variable_indices.size() <= gate_width) {
        padding += gate_width;
    }
    for (size_t i = 0; i < padding; ++i) {
        indices.emplace_back(this->zero_idx);
    }
    for (const auto sorted_value : sorted_list) {
        const uint32_t index = this->add_variable(sorted_value);
        assign_tag(index, list.tau_tag);
        indices.emplace_back(index);
    }
    create_sort_constraint_with_edges(indices, 0, list.target_range);
}

template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::process_range_lists()
{
    for (auto& i : range_lists) {
        process_range_list(i.second);
    }
}

/*
 Create range constraint:
  * add variable index to a list of range constrained variables
  * data structures: vector of lists, each list contains:
  *    - the range size
  *    - the list of variables in the range
  *    - a generalized permutation tag
  *
  * create range constraint parameters: variable index && range size
  *
  * std::map<uint64_t, RangeList> range_lists;
*/
// Check for a sequence of variables that neighboring differences are at most 3 (used for batched range checkj)
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_sort_constraint(const std::vector<uint32_t>& variable_index)
{
    constexpr size_t gate_width = NUM_WIRES;
    BB_ASSERT_EQ(variable_index.size() % gate_width, 0U);
    this->assert_valid_variables(variable_index);

    for (size_t i = 0; i < variable_index.size(); i += gate_width) {
        blocks.delta_range.populate_wires(
            variable_index[i], variable_index[i + 1], variable_index[i + 2], variable_index[i + 3]);

        ++this->num_gates;
        blocks.delta_range.q_m().emplace_back(0);
        blocks.delta_range.q_1().emplace_back(0);
        blocks.delta_range.q_2().emplace_back(0);
        blocks.delta_range.q_3().emplace_back(0);
        blocks.delta_range.q_c().emplace_back(0);
        blocks.delta_range.q_arith().emplace_back(0);
        blocks.delta_range.q_4().emplace_back(0);
        blocks.delta_range.q_delta_range().emplace_back(1);
        blocks.delta_range.q_elliptic().emplace_back(0);
        blocks.delta_range.q_lookup_type().emplace_back(0);
        blocks.delta_range.q_memory().emplace_back(0);
        blocks.delta_range.q_nnf().emplace_back(0);
        blocks.delta_range.q_poseidon2_external().emplace_back(0);
        blocks.delta_range.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            blocks.delta_range.pad_additional();
        }
        check_selector_length_consistency();
    }
    // dummy gate needed because of sort widget's check of next row
    create_dummy_gate(
        blocks.delta_range, variable_index[variable_index.size() - 1], this->zero_idx, this->zero_idx, this->zero_idx);
}

/**
 * @brief Create a gate with no constraints but with possibly non-trivial wire values
 * @details A dummy gate can be used to provide wire values to be accessed via shifts by the gate that proceeds it. The
 * dummy gate itself does not have to satisfy any constraints (all selectors are zero).
 *
 * @tparam ExecutionTrace
 * @param block Execution trace block into which the dummy gate is to be placed
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_dummy_gate(
    auto& block, const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3, const uint32_t& idx_4)
{
    block.populate_wires(idx_1, idx_2, idx_3, idx_4);
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(0);
    block.q_3().emplace_back(0);
    block.q_c().emplace_back(0);
    block.q_arith().emplace_back(0);
    block.q_4().emplace_back(0);
    block.q_delta_range().emplace_back(0);
    block.q_elliptic().emplace_back(0);
    block.q_lookup_type().emplace_back(0);
    block.q_memory().emplace_back(0);
    block.q_nnf().emplace_back(0);
    block.q_poseidon2_external().emplace_back(0);
    block.q_poseidon2_internal().emplace_back(0);

    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        block.pad_additional();
    }
    check_selector_length_consistency();
    ++this->num_gates;
}

// useful to put variables in the witness that aren't already used - e.g. the dummy variables of the range constraint in
// multiples of three
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_dummy_constraints(const std::vector<uint32_t>& variable_index)
{
    std::vector<uint32_t> padded_list = variable_index;
    constexpr size_t gate_width = NUM_WIRES;
    const uint64_t padding = (gate_width - (padded_list.size() % gate_width)) % gate_width;
    for (uint64_t i = 0; i < padding; ++i) {
        padded_list.emplace_back(this->zero_idx);
    }
    this->assert_valid_variables(variable_index);
    this->assert_valid_variables(padded_list);

    for (size_t i = 0; i < padded_list.size(); i += gate_width) {
        create_dummy_gate(
            blocks.arithmetic, padded_list[i], padded_list[i + 1], padded_list[i + 2], padded_list[i + 3]);
    }
}

// Check for a sequence of variables that neighboring differences are at most 3 (used for batched range checks)
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_sort_constraint_with_edges(
    const std::vector<uint32_t>& variable_index, const FF& start, const FF& end)
{
    // Convenient to assume size is at least 8 (gate_width = 4) for separate gates for start and end conditions
    constexpr size_t gate_width = NUM_WIRES;
    BB_ASSERT_EQ(variable_index.size() % gate_width, 0U);
    BB_ASSERT_GT(variable_index.size(), gate_width);
    this->assert_valid_variables(variable_index);

    auto& block = blocks.delta_range;

    // Add an arithmetic gate to ensure the first input is equal to the start value of the range being checked
    create_add_gate({ variable_index[0], this->zero_idx, this->zero_idx, 1, 0, 0, -start });

    // enforce range check for all but the final row
    for (size_t i = 0; i < variable_index.size() - gate_width; i += gate_width) {

        block.populate_wires(variable_index[i], variable_index[i + 1], variable_index[i + 2], variable_index[i + 3]);
        ++this->num_gates;
        block.q_m().emplace_back(0);
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_delta_range().emplace_back(1);
        block.q_elliptic().emplace_back(0);
        block.q_lookup_type().emplace_back(0);
        block.q_memory().emplace_back(0);
        block.q_nnf().emplace_back(0);
        block.q_poseidon2_external().emplace_back(0);
        block.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
    }
    // enforce range checks of last row and ending at end
    if (variable_index.size() > gate_width) {
        block.populate_wires(variable_index[variable_index.size() - 4],
                             variable_index[variable_index.size() - 3],
                             variable_index[variable_index.size() - 2],
                             variable_index[variable_index.size() - 1]);
        ++this->num_gates;
        block.q_m().emplace_back(0);
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_delta_range().emplace_back(1);
        block.q_elliptic().emplace_back(0);
        block.q_lookup_type().emplace_back(0);
        block.q_memory().emplace_back(0);
        block.q_nnf().emplace_back(0);
        block.q_poseidon2_external().emplace_back(0);
        block.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
    }

    // NOTE(https://github.com/AztecProtocol/barretenberg/issues/879): Optimisation opportunity to use a single gate
    // (and remove dummy gate). This used to be a single gate before trace sorting based on gate types. The dummy gate
    // has been added to allow the previous gate to access the required wire data via shifts, allowing the arithmetic
    // gate to occur out of sequence. More details on the linked Github issue.
    create_dummy_gate(block, variable_index[variable_index.size() - 1], this->zero_idx, this->zero_idx, this->zero_idx);
    create_add_gate({ variable_index[variable_index.size() - 1], this->zero_idx, this->zero_idx, 1, 0, 0, -end });
}

// range constraint a value by decomposing it into limbs whose size should be the default range constraint size

template <typename ExecutionTrace>
std::vector<uint32_t> UltraCircuitBuilder_<ExecutionTrace>::decompose_into_default_range_better_for_oddlimbnum(
    const uint32_t variable_index, const size_t num_bits, std::string const& msg)
{
    std::vector<uint32_t> sums;
    const size_t limb_num = (size_t)num_bits / DEFAULT_PLOOKUP_RANGE_BITNUM;
    const size_t last_limb_size = num_bits - (limb_num * DEFAULT_PLOOKUP_RANGE_BITNUM);
    if (limb_num < 3) {
        std::cerr
            << "number of bits in range must be an integer multipe of DEFAULT_PLOOKUP_RANGE_BITNUM of size at least 3"
            << std::endl;
        return sums;
    }

    const uint256_t val = (uint256_t)(this->get_variable(variable_index));
    // check witness value is indeed in range (commented out cause interferes with negative tests)
    // ASSERT(val < ((uint256_t)1 << num_bits) - 1); // Q:ask Zac what happens with wrapping when converting scalar
    // field to uint256 ASSERT(limb_num % 3 == 0); // TODO: write version of method that doesn't need this
    std::vector<uint32_t> val_limbs;
    std::vector<fr> val_slices;
    for (size_t i = 0; i < limb_num; i++) {
        val_slices.emplace_back(
            FF(val.slice(DEFAULT_PLOOKUP_RANGE_BITNUM * i, DEFAULT_PLOOKUP_RANGE_BITNUM * (i + 1) - 1)));
        val_limbs.emplace_back(this->add_variable(val_slices[i]));
        create_new_range_constraint(val_limbs[i], DEFAULT_PLOOKUP_RANGE_SIZE);
    }

    uint64_t last_limb_range = ((uint64_t)1 << last_limb_size) - 1;
    FF last_slice(0);
    uint32_t last_limb(this->zero_idx);
    size_t total_limb_num = limb_num;
    if (last_limb_size > 0) {
        val_slices.emplace_back(FF(val.slice(num_bits - last_limb_size, num_bits)));
        val_limbs.emplace_back(this->add_variable(last_slice));
        create_new_range_constraint(last_limb, last_limb_range);
        total_limb_num++;
    }
    // pad slices and limbs in case they are not 2 mod 3
    if (total_limb_num % 3 == 1) {
        val_limbs.emplace_back(this->zero_idx); // TODO: check this is zero
        val_slices.emplace_back(0);
        total_limb_num++;
    }
    FF shift = FF(1 << DEFAULT_PLOOKUP_RANGE_BITNUM);
    FF second_shift = shift * shift;
    sums.emplace_back(this->add_variable(val_slices[0] + shift * val_slices[1] + second_shift * val_slices[2]));
    create_big_add_gate({ val_limbs[0], val_limbs[1], val_limbs[2], sums[0], 1, shift, second_shift, -1, 0 });
    FF cur_shift = (shift * second_shift);
    FF cur_second_shift = cur_shift * shift;
    for (size_t i = 3; i < total_limb_num; i = i + 2) {
        sums.emplace_back(this->add_variable(this->get_variable(sums[sums.size() - 1]) + cur_shift * val_slices[i] +
                                             cur_second_shift * val_slices[i + 1]));
        create_big_add_gate({ sums[sums.size() - 2],
                              val_limbs[i],
                              val_limbs[i + 1],
                              sums[sums.size() - 1],
                              1,
                              cur_shift,
                              cur_second_shift,
                              -1,
                              0 });
        cur_shift *= second_shift;
        cur_second_shift *= second_shift;
    }
    this->assert_equal(sums[sums.size() - 1], variable_index, msg);
    return sums;
}

/**
 * @brief Enable the memory gate of particular type
 *
 * @details If we have several operations being performed do not require parametrization
 * (if we put each of them into a separate widget they would not require any selectors other than the ones enabling the
 * operation itself, for example q_special*(w_l-2*w_r)), we can group them all into one widget, by using a special
 * selector q_memory for all of them and enabling each in particular, depending on the combination of standard selector
 * values. So you can do:
 * q_memory * (q_1 * q_2 * statement_1 + q_3 * q_4 * statement_2). q_1=q_2=1 would activate statement_1, while q_3=q_4=1
 * would activate statement_2
 *
 * Multiple selectors are used to 'switch' memory gates on/off according to the following pattern:
 *
 * | gate type                    | q_mem | q_1 | q_2 | q_3 | q_4 | q_m | q_c |
 * | ---------------------------- | ----- | --- | --- | --- | --- | --- | --- |
 * | RAM/ROM access gate          | 1     | 1   | 0   | 0   | 0   | 1   | --- |
 * | RAM timestamp check          | 1     | 1   | 0   | 0   | 1   | 0   | --- |
 * | ROM consistency check        | 1     | 1   | 1   | 0   | 0   | 0   | --- |
 * | RAM consistency check        | 1     | 0   | 0   | 1   | 0   | 0   | 0   |
 *
 * @param type
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::apply_memory_selectors(const MEMORY_SELECTORS type)
{
    auto& block = blocks.memory;
    block.q_memory().emplace_back(type == MEMORY_SELECTORS::MEM_NONE ? 0 : 1);
    // Set to zero the selectors that are not enabled for this gate
    block.q_delta_range().emplace_back(0);
    block.q_lookup_type().emplace_back(0);
    block.q_elliptic().emplace_back(0);
    block.q_nnf().emplace_back(0);
    block.q_poseidon2_external().emplace_back(0);
    block.q_poseidon2_internal().emplace_back(0);
    switch (type) {
    case MEMORY_SELECTORS::ROM_CONSISTENCY_CHECK: {
        // Memory read gate used with the sorted list of memory reads.
        // Apply sorted memory read checks with the following additional check:
        // 1. Assert that if index field across two gates does not change, the value field does not change.
        // Used for ROM reads and RAM reads across write/read boundaries
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(1);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case MEMORY_SELECTORS::RAM_CONSISTENCY_CHECK: {
        // Memory read gate used with the sorted list of memory reads.
        // 1. Validate adjacent index values across 2 gates increases by 0 or 1
        // 2. Validate record computation (r = read_write_flag + index * \eta + \timestamp * \eta^2 + value * \eta^3)
        // 3. If adjacent index values across 2 gates does not change, and the next gate's read_write_flag is set to
        // 'read', validate adjacent values do not change Used for ROM reads and RAM reads across read/write boundaries
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(1);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case MEMORY_SELECTORS::RAM_TIMESTAMP_CHECK: {
        // For two adjacent RAM entries that share the same index, validate the timestamp value is monotonically
        // increasing
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(1);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case MEMORY_SELECTORS::ROM_READ: {
        // Memory read gate for reading memory cells.
        // Validates record witness computation (r = read_write_flag + index * \eta + timestamp * \eta^2 + value *
        // \eta^3)
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(1); // validate record witness is correctly computed
        block.q_c().emplace_back(0); // read/write flag stored in q_c
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case MEMORY_SELECTORS::RAM_READ: {
        // Memory read gate for reading memory cells.
        // Validates record witness computation (r = read_write_flag + index * \eta + timestamp * \eta^2 + value *
        // \eta^3)
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(1); // validate record witness is correctly computed
        block.q_c().emplace_back(0); // read/write flag stored in q_c
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case MEMORY_SELECTORS::RAM_WRITE: {
        // Memory read gate for writing memory cells.
        // Validates record witness computation (r = read_write_flag + index * \eta + timestamp * \eta^2 + value *
        // \eta^3)
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(1); // validate record witness is correctly computed
        block.q_c().emplace_back(1); // read/write flag stored in q_c
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    default: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    }
}

/**
 * @brief Enable the nnf gate of particular type
 *
 * @details If we have several operations being performed do not require parametrization
 * (if we put each of them into a separate widget they would not require any selectors other than the ones enabling the
 * operation itself, for example q_special*(w_l-2*w_r)), we can group them all into one widget, by using a special
 * selector q_nnf for all of them and enabling each in particular, depending on the combination of standard selector
 * values. So you can do:
 * q_nnf * (q_1 * q_2 * statement_1 + q_3 * q_4 * statement_2). q_1=q_2=1 would activate statement_1, while q_3=q_4=1
 * would activate statement_2
 *
 * Multiple selectors are used to 'switch' nnf gates on/off according to the following pattern:
 *
 * | gate type                    | q_nnf | q_1 | q_2 | q_3 | q_4 | q_m |
 * | ---------------------------- | ----- | --- | --- | --- | --- | --- |
 * | Bigfield Limb Accumulation 1 | 1     | 0   | 0   | 1   | 1   | 0   |
 * | Bigfield Limb Accumulation 2 | 1     | 0   | 0   | 1   | 0   | 1   |
 * | Bigfield Product 1           | 1     | 0   | 1   | 1   | 0   | 0   |
 * | Bigfield Product 2           | 1     | 0   | 1   | 0   | 1   | 0   |
 * | Bigfield Product 3           | 1     | 0   | 1   | 0   | 0   | 1   |
 *
 * @param type
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::apply_nnf_selectors(const NNF_SELECTORS type)
{
    auto& block = blocks.nnf;
    block.q_nnf().emplace_back(type == NNF_SELECTORS::NNF_NONE ? 0 : 1);
    // Set to zero the selectors that are not enabled for this gate
    block.q_delta_range().emplace_back(0);
    block.q_lookup_type().emplace_back(0);
    block.q_elliptic().emplace_back(0);
    block.q_memory().emplace_back(0);
    block.q_poseidon2_external().emplace_back(0);
    block.q_poseidon2_internal().emplace_back(0);
    switch (type) {
    case NNF_SELECTORS::LIMB_ACCUMULATE_1: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(1);
        block.q_4().emplace_back(1);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case NNF_SELECTORS::LIMB_ACCUMULATE_2: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(1);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(1);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case NNF_SELECTORS::NON_NATIVE_FIELD_1: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(1);
        block.q_3().emplace_back(1);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case NNF_SELECTORS::NON_NATIVE_FIELD_2: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(1);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(1);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    case NNF_SELECTORS::NON_NATIVE_FIELD_3: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(1);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(1);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    default: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_arith().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
        check_selector_length_consistency();
        break;
    }
    }
}

/**
 * NON NATIVE FIELD METHODS
 *
 * Methods to efficiently apply constraints that evaluate non-native field multiplications
 **/

/**
 * Applies range constraints to two 70-bit limbs, splititng each into 5 14-bit sublimbs.
 * We can efficiently chain together two 70-bit limb checks in 3 gates, using nnf gates
 **/
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::range_constrain_two_limbs(const uint32_t lo_idx,
                                                                     const uint32_t hi_idx,
                                                                     const size_t lo_limb_bits,
                                                                     const size_t hi_limb_bits)
{
    // Validate limbs are <= 70 bits. If limbs are larger we require more witnesses and cannot use our limb accumulation
    // custom gate
    BB_ASSERT_LTE(lo_limb_bits, 14U * 5U);
    BB_ASSERT_LTE(hi_limb_bits, 14U * 5U);

    // Sometimes we try to use limbs that are too large. It's easier to catch this issue here
    const auto get_sublimbs = [&](const uint32_t& limb_idx, const std::array<uint64_t, 5>& sublimb_masks) {
        const uint256_t limb = this->get_variable(limb_idx);
        // we can use constant 2^14 - 1 mask here. If the sublimb value exceeds the expected value then witness will
        // fail the range check below
        // We also use zero_idx to substitute variables that should be zero
        constexpr uint256_t MAX_SUBLIMB_MASK = (uint256_t(1) << 14) - 1;
        std::array<uint32_t, 5> sublimb_indices;
        sublimb_indices[0] = sublimb_masks[0] != 0 ? this->add_variable(limb & MAX_SUBLIMB_MASK) : this->zero_idx;
        sublimb_indices[1] =
            sublimb_masks[1] != 0 ? this->add_variable((limb >> 14) & MAX_SUBLIMB_MASK) : this->zero_idx;
        sublimb_indices[2] =
            sublimb_masks[2] != 0 ? this->add_variable((limb >> 28) & MAX_SUBLIMB_MASK) : this->zero_idx;
        sublimb_indices[3] =
            sublimb_masks[3] != 0 ? this->add_variable((limb >> 42) & MAX_SUBLIMB_MASK) : this->zero_idx;
        sublimb_indices[4] =
            sublimb_masks[4] != 0 ? this->add_variable((limb >> 56) & MAX_SUBLIMB_MASK) : this->zero_idx;
        return sublimb_indices;
    };

    const auto get_limb_masks = [](size_t limb_bits) {
        std::array<uint64_t, 5> sublimb_masks;
        sublimb_masks[0] = limb_bits >= 14 ? 14 : limb_bits;
        sublimb_masks[1] = limb_bits >= 28 ? 14 : (limb_bits > 14 ? limb_bits - 14 : 0);
        sublimb_masks[2] = limb_bits >= 42 ? 14 : (limb_bits > 28 ? limb_bits - 28 : 0);
        sublimb_masks[3] = limb_bits >= 56 ? 14 : (limb_bits > 42 ? limb_bits - 42 : 0);
        sublimb_masks[4] = (limb_bits > 56 ? limb_bits - 56 : 0);

        for (auto& mask : sublimb_masks) {
            mask = (1ULL << mask) - 1ULL;
        }
        return sublimb_masks;
    };

    const auto lo_masks = get_limb_masks(lo_limb_bits);
    const auto hi_masks = get_limb_masks(hi_limb_bits);
    const std::array<uint32_t, 5> lo_sublimbs = get_sublimbs(lo_idx, lo_masks);
    const std::array<uint32_t, 5> hi_sublimbs = get_sublimbs(hi_idx, hi_masks);

    blocks.nnf.populate_wires(lo_sublimbs[0], lo_sublimbs[1], lo_sublimbs[2], lo_idx);
    blocks.nnf.populate_wires(lo_sublimbs[3], lo_sublimbs[4], hi_sublimbs[0], hi_sublimbs[1]);
    blocks.nnf.populate_wires(hi_sublimbs[2], hi_sublimbs[3], hi_sublimbs[4], hi_idx);

    apply_nnf_selectors(NNF_SELECTORS::LIMB_ACCUMULATE_1);
    apply_nnf_selectors(NNF_SELECTORS::LIMB_ACCUMULATE_2);
    apply_nnf_selectors(NNF_SELECTORS::NNF_NONE);
    this->num_gates += 3;

    for (size_t i = 0; i < 5; i++) {
        if (lo_masks[i] != 0) {
            create_new_range_constraint(lo_sublimbs[i], lo_masks[i]);
        }
        if (hi_masks[i] != 0) {
            create_new_range_constraint(hi_sublimbs[i], hi_masks[i]);
        }
    }
};

/**
 * @brief Decompose a single witness into two, where the lowest is DEFAULT_NON_NATIVE_FIELD_LIMB_BITS (68) range
 * constrained and the lowst is num_limb_bits - DEFAULT.. range constrained.
 *
 * @details Doesn't create gates constraining the limbs to each other.
 *
 * @param limb_idx The index of the limb that will be decomposed
 * @param num_limb_bits The range we want to constrain the original limb to
 * @return std::array<uint32_t, 2> The indices of new limbs.
 */
template <typename ExecutionTrace>
std::array<uint32_t, 2> UltraCircuitBuilder_<ExecutionTrace>::decompose_non_native_field_double_width_limb(
    const uint32_t limb_idx, const size_t num_limb_bits)
{
    BB_ASSERT_LT(uint256_t(this->get_variable_reference(limb_idx)), (uint256_t(1) << num_limb_bits));
    constexpr FF LIMB_MASK = (uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS) - 1;
    const uint256_t value = this->get_variable(limb_idx);
    const uint256_t low = value & LIMB_MASK;
    const uint256_t hi = value >> DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
    BB_ASSERT_EQ(low + (hi << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS), value);

    const uint32_t low_idx = this->add_variable(low);
    const uint32_t hi_idx = this->add_variable(hi);

    BB_ASSERT_GT(num_limb_bits, DEFAULT_NON_NATIVE_FIELD_LIMB_BITS);
    const size_t lo_bits = DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
    const size_t hi_bits = num_limb_bits - DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
    range_constrain_two_limbs(low_idx, hi_idx, lo_bits, hi_bits);

    return std::array<uint32_t, 2>{ low_idx, hi_idx };
}

/**
 * @brief Queue up non-native field multiplication data.
 *
 * @details The data queued represents a non-native field multiplication identity a * b = q * p + r,
 * where a, b, q, r are all emulated non-native field elements that are each split across 4 distinct witness variables.
 *
 * Without this queue some functions, such as bb::stdlib::element::multiple_montgomery_ladder, would
 * duplicate non-native field operations, which can be quite expensive. We queue up these operations, and remove
 * duplicates in the circuit finishing stage of the proving key computation.
 *
 * The non-native field modulus, p, is a circuit constant
 *
 * The return value are the witness indices of the two remainder limbs `lo_1, hi_2`
 *
 * N.B.: This method does NOT evaluate the prime field component of non-native field multiplications.
 **/
template <typename ExecutionTrace>
std::array<uint32_t, 2> UltraCircuitBuilder_<ExecutionTrace>::evaluate_non_native_field_multiplication(
    const non_native_multiplication_witnesses<FF>& input)
{

    std::array<fr, 4> a{
        this->get_variable(input.a[0]),
        this->get_variable(input.a[1]),
        this->get_variable(input.a[2]),
        this->get_variable(input.a[3]),
    };
    std::array<fr, 4> b{
        this->get_variable(input.b[0]),
        this->get_variable(input.b[1]),
        this->get_variable(input.b[2]),
        this->get_variable(input.b[3]),
    };
    std::array<fr, 4> q{
        this->get_variable(input.q[0]),
        this->get_variable(input.q[1]),
        this->get_variable(input.q[2]),
        this->get_variable(input.q[3]),
    };
    std::array<fr, 4> r{
        this->get_variable(input.r[0]),
        this->get_variable(input.r[1]),
        this->get_variable(input.r[2]),
        this->get_variable(input.r[3]),
    };
    constexpr FF LIMB_SHIFT = uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
    constexpr FF LIMB_RSHIFT = FF(1) / FF(uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS);
    constexpr FF LIMB_RSHIFT_2 = FF(1) / FF(uint256_t(1) << (2 * DEFAULT_NON_NATIVE_FIELD_LIMB_BITS));

    FF lo_0 = a[0] * b[0] - r[0] + (a[1] * b[0] + a[0] * b[1]) * LIMB_SHIFT;
    FF lo_1 = (lo_0 + q[0] * input.neg_modulus[0] +
               (q[1] * input.neg_modulus[0] + q[0] * input.neg_modulus[1] - r[1]) * LIMB_SHIFT) *
              LIMB_RSHIFT_2;

    FF hi_0 = a[2] * b[0] + a[0] * b[2] + (a[0] * b[3] + a[3] * b[0] - r[3]) * LIMB_SHIFT;
    FF hi_1 = hi_0 + a[1] * b[1] - r[2] + (a[1] * b[2] + a[2] * b[1]) * LIMB_SHIFT;
    FF hi_2 = (hi_1 + lo_1 + q[2] * input.neg_modulus[0] +
               (q[3] * input.neg_modulus[0] + q[2] * input.neg_modulus[1]) * LIMB_SHIFT);
    FF hi_3 = (hi_2 + (q[0] * input.neg_modulus[3] + q[1] * input.neg_modulus[2]) * LIMB_SHIFT +
               (q[0] * input.neg_modulus[2] + q[1] * input.neg_modulus[1])) *
              LIMB_RSHIFT_2;

    const uint32_t lo_0_idx = this->add_variable(lo_0);
    const uint32_t lo_1_idx = this->add_variable(lo_1);
    const uint32_t hi_0_idx = this->add_variable(hi_0);
    const uint32_t hi_1_idx = this->add_variable(hi_1);
    const uint32_t hi_2_idx = this->add_variable(hi_2);
    const uint32_t hi_3_idx = this->add_variable(hi_3);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/879): Originally this was a single arithmetic gate.
    // With trace sorting, we must add a dummy gate since the add gate would otherwise try to read into an nnf gate that
    // has been sorted out of sequence.
    // product gate 1
    // (lo_0 + q_0(p_0 + p_1*2^b) + q_1(p_0*2^b) - (r_1)2^b)2^-2b - lo_1 = 0
    create_big_add_gate({ input.q[0],
                          input.q[1],
                          input.r[1],
                          lo_1_idx,
                          input.neg_modulus[0] + input.neg_modulus[1] * LIMB_SHIFT,
                          input.neg_modulus[0] * LIMB_SHIFT,
                          -LIMB_SHIFT,
                          -LIMB_SHIFT.sqr(),
                          0 },
                        true);
    create_dummy_gate(blocks.arithmetic, this->zero_idx, this->zero_idx, this->zero_idx, lo_0_idx);
    //
    // a = (a3 || a2 || a1 || a0) = (a3 * 2^b + a2) * 2^b + (a1 * 2^b + a0)
    // b = (b3 || b2 || b1 || b0) = (b3 * 2^b + b2) * 2^b + (b1 * 2^b + b0)
    //
    // Check if lo_0 was computed correctly.
    // The gate structure for the nnf gates is as follows:
    //
    // | a1 | b1 | r0 | lo_0 | <-- product gate 1: check lo_0
    // | a0 | b0 | a3 | b3   |
    // | a2 | b2 | r3 | hi_0 |
    // | a1 | b1 | r2 | hi_1 |
    //
    // Constaint: lo_0 = (a1 * b0 + a0 * b1) * 2^b  +  (a0 * b0) - r0
    //              w4 = (w1 * w'2 + w'1 * w2) * 2^b + (w'1 * w'2) - w3
    //
    blocks.nnf.populate_wires(input.a[1], input.b[1], input.r[0], lo_0_idx);
    apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_1);
    ++this->num_gates;

    //
    // Check if hi_0 was computed correctly.
    //
    // | a1 | b1 | r0 | lo_0 |
    // | a0 | b0 | a3 | b3   | <-- product gate 2: check hi_0
    // | a2 | b2 | r3 | hi_0 |
    // | a1 | b1 | r2 | hi_1 |
    //
    // Constaint: hi_0 = (a0 * b3 + a3 * b0 - r3) * 2^b + (a0 * b2 + a2 * b0) - r2
    //             w'4 = (w1 * w4 + w2 * w3 - w'3) * 2^b + (w1 * w'2 + w'1 * w2) - w'3
    //
    blocks.nnf.populate_wires(input.a[0], input.b[0], input.a[3], input.b[3]);
    apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_2);
    ++this->num_gates;

    //
    // Check if hi_1 was computed correctly.
    //
    // | a1 | b1 | r0 | lo_0 |
    // | a0 | b0 | a3 | b3   |
    // | a2 | b2 | r3 | hi_0 | <-- product gate 3: check hi_1
    // | a1 | b1 | r2 | hi_1 |
    //
    // Constaint: hi_1 = hi_0 + (a2 * b1 + a1 * b2) * 2^b + (a1 * b1)
    //             w'4 = w4 + (w1 * w'2 + w'1 * w2) * 2^b + (w'1 * w'2)
    //
    blocks.nnf.populate_wires(input.a[2], input.b[2], input.r[3], hi_0_idx);
    apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_3);
    ++this->num_gates;

    //
    // Does nothing, but is used by the previous gate to read the hi_1 limb.
    //
    blocks.nnf.populate_wires(input.a[1], input.b[1], input.r[2], hi_1_idx);
    apply_nnf_selectors(NNF_SELECTORS::NNF_NONE);
    ++this->num_gates;

    /**
     * product gate 6
     *
     * hi_2 - hi_1 - lo_1 - q[2](p[1].2^b + p[0]) - q[3](p[0].2^b) = 0
     *
     **/
    create_big_add_gate(
        {
            input.q[2],
            input.q[3],
            lo_1_idx,
            hi_1_idx,
            -input.neg_modulus[1] * LIMB_SHIFT - input.neg_modulus[0],
            -input.neg_modulus[0] * LIMB_SHIFT,
            -1,
            -1,
            0,
        },
        true);

    /**
     * product gate 7
     *
     * hi_3 - (hi_2 - q[0](p[3].2^b + p[2]) - q[1](p[2].2^b + p[1])).2^-2b
     **/
    create_big_add_gate({
        hi_3_idx,
        input.q[0],
        input.q[1],
        hi_2_idx,
        -1,
        input.neg_modulus[3] * LIMB_RSHIFT + input.neg_modulus[2] * LIMB_RSHIFT_2,
        input.neg_modulus[2] * LIMB_RSHIFT + input.neg_modulus[1] * LIMB_RSHIFT_2,
        LIMB_RSHIFT_2,
        0,
    });

    return std::array<uint32_t, 2>{ lo_1_idx, hi_3_idx };
}

/**
 * @brief Copy the public input idx data into the public inputs trace block
 * @note
 */
template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::populate_public_inputs_block()
{
    PROFILE_THIS_NAME("populate_public_inputs_block");

    // Update the public inputs block
    for (const auto& idx : this->public_inputs()) {
        // first two wires get a copy of the public inputs
        blocks.pub_inputs.populate_wires(idx, idx, this->zero_idx, this->zero_idx);
        for (auto& selector : this->blocks.pub_inputs.selectors) {
            selector.emplace_back(0);
        }
    }
}

/**
 * @brief Called in `compute_proving_key` when finalizing circuit.
 * Iterates over the cached_non_native_field_multiplication objects,
 * removes duplicates, and instantiates the remainder as constraints`
 */
template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::process_non_native_field_multiplications()
{
    for (size_t i = 0; i < cached_partial_non_native_field_multiplications.size(); ++i) {
        auto& c = cached_partial_non_native_field_multiplications[i];
        for (size_t j = 0; j < c.a.size(); ++j) {
            c.a[j] = this->real_variable_index[c.a[j]];
            c.b[j] = this->real_variable_index[c.b[j]];
        }
    }
    cached_partial_non_native_field_multiplication::deduplicate(cached_partial_non_native_field_multiplications, this);

    // iterate over the cached items and create constraints
    for (const auto& input : cached_partial_non_native_field_multiplications) {

        blocks.nnf.populate_wires(input.a[1], input.b[1], this->zero_idx, input.lo_0);
        apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_1);
        ++this->num_gates;

        blocks.nnf.populate_wires(input.a[0], input.b[0], input.a[3], input.b[3]);
        apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_2);
        ++this->num_gates;

        blocks.nnf.populate_wires(input.a[2], input.b[2], this->zero_idx, input.hi_0);
        apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_3);
        ++this->num_gates;

        blocks.nnf.populate_wires(input.a[1], input.b[1], this->zero_idx, input.hi_1);
        apply_nnf_selectors(NNF_SELECTORS::NNF_NONE);
        ++this->num_gates;
    }
}

/**
 * Compute the limb-multiplication part of a non native field mul
 *
 * i.e. compute the low 204 and high 204 bit components of `a * b` where `a, b` are nnf elements composed of 4
 * limbs with size DEFAULT_NON_NATIVE_FIELD_LIMB_BITS
 *
 **/

template <typename ExecutionTrace>
std::array<uint32_t, 2> UltraCircuitBuilder_<ExecutionTrace>::queue_partial_non_native_field_multiplication(
    const non_native_partial_multiplication_witnesses<FF>& input)
{

    std::array<fr, 4> a{
        this->get_variable(input.a[0]),
        this->get_variable(input.a[1]),
        this->get_variable(input.a[2]),
        this->get_variable(input.a[3]),
    };
    std::array<fr, 4> b{
        this->get_variable(input.b[0]),
        this->get_variable(input.b[1]),
        this->get_variable(input.b[2]),
        this->get_variable(input.b[3]),
    };

    constexpr FF LIMB_SHIFT = uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;

    FF lo_0 = a[0] * b[0] + (a[1] * b[0] + a[0] * b[1]) * LIMB_SHIFT;

    FF hi_0 = a[2] * b[0] + a[0] * b[2] + (a[0] * b[3] + a[3] * b[0]) * LIMB_SHIFT;
    FF hi_1 = hi_0 + a[1] * b[1] + (a[1] * b[2] + a[2] * b[1]) * LIMB_SHIFT;

    const uint32_t lo_0_idx = this->add_variable(lo_0);
    const uint32_t hi_0_idx = this->add_variable(hi_0);
    const uint32_t hi_1_idx = this->add_variable(hi_1);

    // Add witnesses into the multiplication cache
    // (when finalising the circuit, we will remove duplicates; several dups produced by biggroup.hpp methods)
    cached_partial_non_native_field_multiplication cache_entry{
        .a = input.a,
        .b = input.b,
        .lo_0 = lo_0_idx,
        .hi_0 = hi_0_idx,
        .hi_1 = hi_1_idx,
    };
    cached_partial_non_native_field_multiplications.emplace_back(cache_entry);
    return std::array<uint32_t, 2>{ lo_0_idx, hi_1_idx };
}

/**
 * Uses a sneaky extra mini-addition gate in `plookup_arithmetic_widget.hpp` to add two non-native
 * field elements in 4 gates (would normally take 5)
 **/

template <typename ExecutionTrace>
std::array<uint32_t, 5> UltraCircuitBuilder_<ExecutionTrace>::evaluate_non_native_field_addition(
    add_simple limb0, add_simple limb1, add_simple limb2, add_simple limb3, std::tuple<uint32_t, uint32_t, FF> limbp)
{
    const auto& x_0 = std::get<0>(limb0).first;
    const auto& x_1 = std::get<0>(limb1).first;
    const auto& x_2 = std::get<0>(limb2).first;
    const auto& x_3 = std::get<0>(limb3).first;
    const auto& x_p = std::get<0>(limbp);

    const auto& x_mulconst0 = std::get<0>(limb0).second;
    const auto& x_mulconst1 = std::get<0>(limb1).second;
    const auto& x_mulconst2 = std::get<0>(limb2).second;
    const auto& x_mulconst3 = std::get<0>(limb3).second;

    const auto& y_0 = std::get<1>(limb0).first;
    const auto& y_1 = std::get<1>(limb1).first;
    const auto& y_2 = std::get<1>(limb2).first;
    const auto& y_3 = std::get<1>(limb3).first;
    const auto& y_p = std::get<1>(limbp);

    const auto& y_mulconst0 = std::get<1>(limb0).second;
    const auto& y_mulconst1 = std::get<1>(limb1).second;
    const auto& y_mulconst2 = std::get<1>(limb2).second;
    const auto& y_mulconst3 = std::get<1>(limb3).second;

    // constant additive terms
    const auto& addconst0 = std::get<2>(limb0);
    const auto& addconst1 = std::get<2>(limb1);
    const auto& addconst2 = std::get<2>(limb2);
    const auto& addconst3 = std::get<2>(limb3);
    const auto& addconstp = std::get<2>(limbp);

    // get value of result limbs
    const auto z_0value = this->get_variable(x_0) * x_mulconst0 + this->get_variable(y_0) * y_mulconst0 + addconst0;
    const auto z_1value = this->get_variable(x_1) * x_mulconst1 + this->get_variable(y_1) * y_mulconst1 + addconst1;
    const auto z_2value = this->get_variable(x_2) * x_mulconst2 + this->get_variable(y_2) * y_mulconst2 + addconst2;
    const auto z_3value = this->get_variable(x_3) * x_mulconst3 + this->get_variable(y_3) * y_mulconst3 + addconst3;
    const auto z_pvalue = this->get_variable(x_p) + this->get_variable(y_p) + addconstp;

    const auto z_0 = this->add_variable(z_0value);
    const auto z_1 = this->add_variable(z_1value);
    const auto z_2 = this->add_variable(z_2value);
    const auto z_3 = this->add_variable(z_3value);
    const auto z_p = this->add_variable(z_pvalue);

    /**
     *   we want the following layout in program memory
     *   (x - y = z)
     *
     *   |  1  |  2  |  3  |  4  |
     *   |-----|-----|-----|-----|
     *   | y.p | x.0 | y.0 | x.p | (b.p + c.p - a.p = 0) AND (a.0 - b.0 - c.0 = 0)
     *   | z.p | x.1 | y.1 | z.0 | (a.1 - b.1 - c.1 = 0)
     *   | x.2 | y.2 | z.2 | z.1 | (a.2 - b.2 - c.2 = 0)
     *   | x.3 | y.3 | z.3 | --- | (a.3 - b.3 - c.3 = 0)
     *
     * By setting `q_arith` to `3`, we can validate `x_p + y_p + q_m = z_p`
     **/
    // GATE 1
    // |  1  |  2  |  3  |  4  |
    // |-----|-----|-----|-----|
    // | y.p | x.0 | y.0 | z.p | (b.p + b.p - c.p = 0) AND (a.0 + b.0 - c.0 = 0)
    // | x.p | x.1 | y.1 | z.0 | (a.1  + b.1 - c.1 = 0)
    // | x.2 | y.2 | z.2 | z.1 | (a.2  + b.2 - c.2 = 0)
    // | x.3 | y.3 | z.3 | --- | (a.3  + b.3 - c.3 = 0)
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/896): descrepency between above comment and the actual
    // implementation below.
    auto& block = blocks.arithmetic;
    block.populate_wires(y_p, x_0, y_0, x_p);
    block.populate_wires(z_p, x_1, y_1, z_0);
    block.populate_wires(x_2, y_2, z_2, z_1);
    block.populate_wires(x_3, y_3, z_3, this->zero_idx);

    block.q_m().emplace_back(addconstp);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst0 *
                             2); // scale constants by 2. If q_arith = 3 then w_4_omega value (z0) gets scaled by 2x
    block.q_3().emplace_back(-y_mulconst0 * 2); // z_0 - (x_0 * -xmulconst0) - (y_0 * ymulconst0) = 0 => z_0 = x_0 + y_0
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst0 * 2);
    block.q_arith().emplace_back(3);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst1);
    block.q_3().emplace_back(-y_mulconst1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst1);
    block.q_arith().emplace_back(2);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst2);
    block.q_2().emplace_back(-y_mulconst2);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst2);
    block.q_arith().emplace_back(1);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst3);
    block.q_2().emplace_back(-y_mulconst3);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst3);
    block.q_arith().emplace_back(1);

    for (size_t i = 0; i < 4; ++i) {
        block.q_delta_range().emplace_back(0);
        block.q_lookup_type().emplace_back(0);
        block.q_elliptic().emplace_back(0);
        block.q_memory().emplace_back(0);
        block.q_nnf().emplace_back(0);
        block.q_poseidon2_external().emplace_back(0);
        block.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
    }
    check_selector_length_consistency();

    this->num_gates += 4;
    return std::array<uint32_t, 5>{
        z_0, z_1, z_2, z_3, z_p,
    };
}

template <typename ExecutionTrace>
std::array<uint32_t, 5> UltraCircuitBuilder_<ExecutionTrace>::evaluate_non_native_field_subtraction(
    add_simple limb0, add_simple limb1, add_simple limb2, add_simple limb3, std::tuple<uint32_t, uint32_t, FF> limbp)
{
    const auto& x_0 = std::get<0>(limb0).first;
    const auto& x_1 = std::get<0>(limb1).first;
    const auto& x_2 = std::get<0>(limb2).first;
    const auto& x_3 = std::get<0>(limb3).first;
    const auto& x_p = std::get<0>(limbp);

    const auto& x_mulconst0 = std::get<0>(limb0).second;
    const auto& x_mulconst1 = std::get<0>(limb1).second;
    const auto& x_mulconst2 = std::get<0>(limb2).second;
    const auto& x_mulconst3 = std::get<0>(limb3).second;

    const auto& y_0 = std::get<1>(limb0).first;
    const auto& y_1 = std::get<1>(limb1).first;
    const auto& y_2 = std::get<1>(limb2).first;
    const auto& y_3 = std::get<1>(limb3).first;
    const auto& y_p = std::get<1>(limbp);

    const auto& y_mulconst0 = std::get<1>(limb0).second;
    const auto& y_mulconst1 = std::get<1>(limb1).second;
    const auto& y_mulconst2 = std::get<1>(limb2).second;
    const auto& y_mulconst3 = std::get<1>(limb3).second;

    // constant additive terms
    const auto& addconst0 = std::get<2>(limb0);
    const auto& addconst1 = std::get<2>(limb1);
    const auto& addconst2 = std::get<2>(limb2);
    const auto& addconst3 = std::get<2>(limb3);
    const auto& addconstp = std::get<2>(limbp);

    // get value of result limbs
    const auto z_0value = this->get_variable(x_0) * x_mulconst0 - this->get_variable(y_0) * y_mulconst0 + addconst0;
    const auto z_1value = this->get_variable(x_1) * x_mulconst1 - this->get_variable(y_1) * y_mulconst1 + addconst1;
    const auto z_2value = this->get_variable(x_2) * x_mulconst2 - this->get_variable(y_2) * y_mulconst2 + addconst2;
    const auto z_3value = this->get_variable(x_3) * x_mulconst3 - this->get_variable(y_3) * y_mulconst3 + addconst3;
    const auto z_pvalue = this->get_variable(x_p) - this->get_variable(y_p) + addconstp;

    const auto z_0 = this->add_variable(z_0value);
    const auto z_1 = this->add_variable(z_1value);
    const auto z_2 = this->add_variable(z_2value);
    const auto z_3 = this->add_variable(z_3value);
    const auto z_p = this->add_variable(z_pvalue);

    /**
     *   we want the following layout in program memory
     *   (x - y = z)
     *
     *   |  1  |  2  |  3  |  4  |
     *   |-----|-----|-----|-----|
     *   | y.p | x.0 | y.0 | z.p | (b.p + c.p - a.p = 0) AND (a.0 - b.0 - c.0 = 0)
     *   | x.p | x.1 | y.1 | z.0 | (a.1 - b.1 - c.1 = 0)
     *   | x.2 | y.2 | z.2 | z.1 | (a.2 - b.2 - c.2 = 0)
     *   | x.3 | y.3 | z.3 | --- | (a.3 - b.3 - c.3 = 0)
     *
     **/
    // GATE 1
    // |  1  |  2  |  3  |  4  |
    // |-----|-----|-----|-----|
    // | y.p | x.0 | y.0 | z.p | (b.p + c.p - a.p = 0) AND (a.0 - b.0 - c.0 = 0)
    // | x.p | x.1 | y.1 | z.0 | (a.1 - b.1 - c.1 = 0)
    // | x.2 | y.2 | z.2 | z.1 | (a.2 - b.2 - c.2 = 0)
    // | x.3 | y.3 | z.3 | --- | (a.3 - b.3 - c.3 = 0)
    auto& block = blocks.arithmetic;
    block.populate_wires(y_p, x_0, y_0, z_p);
    block.populate_wires(x_p, x_1, y_1, z_0);
    block.populate_wires(x_2, y_2, z_2, z_1);
    block.populate_wires(x_3, y_3, z_3, this->zero_idx);

    block.q_m().emplace_back(-addconstp);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst0 * 2);
    block.q_3().emplace_back(y_mulconst0 * 2); // z_0 + (x_0 * -xmulconst0) + (y_0 * ymulconst0) = 0 => z_0 = x_0 - y_0
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst0 * 2);
    block.q_arith().emplace_back(3);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst1);
    block.q_3().emplace_back(y_mulconst1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst1);
    block.q_arith().emplace_back(2);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst2);
    block.q_2().emplace_back(y_mulconst2);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst2);
    block.q_arith().emplace_back(1);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst3);
    block.q_2().emplace_back(y_mulconst3);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst3);
    block.q_arith().emplace_back(1);

    for (size_t i = 0; i < 4; ++i) {
        block.q_delta_range().emplace_back(0);
        block.q_lookup_type().emplace_back(0);
        block.q_elliptic().emplace_back(0);
        block.q_memory().emplace_back(0);
        block.q_nnf().emplace_back(0);
        block.q_poseidon2_external().emplace_back(0);
        block.q_poseidon2_internal().emplace_back(0);
        if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
            block.pad_additional();
        }
    }
    check_selector_length_consistency();

    this->num_gates += 4;
    return std::array<uint32_t, 5>{
        z_0, z_1, z_2, z_3, z_p,
    };
}

/**
 * @brief Create a new read-only memory region
 *
 * @details Creates a transcript object, where the inside memory state array is filled with "uninitialized memory"
 and
 * empty memory record array. Puts this object into the vector of ROM arrays.
 *
 * @param array_size The size of region in elements
 * @return size_t The index of the element
 */
template <typename ExecutionTrace>
size_t UltraCircuitBuilder_<ExecutionTrace>::create_ROM_array(const size_t array_size)
{
    return this->rom_ram_logic.create_ROM_array(array_size);
}

/**
 * @brief Create a new updatable memory region
 *
 * @details Creates a transcript object, where the inside memory state array is filled with "uninitialized memory"
 and
 * and empty memory record array. Puts this object into the vector of ROM arrays.
 *
 * @param array_size The size of region in elements
 * @return size_t The index of the element
 */
template <typename ExecutionTrace>
size_t UltraCircuitBuilder_<ExecutionTrace>::create_RAM_array(const size_t array_size)
{
    return this->rom_ram_logic.create_RAM_array(array_size);
}

/**
 * @brief Initialize a RAM cell to equal `value_witness`
 *
 * @param ram_id The index of the RAM array, which cell we are initializing
 * @param index_value The index of the cell within the array (an actual index, not a witness index)
 * @param value_witness The index of the witness with the value that should be in the
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::init_RAM_element(const size_t ram_id,
                                                            const size_t index_value,
                                                            const uint32_t value_witness)
{
    this->rom_ram_logic.init_RAM_element(this, ram_id, index_value, value_witness);
}

template <typename ExecutionTrace>
uint32_t UltraCircuitBuilder_<ExecutionTrace>::read_RAM_array(const size_t ram_id, const uint32_t index_witness)
{
    return this->rom_ram_logic.read_RAM_array(this, ram_id, index_witness);
}

template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::write_RAM_array(const size_t ram_id,
                                                           const uint32_t index_witness,
                                                           const uint32_t value_witness)
{
    this->rom_ram_logic.write_RAM_array(this, ram_id, index_witness, value_witness);
}

/**
 * Initialize a ROM cell to equal `value_witness`
 * `index_value` is a RAW VALUE that describes the cell index. It is NOT a witness
 * When intializing ROM arrays, it is important that the index of the cell is known when compiling the circuit.
 * This ensures that, for a given circuit, we know with 100% certainty that EVERY rom cell is initialized
 **/

/**
 * @brief Initialize a rom cell to equal `value_witness`
 *
 * @param rom_id The index of the ROM array, which cell we are initializing
 * @param index_value The index of the cell within the array (an actual index, not a witness index)
 * @param value_witness The index of the witness with the value that should be in the
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::set_ROM_element(const size_t rom_id,
                                                           const size_t index_value,
                                                           const uint32_t value_witness)
{
    this->rom_ram_logic.set_ROM_element(this, rom_id, index_value, value_witness);
}

/**
 * @brief Initialize a ROM array element with a pair of witness values
 *
 * @param rom_id  ROM array id
 * @param index_value Index in the array
 * @param value_witnesses The witnesses to put in the slot
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::set_ROM_element_pair(const size_t rom_id,
                                                                const size_t index_value,
                                                                const std::array<uint32_t, 2>& value_witnesses)
{
    this->rom_ram_logic.set_ROM_element_pair(this, rom_id, index_value, value_witnesses);
}

/**
 * @brief Read a single element from ROM
 *
 * @param rom_id The index of the array to read from
 * @param index_witness The witness with the index inside the array
 * @return uint32_t Cell value witness index
 */
template <typename ExecutionTrace>
uint32_t UltraCircuitBuilder_<ExecutionTrace>::read_ROM_array(const size_t rom_id, const uint32_t index_witness)
{
    return this->rom_ram_logic.read_ROM_array(this, rom_id, index_witness);
}

/**
 * @brief  Read a pair of elements from ROM
 *
 * @param rom_id The id of the ROM array
 * @param index_witness The witness containing the index in the array
 * @return std::array<uint32_t, 2> A pair of indexes of witness variables of cell values
 */
template <typename ExecutionTrace>
std::array<uint32_t, 2> UltraCircuitBuilder_<ExecutionTrace>::read_ROM_array_pair(const size_t rom_id,
                                                                                  const uint32_t index_witness)
{
    return this->rom_ram_logic.read_ROM_array_pair(this, rom_id, index_witness);
}

/**
 * @brief Poseidon2 external round gate, activates the q_poseidon2_external selector and relation
 */
template <typename FF>
void UltraCircuitBuilder_<FF>::create_poseidon2_external_gate(const poseidon2_external_gate_<FF>& in)
{
    auto& block = this->blocks.poseidon2_external;
    block.populate_wires(in.a, in.b, in.c, in.d);
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][0]);
    block.q_2().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][1]);
    block.q_3().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][2]);
    block.q_c().emplace_back(0);
    block.q_arith().emplace_back(0);
    block.q_4().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][3]);
    block.q_delta_range().emplace_back(0);
    block.q_lookup_type().emplace_back(0);
    block.q_elliptic().emplace_back(0);
    block.q_memory().emplace_back(0);
    block.q_nnf().emplace_back(0);
    block.q_poseidon2_external().emplace_back(1);
    block.q_poseidon2_internal().emplace_back(0);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        block.pad_additional();
    }
    this->check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief Poseidon2 internal round gate, activates the q_poseidon2_internal selector and relation
 */
template <typename FF>
void UltraCircuitBuilder_<FF>::create_poseidon2_internal_gate(const poseidon2_internal_gate_<FF>& in)
{
    auto& block = this->blocks.poseidon2_internal;
    block.populate_wires(in.a, in.b, in.c, in.d);
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][0]);
    block.q_2().emplace_back(0);
    block.q_3().emplace_back(0);
    block.q_c().emplace_back(0);
    block.q_arith().emplace_back(0);
    block.q_4().emplace_back(0);
    block.q_delta_range().emplace_back(0);
    block.q_lookup_type().emplace_back(0);
    block.q_elliptic().emplace_back(0);
    block.q_memory().emplace_back(0);
    block.q_nnf().emplace_back(0);
    block.q_poseidon2_external().emplace_back(0);
    block.q_poseidon2_internal().emplace_back(1);
    if constexpr (HasAdditionalSelectors<ExecutionTrace>) {
        block.pad_additional();
    }
    this->check_selector_length_consistency();
    ++this->num_gates;
}

/**
 * @brief Compute a hash of some of the main circuit components.
 * @note This hash can differ for circuits that will ultimately result in an identical verification key. For example,
 * when we construct circuits from acir programs with dummy witnesses, the hash will in general disagree with the hash
 * of the circuit constructed using a genuine witness. This is not because the hash includes geunines witness values
 * (only indices) but rather because in the dummy witness context we use add_variable and assert_equal to set the values
 * of dummy witnesses, which effects the content of real_variable_index, but in the end results in an identical
 * VK/circuit.
 *
 */
template <typename ExecutionTrace> uint256_t UltraCircuitBuilder_<ExecutionTrace>::hash_circuit() const
{
    // Copy the circuit and finalize without modifying the original
    auto circuit = *this;
    circuit.finalize_circuit(/*ensure_nonzero=*/false);

    std::vector<uint8_t> to_hash;
    const auto convert_and_insert = [&to_hash](auto& vector) {
        std::vector<uint8_t> buffer = to_buffer(vector);
        to_hash.insert(to_hash.end(), buffer.begin(), buffer.end());
    };

    // Hash the selectors, the wires, and the variable index array (which captures information about copy constraints)
    for (auto& block : blocks.get()) {
        std::for_each(block.selectors.begin(), block.selectors.end(), convert_and_insert);
        std::for_each(block.wires.begin(), block.wires.end(), convert_and_insert);
    }
    convert_and_insert(circuit.real_variable_index);

    return from_buffer<uint256_t>(crypto::sha256(to_hash));
}

/**
 * Export the existing circuit as msgpack compatible buffer.
 * Should be called after `finalize_circuit()`
 *
 * @return msgpack compatible buffer
 */
template <typename ExecutionTrace> msgpack::sbuffer UltraCircuitBuilder_<ExecutionTrace>::export_circuit()
{
    // You should not name `zero` by yourself
    // but it will be rewritten anyway
    auto first_zero_idx = this->get_first_variable_in_class(this->zero_idx);
    if (!this->variable_names.contains(first_zero_idx)) {
        this->set_variable_name(this->zero_idx, "zero");
    } else {
        this->variable_names[first_zero_idx] = "zero";
    }
    using base = CircuitBuilderBase<FF>;
    CircuitSchemaInternal<FF> cir;

    std::array<uint64_t, 4> modulus = {
        FF::Params::modulus_0, FF::Params::modulus_1, FF::Params::modulus_2, FF::Params::modulus_3
    };
    std::stringstream buf;
    buf << std::hex << std::setfill('0') << std::setw(16) << modulus[3] << std::setw(16) << modulus[2] << std::setw(16)
        << modulus[1] << std::setw(16) << modulus[0];

    cir.modulus = buf.str();

    for (uint32_t i = 0; i < this->num_public_inputs(); i++) {
        cir.public_inps.push_back(this->real_variable_index[this->public_inputs()[i]]);
    }

    for (auto& tup : base::variable_names) {
        cir.vars_of_interest.insert({ this->real_variable_index[tup.first], tup.second });
    }

    for (const auto& var : this->get_variables()) {
        cir.variables.push_back(var);
    }

    FF curve_b;
    if constexpr (FF::modulus == bb::fq::modulus) {
        curve_b = bb::g1::curve_b;
    } else if constexpr (FF::modulus == grumpkin::fq::modulus) {
        curve_b = grumpkin::g1::curve_b;
    } else {
        curve_b = 0;
    }

    for (auto& block : blocks.get()) {
        std::vector<std::vector<FF>> block_selectors;
        std::vector<std::vector<uint32_t>> block_wires;
        for (size_t idx = 0; idx < block.size(); ++idx) {
            std::vector<FF> tmp_sel = { block.q_m()[idx],
                                        block.q_1()[idx],
                                        block.q_2()[idx],
                                        block.q_3()[idx],
                                        block.q_4()[idx],
                                        block.q_c()[idx],
                                        block.q_arith()[idx],
                                        block.q_delta_range()[idx],
                                        block.q_elliptic()[idx],
                                        block.q_memory()[idx],
                                        block.q_nnf()[idx],
                                        block.q_lookup_type()[idx],
                                        curve_b };

            std::vector<uint32_t> tmp_w = {
                this->real_variable_index[block.w_l()[idx]],
                this->real_variable_index[block.w_r()[idx]],
                this->real_variable_index[block.w_o()[idx]],
                this->real_variable_index[block.w_4()[idx]],
            };

            if (idx < block.size() - 1) {
                tmp_w.push_back(block.w_l()[idx + 1]);
                tmp_w.push_back(block.w_r()[idx + 1]);
                tmp_w.push_back(block.w_o()[idx + 1]);
                tmp_w.push_back(block.w_4()[idx + 1]);
            } else {
                tmp_w.push_back(0);
                tmp_w.push_back(0);
                tmp_w.push_back(0);
                tmp_w.push_back(0);
            }

            block_selectors.push_back(tmp_sel);
            block_wires.push_back(tmp_w);
        }
        cir.selectors.push_back(block_selectors);
        cir.wires.push_back(block_wires);
    }

    cir.real_variable_index = this->real_variable_index;

    for (const auto& table : this->lookup_tables) {
        const FF table_index(table.table_index);
        info("Table no: ", table.table_index);
        std::vector<std::vector<FF>> tmp_table;
        for (size_t i = 0; i < table.size(); ++i) {
            tmp_table.push_back({ table.column_1[i], table.column_2[i], table.column_3[i] });
        }
        cir.lookup_tables.push_back(tmp_table);
    }

    cir.real_variable_tags = this->real_variable_tags;

    for (const auto& list : range_lists) {
        cir.range_tags[list.second.range_tag] = list.first;
    }

    for (auto& rom_table : this->rom_ram_logic.rom_arrays) {
        std::sort(rom_table.records.begin(), rom_table.records.end());

        std::vector<std::vector<uint32_t>> table;
        table.reserve(rom_table.records.size());
        for (const auto& rom_entry : rom_table.records) {
            table.push_back({
                this->real_variable_index[rom_entry.index_witness],
                this->real_variable_index[rom_entry.value_column1_witness],
                this->real_variable_index[rom_entry.value_column2_witness],
            });
        }
        cir.rom_records.push_back(table);
        cir.rom_states.push_back(rom_table.state);
    }

    for (auto& ram_table : this->rom_ram_logic.ram_arrays) {
        std::sort(ram_table.records.begin(), ram_table.records.end());

        std::vector<std::vector<uint32_t>> table;
        table.reserve(ram_table.records.size());
        for (const auto& ram_entry : ram_table.records) {
            table.push_back({ this->real_variable_index[ram_entry.index_witness],
                              this->real_variable_index[ram_entry.value_witness],
                              this->real_variable_index[ram_entry.timestamp_witness],
                              ram_entry.access_type });
        }
        cir.ram_records.push_back(table);
        cir.ram_states.push_back(ram_table.state);
    }

    cir.circuit_finalized = this->circuit_finalized;

    msgpack::sbuffer buffer;
    msgpack::pack(buffer, cir);
    return buffer;
}

template class UltraCircuitBuilder_<UltraExecutionTraceBlocks>;
template class UltraCircuitBuilder_<MegaExecutionTraceBlocks>;
// To enable this we need to template plookup
// template class UltraCircuitBuilder_<grumpkin::fr>;

} // namespace bb
