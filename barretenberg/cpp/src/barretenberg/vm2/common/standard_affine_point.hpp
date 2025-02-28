#pragma once

#include <cstdint>

namespace bb::avm2 {

template <typename Group> class StandardAffinePoint {
  public:
    using AffinePoint = Group::affine_element;
    using CoordinateField = Group::Fq;
    using ScalarField = Group::Fr;

    constexpr StandardAffinePoint() noexcept
        : point(AffinePoint())
    {}

    constexpr StandardAffinePoint(AffinePoint val) noexcept
        : point(val)
    {}

    constexpr StandardAffinePoint(CoordinateField x, CoordinateField y, bool is_infinity) noexcept
    {
        if (is_infinity) {
            point = AffinePoint::infinity();
        } else {
            point = AffinePoint(x, y);
        }
    }

    constexpr StandardAffinePoint operator+(const StandardAffinePoint& other) const noexcept
    {
        return StandardAffinePoint(point + other.point);
    }

    constexpr StandardAffinePoint operator*(const ScalarField& exponent) const noexcept
    {
        return StandardAffinePoint(point * exponent);
    }

    constexpr bool operator==(const StandardAffinePoint& other) const noexcept { return point == other.point; }

    constexpr StandardAffinePoint operator-() const noexcept { return StandardAffinePoint(-point); }

    [[nodiscard]] constexpr bool is_infinity() const noexcept { return point.is_point_at_infinity(); }

    [[nodiscard]] constexpr bool on_curve() const noexcept { return point.on_curve(); }

    constexpr CoordinateField x() const noexcept
    {
        return point.is_point_at_infinity() ? CoordinateField::zero() : point.x;
    }

    constexpr CoordinateField y() const noexcept
    {
        return point.is_point_at_infinity() ? CoordinateField::zero() : point.y;
    }

    static StandardAffinePoint infinity() { return StandardAffinePoint(AffinePoint::infinity()); }

  private:
    AffinePoint point;
};

} // namespace bb::avm2
