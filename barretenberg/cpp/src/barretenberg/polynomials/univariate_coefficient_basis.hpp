// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include <span>

namespace bb {

/**
 * @brief A view of a univariate, also used to truncate univariates.
 *
 * @details For optimization purposes, it makes sense to define univariates with large lengths and then reuse only some
 * of the data in those univariates. We do that by taking a view of those elements and then, as needed, using this to
 * populate new containers.
 */

/**
 * @brief A univariate polynomial represented by its values on {domain_start, domain_start + 1,..., domain_end - 1}. For
 * memory efficiency purposes, we store the coefficients in an array starting from 0 and make the mapping to the right
 * domain under the hood.
 *
 * @details We represent a UnivariateCoefficientBasis as a polynomial P(X) = a0 + a1.X + a2.X^2
 * @tparam has_a0_plus_a1: This is true if we know the sum of the above coefficients `a0 + a1`
 *         This is an optimisation to improve the performance of Karatsuba polynomial multiplication, which requires
 * this term. When converting from a degree-1 Monomial in the Lagrange basis, into a UnivariateCoefficientBasis, we can
 * get `a0
 * + a1` for free. i.e. for a Lagrange-basis poly, we have P(X) = v0.L0(X) + v1.L1(X) = v0.(1 - X) + v1.X = v0 + (v1 -
 * v0).X From this we can see that a0 = v0, a1 = v1 - v0 and therefore (a0 + a1) = v1
 * @note `has_a0_plus_a1` should only be true in the case where `LENGTH == 2` as this is the only case where we can
 *        acquire this term for free
 * @note After performing any arithmetic operation on UnivaraiteMonomial, the output will have `has_a0_plus_a1 = false`
 */
template <class Fr, size_t domain_end, bool has_a0_plus_a1> class UnivariateCoefficientBasis {
  public:
    static constexpr size_t LENGTH = domain_end;
    static_assert(LENGTH == 2 || LENGTH == 3);
    using value_type = Fr; // used to get the type of the elements consistently with std::array

    /**
     * @brief coefficients is a length-3 array with the following representation:
     * @details This class represents a polynomial P(X) = a0 + a1.X + a2.X^2
     *          We define `coefficients[0] = a0` and `coefficients[1] = a1`
     *          If LENGTH == 2 AND `has_a0_plus_a1 = true` then `coefficients[2] = a0 + a1`
     *          If LENGTH == 3 then `coefficients[3] = a2`
     */
    std::array<Fr, 3> coefficients;

    UnivariateCoefficientBasis() = default;

    UnivariateCoefficientBasis(const UnivariateCoefficientBasis<Fr, domain_end, true>& other)
        requires(!has_a0_plus_a1)
    {
        coefficients[0] = other.coefficients[0];
        coefficients[1] = other.coefficients[1];
        if constexpr (domain_end == 3) {
            coefficients[2] = other.coefficients[2];
        }
    }

    ~UnivariateCoefficientBasis() = default;
    UnivariateCoefficientBasis(const UnivariateCoefficientBasis& other) = default;
    UnivariateCoefficientBasis(UnivariateCoefficientBasis&& other) noexcept = default;
    UnivariateCoefficientBasis& operator=(const UnivariateCoefficientBasis& other) = default;
    UnivariateCoefficientBasis& operator=(UnivariateCoefficientBasis&& other) noexcept = default;

    template <size_t other_domain_end, bool other_has_a0_plus_a1 = true>
    UnivariateCoefficientBasis(const UnivariateCoefficientBasis<Fr, other_domain_end, other_has_a0_plus_a1>& other)
        requires(domain_end > other_domain_end)
    {
        coefficients[0] = other.coefficients[0];
        coefficients[1] = other.coefficients[1];
        if constexpr (domain_end == 3) {
            coefficients[2] = 0;
        }
    };

    size_t size() { return coefficients.size(); };

    // Check if the UnivariateCoefficientBasis is identically zero
    bool is_zero() const
        requires(LENGTH == 2)
    {
        return coefficients[0].is_zero() || coefficients[1].is_zero();
    }

    // Check if the UnivariateCoefficientBasis is identically zero
    bool is_zero() const
        requires(LENGTH == 3)
    {
        return coefficients[2].is_zero() || coefficients[0].is_zero() || coefficients[1].is_zero();
    }

    // Write the Univariate coefficients to a buffer
    [[nodiscard]] std::vector<uint8_t> to_buffer() const { return ::to_buffer(coefficients); }

    // Static method for creating a Univariate from a buffer
    // IMPROVEMENT: Could be made to identically match equivalent methods in e.g. field.hpp. Currently bypasses
    // unnecessary ::from_buffer call
    static UnivariateCoefficientBasis serialize_from_buffer(uint8_t const* buffer)
    {
        UnivariateCoefficientBasis result;
        std::read(buffer, result.coefficients);
        return result;
    }

    static UnivariateCoefficientBasis get_random()
    {
        auto output = UnivariateCoefficientBasis<Fr, domain_end, has_a0_plus_a1>();
        for (size_t i = 0; i < LENGTH; ++i) {
            output.value_at(i) = Fr::random_element();
        }
        return output;
    };

    static UnivariateCoefficientBasis zero()
    {
        auto output = UnivariateCoefficientBasis<Fr, domain_end, has_a0_plus_a1>();
        for (size_t i = 0; i != LENGTH; ++i) {
            output.coefficients[i] = Fr::zero();
        }
        return output;
    }

    static UnivariateCoefficientBasis random_element() { return get_random(); };

    // Operations between UnivariateCoefficientBasis and other UnivariateCoefficientBasis
    bool operator==(const UnivariateCoefficientBasis& other) const = default;

    template <size_t other_domain_end, bool other_has_a0_plus_a1>
    UnivariateCoefficientBasis<Fr, domain_end, false>& operator+=(
        const UnivariateCoefficientBasis<Fr, other_domain_end, other_has_a0_plus_a1>& other)
    {
        // if both operands are degree-1, then we do not update coefficients[2], which represents `a1 + a0`
        // the output object therefore must have `other_has_a0_plus_a1` set to false.
        // i.e. the input also requires `other_has_a0_plus_a1`, otherwise use `operator+
        coefficients[0] += other.coefficients[0];
        coefficients[1] += other.coefficients[1];
        if constexpr (other_domain_end == 3 && domain_end == 3) {
            coefficients[2] += other.coefficients[2];
        }
        return *this;
    }

    template <size_t other_domain_end, bool other_has_a0_plus_a1>
    UnivariateCoefficientBasis<Fr, domain_end, false>& operator-=(
        const UnivariateCoefficientBasis<Fr, other_domain_end, other_has_a0_plus_a1>& other)
    {
        // if both operands are degree-1, then we do not update coefficients[2], which represents `a1 + a0`
        // the output object therefore must have `other_has_a0_plus_a1` set to false.
        // i.e. the input also requires `other_has_a0_plus_a1`, otherwise use `operator+
        coefficients[0] -= other.coefficients[0];
        coefficients[1] -= other.coefficients[1];
        if constexpr (other_domain_end == 3 && domain_end == 3) {
            coefficients[2] -= other.coefficients[2];
        }
        return *this;
    }

    template <bool other_has_a0_plus_a1>
    UnivariateCoefficientBasis<Fr, 3, false> operator*(
        const UnivariateCoefficientBasis<Fr, domain_end, other_has_a0_plus_a1>& other) const
        requires(LENGTH == 2)
    {
        UnivariateCoefficientBasis<Fr, 3, false> result;
        // result.coefficients[0] = a0 * a0;
        // result.coefficients[1] = a1 * a1
        result.coefficients[0] = coefficients[0] * other.coefficients[0];
        result.coefficients[2] = coefficients[1] * other.coefficients[1];

        // the reason we've been tracking this variable all this time.
        // coefficients[1] = sum of X^2 and X coefficients
        // (a0 + a1X) * (b0 + b1X) = a0b0 + (a0b1 + a1b0)X + a1b1XX
        // coefficients[1] = a0b1 + a1b0 + a1b1
        // which represented as (a0 + a1) * (b0 + b1) - a0b0
        // if we have a1_plus_a0
        if constexpr (has_a0_plus_a1 && other_has_a0_plus_a1) {
            result.coefficients[1] = (coefficients[2] * other.coefficients[2] - result.coefficients[0]);
        } else if constexpr (has_a0_plus_a1 && !other_has_a0_plus_a1) {
            result.coefficients[1] =
                coefficients[2] * (other.coefficients[0] + other.coefficients[1]) - result.coefficients[0];
        } else if constexpr (!has_a0_plus_a1 && other_has_a0_plus_a1) {
            result.coefficients[1] =
                (coefficients[0] + coefficients[1]) * other.coefficients[2] - result.coefficients[0];
        } else {
            result.coefficients[1] =
                (coefficients[0] + coefficients[1]) * (other.coefficients[0] + other.coefficients[1]) -
                result.coefficients[0];
        }
        return result;
    }

    template <size_t other_domain_end, bool other_has_a0_plus_a1>
    UnivariateCoefficientBasis<Fr, domain_end, false> operator+(
        const UnivariateCoefficientBasis<Fr, other_domain_end, other_has_a0_plus_a1>& other) const
    {
        UnivariateCoefficientBasis<Fr, domain_end, false> res(*this);
        // if both operands are degree-1, then we do not update coefficients[2], which represents `a1 + a0`
        // the output object therefore must have `other_has_a0_plus_a1` set to false.
        // i.e. the input also requires `other_has_a0_plus_a1`, otherwise use `operator+
        res.coefficients[0] += other.coefficients[0];
        res.coefficients[1] += other.coefficients[1];
        if constexpr (other_domain_end == 3 && domain_end == 3) {
            res.coefficients[2] += other.coefficients[2];
        }
        return res;
    }

    template <size_t other_domain_end, bool other_has_a0_plus_a1>
    UnivariateCoefficientBasis<Fr, domain_end, false> operator-(
        const UnivariateCoefficientBasis<Fr, other_domain_end, other_has_a0_plus_a1>& other) const
    {
        UnivariateCoefficientBasis<Fr, domain_end, false> res(*this);
        // if both operands are degree-1, then we do not update coefficients[2], which represents `a1 + a0`
        // the output object therefore must have `other_has_a0_plus_a1` set to false.
        // i.e. the input also requires `other_has_a0_plus_a1`, otherwise use `operator+
        res.coefficients[0] -= other.coefficients[0];
        res.coefficients[1] -= other.coefficients[1];
        if constexpr (other_domain_end == 3 && domain_end == 3) {
            res.coefficients[2] -= other.coefficients[2];
        }
        return res;
    }

    UnivariateCoefficientBasis<Fr, domain_end, false> operator-() const
    {
        UnivariateCoefficientBasis res;
        res.coefficients[0] = -coefficients[0];
        res.coefficients[1] = -coefficients[1];
        if constexpr (domain_end == 3) {
            res.coefficients[2] = -coefficients[2];
        }

        return res;
    }

    UnivariateCoefficientBasis<Fr, 3, false> sqr() const
        requires(LENGTH == 2)
    {
        UnivariateCoefficientBasis<Fr, 3, false> result;
        result.coefficients[0] = coefficients[0].sqr();
        result.coefficients[2] = coefficients[1].sqr();

        // (a0 + a1.X)^2 = a0a0 + 2a0a1.X + a1a1.XX
        // coefficients[0] = a0a0
        // coefficients[1] = 2a0a1 + a1a1 = (a0 + a0 + a1).a1
        // coefficients[2] = a1a1
        // a0a0 a1a1 a0a1a1a0
        if constexpr (has_a0_plus_a1) {
            result.coefficients[1] = (coefficients[2] + coefficients[0]) * coefficients[1];
        } else {
            result.coefficients[1] = coefficients[0] * coefficients[1];
            result.coefficients[1] += result.coefficients[1];
            result.coefficients[1] += result.coefficients[2];
        }
        return result;
    }

    // Operations between Univariate and scalar
    UnivariateCoefficientBasis& operator+=(const Fr& scalar)
        requires(!has_a0_plus_a1)
    {
        coefficients[0] += scalar;
        return *this;
    }

    UnivariateCoefficientBasis& operator-=(const Fr& scalar)
        requires(!has_a0_plus_a1)
    {
        coefficients[0] -= scalar;
        return *this;
    }
    UnivariateCoefficientBasis<Fr, domain_end, false>& operator*=(const Fr& scalar)
        requires(!has_a0_plus_a1)
    {
        coefficients[0] *= scalar;
        coefficients[1] *= scalar;
        if constexpr (domain_end == 3) {
            coefficients[2] *= scalar;
        }
        return *this;
    }

    UnivariateCoefficientBasis<Fr, domain_end, false> operator+(const Fr& scalar) const
    {
        UnivariateCoefficientBasis<Fr, domain_end, false> res(*this);
        res += scalar;
        return res;
    }

    UnivariateCoefficientBasis<Fr, domain_end, false> operator-(const Fr& scalar) const
    {
        UnivariateCoefficientBasis<Fr, domain_end, false> res(*this);
        res -= scalar;
        return res;
    }

    UnivariateCoefficientBasis<Fr, domain_end, false> operator*(const Fr& scalar) const
    {
        UnivariateCoefficientBasis<Fr, domain_end, false> res(*this);
        res.coefficients[0] *= scalar;
        res.coefficients[1] *= scalar;
        if constexpr (domain_end == 3) {
            res.coefficients[2] *= scalar;
        }
        return res;
    }

    // Output is immediately parsable as a list of integers by Python.
    friend std::ostream& operator<<(std::ostream& os, const UnivariateCoefficientBasis& u)
    {
        os << "[";
        os << u.coefficients[0] << "," << std::endl;
        for (size_t i = 1; i < u.coefficients.size(); i++) {
            os << " " << u.coefficients[i];
            if (i + 1 < u.coefficients.size()) {
                os << "," << std::endl;
            } else {
                os << "]";
            };
        }
        return os;
    }

    // Begin iterators
    auto begin() { return coefficients.begin(); }
    auto begin() const { return coefficients.begin(); }
    // End iterators
    auto end() { return coefficients.end(); }
    auto end() const { return coefficients.end(); }
};

template <typename B, class Fr, size_t domain_end, bool has_a0_plus_a1>
inline void read(B& it, UnivariateCoefficientBasis<Fr, domain_end, has_a0_plus_a1>& univariate)
{
    using serialize::read;
    read(it, univariate.coefficients);
}

template <typename B, class Fr, size_t domain_end, bool has_a0_plus_a1>
inline void write(B& it, UnivariateCoefficientBasis<Fr, domain_end, has_a0_plus_a1> const& univariate)
{
    using serialize::write;
    write(it, univariate.coefficients);
}

} // namespace bb

namespace std {
template <typename T, size_t N, bool X>
struct tuple_size<bb::UnivariateCoefficientBasis<T, N, X>> : std::integral_constant<std::size_t, N> {};

} // namespace std
