#pragma once

#include <cstdint>
#include <ostream>

namespace bb::avm2 {

/**
 * The AVM's representation of infinity is inherited from noir's and is expected to be 0,0.
 * BB, however, uses only the two coordinates to represent points. Infinity in barretenberg is represented as
 * (P+1)/2,0,true. This class is a wrapper of the BB representation, needed to operate with points, that allows us to
 * extract the standard representation that AVM bytecode expects.
 *
 * NOTE: When constructing infinity from BB's two element representation, we keep the original AffinePoint so operations
 * can use it in the background, but set extractable coordinates to be our represention of (0,0).
 * NOTE: When constructing infinity via BaseFields (equiv. inputting (0, 0), the underlying AffinePoint is set to BB's
 * representation so operations can use it in the background.
 */
template <typename AffinePoint> class StandardAffinePoint {
  public:
    using BaseField = AffinePoint::Fq;
    using ScalarField = AffinePoint::Fr;

    constexpr StandardAffinePoint() noexcept = default;

    constexpr StandardAffinePoint(AffinePoint val) noexcept
        : point(val)
        , x_coord(val.is_point_at_infinity() ? zero : val.x)
        , y_coord(val.is_point_at_infinity() ? zero : val.y)
    {}

    constexpr StandardAffinePoint(BaseField x, BaseField y) noexcept
        : point((x.is_zero() && y.is_zero()) ? AffinePoint::infinity() : AffinePoint(x, y))
        , x_coord(x)
        , y_coord(y)
    {}

    constexpr StandardAffinePoint operator+(const StandardAffinePoint& other) const noexcept
    {
        AffinePoint result = point + other.point;
        if (result.is_point_at_infinity()) {
            // If the result is infinity, we need to normalise it to (0,0) to match noir outputs.
            return StandardAffinePoint::infinity();
        }
        return StandardAffinePoint(result);
    }

    constexpr StandardAffinePoint operator*(const ScalarField& exponent) const noexcept
    {
        AffinePoint result = point * exponent;
        if (result.is_point_at_infinity()) {
            // If the result is infinity, we need to normalise it to (0,0) to match noir outputs.
            return StandardAffinePoint::infinity();
        }
        return StandardAffinePoint(result);
    }

    constexpr bool operator==(const StandardAffinePoint& other) const noexcept
    {
        return (this == &other || point == other.point);
    }

    constexpr StandardAffinePoint operator-() const noexcept
    {
        // Negating infinity returns itself, preserving raw coordinates.
        if (point.is_point_at_infinity()) {
            return *this;
        }
        return StandardAffinePoint(-point);
    }

    [[nodiscard]] constexpr bool is_infinity() const noexcept { return point.is_point_at_infinity(); }

    [[nodiscard]] constexpr bool on_curve() const noexcept { return point.on_curve(); }

    // Always returns Noir standard coordinates. For the point at infinity this is always (0, 0). If that point was
    // constructed via AffinePoint with a different representation, those non-zero coordinates are preserved in .point.
    constexpr const BaseField& x() const noexcept { return x_coord; }

    constexpr const BaseField& y() const noexcept { return y_coord; }

    static const StandardAffinePoint& infinity()
    {
        static auto infinity = StandardAffinePoint(zero, zero);
        return infinity;
    }

    static const StandardAffinePoint& one()
    {
        static auto one = StandardAffinePoint(AffinePoint::one());
        return one;
    }

  private:
    // The affine point for operations, this will always match the raw coordinates unless the point is infinity.
    // In that case, the point will be set to AffinePoint's infinity representation - which may not be (0,0).
    AffinePoint point;
    // These are the raw x and y coordinates, that are set when constructing the point. When an operation results
    // in infinity, these will be set to (0,0) to match noir's expected representation.
    BaseField x_coord = zero;
    BaseField y_coord = zero;
    static constexpr const auto zero = BaseField::zero();
};

template <typename T> std::ostream& operator<<(std::ostream& os, const StandardAffinePoint<T>& point)
{
    os << "StandardAffinePoint(" << point.x() << ", " << point.y() << ", " << point.is_infinity() << ")";
    return os;
}

} // namespace bb::avm2
