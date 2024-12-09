#include "standard_circuit.hpp"

namespace smt_circuit {

/**
 * @brief Construct a new StandardCircuit object
 *
 * @param circuit_info CircuitShema object
 * @param solver pointer to the global solver
 * @param tag tag of the circuit. Empty by default.
 */
StandardCircuit::StandardCircuit(
    CircuitSchema& circuit_info, Solver* solver, TermType type, const std::string& tag, bool enable_optimizations)
    : CircuitBase(circuit_info.vars_of_interest,
                  circuit_info.variables,
                  circuit_info.public_inps,
                  circuit_info.real_variable_index,
                  circuit_info.real_variable_tags,
                  circuit_info.range_tags,
                  solver,
                  type,
                  tag,
                  enable_optimizations)
    , selectors(circuit_info.selectors[0])
    , wires_idxs(circuit_info.wires[0])
{
    this->symbolic_vars[this->variable_names_inverse["one"]] == bb::fr::one();
    // Perform all relaxations for gates or
    // add gate in its normal state to solver
    size_t i = 0;
    while (i < this->get_num_gates()) {
        i = this->prepare_gates(i);
    }
}

/**
 * @brief Adds all the gate constraints to the solver.
 * Relaxes constraint system for non-ff solver engines
 * via removing subcircuits that were already proved being correct.
 *
 */
size_t StandardCircuit::prepare_gates(size_t cursor)
{
    if (this->type == TermType::BVTerm && this->enable_optimizations) {
        size_t res = handle_logic_constraint(cursor);
        if (res != static_cast<size_t>(-1)) {
            return res;
        }
    }

    if ((this->type == TermType::BVTerm || this->type == TermType::FFITerm) && this->enable_optimizations) {
        size_t res = handle_range_constraint(cursor);
        if (res != static_cast<size_t>(-1)) {
            return res;
        }
    }

    if ((this->type == TermType::BVTerm) && this->enable_optimizations) {
        size_t res = handle_ror_constraint(cursor);
        if (res != static_cast<size_t>(-1)) {
            return res;
        }
    }

    if ((this->type == TermType::BVTerm) && this->enable_optimizations) {
        size_t res = handle_shl_constraint(cursor);
        if (res != static_cast<size_t>(-1)) {
            return res;
        }
    }
    if ((this->type == TermType::BVTerm) && this->enable_optimizations) {
        size_t res = handle_shr_constraint(cursor);
        if (res != static_cast<size_t>(-1)) {
            return res;
        }
    }

    bb::fr q_m = this->selectors[cursor][0];
    bb::fr q_1 = this->selectors[cursor][1];
    bb::fr q_2 = this->selectors[cursor][2];
    bb::fr q_3 = this->selectors[cursor][3];
    bb::fr q_c = this->selectors[cursor][4];
    uint32_t w_l = this->wires_idxs[cursor][0];
    uint32_t w_r = this->wires_idxs[cursor][1];
    uint32_t w_o = this->wires_idxs[cursor][2];
    optimized[w_l] = false;
    optimized[w_r] = false;
    optimized[w_o] = false;

    // Handles the case when we have univariate polynomial as constraint
    // by simply finding the roots via quadratic formula(or linear)
    // There're 7 possibilities of that, which are present below
    bool univariate_flag = false;
    univariate_flag |= (w_l == w_r) && (w_r == w_o);
    univariate_flag |= (w_l == w_r) && (q_3 == 0);
    univariate_flag |= (w_l == w_o) && (q_2 == 0) && (q_m == 0);
    univariate_flag |= (w_r == w_o) && (q_1 == 0) && (q_m == 0);
    univariate_flag |= (q_m == 0) && (q_1 == 0) && (q_3 == 0);
    univariate_flag |= (q_m == 0) && (q_2 == 0) && (q_3 == 0);
    univariate_flag |= (q_m == 0) && (q_1 == 0) && (q_2 == 0);

    // Univariate gate. Relaxes the solver. Or is it?
    // TODO(alex): Test the effect of this relaxation after the tests are merged.
    if (univariate_flag) {
        if ((q_m == 1) && (q_1 == 0) && (q_2 == 0) && (q_3 == -1) && (q_c == 0)) {
            (Bool(this->symbolic_vars[w_l]) ==
                 Bool(STerm(0, this->solver, this->type)) | // STerm(0, this->solver, this->type)) |
             Bool(this->symbolic_vars[w_l]) ==
                 Bool(STerm(1, this->solver, this->type))) // STerm(1, this->solver, this->type)))
                .assert_term();
        } else {
            this->handle_univariate_constraint(q_m, q_1, q_2, q_3, q_c, w_l);
        }
    } else {
        STerm eq = this->symbolic_vars[this->variable_names_inverse["zero"]];

        // mul selector
        if (q_m != 0) {
            eq += this->symbolic_vars[w_l] * this->symbolic_vars[w_r] * q_m;
        }
        // left selector
        if (q_1 != 0) {
            eq += this->symbolic_vars[w_l] * q_1;
        }
        // right selector
        if (q_2 != 0) {
            eq += this->symbolic_vars[w_r] * q_2;
        }
        // out selector
        if (q_3 != 0) {
            eq += this->symbolic_vars[w_o] * q_3;
        }
        // constant selector
        if (q_c != 0) {
            eq += q_c;
        }
        eq == 0;
    }
    return cursor + 1;
}

/**
 * @brief Relaxes univariate polynomial constraints.
 * TODO(alex): probably won't be necessary in the nearest future
 * because of new solver
 *
 * @param q_m multiplication selector
 * @param q_1 l selector
 * @param q_2 r selector
 * @param q_3 o selector
 * @param q_c constant
 * @param w   witness index
 */
void StandardCircuit::handle_univariate_constraint(
    bb::fr q_m, bb::fr q_1, bb::fr q_2, bb::fr q_3, bb::fr q_c, uint32_t w)
{
    bb::fr b = q_1 + q_2 + q_3;

    if (q_m == 0) {
        this->symbolic_vars[w] == -q_c / b;
        return;
    }

    std::pair<bool, bb::fr> d = (b * b - bb::fr(4) * q_m * q_c).sqrt();
    if (!d.first) {
        throw std::invalid_argument("There're no roots of quadratic polynomial");
    }
    bb::fr x1 = (-b + d.second) / (bb::fr(2) * q_m);
    bb::fr x2 = (-b - d.second) / (bb::fr(2) * q_m);

    if (d.second == 0) {
        this->symbolic_vars[w] == STerm(x1, this->solver, type);
    } else {
        ((Bool(this->symbolic_vars[w]) == Bool(STerm(x1, this->solver, this->type))) |
         (Bool(this->symbolic_vars[w]) == Bool(STerm(x2, this->solver, this->type))))
            .assert_term();
    }
}

// TODO(alex): Optimized out variables should be filled with proper values...
/**
 * @brief Relaxes logic constraints(AND/XOR).
 * @details This function is needed when we use bitwise compatible
 * symbolic terms.
 * It compares the chunk of selectors of the current circuit
 * with pure create_logic_constraint from circuit_builder.
 * It uses binary search to find a bit length of the constraint,
 * since we don't know it in general.
 * After a match is found, it updates the cursor to skip all the
 * redundant constraints and adds a pure a ^ b = c or a & b = c
 * constraint to solver.
 * If there's no match, it will return -1
 *
 * @param cursor current position
 * @return next position or -1
 */
size_t StandardCircuit::handle_logic_constraint(size_t cursor)
{
    // Initialize binary search. Logic gate can only accept even bit lengths
    // So we need to find a match among [1, 127] and then multiply the result by 2
    size_t beg = 1;
    size_t end = 127;
    size_t mid = 0;
    auto res = static_cast<size_t>(-1);

    // Indicates that current bit length is a match for XOR
    bool xor_flag = true;
    // Indicates that current bit length is a match for AND
    bool and_flag = true;
    // Indicates the logic operation(true - XOR, false - AND) if the match is found.
    bool logic_flag = true;
    bool stop_flag = false;

    while (beg <= end) {
        mid = (end + beg) / 2;

        // Take a pure logic circuit for the current bit length(2 * mid)
        // and compare it's selectors to selectors of the global circuit
        // at current position(cursor).
        // If they are equal, we can apply an optimization
        // However, if we have a match at bit length 2, it is possible
        // to have a match at higher bit lengths. That's why we store
        // the current match as `res` and proceed with ordinary binary search.
        // `stop_flag` simply indicates that the first selector doesn't match
        // and we can skip this whole section.

        if (!this->cached_subcircuits[SubcircuitType::XOR].contains(mid * 2)) {
            this->cached_subcircuits[SubcircuitType::XOR].insert(
                { mid * 2, get_standard_logic_circuit(mid * 2, true) });
        }
        CircuitProps xor_props = this->cached_subcircuits[SubcircuitType::XOR][mid * 2];

        if (!this->cached_subcircuits[SubcircuitType::AND].contains(mid * 2)) {
            this->cached_subcircuits[SubcircuitType::AND].insert(
                { mid * 2, get_standard_logic_circuit(mid * 2, false) });
        }
        CircuitProps and_props = this->cached_subcircuits[SubcircuitType::AND][mid * 2];

        CircuitSchema xor_circuit = xor_props.circuit;
        CircuitSchema and_circuit = and_props.circuit;

        xor_flag = cursor + xor_props.num_gates <= this->selectors.size();
        and_flag = cursor + xor_props.num_gates <= this->selectors.size();
        if (xor_flag || and_flag) {
            for (size_t j = 0; j < xor_props.num_gates; j++) {
                // It is possible for gates to be equal but wires to be not, but I think it's very
                // unlikely to happen
                xor_flag &= xor_circuit.selectors[0][j + xor_props.start_gate] == this->selectors[cursor + j];
                and_flag &= and_circuit.selectors[0][j + and_props.start_gate] == this->selectors[cursor + j];

                // Before this fix this routine simplified two consecutive n bit xors(ands) into one 2n bit xor(and)
                // Now it checks out_accumulator_idx and new_out_accumulator_idx match
                // 14 here is a size of one iteration of logic_gate for loop in term of gates
                // 13 is the accumulator index relative to the beginning of the iteration

                size_t single_iteration_size = 14;
                size_t relative_acc_idx = 13;
                xor_flag &=
                    (j % single_iteration_size != relative_acc_idx) || (j == relative_acc_idx) ||
                    (this->wires_idxs[j + cursor][0] == this->wires_idxs[j + cursor - single_iteration_size][2]);
                and_flag &=
                    (j % single_iteration_size != relative_acc_idx) || (j == relative_acc_idx) ||
                    (this->wires_idxs[j + cursor][0] == this->wires_idxs[j + cursor - single_iteration_size][2]);

                if (!xor_flag && !and_flag) {
                    // Won't match at any bit length
                    if (j == 0) {
                        stop_flag = true;
                    }
                    break;
                }
            }
        }
        if (stop_flag) {
            break;
        }

        if (!xor_flag && !and_flag) {
            end = mid - 1;
        } else {
            res = 2 * mid;
            logic_flag = xor_flag;

            beg = mid + 1;
        }
    }

    if (res != static_cast<size_t>(-1)) {
        CircuitProps xor_props = get_standard_logic_circuit(res, true);
        CircuitProps and_props = get_standard_logic_circuit(res, false);

        info("Logic constraint optimization: ", std::to_string(res), " bits. is_xor: ", logic_flag);
        size_t left_gate = xor_props.gate_idxs[0];
        uint32_t left_gate_idx = xor_props.idxs[0];
        size_t right_gate = xor_props.gate_idxs[1];
        uint32_t right_gate_idx = xor_props.idxs[1];
        size_t out_gate = xor_props.gate_idxs[2];
        uint32_t out_gate_idx = xor_props.idxs[2];

        uint32_t left_idx = this->real_variable_index[this->wires_idxs[cursor + left_gate][left_gate_idx]];
        uint32_t right_idx = this->real_variable_index[this->wires_idxs[cursor + right_gate][right_gate_idx]];
        uint32_t out_idx = this->real_variable_index[this->wires_idxs[cursor + out_gate][out_gate_idx]];

        STerm left = this->symbolic_vars[left_idx];
        STerm right = this->symbolic_vars[right_idx];
        STerm out = this->symbolic_vars[out_idx];

        // Initializing the parts of the witness that were optimized
        // during the symbolic constraints initialization
        // i.e. simulating the create_logic_constraint gate by gate using BitVectors/Integers
        size_t num_bits = res;
        size_t processed_gates = 0;
        for (size_t i = num_bits - 1; i < num_bits; i -= 2) {
            // 8 here is the number of gates we have to skip to get proper indices
            processed_gates += 8;
            uint32_t left_quad_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            uint32_t left_lo_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][1]];
            uint32_t left_hi_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            processed_gates += 1;
            uint32_t right_quad_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            uint32_t right_lo_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][1]];
            uint32_t right_hi_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            processed_gates += 1;
            uint32_t out_quad_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            uint32_t out_lo_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][1]];
            uint32_t out_hi_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            processed_gates += 1;
            uint32_t old_left_acc_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            processed_gates += 1;
            uint32_t old_right_acc_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            processed_gates += 1;
            uint32_t old_out_acc_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            processed_gates += 1;

            this->symbolic_vars[old_left_acc_idx] == (left >> static_cast<uint32_t>(i - 1));
            this->symbolic_vars[left_quad_idx] == (this->symbolic_vars[old_left_acc_idx] & 3);
            this->symbolic_vars[left_lo_idx] == (this->symbolic_vars[left_quad_idx] & 1);
            this->symbolic_vars[left_hi_idx] == (this->symbolic_vars[left_quad_idx] >> 1);
            this->symbolic_vars[old_right_acc_idx] == (right >> static_cast<uint32_t>(i - 1));
            this->symbolic_vars[right_quad_idx] == (this->symbolic_vars[old_right_acc_idx] & 3);
            this->symbolic_vars[right_lo_idx] == (this->symbolic_vars[right_quad_idx] & 1);
            this->symbolic_vars[right_hi_idx] == (this->symbolic_vars[right_quad_idx] >> 1);
            this->symbolic_vars[old_out_acc_idx] == (out >> static_cast<uint32_t>(i - 1));
            this->symbolic_vars[out_quad_idx] == (this->symbolic_vars[old_out_acc_idx] & 3);
            this->symbolic_vars[out_lo_idx] == (this->symbolic_vars[out_quad_idx] & 1);
            this->symbolic_vars[out_hi_idx] == (this->symbolic_vars[out_quad_idx] >> 1);
        }

        if (logic_flag) {
            (left ^ right) == out;
        } else {
            (left & right) == out;
        }

        // You have to mark these arguments so they won't be optimized out
        optimized[left_idx] = false;
        optimized[right_idx] = false;
        optimized[out_idx] = false;
        return cursor + xor_props.num_gates;
    }
    return res;
}

/**
 * @brief Relaxes range constraints.
 * @details This function is needed when we use range compatible
 * symbolic terms.
 * It compares the chunk of selectors of the current circuit
 * with pure create_range_constraint from circuit_builder.
 * It uses binary search to find a bit length of the constraint,
 * since we don't know it in general.
 * After match is found, it updates the cursor to skip all the
 * redundant constraints and adds a pure a < 2^bit_length
 * constraint to solver.
 * If there's no match, it will return -1
 *
 * @param cursor current position
 * @return next position or -1
 */
size_t StandardCircuit::handle_range_constraint(size_t cursor)
{
    // Indicates that current bit length is a match
    bool range_flag = true;
    size_t mid = 0;
    auto res = static_cast<size_t>(-1);

    // Range constraints differ depending on oddness of bit_length
    // That's why we need to handle these cases separately
    for (size_t odd = 0; odd < 2; odd++) {
        // Initialize binary search.
        // We need to find a match among [1, 127] and then set the result to 2 * mid, or 2 * mid + 1
        size_t beg = 1;
        size_t end = 127;

        bool stop_flag = false;
        while (beg <= end) {
            mid = (end + beg) / 2;

            // Take a pure logic circuit for the current bit length(2 * mid + odd)
            // and compare it's selectors to selectors of the global circuit
            // at current positin(cursor).
            // If they are equal, we can apply an optimization
            // However, if we have a match at bit length 2, it is possible
            // to have a match at higher bit lengths. That's why we store
            // the current match as `res` and proceed with ordinary binary search.
            // `stop_flag` simply indicates that the first selector doesn't match
            // and we can skip this whole section.

            if (!this->cached_subcircuits[SubcircuitType::RANGE].contains(2 * mid + odd)) {
                this->cached_subcircuits[SubcircuitType::RANGE].insert(
                    { 2 * mid + odd, get_standard_range_constraint_circuit(2 * mid + odd) });
            }
            CircuitProps range_props = this->cached_subcircuits[SubcircuitType::RANGE][2 * mid + odd];
            CircuitSchema range_circuit = range_props.circuit;

            range_flag = cursor + range_props.num_gates <= this->get_num_gates();
            if (range_flag) {
                for (size_t j = 0; j < range_props.num_gates; j++) {
                    // It is possible for gates to be equal but wires to be not, but I think it's very
                    // unlikely to happen
                    range_flag &= range_circuit.selectors[0][j + range_props.start_gate] == this->selectors[cursor + j];

                    if (!range_flag) {
                        // Won't match at any bit length
                        if (j <= 2) {
                            stop_flag = true;
                        }
                        break;
                    }
                }
            }
            if (stop_flag) {
                break;
            }

            if (!range_flag) {
                end = mid - 1;
            } else {
                res = 2 * mid + odd;
                beg = mid + 1;
            }
        }

        if (res != static_cast<size_t>(-1)) {
            range_flag = true;
            break;
        }
    }

    if (range_flag) {
        info("Range constraint optimization: ", std::to_string(res), " bits");
        CircuitProps range_props = get_standard_range_constraint_circuit(res);

        size_t left_gate = range_props.gate_idxs[0];
        uint32_t left_gate_idx = range_props.idxs[0];
        uint32_t left_idx = this->real_variable_index[this->wires_idxs[cursor + left_gate][left_gate_idx]];

        STerm left = this->symbolic_vars[left_idx];

        // preserving shifted values
        // we need this because even right shifts do not create
        // any additional gates and therefore are undetectible

        // Simulate the range constraint circuit using the bitwise operations
        size_t num_bits = res;
        size_t num_quads = num_bits >> 1;
        num_quads += num_bits & 1;
        uint32_t processed_gates = 0;

        // Initializing the parts of the witness that were optimized
        // during the symbolic constraints initialization
        // i.e. simulating the decompose_into_base4_accumulators gate by gate using BitVectors/Integers
        for (size_t i = num_quads - 1; i < num_quads; i--) {
            uint32_t lo_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            processed_gates += 1;
            uint32_t quad_idx = 0;
            uint32_t old_accumulator_idx = 0;
            uint32_t hi_idx = 0;

            if (i == num_quads - 1 && ((num_bits & 1) == 1)) {
                quad_idx = lo_idx;
            } else {
                hi_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
                processed_gates += 1;
                quad_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
                processed_gates += 1;
            }

            if (i == num_quads - 1) {
                old_accumulator_idx = quad_idx;
            } else {
                old_accumulator_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
                processed_gates += 1;
            }

            this->symbolic_vars[old_accumulator_idx] == (left >> static_cast<uint32_t>(2 * i));
            this->symbolic_vars[quad_idx] == (this->symbolic_vars[old_accumulator_idx] & 3);
            this->symbolic_vars[lo_idx] == (this->symbolic_vars[quad_idx] & 1);
            if (i != (num_quads - 1) || ((num_bits)&1) != 1) {
                this->symbolic_vars[hi_idx] == (this->symbolic_vars[quad_idx] >> 1);
            }
        }

        left <= (bb::fr(2).pow(res) - 1);

        // You have to mark these arguments so they won't be optimized out
        optimized[left_idx] = false;
        return cursor + range_props.num_gates;
    }
    return res;
}

/**
 * @brief Relaxes shr constraints.
 * @details This function is needed when we use bitwise compatible
 * symbolic terms.
 * It compares the chunk of selectors of the current circuit
 * with pure shift left from uint/logic.cpp
 * After a match is found, it updates the cursor to skip all the
 * redundant constraints and adds a pure b = a >> n
 * constraint to solver.
 * If there's no match, it will return -1
 *
 * @param cursor current position
 * @return next position or -1
 */
size_t StandardCircuit::handle_shr_constraint(size_t cursor)
{
    auto res = static_cast<size_t>(-1);

    // Take a pure shr circuit for the current bit length
    // and compare it's selectors to selectors of the global circuit
    // at current position(cursor).
    // If they are equal, we can apply an optimization
    // However, if we have a match at bit length 2, it is possible
    // to have a match at higher bit lengths. That's why we store
    // the current match as `res` and proceed with ordinary binary search.
    // and we can skip this whole section.
    // The key is simply two bytes: uint type and sh

    const auto find_nr = [this, &cursor](auto& n, bool& shr_flag) {
        // Since shift right for even values of shift is pointless to check
        // we iterate only over odd ones
        for (uint32_t r = 1; r < static_cast<uint32_t>(n); r += 2) {
            uint32_t key = static_cast<uint32_t>(n) + 256 * r;
            if (!this->cached_subcircuits[SubcircuitType::SHR].contains(key)) {
                this->cached_subcircuits[SubcircuitType::SHR].insert({ key, get_standard_shift_right_circuit(n, r) });
            }
            CircuitProps shr_props = this->cached_subcircuits[SubcircuitType::SHR][key];
            CircuitSchema shr_circuit = shr_props.circuit;

            shr_flag = cursor + shr_props.num_gates <= this->selectors.size();
            if (!shr_flag) {
                continue;
            }

            for (size_t j = 0; j < shr_props.num_gates; j++) {
                // It is possible for gates to be equal but wires to be not, but I think it's very
                // unlikely to happen
                shr_flag &= shr_circuit.selectors[0][j + shr_props.start_gate] == this->selectors[cursor + j];

                if (!shr_flag) {
                    break;
                }
            }
            if (shr_flag) {
                return std::pair<uint32_t, uint32_t>(n, r);
            }
        }
        return std::pair<uint32_t, uint32_t>(-1, -1);
    };

    bool shr_flag = false;
    std::pair<uint32_t, uint32_t> nr;

    if (!shr_flag) {
        unsigned char n = 8;
        nr = find_nr(n, shr_flag);
    }
    if (!shr_flag) {
        uint16_t n = 16;
        nr = find_nr(n, shr_flag);
    }
    if (!shr_flag) {
        uint32_t n = 32;
        nr = find_nr(n, shr_flag);
    }
    if (!shr_flag) {
        uint64_t n = 64;
        nr = find_nr(n, shr_flag);
    }

    if (shr_flag) {
        info("SHR constraint optimization: ",
             std::to_string(nr.first),
             " bits ,",
             std::to_string(nr.second),
             " shift right");
        CircuitProps shr_props = this->cached_subcircuits[SubcircuitType::SHR][nr.first + 256 * nr.second];

        size_t left_gate = shr_props.gate_idxs[0];
        uint32_t left_gate_idx = shr_props.idxs[0];
        uint32_t left_idx = this->real_variable_index[this->wires_idxs[cursor + left_gate][left_gate_idx]];

        size_t out_gate = shr_props.gate_idxs[1];
        uint32_t out_gate_idx = shr_props.idxs[1];
        uint32_t out_idx = this->real_variable_index[this->wires_idxs[cursor + out_gate][out_gate_idx]];

        STerm left = this->symbolic_vars[left_idx];
        STerm out = this->symbolic_vars[out_idx];

        // Initializing the parts of the witness that were optimized
        // during the symbolic constraints initialization
        // i.e. simulating the uint's operator>> gate by gate using BitVectors/Integers
        uint32_t shift = nr.second;
        if ((shift & 1) == 1) {
            size_t processed_gates = 0;
            uint32_t c_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            uint32_t delta_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[delta_idx] == (this->symbolic_vars[c_idx] & 3);
            STerm delta = this->symbolic_vars[delta_idx];
            processed_gates += 1;
            uint32_t r0_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];

            // this->symbolic_vars[r0_idx] == (-2 * delta * delta + 9 * delta - 7);
            this->post_process.insert({ r0_idx, { delta_idx, delta_idx, -2, 9, 0, -7 } });

            processed_gates += 1;
            uint32_t r1_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[r1_idx] == (delta >> 1) * 6;
            processed_gates += 1;
            uint32_t r2_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[r2_idx] == (left >> shift) * 6;
            processed_gates += 1;
            uint32_t temp_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];

            // this->symbolic_vars[temp_idx] == -6 * out;
            this->post_process.insert({ temp_idx, { out_idx, out_idx, 0, -6, 0, 0 } });
        }

        STerm shred = left >> nr.second;
        out == shred;

        // You have to mark these arguments so they won't be optimized out
        optimized[left_idx] = false;
        optimized[out_idx] = false;
        return cursor + shr_props.num_gates;
    }
    return res;
}
/**
 * @brief Relaxes shl constraints.
 * @details This function is needed when we use bitwise compatible
 * symbolic terms.
 * It compares the chunk of selectors of the current circuit
 * with pure shift left from uint/logic.cpp
 * After a match is found, it updates the cursor to skip all the
 * redundant constraints and adds a pure b = a << n
 * constraint to solver.
 * If there's no match, it will return -1
 *
 * @param cursor current position
 * @return next position or -1
 */
size_t StandardCircuit::handle_shl_constraint(size_t cursor)
{
    auto res = static_cast<size_t>(-1);

    // Take a pure shl circuit for the current bit length
    // and compare it's selectors to selectors of the global circuit
    // at current position(cursor).
    // If they are equal, we can apply an optimization
    // However, if we have a match at bit length 2, it is possible
    // to have a match at higher bit lengths. That's why we store
    // the current match as `res` and proceed with ordinary binary search.
    // and we can skip this whole section.
    // The key is simply two bytes: uint type and sh

    const auto find_nr = [this, &cursor](auto& n, bool& shl_flag) {
        for (uint32_t r = 1; r < static_cast<uint32_t>(n); r++) {
            uint32_t key = static_cast<uint32_t>(n) + 256 * r;
            if (!this->cached_subcircuits[SubcircuitType::SHL].contains(key)) {
                this->cached_subcircuits[SubcircuitType::SHL].insert({ key, get_standard_shift_left_circuit(n, r) });
            }
            CircuitProps shl_props = this->cached_subcircuits[SubcircuitType::SHL][key];
            CircuitSchema shl_circuit = shl_props.circuit;

            shl_flag = cursor + shl_props.num_gates <= this->selectors.size();
            if (!shl_flag) {
                continue;
            }

            for (size_t j = 0; j < shl_props.num_gates; j++) {
                // It is possible for gates to be equal but wires to be not, but I think it's very
                // unlikely to happen
                shl_flag &= shl_circuit.selectors[0][j + shl_props.start_gate] == this->selectors[cursor + j];

                if (!shl_flag) {
                    break;
                }
            }
            if (shl_flag) {
                return std::pair<uint32_t, uint32_t>(n, r);
            }
        }
        return std::pair<uint32_t, uint32_t>(-1, -1);
    };

    bool shl_flag = false;
    std::pair<uint32_t, uint32_t> nr;

    if (!shl_flag) {
        unsigned char n = 8;
        nr = find_nr(n, shl_flag);
    }
    if (!shl_flag) {
        uint16_t n = 16;
        nr = find_nr(n, shl_flag);
    }
    if (!shl_flag) {
        uint32_t n = 32;
        nr = find_nr(n, shl_flag);
    }
    if (!shl_flag) {
        uint64_t n = 64;
        nr = find_nr(n, shl_flag);
    }

    if (shl_flag) {
        info("SHL constraint optimization: ",
             std::to_string(nr.first),
             " bits ,",
             std::to_string(nr.second),
             " shift left");
        CircuitProps shl_props = this->cached_subcircuits[SubcircuitType::SHL][nr.first + 256 * nr.second];

        size_t left_gate = shl_props.gate_idxs[0];
        uint32_t left_gate_idx = shl_props.idxs[0];
        uint32_t left_idx = this->real_variable_index[this->wires_idxs[cursor + left_gate][left_gate_idx]];

        size_t out_gate = shl_props.gate_idxs[1];
        uint32_t out_gate_idx = shl_props.idxs[1];
        uint32_t out_idx = this->real_variable_index[this->wires_idxs[cursor + out_gate][out_gate_idx]];

        STerm left = this->symbolic_vars[left_idx];
        STerm out = this->symbolic_vars[out_idx];

        // Initializing the parts of the witness that were optimized
        // during the symbolic constraints initialization
        // i.e. simulating the uint's operator<< gate by gate using BitVectors/Integers
        uint32_t num_bits = nr.first;
        uint32_t shift = nr.second;
        if ((shift & 1) == 1) {
            size_t processed_gates = 0;
            uint32_t c_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            uint32_t delta_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[delta_idx] == (this->symbolic_vars[c_idx] & 3);
            STerm delta = this->symbolic_vars[delta_idx];
            processed_gates += 1;
            uint32_t r0_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];

            // this->symbolic_vars[r0_idx] == (-2 * delta * delta + 9 * delta - 7);
            this->post_process.insert({ r0_idx, { delta_idx, delta_idx, -2, 9, 0, -7 } });

            processed_gates += 1;
            uint32_t r1_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[r1_idx] == (delta >> 1) * 6;
            processed_gates += 1;
            uint32_t r2_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[r2_idx] == (left >> (num_bits - shift)) * 6;
            processed_gates += 1;
            uint32_t temp_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];

            // this->symbolic_vraiables[temp_idx] == -6 * r2
            this->post_process.insert({ temp_idx, { r2_idx, r2_idx, 0, -1, 0, 0 } });
        }

        STerm shled = (left << shift) & (bb::fr(2).pow(num_bits) - 1);
        out == shled;

        // You have to mark these arguments so they won't be optimized out
        optimized[left_idx] = false;
        optimized[out_idx] = false;
        return cursor + shl_props.num_gates;
    }
    return res;
}

/**
 * @brief Relaxes ror constraints.
 * @details This function is needed when we use bitwise compatible
 * symbolic terms.
 * It compares the chunk of selectors of the current circuit
 * with pure ror from uint/logic.cpp
 * After a match is found, it updates the cursor to skip all the
 * redundant constraints and adds a pure b = a.ror(n)
 * constraint to solver.
 * If there's no match, it will return -1
 *
 * @param cursor current position
 * @return next position or -1
 */
size_t StandardCircuit::handle_ror_constraint(size_t cursor)
{
    auto res = static_cast<size_t>(-1);

    // Take a pure ror circuit for the current bit length
    // and compare it's selectors to selectors of the global circuit
    // at current position(cursor).
    // If they are equal, we can apply an optimization
    // However, if we have a match at bit length 2, it is possible
    // to have a match at higher bit lengths. That's why we store
    // the current match as `res` and proceed with ordinary binary search.
    // and we can skip this whole section.
    // The key is simply two bytes: uint type and sh

    const auto find_nr = [this, &cursor](auto& n, bool& ror_flag) {
        for (uint32_t r = 1; r < static_cast<uint32_t>(n); r++) {
            uint32_t key = static_cast<uint32_t>(n) + 256 * r;
            if (!this->cached_subcircuits[SubcircuitType::ROR].contains(key)) {
                this->cached_subcircuits[SubcircuitType::ROR].insert({ key, get_standard_ror_circuit(n, r) });
            }
            CircuitProps ror_props = this->cached_subcircuits[SubcircuitType::ROR][key];
            CircuitSchema ror_circuit = ror_props.circuit;

            ror_flag = cursor + ror_props.num_gates <= this->selectors.size();
            if (!ror_flag) {
                continue;
            }

            for (size_t j = 0; j < ror_props.num_gates; j++) {
                // It is possible for gates to be equal but wires to be not, but I think it's very
                // unlikely to happen
                ror_flag &= ror_circuit.selectors[0][j + ror_props.start_gate] == this->selectors[cursor + j];

                if (!ror_flag) {
                    break;
                }
            }
            if (ror_flag) {
                return std::pair<uint32_t, uint32_t>(n, r);
            }
        }
        return std::pair<uint32_t, uint32_t>(-1, -1);
    };

    bool ror_flag = false;
    std::pair<uint32_t, uint32_t> nr;

    if (!ror_flag) {
        unsigned char n = 8;
        nr = find_nr(n, ror_flag);
    }
    if (!ror_flag) {
        uint16_t n = 16;
        nr = find_nr(n, ror_flag);
    }
    if (!ror_flag) {
        uint32_t n = 32;
        nr = find_nr(n, ror_flag);
    }
    if (!ror_flag) {
        uint64_t n = 64;
        nr = find_nr(n, ror_flag);
    }

    if (ror_flag) {
        info("ROR constraint optimization: ",
             std::to_string(nr.first),
             " bits ,",
             std::to_string(nr.second),
             " rotation right");
        CircuitProps ror_props = this->cached_subcircuits[SubcircuitType::ROR][nr.first + 256 * nr.second];

        size_t left_gate = ror_props.gate_idxs[0];
        uint32_t left_gate_idx = ror_props.idxs[0];
        uint32_t left_idx = this->real_variable_index[this->wires_idxs[cursor + left_gate][left_gate_idx]];

        size_t out_gate = ror_props.gate_idxs[1];
        uint32_t out_gate_idx = ror_props.idxs[1];
        uint32_t out_idx = this->real_variable_index[this->wires_idxs[cursor + out_gate][out_gate_idx]];

        STerm left = this->symbolic_vars[left_idx];
        STerm out = this->symbolic_vars[out_idx];

        // Initializing the parts of the witness that were optimized
        // during the symbolic constraints initialization
        // i.e. simulating the uint's rotate_right gate by gate using BitVectors/Integers
        uint32_t num_bits = nr.first;
        uint32_t rotation = nr.second;
        if ((rotation & 1) == 1) {
            size_t processed_gates = 0;
            uint32_t c_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][0]];
            uint32_t delta_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[delta_idx] == (this->symbolic_vars[c_idx] & 3);
            STerm delta = this->symbolic_vars[delta_idx];
            processed_gates += 1;
            uint32_t r0_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];

            // this->symbolic_vars[r0_idx] == (-2 * delta * delta + 9 * delta - 7);
            this->post_process.insert({ r0_idx, { delta_idx, delta_idx, -2, 9, 0, -7 } });

            processed_gates += 1;
            uint32_t r1_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[r1_idx] == (delta >> 1) * 6;
            processed_gates += 1;
            uint32_t r2_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];
            this->symbolic_vars[r2_idx] == (left >> rotation) * 6;
            processed_gates += 1;
            uint32_t temp_idx = this->real_variable_index[this->wires_idxs[cursor + processed_gates][2]];

            // this->symbolic_vraiables[temp_idx] == -6 * r2
            this->post_process.insert({ temp_idx, { r2_idx, r2_idx, 0, -1, 0, 0 } });
        }

        STerm rored = ((left >> rotation) | (left << (num_bits - rotation))) & (bb::fr(2).pow(num_bits) - 1);
        out == rored;

        // You have to mark these arguments so they won't be optimized out
        optimized[left_idx] = false;
        optimized[out_idx] = false;
        return cursor + ror_props.num_gates;
    }
    return res;
}

/**
 * @brief Similar functionality to old .check_circuit() method
 * in standard circuit builder.
 *
 * @param witness
 * @return true
 * @return false
 */
bool StandardCircuit::simulate_circuit_eval(std::vector<bb::fr>& witness) const
{
    if (witness.size() != this->get_num_vars()) {
        throw std::invalid_argument("Witness size should be " + std::to_string(this->get_num_vars()) + ", not " +
                                    std::to_string(witness.size()));
    }
    for (size_t i = 0; i < this->selectors.size(); i++) {
        bb::fr res = 0;
        bb::fr x = witness[this->wires_idxs[i][0]];
        bb::fr y = witness[this->wires_idxs[i][1]];
        bb::fr o = witness[this->wires_idxs[i][2]];
        res += this->selectors[i][0] * x * y;
        res += this->selectors[i][1] * x;
        res += this->selectors[i][2] * y;
        res += this->selectors[i][3] * o;
        res += this->selectors[i][4];
        if (res != 0) {
            return false;
        }
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
std::pair<StandardCircuit, StandardCircuit> StandardCircuit::unique_witness_ext(
    CircuitSchema& circuit_info,
    Solver* s,
    TermType type,
    const std::vector<std::string>& equal,
    const std::vector<std::string>& not_equal,
    const std::vector<std::string>& equal_at_the_same_time,
    const std::vector<std::string>& not_equal_at_the_same_time,
    bool enable_optimizations)
{
    StandardCircuit c1(circuit_info, s, type, "circuit1", enable_optimizations);
    StandardCircuit c2(circuit_info, s, type, "circuit2", enable_optimizations);

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
std::pair<StandardCircuit, StandardCircuit> StandardCircuit::unique_witness(CircuitSchema& circuit_info,
                                                                            Solver* s,
                                                                            TermType type,
                                                                            const std::vector<std::string>& equal,
                                                                            bool enable_optimizations)
{
    StandardCircuit c1(circuit_info, s, type, "circuit1", enable_optimizations);
    StandardCircuit c2(circuit_info, s, type, "circuit2", enable_optimizations);

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