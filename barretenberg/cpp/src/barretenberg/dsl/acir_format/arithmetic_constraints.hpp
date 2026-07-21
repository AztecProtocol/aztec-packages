// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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
 * @brief Bilinear constraint — BILINEAR mode of the bilinear_batched_eq gate (see
 * bilinear_or_batched_eq_check_relation.hpp).
 *
 * @details Represents the shared-wire two-product shape
 * \f$ q_m \cdot a \cdot b + q_5 \cdot a \cdot c + q_l \cdot a + q_r \cdot b + q_o \cdot c + q_4 \cdot d
 * + q_c = 0 \f$, i.e. two products sharing wire `a`. Wire `d` carries only a linear term. Present only in
 * Mega circuits.
 */
struct BilinearConstraint {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    bb::fr q_m; // first product (a·b) selector
    bb::fr q_l;
    bb::fr q_r;
    bb::fr q_o;
    bb::fr q_4;
    bb::fr q_5; // second product (a·c) selector
    bb::fr q_c;

    friend bool operator==(BilinearConstraint const& lhs, BilinearConstraint const& rhs) = default;
};

/**
 * @brief BatchedEq constraint — BATCHED_EQ mode of the bilinear_batched_eq gate (see
 * bilinear_or_batched_eq_check_relation.hpp).
 *
 * @details Represents the two independent equalities \f$ q_l \cdot a + q_r \cdot b + q_c = 0 \f$
 * (batched-eq-half-1) and \f$ q_o \cdot c + q_4 \cdot d + q_m = 0 \f$ (batched-eq-half-2).  Present only in Mega
 * circuits.
 */
struct BatchedEqCheckConstraint {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    bb::fr q_l;
    bb::fr q_r;
    bb::fr q_o;
    bb::fr q_4;
    bb::fr q_c; // batched-eq-half-1 constant
    bb::fr q_m; // batched-eq-half-2 constant

    friend bool operator==(BatchedEqCheckConstraint const& lhs, BatchedEqCheckConstraint const& rhs) = default;
};

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
 * @brief Check that a bilinear batched-eq gate is valid.
 *
 */
template <typename Builder>
void check_bilinear_batched_eq_gate(Builder& builder,
                                    const bilinear_batched_eq_gate_<typename Builder::FF>& bilinear_batched_eq);

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
 * | a_idx | b_idx | c_idx | d_idx                        | mul_scaling | a_scaling | b_scaling | c_scaling | d_scaling | const       |
 * |-------|-------|-------|------------------------------|-------------|-----------|-----------|-----------|-----------|-------------|
 * | w1    | w2    | w5    | w6                           | 1           | 0         | 0         | 1         | 1         | const       |
 * | w3    | w4    | w7    | -(w1 * w2 + w5 + w6 + const) | 1           | 1         | 1         | 1         | -1        | 0           |
 *
 * If we didn't have the option of using w4_shift, we would have needed a third gate to accomodate the expression. Note that we
 * don't know the witness index of the witness -(w1 * w2 + w5 + w6 + const) when we split the expression into multiple gates.
 */
// clang-format on
template <typename Builder> void create_big_quad_constraint(Builder& builder, BigQuadConstraint& big_constraint);

/**
 * @brief Emit a BILINEAR-mode bilinear_batched_eq gate row
 *
 * @details Translates the BilinearConstraint into the builder's bilinear_batched_eq gate (mode = Bilinear)
 * and emits it.
 */
template <typename Builder> void create_bilinear_constraint(Builder& builder, const BilinearConstraint& constraint);

/**
 * @brief Emit a BATCHED_EQ-mode bilinear_batched_eq gate row described by `constraint` on `builder`.
 *
 * @details Translates the BatchedEqCheckConstraint into the builder's bilinear_batched_eq gate (mode = BatchedEq) and
 * emits it.
 */
template <typename Builder>
void create_batched_eq_check_constraint(Builder& builder, const BatchedEqCheckConstraint& constraint);

} // namespace acir_format
