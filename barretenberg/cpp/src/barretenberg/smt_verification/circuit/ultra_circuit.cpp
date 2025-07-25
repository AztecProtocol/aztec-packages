#include "ultra_circuit.hpp"
#include "barretenberg/common/log.hpp"

namespace smt_circuit {

/**
 * @brief Construct a new UltraCircuit object
 *
 * @param circuit_info CircuitShema object
 * @param solver pointer to the global solver
 * @param tag tag of the circuit. Empty by default.
 */
UltraCircuit::UltraCircuit(CircuitSchema& circuit_info,
                           Solver* solver,
                           TermType type,
                           const std::string& tag,
                           bool optimizations,
                           bool rom_ram_relaxed)
    : CircuitBase(circuit_info.vars_of_interest,
                  circuit_info.variables,
                  circuit_info.public_inps,
                  circuit_info.real_variable_index,
                  circuit_info.real_variable_tags,
                  solver,
                  type,
                  tag,
                  optimizations)
    , selectors(circuit_info.selectors)
    , wires_idxs(circuit_info.wires)
    , lookup_tables(circuit_info.lookup_tables)
    , range_tags(circuit_info.range_tags)
    , rom_records(circuit_info.rom_records)
    , rom_states(circuit_info.rom_states)
    , ram_records(circuit_info.ram_records)
    , ram_states(circuit_info.ram_states)
    , rom_ram_relaxed(rom_ram_relaxed)
{
    // Perform all relaxations for gates or
    // add gate in its normal state to solver

    size_t arith_cursor = 0;
    while (arith_cursor < this->selectors[BlockType::ARITHMETIC].size()) {
        arith_cursor = this->handle_arithmetic_relation(arith_cursor);
    }

    size_t elliptic_cursor = 0;
    while (elliptic_cursor < this->selectors[BlockType::ELLIPTIC].size()) {
        elliptic_cursor = this->handle_elliptic_relation(elliptic_cursor);
    }

    size_t lookup_cursor = 0;
    while (lookup_cursor < this->selectors[BlockType::LOOKUP].size()) {
        lookup_cursor = this->handle_lookup_relation(lookup_cursor);
    }

    size_t memory_cursor = 0;
    while (memory_cursor < this->selectors[BlockType::MEMORY].size()) {
        memory_cursor = this->handle_memory_relation(memory_cursor);
    }

    size_t nnf_cursor = 0;
    while (nnf_cursor < this->selectors[BlockType::NNF].size()) {
        nnf_cursor = this->handle_nnf_relation(nnf_cursor);
    }
    this->handle_rom_tables();
    this->handle_ram_tables();

    // size_t delta_range_cursor = 0;
    // while(delta_range_cursor < this->selectors[3].size()){
    //     delta_range_cursor = this->handle_delta_range_relation(delta_range_cursor, 3);
    // }
    this->handle_range_constraints();

    info("Finished solver prep");
}

/**
 * @brief Adds all the arithmetic gate constraints to the solver.
 * Relaxes constraint system for non-ff solver engines
 * via removing subcircuits that were already proved being correct.
 *
 * @param cusor current selector
 * @return new cursor value
 */
size_t UltraCircuit::handle_arithmetic_relation(size_t cursor)
{
    bb::fr q_m = this->selectors[BlockType::ARITHMETIC][cursor][0];
    bb::fr q_l = this->selectors[BlockType::ARITHMETIC][cursor][1];
    bb::fr q_r = this->selectors[BlockType::ARITHMETIC][cursor][2];
    bb::fr q_o = this->selectors[BlockType::ARITHMETIC][cursor][3];
    bb::fr q_4 = this->selectors[BlockType::ARITHMETIC][cursor][4];
    bb::fr q_c = this->selectors[BlockType::ARITHMETIC][cursor][5];
    bb::fr q_arith = this->selectors[BlockType::ARITHMETIC][cursor][6];

    uint32_t w_l_idx = this->wires_idxs[BlockType::ARITHMETIC][cursor][0];
    uint32_t w_r_idx = this->wires_idxs[BlockType::ARITHMETIC][cursor][1];
    uint32_t w_o_idx = this->wires_idxs[BlockType::ARITHMETIC][cursor][2];
    uint32_t w_4_idx = this->wires_idxs[BlockType::ARITHMETIC][cursor][3];
    uint32_t w_l_shift_idx = this->wires_idxs[BlockType::ARITHMETIC][cursor][4];
    uint32_t w_4_shift_idx = this->wires_idxs[BlockType::ARITHMETIC][cursor][7];

    STerm w_l = this->symbolic_vars[w_l_idx];
    STerm w_r = this->symbolic_vars[w_r_idx];
    STerm w_o = this->symbolic_vars[w_o_idx];
    STerm w_4 = this->symbolic_vars[w_4_idx];
    STerm w_4_shift = this->symbolic_vars[w_4_shift_idx];
    STerm w_l_shift = this->symbolic_vars[w_l_shift_idx];

    std::vector<bb::fr> this_gate = { q_m, q_l, q_r, q_o, q_c, q_arith, q_4 };

    std::vector<bb::fr> boolean_gate = { 1, -1, 0, 0, 0, 1, 0 };
    bool boolean_gate_flag = (boolean_gate == this_gate) && (w_l_idx == w_r_idx) && (w_o_idx == 0) && (w_4_idx == 0);
    if (boolean_gate_flag) {
        (Bool(w_l) == Bool(STerm(0, this->solver, this->type)) | Bool(w_l) == Bool(STerm(1, this->solver, this->type)))
            .assert_term();
        return cursor + 1;
    }

    std::vector<bb::fr> fix_witness_gate = { 0, 1, 0, 0, q_c, 1, 0 };
    bool put_constant_variable_flag =
        (fix_witness_gate == this_gate) && (w_r_idx == 0) && (w_o_idx == 0) && (w_4_idx == 0);
    if (put_constant_variable_flag) {
        w_l == -q_c;
        return cursor + 1;
    }

    STerm res = this->symbolic_vars[this->variable_names_inverse["zero"]];
    static const bb::fr neg_half = bb::fr(-2).invert();

    if (!q_arith.is_zero()) {
        if (q_m != 0) {
            res += ((q_arith - 3) * q_m * neg_half) * w_r * w_l;
        }
        if (q_l != 0) {
            res += (q_l * w_l);
        }
        if (q_r != 0) {
            res += (q_r * w_r);
        }
        if (q_o != 0) {
            res += (q_o * w_o);
        }
        if (q_4 != 0) {
            res += (q_4 * w_4);
        }
        if (q_c != 0) {
            res += q_c;
        }
        if (q_arith != 1) {
            res += (q_arith - 1) * w_4_shift;
        }
        // res *= q_arith;
        res == bb::fr::zero();

        optimized[w_l_idx] = false;
        optimized[w_r_idx] = false;
        optimized[w_o_idx] = false;
        optimized[w_4_idx] = false;
    }

    if (q_arith * (q_arith - 1) * (q_arith - 2) != 0) {
        res = w_l + w_4 - w_l_shift + q_m;
        res == bb::fr::zero();
        optimized[w_l_shift_idx] = false;
    }

    return cursor + 1;
}

void UltraCircuit::process_new_table(uint32_t table_idx)
{
    std::vector<STuple> new_table;
    bool is_xor = true;
    bool is_and = true;

    for (auto table_entry : this->lookup_tables[table_idx]) {
        STuple tmp_entry({
            STerm(table_entry[0], this->solver, this->type),
            STerm(table_entry[1], this->solver, this->type),
            STerm(table_entry[2], this->solver, this->type),
        });
        new_table.push_back(tmp_entry);

        is_xor &= (static_cast<uint256_t>(table_entry[0]) ^ static_cast<uint256_t>(table_entry[1])) ==
                  static_cast<uint256_t>(table_entry[2]);
        is_and &= (static_cast<uint256_t>(table_entry[0]) & static_cast<uint256_t>(table_entry[1])) ==
                  static_cast<uint256_t>(table_entry[2]);
    }
    info(RED, "Creating lookup table №", this->cached_symbolic_tables.size());
    std::string table_name;
    if (is_xor) {
        table_name = "XOR_TABLE_" + std::to_string(new_table.size());
        this->tables_types.insert({ table_idx, TableType::XOR });
    } else if (is_and) {
        table_name = "AND_TABLE_" + std::to_string(new_table.size());
        this->tables_types.insert({ table_idx, TableType::AND });
    } else {
        table_name = "UNK_TABLE_" + std::to_string(new_table.size());
        this->tables_types.insert({ table_idx, TableType::UNKNOWN });
    }
    this->tables_sizes.insert({ table_idx, new_table.size() });

    info(table_name, RESET);
    SymSet<STuple> new_stable(new_table, this->tag + table_name);
    this->cached_symbolic_tables.insert({ table_idx, new_stable });
}

/**
 * @brief Adds all the lookup gate constraints to the solver.
 * Relaxes constraint system for non-ff solver engines
 * via removing subcircuits that were already proved being correct.
 *
 * @param cusor current selector
 * @return new cursor value
 */
size_t UltraCircuit::handle_lookup_relation(size_t cursor)
{
    bb::fr q_m = this->selectors[BlockType::LOOKUP][cursor][0];
    bb::fr q_r = this->selectors[BlockType::LOOKUP][cursor][2];
    bb::fr q_o = this->selectors[BlockType::LOOKUP][cursor][3];
    bb::fr q_c = this->selectors[BlockType::LOOKUP][cursor][5];
    bb::fr q_lookup = this->selectors[BlockType::LOOKUP][cursor][10];

    if (q_lookup.is_zero()) {
        return cursor + 1;
    }

    uint32_t w_l_idx = this->wires_idxs[BlockType::LOOKUP][cursor][0];
    uint32_t w_r_idx = this->wires_idxs[BlockType::LOOKUP][cursor][1];
    uint32_t w_o_idx = this->wires_idxs[BlockType::LOOKUP][cursor][2];
    uint32_t w_l_shift_idx = this->wires_idxs[BlockType::LOOKUP][cursor][4];
    uint32_t w_r_shift_idx = this->wires_idxs[BlockType::LOOKUP][cursor][5];
    uint32_t w_o_shift_idx = this->wires_idxs[BlockType::LOOKUP][cursor][6];

    optimized[w_l_idx] = false;
    optimized[w_r_idx] = false;
    optimized[w_o_idx] = false;
    optimized[w_l_shift_idx] = false;
    optimized[w_r_shift_idx] = false;
    optimized[w_o_shift_idx] = false;

    auto table_idx = static_cast<uint32_t>(q_o);
    if (!this->cached_symbolic_tables.contains(table_idx)) {
        this->process_new_table(table_idx);
    }

    STerm first_entry = this->symbolic_vars[w_l_idx] + q_r * this->symbolic_vars[w_l_shift_idx];
    STerm second_entry = this->symbolic_vars[w_r_idx] + q_m * this->symbolic_vars[w_r_shift_idx];
    STerm third_entry = this->symbolic_vars[w_o_idx] + q_c * this->symbolic_vars[w_o_shift_idx];

    if (this->type == TermType::BVTerm && this->enable_optimizations) {
        // Sort of an optimization.
        // However if we don't do this, solver will find a unique witness that corresponds to overflowed value.
        if (q_r == -64 && q_m == -64 && q_c == -64) {
            this->symbolic_vars[w_l_shift_idx] = this->symbolic_vars[w_l_idx] >> 6;
            this->symbolic_vars[w_r_shift_idx] = this->symbolic_vars[w_r_idx] >> 6;
            this->symbolic_vars[w_o_shift_idx] = this->symbolic_vars[w_o_idx] >> 6;
        }

        auto sqrt = [](size_t table_size) -> size_t {
            auto [is_sqr, res] = bb::fr(table_size).sqrt();
            info("Is square: ", is_sqr);
            if (!(uint256_t(res) < (uint256_t(1) << 32) || uint256_t(-res) < (uint256_t(1) << 32))) {
                info("bad sqrt");
                abort();
            }
            auto ures = uint256_t(res) > (uint256_t(1) << 32) ? uint256_t(-res) : uint256_t(res);
            return static_cast<size_t>(ures);
        };

        switch (this->tables_types[table_idx]) {
        case TableType::XOR: {
            info("XOR optimization");

            size_t max_val = sqrt(this->tables_sizes[table_idx]);
            first_entry < max_val;
            second_entry < max_val;
            third_entry < max_val;

            (first_entry ^ second_entry) == third_entry;
            return cursor + 1;
        }
        case TableType::AND: {
            info("AND optimization");

            size_t max_val = sqrt(this->tables_sizes[table_idx]);
            first_entry < max_val;
            second_entry < max_val;
            third_entry < max_val;

            (first_entry & second_entry) == third_entry;
            return cursor + 1;
        }
        case TableType::UNKNOWN:
            break;
        }
    }
    info("Unknown Table");
    STuple entries({ first_entry, second_entry, third_entry });
    this->cached_symbolic_tables[table_idx].contains(entries);
    return cursor + 1;
}

/**
 * @brief Adds all the elliptic gate constraints to the solver.
 *
 * @param cusor current selector
 * @return new cursor value
 */
size_t UltraCircuit::handle_elliptic_relation(size_t cursor)
{
    bb::fr q_is_double = this->selectors[BlockType::ELLIPTIC][cursor][0];
    bb::fr q_sign = this->selectors[BlockType::ELLIPTIC][cursor][1];
    bb::fr q_elliptic = this->selectors[BlockType::ELLIPTIC][cursor][8];
    if (q_elliptic.is_zero()) {
        return cursor + 1;
    }

    uint32_t w_r_idx = this->wires_idxs[BlockType::ELLIPTIC][cursor][1];
    uint32_t w_o_idx = this->wires_idxs[BlockType::ELLIPTIC][cursor][2];
    uint32_t w_l_shift_idx = this->wires_idxs[BlockType::ELLIPTIC][cursor][4];
    uint32_t w_r_shift_idx = this->wires_idxs[BlockType::ELLIPTIC][cursor][5];
    uint32_t w_o_shift_idx = this->wires_idxs[BlockType::ELLIPTIC][cursor][6];
    uint32_t w_4_shift_idx = this->wires_idxs[BlockType::ELLIPTIC][cursor][7];
    optimized[w_r_idx] = false;
    optimized[w_o_idx] = false;
    optimized[w_l_shift_idx] = false;
    optimized[w_r_shift_idx] = false;
    optimized[w_o_shift_idx] = false;
    optimized[w_4_shift_idx] = false;

    STerm x_1 = this->symbolic_vars[w_r_idx];
    STerm y_1 = this->symbolic_vars[w_o_idx];
    STerm x_2 = this->symbolic_vars[w_l_shift_idx];
    STerm y_2 = this->symbolic_vars[w_4_shift_idx];
    STerm x_3 = this->symbolic_vars[w_r_shift_idx];
    STerm y_3 = this->symbolic_vars[w_o_shift_idx];

    auto x_diff = (x_2 - x_1);
    auto y2_sqr = (y_2 * y_2);
    auto y1_sqr = (y_1 * y_1);
    auto y1y2 = y_1 * y_2 * q_sign;
    auto x_add_identity = (x_3 + x_2 + x_1) * x_diff * x_diff - y2_sqr - y1_sqr + y1y2 + y1y2;

    auto y1_plus_y3 = y_1 + y_3;
    auto y_diff = y_2 * q_sign - y_1;
    auto y_add_identity = y1_plus_y3 * x_diff + (x_3 - x_1) * y_diff;

    if (q_is_double.is_zero()) {
        x_add_identity == 0; // scaling_factor = 1
        y_add_identity == 0; // scaling_factor = 1
    }

    bb::fr curve_b = this->selectors[BlockType::ELLIPTIC][cursor][11];
    auto x_pow_4 = (y1_sqr - curve_b) * x_1;
    auto y1_sqr_mul_4 = y1_sqr + y1_sqr;
    y1_sqr_mul_4 += y1_sqr_mul_4;
    auto x1_pow_4_mul_9 = x_pow_4 * 9;
    auto x_double_identity = (x_3 + x_1 + x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;

    auto x1_sqr_mul_3 = (x_1 + x_1 + x_1) * x_1;
    auto y_double_identity = x1_sqr_mul_3 * (x_1 - x_3) - (y_1 + y_1) * (y_1 + y_3);

    if (!q_is_double.is_zero()) {
        x_double_identity == 0; // scaling_factor = 1
        y_double_identity == 0; // scaling_factor = 1
    }

    return cursor + 1;
}

/**
 * @brief Adds all the delta_range gate constraints to the solver.
 *
 * @param cusor current selector
 * @return new cursor value
 * @todo Useless?
 */
size_t UltraCircuit::handle_delta_range_relation(size_t cursor)
{
    bb::fr q_delta_range = this->selectors[BlockType::DELTA_RANGE][cursor][7];
    if (q_delta_range == 0) {
        return cursor + 1;
    }

    uint32_t w_l_idx = this->wires_idxs[BlockType::DELTA_RANGE][cursor][0];
    uint32_t w_r_idx = this->wires_idxs[BlockType::DELTA_RANGE][cursor][1];
    uint32_t w_o_idx = this->wires_idxs[BlockType::DELTA_RANGE][cursor][2];
    uint32_t w_4_idx = this->wires_idxs[BlockType::DELTA_RANGE][cursor][3];
    uint32_t w_l_shift_idx = this->wires_idxs[BlockType::DELTA_RANGE][cursor][4];

    STerm w_1 = this->symbolic_vars[w_l_idx];
    STerm w_2 = this->symbolic_vars[w_r_idx];
    STerm w_3 = this->symbolic_vars[w_o_idx];
    STerm w_4 = this->symbolic_vars[w_4_idx];
    STerm w_1_shift = this->symbolic_vars[w_l_shift_idx];

    STerm delta_1 = w_2 - w_1;
    STerm delta_2 = w_3 - w_2;
    STerm delta_3 = w_4 - w_3;
    STerm delta_4 = w_1_shift - w_4;

    STerm tmp = (delta_1 - 1) * (delta_1 - 1) - 1;
    tmp *= (delta_1 - 2) * (delta_1 - 2) - 1;
    tmp == 0;

    tmp = (delta_2 - 1) * (delta_2 - 1) - 1;
    tmp *= (delta_2 - 2) * (delta_2 - 2) - 1;
    tmp == 0;

    tmp = (delta_3 - 1) * (delta_3 - 1) - 1;
    tmp *= (delta_3 - 2) * (delta_3 - 2) - 1;
    tmp == 0;

    tmp = (delta_4 - 1) * (delta_4 - 1) - 1;
    tmp *= (delta_4 - 2) * (delta_4 - 2) - 1;
    tmp == 0;

    return cursor + 1;
}

/**
 * @brief Adds all the range constraints to the solver.
 */
void UltraCircuit::handle_range_constraints()
{
    for (uint32_t i = 0; i < this->get_num_vars(); i++) {
        if (i != this->real_variable_index[i] || optimized[i]) {
            continue;
        }

        uint32_t tag = this->real_variable_tags[i];
        if (tag != 0 && this->range_tags.contains(tag)) {
            uint64_t range = this->range_tags[tag];
            if (this->type == TermType::FFTerm || !this->enable_optimizations) {
                if (!this->cached_range_tables.contains(range)) {
                    std::vector<STerm> new_range_table;
                    for (size_t entry = 0; entry < range; entry++) {
                        new_range_table.push_back(STerm(entry, this->solver, this->type));
                    }
                    std::string table_name = this->tag + "RANGE_" + std::to_string(range);
                    SymSet<STerm> new_range_stable(new_range_table, table_name);
                    info(RED, "Initialized new range: ", table_name, RESET);
                    this->cached_range_tables.insert({ range, new_range_stable });
                }
                this->cached_range_tables[range].contains(this->symbolic_vars[i]);
            } else {
                this->symbolic_vars[i] <= range;
            }
            optimized[i] = false;
        }
    }
}

/**
 * @brief Adds all the memory constraints to the solver.
 *
 * @param cursor current selector
 * @return new cursor value
 */

size_t UltraCircuit::handle_memory_relation(size_t cursor)
{
    // Note: all of the hardcoded indices for extracting components in this module seem to be wrong/outdated
    bb::fr q_memory = this->selectors[BlockType::MEMORY][cursor][9];
    if (q_memory == 0) {
        return cursor + 1;
    }

    uint32_t w_l_idx = this->wires_idxs[BlockType::MEMORY][cursor][0];
    uint32_t w_r_idx = this->wires_idxs[BlockType::MEMORY][cursor][1];
    uint32_t w_o_idx = this->wires_idxs[BlockType::MEMORY][cursor][2];
    uint32_t w_4_idx = this->wires_idxs[BlockType::MEMORY][cursor][3];
    uint32_t w_l_shift_idx = this->wires_idxs[BlockType::MEMORY][cursor][4];
    uint32_t w_r_shift_idx = this->wires_idxs[BlockType::MEMORY][cursor][5];
    uint32_t w_o_shift_idx = this->wires_idxs[BlockType::MEMORY][cursor][6];
    uint32_t w_4_shift_idx = this->wires_idxs[BlockType::MEMORY][cursor][7];

    STerm w_1 = this->symbolic_vars[w_l_idx];
    STerm w_2 = this->symbolic_vars[w_r_idx];
    STerm w_3 = this->symbolic_vars[w_o_idx];
    STerm w_4 = this->symbolic_vars[w_4_idx];
    STerm w_1_shift = this->symbolic_vars[w_l_shift_idx];
    STerm w_2_shift = this->symbolic_vars[w_r_shift_idx];
    STerm w_3_shift = this->symbolic_vars[w_o_shift_idx];
    STerm w_4_shift = this->symbolic_vars[w_4_shift_idx];

    bb::fr q_m = this->selectors[BlockType::MEMORY][cursor][0];
    bb::fr q_1 = this->selectors[BlockType::MEMORY][cursor][1];
    bb::fr q_2 = this->selectors[BlockType::MEMORY][cursor][2];
    bb::fr q_3 = this->selectors[BlockType::MEMORY][cursor][3];
    bb::fr q_4 = this->selectors[BlockType::MEMORY][cursor][4];
    // bb::fr q_c = this->selectors[BlockType::MEMORY][cursor][5];
    bb::fr q_arith = this->selectors[BlockType::MEMORY][cursor][6];

    // reassure that only one entry
    size_t entry_flag = 0;

    // Skip RAM/ROM relations here
    if (q_1 != 0 && q_m != 0) {
        entry_flag += 1;
        // RAM/ROM access gate
    }

    if (q_1 != 0 && q_4 != 0) {
        entry_flag += 1;
        // RAM timestamp check
    }

    if (q_1 != 0 && q_2 != 0) {
        entry_flag += 1;
        // ROM consistency check
    }

    if (q_arith) {
        entry_flag += 1;
        // RAM consistency check
    }

    if (entry_flag > 1) {
        throw std::runtime_error("Double entry in AUX");
    }
    return cursor + 1;
}

/**
 * @brief Adds all the nnf constraints to the solver.
 *
 * @param cursor current selector
 * @return new cursor value
 */

size_t UltraCircuit::handle_nnf_relation(size_t cursor)
{
    bb::fr q_nnf = this->selectors[BlockType::NNF][cursor][9]; // Magic 9?
    if (q_nnf == 0) {
        return cursor + 1;
    }

    uint32_t w_l_idx = this->wires_idxs[BlockType::NNF][cursor][0];
    uint32_t w_r_idx = this->wires_idxs[BlockType::NNF][cursor][1];
    uint32_t w_o_idx = this->wires_idxs[BlockType::NNF][cursor][2];
    uint32_t w_4_idx = this->wires_idxs[BlockType::NNF][cursor][3];
    uint32_t w_l_shift_idx = this->wires_idxs[BlockType::NNF][cursor][4];
    uint32_t w_r_shift_idx = this->wires_idxs[BlockType::NNF][cursor][5];
    uint32_t w_o_shift_idx = this->wires_idxs[BlockType::NNF][cursor][6];
    uint32_t w_4_shift_idx = this->wires_idxs[BlockType::NNF][cursor][7];

    STerm w_1 = this->symbolic_vars[w_l_idx];
    STerm w_2 = this->symbolic_vars[w_r_idx];
    STerm w_3 = this->symbolic_vars[w_o_idx];
    STerm w_4 = this->symbolic_vars[w_4_idx];
    STerm w_1_shift = this->symbolic_vars[w_l_shift_idx];
    STerm w_2_shift = this->symbolic_vars[w_r_shift_idx];
    STerm w_3_shift = this->symbolic_vars[w_o_shift_idx];
    STerm w_4_shift = this->symbolic_vars[w_4_shift_idx];

    bb::fr q_m = this->selectors[BlockType::NNF][cursor][0];
    bb::fr q_1 = this->selectors[BlockType::NNF][cursor][1];
    bb::fr q_2 = this->selectors[BlockType::NNF][cursor][2];
    bb::fr q_3 = this->selectors[BlockType::NNF][cursor][3];
    bb::fr q_4 = this->selectors[BlockType::NNF][cursor][4];
    // bb::fr q_c = this->selectors[BlockType::NNF][cursor][5];
    bb::fr q_arith = this->selectors[BlockType::NNF][cursor][6];

    bb::fr LIMB_SIZE(uint256_t(1) << 68);
    bb::fr SUBLIMB_SHIFT(uint256_t(1) << 14);

    // reassure that only one entry
    size_t entry_flag = 0;

    if (q_3 != 0 && q_4 != 0) {
        info("BF 1");
        entry_flag += 1;
        // BigField Limb Accumulation 1
        STerm limb_accumulator_1 = w_2_shift * SUBLIMB_SHIFT;
        limb_accumulator_1 += w_1_shift;
        limb_accumulator_1 *= SUBLIMB_SHIFT;
        limb_accumulator_1 += w_3;
        limb_accumulator_1 *= SUBLIMB_SHIFT;
        limb_accumulator_1 += w_2;
        limb_accumulator_1 *= SUBLIMB_SHIFT;
        limb_accumulator_1 += w_1;
        limb_accumulator_1 -= w_4;
        limb_accumulator_1 == 0;
    }

    if (q_3 != 0 && q_m != 0) {
        info("BF 2");
        entry_flag += 1;
        // BigField Limb Accumulation 2
        STerm limb_accumulator_2 = w_3_shift * SUBLIMB_SHIFT;
        limb_accumulator_2 += w_2_shift;
        limb_accumulator_2 *= SUBLIMB_SHIFT;
        limb_accumulator_2 += w_1_shift;
        limb_accumulator_2 *= SUBLIMB_SHIFT;
        limb_accumulator_2 += w_4;
        limb_accumulator_2 *= SUBLIMB_SHIFT;
        limb_accumulator_2 += w_3;
        limb_accumulator_2 -= w_4_shift;
        limb_accumulator_2 == 0;
    }

    STerm limb_subproduct = w_1 * w_2_shift + w_1_shift * w_2;
    if (q_2 != 0 && q_4 != 0) {
        info("BF pr 2");
        entry_flag += 1;
        // BigField Product 2
        STerm non_native_field_gate_2 = (w_1 * w_4 + w_2 * w_3 - w_3_shift);
        non_native_field_gate_2 *= LIMB_SIZE;
        non_native_field_gate_2 -= w_4_shift;
        non_native_field_gate_2 += limb_subproduct;
        non_native_field_gate_2 == 0;
    }

    limb_subproduct *= LIMB_SIZE;
    limb_subproduct += (w_1_shift * w_2_shift);
    if (q_2 != 0 && q_3 != 0) {
        info("BF pr 1");
        entry_flag += 1;
        // BigField Product 1
        STerm non_native_field_gate_1 = limb_subproduct;
        non_native_field_gate_1 -= (w_3 + w_4);
        non_native_field_gate_1 == 0;
    }

    if (q_2 != 0 && q_m != 0) {
        info("BF pr 3");
        entry_flag += 1;
        // BigField Product 3
        STerm non_native_field_gate_3 = limb_subproduct;
        non_native_field_gate_3 += w_4;
        non_native_field_gate_3 -= (w_3_shift + w_4_shift);
        non_native_field_gate_3 == 0;
    }

    if (entry_flag > 1) {
        throw std::runtime_error("Double entry in AUX");
    }
    return cursor + 1;
}

/**
 * @brief Perform read from ROM table
 *
 * @param rom_array_idx index of the ROM table
 * @param rom_index_idx  witness index of the (index) in table
 * @param read_to_value1_idx witness index of the first value to store
 * @param read_to_value2_idx witness index of the second value to store
 */
void UltraCircuit::rom_table_read(uint32_t rom_array_idx,
                                  uint32_t rom_index_idx,
                                  uint32_t read_to_value1_idx,
                                  uint32_t read_to_value2_idx)
{
    if (this->public_inps.contains(rom_index_idx) || this->rom_ram_relaxed) {
        STerm index = this->symbolic_vars[rom_index_idx];
        index == this->variables[rom_index_idx];
    }

    SymArray<STerm, STuple> rom_table = this->cached_rom_tables[rom_array_idx];
    STerm index = this->symbolic_vars[rom_index_idx];
    STuple table_entry = rom_table[index]; // <- symbolic read

    STerm value1 = this->symbolic_vars[read_to_value1_idx];
    STerm value2 = this->symbolic_vars[read_to_value2_idx];
    STuple value_entry({ value1, value2 });

    table_entry == value_entry;
}

/**
 * @brief Perform read from RAM table
 *
 * @param ram_array_idx index of the RAM table
 * @param ram_index_idx  witness index of the (index) in table
 * @param read_to_value_idx witness index of the value to store
 */
void UltraCircuit::ram_table_read(uint32_t ram_array_idx, uint32_t ram_index_idx, uint32_t read_to_value_idx)
{
    if (this->public_inps.contains(ram_index_idx) || this->rom_ram_relaxed) {
        STerm index = this->symbolic_vars[ram_index_idx];
        index == this->variables[ram_index_idx];
    }

    SymArray<STerm, STerm> ram_table = this->cached_ram_tables[ram_array_idx];
    STerm index = this->symbolic_vars[ram_index_idx];
    STerm table_entry = ram_table[index]; // <- symbolic read

    STerm value_entry = this->symbolic_vars[read_to_value_idx];

    table_entry == value_entry;
}

/**
 * @brief Perform write to RAM table
 *
 * @param ram_array_idx index of the RAM table
 * @param ram_index_idx  witness index of the (index) in table
 * @param read_to_value_idx witness index of the value to store
 */
void UltraCircuit::ram_table_write(uint32_t ram_array_idx, uint32_t ram_index_idx, uint32_t read_from_value_idx)
{
    if (this->public_inps.contains(ram_index_idx) || this->rom_ram_relaxed) {
        STerm index = this->symbolic_vars[ram_index_idx];
        index == this->variables[ram_index_idx];
    }

    SymArray<STerm, STerm>& ram_table = this->cached_ram_tables[ram_array_idx];
    STerm index = this->symbolic_vars[ram_index_idx];
    STerm value_entry = this->symbolic_vars[read_from_value_idx];

    ram_table.put(index, value_entry);
}

/**
 * @brief Adds all the ROM related constraints into the solver.
 *
 */
void UltraCircuit::handle_rom_tables()
{
    static constexpr uint32_t UNINITIALIZED_MEMORY_RECORD = UINT32_MAX;

    STerm idx_ex = this->symbolic_vars[this->variable_names_inverse["zero"]];
    STuple entry_ex({ idx_ex, idx_ex });

    cvc5::Sort ind_sort = idx_ex.term.getSort();
    TermType ind_type = idx_ex.type;
    cvc5::Sort entry_sort = entry_ex.term.getSort();
    TermType entry_type = entry_ex.type;

    for (uint32_t i = 0; i < this->rom_records.size(); i++) {
        SymArray<STerm, STuple> rom_table(
            ind_sort, ind_type, entry_sort, entry_type, this->solver, "ROM_TABLE#" + std::to_string(i));
        // Fill the ROM table
        for (size_t j = 0; j < this->rom_states[i].size(); j++) {
            STerm idx(static_cast<bb::fr>(j), this->solver, ind_type);
            if (this->rom_states[i][j][0] == UNINITIALIZED_MEMORY_RECORD) {
                continue;
            }

            STerm value1 = this->symbolic_vars[this->rom_states[i][j][0]];
            STerm value2 = this->symbolic_vars[this->rom_states[i][j][1]];
            rom_table.put(idx, STuple({ value1, value2 }));
        }
        this->cached_rom_tables.insert({ i, rom_table });

        // process all the reads
        for (auto rom_record : this->rom_records[i]) {
            uint32_t index_witness = rom_record[0];
            uint32_t value1_witness = rom_record[1];
            uint32_t value2_witness = rom_record[2];
            this->rom_table_read(i, index_witness, value1_witness, value2_witness);
        }
    }
}

/**
 * @brief Adds all the RAM related constraints into the solver.
 *
 */
void UltraCircuit::handle_ram_tables()
{
    STerm idx_ex = this->symbolic_vars[this->variable_names_inverse["zero"]];
    STuple entry_ex({ idx_ex, idx_ex });

    cvc5::Sort sort = idx_ex.term.getSort();
    TermType type = idx_ex.type;

    for (uint32_t i = 0; i < this->ram_records.size(); i++) {
        SymArray<STerm, STerm> ram_table(sort, type, sort, type, this->solver, "RAM_TABLE#" + std::to_string(i));
        this->cached_ram_tables.insert({ i, ram_table });

        // process all the reads and writes
        for (auto ram_record : this->ram_records[i]) {
            uint32_t index_witness = ram_record[0];
            uint32_t value_witness = ram_record[1];
            // uint32_t timestamp_witness = ram_record[2];
            uint32_t access_type = ram_record[3];
            switch (access_type) {
            case 0:
                this->ram_table_read(i, index_witness, value_witness);
                break;
            case 1:
                this->ram_table_write(i, index_witness, value_witness);
                break;
            default:
                info("Reached an invalid access type");
                abort();
            }
        }
    }
}

/**
 * @brief Similar functionality to old .check_circuit() method
 * in standard circuit builder.
 *
 * @param witness
 * @return true
 * @return false
 *
 * @todo Do we actually need this here?
 */
bool UltraCircuit::simulate_circuit_eval(std::vector<bb::fr>& witness) const
{
    if (witness.size() != this->get_num_vars()) {
        throw std::invalid_argument("Witness size should be " + std::to_string(this->get_num_vars()) +

                                    std::to_string(witness.size()));
    }
    return true;
}

/**
 * @brief Check your circuit for witness uniqueness
 *
 * @details Creates two Circuit objects that represent the same
 * circuit, however you can choose which variables should be (not) equal in both cases,
 * and also the variables that should (not) be equal at the same time.
 *
 * @param circuit_info
 * @param s pointer to the global solver
 * @param equal The list of names of variables which should be equal in both circuits(each is equal)
 * @param not_equal The list of names of variables which should not be equal in both circuits(each is not equal)
 * @param equal_at_the_same_time The list of variables, where at least one pair has to be equal
 * @param not_equal_at_the_same_time The list of variables, where at least one pair has to be distinct
 * @return std::pair<Circuit, Circuit>
 */
std::pair<UltraCircuit, UltraCircuit> UltraCircuit::unique_witness_ext(
    CircuitSchema& circuit_info,
    Solver* s,
    TermType type,
    const std::vector<std::string>& equal,
    const std::vector<std::string>& not_equal,
    const std::vector<std::string>& equal_at_the_same_time,
    const std::vector<std::string>& not_equal_at_the_same_time,
    bool enable_optimizations)
{
    UltraCircuit c1(circuit_info, s, type, "circuit1", enable_optimizations);
    UltraCircuit c2(circuit_info, s, type, "circuit2", enable_optimizations);

    for (const auto& term : equal) {
        c1[term] == c2[term];
    }
    for (const auto& term : not_equal) {
        c1[term] != c2[term];
    }

    std::vector<Bool> eqs;
    for (const auto& term : equal_at_the_same_time) {
        Bool tmp = Bool(c1[term]) == Bool(c2[term]);
        eqs.push_back(tmp);
    }

    if (eqs.size() > 1) {
        batch_or(eqs).assert_term();
    } else if (eqs.size() == 1) {
        eqs[0].assert_term();
    }

    std::vector<Bool> neqs;
    for (const auto& term : not_equal_at_the_same_time) {
        Bool tmp = Bool(c1[term]) != Bool(c2[term]);
        neqs.push_back(tmp);
    }

    if (neqs.size() > 1) {
        batch_or(neqs).assert_term();
    } else if (neqs.size() == 1) {
        neqs[0].assert_term();
    }
    return { c1, c2 };
}

/**
 * @brief Check your circuit for witness uniqueness
 *
 * @details Creates two Circuit objects that represent the same
 * circuit, however you can choose which variables should be equal in both cases,
 * other witness members will be marked as not equal at the same time
 * or basically they will have to differ by at least one element.
 *
 * @param circuit_info
 * @param s pointer to the global solver
 * @param equal The list of names of variables which should be equal in both circuits(each is equal)
 * @return std::pair<Circuit, Circuit>
 */
std::pair<UltraCircuit, UltraCircuit> UltraCircuit::unique_witness(CircuitSchema& circuit_info,
                                                                   Solver* s,
                                                                   TermType type,
                                                                   const std::vector<std::string>& equal,
                                                                   bool enable_optimizations)
{
    UltraCircuit c1(circuit_info, s, type, "circuit1", enable_optimizations);
    UltraCircuit c2(circuit_info, s, type, "circuit2", enable_optimizations);

    for (const auto& term : equal) {
        c1[term] == c2[term];
    }

    std::vector<Bool> neqs;
    for (const auto& node : c1.symbolic_vars) {
        uint32_t i = node.first;
        if (std::find(equal.begin(), equal.end(), std::string(c1.variable_names[i])) != equal.end()) {
            continue;
        }
        if (c1.optimized[i]) {
            continue;
        }
        Bool tmp = Bool(c1[i]) != Bool(c2[i]);
        neqs.push_back(tmp);
    }

    if (neqs.size() > 1) {
        batch_or(neqs).assert_term();
    } else if (neqs.size() == 1) {
        neqs[0].assert_term();
    }
    return { c1, c2 };
}
}; // namespace smt_circuit
