// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Standard UltraHonk arithmetic constraint of width 4
 */
using QuadConstraint = mul_quad_<bb::fr>;

/**
 * @brief Constraint representing a polynomial of degree 1 or 2 that does not fit into a standard UltraHonk arithmetic
 * constraint of width 4
 *
 * @details Each BigQuadConstraint represents an expression
 * \f[
 *          \sum_{i, j} c_{ij} w_i * w_j + \sum_i c_i w_i + const = 0
 * \f]
 * that has been split into multiple QuadConstraint gates using w4_shift (the 4th wire of the next gate) to reduce the
 * number of intermediate variables. See also the documentation for create_big_quad_constraint
 */
class BigQuadConstraint : public std::vector<QuadConstraint> {
  public:
    using Base = std::vector<QuadConstraint>;
    using Base::Base; // Inherit all constructors from std::vector

    // Explicitly define vector copy constructor (not inherited by default)
    BigQuadConstraint(const std::vector<QuadConstraint>& fields)
        : Base(fields)
    {}
};

/**
 * @brief Replace indices which are set to IS_CONSTANT with the zero index of the builder
 *
 * @details When creating a mul_quad_ gate, unused witness indices are set to IS_CONSTANT. When adding the gate to
 * the builder, we replace these indices with the zero index. Note that we don't do this replacement for a, so that
 * we implicitly get a check that the gate is non-zero when adding it to the Builder.
 */
template <typename Builder> void set_zero_idx(const Builder& builder, QuadConstraint& mul_quad);

/**
 * @brief Check if a mul add gate is valid.
 *
 */
template <typename Builder>
void check_mul_add_gate(Builder& builder,
                        const QuadConstraint& mul_quad,
                        const typename Builder::FF next_wire_w4 = Builder::FF::zero());

/**
 * @brief Create a simple width-4 Ultra arithmetic gate constraint representing the equation
 * \f[
 *    mul_{scaling} * (a * b) +
 *          a_{scaling} * a + b_{scaling} * b + c_{scaling} * c + d_{scaling} * d + const == 0
 * \f]
 *
 */
template <typename Builder> void create_quad_constraint(Builder& builder, QuadConstraint& mul_quad);

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
template <typename Builder> void create_big_quad_constraint(Builder& builder, BigQuadConstraint& big_constraint);

} // namespace acir_format
