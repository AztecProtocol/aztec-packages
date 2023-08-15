#include "../field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "../../hash/pedersen/pedersen.hpp"
#include "../../hash/pedersen/pedersen_gates.hpp"

#include "./cycle_group.hpp"
namespace proof_system::plonk::stdlib {

template <typename Composer> Composer* cycle_group<Composer>::get_context(const cycle_group& other)
{
    if (get_context() != nullptr) {
        return get_context();
    }
    if (other.get_context() != nullptr) {
        return other.get_context();
    }
    return nullptr;
}

/**
 * @brief Evaluates a doubling
 *
 * @tparam Composer
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::dbl()
{
    auto context = get_context();

    auto p1 = get_value();
    affine_element p3(element(p1).dbl());
    cycle_group result = cycle_group<Composer>::from_witness(context, p3);

    proof_system::ecc_dbl_gate_<FF> dbl_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
    };

    context->create_ecc_dbl_gate(dbl_gate);
    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::unconditional_add(const cycle_group& other)
{
    auto context = get_context(other);

    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();
    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group<Composer>::from_witness(context, get_value());
        return lhs.unconditional_add(other);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group<Composer>::from_witness(context, other.get_value());
        return unconditional_add(rhs);
    }

    const auto p1 = get_value();
    const auto p2 = other.get_value();
    affine_element p3(element(p1) + element(p2));
    if (lhs_constant && rhs_constant) {
        return cycle_group(p3);
    }
    cycle_group result = cycle_group<Composer>::from_witness(context, p3);

    proof_system::ecc_add_gate_<FF> add_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x2 = other.x.get_witness_index(),
        .y2 = other.y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
        .endomorphism_coefficient = 1,
        .sign_coefficient = 1,
    };
    context->create_ecc_add_gate(add_gate);

    return result;
}

/**
 * @brief will evaluate ECC point subtraction over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::unconditional_subtract(const cycle_group& other)
{
    auto context = get_context(other);

    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();

    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group<Composer>::from_witness(context, get_value());
        return lhs.unconditional_subtract(other);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group<Composer>::from_witness(context, other.get_value());
        return unconditional_subtract(rhs);
    }
    auto p1 = get_value();
    auto p2 = other.get_value();
    affine_element p3(element(p1) - element(p2));
    if (lhs_constant && rhs_constant) {
        return cycle_group(p3);
    }
    cycle_group result = cycle_group<Composer>::from_witness(context, p3);

    proof_system::ecc_add_gate_<FF> add_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x2 = other.x.get_witness_index(),
        .y2 = other.y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
        .endomorphism_coefficient = 1,
        .sign_coefficient = -1,
    };
    context->create_ecc_add_gate(add_gate);

    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::constrained_unconditional_add(const cycle_group& other)
{
    field_t x_delta = x - other.x;
    x_delta.assert_is_not_zero("cycle_group::constrained_unconditional_add, x-coordinate collision");
    return unconditional_add(other);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::constrained_unconditional_subtract(const cycle_group& other)
{
    field_t x_delta = x - other.x;
    x_delta.assert_is_not_zero("cycle_group::constrained_unconditional_subtract, x-coordinate collision");
    return unconditional_subtract(other);
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::operator+(const cycle_group& other)
{

    Composer* context = get_context(other);
    auto add_result = unconditional_add(other);
    auto dbl_result = dbl();

    // dbl if x_match, y_match
    // infinity if x_match, !y_match
    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && y_coordinates_match).normalize();
    const bool_t infinity_predicate = (x_coordinates_match && !y_coordinates_match).normalize();
    cycle_group result(context);
    result.x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    result.y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_infinity;
    const bool_t rhs_infinity = other.is_infinity;
    // if lhs infinity, return rhs
    result.x = field_t::conditional_assign(lhs_infinity, other.x, result.x);
    result.y = field_t::conditional_assign(lhs_infinity, other.y, result.y);

    // if rhs infinity, return lhs
    result.x = field_t::conditional_assign(rhs_infinity, x, result.x);
    result.y = field_t::conditional_assign(rhs_infinity, y, result.y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimise this
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);
    result.is_infinity = result_is_infinity;
    return result;
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::operator-(const cycle_group& other)
{

    Composer* context = get_context(other);
    auto add_result = unconditional_subtract(other);
    auto dbl_result = dbl();

    // dbl if x_match, !y_match
    // infinity if x_match, y_match
    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && !y_coordinates_match).normalize();
    const bool_t infinity_predicate = (x_coordinates_match && y_coordinates_match).normalize();
    cycle_group result(context);
    result.x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    result.y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_infinity;
    const bool_t rhs_infinity = other.is_infinity;
    // if lhs infinity, return -rhs
    result.x = field_t::conditional_assign(lhs_infinity, other.x, result.x);
    result.y = field_t::conditional_assign(lhs_infinity, (-other.y).normalize(), result.y);

    // if rhs infinity, return lhs
    result.x = field_t::conditional_assign(rhs_infinity, x, result.x);
    result.y = field_t::conditional_assign(rhs_infinity, y, result.y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimise this
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);
    result.is_infinity = result_is_infinity;

    return result;
}

template <typename Composer> cycle_group<Composer>& cycle_group<Composer>::operator+=(const cycle_group& other)
{
    *this = *this + other;
    return *this;
}

template <typename Composer> cycle_group<Composer>& cycle_group<Composer>::operator-=(const cycle_group& other)
{
    *this = *this - other;
    return *this;
}

INSTANTIATE_STDLIB_TYPE(cycle_group);

} // namespace proof_system::plonk::stdlib
