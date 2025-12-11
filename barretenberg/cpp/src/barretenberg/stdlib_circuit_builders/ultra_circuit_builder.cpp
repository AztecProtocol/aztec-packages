// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * @brief This file contains the implementation of field-agnostic UltraCircuitBuilder class that defines the logic
 * of ultra-style circuits and is intended for the use in UltraHonk
 *
 */
#include "ultra_circuit_builder.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/ref_vector.hpp"
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
     *  2. prover_instance::n => the next power of two ≥ total witness size.
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
 * @brief Copy the public input idx data into the public inputs trace block
 */
template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::populate_public_inputs_block()
{
    BB_BENCH_NAME("populate_public_inputs_block");

    // Update the public inputs block
    for (const auto& idx : this->public_inputs()) {
        // first two wires get a copy of the public inputs
        blocks.pub_inputs.populate_wires(idx, idx, this->zero_idx(), this->zero_idx());
        for (auto& selector : this->blocks.pub_inputs.get_selectors()) {
            selector.emplace_back(0);
        }
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
    blocks.arithmetic.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.arithmetic.q_m().emplace_back(1);
    blocks.arithmetic.q_1().emplace_back(1);
    blocks.arithmetic.q_2().emplace_back(1);
    blocks.arithmetic.q_3().emplace_back(1);
    blocks.arithmetic.q_4().emplace_back(1);
    blocks.arithmetic.q_c().emplace_back(0);
    blocks.arithmetic.set_gate_selector(0);
    check_selector_length_consistency();
    this->increment_num_gates();

    // q_delta_range
    blocks.delta_range.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.delta_range.q_m().emplace_back(0);
    blocks.delta_range.q_1().emplace_back(0);
    blocks.delta_range.q_2().emplace_back(0);
    blocks.delta_range.q_3().emplace_back(0);
    blocks.delta_range.q_4().emplace_back(0);
    blocks.delta_range.q_c().emplace_back(0);
    blocks.delta_range.set_gate_selector(1);

    check_selector_length_consistency();
    this->increment_num_gates();
    create_unconstrained_gate(
        blocks.delta_range, this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());

    // q_elliptic
    blocks.elliptic.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.elliptic.q_m().emplace_back(0);
    blocks.elliptic.q_1().emplace_back(0);
    blocks.elliptic.q_2().emplace_back(0);
    blocks.elliptic.q_3().emplace_back(0);
    blocks.elliptic.q_4().emplace_back(0);
    blocks.elliptic.q_c().emplace_back(0);
    blocks.elliptic.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();
    create_unconstrained_gate(blocks.elliptic, this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());

    // q_memory
    blocks.memory.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.memory.q_m().emplace_back(0);
    blocks.memory.q_1().emplace_back(0);
    blocks.memory.q_2().emplace_back(0);
    blocks.memory.q_3().emplace_back(0);
    blocks.memory.q_4().emplace_back(0);
    blocks.memory.q_c().emplace_back(0);
    blocks.memory.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();
    create_unconstrained_gate(blocks.memory, this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());

    // q_nnf
    blocks.nnf.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.nnf.q_m().emplace_back(0);
    blocks.nnf.q_1().emplace_back(0);
    blocks.nnf.q_2().emplace_back(0);
    blocks.nnf.q_3().emplace_back(0);
    blocks.nnf.q_4().emplace_back(0);
    blocks.nnf.q_c().emplace_back(0);
    blocks.nnf.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();
    create_unconstrained_gate(blocks.nnf, this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());

    // Add nonzero values in w_4 and q_c (q_4*w_4 + q_c --> 1*1 - 1 = 0)
    uint32_t one_idx = put_constant_variable(FF::one());
    create_big_add_gate({ this->zero_idx(), this->zero_idx(), this->zero_idx(), one_idx, 0, 0, 0, 1, -1 });

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
        update_used_witnesses(column);
        update_finalize_witnesses(column);
    }

    // mock a poseidon external gate, with all zeros as input
    blocks.poseidon2_external.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.poseidon2_external.q_m().emplace_back(0);
    blocks.poseidon2_external.q_1().emplace_back(0);
    blocks.poseidon2_external.q_2().emplace_back(0);
    blocks.poseidon2_external.q_3().emplace_back(0);
    blocks.poseidon2_external.q_c().emplace_back(0);
    blocks.poseidon2_external.q_4().emplace_back(0);
    blocks.poseidon2_external.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();

    // unconstrained gate to be read into by previous poseidon external gate via shifts
    create_unconstrained_gate(
        blocks.poseidon2_external, this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());

    // mock a poseidon internal gate, with all zeros as input
    blocks.poseidon2_internal.populate_wires(this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.poseidon2_internal.q_m().emplace_back(0);
    blocks.poseidon2_internal.q_1().emplace_back(0);
    blocks.poseidon2_internal.q_2().emplace_back(0);
    blocks.poseidon2_internal.q_3().emplace_back(0);
    blocks.poseidon2_internal.q_c().emplace_back(0);
    blocks.poseidon2_internal.q_4().emplace_back(0);
    blocks.poseidon2_internal.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();

    // dummy gate to be read into by previous poseidon internal gate via shifts
    create_unconstrained_gate(
        blocks.poseidon2_internal, this->zero_idx(), this->zero_idx(), this->zero_idx(), this->zero_idx());
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
    // Delegate to create_big_add_gate with 4th wire set to zero
    create_big_add_gate({ .a = in.a,
                          .b = in.b,
                          .c = in.c,
                          .d = this->zero_idx(),
                          .a_scaling = in.a_scaling,
                          .b_scaling = in.b_scaling,
                          .c_scaling = in.c_scaling,
                          .d_scaling = 0,
                          .const_scaling = in.const_scaling });
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
    // If include_next_gate_w_4 is true then we set q_arith = 2. In this case, the linear term in the ArithmeticRelation
    // is scaled by a factor of 2. We compensate here by scaling the quadratic term by 2 to achieve the constraint:
    //      2 * [q_m * w_1 * w_2 + \sum_{i=1..4} q_i * w_i + q_c + w_4_shift] = 0
    const FF mul_scaling = include_next_gate_w_4 ? in.mul_scaling * FF(2) : in.mul_scaling;
    blocks.arithmetic.q_m().emplace_back(mul_scaling);
    blocks.arithmetic.q_1().emplace_back(in.a_scaling);
    blocks.arithmetic.q_2().emplace_back(in.b_scaling);
    blocks.arithmetic.q_3().emplace_back(in.c_scaling);
    blocks.arithmetic.q_c().emplace_back(in.const_scaling);
    blocks.arithmetic.q_4().emplace_back(in.d_scaling);
    blocks.arithmetic.set_gate_selector(include_next_gate_w_4 ? 2 : 1);
    check_selector_length_consistency();
    this->increment_num_gates();
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
    blocks.arithmetic.q_4().emplace_back(in.d_scaling);
    blocks.arithmetic.set_gate_selector(include_next_gate_w_4 ? 2 : 1);
    check_selector_length_consistency();
    this->increment_num_gates();
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

    blocks.arithmetic.populate_wires(variable_index, variable_index, this->zero_idx(), this->zero_idx());
    blocks.arithmetic.q_m().emplace_back(1);
    blocks.arithmetic.q_1().emplace_back(-1);
    blocks.arithmetic.q_2().emplace_back(0);
    blocks.arithmetic.q_3().emplace_back(0);
    blocks.arithmetic.q_c().emplace_back(0);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();
}

/**
 * @brief A plonk gate with disabled (set to zero) fourth wire. q_m * a * b + q_1 * a + q_2 * b + q_3
 * * c + q_const = 0
 *
 * @param in Structure containing variables and witness selectors
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_arithmetic_gate(const arithmetic_triple_<FF>& in)
{
    this->assert_valid_variables({ in.a, in.b, in.c });

    blocks.arithmetic.populate_wires(in.a, in.b, in.c, this->zero_idx());
    blocks.arithmetic.q_m().emplace_back(in.q_m);
    blocks.arithmetic.q_1().emplace_back(in.q_l);
    blocks.arithmetic.q_2().emplace_back(in.q_r);
    blocks.arithmetic.q_3().emplace_back(in.q_o);
    blocks.arithmetic.q_c().emplace_back(in.q_c);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();
}

/**
 * @brief Create an elliptic curve addition gate
 * @details Adds either one or two gates. In general, this method creates two gates with the following structure:
 *
 *      | q_ecc | w1  | w2  | w3  | w4  |
 *      |-------|-----|-----|-----|-----|
 *      |    1  |  -  | x1  | y1  |  -  | --> constrained
 *      |    0  | x2  | x3  | y3  | y2  | --> "unconstrained" (utilized by previous gate via shifts)
 *
 * However, if the "output" of the previous gate is equal to the "input" of the current gate, i.e. (x3, y3)_{i-1} ==
 * (x1, y1)_i, we can fuse them together by simply setting the selector values of the previous gate {i-1} to q_ecc = 1
 * and q_1 = sign_coefficient (which in the relation translates to q_sign). We take advantage of this frequently when
 * performing chained additions or doubling operations.
 *
 * @param in Elliptic curve point addition gate parameters
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_ecc_add_gate(const ecc_add_gate_<FF>& in)
{
    this->assert_valid_variables({ in.x1, in.x2, in.x3, in.y1, in.y2, in.y3 });

    auto& block = blocks.elliptic;

    // Determine whether we can fuse this addition operation into the previous gate in the block
    bool can_fuse_into_previous_gate =
        block.size() > 0 &&                       /* a previous gate exists in the block */
        block.w_r()[block.size() - 1] == in.x1 && /* output x coord of previous gate is input of this one */
        block.w_o()[block.size() - 1] == in.y1;   /* output y coord of previous gate is input of this one */

    if (can_fuse_into_previous_gate) {
        block.q_1().set(block.size() - 1, in.sign_coefficient); // set q_sign of previous gate
        block.q_elliptic().set(block.size() - 1, 1);            // set q_ecc of previous gate to 1
    } else {
        block.populate_wires(this->zero_idx(), in.x1, in.y1, this->zero_idx());
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_1().emplace_back(in.sign_coefficient);

        block.q_2().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.set_gate_selector(1);
        check_selector_length_consistency();
        this->increment_num_gates();
    }
    // Create the unconstrained gate with the output of the doubling to be read into by the previous gate via shifts
    create_unconstrained_gate(block, in.x2, in.x3, in.y3, in.y2);
}

/**
 * @brief Create an elliptic curve doubling gate
 * @details Adds either one or two gates. In general, this method creates two gates with the following structure:
 *
 *      | q_ecc | w1  | w2  | w3  | w4  |
 *      |-------|-----|-----|-----|-----|
 *      |    1  |  -  | x1  | y1  |  -  | --> constrained
 *      |    0  |  -  | x3  | y3  |  -  | --> "unconstrained" (utilized by previous gate via shifts)
 *
 * However, if the "output" of the previous gate is equal to the "input" of the current gate, i.e. (x3, y3)_{i-1} ==
 * (x1, y1)_i, we can fuse them together by simply setting the selector values of the previous gate {i-1} to q_ecc = 1
 * and q_m = 1 (which in the relation translates to q_is_double = 1). We take advantage of this frequently when
 * performing chained additions or doubling operations.
 *
 * @param in Elliptic curve point doubling gate parameters
 */
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_ecc_dbl_gate(const ecc_dbl_gate_<FF>& in)
{
    this->assert_valid_variables({ in.x1, in.x3, in.y1, in.y3 });

    auto& block = blocks.elliptic;

    // Determine whether we can fuse this doubling operation into the previous gate in the block
    bool can_fuse_into_previous_gate =
        block.size() > 0 &&                       /* a previous gate exists in the block */
        block.w_r()[block.size() - 1] == in.x1 && /* output x coord of previous gate is input of this one */
        block.w_o()[block.size() - 1] == in.y1;   /* output y coord of previous gate is input of this one */

    // If possible, update the previous gate to be the first gate in the pair, otherwise create a new gate
    if (can_fuse_into_previous_gate) {
        block.q_elliptic().set(block.size() - 1, 1); // set q_ecc of previous gate to 1
        block.q_m().set(block.size() - 1, 1);        // set q_m (q_is_double) of previous gate to 1
    } else {
        block.populate_wires(this->zero_idx(), in.x1, in.y1, this->zero_idx());
        block.q_m().emplace_back(1);
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_4().emplace_back(0);
        block.set_gate_selector(1);
        check_selector_length_consistency();
        this->increment_num_gates();
    }
    // Create the unconstrained gate with the output of the doubling to be read into by the previous gate via shifts
    create_unconstrained_gate(block, this->zero_idx(), in.x3, in.y3, this->zero_idx());
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

    blocks.arithmetic.populate_wires(witness_index, this->zero_idx(), this->zero_idx(), this->zero_idx());
    blocks.arithmetic.q_m().emplace_back(0);
    blocks.arithmetic.q_1().emplace_back(1);
    blocks.arithmetic.q_2().emplace_back(0);
    blocks.arithmetic.q_3().emplace_back(0);
    blocks.arithmetic.q_c().emplace_back(-witness_value);
    blocks.arithmetic.q_4().emplace_back(0);
    blocks.arithmetic.set_gate_selector(1);
    check_selector_length_consistency();
    this->increment_num_gates();
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
 * @brief Create gates from pre-computed accumulator values which simultaneously establish individual basic-table
 * lookups and the reconstruction of the desired result from those components.
 *
 * @details To perform a lookup, we often need to decompose inputs into smaller "limbs", look up each limb in a
 * BasicTable, then reconstruct the result. E.g., to perform a 32-bit XOR, we decompose into 6-bit limbs, look up each
 * limb's XOR in a 6-bit XOR table, then reconstruct the full 32-bit XOR from those.
 *
 * This method creates a sequence of lookup gates that simultaneously establish (1) the individual BasicTable lookups,
 * and (2) the reconstruction of the final result from the results of the BasicTable lookups. This is done via an
 * accumulator pattern where the wires in each gate store accumulated sums and we use step size coefficients (stored in
 * q_2, q_m, q_c) to extract actual table entries via an expression of the form `derived_entry_i = w_i - step_size_i *
 * w_i_shift` where w_i is the wire value at the current row, w_i_shift is the wire value at the next row.
 *
 * The last lookup has zero step size coefficients (q_2 = q_m = q_c = 0) because there's no next accumulator to
 * subtract; its wire values already contain the raw slices.
 *
 * @param id MultiTable identifier specifying which lookup operation to perform
 * @param read_values Pre-computed accumulator values and lookup entries from plookup::get_lookup_accumulators
 * @param key_a_index Witness index for first input; reused in first lookup gate to avoid creating duplicate variables
 * @param key_b_index Optional witness index for second input (2-to-1 lookups); reused in first lookup if provided
 *
 * @return ReadData<uint32_t> containing witness indices for all created gates. Primary use: [C3][0] contains the
 * result of the lookup operation. All indices are returned (not just the result) because some algorithms like SHA256
 * need access to the intermediate decomposed limb values.
 */
template <typename ExecutionTrace>
plookup::ReadData<uint32_t> UltraCircuitBuilder_<ExecutionTrace>::create_gates_from_plookup_accumulators(
    const plookup::MultiTableId& id,
    const plookup::ReadData<FF>& read_values,
    const uint32_t key_a_index,
    std::optional<uint32_t> key_b_index)
{
    using plookup::ColumnIdx;

    const auto& multi_table = plookup::get_multitable(id);
    const size_t num_lookups = read_values[ColumnIdx::C1].size();
    plookup::ReadData<uint32_t> read_data;

    for (size_t i = 0; i < num_lookups; ++i) {
        const bool is_first_lookup = (i == 0);
        const bool is_last_lookup = (i == num_lookups - 1);

        // Get basic lookup table; construct and add to builder.lookup_tables if not already present
        plookup::BasicTable& table = get_table(multi_table.basic_table_ids[i]);
        table.lookup_gates.emplace_back(read_values.lookup_entries[i]);

        // Create witness variables: first lookup reuses user's input indices, subsequent create new variables
        const auto first_idx = is_first_lookup ? key_a_index : this->add_variable(read_values[ColumnIdx::C1][i]);
        const auto second_idx = (is_first_lookup && key_b_index.has_value())
                                    ? *key_b_index
                                    : this->add_variable(read_values[ColumnIdx::C2][i]);
        const auto third_idx = this->add_variable(read_values[ColumnIdx::C3][i]);

        read_data[ColumnIdx::C1].push_back(first_idx);
        read_data[ColumnIdx::C2].push_back(second_idx);
        read_data[ColumnIdx::C3].push_back(third_idx);
        this->assert_valid_variables({ first_idx, second_idx, third_idx });

        // Populate lookup gate: wire values and selectors
        blocks.lookup.populate_wires(first_idx, second_idx, third_idx, this->zero_idx());
        blocks.lookup.set_gate_selector(1);                      // mark as lookup gate
        blocks.lookup.q_3().emplace_back(FF(table.table_index)); // unique table identifier
        // Step size coefficients: zero for last lookup (no next accumulator), negative step sizes otherwise
        blocks.lookup.q_2().emplace_back(is_last_lookup ? 0 : -multi_table.column_1_step_sizes[i + 1]);
        blocks.lookup.q_m().emplace_back(is_last_lookup ? 0 : -multi_table.column_2_step_sizes[i + 1]);
        blocks.lookup.q_c().emplace_back(is_last_lookup ? 0 : -multi_table.column_3_step_sizes[i + 1]);
        blocks.lookup.q_1().emplace_back(0); // unused
        blocks.lookup.q_4().emplace_back(0); // unused

        check_selector_length_consistency();
        this->increment_num_gates();
    }
    return read_data;
}

/**
 * Range constraint methods
 **/
template <typename ExecutionTrace>
typename UltraCircuitBuilder_<ExecutionTrace>::RangeList UltraCircuitBuilder_<ExecutionTrace>::create_range_list(
    const uint64_t target_range)
{
    RangeList result;
    const auto range_tag = get_new_tag();
    const auto tau_tag = get_new_tag();
    set_tau_transposition(range_tag, tau_tag);
    result.target_range = target_range;
    result.range_tag = range_tag;
    result.tau_tag = tau_tag;

    uint64_t num_multiples_of_three = (target_range / DEFAULT_PLOOKUP_RANGE_STEP_SIZE);
    // allocate the minimum number of variable indices required for the range constraint. this function is only called
    // when we are create a range constraint on a witness index, which is responsible for the extra + 1.
    result.variable_indices.reserve(static_cast<uint32_t>(num_multiples_of_three + 3));
    for (uint64_t i = 0; i <= num_multiples_of_three; ++i) {
        const uint32_t index = this->add_variable(fr(i * DEFAULT_PLOOKUP_RANGE_STEP_SIZE));
        result.variable_indices.emplace_back(index);
        assign_tag(index, result.range_tag);
    }
    // `target_range` may not be divisible by 3, so we explicitly add it also.
    {
        const uint32_t index = this->add_variable(fr(target_range));
        result.variable_indices.emplace_back(index);
        assign_tag(index, result.range_tag);
    }
    // Need this because these variables will not appear in the witness otherwise
    create_unconstrained_gates(result.variable_indices);

    return result;
}

template <typename ExecutionTrace>
std::vector<uint32_t> UltraCircuitBuilder_<ExecutionTrace>::create_limbed_range_constraint(
    const uint32_t variable_index, const uint64_t num_bits, const uint64_t target_range_bitnum, std::string const& msg)
{
    this->assert_valid_variables({ variable_index });
    // make sure `num_bits` satisfies the correct bounds
    BB_ASSERT_GT(num_bits, 0U);
    BB_ASSERT_GTE(grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH, num_bits);

    uint256_t val = (uint256_t)(this->get_variable(variable_index));

    // If the value is out of range, set the CircuitBuilder error to the given msg.
    if (val.get_msb() >= num_bits && !this->failed()) {
        this->failure(msg);
    }

    // compute limb structure
    const uint64_t sublimb_mask = (1ULL << target_range_bitnum) - 1;

    std::vector<uint64_t> sublimbs;
    std::vector<uint32_t> sublimb_indices;

    const bool has_remainder_bits = (num_bits % target_range_bitnum != 0);
    const uint64_t num_limbs = (num_bits / target_range_bitnum) + has_remainder_bits;
    const uint64_t last_limb_size = num_bits - ((num_bits / target_range_bitnum) * target_range_bitnum);
    const uint64_t last_limb_range = ((uint64_t)1 << last_limb_size) - 1;

    // extract limbs from the value
    uint256_t accumulator = val;
    for (size_t i = 0; i < num_limbs; ++i) {
        sublimbs.push_back(accumulator.data[0] & sublimb_mask);
        accumulator = accumulator >> target_range_bitnum;
    }
    // set the correct range constraint on each limb. note that when there are remainder bits, the last limb must be
    // constrained to a smaller range.
    const size_t num_full_limbs = has_remainder_bits ? sublimbs.size() - 1 : sublimbs.size();
    for (size_t i = 0; i < num_full_limbs; ++i) {
        const auto limb_idx = this->add_variable(bb::fr(sublimbs[i]));
        sublimb_indices.emplace_back(limb_idx);
        create_small_range_constraint(limb_idx, sublimb_mask);
    }
    if (has_remainder_bits) {
        const auto limb_idx = this->add_variable(bb::fr(sublimbs.back()));
        sublimb_indices.emplace_back(limb_idx);
        create_small_range_constraint(limb_idx, last_limb_range);
    }

    // Prove that the limbs reconstruct the original value by processing limbs in groups of 3.
    // We constrain: value = sum_{j=0}^{num_limbs-1} limb[j] * 2^(j * target_range_bitnum)
    //
    // Each iteration subtracts 3 limbs' contributions from an accumulator (starting at `val`),
    // and constrains that the accumulator updates correctly via an arithmetic gate.
    const uint64_t num_limb_triples = (num_limbs / 3) + ((num_limbs % 3) != 0);
    // `leftovers` is the number of real limbs in the final triple (1, 2, or 3).
    const uint64_t leftovers = (num_limbs % 3) == 0 ? 3 : (num_limbs % 3);

    accumulator = val;
    uint32_t accumulator_idx = variable_index;
    // loop goes from `i = 0` to `num_limb_triples`, but some special case must be taken for the last triple (`i ==
    // num_limb_triples - 1`), hence some conditional logic.
    for (size_t i = 0; i < num_limb_triples; ++i) {
        // `real_limbs` which limb positions in this triple contain actual limbs vs zero-padding.
        // When `i == num_limb_triples - 1`, some positions may be unused if `num_limbs` isn't divisible by 3.
        const bool real_limbs[3]{
            !(i == (num_limb_triples - 1) && (leftovers < 1)),
            !(i == (num_limb_triples - 1) && (leftovers < 2)),
            !(i == (num_limb_triples - 1) && (leftovers < 3)),
        };

        // The witness values of the 3 limbs in this triple (0 for padding positions).
        const uint64_t round_sublimbs[3]{
            real_limbs[0] ? sublimbs[3 * i] : 0,
            real_limbs[1] ? sublimbs[3 * i + 1] : 0,
            real_limbs[2] ? sublimbs[3 * i + 2] : 0,
        };
        // The witnesss indices of the current 3 limbs (zero_idx for padding positions).
        const uint32_t new_limbs[3]{
            real_limbs[0] ? sublimb_indices[3 * i] : this->zero_idx(),
            real_limbs[1] ? sublimb_indices[3 * i + 1] : this->zero_idx(),
            real_limbs[2] ? sublimb_indices[3 * i + 2] : this->zero_idx(),
        };
        // Bit-shifts for each limb: limb[3*i+k] contributes at bit position (3*i+k) * target_range_bitnum.
        const uint64_t shifts[3]{
            target_range_bitnum * (3 * i),
            target_range_bitnum * (3 * i + 1),
            target_range_bitnum * (3 * i + 2),
        };
        // Compute the new accumulator after subtracting this triple's contribution.
        // After the final iteration, accumulator should be 0.
        uint256_t new_accumulator = accumulator - (uint256_t(round_sublimbs[0]) << shifts[0]) -
                                    (uint256_t(round_sublimbs[1]) << shifts[1]) -
                                    (uint256_t(round_sublimbs[2]) << shifts[2]);

        // This `big_add_gate` has differing behavior depending on whether or not `i == num_limb_triples - 1`.
        // If `i != num_limb_triples - 1`, then the constraint will be limb[0]*2^shift[0] + limb[1]*2^shift[1] +
        // limb[2]*2^shift[2] - acc = new_accumulator (the last argument to `create_big_add_gate` is `true`, means the
        // sum is w_4-shift, which will be the witness corresponding to what is currently `new_accumulator`.).
        // If `i == num_limb_triples - 1`, then the last argument to `create_big_add_gate` is false, so the constraint
        // is limb[0]*2^shift[0] + limb[1]*2^shift[1] + limb[2]*2^shift[2] - acc = 0.
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
            (i != num_limb_triples - 1));
        if (i != num_limb_triples - 1) {
            accumulator_idx = this->add_variable(fr(new_accumulator));
            accumulator = new_accumulator;
        }
    }
    return sublimb_indices;
}

template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_small_range_constraint(const uint32_t variable_index,
                                                                         const uint64_t target_range,
                                                                         std::string const msg)
{
    // make sure `target_range` is not too big.
    BB_ASSERT_GTE(DEFAULT_PLOOKUP_RANGE_SIZE, target_range);
    const bool is_out_of_range = (uint256_t(this->get_variable(variable_index)).data[0] > target_range);
    if (is_out_of_range && !this->failed()) {
        this->failure(msg);
    }
    if (range_lists.count(target_range) == 0) {
        range_lists.insert({ target_range, create_range_list(target_range) });
    }
    // The tag of `variable_index` is `DUMMY_TAG` if it has never been range-constrained and a non-trivial value
    // otherwise.
    const auto existing_tag = this->real_variable_tags[this->real_variable_index[variable_index]];
    auto& list = range_lists[target_range];

    // If the variable's tag matches the target range list's tag, do nothing; the variable has _already_ been
    // constrained to this exact range (i.e., `create_new_range_constraint(variable_index, target_range)` has already
    // been called).
    if (existing_tag != list.range_tag) {
        // If the variable is 'untagged' (i.e., it has the dummy tag), assign it the appropriate tag, which amounts to
        // setting the range-constraint. Otherwise, find the range for which the variable has already been tagged.
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
                        // variable and apply a range check to new variable. We do _not_ simply create a
                        // copy-constraint, because that would copy the tag, which exactly corresponds to the old (less
                        // restrictive) range constraint. Instead, we use an arithmetic gate to constrain the value of
                        // the new variable and set the tag (a.k.a. range-constraint) via a new call to
                        // `create_new_range_constraint`.
                        const uint32_t copied_witness = this->add_variable(this->get_variable(variable_index));
                        create_add_gate({ .a = variable_index,
                                          .b = copied_witness,
                                          .c = this->zero_idx(),
                                          .a_scaling = 1,
                                          .b_scaling = -1,
                                          .c_scaling = 0,
                                          .const_scaling = 0 });
                        // Recurse with new witness that has no tag attached.
                        create_small_range_constraint(copied_witness, target_range, msg);
                        return;
                    }
                }
            }
            BB_ASSERT(found_tag);
        }
        assign_tag(variable_index, list.range_tag);
        list.variable_indices.emplace_back(variable_index);
    }
}

template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::process_range_list(RangeList& list)
{
    this->assert_valid_variables(list.variable_indices);

    BB_ASSERT_GT(list.variable_indices.size(), 0U);

    // replace witness-index in variable_indices with the corresponding real-variable-index i.e., if a copy constraint
    // has been applied on a variable after it was range constrained, this makes sure the indices in list point to the
    // updated index in the range list so the set equivalence does not fail
    for (uint32_t& x : list.variable_indices) {
        x = this->real_variable_index[x];
    }
    // Sort `variable_indices` and remove duplicate witness indices to prevent the sorted list set size being wrong!
    std::sort(list.variable_indices.begin(), list.variable_indices.end());
    auto back_iterator = std::unique(list.variable_indices.begin(), list.variable_indices.end());
    list.variable_indices.erase(back_iterator, list.variable_indices.end());

    // go over variables
    // iterate over each (real) variable and create mirror variable with same value - with tau tag
    // need to make sure that, in original list, increments of at most 3
    std::vector<uint32_t> sorted_list;
    sorted_list.reserve(list.variable_indices.size());
    for (const auto variable_index : list.variable_indices) {
        // note that `field_element` is 32 bits as the corresponding witness has a non-trivial range-constraint.
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
        indices.emplace_back(this->zero_idx());
    }
    for (const auto sorted_value : sorted_list) {
        const uint32_t index = this->add_variable(fr(sorted_value));
        assign_tag(index, list.tau_tag);
        indices.emplace_back(index);
    }
    // constrain the _sorted_ list: starts at 0, ends at `target_range`, consecutive differences in {0, 1, 2, 3}.
    create_sort_constraint_with_edges(indices, 0, list.target_range);
}

template <typename ExecutionTrace> void UltraCircuitBuilder_<ExecutionTrace>::process_range_lists()
{
    for (auto& i : range_lists) {
        process_range_list(i.second);
    }
}

template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::enforce_small_deltas(const std::vector<uint32_t>& variable_indices)
{
    constexpr size_t gate_width = NUM_WIRES;
    BB_ASSERT_EQ(variable_indices.size() % gate_width, 0U);
    this->assert_valid_variables(variable_indices);

    for (size_t i = 0; i < variable_indices.size(); i += gate_width) {
        blocks.delta_range.populate_wires(
            variable_indices[i], variable_indices[i + 1], variable_indices[i + 2], variable_indices[i + 3]);

        this->increment_num_gates();
        blocks.delta_range.q_m().emplace_back(0);
        blocks.delta_range.q_1().emplace_back(0);
        blocks.delta_range.q_2().emplace_back(0);
        blocks.delta_range.q_3().emplace_back(0);
        blocks.delta_range.q_c().emplace_back(0);
        blocks.delta_range.q_4().emplace_back(0);
        blocks.delta_range.set_gate_selector(1);
        check_selector_length_consistency();
    }
    // dummy gate needed because of sort widget's check of next row
    create_unconstrained_gate(blocks.delta_range,
                              variable_indices[variable_indices.size() - 1],
                              this->zero_idx(),
                              this->zero_idx(),
                              this->zero_idx());
}

// useful to put variables in the witness that aren't already used - e.g. the dummy variables of the range constraint in
// multiples of four
template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_unconstrained_gates(const std::vector<uint32_t>& variable_index)
{
    std::vector<uint32_t> padded_list = variable_index;
    constexpr size_t gate_width = NUM_WIRES;
    const uint64_t padding = (gate_width - (padded_list.size() % gate_width)) % gate_width;
    for (uint64_t i = 0; i < padding; ++i) {
        padded_list.emplace_back(this->zero_idx());
    }
    this->assert_valid_variables(variable_index);
    this->assert_valid_variables(padded_list);

    for (size_t i = 0; i < padded_list.size(); i += gate_width) {
        create_unconstrained_gate(
            blocks.arithmetic, padded_list[i], padded_list[i + 1], padded_list[i + 2], padded_list[i + 3]);
    }
}

template <typename ExecutionTrace>
void UltraCircuitBuilder_<ExecutionTrace>::create_sort_constraint_with_edges(
    const std::vector<uint32_t>& variable_indices, const FF& start, const FF& end)
{
    // Convenient to assume size is at least 8 (gate_width = 4) for separate gates for start and end conditions
    constexpr size_t gate_width = NUM_WIRES;
    BB_ASSERT_EQ(variable_indices.size() % gate_width, 0U);
    BB_ASSERT_GT(variable_indices.size(), gate_width);
    this->assert_valid_variables(variable_indices);
    // only work with the delta_range block. this forces: `w_2 - w_1`, `w_3 - w_2`, `w_4 - w_3`, and `w_1_shift - w_4`
    // to be in {0, 1, 2, 3}.
    auto& block = blocks.delta_range;

    // Add an arithmetic gate to ensure the first input is equal to the start value of the range being checked
    create_add_gate({ variable_indices[0], this->zero_idx(), this->zero_idx(), 1, 0, 0, -start });

    // enforce delta range relation for all rows (there are `variabe_indices.size() / gate_width`). note that there are
    // at least two rows.
    for (size_t i = 0; i < variable_indices.size(); i += gate_width) {

        block.populate_wires(
            variable_indices[i], variable_indices[i + 1], variable_indices[i + 2], variable_indices[i + 3]);
        this->increment_num_gates();
        block.q_m().emplace_back(0);
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_4().emplace_back(0);
        block.set_gate_selector(1);
        check_selector_length_consistency();
    }

    // NOTE(https://github.com/AztecProtocol/barretenberg/issues/879): Optimisation opportunity to use a single gate
    // (and remove dummy gate). This used to be a single gate before trace sorting based on gate types. The dummy gate
    // has been added to allow the previous gate to access the required wire data via shifts, allowing the arithmetic
    // gate to occur out of sequence. More details on the linked Github issue.
    create_unconstrained_gate(
        block, variable_indices[variable_indices.size() - 1], this->zero_idx(), this->zero_idx(), this->zero_idx());
    // arithmetic gate to constrain that `variable_indices[last] == end`, i.e., verify the boundary condition.
    create_add_gate(
        { variable_indices[variable_indices.size() - 1], this->zero_idx(), this->zero_idx(), 1, 0, 0, -end });
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
    block.set_gate_selector(type == MEMORY_SELECTORS::MEM_NONE ? 0 : 1);
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
        block.q_3().emplace_back(1);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
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
        check_selector_length_consistency();
        break;
    }
    case MEMORY_SELECTORS::ROM_READ: {
        // Memory read gate for reading memory cells. Also used for the _initialization_ of ROM memory cells.
        // Validates record witness computation (r = read_write_flag + index * \eta + timestamp * \eta^2 + value *
        // \eta^3)
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        block.q_4().emplace_back(0);
        block.q_m().emplace_back(1); // validate record witness is correctly computed
        block.q_c().emplace_back(0); // read/write flag stored in q_c
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
    block.set_gate_selector(type == NNF_SELECTORS::NNF_NONE ? 0 : 1);
    switch (type) {
    case NNF_SELECTORS::LIMB_ACCUMULATE_1: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(1);
        block.q_4().emplace_back(1);
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
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
                                                                     const size_t hi_limb_bits,
                                                                     std::string const& msg)
{
    // Validate limbs are <= 70 bits. If limbs are larger we require more witnesses and cannot use our limb accumulation
    // custom gate
    BB_ASSERT_LTE(lo_limb_bits, 14U * 5U);
    BB_ASSERT_LTE(hi_limb_bits, 14U * 5U);

    // If the value is larger than the range, we log the error in builder
    const bool is_lo_out_of_range = (uint256_t(this->get_variable(lo_idx)) >= (uint256_t(1) << lo_limb_bits));
    if (is_lo_out_of_range && !this->failed()) {
        this->failure(msg + ": lo limb.");
    }
    const bool is_hi_out_of_range = (uint256_t(this->get_variable(hi_idx)) >= (uint256_t(1) << hi_limb_bits));
    if (is_hi_out_of_range && !this->failed()) {
        this->failure(msg + ": hi limb.");
    }

    // Sometimes we try to use limbs that are too large. It's easier to catch this issue here
    const auto get_sublimbs = [&](const uint32_t& limb_idx, const std::array<uint64_t, 5>& sublimb_masks) {
        const uint256_t limb = this->get_variable(limb_idx);
        // we can use constant 2^14 - 1 mask here. If the sublimb value exceeds the expected value then witness will
        // fail the range check below
        // We also use zero_idx to substitute variables that should be zero
        constexpr uint256_t MAX_SUBLIMB_MASK = (uint256_t(1) << 14) - 1;
        std::array<uint32_t, 5> sublimb_indices;
        sublimb_indices[0] = sublimb_masks[0] != 0 ? this->add_variable(fr(limb & MAX_SUBLIMB_MASK)) : this->zero_idx();
        sublimb_indices[1] =
            sublimb_masks[1] != 0 ? this->add_variable(fr((limb >> 14) & MAX_SUBLIMB_MASK)) : this->zero_idx();
        sublimb_indices[2] =
            sublimb_masks[2] != 0 ? this->add_variable(fr((limb >> 28) & MAX_SUBLIMB_MASK)) : this->zero_idx();
        sublimb_indices[3] =
            sublimb_masks[3] != 0 ? this->add_variable(fr((limb >> 42) & MAX_SUBLIMB_MASK)) : this->zero_idx();
        sublimb_indices[4] =
            sublimb_masks[4] != 0 ? this->add_variable(fr((limb >> 56) & MAX_SUBLIMB_MASK)) : this->zero_idx();
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
    this->increment_num_gates(3);

    for (size_t i = 0; i < 5; i++) {
        if (lo_masks[i] != 0) {
            create_small_range_constraint(
                lo_sublimbs[i], lo_masks[i], "ultra_circuit_builder: sublimb of low too large");
        }
        if (hi_masks[i] != 0) {
            create_small_range_constraint(
                hi_sublimbs[i], hi_masks[i], "ultra_circuit_builder: sublimb of hi too large");
        }
    }
};

/**
 * @brief Create gates for a full non-native field multiplication identity a * b = q * p + r
 *
 * @details Creates gates to constrain the non-native field multiplication identity a * b = q * p + r, where a, b, q, r
 * are all emulated non-native field elements that are each split across 4 distinct witness variables.
 *
 * The non-native field modulus, p, is a circuit constant
 *
 * This method creates 8 gates total: 4 non-native field gates to check the limb multiplications, plus 4 arithmetic
 * gates (3 big add gates + 1 unconstrained gate) to validate the quotient and remainder terms.
 *
 * The return values are the witness indices of the two remainder limbs `lo_1, hi_3`
 *
 * N.B.: This method does NOT evaluate the prime field component of non-native field multiplications.
 **/
template <typename ExecutionTrace>
std::array<uint32_t, 2> UltraCircuitBuilder_<ExecutionTrace>::evaluate_non_native_field_multiplication(
    const non_native_multiplication_witnesses<FF>& input)
{
    const auto [a0, a1, a2, a3] = std::array{ this->get_variable(input.a[0]),
                                              this->get_variable(input.a[1]),
                                              this->get_variable(input.a[2]),
                                              this->get_variable(input.a[3]) };
    const auto [b0, b1, b2, b3] = std::array{ this->get_variable(input.b[0]),
                                              this->get_variable(input.b[1]),
                                              this->get_variable(input.b[2]),
                                              this->get_variable(input.b[3]) };
    const auto [q0, q1, q2, q3] = std::array{ this->get_variable(input.q[0]),
                                              this->get_variable(input.q[1]),
                                              this->get_variable(input.q[2]),
                                              this->get_variable(input.q[3]) };
    const auto [r0, r1, r2, r3] = std::array{ this->get_variable(input.r[0]),
                                              this->get_variable(input.r[1]),
                                              this->get_variable(input.r[2]),
                                              this->get_variable(input.r[3]) };
    const auto& p_neg = input.neg_modulus;

    constexpr FF LIMB_SHIFT = uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
    constexpr FF LIMB_RSHIFT = FF(1) / FF(uint256_t(1) << DEFAULT_NON_NATIVE_FIELD_LIMB_BITS);
    constexpr FF LIMB_RSHIFT_2 = FF(1) / FF(uint256_t(1) << (2 * DEFAULT_NON_NATIVE_FIELD_LIMB_BITS));

    // lo_0 = (a0·b0 - r0) + (a1·b0 + a0·b1)·2^L
    FF lo_0 = (a0 * b0 - r0) + (a1 * b0 + a0 * b1) * LIMB_SHIFT;
    // lo_1 = (lo_0 + q0·p0' + (q1·p0' + q0·p1' - r1)·2^L) / 2^2L
    FF lo_1 = (lo_0 + q0 * p_neg[0] + (q1 * p_neg[0] + q0 * p_neg[1] - r1) * LIMB_SHIFT) * LIMB_RSHIFT_2;

    // hi_0 = (a2·b0 + a0·b2) + (a0·b3 + a3·b0 - r3)·2^L
    FF hi_0 = (a2 * b0 + a0 * b2) + (a0 * b3 + a3 * b0 - r3) * LIMB_SHIFT;
    // hi_1 = hi_0 + (a1·b1 - r2) + (a1·b2 + a2·b1)·2^L
    FF hi_1 = hi_0 + (a1 * b1 - r2) + (a1 * b2 + a2 * b1) * LIMB_SHIFT;
    // hi_2 = hi_1 + lo_1 + q2·p0' + (q3·p0' + q2·p1')·2^L
    FF hi_2 = hi_1 + lo_1 + q2 * p_neg[0] + (q3 * p_neg[0] + q2 * p_neg[1]) * LIMB_SHIFT;
    // hi_3 = (hi_2 + q0·p2' + q1·p1' + (q0·p3' + q1·p2')·2^L) / 2^2L
    FF hi_3 = (hi_2 + q0 * p_neg[2] + q1 * p_neg[1] + (q0 * p_neg[3] + q1 * p_neg[2]) * LIMB_SHIFT) * LIMB_RSHIFT_2;

    const uint32_t lo_0_idx = this->add_variable(lo_0);
    const uint32_t lo_1_idx = this->add_variable(lo_1);
    const uint32_t hi_0_idx = this->add_variable(hi_0);
    const uint32_t hi_1_idx = this->add_variable(hi_1);
    const uint32_t hi_2_idx = this->add_variable(hi_2);
    const uint32_t hi_3_idx = this->add_variable(hi_3);

    // Gate 1: big_add_gate to validate lo_1
    // (lo_0 + q_0(p_0 + p_1*2^b) + q_1(p_0*2^b) - (r_1)2^b)2^-2b - lo_1 = 0
    // This constraint requires two rows in the trace: an arithmetic gate plus an unconstrained arithmetic gate
    // containing lo_0 in wire 4 so that the previous gate can access it via shifts. (We cannot use the next nnf gate
    // for this purpose since our trace is sorted by gate type).
    create_big_add_gate({ input.q[0],
                          input.q[1],
                          input.r[1],
                          lo_1_idx,
                          input.neg_modulus[0] + input.neg_modulus[1] * LIMB_SHIFT,
                          input.neg_modulus[0] * LIMB_SHIFT,
                          -LIMB_SHIFT,
                          -LIMB_SHIFT.sqr(),
                          0 },
                        /*include_next_gate_w_4*/ true);
    // Gate 2: unconstrained gate to provide lo_0 via w_4_shift for gate 1
    create_unconstrained_gate(blocks.arithmetic, this->zero_idx(), this->zero_idx(), this->zero_idx(), lo_0_idx);

    //
    // a = (a3 || a2 || a1 || a0) = (a3 * 2^b + a2) * 2^b + (a1 * 2^b + a0)
    // b = (b3 || b2 || b1 || b0) = (b3 * 2^b + b2) * 2^b + (b1 * 2^b + b0)
    //
    // Gate 3: NNF gate to check if lo_0 was computed correctly
    // The gate structure for the nnf gates is as follows:
    //
    // | a1 | b1 | r0 | lo_0 | <-- Gate 3: check lo_0
    // | a0 | b0 | a3 | b3   |
    // | a2 | b2 | r3 | hi_0 |
    // | a1 | b1 | r2 | hi_1 |
    //
    // Constraint: lo_0 = (a1 * b0 + a0 * b1) * 2^b  +  (a0 * b0) - r0
    //              w4 = (w1 * w'2 + w'1 * w2) * 2^b + (w'1 * w'2) - w3
    //
    blocks.nnf.populate_wires(input.a[1], input.b[1], input.r[0], lo_0_idx);
    apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_1);
    this->increment_num_gates();

    //
    // Gate 4: NNF gate to check if hi_0 was computed correctly
    //
    // | a1 | b1 | r0 | lo_0 |
    // | a0 | b0 | a3 | b3   | <-- Gate 4: check hi_0
    // | a2 | b2 | r3 | hi_0 |
    // | a1 | b1 | r2 | hi_1 |
    //
    // Constraint: hi_0 = (a0 * b3 + a3 * b0 - r3) * 2^b + (a0 * b2 + a2 * b0)
    //             w'4 = (w1 * w4 + w2 * w3 - w'3) * 2^b + (w1 * w'2 + w'1 * w2)
    //
    blocks.nnf.populate_wires(input.a[0], input.b[0], input.a[3], input.b[3]);
    apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_2);
    this->increment_num_gates();

    //
    // Gate 5: NNF gate to check if hi_1 was computed correctly
    //
    // | a1 | b1 | r0 | lo_0 |
    // | a0 | b0 | a3 | b3   |
    // | a2 | b2 | r3 | hi_0 | <-- Gate 5: check hi_1
    // | a1 | b1 | r2 | hi_1 |
    //
    // Constraint: hi_1 = hi_0 + (a2 * b1 + a1 * b2) * 2^b + (a1 * b1) - r2
    //             w'4 = w4 + (w1 * w'2 + w'1 * w2) * 2^b + (w'1 * w'2) - w'3
    //
    blocks.nnf.populate_wires(input.a[2], input.b[2], input.r[3], hi_0_idx);
    apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_3);
    this->increment_num_gates();

    //
    // Gate 6: NNF gate with no constraints (q_nnf=0, truly unconstrained)
    // Provides values a[1], b[1], r[2], hi_1 to Gate 5 via shifts (w'1, w'2, w'3, w'4)
    //
    blocks.nnf.populate_wires(input.a[1], input.b[1], input.r[2], hi_1_idx);
    apply_nnf_selectors(NNF_SELECTORS::NNF_NONE);
    this->increment_num_gates();

    //
    // Gate 7: big_add_gate to validate hi_2
    //
    // hi_2 - hi_1 - lo_1 - q[2](p[1].2^b + p[0]) - q[3](p[0].2^b) = 0
    //
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
        /*include_next_gate_w_4*/ true);

    //
    // Gate 8: big_add_gate to validate hi_3 (provides hi_2 in w_4 for gate 7)
    //
    // hi_3 - (hi_2 - q[0](p[3].2^b + p[2]) - q[1](p[2].2^b + p[1])).2^-2b = 0
    //
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
 * @brief Iterates over the cached_non_native_field_multiplication objects, removes duplicates, and instantiates the
 * corresponding constraints
 * @details Intended to be called during circuit finalization.
 *
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

        blocks.nnf.populate_wires(input.a[1], input.b[1], this->zero_idx(), input.lo_0);
        apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_1);
        this->increment_num_gates();

        blocks.nnf.populate_wires(input.a[0], input.b[0], input.a[3], input.b[3]);
        apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_2);
        this->increment_num_gates();

        blocks.nnf.populate_wires(input.a[2], input.b[2], this->zero_idx(), input.hi_0);
        apply_nnf_selectors(NNF_SELECTORS::NON_NATIVE_FIELD_3);
        this->increment_num_gates();

        blocks.nnf.populate_wires(input.a[1], input.b[1], this->zero_idx(), input.hi_1);
        apply_nnf_selectors(NNF_SELECTORS::NNF_NONE);
        this->increment_num_gates();
    }
}

/**
 * @brief Queue the addition of gates constraining the limb-multiplication part of a non native field mul
 * @details i.e. compute the low 204 and high 204 bit components of `a * b` where `a, b` are nnf elements composed of 4
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

    FF lo_0 = a[0] * b[0] + ((a[1] * b[0] + a[0] * b[1]) * LIMB_SHIFT);
    FF hi_0 = a[2] * b[0] + a[0] * b[2] + ((a[0] * b[3] + a[3] * b[0]) * LIMB_SHIFT);
    FF hi_1 = hi_0 + a[1] * b[1] + ((a[1] * b[2] + a[2] * b[1]) * LIMB_SHIFT);

    const uint32_t lo_0_idx = this->add_variable(lo_0);
    const uint32_t hi_0_idx = this->add_variable(hi_0);
    const uint32_t hi_1_idx = this->add_variable(hi_1);

    // Add witnesses into the multiplication cache (duplicates removed during circuit finalization)
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
 * @brief Construct gates for non-native field addition
 * @details Uses special mode of ArithmeticRelation (q_arith = 2 and q_arith = 3) to add two non-native field elements
 * in 4 gates instead of 5.
 **/
template <typename ExecutionTrace>
std::array<uint32_t, 5> UltraCircuitBuilder_<ExecutionTrace>::evaluate_non_native_field_addition(
    add_simple limb0, add_simple limb1, add_simple limb2, add_simple limb3, std::tuple<uint32_t, uint32_t, FF> limbp)
{
    const uint32_t& x_0 = std::get<0>(limb0).first;
    const uint32_t& x_1 = std::get<0>(limb1).first;
    const uint32_t& x_2 = std::get<0>(limb2).first;
    const uint32_t& x_3 = std::get<0>(limb3).first;
    const uint32_t& x_p = std::get<0>(limbp);

    const FF& x_mulconst0 = std::get<0>(limb0).second;
    const FF& x_mulconst1 = std::get<0>(limb1).second;
    const FF& x_mulconst2 = std::get<0>(limb2).second;
    const FF& x_mulconst3 = std::get<0>(limb3).second;

    const uint32_t& y_0 = std::get<1>(limb0).first;
    const uint32_t& y_1 = std::get<1>(limb1).first;
    const uint32_t& y_2 = std::get<1>(limb2).first;
    const uint32_t& y_3 = std::get<1>(limb3).first;
    const uint32_t& y_p = std::get<1>(limbp);

    const FF& y_mulconst0 = std::get<1>(limb0).second;
    const FF& y_mulconst1 = std::get<1>(limb1).second;
    const FF& y_mulconst2 = std::get<1>(limb2).second;
    const FF& y_mulconst3 = std::get<1>(limb3).second;

    // constant additive terms
    const FF& addconst0 = std::get<2>(limb0);
    const FF& addconst1 = std::get<2>(limb1);
    const FF& addconst2 = std::get<2>(limb2);
    const FF& addconst3 = std::get<2>(limb3);
    const FF& addconstp = std::get<2>(limbp);

    // get value of result limbs
    const FF z_0value = (this->get_variable(x_0) * x_mulconst0) + (this->get_variable(y_0) * y_mulconst0) + addconst0;
    const FF z_1value = (this->get_variable(x_1) * x_mulconst1) + (this->get_variable(y_1) * y_mulconst1) + addconst1;
    const FF z_2value = (this->get_variable(x_2) * x_mulconst2) + (this->get_variable(y_2) * y_mulconst2) + addconst2;
    const FF z_3value = (this->get_variable(x_3) * x_mulconst3) + (this->get_variable(y_3) * y_mulconst3) + addconst3;
    const FF z_pvalue = this->get_variable(x_p) + this->get_variable(y_p) + addconstp;

    const uint32_t z_0 = this->add_variable(z_0value);
    const uint32_t z_1 = this->add_variable(z_1value);
    const uint32_t z_2 = this->add_variable(z_2value);
    const uint32_t z_3 = this->add_variable(z_3value);
    const uint32_t z_p = this->add_variable(z_pvalue);

    /**
     * We want to impose the following five constraints:
     *   Limb constraints: z.i = x.i * x_mulconst.i + y.i * y_mulconst.i + addconst.i, for i in [0, 3]
     *   Prime basis limb constraint: z.p = x.p + y.p + addconstp
     *
     *   Wire layout for non-native field addition (z = x + y)
     *
     *   | w_1 | w_2 | w_3 | w_4 | q_arith |
     *   |-----|-----|-----|-----|---------|
     *   | y.p | x.0 | y.0 | x.p |    3    |
     *   | z.p | x.1 | y.1 | z.0 |    2    |
     *   | x.2 | y.2 | z.2 | z.1 |    1    |
     *   | x.3 | y.3 | z.3 | --- |    1    |
     *
     *   Row 0:
     *     - x.0 * x_mulconst.0 + y.0 * y_mulconst.0 - z.0 + addconst.0 = 0 (q_2*w_2 + q_3*w_3 + q_c + w_4_shift = 0)
     *     - x.p + y.p - z.p + addconstp = 0 (w_1 + w_4 - w_1_shift + q_m = 0)
     *   Row 1: x.1 * x_mulconst.1 + y.1 * y_mulconst.1 - z.1 + addconst.1 = 0 (q_2*w_2 + q_3*w_3 + q_c + w_4_shift = 0)
     *   Row 2: x.2 * x_mulconst.2 + y.2 * y_mulconst.2 - z.2 + addconst.2 = 0 (q_1*w_1 + q_2*w_2 + q_3*w_3 + q_c = 0)
     *   Row 3: x.3 * x_mulconst.3 + y.3 * y_mulconst.3 - z.3 + addconst.3 = 0 (q_1*w_1 + q_2*w_2 + q_3*w_3 + q_c = 0)
     **/
    auto& block = blocks.arithmetic;
    block.populate_wires(y_p, x_0, y_0, x_p);
    block.populate_wires(z_p, x_1, y_1, z_0);
    block.populate_wires(x_2, y_2, z_2, z_1);
    block.populate_wires(x_3, y_3, z_3, this->zero_idx());

    // When q_arith == 3, w_4_shift is scaled by 2 (see ArithmeticRelation for details). Therefore, for consistency we
    // also scale each linear term by this factor of 2 so that the constraint is effectively:
    //      (q_l * w_1) + (q_r * w_2) + (q_o * w_3) + (q_4 * w_4) + q_c + w_4_shift = 0
    const FF linear_term_scale_factor = 2;
    block.q_m().emplace_back(addconstp);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst0 * linear_term_scale_factor);
    block.q_3().emplace_back(-y_mulconst0 * linear_term_scale_factor);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst0 * linear_term_scale_factor);
    block.set_gate_selector(3);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst1);
    block.q_3().emplace_back(-y_mulconst1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst1);
    block.set_gate_selector(2);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst2);
    block.q_2().emplace_back(-y_mulconst2);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst2);
    block.set_gate_selector(1);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst3);
    block.q_2().emplace_back(-y_mulconst3);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst3);
    block.set_gate_selector(1);

    check_selector_length_consistency();

    this->increment_num_gates(4);
    return std::array<uint32_t, 5>{
        z_0, z_1, z_2, z_3, z_p,
    };
}

/**
 * @brief Construct gates for non-native field subtraction
 * @details Uses special mode of ArithmeticRelation (q_arith = 2 and q_arith = 3) to subtract two non-native field
 * elements in 4 gates instead of 5.
 **/
template <typename ExecutionTrace>
std::array<uint32_t, 5> UltraCircuitBuilder_<ExecutionTrace>::evaluate_non_native_field_subtraction(
    add_simple limb0, add_simple limb1, add_simple limb2, add_simple limb3, std::tuple<uint32_t, uint32_t, FF> limbp)
{
    const uint32_t& x_0 = std::get<0>(limb0).first;
    const uint32_t& x_1 = std::get<0>(limb1).first;
    const uint32_t& x_2 = std::get<0>(limb2).first;
    const uint32_t& x_3 = std::get<0>(limb3).first;
    const uint32_t& x_p = std::get<0>(limbp);

    const FF& x_mulconst0 = std::get<0>(limb0).second;
    const FF& x_mulconst1 = std::get<0>(limb1).second;
    const FF& x_mulconst2 = std::get<0>(limb2).second;
    const FF& x_mulconst3 = std::get<0>(limb3).second;

    const uint32_t& y_0 = std::get<1>(limb0).first;
    const uint32_t& y_1 = std::get<1>(limb1).first;
    const uint32_t& y_2 = std::get<1>(limb2).first;
    const uint32_t& y_3 = std::get<1>(limb3).first;
    const uint32_t& y_p = std::get<1>(limbp);

    const FF& y_mulconst0 = std::get<1>(limb0).second;
    const FF& y_mulconst1 = std::get<1>(limb1).second;
    const FF& y_mulconst2 = std::get<1>(limb2).second;
    const FF& y_mulconst3 = std::get<1>(limb3).second;

    // constant additive terms
    const FF& addconst0 = std::get<2>(limb0);
    const FF& addconst1 = std::get<2>(limb1);
    const FF& addconst2 = std::get<2>(limb2);
    const FF& addconst3 = std::get<2>(limb3);
    const FF& addconstp = std::get<2>(limbp);

    // get value of result limbs
    const FF z_0value = (this->get_variable(x_0) * x_mulconst0) - (this->get_variable(y_0) * y_mulconst0) + addconst0;
    const FF z_1value = (this->get_variable(x_1) * x_mulconst1) - (this->get_variable(y_1) * y_mulconst1) + addconst1;
    const FF z_2value = (this->get_variable(x_2) * x_mulconst2) - (this->get_variable(y_2) * y_mulconst2) + addconst2;
    const FF z_3value = (this->get_variable(x_3) * x_mulconst3) - (this->get_variable(y_3) * y_mulconst3) + addconst3;
    const FF z_pvalue = this->get_variable(x_p) - this->get_variable(y_p) + addconstp;

    const uint32_t z_0 = this->add_variable(z_0value);
    const uint32_t z_1 = this->add_variable(z_1value);
    const uint32_t z_2 = this->add_variable(z_2value);
    const uint32_t z_3 = this->add_variable(z_3value);
    const uint32_t z_p = this->add_variable(z_pvalue);

    /**
     * We want to impose the following five constraints:
     *   Limb constraints: z.i = x.i * x_mulconst.i - y.i * y_mulconst.i + addconst.i, for i in [0, 3]
     *   Prime basis limb constraint: z.p = x.p - y.p + addconstp
     *
     *   Wire layout for non-native field subtraction (z = x - y)
     *
     *   | w_1 | w_2 | w_3 | w_4 | q_arith |
     *   |-----|-----|-----|-----|---------|
     *   | y.p | x.0 | y.0 | z.p |    3    |
     *   | x.p | x.1 | y.1 | z.0 |    2    |
     *   | x.2 | y.2 | z.2 | z.1 |    1    |
     *   | x.3 | y.3 | z.3 | --- |    1    |
     *
     * Note: The positions of z.p and x.p are swapped compared to the corresponding addition method. This is necessary
     * to achieve the desired constraint since the scaler on w_1_shift is fixed to -1 in the relation implementation.
     *
     *   Row 0:
     *     - x.0 * x_mulconst.0 - y.0 * y_mulconst.0 - z.0 + addconst.0 = 0 (q_2*w_2 + q_3*w_3 + q_c + w_4_shift = 0)
     *     - x.p - y.p - z.p + addconstp = 0 (w_1 + w_4 - w_1_shift + q_m = 0)
     *   Row 1: x.1 * x_mulconst.1 - y.1 * y_mulconst.1 - z.1 + addconst.1 = 0 (q_2*w_2 + q_3*w_3 + q_c + w_4_shift = 0)
     *   Row 2: x.2 * x_mulconst.2 - y.2 * y_mulconst.2 - z.2 + addconst.2 = 0 (q_1*w_1 + q_2*w_2 + q_3*w_3 + q_c = 0)
     *   Row 3: x.3 * x_mulconst.3 - y.3 * y_mulconst.3 - z.3 + addconst.3 = 0 (q_1*w_1 + q_2*w_2 + q_3*w_3 + q_c = 0)
     **/
    auto& block = blocks.arithmetic;
    block.populate_wires(y_p, x_0, y_0, z_p);
    block.populate_wires(x_p, x_1, y_1, z_0);
    block.populate_wires(x_2, y_2, z_2, z_1);
    block.populate_wires(x_3, y_3, z_3, this->zero_idx());

    // When q_arith == 3, w_4_shift is scaled by 2 (see ArithmeticRelation for details). Therefore, for consistency we
    // also scale each linear term by this factor of 2 so that the constraint is effectively:
    //      (q_l * w_1) + (q_r * w_2) + (q_o * w_3) + (q_4 * w_4) + q_c + w_4_shift = 0
    const FF linear_term_scale_factor = 2;
    block.q_m().emplace_back(-addconstp);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst0 * linear_term_scale_factor);
    block.q_3().emplace_back(y_mulconst0 * linear_term_scale_factor);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst0 * linear_term_scale_factor);
    block.set_gate_selector(3);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(-x_mulconst1);
    block.q_3().emplace_back(y_mulconst1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst1);
    block.set_gate_selector(2);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst2);
    block.q_2().emplace_back(y_mulconst2);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst2);
    block.set_gate_selector(1);

    block.q_m().emplace_back(0);
    block.q_1().emplace_back(-x_mulconst3);
    block.q_2().emplace_back(y_mulconst3);
    block.q_3().emplace_back(1);
    block.q_4().emplace_back(0);
    block.q_c().emplace_back(-addconst3);
    block.set_gate_selector(1);

    check_selector_length_consistency();

    this->increment_num_gates(4);
    return std::array<uint32_t, 5>{
        z_0, z_1, z_2, z_3, z_p,
    };
}

/**
 * @brief Create a new read-only memory region (a.k.a. ROM table)
 *
 * @details Creates a transcript object, where the inside memory state array is filled with "uninitialized memory" and
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
 * @details Creates a transcript object, where the inside memory state array is filled with "uninitialized memory" and
 * empty memory record array. Puts this object into the vector of ROM arrays.
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
 * @param rom_id The index of the ROM array in which we are initializing a cell
 * @param index_value The index of the cell within the array/ROM table (an actual index, not a witness index)
 * @param value_witness The index of the witness with the value that should be in the `index_value` place in the ROM
 * table.
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
    block.q_4().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][3]);
    block.set_gate_selector(1);
    this->check_selector_length_consistency();
    this->increment_num_gates();
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
    block.q_4().emplace_back(0);
    block.set_gate_selector(1);
    this->check_selector_length_consistency();
    this->increment_num_gates();
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
    auto first_zero_idx = this->get_first_variable_in_class(this->zero_idx());
    if (!this->variable_names.contains(first_zero_idx)) {
        this->set_variable_name(this->zero_idx(), "zero");
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
                                        block.q_lookup()[idx],
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

} // namespace bb
