// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "big_quad_constraints.hpp"
#include "acir_format.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace acir_format {

using namespace bb;

// clang-format off
/**
 * @brief Complete the construction of a big quad constraint by assigning the d-terms to the gates after the first one.
 *
 * @details The function split_into_mul_quad_gates turned an Acir::Expression, which represents a calculation of the form
 * \f[
 *          \sum_{i, j} c_{ij} w_i * w_j + \sum_i c_i w_i + const = 0
 * \f]
 * into a series of partially-filled width-4 arithmetic gates (mul_quad_). They are partially filled because to limit the
 * number of intermediate variables used to represent the expression each gate after the first one enforces the following
 * equation:
 * \f[
 *    mul_{scaling} * (a * b) +
 *          a_{scaling} * a + b_{scaling} * b + c_{scaling} * c + d_{scaling} * d + const + w4_{shift} == 0
 * \f]
 * where \f$w4_{shift}\f$ is the value of the fourth wire in the previous gate. This value is not known when splitting the expression,
 * so split_into_mul_quad_gates leaves it unassigned (it sets it to IS_CONSTANT). This function adds the intermediate witnesses to
 * the builder and completes the gates.
 *
 * @example Consider the expression: w1 * w2 + w3 * w4 + w5 + w6 + w7 + const == 0. This expression doesn't fit into a single width-4
 * arithmetic gate as it contains 2 multiplications terms (and also because it contains 7 distinct witnesses). We turn this expression into
 * the following series of gates (where w4_shift is toggled on in all gates but the last one):
 *
 * | a_idx | b_idx | c_idx | d_idx                        | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const_idx   |
 * |-------|-------|-------|------------------------------|-------------|-----------|-----------|-----------|-----------|-------------|
 * | w1    | w2    | w5    | w6                           | 1           | 1         | 1         | 1         | 1         | const       |
 * | w3    | w4    | w7    | -(w1 * w2 + w5 + w6 + const) | 1           | 1         | 1         | 1         | -1        | IS_CONSTANT |
 *
 * If we didn't have the option of using w4_shift, we would have needed a third gate to accomodate the expression. Note that we
 * don't know the witness index of the witness -(w1 * w2 + w5 + w6 + const) when we split the expression into multiple gates.
 */
// clang-format on
template <typename Builder>
void create_big_quad_constraint(Builder& builder, std::vector<mul_quad_<typename Builder::FF>>& big_constraint)
{
    using fr = typename Builder::FF;

    // The index/value of the 4-th witness in the next gate (not used in the first gate)
    // It is result of the expression calculated on the current gate
    uint32_t next_w4_wire_idx = 0;
    fr next_w4_wire_value = fr::zero();

    for (size_t j = 0; j < big_constraint.size() - 1; ++j) {
        // Replace IS_CONSTANT indices with zero indices
        set_zero_idx(builder, big_constraint[j]);
        // Create the mul_add gate
        builder.create_big_mul_add_gate(big_constraint[j], /*include_next_gate_w_4*/ true);
        // Update the index/value of the 4-th wire
        next_w4_wire_value = builder.get_variable(big_constraint[j].a) * builder.get_variable(big_constraint[j].b) *
                                 big_constraint[j].mul_scaling +
                             builder.get_variable(big_constraint[j].a) * big_constraint[j].a_scaling +
                             builder.get_variable(big_constraint[j].b) * big_constraint[j].b_scaling +
                             builder.get_variable(big_constraint[j].c) * big_constraint[j].c_scaling +
                             builder.get_variable(big_constraint[j].d) * big_constraint[j].d_scaling +
                             big_constraint[j].const_scaling;
        next_w4_wire_value = -next_w4_wire_value;
        next_w4_wire_idx = builder.add_variable(next_w4_wire_value);
        // Set the 4-th wire of the next gate
        big_constraint[j + 1].d = next_w4_wire_idx;
        big_constraint[j + 1].d_scaling = fr(-1);
    }
    set_zero_idx(builder, big_constraint.back());
    builder.create_big_mul_add_gate(big_constraint.back(), /*include_next_gate_w_4*/ false);
}

template void create_big_quad_constraint<UltraCircuitBuilder>(
    UltraCircuitBuilder& builder, std::vector<mul_quad_<UltraCircuitBuilder::FF>>& big_constraint);

template void create_big_quad_constraint<MegaCircuitBuilder>(
    MegaCircuitBuilder& builder, std::vector<mul_quad_<MegaCircuitBuilder::FF>>& big_constraint);

} // namespace acir_format
