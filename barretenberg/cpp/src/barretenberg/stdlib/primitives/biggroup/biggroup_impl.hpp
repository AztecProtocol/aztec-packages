// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../circuit_builders/circuit_builders.hpp"
#include "../plookup/plookup.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators.hpp"
#include "barretenberg/numeric/general/general.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib::element_default {

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::element()
    : _x()
    , _y()
    , _is_infinity()
{}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::element(const typename G::affine_element& input)
    : _x(nullptr, input.x)
    , _y(nullptr, input.y)
    , _is_infinity(nullptr, input.is_point_at_infinity())
{}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::element(const Fq& x_in, const Fq& y_in)
    : _x(x_in)
    , _y(y_in)
    , _is_infinity(_x.get_context() ? _x.get_context() : _y.get_context(), false)
{}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::element(const Fq& x_in, const Fq& y_in, const bool_ct& is_infinity)
    : _x(x_in)
    , _y(y_in)
    , _is_infinity(is_infinity)
{}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::element(const element& other)
    : _x(other._x)
    , _y(other._y)
    , _is_infinity(other.is_point_at_infinity())
{}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::element(element&& other) noexcept
    : _x(other._x)
    , _y(other._y)
    , _is_infinity(other.is_point_at_infinity())
{}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>& element<C, Fq, Fr, G>::operator=(const element& other)
{
    if (&other == this) {
        return *this;
    }
    _x = other._x;
    _y = other._y;
    _is_infinity = other.is_point_at_infinity();
    return *this;
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>& element<C, Fq, Fr, G>::operator=(element&& other) noexcept
{
    if (&other == this) {
        return *this;
    }
    _x = other._x;
    _y = other._y;
    _is_infinity = other.is_point_at_infinity();
    return *this;
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::operator+(const element& other) const
{

    // Adding in `x_coordinates_match` ensures that lambda will always be well-formed
    // Our curve has the form y^2 = x^3 + b.
    // If (x_1, y_1), (x_2, y_2) have x_1 == x_2, and the generic formula for lambda has a division by 0.
    // Then y_1 == y_2 (i.e. we are doubling) or y_2 == y_1 (the sum is infinity).
    // The cases have a special addition formula. The following booleans allow us to handle these cases uniformly.
    const bool_ct x_coordinates_match = other._x == _x;
    const bool_ct y_coordinates_match = (_y == other._y);
    const bool_ct infinity_predicate = (x_coordinates_match && !y_coordinates_match);
    const bool_ct double_predicate = (x_coordinates_match && y_coordinates_match);
    const bool_ct lhs_infinity = is_point_at_infinity();
    const bool_ct rhs_infinity = other.is_point_at_infinity();
    const bool_ct has_infinity_input = lhs_infinity || rhs_infinity;

    // Compute the gradient `lambda`. If we add, `lambda = (y2 - y1)/(x2 - x1)`, else `lambda = 3x1*x1/2y1
    const Fq add_lambda_numerator = other._y - _y;
    const Fq xx = _x * _x;
    const Fq dbl_lambda_numerator = xx + xx + xx;
    const Fq lambda_numerator = Fq::conditional_assign(double_predicate, dbl_lambda_numerator, add_lambda_numerator);

    const Fq add_lambda_denominator = other._x - _x;
    const Fq dbl_lambda_denominator = _y + _y;
    Fq lambda_denominator = Fq::conditional_assign(double_predicate, dbl_lambda_denominator, add_lambda_denominator);
    // If either inputs are points at infinity, we set lambda_denominator to be 1. This ensures we never trigger a
    // divide by zero error.
    // Note: if either inputs are points at infinity we will not use the result of this computation.
    Fq safe_edgecase_denominator = Fq(1);
    lambda_denominator =
        Fq::conditional_assign(has_infinity_input || infinity_predicate, safe_edgecase_denominator, lambda_denominator);
    const Fq lambda = Fq::div_without_denominator_check({ lambda_numerator }, lambda_denominator);

    const Fq x3 = lambda.sqradd({ -other._x, -_x });
    const Fq y3 = lambda.madd(_x - x3, { -_y });

    element result(x3, y3);
    // if lhs infinity, return rhs
    result._x = Fq::conditional_assign(lhs_infinity, other._x, result._x);
    result._y = Fq::conditional_assign(lhs_infinity, other._y, result._y);
    // if rhs infinity, return lhs
    result._x = Fq::conditional_assign(rhs_infinity, _x, result._x);
    result._y = Fq::conditional_assign(rhs_infinity, _y, result._y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimize this
    bool_ct result_is_infinity = (infinity_predicate && !has_infinity_input) || (lhs_infinity && rhs_infinity);
    result.set_point_at_infinity(result_is_infinity, /* add_to_used_witnesses */ true);

    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return result;
}

/**
 * @brief Enforce x and y coordinates of a point to be (0, 0) in the case of point at infinity
 *
 * @details We need to have a standard witness in Noir and the point at infinity can have non-zero random
 * coefficients when we get it as output from our optimized algorithms. This function returns a (0, 0) point, if
 * it is a point at infinity
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::get_standard_form() const
{

    const bool_ct is_infinity = is_point_at_infinity();
    element result(*this);
    const Fq zero = Fq::zero();
    result._x = Fq::conditional_assign(is_infinity, zero, this->_x);
    result._y = Fq::conditional_assign(is_infinity, zero, this->_y);
    return result;
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::operator-(const element& other) const
{

    // if x_coordinates match, lambda triggers a divide by zero error.
    // Adding in `x_coordinates_match` ensures that lambda will always be well-formed
    const bool_ct x_coordinates_match = other._x == _x;
    const bool_ct y_coordinates_match = (_y == other._y);
    const bool_ct infinity_predicate = (x_coordinates_match && y_coordinates_match);
    const bool_ct double_predicate = (x_coordinates_match && !y_coordinates_match);
    const bool_ct lhs_infinity = is_point_at_infinity();
    const bool_ct rhs_infinity = other.is_point_at_infinity();
    const bool_ct has_infinity_input = lhs_infinity || rhs_infinity;

    // Compute the gradient `lambda`. If we add, `lambda = (y2 - y1)/(x2 - x1)`, else `lambda = 3x1*x1/2y1
    const Fq add_lambda_numerator = -other._y - _y;
    const Fq xx = _x * _x;
    const Fq dbl_lambda_numerator = xx + xx + xx;
    const Fq lambda_numerator = Fq::conditional_assign(double_predicate, dbl_lambda_numerator, add_lambda_numerator);

    const Fq add_lambda_denominator = other._x - _x;
    const Fq dbl_lambda_denominator = _y + _y;
    Fq lambda_denominator = Fq::conditional_assign(double_predicate, dbl_lambda_denominator, add_lambda_denominator);
    // If either inputs are points at infinity, we set lambda_denominator to be 1. This ensures we never trigger
    // a divide by zero error. (if either inputs are points at infinity we will not use the result of this
    // computation)
    Fq safe_edgecase_denominator = Fq(1);
    lambda_denominator =
        Fq::conditional_assign(has_infinity_input || infinity_predicate, safe_edgecase_denominator, lambda_denominator);
    const Fq lambda = Fq::div_without_denominator_check({ lambda_numerator }, lambda_denominator);

    const Fq x3 = lambda.sqradd({ -other._x, -_x });
    const Fq y3 = lambda.madd(_x - x3, { -_y });

    element result(x3, y3);
    // if lhs infinity, return rhs
    result._x = Fq::conditional_assign(lhs_infinity, other._x, result._x);
    result._y = Fq::conditional_assign(lhs_infinity, -other._y, result._y);
    // if rhs infinity, return lhs
    result._x = Fq::conditional_assign(rhs_infinity, _x, result._x);
    result._y = Fq::conditional_assign(rhs_infinity, _y, result._y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimize this
    bool_ct result_is_infinity = (infinity_predicate && !has_infinity_input) || (lhs_infinity && rhs_infinity);

    result.set_point_at_infinity(result_is_infinity, /* add_to_used_witnesses */ true);
    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return result;
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::checked_unconditional_add(const element& other) const
{
    other._x.assert_is_not_equal(_x);
    const Fq lambda = Fq::div_without_denominator_check({ other._y, -_y }, (other._x - _x));
    const Fq x3 = lambda.sqradd({ -other._x, -_x });
    const Fq y3 = lambda.madd(_x - x3, { -_y });
    return element(x3, y3);
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::checked_unconditional_subtract(const element& other) const
{

    other._x.assert_is_not_equal(_x);
    const Fq lambda = Fq::div_without_denominator_check({ other._y, _y }, (other._x - _x));
    const Fq x_3 = lambda.sqradd({ -other._x, -_x });
    const Fq y_3 = lambda.madd(x_3 - _x, { -_y });

    return element(x_3, y_3);
}

/**
 * @brief Compute (*this) + other AND (*this) - other as a size-2 array
 *
 * @details We require this operation when computing biggroup lookup tables for
 *          multi-scalar-multiplication. This combined method reduces the number of
 *          field additions, field subtractions required (as well as 1 less assert_is_not_equal check)
 *
 * @tparam C
 * @tparam Fq
 * @tparam Fr
 * @tparam G
 * @param other
 * @return std::array<element<C, Fq, Fr, G>, 2>
 */
// TODO(https://github.com/AztecProtocol/barretenberg/issues/657): This function is untested
template <typename C, class Fq, class Fr, class G>
std::array<element<C, Fq, Fr, G>, 2> element<C, Fq, Fr, G>::checked_unconditional_add_sub(const element& other) const
{
    // validate we can use incomplete addition formulae
    other._x.assert_is_not_equal(_x);

    const Fq denominator = other._x - _x;
    const Fq x2x1 = -(other._x + _x);

    const Fq lambda1 = Fq::div_without_denominator_check({ other._y, -_y }, denominator);
    const Fq x_3 = lambda1.sqradd({ x2x1 });
    const Fq y_3 = lambda1.madd(_x - x_3, { -_y });
    const Fq lambda2 = Fq::div_without_denominator_check({ -other._y, -_y }, denominator);
    const Fq x_4 = lambda2.sqradd({ x2x1 });
    const Fq y_4 = lambda2.madd(_x - x_4, { -_y });

    return { element(x_3, y_3), element(x_4, y_4) };
}

template <typename C, class Fq, class Fr, class G> element<C, Fq, Fr, G> element<C, Fq, Fr, G>::dbl() const
{

    Fq two_x = _x + _x;
    if constexpr (G::has_a) {
        Fq a(get_context(), uint256_t(G::curve_a));
        Fq neg_lambda = Fq::msub_div({ _x }, { (two_x + _x) }, (_y + _y), { a }, /*enable_divisor_nz_check*/ false);
        Fq x_3 = neg_lambda.sqradd({ -(two_x) });
        Fq y_3 = neg_lambda.madd(x_3 - _x, { -_y });
        // TODO(suyash): do we handle the point at infinity case here?
        return element(x_3, y_3);
    }
    // TODO(): handle y = 0 case.
    Fq neg_lambda = Fq::msub_div({ _x }, { (two_x + _x) }, (_y + _y), {}, /*enable_divisor_nz_check*/ false);
    Fq x_3 = neg_lambda.sqradd({ -(two_x) });
    Fq y_3 = neg_lambda.madd(x_3 - _x, { -_y });
    element result = element(x_3, y_3);
    result.set_point_at_infinity(is_point_at_infinity());
    return result;
}

/**
 * Evaluate a chain addition!
 *
 * When adding a set of points P_1 + ... + P_N, we do not need to compute the y-coordinate of intermediate
 *addition terms.
 *
 * i.e. we substitute `acc.y` with `acc.y = acc.lambda_prev * (acc.x1_prev - acc.x) - acc.y1_prev`
 *
 * `lambda_prev, x1_prev, y1_prev` are the `lambda, x1, y1` terms from the previous addition operation.
 *
 * `chain_add` requires 1 less non-native field reduction than a regular add operation.
 **/

/**
 * begin a chain of additions
 * input points p1 p2
 * output accumulator = x3_prev (output x coordinate), x1_prev, y1_prev (p1), lambda_prev (y2 - y1) / (x2 - x1)
 **/
template <typename C, class Fq, class Fr, class G>
typename element<C, Fq, Fr, G>::chain_add_accumulator element<C, Fq, Fr, G>::chain_add_start(const element& p1,
                                                                                             const element& p2)
{
    chain_add_accumulator output;
    output.x1_prev = p1._x;
    output.y1_prev = p1._y;

    p1._x.assert_is_not_equal(p2._x);
    const Fq lambda = Fq::div_without_denominator_check({ p2._y, -p1._y }, (p2._x - p1._x));

    const Fq x3 = lambda.sqradd({ -p2._x, -p1._x });
    output.x3_prev = x3;
    output.lambda_prev = lambda;
    return output;
}

template <typename C, class Fq, class Fr, class G>
typename element<C, Fq, Fr, G>::chain_add_accumulator element<C, Fq, Fr, G>::chain_add(const element& p1,
                                                                                       const chain_add_accumulator& acc)
{
    // use `chain_add_start` to start an addition chain (i.e. if acc has a y-coordinate)
    if (acc.is_full_element) {
        return chain_add_start(p1, element(acc.x3_prev, acc.y3_prev));
    }
    // validate we can use incomplete addition formulae
    p1._x.assert_is_not_equal(acc.x3_prev);

    // lambda = (y2 - y1) / (x2 - x1)
    // but we don't have y2!
    // however, we do know that y2 = lambda_prev * (x1_prev - x2) - y1_prev
    // => lambda * (x2 - x1) = lambda_prev * (x1_prev - x2) - y1_prev - y1
    // => lambda * (x2 - x1) + lambda_prev * (x2 - x1_prev) + y1 + y1_pev = 0
    // => lambda = lambda_prev * (x1_prev - x2) - y1_prev - y1 / (x2 - x1)
    // => lambda = - (lambda_prev * (x2 - x1_prev) + y1_prev + y1) / (x2 - x1)

    /**
     *
     * We compute the following terms:
     *
     * lambda = acc.lambda_prev * (acc.x1_prev - acc.x) - acc.y1_prev - p1.y / acc.x - p1.x
     * x3 = lambda * lambda - acc.x - p1.x
     *
     * Requires only 2 non-native field reductions
     **/
    auto& x2 = acc.x3_prev;
    const auto lambda =
        Fq::msub_div({ acc.lambda_prev },
                     { (x2 - acc.x1_prev) },
                     (x2 - p1._x),
                     { acc.y1_prev, p1._y },
                     /*enable_divisor_nz_check*/ false); // divisor is non-zero as x2 != p1.x is enforced
    const auto x3 = lambda.sqradd({ -x2, -p1._x });

    chain_add_accumulator output;
    output.x3_prev = x3;
    output.x1_prev = p1._x;
    output.y1_prev = p1._y;
    output.lambda_prev = lambda;

    return output;
}

/**
 * End an addition chain. Produces a full output group element with a y-coordinate
 **/
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::chain_add_end(const chain_add_accumulator& acc)
{
    if (acc.is_full_element) {
        return element(acc.x3_prev, acc.y3_prev);
    }
    auto& x3 = acc.x3_prev;
    auto& lambda = acc.lambda_prev;

    Fq y3 = lambda.madd((acc.x1_prev - x3), { -acc.y1_prev });
    return element(x3, y3);
}

/**
 * @brief Perform repeated iterations of the montgomery ladder algorithm.
 *
 * For points P, Q, montgomery ladder computes R = (P + Q) + P
 * i.e. it's "double-and-add" without explicit doublings.
 *
 * This method can apply repeated iterations of the montgomery ladder.
 * Each iteration reduces the number of field multiplications by 1, at the cost of more additions.
 * (i.e. we don't compute intermediate y-coordinates).
 *
 * The number of additions scales with the size of the input vector. The optimal input size appears to be 4.
 *
 * @tparam C
 * @tparam Fq
 * @tparam Fr
 * @tparam G
 * @param add
 * @return element<C, Fq, Fr, G>
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::multiple_montgomery_ladder(
    const std::vector<chain_add_accumulator>& add) const
{
    struct composite_y {
        std::vector<Fq> mul_left;
        std::vector<Fq> mul_right;
        std::vector<Fq> add;
        bool is_negative = false;
    };

    // Handle edge case of empty input
    if (add.empty()) {
        return *this;
    }

    // Let A = (x, y) and P = (x₁, y₁)
    // For the first point P, we want to compute: (2A + P) = (A + P) + A
    // We first need to check if x ≠ x₁.
    x().assert_is_not_equal(add[0].x3_prev);

    // Compute λ₁ for computing the first addition: (A + P)
    Fq lambda1;
    if (!add[0].is_full_element) {
        // Case 1: P is an accumulator (i.e., it lacks a y-coordinate)
        //         λ₁ = (y - y₁) / (x - x₁)
        //            = -(y₁ - y) / (x - x₁)
        //            = -(λ₁_ₚᵣₑᵥ * (x₁_ₚᵣₑᵥ - x₁) - y₁_ₚᵣₑᵥ - y) / (x - x₁)
        //
        // NOTE: msub_div computes -(∑ᵢ aᵢ * bᵢ + ∑ⱼcⱼ) / d
        lambda1 = Fq::msub_div({ add[0].lambda_prev },              // numerator left multiplicands: λ₁_ₚᵣₑᵥ
                               { add[0].x1_prev - add[0].x3_prev }, // numerator right multiplicands: (x₁_ₚᵣₑᵥ - x₁)
                               (x() - add[0].x3_prev),              // denominator: (x - x₁)
                               { -add[0].y1_prev, -y() },           // numerator additions: -y₁_ₚᵣₑᵥ - y
                               /*enable_divisor_nz_check*/ false);  // divisor check is not needed as x ≠ x₁ is enforced
    } else {
        // Case 2: P is a full element (i.e., it has a y-coordinate)
        //         λ₁ = (y - y₁) / (x - x₁)
        //
        lambda1 = Fq::div_without_denominator_check({ y() - add[0].y3_prev }, (x() - add[0].x3_prev));
    }

    // Using λ₁, compute x₃ for (A + P):
    // x₃ = λ₁.λ₁ - x₁ - x
    Fq x_3 = lambda1.madd(lambda1, { -add[0].x3_prev, -x() });

    // Compute λ₂ for the addition (A + P) + A:
    // λ₂ = (y - y₃) / (x - x₃)
    //    = (y - (λ₁ * (x - x₃) - y)) / (x - x₃)    (substituting y₃)
    //    = (2y) / (x - x₃) - λ₁
    //
    x().assert_is_not_equal(x_3);
    Fq lambda2 = Fq::div_without_denominator_check({ y() + y() }, (x() - x_3)) - lambda1;

    // Using λ₂, compute x₄ for the final result:
    // x₄ = λ₂.λ₂ - x₃ - x
    Fq x_4 = lambda2.sqradd({ -x_3, -x() });

    // Compute y₄ for the final result:
    // y₄ = λ₂ * (x - x₄) - y
    //
    // However, we don't actually compute y₄ here. Instead, we build a "composite" y value that contains
    // the components needed to compute y₄ later. This is done to avoid the explicit multiplication here.
    //
    // We store the result as either y₄ or -y₄, depending on whether the number of points added
    // is even or odd. This sign adjustment simplifies the handling of subsequent additions in the loop below.
    // +y₄ = λ₂ * (x - x₄) - y
    // -y₄ = λ₂ * (x₄ - x) + y
    const bool num_points_even = ((add.size() & 1ULL) == 0);
    composite_y previous_y;
    previous_y.add.emplace_back(num_points_even ? y() : -y());
    previous_y.mul_left.emplace_back(lambda2);
    previous_y.mul_right.emplace_back(num_points_even ? x_4 - x() : x() - x_4);
    previous_y.is_negative = num_points_even;

    // Handle remaining iterations (i > 0) in a loop
    Fq previous_x = x_4;
    for (size_t i = 1; i < add.size(); ++i) {
        // Let x = previous_x, y = previous_y
        // Let P = (xᵢ, yᵢ) be the next point to add (represented by add[i])
        // Ensure x-coordinates are distinct: x ≠ xᵢ
        previous_x.assert_is_not_equal(add[i].x3_prev);

        // Determine sign adjustment based on previous y's sign
        // If the previous y was positive, we need to negate the y-component from add[i]
        const bool negate_add_y = !previous_y.is_negative;

        // Build λ₁ numerator components from previous composite y and current accumulator
        std::vector<Fq> lambda1_left = previous_y.mul_left;
        std::vector<Fq> lambda1_right = previous_y.mul_right;
        std::vector<Fq> lambda1_add = previous_y.add;

        if (!add[i].is_full_element) {
            // Case 1: add[i] is an accumulator (lacks y-coordinate)
            //         λ₁ = (y - yᵢ) / (x - xᵢ)
            //            = -(yᵢ - y) / (x - xᵢ)
            //            = -(λᵢ_ₚᵣₑᵥ * (xᵢ_ₚᵣₑᵥ - xᵢ) - yᵢ_ₚᵣₑᵥ - y) / (x - xᵢ)
            //
            // If (previous) y is stored as positive, we compute λ₁ as:
            //         λ₁ = -(λᵢ_ₚᵣₑᵥ * (xᵢ - xᵢ_ₚᵣₑᵥ) + yᵢ_ₚᵣₑᵥ + y) / (xᵢ - x)
            //
            lambda1_left.emplace_back(add[i].lambda_prev);
            lambda1_right.emplace_back(negate_add_y ? add[i].x3_prev - add[i].x1_prev
                                                    : add[i].x1_prev - add[i].x3_prev);
            lambda1_add.emplace_back(negate_add_y ? add[i].y1_prev : -add[i].y1_prev);
        } else {
            // Case 2: add[i] is a full element (has y-coordinate)
            //         λ₁ = (yᵢ - y) / (xᵢ - x)
            //
            // If previous y is positive, we compute λ₁ as:
            //         λ₁ = -(y - yᵢ) / (xᵢ - x)
            //
            lambda1_add.emplace_back(negate_add_y ? -add[i].y3_prev : add[i].y3_prev);
        }

        // Compute λ₁
        Fq denominator = negate_add_y ? add[i].x3_prev - previous_x : previous_x - add[i].x3_prev;
        Fq lambda1 =
            Fq::msub_div(lambda1_left, lambda1_right, denominator, lambda1_add, /*enable_divisor_nz_check*/ false);

        // Using λ₁, compute x₃ for (previous + P):
        // x₃ = λ₁.λ₁ - xᵢ - x
        // y₃ = λ₁ * (x - x₃) - y (we don't compute this explicitly)
        Fq x_3 = lambda1.madd(lambda1, { -add[i].x3_prev, -previous_x });

        // Compute λ₂ using previous composite y
        // λ₂ = (y - y₃) / (x - x₃)
        //    = (y - (λ₁ * (x - x₃) - y)) / (x - x₃)    (substituting y₃)
        //    = (2y) / (x - x₃) - λ₁
        //    = -2(y / (x₃ - x)) - λ₁
        //
        previous_x.assert_is_not_equal(x_3);
        Fq l2_denominator = previous_y.is_negative ? previous_x - x_3 : x_3 - previous_x;
        Fq partial_lambda2 = Fq::msub_div(previous_y.mul_left,
                                          previous_y.mul_right,
                                          l2_denominator,
                                          previous_y.add,
                                          /*enable_divisor_nz_check*/ false);
        partial_lambda2 = partial_lambda2 + partial_lambda2;
        lambda2 = partial_lambda2 - lambda1;

        // Using λ₂, compute x₄ for the final result of this iteration:
        // x₄ = λ₂.λ₂ - x₃ - x
        x_4 = lambda2.sqradd({ -x_3, -previous_x });

        // Build composite y for this iteration
        // y₄ = λ₂ * (x - x₄) - y
        // However, we don't actually compute y₄ explicitly, we rather store components to compute it later.
        // We store the result as either y₄ or -y₄, depending on the sign of previous_y.
        // +y₄ = λ₂ * (x - x₄) - y
        // -y₄ = λ₂ * (x₄ - x) + y
        composite_y y_4;
        y_4.is_negative = !previous_y.is_negative;
        y_4.mul_left.emplace_back(lambda2);
        y_4.mul_right.emplace_back(previous_y.is_negative ? previous_x - x_4 : x_4 - previous_x);

        // Append terms from previous_y to y_4. We want to make sure the terms above are added into the start
        // of y_4. This is to ensure they are cached correctly when
        // `builder::evaluate_partial_non_native_field_multiplication` is called. (the 1st mul_left, mul_right elements
        // will trigger builder::evaluate_non_native_field_multiplication
        //  when Fq::mult_madd is called - this term cannot be cached so we want to make sure it is unique)
        std::copy(previous_y.mul_left.begin(), previous_y.mul_left.end(), std::back_inserter(y_4.mul_left));
        std::copy(previous_y.mul_right.begin(), previous_y.mul_right.end(), std::back_inserter(y_4.mul_right));
        std::copy(previous_y.add.begin(), previous_y.add.end(), std::back_inserter(y_4.add));

        previous_x = x_4;
        previous_y = y_4;
    }

    Fq x_out = previous_x;

    BB_ASSERT(!previous_y.is_negative);

    Fq y_out = Fq::mult_madd(previous_y.mul_left, previous_y.mul_right, previous_y.add);
    return element(x_out, y_out);
}

/**
 * compute_offset_generators! Let's explain what an offset generator is...
 *
 * We evaluate biggroup group operations using INCOMPLETE addition formulae for short weierstrass curves:
 *
 * L   = y - y  / x  - x
 *        2   1    2    1
 *
 *          2
 * x   =   L  - x  - x
 *  3            2    1
 *
 * y   =  L (x  - x ) - y
 *  3         1    3     1
 *
 * These formuale do not work for the edge case where x2 == x1
 *
 * Instead of handling the edge case (which is expensive!) we instead FORBID it from happening by
 * requiring x2 != x1 (other.x.assert_is_not_equal(x) will be present in all group operation methods)
 *
 * This means it is essential we ensure an honest prover will NEVER run into this edge case, or our circuit will
 * lack completeness!
 *
 * To ensure an honest prover will not fall foul of this edge case when performing a SCALAR MULTIPLICATION,
 * we init the accumulator with an `offset_generator` point.
 * This point is a generator point that is not equal to the regular generator point for this curve.
 *
 * When adding points into the accumulator, the probability that an honest prover will find a collision is now ~
 * 1 in 2^128
 *
 * We init `accumulator = generator` and then perform an n-bit scalar mul.
 * The output accumulator will contain a term `2^{n-1} * generator` that we need to subtract off.
 *
 * `offset_generators.first = generator` (the initial generator point)
 * `offset_generators.second = 2^{n-1} * generator` (the final generator point we need to subtract off from our
 * accumulator)
 */
template <typename C, class Fq, class Fr, class G>
std::pair<element<C, Fq, Fr, G>, element<C, Fq, Fr, G>> element<C, Fq, Fr, G>::compute_offset_generators(
    const size_t num_rounds)
{
    constexpr typename G::affine_element offset_generator =
        get_precomputed_generators<G, "biggroup offset generator", 1>()[0];

    const uint256_t offset_multiplier = uint256_t(1) << uint256_t(num_rounds - 1);

    const typename G::affine_element offset_generator_end = typename G::element(offset_generator) * offset_multiplier;
    return std::make_pair<element, element>(offset_generator, offset_generator_end);
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::process_strauss_msm_rounds(const std::vector<element>& points,
                                                                        const std::vector<Fr>& scalars,
                                                                        const size_t max_num_bits)
{
    // Sanity checks
    BB_ASSERT_GT(points.size(), 0ULL, "process_strauss_msm: points cannot be empty");
    BB_ASSERT_EQ(points.size(), scalars.size(), "process_strauss_msm: points and scalars size mismatch");

    // Check that all scalars are in range
    for (const auto& scalar : scalars) {
        const size_t num_scalar_bits = static_cast<size_t>(uint512_t(scalar.get_value()).get_msb()) + 1ULL;
        BB_ASSERT_LTE(num_scalar_bits, max_num_bits, "process_strauss_msm: scalar out of range");
    }

    // Constant parameters
    const size_t num_rounds = max_num_bits;
    const size_t msm_size = scalars.size();

    // Compute ROM lookup table for points. Example if we have 3 points G1, G2, G3:
    // ┌───────┬─────────────────┐
    // │ Index │ Point           │
    // ├───────┼─────────────────┤
    // │   0   │  G1 + G2 + G3   │
    // │   1   │  G1 + G2 - G3   │
    // │   2   │  G1 - G2 + G3   │
    // │   3   │  G1 - G2 - G3   │
    // │   4   │ -G1 + G2 + G3   │
    // │   5   │ -G1 + G2 - G3   │
    // │   6   │ -G1 - G2 + G3   │
    // │   7   │ -G1 - G2 - G3   │
    // └───────┴─────────────────┘
    batch_lookup_table point_table(points);

    // Compute NAF representations of scalars
    std::vector<std::vector<bool_ct>> naf_entries;
    for (size_t i = 0; i < msm_size; ++i) {
        naf_entries.emplace_back(compute_naf(scalars[i], num_rounds));
    }

    // We choose a deterministic offset generator based on the number of rounds.
    // We compute both the initial and final offset generators: G_offset, 2ⁿ⁻¹ * G_offset.
    const auto [offset_generator_start, offset_generator_end] = compute_offset_generators(num_rounds);

    // Initialize accumulator with offset generator + first NAF column.
    element accumulator =
        element::chain_add_end(element::chain_add(offset_generator_start, point_table.get_chain_initial_entry()));

    // Process 4 NAF entries per iteration (for the remaining (num_rounds - 1) rounds)
    constexpr size_t num_rounds_per_iteration = 4;
    const size_t num_iterations = numeric::ceil_div((num_rounds - 1), num_rounds_per_iteration);
    const size_t num_rounds_per_final_iteration = (num_rounds - 1) - ((num_iterations - 1) * num_rounds_per_iteration);

    for (size_t i = 0; i < num_iterations; ++i) {
        std::vector<element::chain_add_accumulator> to_add;
        const size_t inner_num_rounds =
            (i != num_iterations - 1) ? num_rounds_per_iteration : num_rounds_per_final_iteration;
        for (size_t j = 0; j < inner_num_rounds; ++j) {
            // Gather the NAF columns for this iteration
            std::vector<bool_ct> nafs(msm_size);
            for (size_t k = 0; k < msm_size; ++k) {
                nafs[k] = (naf_entries[k][(i * num_rounds_per_iteration) + j + 1]);
            }
            to_add.emplace_back(point_table.get_chain_add_accumulator(nafs));
        }

        // Once we have looked-up all points from the four NAF columns, we update the accumulator as:
        // accumulator = 2.(2.(2.(2.accumulator + to_add[0]) + to_add[1]) + to_add[2]) + to_add[3]
        //             = 2⁴.accumulator + 2³.to_add[0] + 2².to_add[1] + 2¹.to_add[2] + to_add[3]
        accumulator = accumulator.multiple_montgomery_ladder(to_add);
    }

    // Subtract the skew factors (if any)
    for (size_t i = 0; i < msm_size; ++i) {
        element skew = accumulator - points[i];
        accumulator = accumulator.conditional_select(skew, naf_entries[i][num_rounds]);
    }

    // Subtract the scaled offset generator
    accumulator = accumulator - offset_generator_end;

    return accumulator;
}

/**
 * @brief Generic batch multiplication that works for all elliptic curve types.
 *
 * @tparam C The circuit builder type.
 * @tparam Fq The field of definition of the points in `_points`.
 * @tparam Fr The field of scalars acting on `_points`.
 * @tparam G The group whose arithmetic is emulated by `element`.
 * @param _points
 * @param _scalars
 * @param max_num_bits The max of the bit lengths of the scalars.
 * @param with_edgecases Use when points are linearly dependent. Randomises them.
 * @return element<C, Fq, Fr, G>
 *
 * @details This is an implementation of the Strauss algorithm for multi-scalar-multiplication (MSM).
 *          It uses the Non-Adjacent Form (NAF) representation of scalars and ROM lookups to
 *          efficiently compute the MSM. The algorithm processes 4 bits of each scalar per iteration,
 *          accumulating the results in an accumulator point. The first NAF entry (I, see below) is used to
 *          -------------------------------
 *          Point  NAF(scalar)
 *          G1    [+1, -1, -1, -1, +1, ...]
 *          G2    [+1, +1, -1, -1, +1, ...]
 *          G3    [-1, +1, +1, -1, +1, ...]
 *                  ↑  ↑____________↑
 *                  I    Iteration 1
 *          -------------------------------
 *          select the initial point to add to the offset generator. Thereafter, we process 4 NAF entries
 *          per iteration. For one NAF entry, we lookup the corresponding points to add, and accumulate
 *          them using `chain_add_accumulator`. After processing 4 NAF entries, we perform a single
 *          `multiple_montgomery_ladder` call to update the accumulator. For example, in iteration 1 above,
 *          for the second NAF entry, the lookup output is:
 *          table(-1, +1, +1) = (-G1 + G2 + G3)
 *          This lookup output is accumulated with the lookup outputs from the other 3 NAF entries.
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::batch_mul(const std::vector<element>& _points,
                                                       const std::vector<Fr>& _scalars,
                                                       const size_t max_num_bits,
                                                       const bool with_edgecases,
                                                       const Fr& masking_scalar)
{
    // Sanity check input sizes
    BB_ASSERT_GT(_points.size(), 0ULL, "biggroup batch_mul: no points provided for batch multiplication");
    BB_ASSERT_EQ(_points.size(), _scalars.size(), "biggroup batch_mul: points and scalars size mismatch");

    // Replace (∞, scalar) pairs by the pair (G, 0).
    auto [points, scalars] = handle_points_at_infinity(_points, _scalars);

    BB_ASSERT_LTE(points.size(), _points.size());
    BB_ASSERT_EQ(points.size(),
                 scalars.size(),
                 "biggroup batch_mul: points and scalars size mismatch after handling points at infinity");

    // If batch_mul actually performs batch multiplication on the points and scalars, subprocedures can do
    // operations like addition or subtraction of points, which can trigger OriginTag security mechanisms
    // even though the final result satisfies the security logic. For example
    // result = submitted_in_round_0 * challenge_from_round_0 + submitted_in_round_1 * challenge_in_round_1
    // will trigger it, because the addition of submitted_in_round_0 to submitted_in_round_1 is dangerous by itself.
    // To avoid this, we remove the tags, merge them separately and set the result appropriately
    OriginTag tag{};
    const auto empty_tag = OriginTag();
    for (size_t i = 0; i < _points.size(); i++) {
        tag = OriginTag(tag, OriginTag(_points[i].get_origin_tag(), _scalars[i].get_origin_tag()));
    }
    for (size_t i = 0; i < scalars.size(); i++) {
        points[i].set_origin_tag(empty_tag);
        scalars[i].set_origin_tag(empty_tag);
    }

    // If with_edgecases is false, masking_scalar must be constant and equal to 1 (as it is unused).
    if (!with_edgecases) {
        BB_ASSERT_EQ(
            masking_scalar.is_constant() && masking_scalar.get_value() == 1,
            true,
            "biggroup batch_mul: masking_scalar must be constant (and equal to 1) when with_edgecases is false");
    }

    if (with_edgecases) {
        // If points are linearly dependent, we randomise them using a masking scalar.
        // We do this to ensure that the x-coordinates of the points are all distinct. This is required
        // while creating the ROM lookup table with the points.
        std::tie(points, scalars) = mask_points(points, scalars, masking_scalar);
    }

    BB_ASSERT_EQ(
        points.size(), scalars.size(), "biggroup batch_mul: points and scalars size mismatch after handling edgecases");

    // Separate out zero scalars and corresponding points (because NAF(0) = NAF(modulus) which is 254 bits long)
    // Also add the last point and scalar to big_points and big_scalars (because its a 254-bit scalar)
    // We do this only if max_num_bits != 0 (i.e. we are not forced to use 254 bits anyway)
    const size_t original_size = scalars.size();
    std::vector<Fr> big_scalars;
    std::vector<element> big_points;
    std::vector<Fr> small_scalars;
    std::vector<element> small_points;
    for (size_t i = 0; i < original_size; ++i) {
        if (max_num_bits == 0) {
            big_points.emplace_back(points[i]);
            big_scalars.emplace_back(scalars[i]);
        } else {
            const bool is_last_scalar_big = ((i == original_size - 1) && with_edgecases);
            if (scalars[i].get_value() == 0 || is_last_scalar_big) {
                big_points.emplace_back(points[i]);
                big_scalars.emplace_back(scalars[i]);
            } else {
                small_points.emplace_back(points[i]);
                small_scalars.emplace_back(scalars[i]);
            }
        }
    }

    BB_ASSERT_EQ(original_size,
                 small_points.size() + big_points.size(),
                 "biggroup batch_mul: points size mismatch after separating big scalars");
    BB_ASSERT_EQ(big_points.size(),
                 big_scalars.size(),
                 "biggroup batch_mul: big points and scalars size mismatch after separating big scalars");
    BB_ASSERT_EQ(small_points.size(),
                 small_scalars.size(),
                 "biggroup batch_mul: small points and scalars size mismatch after separating big scalars");

    const size_t max_num_bits_in_field = Fr::modulus.get_msb() + 1;
    element accumulator;
    if (!big_points.empty()) {
        // Process big scalars separately
        element big_result = element::process_strauss_msm_rounds(big_points, big_scalars, max_num_bits_in_field);
        accumulator = big_result;
    }

    if (!small_points.empty()) {
        // Process small scalars
        const size_t effective_max_num_bits = (max_num_bits == 0) ? max_num_bits_in_field : max_num_bits;
        element small_result = element::process_strauss_msm_rounds(small_points, small_scalars, effective_max_num_bits);
        accumulator = (big_points.size() > 0) ? accumulator + small_result : small_result;
    }

    accumulator.set_origin_tag(tag);
    return accumulator;
}
/**
 * Implements scalar multiplication operator.
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::operator*(const Fr& scalar) const
{
    // Use `scalar_mul` method without specifying the length of `scalar`.
    return scalar_mul(scalar);
}

template <typename C, class Fq, class Fr, class G>
/**
 * @brief Implements scalar multiplication that supports short scalars.
 * For multiple scalar multiplication use one of the `batch_mul` methods to save gates.
 * @param scalar A field element. If `max_num_bits`>0, the length of the scalar must not exceed `max_num_bits`.
 * @param max_num_bits Even integer < 254. Default value 0 corresponds to scalar multiplication by scalars of
 * unspecified length.
 * @return element<C, Fq, Fr, G>
 */
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::scalar_mul(const Fr& scalar, const size_t max_num_bits) const
{
    BB_ASSERT_EQ(max_num_bits % 2, 0U);
    /**
     *
     * Let's say we have some curve E defined over a field Fq. The order of E is p, which is prime.
     *
     * Now lets say we are constructing a SNARK circuit over another curve E2, whose order is r.
     *
     * All of our addition / multiplication / custom gates are going to be evaluating low degree multivariate
     * polynomials modulo r.
     *
     * E.g. our addition/mul gate (for wires a, b, c and selectors q_m, q_l, q_r, q_o, q_c) is:
     *
     *  q_m * a * b + q_l * a + q_r * b + q_o * c + q_c = 0 mod r
     *
     * We want to construct a circuit that evaluates scalar multiplications of curve E. Where q > r and p > r.
     *
     * i.e. we need to perform arithmetic in one prime field, using prime field arithmetic in a completely
     *different prime field.
     *
     * To do *this*, we need to emulate a binary (or in our case quaternary) number system in Fr, so that we can
     * use the binary/quaternary basis to emulate arithmetic in Fq. Which is very messy. See bigfield.hpp for
     *the specifics.
     *
     **/
    OriginTag tag{};
    tag = OriginTag(tag, OriginTag(this->get_origin_tag(), scalar.get_origin_tag()));

    bool_ct is_point_at_infinity = this->is_point_at_infinity();

    element result = element::batch_mul({ *this }, { scalar }, max_num_bits, /*with_edgecases=*/false);

    // Handle point at infinity
    result._x = Fq::conditional_assign(is_point_at_infinity, _x, result._x);
    result._y = Fq::conditional_assign(is_point_at_infinity, _y, result._y);

    result.set_point_at_infinity(is_point_at_infinity);

    // Propagate the origin tag
    result.set_origin_tag(tag);

    return result;
}
} // namespace bb::stdlib::element_default
