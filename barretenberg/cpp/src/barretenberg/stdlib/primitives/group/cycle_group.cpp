// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "../field/field.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "./cycle_group.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
namespace bb::stdlib {

/**
 * @brief Construct a new cycle group<Builder>::cycle group object
 * defaults to a constant point at infinity.
 *
 * @note Please don't use this constructor in case you want to assign the
 * coordinates later.
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(Builder* _context)
    : x(0)
    , y(0)
    , _is_infinity(true)
    , _is_constant(true)
    , _is_standard(true)
    , context(_context)
{}

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
    , _is_constant(_x.is_constant() && _y.is_constant() && is_infinity.is_constant())
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
        this->x = 0;
        this->y = 0;
        this->_is_infinity = true;
        this->_is_constant = true;
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1067): This ASSERT is missing in the constructor but
    // causes schnorr acir test to fail due to a bad input (a public key that has x and y coordinate set to 0).
    // Investigate this to be able to enable the test.
    // ASSERT(get_value().on_curve());
}

/**
 * @brief Construct a new cycle group<Builder>::cycle group object
 *
 * @details is_infinity is a circuit constant. We EXPLICITLY require that whether this point is infinity/not infinity is
 * known at circuit-construction time *and* we know this point is on the curve. These checks are not constrained.
 * Use from_witness if these conditions are not met.
 * Examples of when conditions are met: point is a derived from a point that is on the curve + not at infinity.
 * e.g. output of a doubling operation
 * @tparam Builder
 * @param _x
 * @param _y
 * @param is_infinity
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(const FF& _x, const FF& _y, bool is_infinity)
    : x(is_infinity ? 0 : _x)
    , y(is_infinity ? 0 : _y)
    , _is_infinity(is_infinity)
    , _is_constant(true)
    , _is_standard(true)
    , context(nullptr)
{
    ASSERT(get_value().on_curve());
}

/**
 * @brief Construct a cycle_group object out of an AffineElement object
 *
 * @note This produces a circuit-constant object i.e. known at compile-time, no constraints.
 *       If `_in` is not fixed for a given circuit, use `from_witness` instead
 *
 * @details ensures the representation of point at infinity is consistent
 * @tparam Builder
 * @param _in
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(const AffineElement& _in)
    : x(_in.is_point_at_infinity() ? 0 : _in.x)
    , y(_in.is_point_at_infinity() ? 0 : _in.y)
    , _is_infinity(_in.is_point_at_infinity())
    , _is_constant(true)
    , _is_standard(true)
    , context(nullptr)
{}

/**
 * @brief Construct a cycle_group representation of Group::one.
 *
 * @tparam Builder
 * @param _context
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::one(Builder* _context)
{
    field_t x(_context, Group::one.x);
    field_t y(_context, Group::one.y);
    return cycle_group<Builder>(x, y, /*is_infinity=*/false);
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

    // Point at infinity's coordinates break our arithmetic
    // Since we are not using these coordinates anyway
    // We can set them both to be zero
    if (_in.is_point_at_infinity()) {
        result.x = field_t(witness_t(_context, FF::zero()));
        result.y = field_t(witness_t(_context, FF::zero()));
    } else {
        result.x = field_t(witness_t(_context, _in.x));
        result.y = field_t(witness_t(_context, _in.y));
    }
    result._is_infinity = bool_t(witness_t(_context, _in.is_point_at_infinity()));
    result._is_constant = false;
    result._is_standard = true;
    result.validate_is_on_curve();
    result.set_free_witness_tag();
    return result;
}

/**
 * @brief Converts a native AffineElement into a witness, but constrains the witness values to be known constants.
 *
 * @details When performing group operations where one operand is a witness and one is a constant,
 * it can be more efficient to convert the constant element into a witness. This is because we have custom gates
 * that evaluate additions in one constraint, but only if both operands are witnesses.
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

    // Point at infinity's coordinates break our arithmetic
    // Since we are not using these coordinates anyway
    // We can set them both to be zero
    if (_in.is_point_at_infinity()) {
        result.x = FF::zero();
        result.y = FF::zero();
        result._is_constant = true;
    } else {
        result.x = field_t(witness_t(_context, _in.x));
        result.y = field_t(witness_t(_context, _in.y));
        result.x.assert_equal(result.x.get_value());
        result.y.assert_equal(result.y.get_value());
        result._is_constant = false;
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
 *
 * @tparam Builder
 */
template <typename Builder> void cycle_group<Builder>::validate_is_on_curve() const
{
    // This class is for short Weierstrass curves only!
    static_assert(Group::curve_a == 0);
    auto xx = x * x;
    auto xxx = xx * x;
    auto res = y.madd(y, -xxx - Group::curve_b);
    // if the point is marked as the point at infinity, then res should be changed to 0, but otherwise, we leave res
    // unchanged from the original value
    res *= !is_point_at_infinity();
    res.assert_is_zero();
}
/**
 * @brief  Get point in standard form. If the point is a point at infinity, ensure the coordinates are (0,0)
 *
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::get_standard_form()
{
    this->standardize();
    return *this;
}

/**
 * @brief  Set the point to the point at infinity.
 * Depending on constant'ness of the predicate put the coordinates in an apropriate standard form.
 *
 */
template <typename Builder> void cycle_group<Builder>::set_point_at_infinity(const bool_t& is_infinity)
{
    ASSERT((this->x.is_constant() && this->y.is_constant() && this->_is_infinity.is_constant()) == this->_is_constant);

    this->_is_standard = true;

    if (is_infinity.is_constant() && this->_is_infinity.is_constant()) {
        // Check that it's not possible to enter the case when
        // The point is already infinity, but `is_infinity` = false
        ASSERT((this->_is_infinity.get_value() == is_infinity.get_value()) || is_infinity.get_value());

        if (is_infinity.get_value()) {
            this->x = 0;
            this->y = 0;
            this->_is_infinity = true;
            this->_is_constant = true;
        }
        return;
    }

    if (is_infinity.is_constant() && !this->_is_infinity.is_constant()) {
        if (is_infinity.get_value()) {
            this->x = 0;
            this->y = 0;
            this->_is_infinity = true;
            this->_is_constant = true;
        } else {
            this->_is_infinity.assert_equal(false);
            this->_is_infinity = false;
        }
        return;
    }

    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        // I can't imagine this case happening, but still
        is_infinity.assert_equal(true);

        this->x = 0;
        this->y = 0;
        this->_is_constant = true;
        return;
    }

    this->x = field_t::conditional_assign(is_infinity, 0, this->x);
    this->y = field_t::conditional_assign(is_infinity, 0, this->y);

    // We won't bump into the case where we end up with non constant coordinates
    ASSERT(!this->x.is_constant() && !this->y.is_constant());
    this->_is_constant = false;

    // We have to check this to avoid the situation, where we change the infinity
    bool_t set_allowed = (this->_is_infinity == is_infinity) || is_infinity;
    set_allowed.assert_equal(true);
    this->_is_infinity = is_infinity;

    // In case we set point at infinity on a constant without an existing context
    if (this->context == nullptr) {
        this->context = is_infinity.get_context();
    }
}

/**
 * @brief Get the point to the standard form. If the point is a point at infinity, ensure the coordinates are (0,0)
 * If the point is already standard nothing changes
 *
 */
template <typename Builder> void cycle_group<Builder>::standardize()
{
    ASSERT((this->x.is_constant() && this->y.is_constant() && this->_is_infinity.is_constant()) == this->_is_constant);
    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        ASSERT(this->_is_constant && this->_is_standard);
    }

    if (this->_is_standard) {
        return;
    }
    this->_is_standard = true;

    this->x = field_t::conditional_assign(this->_is_infinity, 0, this->x);
    this->y = field_t::conditional_assign(this->_is_infinity, 0, this->y);
}

/**
 * @brief Evaluates a doubling. Does not use Ultra double gate
 *
 * @tparam Builder
 * @param unused param is due to interface-compatibility with the UltraArithmetic version of `dbl`
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::dbl([[maybe_unused]] const std::optional<AffineElement> /*unused*/) const
    requires IsNotUltraArithmetic<Builder>
{
    auto modified_y = field_t::conditional_assign(is_point_at_infinity(), 1, y);
    auto lambda = (x * x * 3) / (modified_y + modified_y);
    auto x3 = lambda.madd(lambda, -x - x);
    auto y3 = lambda.madd(x - x3, -modified_y);
    return cycle_group(x3, y3, is_point_at_infinity());
}

/**
 * @brief Evaluates a doubling. Uses Ultra double gate
 *
 * @tparam Builder
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::dbl(const std::optional<AffineElement> hint) const
    requires IsUltraArithmetic<Builder>
{
    // ensure we use a value of y that is not zero. (only happens if point at infinity)
    // this costs 0 gates if `is_infinity` is a circuit constant
    auto modified_y = field_t::conditional_assign(is_point_at_infinity(), 1, y).normalize();

    // We have to return the point at infinity immediately
    // Cause in that very case the `modified_y` is a constant value, with witness_index = -1
    // Hence the following `create_ecc_dbl_gate` will throw an ASSERTION error
    if (this->is_point_at_infinity().is_constant() && this->is_point_at_infinity().get_value()) {
        return *this;
    }

    cycle_group result;
    if (hint.has_value()) {
        auto x3 = hint.value().x;
        auto y3 = hint.value().y;
        if (is_constant()) {
            result = cycle_group(x3, y3, is_point_at_infinity());
            // We need to manually propagate the origin tag
            result.set_origin_tag(get_origin_tag());

            return result;
        }

        result = cycle_group(witness_t(context, x3), witness_t(context, y3), is_point_at_infinity());
    } else {
        auto x1 = x.get_value();
        auto y1 = modified_y.get_value();

        // N.B. the formula to derive the witness value for x3 mirrors the formula in elliptic_relation.hpp
        // Specifically, we derive x^4 via the Short Weierstrass curve formula `y^2 = x^3 + b`
        // i.e. x^4 = x * (y^2 - b)
        // We must follow this pattern exactly to support the edge-case where the input is the point at infinity.
        auto y_pow_2 = y1.sqr();
        auto x_pow_4 = x1 * (y_pow_2 - Group::curve_b);
        auto lambda_squared = (x_pow_4 * 9) / (y_pow_2 * 4);
        auto lambda = (x1 * x1 * 3) / (y1 + y1);
        auto x3 = lambda_squared - x1 - x1;
        auto y3 = lambda * (x1 - x3) - y1;
        if (is_constant()) {
            auto result = cycle_group(x3, y3, is_point_at_infinity().get_value());
            // We need to manually propagate the origin tag
            result.set_origin_tag(get_origin_tag());
            return result;
        }

        result = cycle_group(witness_t(context, x3), witness_t(context, y3), is_point_at_infinity());
    }

    context->create_ecc_dbl_gate(bb::ecc_dbl_gate_<FF>{
        .x1 = x.get_witness_index(),
        .y1 = modified_y.get_normalized_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
    });

    // We need to manually propagate the origin tag
    result.x.set_origin_tag(OriginTag(x.get_origin_tag(), y.get_origin_tag()));
    result.y.set_origin_tag(OriginTag(x.get_origin_tag(), y.get_origin_tag()));
    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *        and none of the operands is a point at infinity
 *        Standard version that does not use ecc group gate
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_add(
    const cycle_group& other, [[maybe_unused]] const std::optional<AffineElement> /*unused*/) const
    requires IsNotUltraArithmetic<Builder>
{
    auto x_diff = other.x - x;
    auto y_diff = other.y - y;
    // unconditional add so do not check divisor is zero
    // (this also makes it much easier to test failure cases as this does not segfault!)
    auto lambda = y_diff.divide_no_zero_check(x_diff);
    auto x3 = lambda.madd(lambda, -other.x - x);
    auto y3 = lambda.madd(x - x3, -y);
    cycle_group result(x3, y3, /*is_infinity=*/false);
    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *        and none of the operands is a point at infinity
 *        Ultra version that uses ecc group gate
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_add(const cycle_group& other,
                                                             const std::optional<AffineElement> hint) const
    requires IsUltraArithmetic<Builder>
{
    auto context = get_context(other);

    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();
    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group::from_constant_witness(context, get_value());
        // We need to manually propagate the origin tag
        lhs.set_origin_tag(get_origin_tag());
        return lhs.unconditional_add(other, hint);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group::from_constant_witness(context, other.get_value());
        // We need to manually propagate the origin tag
        rhs.set_origin_tag(other.get_origin_tag());
        return unconditional_add(rhs, hint);
    }
    cycle_group result;
    if (hint.has_value()) {
        auto x3 = hint.value().x;
        auto y3 = hint.value().y;
        if (lhs_constant && rhs_constant) {
            return cycle_group(x3, y3, /*is_infinity=*/false);
        }
        result = cycle_group(witness_t(context, x3), witness_t(context, y3), /*is_infinity=*/false);
    } else {
        const auto p1 = get_value();
        const auto p2 = other.get_value();
        AffineElement p3(Element(p1) + Element(p2));
        if (lhs_constant && rhs_constant) {
            auto result = cycle_group(p3);
            // We need to manually propagate the origin tag
            result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
            return result;
        }
        field_t r_x(witness_t(context, p3.x));
        field_t r_y(witness_t(context, p3.y));
        result = cycle_group(r_x, r_y, /*is_infinity=*/false);
    }
    bb::ecc_add_gate_<FF> add_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x2 = other.x.get_witness_index(),
        .y2 = other.y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
        .sign_coefficient = 1,
    };
    context->create_ecc_add_gate(add_gate);

    // We need to manually propagate the origin tag (merging the tag of two inputs)
    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return result;
}

/**
 * @brief will evaluate ECC point subtraction over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *        and none of the operands is a point at infinity
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_subtract(const cycle_group& other,
                                                                  const std::optional<AffineElement> hint) const
{
    if constexpr (!IS_ULTRA) {
        return unconditional_add(-other, hint);
    } else {
        auto context = get_context(other);

        const bool lhs_constant = is_constant();
        const bool rhs_constant = other.is_constant();

        if (lhs_constant && !rhs_constant) {
            auto lhs = cycle_group<Builder>::from_constant_witness(context, get_value());
            // We need to manually propagate the origin tag
            lhs.set_origin_tag(get_origin_tag());
            return lhs.unconditional_subtract(other, hint);
        }
        if (!lhs_constant && rhs_constant) {
            auto rhs = cycle_group<Builder>::from_constant_witness(context, other.get_value());
            // We need to manually propagate the origin tag
            rhs.set_origin_tag(other.get_origin_tag());
            return unconditional_subtract(rhs);
        }
        cycle_group result;
        if (hint.has_value()) {
            auto x3 = hint.value().x;
            auto y3 = hint.value().y;
            if (lhs_constant && rhs_constant) {
                return cycle_group(x3, y3, /*is_infinity=*/false);
            }
            result = cycle_group(witness_t(context, x3), witness_t(context, y3), /*is_infinity=*/false);
        } else {
            auto p1 = get_value();
            auto p2 = other.get_value();
            AffineElement p3(Element(p1) - Element(p2));
            if (lhs_constant && rhs_constant) {
                auto result = cycle_group(p3);
                // We need to manually propagate the origin tag
                result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
                return result;
            }
            field_t r_x(witness_t(context, p3.x));
            field_t r_y(witness_t(context, p3.y));
            result = cycle_group(r_x, r_y, /*is_infinity=*/false);
        }
        bb::ecc_add_gate_<FF> add_gate{
            .x1 = x.get_witness_index(),
            .y1 = y.get_witness_index(),
            .x2 = other.x.get_witness_index(),
            .y2 = other.y.get_witness_index(),
            .x3 = result.x.get_witness_index(),
            .y3 = result.y.get_witness_index(),
            .sign_coefficient = -1,
        };
        context->create_ecc_add_gate(add_gate);

        // We need to manually propagate the origin tag (merging the tag of two inputs)
        result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return result;
    }
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::checked_unconditional_add(const cycle_group& other,
                                                                     const std::optional<AffineElement> hint) const
{
    field_t x_delta = this->x - other.x;
    if (x_delta.is_constant()) {
        ASSERT(x_delta.get_value() != 0);
    } else {
        x_delta.assert_is_not_zero("cycle_group::checked_unconditional_add, x-coordinate collision");
    }
    return unconditional_add(other, hint);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::checked_unconditional_subtract(const cycle_group& other,
                                                                          const std::optional<AffineElement> hint) const
{
    field_t x_delta = this->x - other.x;
    if (x_delta.is_constant()) {
        ASSERT(x_delta.get_value() != 0);
    } else {
        x_delta.assert_is_not_zero("cycle_group::checked_unconditional_subtract, x-coordinate collision");
    }
    return unconditional_subtract(other, hint);
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator+(const cycle_group& other) const
{
    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        return other;
    }
    if (other._is_infinity.is_constant() && other._is_infinity.get_value()) {
        return *this;
    }

    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && y_coordinates_match);
    const bool_t infinity_predicate = (x_coordinates_match && !y_coordinates_match);

    auto x1 = x;
    auto y1 = y;
    auto x2 = other.x;
    auto y2 = other.y;
    // if x_coordinates match, lambda triggers a divide by zero error.
    // Adding in `x_coordinates_match` ensures that lambda will always be well-formed
    auto x_diff = x2.add_two(-x1, x_coordinates_match);
    // Computes lambda = (y2-y1)/x_diff, using the fact that x_diff is never 0
    field_t lambda;
    if ((y1.is_constant() && y2.is_constant()) || x_diff.is_constant()) {
        lambda = (y2 - y1).divide_no_zero_check(x_diff);
    } else {
        lambda =
            field_t::from_witness(this->get_context(other), (y2.get_value() - y1.get_value()) / x_diff.get_value());
        // We need to manually propagate the origin tag
        lambda.set_origin_tag(OriginTag(x_diff.get_origin_tag(), y1.get_origin_tag(), y2.get_origin_tag()));
        field_t::evaluate_polynomial_identity(x_diff, lambda, -y2, y1);
    }

    auto x3 = lambda.madd(lambda, -(x2 + x1));
    auto y3 = lambda.madd(x1 - x3, -y1);
    cycle_group add_result(x3, y3, x_coordinates_match);

    auto dbl_result = dbl();

    // dbl if x_match, y_match
    // infinity if x_match, !y_match
    auto result_x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    auto result_y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_point_at_infinity();
    const bool_t rhs_infinity = other.is_point_at_infinity();
    // if lhs infinity, return rhs
    result_x = field_t::conditional_assign(lhs_infinity, other.x, result_x);
    result_y = field_t::conditional_assign(lhs_infinity, other.y, result_y);

    // if rhs infinity, return lhs
    result_x = field_t::conditional_assign(rhs_infinity, x, result_x);
    result_y = field_t::conditional_assign(rhs_infinity, y, result_y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);

    return cycle_group(result_x, result_y, result_is_infinity);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator-(const cycle_group& other) const
{
    if (other._is_infinity.is_constant() && other._is_infinity.get_value()) {
        return *this;
    }
    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        return -other;
    }

    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && !y_coordinates_match).normalize();
    const bool_t infinity_predicate = (x_coordinates_match && y_coordinates_match).normalize();
    if constexpr (IsUltraBuilder<Builder>) {
        infinity_predicate.get_context()->update_used_witnesses(infinity_predicate.witness_index);
    }
    auto x1 = x;
    auto y1 = y;
    auto x2 = other.x;
    auto y2 = other.y;
    auto x_diff = x2.add_two(-x1, x_coordinates_match);
    // Computes lambda = (-y2-y1)/x_diff, using the fact that x_diff is never 0
    field_t lambda;
    if ((y1.is_constant() && y2.is_constant()) || x_diff.is_constant()) {
        lambda = (-y2 - y1).divide_no_zero_check(x_diff);
    } else {
        lambda =
            field_t::from_witness(this->get_context(other), (-y2.get_value() - y1.get_value()) / x_diff.get_value());
        // We need to manually propagate the origin tag
        lambda.set_origin_tag(OriginTag(x_diff.get_origin_tag(), y1.get_origin_tag(), y2.get_origin_tag()));
        field_t::evaluate_polynomial_identity(x_diff, lambda, y2, y1);
    }

    auto x3 = lambda.madd(lambda, -(x2 + x1));
    auto y3 = lambda.madd(x1 - x3, -y1);
    cycle_group add_result(x3, y3, x_coordinates_match);

    auto dbl_result = dbl();

    // dbl if x_match, !y_match
    // infinity if x_match, y_match
    auto result_x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    auto result_y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_point_at_infinity();
    const bool_t rhs_infinity = other.is_point_at_infinity();
    // if lhs infinity, return -rhs
    result_x = field_t::conditional_assign(lhs_infinity, other.x, result_x);
    result_y = field_t::conditional_assign(lhs_infinity, (-other.y).normalize(), result_y);

    // if rhs infinity, return lhs
    result_x = field_t::conditional_assign(rhs_infinity, x, result_x);
    result_y = field_t::conditional_assign(rhs_infinity, y, result_y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimize this
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);

    return cycle_group(result_x, result_y, result_is_infinity);
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

template <typename Builder>
cycle_group<Builder>::cycle_scalar::cycle_scalar(const field_t& _lo, const field_t& _hi)
    : lo(_lo)
    , hi(_hi)
{}

template <typename Builder> cycle_group<Builder>::cycle_scalar::cycle_scalar(const field_t& in)
{
    const uint256_t value(in.get_value());
    const uint256_t lo_v = value.slice(0, LO_BITS);
    const uint256_t hi_v = value.slice(LO_BITS, HI_BITS);
    constexpr uint256_t shift = uint256_t(1) << LO_BITS;
    if (in.is_constant()) {
        lo = lo_v;
        hi = hi_v;
    } else {
        lo = witness_t(in.get_context(), lo_v);
        hi = witness_t(in.get_context(), hi_v);
        (lo + hi * shift).assert_equal(in);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1022): ensure lo and hi are in bb::fr modulus not
        // bb::fq modulus otherwise we could have two representations for in
        validate_scalar_is_in_field();
    }
    // We need to manually propagate the origin tag
    lo.set_origin_tag(in.get_origin_tag());
    hi.set_origin_tag(in.get_origin_tag());
}

template <typename Builder> cycle_group<Builder>::cycle_scalar::cycle_scalar(const ScalarField& in)
{
    const uint256_t value(in);
    const uint256_t lo_v = value.slice(0, LO_BITS);
    const uint256_t hi_v = value.slice(LO_BITS, HI_BITS);
    lo = lo_v;
    hi = hi_v;
}

template <typename Builder>
typename cycle_group<Builder>::cycle_scalar cycle_group<Builder>::cycle_scalar::from_witness(Builder* context,
                                                                                             const ScalarField& value)
{
    const uint256_t value_u256(value);
    const uint256_t lo_v = value_u256.slice(0, LO_BITS);
    const uint256_t hi_v = value_u256.slice(LO_BITS, HI_BITS);
    field_t lo = witness_t(context, lo_v);
    field_t hi = witness_t(context, hi_v);
    lo.set_free_witness_tag();
    hi.set_free_witness_tag();
    return cycle_scalar(lo, hi);
}

/**
 * @brief Use when we want to multiply a group element by a string of bits of known size.
 *        N.B. using this constructor method will make our scalar multiplication methods not perform primality tests.
 *
 * @tparam Builder
 * @param context
 * @param value
 * @param num_bits
 * @return cycle_group<Builder>::cycle_scalar
 */
template <typename Builder>
typename cycle_group<Builder>::cycle_scalar cycle_group<Builder>::cycle_scalar::from_witness_bitstring(
    Builder* context, const uint256_t& bitstring, const size_t num_bits)
{
    ASSERT(bitstring.get_msb() < num_bits);
    const uint256_t lo_v = bitstring.slice(0, LO_BITS);
    const uint256_t hi_v = bitstring.slice(LO_BITS, HI_BITS);
    field_t lo = witness_t(context, lo_v);
    field_t hi = witness_t(context, hi_v);
    lo.set_free_witness_tag();
    hi.set_free_witness_tag();
    cycle_scalar result{ lo, hi, num_bits, true, false };
    return result;
}

/**
 * @brief Use when we want to multiply a group element by a string of bits of known size.
 *        N.B. using this constructor method will make our scalar multiplication methods not perform primality tests.
 *
 * @tparam Builder
 * @param context
 * @param value
 * @param num_bits
 * @return cycle_group<Builder>::cycle_scalar
 */
template <typename Builder>
typename cycle_group<Builder>::cycle_scalar cycle_group<Builder>::cycle_scalar::create_from_bn254_scalar(
    const field_t& in, const bool skip_primality_test)
{
    const uint256_t value_u256(in.get_value());
    const uint256_t lo_v = value_u256.slice(0, LO_BITS);
    const uint256_t hi_v = value_u256.slice(LO_BITS, HI_BITS);
    if (in.is_constant()) {
        cycle_scalar result{ field_t(lo_v), field_t(hi_v), NUM_BITS, false, true };
        return result;
    }
    field_t lo = witness_t(in.get_context(), lo_v);
    field_t hi = witness_t(in.get_context(), hi_v);
    lo.add_two(hi * (uint256_t(1) << LO_BITS), -in).assert_equal(0);

    // We need to manually propagate the origin tag
    lo.set_origin_tag(in.get_origin_tag());
    hi.set_origin_tag(in.get_origin_tag());

    cycle_scalar result{ lo, hi, NUM_BITS, skip_primality_test, true };
    return result;
}
/**
 * @brief Construct a new cycle scalar from a bigfield _value, over the same ScalarField Field. If  _value is a witness,
 * we add constraints to ensure the conversion is correct by reconstructing a bigfield from the limbs of the
 * cycle_scalar and checking equality with the initial _value.
 *
 * @tparam Builder
 * @param _value
 * @todo (https://github.com/AztecProtocol/barretenberg/issues/1016): Optimise this method
 */
template <typename Builder> cycle_group<Builder>::cycle_scalar::cycle_scalar(BigScalarField& scalar)
{
    auto* ctx = get_context() ? get_context() : scalar.get_context();

    if (scalar.is_constant()) {
        const uint256_t value((scalar.get_value() % uint512_t(ScalarField::modulus)).lo);
        const uint256_t value_lo = value.slice(0, LO_BITS);
        const uint256_t value_hi = value.slice(LO_BITS, HI_BITS);

        lo = value_lo;
        hi = value_hi;
        // N.B. to be able to call assert equal, these cannot be constants
    } else {
        // To efficiently convert a bigfield into a cycle scalar,
        // we are going to explicitly rely on the fact that `scalar.lo` and `scalar.hi`
        // are implicitly range-constrained to be 128 bits when they are converted into 4-bit lookup window slices

        // First check: can the scalar actually fit into LO_BITS + HI_BITS?
        // If it can, we can tolerate the scalar being > ScalarField::modulus, because performing a scalar mul
        // implicilty performs a modular reduction
        // If not, call `self_reduce` to cut enougn modulus multiples until the above condition is met
        if (scalar.get_maximum_value() >= (uint512_t(1) << (LO_BITS + HI_BITS))) {
            scalar.self_reduce();
        }

        field_t limb0 = scalar.binary_basis_limbs[0].element;
        field_t limb1 = scalar.binary_basis_limbs[1].element;
        field_t limb2 = scalar.binary_basis_limbs[2].element;
        field_t limb3 = scalar.binary_basis_limbs[3].element;

        // The general plan is as follows:
        // 1. ensure limb0 contains no more than BigScalarField::NUM_LIMB_BITS
        // 2. define limb1_lo = limb1.slice(0, LO_BITS - BigScalarField::NUM_LIMB_BITS)
        // 3. define limb1_hi = limb1.slice(LO_BITS - BigScalarField::NUM_LIMB_BITS, <whatever maximum bound of limb1
        // is>)
        // 4. construct *this.lo out of limb0 and limb1_lo
        // 5. construct *this.hi out of limb1_hi, limb2 and limb3
        // This is a lot of logic, but very cheap on constraints.
        // For fresh bignums that have come out of a MUL operation,
        // the only "expensive" part is a size (LO_BITS - BigScalarField::NUM_LIMB_BITS) range check

        // to convert into a cycle_scalar, we need to convert 4*68 bit limbs into 2*128 bit limbs
        // we also need to ensure that the number of bits in cycle_scalar is < LO_BITS + HI_BITS
        // note: we do not need to validate that the scalar is within the field modulus
        // because performing a scalar multiplication implicitly performs a modular reduction (ecc group is
        // multiplicative modulo BigField::modulus)

        uint256_t limb1_max = scalar.binary_basis_limbs[1].maximum_value;

        // Ensure that limb0 only contains at most NUM_LIMB_BITS. If it exceeds this value, slice of the excess and add
        // it into limb1
        if (scalar.binary_basis_limbs[0].maximum_value > BigScalarField::DEFAULT_MAXIMUM_LIMB) {
            const uint256_t limb = limb0.get_value();
            const uint256_t lo_v = limb.slice(0, BigScalarField::NUM_LIMB_BITS);
            const uint256_t hi_v = limb >> BigScalarField::NUM_LIMB_BITS;
            field_t lo = field_t::from_witness(ctx, lo_v);
            field_t hi = field_t::from_witness(ctx, hi_v);

            uint256_t hi_max = (scalar.binary_basis_limbs[0].maximum_value >> BigScalarField::NUM_LIMB_BITS);
            const uint64_t hi_bits = hi_max.get_msb() + 1;
            lo.create_range_constraint(BigScalarField::NUM_LIMB_BITS);
            hi.create_range_constraint(static_cast<size_t>(hi_bits));
            limb0.assert_equal(lo + hi * BigScalarField::shift_1);

            limb1 += hi;
            limb1_max += hi_max;
            limb0 = lo;
        }

        // sanity check that limb[1] is the limb that contributs both to *this.lo and *this.hi
        ASSERT((BigScalarField::NUM_LIMB_BITS * 2 > LO_BITS) && (BigScalarField::NUM_LIMB_BITS < LO_BITS));

        // limb1 is the tricky one as it contributs to both *this.lo and *this.hi
        // By this point, we know that limb1 fits in the range `1 << BigScalarField::NUM_LIMB_BITS to  (1 <<
        // BigScalarField::NUM_LIMB_BITS) + limb1_max.get_maximum_value() we need to slice this limb into 2. The first
        // is LO_BITS - BigScalarField::NUM_LIMB_BITS (which reprsents its contribution to *this.lo) and the second
        // represents the limbs contribution to *this.hi Step 1: compute the max bit sizes of both slices
        const size_t lo_bits_in_limb_1 = LO_BITS - BigScalarField::NUM_LIMB_BITS;
        const size_t hi_bits_in_limb_1 = (static_cast<size_t>(limb1_max.get_msb()) + 1) - lo_bits_in_limb_1;

        // Step 2: compute the witness values of both slices
        const uint256_t limb_1 = limb1.get_value();
        const uint256_t limb_1_hi_multiplicand = (uint256_t(1) << lo_bits_in_limb_1);
        const uint256_t limb_1_hi_v = limb_1 >> lo_bits_in_limb_1;
        const uint256_t limb_1_lo_v = limb_1 - (limb_1_hi_v << lo_bits_in_limb_1);

        // Step 3: instantiate both slices as witnesses and validate their sum equals limb1
        field_t limb_1_lo = field_t::from_witness(ctx, limb_1_lo_v);
        field_t limb_1_hi = field_t::from_witness(ctx, limb_1_hi_v);

        // We need to propagate the origin tag to the chunks of limb1
        limb_1_lo.set_origin_tag(limb1.get_origin_tag());
        limb_1_hi.set_origin_tag(limb1.get_origin_tag());
        limb1.assert_equal(limb_1_hi * limb_1_hi_multiplicand + limb_1_lo);

        // Step 4: apply range constraints to validate both slices represent the expected contributions to *this.lo and
        // *this,hi
        limb_1_lo.create_range_constraint(lo_bits_in_limb_1);
        limb_1_hi.create_range_constraint(hi_bits_in_limb_1);

        // construct *this.lo out of:
        // a. `limb0` (the first NUM_LIMB_BITS bits of scalar)
        // b. `limb_1_lo` (the first LO_BITS - NUM_LIMB_BITS) of limb1
        lo = limb0 + (limb_1_lo * BigScalarField::shift_1);

        const uint256_t limb_2_shift = uint256_t(1) << (BigScalarField::NUM_LIMB_BITS - lo_bits_in_limb_1);
        const uint256_t limb_3_shift =
            uint256_t(1) << ((BigScalarField::NUM_LIMB_BITS - lo_bits_in_limb_1) + BigScalarField::NUM_LIMB_BITS);

        // construct *this.hi out of limb2, limb3 and the remaining term from limb1 not contributing to `lo`
        hi = limb_1_hi.add_two(limb2 * limb_2_shift, limb3 * limb_3_shift);
    }
    // We need to manually propagate the origin tag
    lo.set_origin_tag(scalar.get_origin_tag());
    hi.set_origin_tag(scalar.get_origin_tag());
};

template <typename Builder> bool cycle_group<Builder>::cycle_scalar::is_constant() const
{
    return (lo.is_constant() && hi.is_constant());
}

/**
 * @brief Checks that a cycle_scalar value is smaller than a prime field modulus when evaluated over the INTEGERS
 * N.B. The prime we check can be either the SNARK curve group order or the circuit's embedded curve group order
 * (i.e. BN254 or Grumpkin)
 * For a canonical scalar mul, we check against the embedded curve (i.e. the curve
 * cycle_group implements).
 * HOWEVER: for Pedersen hashes and Pedersen commitments, the hashed/committed data will be
 * native circuit field elements i.e. for a BN254 snark, cycle_group = Grumpkin and we will be committing/hashing
 * BN254::ScalarField values *NOT* Grumpkin::ScalarFIeld values.
 * TLDR: whether the input scalar has to be < BN254::ScalarField or < Grumpkin::ScalarField is context-dependent.
 *
 * @tparam Builder
 */
template <typename Builder> void cycle_group<Builder>::cycle_scalar::validate_scalar_is_in_field() const
{
    if (!is_constant() && !skip_primality_test()) {
        // Check that scalar.hi * 2^LO_BITS + scalar.lo < cycle_group_modulus when evaluated over the integers
        const uint256_t cycle_group_modulus =
            use_bn254_scalar_field_for_primality_test() ? FF::modulus : ScalarField::modulus;
        const uint256_t r_lo = cycle_group_modulus.slice(0, cycle_scalar::LO_BITS);
        const uint256_t r_hi = cycle_group_modulus.slice(cycle_scalar::LO_BITS, cycle_scalar::HI_BITS);

        bool need_borrow = uint256_t(lo.get_value()) > r_lo;
        field_t borrow = lo.is_constant() ? need_borrow : field_t::from_witness(get_context(), need_borrow);

        // directly call `create_new_range_constraint` to avoid creating an arithmetic gate
        if (!lo.is_constant()) {
            // We need to manually propagate the origin tag
            borrow.set_origin_tag(lo.get_origin_tag());
            if constexpr (IS_ULTRA) {
                get_context()->create_new_range_constraint(borrow.get_witness_index(), 1, "borrow");
            } else {
                borrow.assert_equal(borrow * borrow);
            }
        }
        // Hi range check = r_hi - y_hi - borrow
        // Lo range check = r_lo - y_lo + borrow * 2^{126}
        field_t hi_diff = (-hi + r_hi) - borrow;
        field_t lo_diff = (-lo + r_lo) + (borrow * (uint256_t(1) << cycle_scalar::LO_BITS));

        hi_diff.create_range_constraint(cycle_scalar::HI_BITS);
        lo_diff.create_range_constraint(cycle_scalar::LO_BITS);
    }
}

template <typename Builder>
typename cycle_group<Builder>::ScalarField cycle_group<Builder>::cycle_scalar::get_value() const
{
    uint256_t lo_v(lo.get_value());
    uint256_t hi_v(hi.get_value());
    return ScalarField(lo_v + (hi_v << LO_BITS));
}

/**
 * @brief Construct a new cycle group<Builder>::straus scalar slice::straus scalar slice object
 *
 * @details As part of slicing algoirthm, we also perform a primality test on the inut scalar.
 *
 * TODO(@zac-williamson) make the primality test configurable.
 * We may want to validate the input < BN254::Fr OR input < Grumpkin::Fr depending on context!
 *
 * @tparam Builder
 * @param context
 * @param scalar
 * @param table_bits
 */
template <typename Builder>
cycle_group<Builder>::straus_scalar_slice::straus_scalar_slice(Builder* context,
                                                               const cycle_scalar& scalar,
                                                               const size_t table_bits)
    : _table_bits(table_bits)
{
    // convert an input cycle_scalar object into a vector of slices, each containing `table_bits` bits.
    // this also performs an implicit range check on the input slices
    const auto slice_scalar = [&](const field_t& scalar, const size_t num_bits) {
        // we record the scalar slices both as field_t circuit elements and u64 values
        // (u64 values are used to index arrays and we don't want to repeatedly cast a stdlib value to a numeric
        // primitive as this gets expensive when repeated enough times)
        std::pair<std::vector<field_t>, std::vector<uint64_t>> result;
        result.first.reserve(static_cast<size_t>(1ULL) << table_bits);
        result.second.reserve(static_cast<size_t>(1ULL) << table_bits);

        if (num_bits == 0) {
            return result;
        }
        if (scalar.is_constant()) {
            const size_t num_slices = (num_bits + table_bits - 1) / table_bits;
            const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
            uint256_t raw_value = scalar.get_value();
            for (size_t i = 0; i < num_slices; ++i) {
                uint64_t slice_v = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
                result.first.push_back(field_t(slice_v));
                result.second.push_back(slice_v);
                raw_value = raw_value >> table_bits;
            }

            return result;
        }
        uint256_t raw_value = scalar.get_value();
        const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
        const size_t num_slices = (num_bits + table_bits - 1) / table_bits;
        for (size_t i = 0; i < num_slices; ++i) {
            uint64_t slice_v = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
            result.second.push_back(slice_v);
            raw_value = raw_value >> table_bits;
        }

        if constexpr (IS_ULTRA) {
            const auto slice_indices =
                context->decompose_into_default_range(scalar.get_normalized_witness_index(),
                                                      num_bits,
                                                      table_bits,
                                                      "straus_scalar_slice decompose_into_default_range");
            for (auto& idx : slice_indices) {
                result.first.emplace_back(field_t::from_witness_index(context, idx));
            }
        } else {
            for (size_t i = 0; i < num_slices; ++i) {
                uint64_t slice_v = result.second[i];
                field_t slice(witness_t(context, slice_v));

                context->create_range_constraint(
                    slice.get_witness_index(), table_bits, "straus_scalar_slice create_range_constraint");

                result.first.push_back(slice);
            }
            std::vector<field_t> linear_elements;
            FF scaling_factor = 1;
            for (size_t i = 0; i < num_slices; ++i) {
                linear_elements.emplace_back(result.first[i] * scaling_factor);
                scaling_factor += scaling_factor;
            }
            field_t::accumulate(linear_elements).assert_equal(scalar);
        }
        return result;
    };

    const size_t lo_bits = scalar.num_bits() > cycle_scalar::LO_BITS ? cycle_scalar::LO_BITS : scalar.num_bits();
    const size_t hi_bits = scalar.num_bits() > cycle_scalar::LO_BITS ? scalar.num_bits() - cycle_scalar::LO_BITS : 0;
    auto hi_slices = slice_scalar(scalar.hi, hi_bits);
    auto lo_slices = slice_scalar(scalar.lo, lo_bits);

    std::copy(lo_slices.first.begin(), lo_slices.first.end(), std::back_inserter(slices));
    std::copy(hi_slices.first.begin(), hi_slices.first.end(), std::back_inserter(slices));
    std::copy(lo_slices.second.begin(), lo_slices.second.end(), std::back_inserter(slices_native));
    std::copy(hi_slices.second.begin(), hi_slices.second.end(), std::back_inserter(slices_native));
    const auto tag = scalar.get_origin_tag();
    for (auto& element : slices) {
        // All slices need to have the same origin tag
        element.set_origin_tag(tag);
    }
}

/**
 * @brief Return a bit-slice associated with round `index`.
 *
 * @details In Straus algorithm, `index` is a known parameter, so no need for expensive lookup tables
 *
 * @tparam Builder
 * @param index
 * @return field_t<Builder>
 */
template <typename Builder>
std::optional<field_t<Builder>> cycle_group<Builder>::straus_scalar_slice::read(size_t index)
{
    if (index >= slices.size()) {
        return std::nullopt;
    }
    return slices[index];
}

/**
 * @brief Compute the output points generated when computing the Straus lookup table
 * @details When performing an MSM, we first compute all the witness values as Element types (with a Z-coordinate),
 *          and then we batch-convert the points into affine representation `AffineElement`
 *          This avoids the need to compute a modular inversion for every group operation,
 *          which dramatically cuts witness generation times
 *
 * @tparam Builder
 * @param base_point
 * @param offset_generator
 * @param table_bits
 * @return std::vector<typename cycle_group<Builder>::Element>
 */
template <typename Builder>
std::vector<typename cycle_group<Builder>::Element> cycle_group<
    Builder>::straus_lookup_table::compute_straus_lookup_table_hints(const Element& base_point,
                                                                     const Element& offset_generator,
                                                                     size_t table_bits)
{
    const size_t table_size = 1UL << table_bits;
    Element base = base_point.is_point_at_infinity() ? Group::one : base_point;
    std::vector<Element> hints;
    hints.emplace_back(offset_generator);
    for (size_t i = 1; i < table_size; ++i) {
        hints.emplace_back(hints[i - 1] + base);
    }
    return hints;
}

/**
 * @brief Construct a new cycle group<Builder>::straus lookup table::straus lookup table object
 *
 * @details Constructs a `table_bits` lookup table.
 *
 * If Builder is not ULTRA, `table_bits = 1`
 * If Builder is ULTRA, ROM table is used as lookup table
 *
 * @tparam Builder
 * @param context
 * @param base_point
 * @param offset_generator
 * @param table_bits
 */
template <typename Builder>
cycle_group<Builder>::straus_lookup_table::straus_lookup_table(Builder* context,
                                                               const cycle_group& base_point,
                                                               const cycle_group& offset_generator,
                                                               size_t table_bits,
                                                               std::optional<std::span<AffineElement>> hints)
    : _table_bits(table_bits)
    , _context(context)
    , tag(OriginTag(base_point.get_origin_tag(), offset_generator.get_origin_tag()))
{
    const size_t table_size = 1UL << table_bits;
    point_table.resize(table_size);
    point_table[0] = offset_generator;

    // We want to support the case where input points are points at infinity.
    // If base point is at infinity, we want every point in the table to just be `generator_point`.
    // We achieve this via the following:
    // 1: We create a "work_point" that is base_point if not at infinity, otherwise is just 1
    // 2: When computing the point table, we use "work_point" in additions instead of the "base_point" (to prevent
    //    x-coordinate collisions in honest case) 3: When assigning to the point table, we conditionally assign either
    //    the output of the point addition (if not at infinity) or the generator point (if at infinity)
    // Note: if `base_point.is_point_at_infinity()` is constant, these conditional assigns produce zero gate overhead
    cycle_group fallback_point(Group::affine_one);
    field_t modded_x = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.x, base_point.x);
    field_t modded_y = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.y, base_point.y);
    cycle_group modded_base_point(modded_x, modded_y, false);

    // if the input point is constant, it is cheaper to fix the point as a witness and then derive the table, than it is
    // to derive the table and fix its witnesses to be constant! (due to group additions = 1 gate, and fixing x/y coords
    // to be constant = 2 gates)
    if (base_point.is_constant() && !base_point.is_point_at_infinity().get_value()) {
        modded_base_point = cycle_group::from_constant_witness(_context, modded_base_point.get_value());
        point_table[0] = cycle_group::from_constant_witness(_context, offset_generator.get_value());
        for (size_t i = 1; i < table_size; ++i) {
            std::optional<AffineElement> hint =
                hints.has_value() ? std::optional<AffineElement>(hints.value()[i - 1]) : std::nullopt;
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, hint);
        }
    } else {
        std::vector<std::tuple<field_t, field_t>> x_coordinate_checks;
        // ensure all of the ecc add gates are lined up so that we can pay 1 gate per add and not 2
        for (size_t i = 1; i < table_size; ++i) {
            std::optional<AffineElement> hint =
                hints.has_value() ? std::optional<AffineElement>(hints.value()[i - 1]) : std::nullopt;
            x_coordinate_checks.emplace_back(point_table[i - 1].x, modded_base_point.x);
            point_table[i] = point_table[i - 1].unconditional_add(modded_base_point, hint);
        }

        // batch the x-coordinate checks together
        // because `assert_is_not_zero` witness generation needs a modular inversion (expensive)
        field_t coordinate_check_product = 1;
        for (auto& [x1, x2] : x_coordinate_checks) {
            auto x_diff = x2 - x1;
            coordinate_check_product *= x_diff;
        }
        coordinate_check_product.assert_is_not_zero("straus_lookup_table x-coordinate collision");

        for (size_t i = 1; i < table_size; ++i) {
            point_table[i] =
                cycle_group::conditional_assign(base_point.is_point_at_infinity(), offset_generator, point_table[i]);
        }
    }
    if constexpr (IS_ULTRA) {
        rom_id = context->create_ROM_array(table_size);
        for (size_t i = 0; i < table_size; ++i) {
            if (point_table[i].is_constant()) {
                auto element = point_table[i].get_value();
                point_table[i] = cycle_group::from_constant_witness(_context, element);
                point_table[i].x.assert_equal(element.x);
                point_table[i].y.assert_equal(element.y);
            }
            context->set_ROM_element_pair(
                rom_id,
                i,
                std::array<uint32_t, 2>{ point_table[i].x.get_witness_index(), point_table[i].y.get_witness_index() });
        }
    } else {
        ASSERT(table_bits == 1);
    }
}

/**
 * @brief Given an `_index` witness, return `straus_lookup_table[index]`
 *
 * @tparam Builder
 * @param _index
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::straus_lookup_table::read(const field_t& _index)
{
    if constexpr (IS_ULTRA) {
        field_t index(_index);
        if (index.is_constant()) {
            index = witness_t(_context, _index.get_value());
            index.assert_equal(_index.get_value());
        }
        auto output_indices = _context->read_ROM_array_pair(rom_id, index.get_witness_index());
        field_t x = field_t::from_witness_index(_context, output_indices[0]);
        field_t y = field_t::from_witness_index(_context, output_indices[1]);
        // Merge tag of table with tag of index
        x.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
        y.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
        return cycle_group(x, y, /*is_infinity=*/false);
    }
    field_t x = _index * (point_table[1].x - point_table[0].x) + point_table[0].x;
    field_t y = _index * (point_table[1].y - point_table[0].y) + point_table[0].y;

    // Merge tag of table with tag of index
    x.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
    y.set_origin_tag(OriginTag(tag, _index.get_origin_tag()));
    return cycle_group(x, y, /*is_infinity=*/false);
}

/**
 * @brief Internal algorithm to perform a variable-base batch mul.
 *
 * @note Explicit assumption that all base_points are witnesses and not constants!
 *       Constant points must be filtered out by `batch_mul` before calling this.
 *
 * @details batch mul performed via the Straus multiscalar multiplication algorithm
 *          (optimal for MSMs where num points <128-ish).
 *          If Builder is not ULTRA, number of bits per Straus round = 1,
 *          which reduces to the basic double-and-add algorithm
 *
 * @details If `unconditional_add = true`, we use `::unconditional_add` instead of `::checked_unconditional_add`.
 *          Use with caution! Only should be `true` if we're doing an ULTRA fixed-base MSM so we know the points cannot
 *          collide with the offset generators.
 *
 * @note ULTRA Builder will call `_variable_base_batch_mul_internal` to evaluate fixed-base MSMs over points that do
 *       not exist in our precomputed plookup tables. This is a comprimise between maximising circuit efficiency and
 *       minimizing the blowup size of our precomputed table polynomials. variable-base mul uses small ROM lookup tables
 *       which are witness-defined and not part of the plookup protocol.
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param offset_generators
 * @param unconditional_add
 * @return cycle_group<Builder>::batch_mul_internal_output
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_variable_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars,
    const std::span<cycle_group> base_points,
    const std::span<AffineElement const> offset_generators,
    const bool unconditional_add)
{
    ASSERT(scalars.size() == base_points.size());

    Builder* context = nullptr;
    for (auto& scalar : scalars) {
        if (scalar.lo.get_context() != nullptr) {
            context = scalar.get_context();
            break;
        }
    }
    for (auto& point : base_points) {
        if (point.get_context() != nullptr) {
            context = point.get_context();
            break;
        }
    }

    size_t num_bits = 0;
    for (auto& s : scalars) {
        num_bits = std::max(num_bits, s.num_bits());
    }
    size_t num_rounds = (num_bits + TABLE_BITS - 1) / TABLE_BITS;

    const size_t num_points = scalars.size();

    std::vector<straus_scalar_slice> scalar_slices;

    /**
     * Compute the witness values of the batch_mul algorithm natively, as Element types with a Z-coordinate.
     * We then batch-convert to AffineElement types, and feed these points as "hints" into the cycle_group methods.
     * This avoids the need to compute modular inversions for every group operation, which dramatically reduces witness
     * generation times
     */
    std::vector<Element> operation_transcript;
    std::vector<std::vector<Element>> native_straus_tables;
    Element offset_generator_accumulator = offset_generators[0];
    {
        for (size_t i = 0; i < num_points; ++i) {
            std::vector<Element> native_straus_table;
            native_straus_table.emplace_back(offset_generators[i + 1]);
            size_t table_size = 1ULL << TABLE_BITS;
            for (size_t j = 1; j < table_size; ++j) {
                native_straus_table.emplace_back(native_straus_table[j - 1] + base_points[i].get_value());
            }
            native_straus_tables.emplace_back(native_straus_table);
        }
        for (size_t i = 0; i < num_points; ++i) {
            scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], TABLE_BITS));

            auto table_transcript = straus_lookup_table::compute_straus_lookup_table_hints(
                base_points[i].get_value(), offset_generators[i + 1], TABLE_BITS);
            std::copy(table_transcript.begin() + 1, table_transcript.end(), std::back_inserter(operation_transcript));
        }
        Element accumulator = offset_generators[0];

        for (size_t i = 0; i < num_rounds; ++i) {
            if (i != 0) {
                for (size_t j = 0; j < TABLE_BITS; ++j) {
                    // offset_generator_accuulator is a regular Element, so dbl() won't add constraints
                    accumulator = accumulator.dbl();
                    operation_transcript.emplace_back(accumulator);
                    offset_generator_accumulator = offset_generator_accumulator.dbl();
                }
            }
            for (size_t j = 0; j < num_points; ++j) {

                const Element point =
                    native_straus_tables[j][static_cast<size_t>(scalar_slices[j].slices_native[num_rounds - i - 1])];

                accumulator += point;

                operation_transcript.emplace_back(accumulator);
                offset_generator_accumulator = offset_generator_accumulator + Element(offset_generators[j + 1]);
            }
        }
    }

    // Normalize the computed witness points and convert into AffineElement type
    Element::batch_normalize(&operation_transcript[0], operation_transcript.size());

    std::vector<AffineElement> operation_hints;
    operation_hints.reserve(operation_transcript.size());
    for (auto& element : operation_transcript) {
        operation_hints.emplace_back(AffineElement(element.x, element.y));
    }

    std::vector<straus_lookup_table> point_tables;
    const size_t hints_per_table = (1ULL << TABLE_BITS) - 1;
    OriginTag tag{};
    for (size_t i = 0; i < num_points; ++i) {
        std::span<AffineElement> table_hints(&operation_hints[i * hints_per_table], hints_per_table);
        // Merge tags
        tag = OriginTag(tag, scalars[i].get_origin_tag(), base_points[i].get_origin_tag());
        scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], TABLE_BITS));
        point_tables.emplace_back(straus_lookup_table(context, base_points[i], offset_generators[i + 1], TABLE_BITS));
    }

    AffineElement* hint_ptr = &operation_hints[num_points * hints_per_table];
    cycle_group accumulator = offset_generators[0];

    // populate the set of points we are going to add into our accumulator, *before* we do any ECC operations
    // this way we are able to fuse mutliple ecc add / ecc double operations and reduce total gate count.
    // (ecc add/ecc double gates normally cost 2 Ultra gates. However if we chain add->add, add->double,
    // double->add, double->double, they only cost one)
    std::vector<cycle_group> points_to_add;
    for (size_t i = 0; i < num_rounds; ++i) {
        for (size_t j = 0; j < num_points; ++j) {
            const std::optional<field_t> scalar_slice = scalar_slices[j].read(num_rounds - i - 1);
            // if we are doing a batch mul over scalars of different bit-lengths, we may not have any scalar bits for a
            // given round and a given scalar
            if (scalar_slice.has_value()) {
                const cycle_group point = point_tables[j].read(scalar_slice.value());
                points_to_add.emplace_back(point);
            }
        }
    }

    std::vector<std::tuple<field_t, field_t>> x_coordinate_checks;
    size_t point_counter = 0;
    for (size_t i = 0; i < num_rounds; ++i) {
        if (i != 0) {
            for (size_t j = 0; j < TABLE_BITS; ++j) {
                accumulator = accumulator.dbl(*hint_ptr);
                hint_ptr++;
            }
        }

        for (size_t j = 0; j < num_points; ++j) {
            const std::optional<field_t> scalar_slice = scalar_slices[j].read(num_rounds - i - 1);
            // if we are doing a batch mul over scalars of different bit-lengths, we may not have a bit slice
            // for a given round and a given scalar
            ASSERT(scalar_slice.value().get_value() == scalar_slices[j].slices_native[num_rounds - i - 1]);
            if (scalar_slice.has_value()) {
                const auto& point = points_to_add[point_counter++];
                if (!unconditional_add) {
                    x_coordinate_checks.push_back({ accumulator.x, point.x });
                }
                accumulator = accumulator.unconditional_add(point, *hint_ptr);
                hint_ptr++;
            }
        }
    }

    // validate that none of the x-coordinate differences are zero
    // we batch the x-coordinate checks together
    // because `assert_is_not_zero` witness generation needs a modular inversion (expensive)
    field_t coordinate_check_product = 1;
    for (auto& [x1, x2] : x_coordinate_checks) {
        auto x_diff = x2 - x1;
        coordinate_check_product *= x_diff;
    }
    coordinate_check_product.assert_is_not_zero("_variable_base_batch_mul_internal x-coordinate collision");

    // Set the final accumulator's tag to the union of all points' and scalars' tags
    accumulator.set_origin_tag(tag);
    /**
     * offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
     * We don't subtract off yet, as we may be able to combine `offset_generator_accumulator` with other constant terms
     * in `batch_mul` before performing the subtraction.
     */
    return { accumulator, AffineElement(offset_generator_accumulator) };
}

/**
 * @brief Internal algorithm to perform a fixed-base batch mul for ULTRA Builder
 *
 * @details Uses plookup tables which contain lookups for precomputed multiples of the input base points.
 *          Means we can avoid all point doublings and reduce one scalar mul to ~29 lookups + 29 ecc addition gates
 *
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param
 * @return cycle_group<Builder>::batch_mul_internal_output
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_fixed_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars,
    const std::span<AffineElement> base_points,
    const std::span<AffineElement const> /*unused*/)
    requires IsUltraArithmetic<Builder>
{
    ASSERT(scalars.size() == base_points.size());

    const size_t num_points = base_points.size();
    using MultiTableId = plookup::MultiTableId;
    using ColumnIdx = plookup::ColumnIdx;

    std::vector<MultiTableId> plookup_table_ids;
    std::vector<AffineElement> plookup_base_points;
    std::vector<field_t> plookup_scalars;

    OriginTag tag{};
    for (size_t i = 0; i < num_points; ++i) {
        // Merge all tags of scalars
        tag = OriginTag(tag, scalars[i].get_origin_tag());
        std::optional<std::array<MultiTableId, 2>> table_id =
            plookup::fixed_base::table::get_lookup_table_ids_for_point(base_points[i]);
        ASSERT(table_id.has_value());
        plookup_table_ids.emplace_back(table_id.value()[0]);
        plookup_table_ids.emplace_back(table_id.value()[1]);
        plookup_base_points.emplace_back(base_points[i]);
        plookup_base_points.emplace_back(Element(base_points[i]) * (uint256_t(1) << cycle_scalar::LO_BITS));
        plookup_scalars.emplace_back(scalars[i].lo);
        plookup_scalars.emplace_back(scalars[i].hi);
    }

    std::vector<cycle_group> lookup_points;
    Element offset_generator_accumulator = Group::point_at_infinity;
    for (size_t i = 0; i < plookup_scalars.size(); ++i) {
        plookup::ReadData<field_t> lookup_data =
            plookup_read<Builder>::get_lookup_accumulators(plookup_table_ids[i], plookup_scalars[i]);
        for (size_t j = 0; j < lookup_data[ColumnIdx::C2].size(); ++j) {
            const auto x = lookup_data[ColumnIdx::C2][j];
            const auto y = lookup_data[ColumnIdx::C3][j];
            lookup_points.emplace_back(cycle_group(x, y, /*is_infinity=*/false));
        }

        std::optional<AffineElement> offset_1 =
            plookup::fixed_base::table::get_generator_offset_for_table_id(plookup_table_ids[i]);

        ASSERT(offset_1.has_value());
        offset_generator_accumulator += offset_1.value();
    }
    /**
     * Compute the witness values of the batch_mul algorithm natively, as Element types with a Z-coordinate.
     * We then batch-convert to AffineElement types, and feed these points as "hints" into the cycle_group methods.
     * This avoids the need to compute modular inversions for every group operation, which dramatically reduces witness
     * generation times
     */
    std::vector<Element> operation_transcript;
    {
        Element accumulator = lookup_points[0].get_value();
        for (size_t i = 1; i < lookup_points.size(); ++i) {
            accumulator = accumulator + (lookup_points[i].get_value());
            operation_transcript.emplace_back(accumulator);
        }
    }
    Element::batch_normalize(&operation_transcript[0], operation_transcript.size());
    std::vector<AffineElement> operation_hints;
    operation_hints.reserve(operation_transcript.size());
    for (auto& element : operation_transcript) {
        operation_hints.emplace_back(AffineElement(element.x, element.y));
    }

    cycle_group accumulator = lookup_points[0];
    // Perform all point additions sequentially. The Ultra ecc_addition relation costs 1 gate iff additions are chained
    // and output point of previous addition = input point of current addition.
    // If this condition is not met, the addition relation costs 2 gates. So it's good to do these sequentially!
    for (size_t i = 1; i < lookup_points.size(); ++i) {
        accumulator = accumulator.unconditional_add(lookup_points[i], operation_hints[i - 1]);
    }
    /**
     * offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
     * We don't subtract off yet, as we may be able to combine `offset_generator_accumulator` with other constant terms
     * in `batch_mul` before performing the subtraction.
     */
    // Set accumulator's origin tag to the union of all scalars' tags
    accumulator.set_origin_tag(tag);
    return { accumulator, offset_generator_accumulator };
}

/**
 * @brief Internal algorithm to perform a fixed-base batch mul for Non-ULTRA Builders
 *
 * @details Multiples of the base point are precomputed, which avoids us having to add ecc doubling gates.
 *          More efficient than variable-base version.
 *
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param off
 * @return cycle_group<Builder>::batch_mul_internal_output
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_fixed_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars,
    const std::span<AffineElement> base_points,
    const std::span<AffineElement const> offset_generators)
    requires IsNotUltraArithmetic<Builder>

{
    ASSERT(scalars.size() == base_points.size());
    static_assert(TABLE_BITS == 1);

    Builder* context = nullptr;
    for (auto& scalar : scalars) {
        if (scalar.get_context() != nullptr) {
            context = scalar.get_context();
            break;
        }
    }

    size_t num_bits = 0;
    for (auto& s : scalars) {
        num_bits = std::max(num_bits, s.num_bits());
    }
    size_t num_rounds = (num_bits + TABLE_BITS - 1) / TABLE_BITS;
    // core algorithm
    // define a `table_bits` size lookup table
    const size_t num_points = scalars.size();
    using straus_round_tables = std::vector<straus_lookup_table>;

    std::vector<straus_scalar_slice> scalar_slices;
    std::vector<straus_round_tables> point_tables(num_points);

    // creating these point tables should cost 0 constraints if base points are constant
    for (size_t i = 0; i < num_points; ++i) {
        std::vector<Element> round_points(num_rounds);
        std::vector<Element> round_offset_generators(num_rounds);
        round_points[0] = base_points[i];
        round_offset_generators[0] = offset_generators[i + 1];
        for (size_t j = 1; j < num_rounds; ++j) {
            round_points[j] = round_points[j - 1].dbl();
            round_offset_generators[j] = round_offset_generators[j - 1].dbl();
        }
        Element::batch_normalize(&round_points[0], num_rounds);
        Element::batch_normalize(&round_offset_generators[0], num_rounds);
        point_tables[i].resize(num_rounds);
        for (size_t j = 0; j < num_rounds; ++j) {
            point_tables[i][j] = straus_lookup_table(
                context, cycle_group(round_points[j]), cycle_group(round_offset_generators[j]), TABLE_BITS);
        }
        scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], TABLE_BITS));
    }
    Element offset_generator_accumulator = offset_generators[0];
    cycle_group accumulator = cycle_group(Element(offset_generators[0]) * (uint256_t(1) << (num_rounds - 1)));
    for (size_t i = 0; i < num_rounds; ++i) {
        offset_generator_accumulator = (i > 0) ? offset_generator_accumulator.dbl() : offset_generator_accumulator;
        for (size_t j = 0; j < num_points; ++j) {
            auto& point_table = point_tables[j][i];
            const std::optional<field_t> scalar_slice = scalar_slices[j].read(i);
            // if we are doing a batch mul over scalars of different bit-lengths, we may not have any scalar bits for a
            // given round and a given scalar
            if (scalar_slice.has_value()) {
                const cycle_group point = point_table.read(scalar_slice.value());
                accumulator = accumulator.unconditional_add(point);
                offset_generator_accumulator = offset_generator_accumulator + Element(offset_generators[j + 1]);
            }
        }
    }

    /**
     * offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
     * We don't subtract off yet, as we may be able to combine `offset_generator_accumulator` with other constant terms
     * in `batch_mul` before performing the subtraction.
     */
    return { accumulator, offset_generator_accumulator };
}

/**
 * @brief Multiscalar multiplication algorithm.
 *
 * @details Uses the Straus MSM algorithm. `batch_mul` splits inputs into three categories:
 *          1. point and scalar multiplier are both constant
 *          2. point is constant, scalar multiplier is a witness
 *          3. point is a witness, scalar multiplier can be witness or constant
 *
 * For Category 1, the scalar mul can be precomuted without constraints
 * For Category 2, we use a fixed-base variant of Straus (with plookup tables if available).
 * For Category 3, we use standard Straus.
 * The results from all 3 categories are combined and returned as an output point.
 *
 * @note batch_mul can handle all known cases of trigger incomplete addition formula exceptions and other weirdness:
 *       1. some/all of the input points are points at infinity
 *       2. some/all of the input scalars are 0
 *       3. some/all input points are equal to each other
 *       4. output is the point at infinity
 *       5. input vectors are empty
 *
 * @note offset_generator_data is a pointer to precomputed offset generator list.
 *       There is a default parameter point that poitns to a list with DEFAULT_NUM_GENERATORS generator points (32)
 *       If more offset generators are required, they will be derived in-place which can be expensive.
 *       (num required offset generators is either num input points + 1 or num input points + 2,
 *        depends on if one or both of _fixed_base_batch_mul_internal, _variable_base_batch_mul_internal are called)
 *       If you're calling this function repeatedly and you KNOW you need >32 offset generators,
 *       it's faster to create a `generator_data` object with the required size and pass it in as a parameter.
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param offset_generator_data
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::batch_mul(const std::vector<cycle_group>& base_points,
                                                     const std::vector<cycle_scalar>& scalars,
                                                     const GeneratorContext context)
{
    ASSERT(scalars.size() == base_points.size());

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

    // if num_bits != NUM_BITS, skip lookup-version of fixed-base scalar mul. too much complexity
    bool num_bits_not_full_field_size = num_bits != NUM_BITS;

    // When calling `_variable_base_batch_mul_internal`, we can unconditionally add iff all of the input points
    // are fixed-base points
    // (i.e. we are ULTRA Builder and we are doing fixed-base mul over points not present in our plookup tables)
    bool can_unconditional_add = true;
    bool has_non_constant_component = false;
    Element constant_acc = Group::point_at_infinity;
    for (size_t i = 0; i < scalars.size(); ++i) {
        bool scalar_constant = scalars[i].is_constant();
        bool point_constant = base_points[i].is_constant();
        if (scalar_constant && point_constant) {
            constant_acc += (base_points[i].get_value()) * (scalars[i].get_value());
        } else if (!scalar_constant && point_constant) {
            if (base_points[i].get_value().is_point_at_infinity()) {
                // oi mate, why are you creating a circuit that multiplies a known point at infinity?
                continue;
            }
            if constexpr (IS_ULTRA) {
                if (!num_bits_not_full_field_size &&
                    plookup::fixed_base::table::lookup_table_exists_for_point(base_points[i].get_value())) {
                    fixed_base_scalars.push_back(scalars[i]);
                    fixed_base_points.push_back(base_points[i].get_value());
                } else {
                    // womp womp. We have lookup tables at home. ROM tables.
                    variable_base_scalars.push_back(scalars[i]);
                    variable_base_points.push_back(base_points[i]);
                }
            } else {
                fixed_base_scalars.push_back(scalars[i]);
                fixed_base_points.push_back(base_points[i].get_value());
            }
            has_non_constant_component = true;
        } else {
            variable_base_scalars.push_back(scalars[i]);
            variable_base_points.push_back(base_points[i]);
            can_unconditional_add = false;
            has_non_constant_component = true;
            // variable base
        }
    }

    // If all inputs are constant, return the computed constant component and call it a day.
    if (!has_non_constant_component) {
        auto result = cycle_group(constant_acc);
        result.set_origin_tag(result_tag);
        return result;
    }

    // add the constant component into our offset accumulator
    // (we'll subtract `offset_accumulator` from the MSM output i.e. we negate here to counter the future negation)
    Element offset_accumulator = -constant_acc;
    const bool has_variable_points = !variable_base_points.empty();
    const bool has_fixed_points = !fixed_base_points.empty();

    // Compute all required offset generators.
    const size_t num_offset_generators =
        variable_base_points.size() + fixed_base_points.size() + has_variable_points + has_fixed_points;
    const std::span<AffineElement const> offset_generators =
        context.generators->get(num_offset_generators, 0, OFFSET_GENERATOR_DOMAIN_SEPARATOR);

    cycle_group result;
    if (has_fixed_points) {
        const auto [fixed_accumulator, offset_generator_delta] =
            _fixed_base_batch_mul_internal(fixed_base_scalars, fixed_base_points, offset_generators);
        offset_accumulator += offset_generator_delta;
        result = fixed_accumulator;
    }

    if (has_variable_points) {
        std::span<AffineElement const> offset_generators_for_variable_base_batch_mul{
            offset_generators.data() + fixed_base_points.size(), offset_generators.size() - fixed_base_points.size()
        };
        const auto [variable_accumulator, offset_generator_delta] =
            _variable_base_batch_mul_internal(variable_base_scalars,
                                              variable_base_points,
                                              offset_generators_for_variable_base_batch_mul,
                                              can_unconditional_add);
        offset_accumulator += offset_generator_delta;
        if (has_fixed_points) {
            result = can_unconditional_add ? result.unconditional_add(variable_accumulator)
                                           : result.checked_unconditional_add(variable_accumulator);
        } else {
            result = variable_accumulator;
        }
    }

    // Update `result` to remove the offset generator terms, and add in any constant terms from `constant_acc`.
    // We have two potential modes here:
    // 1. All inputs are fixed-base and we constant_acc is not the point at infinity
    // 2. Everything else.
    // Case 1 is a special case, as we *know* we cannot hit incomplete addition edge cases,
    // under the assumption that all input points are linearly independent of one another.
    // Because constant_acc is not the point at infnity we know that at least 1 input scalar was not zero,
    // i.e. the output will not be the point at infinity. We also know under case 1, we won't trigger the
    // doubling formula either, as every point is lienarly independent of every other point (including offset
    // generators).
    if (!constant_acc.is_point_at_infinity() && can_unconditional_add) {
        result = result.unconditional_add(AffineElement(-offset_accumulator));
    } else {
        // For case 2, we must use a full subtraction operation that handles all possible edge cases, as the output
        // point may be the point at infinity.
        // TODO(@zac-williamson) We can probably optimize this a bit actually. We might hit the point at infinity,
        // but an honest prover won't trigger the doubling edge case.
        // (doubling edge case implies input points are also the offset generator points,
        // which we can assume an honest Prover will not do if we make this case produce unsatisfiable constraints)
        // We could do the following:
        // 1. If x-coords match, assert y-coords do not match
        // 2. If x-coords match, return point at infinity, else return result - offset_accumulator.
        // This would be slightly cheaper than operator- as we do not have to evaluate the double edge case.
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
    auto x_res = field_t::conditional_assign(predicate, lhs.x, rhs.x);
    auto y_res = field_t::conditional_assign(predicate, lhs.y, rhs.y);
    auto _is_infinity_res =
        bool_t::conditional_assign(predicate, lhs.is_point_at_infinity(), rhs.is_point_at_infinity());

    bool _is_standard_res = lhs._is_standard && rhs._is_standard;
    if (predicate.is_constant()) {
        _is_standard_res = predicate.get_value() ? lhs._is_standard : rhs._is_standard;
    }

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
