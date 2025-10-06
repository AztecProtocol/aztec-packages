// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "../field/field.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "./cycle_group.hpp"
#include "barretenberg/numeric/general/general.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
namespace bb::stdlib {

/**
 * @brief Construct a new constant point at infinity cycle group object.
 *
 * @note Don't use this constructor in case you want to assign the coordinates later.
 */
// AUDITTODO: Used only by fuzzer. Remove if possible, otherwise mark it accordingly.
template <typename Builder> cycle_group<Builder>::cycle_group(Builder* _context)
{
    *this = constant_infinity(_context);
}

/**
 * @brief Construct a new cycle group<Builder>::cycle group object
 *
 * @param _x
 * @param _y
 * @param is_infinity
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(field_t _x, field_t _y, bool_t is_infinity)
    : x(_x.normalize())
    , y(_y.normalize())
    , _is_infinity(is_infinity)
    , _is_standard(is_infinity.is_constant())
{
    if (_x.get_context() != nullptr) {
        context = _x.get_context();
    } else if (_y.get_context() != nullptr) {
        context = _y.get_context();
    } else {
        context = is_infinity.get_context();
    }

    if (is_infinity.is_constant() && is_infinity.get_value()) {
        *this = constant_infinity(this->context);
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1067): This ASSERT is missing in the constructor but
    // causes schnorr acir test to fail due to a bad input (a public key that has x and y coordinate set to 0).
    // Investigate this to be able to enable the test.
    // ASSERT(get_value().on_curve());
}

/**
 * @brief Construct a constant cycle_group object from raw field elements and a boolean
 *
 * @details is_infinity is a circuit constant. We EXPLICITLY require that whether this point is infinity/not infinity is
 * known at circuit-construction time *and* we know this point is on the curve. These checks are not constrained. Use
 * from_witness if these conditions are not met. Examples of when conditions are met: point is a derived from a point
 * that is on the curve + not at infinity. e.g. output of a doubling operation
 * @tparam Builder
 * @param _x
 * @param _y
 * @param is_infinity
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(const bb::fr& _x, const bb::fr& _y, bool is_infinity)
    : x(is_infinity ? 0 : _x)
    , y(is_infinity ? 0 : _y)
    , _is_infinity(is_infinity)
    , _is_standard(true)
    , context(nullptr)
{
    ASSERT(get_value().on_curve());
}

/**
 * @brief Construct a cycle_group object out of an AffineElement object
 * @details Uses convention that the coordinates of the point at infinity are (0,0).
 *
 * @note This produces a circuit-constant object i.e. known at compile-time, no constraints. If `_in` is not fixed for a
 * given circuit, use `from_witness` instead.
 * @tparam Builder
 * @param _in
 */
// AUDITTODO: Used only by fuzzer. Remove if possible, otherwise mark it accordingly.
template <typename Builder>
cycle_group<Builder>::cycle_group(const AffineElement& _in)
    : x(_in.is_point_at_infinity() ? 0 : _in.x)
    , y(_in.is_point_at_infinity() ? 0 : _in.y)
    , _is_infinity(_in.is_point_at_infinity())
    , _is_standard(true)
    , context(nullptr)
{}

/**
 * @brief Construct a constant cycle_group representation of Group::one.
 *
 * @tparam Builder
 * @param _context
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::one(Builder* _context)
{
    field_t x(_context, Group::one.x);
    field_t y(_context, Group::one.y);
    bool_t is_infinity(_context, false);

    return cycle_group<Builder>(x, y, is_infinity);
}

/**
 * @brief Construct a constant point at infinity.
 *
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::constant_infinity(Builder* _context)
{
    cycle_group result(bb::fr(0), bb::fr(0), /*is_infinity=*/true);

    // If context provided, create field_t/bool_t with that context
    if (_context != nullptr) {
        result.x = field_t(_context, bb::fr(0));
        result.y = field_t(_context, bb::fr(0));
        result._is_infinity = bool_t(_context, true);
        result.context = _context;
    }

    return result;
}

/**
 * @brief Converts an AffineElement into a circuit witness.
 *
 * @details Somewhat expensive as we do an on-curve check and `_is_infinity` is a witness and not a constant.
 *          If an element is being converted where it is known the element is on the curve and/or cannot be point at
 *          infinity, it is best to use other methods (e.g. direct conversion of field_t coordinates)
 *
 * @tparam Builder
 * @param _context
 * @param _in
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::from_witness(Builder* _context, const AffineElement& _in)
{
    cycle_group result(_context);

    // By convention we set the coordinates of the point at infinity to (0,0).
    if (_in.is_point_at_infinity()) {
        result.x = field_t::from_witness(_context, bb::fr::zero());
        result.y = field_t::from_witness(_context, bb::fr::zero());
    } else {
        result.x = field_t::from_witness(_context, _in.x);
        result.y = field_t::from_witness(_context, _in.y);
    }
    result._is_infinity = bool_t(witness_t(_context, _in.is_point_at_infinity()));
    result._is_standard = true;
    result.validate_on_curve();
    result.set_free_witness_tag();
    return result;
}

/**
 * @brief Converts a native AffineElement into a witness, but constrains the witness values to be known constants.
 *
 * @note This is useful when performing group operations where one operand is a witness and one is a constant. In such
 * cases it can be more efficient to convert the constant into a "fixed" witness because we have custom gates that
 * evaluate additions in one constraint, but only if both operands are witnesses.
 *
 * @tparam Builder
 * @param _context
 * @param _in
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::from_constant_witness(Builder* _context, const AffineElement& _in)
{
    cycle_group result(_context);

    if (_in.is_point_at_infinity()) {
        result = constant_infinity(_context);
    } else {
        result.x = field_t::from_witness(_context, _in.x);
        result.y = field_t::from_witness(_context, _in.y);
        result.x.assert_equal(result.x.get_value());
        result.y.assert_equal(result.y.get_value());
    }
    // point at infinity is circuit constant
    result._is_infinity = _in.is_point_at_infinity();
    result._is_standard = true;
    result.unset_free_witness_tag();
    return result;
}

template <typename Builder> Builder* cycle_group<Builder>::get_context(const cycle_group& other) const
{
    if (get_context() != nullptr) {
        return get_context();
    }
    return other.get_context();
}

template <typename Builder> typename cycle_group<Builder>::AffineElement cycle_group<Builder>::get_value() const
{
    AffineElement result(x.get_value(), y.get_value());
    if (is_point_at_infinity().get_value()) {
        result.self_set_infinity();
    }
    return result;
}

/**
 * @brief On-curve check.
 * @details Validates that the point satisfies the curve equation \f$y^2 = x^3 + b\f$ or is the point at infinity.
 *
 * @tparam Builder
 */
template <typename Builder> void cycle_group<Builder>::validate_on_curve() const
{
    // This class is for short Weierstrass curves only!
    static_assert(Group::curve_a == 0);
    auto xx = x * x;
    auto xxx = xx * x;
    auto res = y.madd(y, -xxx - Group::curve_b);
    // If this is the point at infinity, then res is changed to 0, otherwise it remains unchanged
    res *= !is_point_at_infinity();
    res.assert_is_zero();
}

/**
 * @brief Convert the point to standard form.
 * @details If the point is a point at infinity, ensure the coordinates are (0,0). If the point is already standard
 * nothing changes.
 *
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::get_standard_form()
{
    this->standardize();
    return *this;
}

#ifdef FUZZING
/**
 * @brief  Set the point to the point at infinity.
 * Depending on constant'ness of the predicate put the coordinates in an apropriate standard form.
 *
 */
template <typename Builder> void cycle_group<Builder>::set_point_at_infinity(const bool_t& is_infinity)
{
    this->_is_standard = true;

    if (is_infinity.is_constant() && this->_is_infinity.is_constant()) {
        // Check that it's not possible to enter the case when
        // The point is already infinity, but `is_infinity` = false
        ASSERT((this->_is_infinity.get_value() == is_infinity.get_value()) || is_infinity.get_value());

        if (is_infinity.get_value()) {
            *this = constant_infinity(this->context);
        }
        return;
    }

    if (is_infinity.is_constant() && !this->_is_infinity.is_constant()) {
        if (is_infinity.get_value()) {
            *this = constant_infinity(this->context);
        } else {
            this->_is_infinity.assert_equal(false);
            this->_is_infinity = false;
        }
        return;
    }

    if (this->is_constant_point_at_infinity()) {
        // I can't imagine this case happening, but still
        is_infinity.assert_equal(true);

        *this = constant_infinity(this->context);
        return;
    }

    this->x = field_t::conditional_assign(is_infinity, 0, this->x).normalize();
    this->y = field_t::conditional_assign(is_infinity, 0, this->y).normalize();

    // We won't bump into the case where we end up with non constant coordinates
    ASSERT(!this->x.is_constant());
    ASSERT(!this->y.is_constant());

    // We have to check this to avoid the situation, where we change the infinity
    bool_t set_allowed = (this->_is_infinity == is_infinity) || is_infinity;
    set_allowed.assert_equal(true);
    this->_is_infinity = is_infinity;

    // In case we set point at infinity on a constant without an existing context
    if (this->context == nullptr) {
        this->context = is_infinity.get_context();
    }
}
#endif

/**
 * @brief Convert the point to standard form.
 * @details If the point is a point at infinity, ensure the coordinates are (0,0). If the point is already standard
 * nothing changes.
 *
 */
template <typename Builder> void cycle_group<Builder>::standardize()
{
    if (this->is_constant_point_at_infinity()) {
        ASSERT(this->is_constant());
        ASSERT(this->_is_standard);
    }

    if (this->_is_standard) {
        return;
    }
    this->_is_standard = true;

    this->x = field_t::conditional_assign(this->_is_infinity, 0, this->x).normalize();
    this->y = field_t::conditional_assign(this->_is_infinity, 0, this->y).normalize();
}

/**
 * @brief Evaluates a point doubling using Ultra ECC double gate (if non-constant)
 *
 * @tparam Builder
 * @param hint native result of the doubling (optional; used to avoid modular inversions during witgen)
 * @return cycle_group<Builder> The doubled point
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::dbl(const std::optional<AffineElement> hint) const
{
    // If this is a constant point at infinity, return early
    if (this->is_constant_point_at_infinity()) {
        return *this;
    }

    // To support the point at infinity, we conditionally modify y to be 1 to avoid division by zero in the
    // doubling formula
    auto modified_y = field_t::conditional_assign(is_point_at_infinity(), 1, y).normalize();

    // Compute the doubled point coordinates (either from hint or by native calculation)
    bb::fr x3;
    bb::fr y3;
    if (hint.has_value()) {
        x3 = hint.value().x;
        y3 = hint.value().y;
    } else {
        const bb::fr x1 = x.get_value();
        const bb::fr y1 = modified_y.get_value();

        // N.B. the formula to derive the witness value for x3 mirrors the formula in elliptic_relation.hpp
        // Specifically, we derive x^4 via the Short Weierstrass curve formula y^2 = x^3 + b i.e. x^4 = x * (y^2 - b)
        // We must follow this pattern exactly to support the edge-case where the input is the point at infinity.
        const bb::fr y_pow_2 = y1.sqr();
        const bb::fr x_pow_4 = x1 * (y_pow_2 - Group::curve_b);
        const bb::fr lambda_squared = (x_pow_4 * 9) / (y_pow_2 * 4);
        const bb::fr lambda = (x1 * x1 * 3) / (y1 + y1);
        x3 = lambda_squared - x1 - x1;
        y3 = lambda * (x1 - x3) - y1;
    }

    // Construct the doubled point based on whether this is a constant or witness
    cycle_group result;
    if (is_constant()) {
        result = cycle_group(x3, y3, is_point_at_infinity());
        // Propagate the origin tag as-is
        result.set_origin_tag(get_origin_tag());
    } else {
        // Create result witness and construct ECC double constraint
        result = cycle_group(witness_t(context, x3), witness_t(context, y3), is_point_at_infinity());

        context->create_ecc_dbl_gate(bb::ecc_dbl_gate_<bb::fr>{
            .x1 = x.get_witness_index(),
            .y1 = modified_y.get_witness_index(),
            .x3 = result.x.get_witness_index(),
            .y3 = result.y.get_witness_index(),
        });

        // Merge the x and y origin tags since the output depends on both
        result.x.set_origin_tag(OriginTag(x.get_origin_tag(), y.get_origin_tag()));
        result.y.set_origin_tag(OriginTag(x.get_origin_tag(), y.get_origin_tag()));
    }

    return result;
}

/**
 * @brief Will evaluate ECC point addition or subtraction over `*this` and `other`.
 * @details Incomplete addition formula edge cases are *NOT* checked! Only use this method if you know the x-coordinates
 * of the operands cannot collide and none of the operands is a point at infinity. Uses Ultra-arithmetic elliptic curve
 * addition gate.
 *
 * @tparam Builder
 * @param other Point to add/subtract
 * @param is_addition : true for addition, false for subtraction
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder> Result of addition/subtraction
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::_unconditional_add_or_subtract(const cycle_group& other,
                                                                          bool is_addition,
                                                                          const std::optional<AffineElement> hint) const
{
    // This method should not be called on known points at infinity
    ASSERT(!this->is_constant_point_at_infinity(),
           "cycle_group::_unconditional_add_or_subtract called on constant point at infinity");
    ASSERT(!other.is_constant_point_at_infinity(),
           "cycle_group::_unconditional_add_or_subtract called on constant point at infinity");

    auto context = get_context(other);

    // If one point is a witness and the other is a constant, convert the constant to a fixed witness then call this
    // method again so we can use the ecc_add gate
    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();

    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group::from_constant_witness(context, get_value());
        lhs.set_origin_tag(get_origin_tag()); // Maintain the origin tag
        return lhs._unconditional_add_or_subtract(other, is_addition, hint);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group::from_constant_witness(context, other.get_value());
        rhs.set_origin_tag(other.get_origin_tag()); // Maintain the origin tag
        return _unconditional_add_or_subtract(rhs, is_addition, hint);
    }

    // Compute the result coordinates (either from hint or by native calculation)
    bb::fr x3;
    bb::fr y3;
    if (hint.has_value()) {
        x3 = hint.value().x;
        y3 = hint.value().y;
    } else {
        const AffineElement p1 = get_value();
        const AffineElement p2 = other.get_value();
        AffineElement p3 = is_addition ? (Element(p1) + Element(p2)) : (Element(p1) - Element(p2));
        x3 = p3.x;
        y3 = p3.y;
    }

    // Construct the result based on whether inputs are constant or witness
    cycle_group result;
    if (lhs_constant && rhs_constant) {
        result = cycle_group(x3, y3, /*is_infinity=*/false);
    } else {
        // Both points are witnesses - create result witness and construct ECC add constraint
        result = cycle_group(witness_t(context, x3), witness_t(context, y3), /*is_infinity=*/false);

        context->create_ecc_add_gate(bb::ecc_add_gate_<bb::fr>{
            .x1 = x.get_witness_index(),
            .y1 = y.get_witness_index(),
            .x2 = other.x.get_witness_index(),
            .y2 = other.y.get_witness_index(),
            .x3 = result.x.get_witness_index(),
            .y3 = result.y.get_witness_index(),
            .sign_coefficient = is_addition ? 1 : -1,
        });
    }

    // Merge the origin tags from both inputs
    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));

    return result;
}

template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_add(const cycle_group& other,
                                                             const std::optional<AffineElement> hint) const
{
    return _unconditional_add_or_subtract(other, /*is_addition=*/true, hint);
}

template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_subtract(const cycle_group& other,
                                                                  const std::optional<AffineElement> hint) const
{
    return _unconditional_add_or_subtract(other, /*is_addition=*/false, hint);
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 * @details Uses incomplete addition formula. If incomplete addition formula edge cases are triggered (x-coordinates of
 * operands collide), the constraints produced by this method will be unsatisfiable. Useful when an honest prover will
 * not produce a point collision with overwhelming probability, but a cheating prover will be able to.
 *
 * @tparam Builder
 * @param other Point to add
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::checked_unconditional_add(const cycle_group& other,
                                                                     const std::optional<AffineElement> hint) const
{
    const field_t x_delta = this->x - other.x;
    if (x_delta.is_constant()) {
        ASSERT(x_delta.get_value() != 0);
    } else {
        x_delta.assert_is_not_zero("cycle_group::checked_unconditional_add, x-coordinate collision");
    }
    return unconditional_add(other, hint);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 * @details Uses incomplete addition formula. If incomplete addition formula edge cases are triggered (x-coordinates of
 * operands collide), the constraints produced by this method will be unsatisfiable. Useful when an honest prover will
 * not produce a point collision with overwhelming probability, but a cheating prover will be able to.
 *
 * @tparam Builder
 * @param other Point to subtract
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::checked_unconditional_subtract(const cycle_group& other,
                                                                          const std::optional<AffineElement> hint) const
{
    const field_t x_delta = this->x - other.x;
    if (x_delta.is_constant()) {
        ASSERT(x_delta.get_value() != 0);
    } else {
        x_delta.assert_is_not_zero("cycle_group::checked_unconditional_subtract, x-coordinate collision");
    }
    return unconditional_subtract(other, hint);
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 * @details This method uses complete addition i.e. is compatible with all edge cases and is therefore expensive. To
 * handle the possibility of x-coordinate collisions we evaluate both an addition (modified to avoid division by zero)
 * and and a doubling, then conditionally assign the result.
 *
 * @tparam Builder
 * @param other Point to add
 * @return cycle_group<Builder> Result of addition
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator+(const cycle_group& other) const
{
    // If lhs is constant point at infinity, return the rhs and vice versa
    if (this->is_constant_point_at_infinity()) {
        return other;
    }
    if (other.is_constant_point_at_infinity()) {
        return *this;
    }

    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);

    const field_t x1 = x;
    const field_t y1 = y;
    const field_t x2 = other.x;
    const field_t y2 = other.y;

    // Execute point addition with modified lambda = (y2 - y1)/(x2 - x1 + x_coordinates_match) to avoid the possibility
    // of division by zero.
    const field_t x_diff = x2.add_two(-x1, x_coordinates_match);
    // Compute lambda in one of two ways depending on whether either numerator or denominator is constant or not
    field_t lambda;
    if ((y1.is_constant() && y2.is_constant()) || x_diff.is_constant()) {
        lambda = (y2 - y1).divide_no_zero_check(x_diff);
    } else {
        // Note: branch saves one gate vs just using divide_no_zero_check because we avoid computing y2 - y1 in circuit
        Builder* context = get_context(other);
        lambda = field_t::from_witness(context, (y2.get_value() - y1.get_value()) / x_diff.get_value());
        // We need to manually propagate the origin tag
        lambda.set_origin_tag(OriginTag(x_diff.get_origin_tag(), y1.get_origin_tag(), y2.get_origin_tag()));
        // Constrain x_diff * lambda = y2 - y1
        field_t::evaluate_polynomial_identity(x_diff, lambda, -y2, y1);
    }
    const field_t x3 = lambda.madd(lambda, -(x2 + x1)); // x3 = lambda^2 - x1 - x2
    const field_t y3 = lambda.madd(x1 - x3, -y1);       // y3 = lambda * (x1 - x3) - y1
    cycle_group add_result(x3, y3, /*is_infinity=*/x_coordinates_match);

    // Compute the doubling result
    const cycle_group dbl_result = dbl();

    // If the addition amounts to a doubling then the result is the doubling result, else the addition result.
    const bool_t double_predicate = (x_coordinates_match && y_coordinates_match);
    auto result_x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    auto result_y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    // If the lhs is the point at infinity, return rhs
    const bool_t lhs_infinity = is_point_at_infinity();
    result_x = field_t::conditional_assign(lhs_infinity, other.x, result_x);
    result_y = field_t::conditional_assign(lhs_infinity, other.y, result_y);

    // If the rhs is the point at infinity, return lhs
    const bool_t rhs_infinity = other.is_point_at_infinity();
    result_x = field_t::conditional_assign(rhs_infinity, x, result_x).normalize();
    result_y = field_t::conditional_assign(rhs_infinity, y, result_y).normalize();

    // The result is the point at infinity if:
    // (lhs.x, lhs.y) == (rhs.x, -rhs.y) and neither are infinity, OR both are the point at infinity
    const bool_t infinity_predicate = (x_coordinates_match && !y_coordinates_match);
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);

    return cycle_group(result_x, result_y, /*is_infinity=*/result_is_infinity);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 * @details This method uses complete subtraction i.e. is compatible with all edge cases and is therefore expensive. To
 * handle the possibility of x-coordinate collisions we evaluate both a subtraction (modified to avoid division by zero)
 * and a doubling, then conditionally assign the result.
 *
 * @tparam Builder
 * @param other Point to subtract
 * @return cycle_group<Builder> Result of subtraction
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator-(const cycle_group& other) const
{
    // If lhs is constant point at infinity, return -rhs
    if (this->is_constant_point_at_infinity()) {
        return -other;
    }
    // If rhs is constant point at infinity, return the lhs
    if (other.is_constant_point_at_infinity()) {
        return *this;
    }

    Builder* context = get_context(other);

    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);

    const field_t x1 = x;
    const field_t y1 = y;
    const field_t x2 = other.x;
    const field_t y2 = other.y;

    // Execute point addition with modified lambda = (-y2 - y1)/(x2 - x1 + x_coordinates_match) to avoid the possibility
    // of division by zero.
    const field_t x_diff = x2.add_two(-x1, x_coordinates_match);
    // Compute lambda in one of two ways depending on whether either numerator or denominator is constant or not
    field_t lambda;
    if ((y1.is_constant() && y2.is_constant()) || x_diff.is_constant()) {
        lambda = (-y2 - y1).divide_no_zero_check(x_diff);
    } else {
        // Note: branch saves one gate vs using divide_no_zero_check because we avoid computing (-y2 - y1) in circuit
        lambda = field_t::from_witness(context, (-y2.get_value() - y1.get_value()) / x_diff.get_value());
        // We need to manually propagate the origin tag
        lambda.set_origin_tag(OriginTag(x_diff.get_origin_tag(), y1.get_origin_tag(), y2.get_origin_tag()));
        // Constrain x_diff * lambda = -y2 - y1
        field_t::evaluate_polynomial_identity(x_diff, lambda, y2, y1);
    }
    const field_t x3 = lambda.madd(lambda, -(x2 + x1)); // x3 = lambda^2 - x1 - x2
    const field_t y3 = lambda.madd(x1 - x3, -y1);       // y3 = lambda * (x1 - x3) - y1
    cycle_group sub_result(x3, y3, /*is_infinity=*/x_coordinates_match);

    // Compute the doubling result
    const cycle_group dbl_result = dbl();

    // If the subtraction amounts to a doubling then the result is the doubling result, else the subtraction result.
    // AUDITTODO: The assumption here is that is y1 != y2 implies y1 == -y2. This is only true if the points are
    // guaranteed to be on the curve. Ideally we can ensure that on-curve checks are applied to all cycle_group
    // elements, otherwise we may need to be more precise with these predicates.
    const bool_t double_predicate = (x_coordinates_match && !y_coordinates_match);
    auto result_x = field_t::conditional_assign(double_predicate, dbl_result.x, sub_result.x);
    auto result_y = field_t::conditional_assign(double_predicate, dbl_result.y, sub_result.y);

    if (!result_x.is_constant()) {
        context->update_used_witnesses(result_x.witness_index);
    }
    if (!result_y.is_constant()) {
        context->update_used_witnesses(result_y.witness_index);
    }

    // If the lhs is the point at infinity, return -rhs
    const bool_t lhs_infinity = is_point_at_infinity();
    result_x = field_t::conditional_assign(lhs_infinity, other.x, result_x);
    result_y = field_t::conditional_assign(lhs_infinity, (-other.y).normalize(), result_y);

    // If the rhs is the point at infinity, return lhs
    const bool_t rhs_infinity = other.is_point_at_infinity();
    result_x = field_t::conditional_assign(rhs_infinity, x, result_x).normalize();
    result_y = field_t::conditional_assign(rhs_infinity, y, result_y).normalize();

    // The result is the point at infinity if:
    // (lhs.x, lhs.y) == (rhs.x, rhs.y) and neither are infinity, OR both are the point at infinity
    const bool_t infinity_predicate = (x_coordinates_match && y_coordinates_match).normalize();
    if (!infinity_predicate.is_constant()) {
        context->update_used_witnesses(infinity_predicate.get_normalized_witness_index());
    }
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);

    return cycle_group(result_x, result_y, /*is_infinity=*/result_is_infinity);
}

/**
 * @brief Negates a point
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator-() const
{
    cycle_group result(*this);
    // We have to normalize immediately. All the methods, related to
    // elliptic curve operations, assume that the coordinates are in normalized form and
    // don't perform any extra normalizations
    result.y = (-y).normalize();
    return result;
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator+=(const cycle_group& other)
{
    *this = *this + other;
    return *this;
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator-=(const cycle_group& other)
{
    *this = *this - other;
    return *this;
}

/**
 * @brief Internal logic to perform a variable-base batch mul using the Straus MSM algorithm.
 *
 * @details Computes \f$\sum_i scalars[i] \cdot base\_points[i]\f$ using the windowed Straus algorithm with 4-bit
 * windows. The algorithm operates in three phases:
 * 1. Native computation: Compute all EC operations natively to generate witness hints using batched operations. (This
 * avoids the need to perform expensive modular inversions per operation during witness generation)
 * 2. Table construction: Build in-circuit ROM lookup tables for each base point
 * 3. Circuit execution: Perform the Straus algorithm in-circuit using the ROM tables and precomputed hints
 *
 * @note Offset generators are added to prevent point-at-infinity edge cases. The returned result is:
 * \f$\sum_i scalars[i] \cdot base\_points[i] + offset\_accumulator\f$
 * where offset_accumulator is also returned separately for later subtraction.
 *
 * @param scalars Vector of scalar multipliers (must all have the same bit length)
 * @param base_points Vector of EC points to multiply (can be constants or witnesses)
 * @param offset_generators Precomputed offset points to prevent infinity edge cases (size = base_points.size() + 1)
 * @param unconditional_add If true, skip x-coordinate collision checks (safe only when points are guaranteed distinct)
 * @return {accumulator, offset_accumulator} where batch mul result = accumulator - offset_accumulator
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_variable_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars,
    const std::span<cycle_group> base_points,
    const std::span<AffineElement const> offset_generators,
    const bool unconditional_add)
{
    BB_ASSERT_EQ(!scalars.empty(), true, "Empty scalars provided to variable base batch mul!");
    BB_ASSERT_EQ(scalars.size(), base_points.size(), "Points/scalars size mismatch in variable base batch mul!");
    BB_ASSERT_EQ(offset_generators.size(), base_points.size() + 1, "Too few offset generators provided!");
    const size_t num_points = scalars.size();

    // Extract the circuit context from any scalar or point
    Builder* context = nullptr;
    for (auto [scalar, point] : zip_view(scalars, base_points)) {
        if (context = scalar.get_context(); context != nullptr) {
            break;
        }
        if (context = point.get_context(); context != nullptr) {
            break;
        }
    }

    // Validate all scalars have the same bit length (required for Straus algorithm to process slices)
    size_t num_bits = scalars[0].num_bits();
    for (auto& s : scalars) {
        BB_ASSERT_EQ(s.num_bits(), num_bits, "Scalars of different bit-lengths not supported!");
    }
    size_t num_rounds = numeric::ceil_div(num_bits, ROM_TABLE_BITS);

    // Decompose each scalar into 4-bit slices. Note: This operation enforces range constraints on the lo/hi limbs of
    // each scalar (LO_BITS and (num_bits - LO_BITS) respectively).
    std::vector<straus_scalar_slices> scalar_slices;
    scalar_slices.reserve(num_points);
    for (const auto& scalar : scalars) {
        scalar_slices.emplace_back(context, scalar, ROM_TABLE_BITS);
    }

    // Compute the result of each point addition involved in the Straus MSM algorithm natively so they can be used as
    // "hints" in the in-circuit Straus algorithm. This includes the additions needed to construct the point tables and
    // those needed to compute the MSM via Straus. Points are computed as Element types with a Z-coordinate then
    // batch-converted to AffineElement types. This avoids the need to compute modular inversions for every group
    // operation, which dramatically reduces witness generation times.
    std::vector<Element> operation_transcript;
    Element offset_generator_accumulator = offset_generators[0];
    {
        // For each point, construct native straus lookup table of the form {G , G + [1]P, G + [2]P, ... , G + [15]P}
        std::vector<std::vector<Element>> native_straus_tables;
        for (size_t i = 0; i < num_points; ++i) {
            AffineElement point = base_points[i].get_value();
            AffineElement offset = offset_generators[i + 1];
            std::vector<Element> table = straus_lookup_table::compute_native_table(point, offset, ROM_TABLE_BITS);
            // Copy all but the first entry (the offset generator) into the operation transcript for use as hints
            std::copy(table.begin() + 1, table.end(), std::back_inserter(operation_transcript));
            native_straus_tables.emplace_back(std::move(table));
        }

        // Perform the Straus algorithm natively to generate the witness values (hints) for all intermediate points
        Element accumulator = offset_generators[0];
        for (size_t i = 0; i < num_rounds; ++i) {
            if (i != 0) {
                // Perform doublings of the accumulator and offset generator accumulator
                for (size_t j = 0; j < ROM_TABLE_BITS; ++j) {
                    accumulator = accumulator.dbl();
                    operation_transcript.push_back(accumulator);
                    offset_generator_accumulator = offset_generator_accumulator.dbl();
                }
            }
            for (size_t j = 0; j < num_points; ++j) {
                // Look up and accumulate the appropriate point for this scalar slice
                auto slice_value = static_cast<size_t>(scalar_slices[j].slices_native[num_rounds - i - 1]);
                const Element point = native_straus_tables[j][slice_value];
                accumulator += point;

                // Populate hint and update offset generator accumulator
                operation_transcript.push_back(accumulator);
                offset_generator_accumulator += Element(offset_generators[j + 1]);
            }
        }
    }

    // Normalize the computed witness points and convert them into AffineElements
    Element::batch_normalize(&operation_transcript[0], operation_transcript.size());
    std::vector<AffineElement> operation_hints;
    operation_hints.reserve(operation_transcript.size());
    for (const Element& element : operation_transcript) {
        operation_hints.emplace_back(element.x, element.y);
    }

    // Construct an in-circuit Straus lookup table for each point
    std::vector<straus_lookup_table> point_tables;
    point_tables.reserve(num_points);
    const size_t hints_per_table = (1ULL << ROM_TABLE_BITS) - 1;
    OriginTag tag{};
    for (size_t i = 0; i < num_points; ++i) {
        // Merge tags
        tag = OriginTag(tag, scalars[i].get_origin_tag(), base_points[i].get_origin_tag());

        // Construct Straus table
        std::span<AffineElement> table_hints(&operation_hints[i * hints_per_table], hints_per_table);
        straus_lookup_table table(context, base_points[i], offset_generators[i + 1], ROM_TABLE_BITS, table_hints);
        point_tables.push_back(std::move(table));
    }

    // Initialize pointer to the precomputed Straus algorithm hints (stored just after the table construction hints)
    AffineElement* hint_ptr = &operation_hints[num_points * hints_per_table];
    cycle_group accumulator = offset_generators[0];

    // Execute Straus algorithm in-circuit using the precomputed hints.
    // If unconditional_add == false, accumulate x-coordinate differences to batch-validate no collisions.
    field_t coordinate_check_product = 1;
    for (size_t i = 0; i < num_rounds; ++i) {
        // Double the accumulator ROM_TABLE_BITS times (except in first round)
        if (i != 0) {
            for (size_t j = 0; j < ROM_TABLE_BITS; ++j) {
                accumulator = accumulator.dbl(*hint_ptr);
                hint_ptr++;
            }
        }
        // Add the contribution from each point's scalar slice for this round
        for (size_t j = 0; j < num_points; ++j) {
            const field_t scalar_slice = scalar_slices[j][num_rounds - i - 1];
            BB_ASSERT_EQ(scalar_slice.get_value(), scalar_slices[j].slices_native[num_rounds - i - 1]); // Sanity check
            const cycle_group point = point_tables[j].read(scalar_slice);
            if (!unconditional_add) {
                coordinate_check_product *= point.x - accumulator.x;
            }
            accumulator = accumulator.unconditional_add(point, *hint_ptr);
            hint_ptr++;
        }
    }

    // Batch-validate no x-coordinate collisions occurred. We batch because each assert_is_not_zero
    // requires an expensive modular inversion during witness generation.
    if (!unconditional_add) {
        coordinate_check_product.assert_is_not_zero("_variable_base_batch_mul_internal x-coordinate collision");
    }

    // Set the final accumulator's tag to the union of all points' and scalars' tags
    accumulator.set_origin_tag(tag);

    // Note: offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
    // We don't subtract it off yet as we may be able to combine it with other constant terms in `batch_mul` before
    // performing the subtraction.
    return { accumulator, AffineElement(offset_generator_accumulator) };
}

/**
 * @brief Internal algorithm to perform a fixed-base batch mul
 *
 * @details Computes a batch mul of fixed base points using the Straus multiscalar multiplication algorithm with lookup
 * tables. Each scalar (cycle_scalar) is decomposed into two limbs, lo and hi, with 128 and 126 bits respectively. For
 * each limb we use one of four precomputed plookup multi-tables FIXED_BASE_<LEFT/RIGHT>_<LO/HI> corresponding to the
 * lo/hi limbs of the two generator points supported by this algorithm (defined in bb::plookup::fixed_base::table).
 *
 * The LO multi-tables consist of fifteen basic tables (14 × 9-bit + 1 × 2-bit = 128 bits) and the HI multi-tables
 * consist of fourteen 9-bit basic tables (14 × 9 = 126 bits). Each basic table stores at index i the precomputed
 * points: \f$[offset\_generator_i] + k \cdot 2^{table\_bits \cdot i} \cdot [base\_point]\f$ for \f$k = 0, 1, ...,
 * 2^{table\_bits} - 1\f$. The offset generators prevent point-at-infinity edge cases. The algorithm sums all looked-up
 * points to compute \f$scalar \cdot [base\_point] + [sum\_of\_offset\_generators]\f$. We return both the accumulator
 * and the sum of offset generators, so that it can be subtracted off later.
 *
 * This approach avoids all point doublings and reduces one scalar mul to ~29 lookups + ~29 ecc addition gates.
 *
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param
 * @return cycle_group<Builder>::batch_mul_internal_output
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_fixed_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars, const std::span<AffineElement> base_points)
{
    BB_ASSERT_EQ(scalars.size(), base_points.size(), "Points/scalars size mismatch in fixed-base batch mul");

    using MultiTableId = plookup::MultiTableId;
    using ColumnIdx = plookup::ColumnIdx;
    using plookup::fixed_base::table;

    std::vector<MultiTableId> multitable_ids;
    std::vector<field_t> scalar_limbs;

    OriginTag tag{};
    for (const auto [point, scalar] : zip_view(base_points, scalars)) {
        // Merge all scalar tags
        // AUDITTODO: in the variable base method we combine point and scalar tags - should we do the same here?
        tag = OriginTag(tag, scalar.get_origin_tag());
        std::array<MultiTableId, 2> table_id = table::get_lookup_table_ids_for_point(point);
        multitable_ids.push_back(table_id[0]);
        multitable_ids.push_back(table_id[1]);
        scalar_limbs.push_back(scalar.lo);
        scalar_limbs.push_back(scalar.hi);
    }

    // Look up the multiples of each slice of each lo/hi scalar limb in the corresponding plookup table.
    std::vector<cycle_group> lookup_points;
    Element offset_generator_accumulator = Group::point_at_infinity;
    for (const auto [table_id, scalar] : zip_view(multitable_ids, scalar_limbs)) {
        // Each lookup returns multiple EC points corresponding to different bit slices of the scalar.
        // For a scalar slice s_i at bit position (table_bits*i), the table stores the point:
        //     P_i = [offset_generator_i] + (s_i * 2^(table_bits*i)) * [base_point]
        plookup::ReadData<field_t> lookup_data = plookup_read<Builder>::get_lookup_accumulators(table_id, scalar);
        for (size_t j = 0; j < lookup_data[ColumnIdx::C2].size(); ++j) {
            const field_t x = lookup_data[ColumnIdx::C2][j];
            const field_t y = lookup_data[ColumnIdx::C3][j];
            lookup_points.emplace_back(x, y, /*is_infinity=*/false);
        }
        // Update offset accumulator with the total offset for the corresponding multitable
        offset_generator_accumulator += table::get_generator_offset_for_table_id(table_id);
    }

    // Compute the witness values of the batch_mul algorithm natively, as Element types with a Z-coordinate.
    std::vector<Element> operation_transcript;
    {
        Element accumulator = lookup_points[0].get_value();
        for (size_t i = 1; i < lookup_points.size(); ++i) {
            accumulator += (lookup_points[i].get_value());
            operation_transcript.push_back(accumulator);
        }
    }
    // Batch-convert to AffineElement types, and feed these points as "hints" into the in-circuit addition. This avoids
    // the need to compute modular inversions for every group operation, which dramatically reduces witness generation
    // times.
    Element::batch_normalize(&operation_transcript[0], operation_transcript.size());
    std::vector<AffineElement> operation_hints;
    operation_hints.reserve(operation_transcript.size());
    for (const Element& element : operation_transcript) {
        operation_hints.emplace_back(element.x, element.y);
    }

    // Perform the in-circuit point additions sequentially. Each addition costs 1 gate iff additions are chained such
    // that the output of each addition is the input to the next. Otherwise, each addition costs 2 gates.
    cycle_group accumulator = lookup_points[0];
    for (size_t i = 1; i < lookup_points.size(); ++i) {
        accumulator = accumulator.unconditional_add(lookup_points[i], operation_hints[i - 1]);
    }

    // The offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
    // We don't subtract off yet, as we may be able to combine `offset_generator_accumulator` with other constant
    // terms in `batch_mul` before performing the subtraction.
    accumulator.set_origin_tag(tag); // Set accumulator's origin tag to the union of all scalars' tags
    return { accumulator, offset_generator_accumulator };
}

/**
 * @brief Multiscalar multiplication algorithm.
 *
 * @details Uses the Straus MSM algorithm. `batch_mul` splits inputs into three categories:
 * Case 1. Point and scalar are both constant: scalar mul can be computed without constraints.
 * Case 2A. Point is constant and one of two specific generators, scalar is a witness: use fixed-base Straus with
 * plookup tables
 * Case 2B. Point is constant but not one of two specific generators, scalar is a witness: use
 * variable-base Straus using ROM tables.
 * Case 3. Point is a witness, scalar is witness or constant: use variable-base Straus using ROM tables.
 *
 * The results from all 3 categories are combined and returned as a single output point.
 *
 * @note Both the fixed and variable-base algorithms utilize an offset mechanism to avoid point at infinity edge cases.
 * The total offset is tracked and subtracted from the final result to yield the correct output.
 *
 * @note batch_mul can handle all known cases of trigger incomplete addition formula exceptions and other weirdness:
 *       1. some/all of the input points are points at infinity
 *       2. some/all of the input scalars are 0
 *       3. some/all input points are equal to each other
 *       4. output is the point at infinity
 *       5. input vectors are empty
 *
 * @note offset_generator_data is a pointer to precomputed offset generator list. There is a default parameter point
 * that points to a list with DEFAULT_NUM_GENERATORS generator points (8). If more offset generators are required, they
 * will be derived in-place which can be expensive. (num required offset generators is either num input points + 1 or
 * num input points + 2, depends on if one or both of _fixed_base_batch_mul_internal, _variable_base_batch_mul_internal
 * are called). If you're calling this function repeatedly and you KNOW you need >8 offset generators, it's faster to
 * create a `generator_data` object with the required size and pass it in as a parameter.
 *
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param offset_generator_data
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::batch_mul(const std::vector<cycle_group>& base_points,
                                                     const std::vector<cycle_scalar>& scalars,
                                                     const GeneratorContext& context)
{
    BB_ASSERT_EQ(scalars.size(), base_points.size(), "Points/scalars size mismatch in batch mul!");

    std::vector<cycle_scalar> variable_base_scalars;
    std::vector<cycle_group> variable_base_points;
    std::vector<cycle_scalar> fixed_base_scalars;
    std::vector<AffineElement> fixed_base_points;

    // Merge all tags
    OriginTag result_tag;
    for (auto [point, scalar] : zip_view(base_points, scalars)) {
        result_tag = OriginTag(result_tag, OriginTag(point.get_origin_tag(), scalar.get_origin_tag()));
    }
    size_t num_bits = 0;
    for (auto& s : scalars) {
        num_bits = std::max(num_bits, s.num_bits());

        // Note: is this the best place to put `validate_is_in_field`? Should it not be part of the constructor?
        // Note note: validate_scalar_is_in_field does not apply range checks to the hi/lo slices, this is performed
        // implicitly via the scalar mul algorithm
        s.validate_scalar_is_in_field();
    }

    // If scalars are not full sized, we skip lookup-version of fixed-base scalar mul. too much complexity
    bool scalars_are_full_sized = (num_bits == NUM_BITS_FULL_FIELD_SIZE);

    // We can unconditionally add in the variable-base algorithm iff all of the input points are fixed-base points (i.e.
    // we are doing fixed-base mul over points not present in our plookup tables)
    bool can_unconditional_add = true;
    bool has_non_constant_component = false;
    Element constant_acc = Group::point_at_infinity;
    for (const auto [point, scalar] : zip_view(base_points, scalars)) {
        if (scalar.is_constant() && point.is_constant()) {
            // Case 1: both point and scalar are constant; update constant accumulator without adding gates
            constant_acc += (point.get_value()) * (scalar.get_value());
        } else if (!scalar.is_constant() && point.is_constant()) {
            if (point.get_value().is_point_at_infinity()) {
                // oi mate, why are you creating a circuit that multiplies a known point at infinity?
                info("Warning: Performing batch mul with constant point at infinity!");
                continue;
            }
            if (scalars_are_full_sized &&
                plookup::fixed_base::table::lookup_table_exists_for_point(point.get_value())) {
                // Case 2A: constant point is one of two for which we have plookup tables; use fixed-base Straus
                fixed_base_scalars.push_back(scalar);
                fixed_base_points.push_back(point.get_value());
            } else {
                // Case 2B: constant point but no precomputed lookup tables; use variable-base Straus with ROM tables
                variable_base_scalars.push_back(scalar);
                variable_base_points.push_back(point);
            }
            has_non_constant_component = true;
        } else {
            // Case 3: point is a witness; use variable-base Straus with ROM tables
            variable_base_scalars.push_back(scalar);
            variable_base_points.push_back(point);
            can_unconditional_add = false;
            has_non_constant_component = true;
        }
    }

    // If all inputs are constant, return the computed constant component and call it a day.
    if (!has_non_constant_component) {
        auto result = cycle_group(constant_acc);
        result.set_origin_tag(result_tag);
        return result;
    }

    // Add the constant component into our offset accumulator. (Note: we'll subtract `offset_accumulator` from the MSM
    // output later on so we negate here to counter that future negation).
    Element offset_accumulator = -constant_acc;
    const bool has_variable_points = !variable_base_points.empty();
    const bool has_fixed_points = !fixed_base_points.empty();

    cycle_group result;
    if (has_fixed_points) {
        // Compute the result of the fixed-base portion of the MSM and update the offset accumulator
        const auto [fixed_accumulator, offset_generator_delta] =
            _fixed_base_batch_mul_internal(fixed_base_scalars, fixed_base_points);
        offset_accumulator += offset_generator_delta;
        result = fixed_accumulator;
    }

    if (has_variable_points) {
        // Compute required offset generators; one per point plus one extra for the initial accumulator
        const size_t num_offset_generators = variable_base_points.size() + 1;
        const std::span<AffineElement const> offset_generators =
            context.generators->get(num_offset_generators, 0, OFFSET_GENERATOR_DOMAIN_SEPARATOR);

        // Compute the result of the variable-base portion of the MSM and update the offset accumulator
        const auto [variable_accumulator, offset_generator_delta] = _variable_base_batch_mul_internal(
            variable_base_scalars, variable_base_points, offset_generators, can_unconditional_add);
        offset_accumulator += offset_generator_delta;

        // Combine the variable-base result with the fixed-base result (if present)
        if (has_fixed_points) {
            result = can_unconditional_add ? result.unconditional_add(variable_accumulator)
                                           : result.checked_unconditional_add(variable_accumulator);
        } else {
            result = variable_accumulator;
        }
    }

    // Update `result` to remove the offset generator terms, and add in any constant terms from `constant_acc`.
    // We have two potential modes here:
    // 1. All inputs are fixed-base and constant_acc is not the point at infinity
    // 2. Everything else.
    // Case 1 is a special case, as we *know* we cannot hit incomplete addition edge cases, under the assumption that
    // all input points are linearly independent of one another. Because constant_acc is not the point at infinity we
    // know that at least 1 input scalar was not zero, i.e. the output will not be the point at infinity. We also know
    // that, under case 1, we won't trigger the doubling formula either, as every point is linearly independent of every
    // other point (including offset generators).
    if (!constant_acc.is_point_at_infinity() && can_unconditional_add) {
        result = result.unconditional_add(AffineElement(-offset_accumulator));
    } else {
        // For case 2, we must use a full subtraction operation that handles all possible edge cases, as the output
        // point may be the point at infinity.
        // Note about optimizations for posterity: An honest prover might hit the point at infinity, but won't
        // trigger the doubling edge case (since doubling edge case implies input points are also the offset generator
        // points). We could do the following which would be slightly cheaper than operator-:
        // 1. If x-coords match, assert y-coords do not match
        // 2. If x-coords match, return point at infinity, else unconditionally compute result - offset_accumulator.
        result = result - AffineElement(offset_accumulator);
    }
    // Ensure the tag of the result is a union of all inputs
    result.set_origin_tag(result_tag);
    return result;
}

template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator*(const cycle_scalar& scalar) const
{
    return batch_mul({ *this }, { scalar });
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator*=(const cycle_scalar& scalar)
{
    *this = operator*(scalar);
    return *this;
}

template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator*(const BigScalarField& scalar) const
{
    return batch_mul({ *this }, { scalar });
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator*=(const BigScalarField& scalar)
{
    *this = operator*(scalar);
    return *this;
}

template <typename Builder> bool_t<Builder> cycle_group<Builder>::operator==(cycle_group& other)
{
    this->standardize();
    other.standardize();
    const auto equal = (x == other.x) && (y == other.y) && (this->_is_infinity == other._is_infinity);
    return equal;
}

template <typename Builder> void cycle_group<Builder>::assert_equal(cycle_group& other, std::string const& msg)
{
    this->standardize();
    other.standardize();
    x.assert_equal(other.x, msg);
    y.assert_equal(other.y, msg);
    this->_is_infinity.assert_equal(other._is_infinity);
}

template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::conditional_assign(const bool_t& predicate,
                                                              const cycle_group& lhs,
                                                              const cycle_group& rhs)
{
    auto x_res = field_t::conditional_assign(predicate, lhs.x, rhs.x).normalize();
    auto y_res = field_t::conditional_assign(predicate, lhs.y, rhs.y).normalize();
    auto _is_infinity_res =
        bool_t::conditional_assign(predicate, lhs.is_point_at_infinity(), rhs.is_point_at_infinity());

    bool _is_standard_res = lhs._is_standard && rhs._is_standard;
    if (predicate.is_constant()) {
        _is_standard_res = predicate.get_value() ? lhs._is_standard : rhs._is_standard;
    }

    // AUDITTODO: Talk to Sasha. Comment seems to be unrelated and its not clear why the logic is needed.
    // Rare case when we bump into two constants, s.t. lhs = -rhs
    if (x_res.is_constant() && !y_res.is_constant()) {
        auto ctx = predicate.get_context();
        x_res = field_t::from_witness_index(ctx, ctx->put_constant_variable(x_res.get_value()));
    }

    cycle_group<Builder> result(x_res, y_res, _is_infinity_res);
    result._is_standard = _is_standard_res;
    return result;
};

template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator/(const cycle_group& /*unused*/) const
{
    // TODO(@kevaundray solve the discrete logarithm problem)
    throw_or_abort("Implementation under construction...");
}

template class cycle_group<bb::UltraCircuitBuilder>;
template class cycle_group<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
