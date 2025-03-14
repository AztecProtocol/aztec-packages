#pragma once

#include <cstdint>
#include <ostream>

namespace bb::avm2 {

/**
 * AVM bytecode expects the representation of points to be triplets, the two coordinates and an is_infinity boolean.
 * Furthermore, its representation of infinity is inherited from noir's and is expected to be 0,0,true.
 * BB, however, uses only the two coordinates to represent points. Infinity in barretenberg is represented as (P+1)/2,0.
 * This class is a wrapper of the BB representation, needed to operate with points, that allows to extract the standard
 * representation that AVM bytecode expects.
 */
template <typename AffinePoint> class StandardAffinePoint {
  public:
    using BaseField = AffinePoint::Fq;
    using ScalarField = AffinePoint::Fr;

    constexpr StandardAffinePoint() noexcept = default;

    constexpr StandardAffinePoint(AffinePoint val) noexcept
        : point(val)
    {}

    constexpr StandardAffinePoint(BaseField x, BaseField y, bool is_infinity) noexcept
        : point(is_infinity ? AffinePoint::infinity() : AffinePoint(x, y))
    {}

    constexpr StandardAffinePoint operator+(const StandardAffinePoint& other) const noexcept
    {
        return StandardAffinePoint(point + other.point);
    }

    constexpr StandardAffinePoint operator*(const ScalarField& exponent) const noexcept
    {
        return StandardAffinePoint(point * exponent);
    }

    constexpr bool operator==(const StandardAffinePoint& other) const noexcept
    {
        return (this == &other || point == other.point);
    }

    constexpr StandardAffinePoint operator-() const noexcept { return StandardAffinePoint(-point); }

    [[nodiscard]] constexpr bool is_infinity() const noexcept { return point.is_point_at_infinity(); }

    [[nodiscard]] constexpr bool on_curve() const noexcept { return point.on_curve(); }

    constexpr const BaseField& x() const noexcept { return point.is_point_at_infinity() ? zero : point.x; }

    constexpr const BaseField& y() const noexcept { return point.is_point_at_infinity() ? zero : point.y; }

    static const StandardAffinePoint& infinity()
    {
        static auto infinity = StandardAffinePoint(AffinePoint::infinity());
        return infinity;
    }

    static const StandardAffinePoint& one()
    {
        static auto one = StandardAffinePoint(AffinePoint::one());
        return one;
    }

  private:
    AffinePoint point;
    static constexpr const auto zero = BaseField::zero();
};

template <typename T> std::ostream& operator<<(std::ostream& os, const StandardAffinePoint<T>& point)
{
    os << "StandardAffinePoint(" << point.x() << ", " << point.y() << ", " << point.is_infinity() << ")";
    return os;
}

} // namespace bb::avm2
