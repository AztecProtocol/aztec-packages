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
 */
template <class Fr, size_t domain_end, bool has_a0_plus_a1> class UnivariateMonomial {
  public:
    static constexpr size_t LENGTH = domain_end;
    static_assert(LENGTH == 2 || LENGTH == 3);
    using value_type = Fr; // used to get the type of the elements consistently with std::array

    // a0 + a1.X + a2.XX
    // we need...

    // a0
    // a1 + a2
    // a2
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/714) Try out std::valarray?

    // struct Degree1Coefficients {
    //     Fr a0;
    //     Fr a1;
    //     Fr a0_plus_a1;
    // };
    // struct Degree2Coefficients {
    //     Fr a0;
    //     Fr a1_plus_a2;
    //     Fr a2;
    // };
    // union Coefficients {
    //     Degree1Coefficients d1;
    //     Degree2Coefficients d2;
    // };
    // Coefficients coefficients;
    std::array<Fr, 3> coefficients;

    UnivariateMonomial() = default;

    // explicit UnivariateMonomial(std::array<Fr, LENGTH> _coefficients)
    // {
    //     coefficients[0] = _coefficients[0];
    //     if constexpr (LENGTH > 1) {
    //         coefficients[1] = _coefficients[1] - _coefficients[0];
    //     }
    // }

    UnivariateMonomial(const UnivariateMonomial<Fr, domain_end, true>& other)
        requires(!has_a0_plus_a1)
    {
        coefficients[0] = other.coefficients[0];
        coefficients[1] = other.coefficients[1];
        if constexpr (domain_end == 3) {
            coefficients[2] = other.coefficients[2];
        }
    }

    ~UnivariateMonomial() = default;
    UnivariateMonomial(const UnivariateMonomial& other) = default;
    UnivariateMonomial(UnivariateMonomial&& other) noexcept = default;
    UnivariateMonomial& operator=(const UnivariateMonomial& other) = default;
    UnivariateMonomial& operator=(UnivariateMonomial&& other) noexcept = default;

    template <size_t other_domain_end, bool other_has_a0_plus_a1 = true>
    UnivariateMonomial(const UnivariateMonomial<Fr, other_domain_end, other_has_a0_plus_a1>& other)
        requires(domain_end > other_domain_end)
    {
        // (*this) as a0, a1+a2, a2
        // (other) has a0, a1 and maybe a0+a1
        coefficients[0] = other.coefficients[0];
        coefficients[1] = other.coefficients[1];
        if constexpr (domain_end == 3) {
            coefficients[2] = 0;
        }
        // std::copy(other.coefficients.begin(), other.coefficients.end(), coefficients.begin());
        // for (size_t i = other_domain_end; i < domain_end; ++i) {
        //     coefficients[i] = 0;
        // }
        // midpoint = other.midpoint;
    };

    // v0 = u
    // v1 = v + 12
    // 0x30644e72e131a029b85045b68181571da92cbfcf419ffeb1d9192544cc247a81
    // 0x30644e72e131a029b85045b68181571da92cbfcf419ffeb1d9192544cc247a8d
    // (1 - X)v0 + Xv1
    // a0 = v0
    // a1 = v1 - v0
    // a0 = u
    // a1 = 12
    // Construct constant Univariate from scalar which represents the value that all the points in the domain
    // evaluate to
    // explicit UnivariateMonomial(Fr value)
    //     : coefficients{}
    // {
    //     static_assert(LENGTH == 1);
    //     coefficients[0] = value;
    //     for (size_t i = 1; i < LENGTH; ++i) {
    //         coefficients[i] = 0;
    //     }
    // }
    // // Construct UnivariateMonomial from UnivariateMonomialView
    // explicit UnivariateMonomial(UnivariateView<Fr, domain_end, domain_start, skip_count> in)
    //     : coefficients{}
    // {
    //     for (size_t i = 0; i < in.coefficients.size(); ++i) {
    //         coefficients[i] = in.coefficients[i];
    //     }
    // }

    // Fr& value_at(size_t i)
    // {
    //     if constexpr (domain_start == 0) {
    //         return coefficients[i];
    //     } else {
    //         return coefficients[i - domain_start];
    //     }
    // };
    // const Fr& value_at(size_t i) const
    // {
    //     if constexpr (domain_start == 0) {
    //         return coefficients[i];
    //     } else {
    //         return coefficients[i - domain_start];
    //     }
    // };
    size_t size() { return coefficients.size(); };

    // Check if the univariate is identically zero
    // bool is_zero() const
    // {
    //     if (!coefficients[0].is_zero()) {
    //         return false;
    //     }
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         if (!coefficients[i].is_zero()) {
    //             return false;
    //         }
    //     }
    //     return true;
    // }

    // Write the Univariate coefficients to a buffer
    [[nodiscard]] std::vector<uint8_t> to_buffer() const { return ::to_buffer(coefficients); }

    // Static method for creating a Univariate from a buffer
    // IMPROVEMENT: Could be made to identically match equivalent methods in e.g. field.hpp. Currently bypasses
    // unnecessary ::from_buffer call
    static UnivariateMonomial serialize_from_buffer(uint8_t const* buffer)
    {
        UnivariateMonomial result;
        std::read(buffer, result.coefficients);
        return result;
    }

    static UnivariateMonomial get_random()
    {
        auto output = UnivariateMonomial<Fr, domain_end, has_a0_plus_a1>();
        for (size_t i = 0; i < LENGTH; ++i) {
            output.value_at(i) = Fr::random_element();
        }
        return output;
    };

    static UnivariateMonomial zero()
    {
        auto output = UnivariateMonomial<Fr, domain_end, has_a0_plus_a1>();
        for (size_t i = 0; i != LENGTH; ++i) {
            output.coefficients[i] = Fr::zero();
        }
        return output;
    }

    static UnivariateMonomial random_element() { return get_random(); };

    // Operations between UnivariateMonomial and other UnivariateMonomial
    bool operator==(const UnivariateMonomial& other) const = default;

    template <size_t other_domain_end, bool other_has_a0_plus_a1>
    UnivariateMonomial<Fr, domain_end, false>& operator+=(
        const UnivariateMonomial<Fr, other_domain_end, other_has_a0_plus_a1>& other)
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
    UnivariateMonomial<Fr, domain_end, false>& operator-=(
        const UnivariateMonomial<Fr, other_domain_end, other_has_a0_plus_a1>& other)
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
    UnivariateMonomial<Fr, 3, false> operator*(
        const UnivariateMonomial<Fr, domain_end, other_has_a0_plus_a1>& other) const
        requires(LENGTH == 2)
    {
        UnivariateMonomial<Fr, 3, false> result;
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

    // UnivariateMonomial& self_sqr()
    // {
    //     coefficients[0].self_sqr();
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         coefficients[i].self_sqr();
    //     }
    //     return *this;
    // }
    template <size_t other_domain_end, bool other_has_a0_plus_a1>
    UnivariateMonomial<Fr, domain_end, false> operator+(
        const UnivariateMonomial<Fr, other_domain_end, other_has_a0_plus_a1>& other) const
    {
        UnivariateMonomial<Fr, domain_end, false> res(*this);
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
    UnivariateMonomial<Fr, domain_end, false> operator-(
        const UnivariateMonomial<Fr, other_domain_end, other_has_a0_plus_a1>& other) const
    {
        UnivariateMonomial<Fr, domain_end, false> res(*this);
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

    UnivariateMonomial<Fr, domain_end, false> operator-() const
    {
        UnivariateMonomial res;
        res.coefficients[0] = -coefficients[0];
        res.coefficients[1] = -coefficients[1];
        return res;
    }

    UnivariateMonomial<Fr, 3, false> sqr() const
        requires(LENGTH == 2)
    {
        UnivariateMonomial<Fr, 3, false> result;
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
    UnivariateMonomial& operator+=(const Fr& scalar)
    {
        coefficients[0] += scalar;
        return *this;
    }

    UnivariateMonomial& operator-=(const Fr& scalar)
    {
        coefficients[0] -= scalar;
        return *this;
    }
    UnivariateMonomial<Fr, domain_end, false>& operator*=(const Fr& scalar)
    {
        coefficients[0] *= scalar;
        coefficients[1] *= scalar;
        if constexpr (domain_end == 3) {
            coefficients[2] *= scalar;
        }
        return *this;
    }

    UnivariateMonomial operator+(const Fr& scalar) const
    {
        UnivariateMonomial res(*this);
        res += scalar;
        return res;
    }

    UnivariateMonomial operator-(const Fr& scalar) const
    {
        UnivariateMonomial res(*this);
        res -= scalar;
        return res;
    }

    UnivariateMonomial<Fr, domain_end, false> operator*(const Fr& scalar) const
    {
        UnivariateMonomial res(*this);
        res.coefficients[0] *= scalar;
        res.coefficients[1] *= scalar;
        if constexpr (domain_end == 3) {
            res.coefficients[2] *= scalar;
        }
        return res;
    }

    // // Operations between Univariate and UnivariateView
    // Univariate& operator+=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
    // {
    //     coefficients[0] += view.coefficients[0];
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         coefficients[i] += view.coefficients[i];
    //     }
    //     return *this;
    // }

    // Univariate& operator-=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
    // {
    //     coefficients[0] -= view.coefficients[0];
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         coefficients[i] -= view.coefficients[i];
    //     }
    //     return *this;
    // }

    // Univariate& operator*=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
    // {
    //     coefficients[0] *= view.coefficients[0];
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         coefficients[i] *= view.coefficients[i];
    //     }
    //     return *this;
    // }

    // Univariate operator+(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const
    // {
    //     Univariate res(*this);
    //     res += view;
    //     return res;
    // }

    // Univariate operator-(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const
    // {
    //     Univariate res(*this);
    //     res -= view;
    //     return res;
    // }

    // Univariate operator*(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view) const
    // {
    //     Univariate res(*this);
    //     res *= view;
    //     return res;
    // }

    // Output is immediately parsable as a list of integers by Python.
    friend std::ostream& operator<<(std::ostream& os, const UnivariateMonomial& u)
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

    /**
     * @brief Given a univariate f represented by {f(domain_start), ..., f(domain_end - 1)}, compute the
     * coefficients {f(domain_end),..., f(extended_domain_end -1)} and return the Univariate represented by
     * {f(domain_start),..., f(extended_domain_end -1)}
     *
     * @details Write v_i = f(x_i) on a the domain {x_{domain_start}, ..., x_{domain_end-1}}. To efficiently
     * compute the needed values of f, we use the barycentric formula
     *      - f(x) = B(x) Σ_{i=domain_start}^{domain_end-1} v_i / (d_i*(x-x_i))
     * where
     *      - B(x) = Π_{i=domain_start}^{domain_end-1} (x-x_i)
     *      - d_i  = Π_{j ∈ {domain_start, ..., domain_end-1}, j≠i} (x_i-x_j) for i ∈ {domain_start, ...,
     * domain_end-1}
     *
     * When the domain size is two, extending f = v0(1-X) + v1X to a new value involves just one addition
     * and a subtraction: setting Δ = v1-v0, the values of f(X) are f(0)=v0, f(1)= v0 + Δ, v2 = f(1) + Δ, v3
     * = f(2) + Δ...
     *
     */
    // template <size_t EXTENDED_DOMAIN_END, size_t NUM_SKIPPED_INDICES = 0>
    // Univariate<Fr, EXTENDED_DOMAIN_END, 0, NUM_SKIPPED_INDICES> extend_to() const
    // {
    //     static constexpr size_t EXTENDED_LENGTH = EXTENDED_DOMAIN_END - domain_start;
    //     using Data = BarycentricData<Fr, LENGTH, EXTENDED_LENGTH>;
    //     static_assert(EXTENDED_LENGTH >= LENGTH);

    //     Univariate<Fr, EXTENDED_LENGTH, 0, NUM_SKIPPED_INDICES> result;

    //     std::copy(coefficients.begin(), coefficients.end(), result.coefficients.begin());

    //     static constexpr Fr inverse_two = Fr(2).invert();
    //     static_assert(NUM_SKIPPED_INDICES < LENGTH);
    //     if constexpr (LENGTH == 2) {
    //         Fr delta = value_at(1) - value_at(0);
    //         static_assert(EXTENDED_LENGTH != 0);
    //         for (size_t idx = domain_end - 1; idx < EXTENDED_DOMAIN_END - 1; idx++) {
    //             result.value_at(idx + 1) = result.value_at(idx) + delta;
    //         }
    //     } else if constexpr (LENGTH == 3) {
    //         // Based off https://hackmd.io/@aztec-network/SyR45cmOq?type=view
    //         // The technique used here is the same as the length == 3 case below.
    //         Fr a = (value_at(2) + value_at(0)) * inverse_two - value_at(1);
    //         Fr b = value_at(1) - a - value_at(0);
    //         Fr a2 = a + a;
    //         Fr a_mul = a2;
    //         for (size_t i = 0; i < domain_end - 2; i++) {
    //             a_mul += a2;
    //         }
    //         Fr extra = a_mul + a + b;
    //         for (size_t idx = domain_end - 1; idx < EXTENDED_DOMAIN_END - 1; idx++) {
    //             result.value_at(idx + 1) = result.value_at(idx) + extra;
    //             extra += a2;
    //         }
    //     } else if constexpr (LENGTH == 4) {
    //         static constexpr Fr inverse_six = Fr(6).invert(); // computed at compile time for efficiency

    //         // To compute a barycentric extension, we can compute the coefficients of the univariate.
    //         // We have the evaluation of the polynomial at the domain (which is assumed to be 0, 1, 2, 3).
    //         // Therefore, we have the 4 linear equations from plugging into f(x) = ax^3 + bx^2 + cx + d:
    //         //          a*0 + b*0 + c*0 + d = f(0)
    //         //          a*1 + b*1 + c*1 + d = f(1)
    //         //          a*2^3 + b*2^2 + c*2 + d = f(2)
    //         //          a*3^3 + b*3^2 + c*3 + d = f(3)
    //         // These equations can be rewritten as a matrix equation M * [a, b, c, d] = [f(0), f(1), f(2),
    //         // f(3)], where M is:
    //         //          0,  0,  0,  1
    //         //          1,  1,  1,  1
    //         //          2^3, 2^2, 2,  1
    //         //          3^3, 3^2, 3,  1
    //         // We can invert this matrix in order to compute a, b, c, d:
    //         //      -1/6,	1/2,	-1/2,	1/6
    //         //      1,	    -5/2,	2,	    -1/2
    //         //      -11/6,	3,	    -3/2,	1/3
    //         //      1,	    0,	    0,	    0
    //         // To compute these values, we can multiply everything by 6 and multiply by inverse_six at the
    //         // end for each coefficient The resulting computation here does 18 field adds, 6 subtracts, 3
    //         // muls to compute a, b, c, and d.
    //         Fr zero_times_3 = value_at(0) + value_at(0) + value_at(0);
    //         Fr zero_times_6 = zero_times_3 + zero_times_3;
    //         Fr zero_times_12 = zero_times_6 + zero_times_6;
    //         Fr one_times_3 = value_at(1) + value_at(1) + value_at(1);
    //         Fr one_times_6 = one_times_3 + one_times_3;
    //         Fr two_times_3 = value_at(2) + value_at(2) + value_at(2);
    //         Fr three_times_2 = value_at(3) + value_at(3);
    //         Fr three_times_3 = three_times_2 + value_at(3);

    //         Fr one_minus_two_times_3 = one_times_3 - two_times_3;
    //         Fr one_minus_two_times_6 = one_minus_two_times_3 + one_minus_two_times_3;
    //         Fr one_minus_two_times_12 = one_minus_two_times_6 + one_minus_two_times_6;
    //         Fr a = (one_minus_two_times_3 + value_at(3) - value_at(0)) * inverse_six; // compute a in 1 muls and 4
    //         adds Fr b = (zero_times_6 - one_minus_two_times_12 - one_times_3 - three_times_3) * inverse_six; Fr c =
    //         (value_at(0) - zero_times_12 + one_minus_two_times_12 + one_times_6 + two_times_3 + three_times_2) *
    //                inverse_six;

    //         // Then, outside of the a, b, c, d computation, we need to do some extra precomputation
    //         // This work is 3 field muls, 8 adds
    //         Fr a_plus_b = a + b;
    //         Fr a_plus_b_times_2 = a_plus_b + a_plus_b;
    //         size_t start_idx_sqr = (domain_end - 1) * (domain_end - 1);
    //         size_t idx_sqr_three = start_idx_sqr + start_idx_sqr + start_idx_sqr;
    //         Fr idx_sqr_three_times_a = Fr(idx_sqr_three) * a;
    //         Fr x_a_term = Fr(6 * (domain_end - 1)) * a;
    //         Fr three_a = a + a + a;
    //         Fr six_a = three_a + three_a;

    //         Fr three_a_plus_two_b = a_plus_b_times_2 + a;
    //         Fr linear_term = Fr(domain_end - 1) * three_a_plus_two_b + (a_plus_b + c);
    //         // For each new evaluation, we do only 6 field additions and 0 muls.
    //         for (size_t idx = domain_end - 1; idx < EXTENDED_DOMAIN_END - 1; idx++) {
    //             result.value_at(idx + 1) = result.value_at(idx) + idx_sqr_three_times_a + linear_term;

    //             idx_sqr_three_times_a += x_a_term + three_a;
    //             x_a_term += six_a;

    //             linear_term += three_a_plus_two_b;
    //         }
    //     } else {
    //         for (size_t k = domain_end; k != EXTENDED_DOMAIN_END; ++k) {
    //             result.value_at(k) = 0;
    //             // compute each term v_j / (d_j*(x-x_j)) of the sum
    //             for (size_t j = domain_start; j != domain_end; ++j) {
    //                 Fr term = value_at(j);
    //                 term *= Data::precomputed_denominator_inverses[LENGTH * k + j];
    //                 result.value_at(k) += term;
    //             }
    //             // scale the sum by the value of of B(x)
    //             result.value_at(k) *= Data::full_numerator_values[k];
    //         }
    //     }
    //     return result;
    // }

    // template <size_t INITIAL_LENGTH> void self_extend_from()
    // {
    //     if constexpr (INITIAL_LENGTH == 2) {
    //         const Fr delta = value_at(1) - value_at(0);
    //         Fr next = value_at(1);
    //         for (size_t idx = 2; idx < LENGTH; idx++) {
    //             next += delta;
    //             value_at(idx) = next;
    //         }
    //     }
    // }

    /**
     * @brief Evaluate a univariate at a point u not known at compile time
     * and assumed not to be in the domain (else we divide by zero).
     * @param f
     * @return Fr
     */
    // Fr evaluate(const Fr& u) const
    // {
    //     using Data = BarycentricData<Fr, domain_end, LENGTH, domain_start>;
    //     Fr full_numerator_value = 1;
    //     for (size_t i = domain_start; i != domain_end; ++i) {
    //         full_numerator_value *= u - i;
    //     }

    //     // build set of domain size-many denominator inverses 1/(d_i*(x_k - x_j)). will multiply against
    //     // each of these (rather than to divide by something) for each barycentric evaluation
    //     std::array<Fr, LENGTH> denominator_inverses;
    //     for (size_t i = 0; i != LENGTH; ++i) {
    //         Fr inv = Data::lagrange_denominators[i];
    //         inv *= u - Data::big_domain[i]; // warning: need to avoid zero here
    //         inv = Fr(1) / inv;
    //         denominator_inverses[i] = inv;
    //     }

    //     Fr result = 0;
    //     // compute each term v_j / (d_j*(x-x_j)) of the sum
    //     for (size_t i = domain_start; i != domain_end; ++i) {
    //         Fr term = value_at(i);
    //         term *= denominator_inverses[i - domain_start];
    //         result += term;
    //     }
    //     // scale the sum by the value of of B(x)
    //     result *= full_numerator_value;
    //     return result;
    // };

    // Begin iterators
    auto begin() { return coefficients.begin(); }
    auto begin() const { return coefficients.begin(); }
    // End iterators
    auto end() { return coefficients.end(); }
    auto end() const { return coefficients.end(); }
};

template <typename B, class Fr, size_t domain_end, bool has_a0_plus_a1>
inline void read(B& it, UnivariateMonomial<Fr, domain_end, has_a0_plus_a1>& univariate)
{
    using serialize::read;
    read(it, univariate.coefficients);
}

template <typename B, class Fr, size_t domain_end, bool has_a0_plus_a1>
inline void write(B& it, UnivariateMonomial<Fr, domain_end, has_a0_plus_a1> const& univariate)
{
    using serialize::write;
    write(it, univariate.coefficients);
}

// template <class Fr, size_t domain_end, bool has_a0_plus_a1>
// UnivariateMonomial<Fr, domain_end, has_a0_plus_a1> operator+(
//     const Fr& ff, const UnivariateMonomial<Fr, domain_end, has_a0_plus_a1>& uv)
// {
//     return uv + ff;
// }

// template <class Fr, size_t domain_end, bool has_a0_plus_a1>
// UnivariateMonomial<Fr, domain_end, has_a0_plus_a1> operator-(
//     const Fr& ff, const UnivariateMonomial<Fr, domain_end, has_a0_plus_a1>& uv)
// {
//     return -uv + ff;
// }

// template <class Fr, size_t domain_end, bool has_a0_plus_a1>
// UnivariateMonomial<Fr, domain_end, has_a0_plus_a1> operator*(
//     const Fr& ff, const UnivariateMonomial<Fr, domain_end, has_a0_plus_a1>& uv)
// {
//     return uv * ff;
// }

} // namespace bb

namespace std {
template <typename T, size_t N, bool X>
struct tuple_size<bb::UnivariateMonomial<T, N, X>> : std::integral_constant<std::size_t, N> {};

} // namespace std
