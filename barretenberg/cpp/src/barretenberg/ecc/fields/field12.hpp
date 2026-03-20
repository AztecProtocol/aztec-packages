// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/numeric/random/engine.hpp"

namespace bb {
template <typename quadratic_field, typename base_field, typename Fq12Params> class field12 {
  public:
    constexpr field12(const base_field& a = base_field::zero(), const base_field& b = base_field::zero())
        : c0(a)
        , c1(b)
    {}

    constexpr field12(const field12& other)
        : c0(other.c0)
        , c1(other.c1)
    {}

    constexpr field12(field12&& other) noexcept
        : c0(other.c0)
        , c1(other.c1)
    {}

    constexpr field12& operator=(const field12& other) noexcept
    {
        if (this == &other) {
            return *this;
        }
        c0 = other.c0;
        c1 = other.c1;
        return *this;
    }

    constexpr field12& operator=(field12&& other) noexcept
    {
        c0 = other.c0;
        c1 = other.c1;
        return *this;
    }

    constexpr ~field12() noexcept = default;

    base_field c0;
    base_field c1;

    struct ell_coeffs {
        quadratic_field o;
        quadratic_field w;
        quadratic_field vw;
    };

    static constexpr field12 zero() { return { base_field::zero(), base_field::zero() }; };
    static constexpr field12 one() { return { base_field::one(), base_field::zero() }; };

    static constexpr base_field mul_by_non_residue(const base_field& a)
    {
        return {
            base_field::mul_by_non_residue(a.c2),
            a.c0,
            a.c1,
        };
    }

    constexpr field12 operator+(const field12& other) const
    {
        return {
            c0 + other.c0,
            c1 + other.c1,
        };
    }

    constexpr field12 operator-(const field12& other) const
    {
        return {
            c0 - other.c0,
            c1 - other.c1,
        };
    }

    constexpr field12 operator-() const { return { -c0, -c1 }; }

    constexpr field12 operator*(const field12& other) const
    {
        base_field T0 = c0 * other.c0;
        base_field T1 = c1 * other.c1;
        base_field T2 = c0 + c1;
        base_field T3 = other.c0 + other.c1;

        return {
            mul_by_non_residue(T1) + T0,
            T2 * T3 - (T0 + T1),
        };
    }

    constexpr field12 operator/(const field12& other) const { return operator*(other.invert()); }

    constexpr field12 operator+=(const field12& other)
    {
        c0 += other.c0;
        c1 += other.c1;
        return *this;
    }

    constexpr field12 operator-=(const field12& other)
    {
        c0 -= other.c0;
        c1 -= other.c1;
        return *this;
    }

    constexpr field12 operator*=(const field12& other)
    {
        *this = operator*(other);
        return *this;
    }

    constexpr field12 operator/=(const field12& other)
    {
        *this = operator/(other);
        return *this;
    }

    constexpr void self_neg()
    {
        c0.self_neg();
        c1.self_neg();
    }

    constexpr void self_sqr() { *this = sqr(); }

    /**
     * @brief Multiply the element by a sparse element of the form ell.o + ell.w * w + ell.vw * wv.
     *
     * @details Algorithm 5 from https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf
     *
     * Tower structure: Fq12 = Fq6[w]/(w² - v), so an Fq12 element is (c0 + c1·w) with c0, c1 in Fq6.
     * The sparse element is s = (s0 + s1·w) where s0 = {ell.o, 0, 0} and s1 = {ell.w, ell.vw, 0} in Fq6.
     *
     * Generic multiplication gives:
     *   result.c0 = c0·s0 + c1·s1·v    (since w² = v)
     *   result.c1 = c0·s1 + c1·s0      (cross terms)
     *
     * We use Karatsuba to compute the cross terms with one fewer Fq6 multiplication:
     *   A = c0·s0                 (computed directly: s0 = {ell.o,0,0}, so A = {ell.o·c0.c0, ell.o·c0.c1, ell.o·c0.c2})
     *   B = c1·s1                 (via field6::sparse_mul, since s1 = {ell.w, ell.vw, 0} = ell.w + ell.vw·v)
     *   E = (c0+c1)·(s0+s1)      (via field6::sparse_mul, since s0+s1 = {ell.o+ell.w, ell.vw, 0})
     *   F = E - A - B = c0·s1 + c1·s0   (Karatsuba cross term = result.c1)
     *   G = v·B                   (constructed inline as {ξ·B.c2, B.c0, B.c1}, since v·(b0+b1·v+b2·v²) =
     *                              ξ·b2 + b0·v + b1·v²; uses Fq6::mul_by_non_residue on B.c2 to get ξ·B.c2)
     *   H = A + G = c0·s0 + c1·s1·v     (= result.c0)
     *
     * @param ell
     */
    constexpr void self_sparse_mul(const ell_coeffs& ell)
    {
        quadratic_field A0 = ell.o * c0.c0;
        quadratic_field A1 = ell.o * c0.c1;
        quadratic_field A2 = ell.o * c0.c2;
        base_field A{ A0, A1, A2 };
        base_field B = c1.sparse_mul(ell.w, ell.vw);
        base_field E = (c0 + c1).sparse_mul(ell.o + ell.w, ell.vw);
        base_field F = E - (A + B);
        base_field G{ base_field::mul_by_non_residue(B.c2), B.c0, B.c1 };
        base_field H = A + G;

        c0 = H;
        c1 = F;
    }

    constexpr field12 sqr() const
    {
        base_field T0 = c0 + c1;
        base_field T1 = mul_by_non_residue(c1) + c0;

        T0 *= T1;
        T1 = c0 * c1;

        return {
            T0 - (T1 + mul_by_non_residue(T1)),
            T1 + T1,
        };
    }

    constexpr field12 invert() const
    {
        /* From "High-Speed Software Implementation of the Optimal Ate Pairing over Barreto-Naehrig Curves"; Algorithm 8
         */
        base_field T0 = (c0.sqr() - mul_by_non_residue(c1.sqr())).invert();
        return {
            c0 * T0,
            -(c1 * T0),
        };
    }

    constexpr field12 frobenius_map_three() const
    {
        return {
            c0.frobenius_map_three(),
            c1.frobenius_map_three().mul_by_fq2(Fq12Params::frobenius_coefficients_3),
        };
    }

    constexpr field12 frobenius_map_two() const
    {
        return {
            c0.frobenius_map_two(),
            c1.frobenius_map_two().mul_by_fq2(Fq12Params::frobenius_coefficients_2),
        };
    }

    constexpr field12 frobenius_map_one() const
    {
        return {
            c0.frobenius_map_one(),
            c1.frobenius_map_one().mul_by_fq2(Fq12Params::frobenius_coefficients_1),
        };
    }

    constexpr field12 cyclotomic_squared() const { return sqr(); }

    constexpr field12 unitary_inverse() const
    {
        return {
            c0,
            -c1,
        };
    }

    static constexpr field12 random_element(numeric::RNG* engine = nullptr)
    {
        return {
            base_field::random_element(engine),
            base_field::random_element(engine),
        };
    }

    // Montgomery form conversions produced outputs where the components are all in strict/reduced form.
    constexpr field12 to_montgomery_form()
    {
        return {
            c0.to_montgomery_form(),
            c1.to_montgomery_form(),
        };
    }

    constexpr field12 from_montgomery_form() const
    {
        return {
            c0.from_montgomery_form(),
            c1.from_montgomery_form(),
        };
    }

    [[nodiscard]] constexpr bool is_zero() const { return c0.is_zero() && c1.is_zero(); }

    constexpr bool operator==(const field12& other) const { return c0 == other.c0 && c1 == other.c1; }
};
} // namespace bb
