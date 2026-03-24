// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/numeric/random/engine.hpp"

namespace bb {
template <typename base_field, typename Fq6Params> class field6 {
  public:
    constexpr field6(const base_field& a = base_field::zero(),
                     const base_field& b = base_field::zero(),
                     const base_field& c = base_field::zero())
        : c0(a)
        , c1(b)
        , c2(c)
    {}

    constexpr field6(const field6& other)
        : c0(other.c0)
        , c1(other.c1)
        , c2(other.c2)
    {}

    constexpr field6(field6&& other) noexcept
        : c0(other.c0)
        , c1(other.c1)
        , c2(other.c2)
    {}

    constexpr field6& operator=(const field6& other) noexcept
    {
        if (this == &other) {
            return *this;
        }
        c0 = other.c0;
        c1 = other.c1;
        c2 = other.c2;
        return *this;
    }

    constexpr field6& operator=(field6&& other) noexcept
    {
        c0 = other.c0;
        c1 = other.c1;
        c2 = other.c2;
        return *this;
    }

    constexpr ~field6() noexcept = default;

    base_field c0;
    base_field c1;
    base_field c2;

    static constexpr field6 zero() { return { base_field::zero(), base_field::zero(), base_field::zero() }; };
    static constexpr field6 one() { return { base_field::one(), base_field::zero(), base_field::zero() }; };

    static constexpr base_field mul_by_non_residue(const base_field& a) { return Fq6Params::mul_by_non_residue(a); }

    constexpr field6 operator+(const field6& other) const
    {
        return {
            c0 + other.c0,
            c1 + other.c1,
            c2 + other.c2,
        };
    }

    constexpr field6 operator-(const field6& other) const
    {
        return {
            c0 - other.c0,
            c1 - other.c1,
            c2 - other.c2,
        };
    }

    constexpr field6 operator-() const
    {
        return {
            -c0,
            -c1,
            -c2,
        };
    }

    constexpr field6 operator*(const field6& other) const
    {
        // /* Devegili OhEig Scott Dahab --- Multiplication and Squaring on Pairing-Friendly Fields.pdf; Section 4
        //  * (Karatsuba) */

        base_field T0 = c0 * other.c0;
        base_field T1 = c1 * other.c1;
        base_field T2 = c2 * other.c2;

        base_field T3 = (c0 + c2) * (other.c0 + other.c2);
        base_field T4 = (c0 + c1) * (other.c0 + other.c1);
        base_field T5 = (c1 + c2) * (other.c1 + other.c2);

        return {
            T0 + mul_by_non_residue(T5 - (T1 + T2)),
            T4 - (T0 + T1) + mul_by_non_residue(T2),
            T3 + T1 - (T0 + T2),
        };
    }

    constexpr field6 operator/(const field6& other) const { return operator*(other.invert()); }

    constexpr field6 sqr() const
    {
        /* Devegili OhEig Scott Dahab --- Multiplication and Squaring on Pairing-Friendly Fields.pdf; Section 4
         * (CH-SQR2) */
        base_field S0 = c0.sqr();
        base_field S1 = c0 * c1;
        S1 += S1;
        base_field S2 = (c0 + c2 - c1).sqr();
        base_field S3 = c1 * c2;
        S3 += S3;
        base_field S4 = c2.sqr();
        return {
            mul_by_non_residue(S3) + S0,
            mul_by_non_residue(S4) + S1,
            S1 + S2 + S3 - S0 - S4,
        };
    }

    constexpr field6 operator+=(const field6& other)
    {
        c0 += other.c0;
        c1 += other.c1;
        c2 += other.c2;
        return *this;
    }

    constexpr field6 operator-=(const field6& other)
    {
        c0 -= other.c0;
        c1 -= other.c1;
        c2 -= other.c2;
        return *this;
    }

    constexpr field6 operator*=(const field6& other)
    {
        *this = operator*(other);
        return *this;
    }

    constexpr field6 operator/=(const field6& other)
    {
        *this = operator/(other);
        return *this;
    }

    constexpr void self_neg()
    {
        c0.self_neg();
        c1.self_neg();
        c2.self_neg();
    }

    constexpr void self_sqr() { *this = sqr(); }

    constexpr field6 invert() const
    {
        /* From "High-Speed Software Implementation of the Optimal Ate Pairing over Barreto-Naehrig Curves"; Algorithm
         * 17 */
        base_field C0 = c0.sqr() - mul_by_non_residue(c1 * c2);
        base_field C1 = mul_by_non_residue(c2.sqr()) - (c0 * c1);
        base_field C2 = c1.sqr() - (c0 * c2);
        base_field T0 = ((c0 * C0) + mul_by_non_residue((c2 * C1) + (c1 * C2))).invert();

        return {
            T0 * C0,
            T0 * C1,
            T0 * C2,
        };
    }

    constexpr field6 mul_by_fq2(const base_field& other) const { return { other * c0, other * c1, other * c2 }; }

    constexpr field6 frobenius_map_three() const
    {
        return {
            c0.frobenius_map(),
            Fq6Params::frobenius_coeffs_c1_3 * c1.frobenius_map(),
            Fq6Params::frobenius_coeffs_c2_3 * c2.frobenius_map(),
        };
    }

    constexpr field6 frobenius_map_two() const
    {
        return { c0, Fq6Params::frobenius_coeffs_c1_2 * c1, Fq6Params::frobenius_coeffs_c2_2 * c2 };
    }

    constexpr field6 frobenius_map_one() const
    {
        return {
            c0.frobenius_map(),
            Fq6Params::frobenius_coeffs_c1_1 * c1.frobenius_map(),
            Fq6Params::frobenius_coeffs_c2_1 * c2.frobenius_map(),
        };
    }

    static constexpr field6 random_element(numeric::RNG* engine = nullptr)
    {
        return {
            base_field::random_element(engine),
            base_field::random_element(engine),
            base_field::random_element(engine),
        };
    }

    // Montgomery form conversions produce outputs where the components are in strict/reduced form.
    constexpr field6 to_montgomery_form() const
    {
        return {
            c0.to_montgomery_form(),
            c1.to_montgomery_form(),
            c2.to_montgomery_form(),
        };
    }

    constexpr field6 from_montgomery_form() const
    {
        return {
            c0.from_montgomery_form(),
            c1.from_montgomery_form(),
            c2.from_montgomery_form(),
        };
    }

    [[nodiscard]] constexpr bool is_zero() const { return c0.is_zero() && c1.is_zero() && c2.is_zero(); }

    constexpr bool operator==(const field6& other) const { return c0 == other.c0 && c1 == other.c1 && c2 == other.c2; }

    /**
     * @brief Multiply a field6 element by a0 + a1 * v.
     *
     * @details Algorithm 6 from https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf
     *
     * Tower structure: Fq6 = Fq2[v]/(v³ - ξ), so an Fq6 element is (c0 + c1·v + c2·v²) with c0, c1, c2 in Fq2.
     * The sparse element is (a0 + a1·v), i.e. the v² coefficient is zero.
     *
     * Generic multiplication (c0 + c1·v + c2·v²)(a0 + a1·v) gives:
     *   coeff of 1:  a0·c0 + ξ·a1·c2       (the a1·c2·v³ = a1·c2·ξ wraps around)
     *   coeff of v:  a0·c1 + a1·c0          (cross term)
     *   coeff of v²: a0·c2 + a1·c1
     *
     * The code computes:
     *   A = a0·c0
     *   B = a1·c1
     *   C = ξ·(a1·c2)              (via mul_by_non_residue)
     *   D = A + C                   (= coeff of 1)
     *   E = (a0+a1)·(c0+c1)        (Karatsuba expansion)
     *   F = E - A - B = a0·c1 + a1·c0   (= coeff of v)
     *   G = a0·c2
     *   H = G + B = a0·c2 + a1·c1  (= coeff of v²)
     *
     * @param a0
     * @param a1
     * @return constexpr field6
     */
    constexpr field6 sparse_mul(const base_field& a0, const base_field& a1) const
    {
        base_field A = a0 * c0;
        base_field B = a1 * c1;
        base_field C = Fq6Params::mul_by_non_residue(a1 * c2);
        base_field D = A + C;
        base_field E = (a0 + a1) * (c0 + c1);
        base_field F = E - (A + B);
        base_field G = a0 * c2;
        base_field H = G + B;

        return field6{ D, F, H };
    }
};
} // namespace bb
