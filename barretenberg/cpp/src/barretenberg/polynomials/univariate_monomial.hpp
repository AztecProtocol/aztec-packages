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
template <class Fr, size_t view_domain_end, size_t view_domain_start, size_t skip_count> class UnivariateView;

/**
 * @brief A univariate polynomial represented by its values on {domain_start, domain_start + 1,..., domain_end - 1}. For
 * memory efficiency purposes, we store the evaluations in an array starting from 0 and make the mapping to the right
 * domain under the hood.
 *
 * @tparam skip_count Skip computing the values of elements [domain_start+1,..,domain_start+skip_count]. Used for
 * optimising computation in protogalaxy. The value at [domain_start] is the value from the accumulator, while the
 * values in [domain_start+1, ... domain_start + skip_count] in the accumulator should be zero if the original if the
 * skip_count-many keys to be folded are all valid
 */
template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0> class UnivariateMonomial {
  public:
    static constexpr size_t LENGTH = domain_end - domain_start;
    static_assert(LENGTH <= 3);
    static constexpr size_t SKIP_COUNT = skip_count;

    using value_type = Fr; // used to get the type of the elements consistently with std::array

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/714) Try out std::valarray?
    std::array<Fr, LENGTH> evaluations;
    Fr midpoint;
    UnivariateMonomial() = default;

    explicit UnivariateMonomial(std::array<Fr, LENGTH> _evaluations)
    {
        evaluations[0] = _evaluations[0];
        if constexpr (LENGTH > 1) {
            evaluations[1] = _evaluations[1] - _evaluations[0];
        }
    }

    ~UnivariateMonomial() = default;
    UnivariateMonomial(const UnivariateMonomial& other) = default;
    UnivariateMonomial(UnivariateMonomial&& other) noexcept = default;
    UnivariateMonomial& operator=(const UnivariateMonomial& other) = default;
    UnivariateMonomial& operator=(UnivariateMonomial&& other) noexcept = default;

    template <size_t other_domain_end>
    UnivariateMonomial(const UnivariateMonomial<Fr, other_domain_end, domain_start>& other)
        requires(domain_end > other_domain_end)
    {
        std::copy(other.evaluations.begin(), other.evaluations.end(), evaluations.begin());
        for (size_t i = other_domain_end; i < domain_end; ++i) {
            evaluations[i] = 0;
        }
        midpoint = other.midpoint;
    };

    /**
     * @brief Convert from a version with skipped evaluations to one without skipping (with zeroes in previously skipped
     * locations)
     *
     * @return Univariate<Fr, domain_end, domain_start>
     */
    UnivariateMonomial<Fr, domain_end, domain_start> convert() const noexcept
    {
        UnivariateMonomial<Fr, domain_end, domain_start, 0> result;
        result.evaluations[0] = evaluations[0];
        for (size_t i = 1; i < skip_count + 1; i++) {
            result.evaluations[i] = Fr::zero();
        }
        for (size_t i = skip_count + 1; i < LENGTH; i++) {
            result.evaluations[i] = evaluations[i];
        }
        return result;
    }
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
    explicit UnivariateMonomial(Fr value)
        : evaluations{}
    {
        static_assert(LENGTH == 1);
        evaluations[0] = value;
        for (size_t i = 1; i < LENGTH; ++i) {
            evaluations[i] = 0;
        }
    }
    // // Construct UnivariateMonomial from UnivariateMonomialView
    // explicit UnivariateMonomial(UnivariateView<Fr, domain_end, domain_start, skip_count> in)
    //     : evaluations{}
    // {
    //     for (size_t i = 0; i < in.evaluations.size(); ++i) {
    //         evaluations[i] = in.evaluations[i];
    //     }
    // }

    Fr& value_at(size_t i)
    {
        if constexpr (domain_start == 0) {
            return evaluations[i];
        } else {
            return evaluations[i - domain_start];
        }
    };
    const Fr& value_at(size_t i) const
    {
        if constexpr (domain_start == 0) {
            return evaluations[i];
        } else {
            return evaluations[i - domain_start];
        }
    };
    size_t size() { return evaluations.size(); };

    // Check if the univariate is identically zero
    bool is_zero() const
    {
        if (!evaluations[0].is_zero()) {
            return false;
        }
        for (size_t i = skip_count + 1; i < LENGTH; ++i) {
            if (!evaluations[i].is_zero()) {
                return false;
            }
        }
        return true;
    }

    // Write the Univariate evaluations to a buffer
    [[nodiscard]] std::vector<uint8_t> to_buffer() const { return ::to_buffer(evaluations); }

    // Static method for creating a Univariate from a buffer
    // IMPROVEMENT: Could be made to identically match equivalent methods in e.g. field.hpp. Currently bypasses
    // unnecessary ::from_buffer call
    static UnivariateMonomial serialize_from_buffer(uint8_t const* buffer)
    {
        UnivariateMonomial result;
        std::read(buffer, result.evaluations);
        return result;
    }

    static UnivariateMonomial get_random()
    {
        auto output = UnivariateMonomial<Fr, domain_end, domain_start, skip_count>();
        for (size_t i = 0; i != LENGTH; ++i) {
            output.value_at(i) = Fr::random_element();
        }
        return output;
    };

    static UnivariateMonomial zero()
    {
        auto output = UnivariateMonomial<Fr, domain_end, domain_start, skip_count>();
        for (size_t i = 0; i != LENGTH; ++i) {
            output.value_at(i) = Fr::zero();
        }
        return output;
    }

    static UnivariateMonomial random_element() { return get_random(); };

    // Operations between UnivariateMonomial and other UnivariateMonomial
    bool operator==(const UnivariateMonomial& other) const = default;

    template <size_t other_domain_end>
    UnivariateMonomial& operator+=(const UnivariateMonomial<Fr, other_domain_end, domain_start, skip_count>& other)
        requires(other_domain_end < domain_end)
    {
        for (size_t i = 0; i < other_domain_end; ++i) {
            evaluations[i] += other.evaluations[i];
        }
        midpoint += other.midpoint;
        return *this;
    }
    UnivariateMonomial& operator+=(const UnivariateMonomial& other)
    {
        static_assert(skip_count == 0);
        evaluations[0] += other.evaluations[0];
        for (size_t i = 1; i < LENGTH; ++i) {
            evaluations[i] += other.evaluations[i];
        }
        // TODO remove with dirty/clean flag
        midpoint += other.midpoint;
        return *this;
    }
    UnivariateMonomial& operator-=(const UnivariateMonomial& other)
    {
        evaluations[0] -= other.evaluations[0];
        for (size_t i = 1; i < LENGTH; ++i) {

            evaluations[i] -= other.evaluations[i];
        }
        midpoint -= other.midpoint;
        return *this;
    }

    UnivariateMonomial<Fr, domain_end + 1, domain_start, skip_count> operator*(const UnivariateMonomial& other) const
        requires(LENGTH == 2)
    {
        UnivariateMonomial<Fr, domain_end + 1, domain_start, skip_count> result;
        result.evaluations[0] = evaluations[0] * other.evaluations[0];
        result.evaluations[2] = evaluations[1] * other.evaluations[1];
        result.evaluations[1] = (midpoint) * (other.midpoint) - (result.evaluations[0] + result.evaluations[2]);
        return result;
    }

    // UnivariateMonomial& self_sqr()
    // {
    //     evaluations[0].self_sqr();
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         evaluations[i].self_sqr();
    //     }
    //     return *this;
    // }
    UnivariateMonomial operator+(const UnivariateMonomial& other) const
    {
        UnivariateMonomial res(*this);
        res += other;
        return res;
    }

    UnivariateMonomial operator-(const UnivariateMonomial& other) const
    {
        UnivariateMonomial res(*this);
        res -= other;
        return res;
    }
    UnivariateMonomial operator-() const
    {
        UnivariateMonomial res(*this);
        for (size_t i = 0; i < LENGTH; ++i) {
            res.evaluations[i] = -res.evaluations[i];
        }
        res.midpoint = -res.midpoint;
        return res;
    }

    UnivariateMonomial<Fr, domain_end + 1, domain_start, skip_count> sqr() const
        requires(LENGTH == 2)
    {
        UnivariateMonomial<Fr, domain_end + 1, domain_start, skip_count> result;
        result.evaluations[0] = evaluations[0].sqr();
        result.evaluations[2] = evaluations[1].sqr();
        // a0a0 a1a1 a0a1a1a0
        result.evaluations[1] = evaluations[0] * evaluations[1];
        result.evaluations[1] += result.evaluations[1];

        return result;
    }

    // Operations between Univariate and scalar
    UnivariateMonomial& operator+=(const Fr& scalar)
    {
        evaluations[0] += scalar;
        midpoint += scalar; // TODO remove with clean/dirty flags
        return *this;
    }

    UnivariateMonomial& operator-=(const Fr& scalar)
    {
        evaluations[0] -= scalar;
        midpoint -= scalar; // TODO remove with clean/dirty flags
        return *this;
    }
    UnivariateMonomial& operator*=(const Fr& scalar)
    {
        for (size_t i = 0; i < LENGTH; ++i) {
            evaluations[i] *= scalar;
        }
        midpoint *= scalar; // TODO remove with clean/dirty flags
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

    UnivariateMonomial operator*(const Fr& scalar) const
    {
        UnivariateMonomial res(*this);
        res *= scalar;
        return res;
    }

    // // Operations between Univariate and UnivariateView
    // Univariate& operator+=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
    // {
    //     evaluations[0] += view.evaluations[0];
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         evaluations[i] += view.evaluations[i];
    //     }
    //     return *this;
    // }

    // Univariate& operator-=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
    // {
    //     evaluations[0] -= view.evaluations[0];
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         evaluations[i] -= view.evaluations[i];
    //     }
    //     return *this;
    // }

    // Univariate& operator*=(const UnivariateView<Fr, domain_end, domain_start, skip_count>& view)
    // {
    //     evaluations[0] *= view.evaluations[0];
    //     for (size_t i = skip_count + 1; i < LENGTH; ++i) {
    //         evaluations[i] *= view.evaluations[i];
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
        os << u.evaluations[0] << "," << std::endl;
        for (size_t i = 1; i < u.evaluations.size(); i++) {
            os << " " << u.evaluations[i];
            if (i + 1 < u.evaluations.size()) {
                os << "," << std::endl;
            } else {
                os << "]";
            };
        }
        return os;
    }

    /**
     * @brief Given a univariate f represented by {f(domain_start), ..., f(domain_end - 1)}, compute the
     * evaluations {f(domain_end),..., f(extended_domain_end -1)} and return the Univariate represented by
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

    //     std::copy(evaluations.begin(), evaluations.end(), result.evaluations.begin());

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

    template <size_t INITIAL_LENGTH> void self_extend_from()
    {
        if constexpr (INITIAL_LENGTH == 2) {
            const Fr delta = value_at(1) - value_at(0);
            Fr next = value_at(1);
            for (size_t idx = 2; idx < LENGTH; idx++) {
                next += delta;
                value_at(idx) = next;
            }
        }
    }

    /**
     * @brief Evaluate a univariate at a point u not known at compile time
     * and assumed not to be in the domain (else we divide by zero).
     * @param f
     * @return Fr
     */
    Fr evaluate(const Fr& u) const
    {
        using Data = BarycentricData<Fr, domain_end, LENGTH, domain_start>;
        Fr full_numerator_value = 1;
        for (size_t i = domain_start; i != domain_end; ++i) {
            full_numerator_value *= u - i;
        }

        // build set of domain size-many denominator inverses 1/(d_i*(x_k - x_j)). will multiply against
        // each of these (rather than to divide by something) for each barycentric evaluation
        std::array<Fr, LENGTH> denominator_inverses;
        for (size_t i = 0; i != LENGTH; ++i) {
            Fr inv = Data::lagrange_denominators[i];
            inv *= u - Data::big_domain[i]; // warning: need to avoid zero here
            inv = Fr(1) / inv;
            denominator_inverses[i] = inv;
        }

        Fr result = 0;
        // compute each term v_j / (d_j*(x-x_j)) of the sum
        for (size_t i = domain_start; i != domain_end; ++i) {
            Fr term = value_at(i);
            term *= denominator_inverses[i - domain_start];
            result += term;
        }
        // scale the sum by the value of of B(x)
        result *= full_numerator_value;
        return result;
    };

    // Begin iterators
    auto begin() { return evaluations.begin(); }
    auto begin() const { return evaluations.begin(); }
    // End iterators
    auto end() { return evaluations.end(); }
    auto end() const { return evaluations.end(); }
};

template <typename B, class Fr, size_t domain_end, size_t domain_start = 0>
inline void read(B& it, UnivariateMonomial<Fr, domain_end, domain_start>& univariate)
{
    using serialize::read;
    read(it, univariate.evaluations);
}

template <typename B, class Fr, size_t domain_end, size_t domain_start = 0>
inline void write(B& it, UnivariateMonomial<Fr, domain_end, domain_start> const& univariate)
{
    using serialize::write;
    write(it, univariate.evaluations);
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0>
UnivariateMonomial<Fr, domain_end, domain_start, skip_count> operator+(
    const Fr& ff, const UnivariateMonomial<Fr, domain_end, domain_start, skip_count>& uv)
{
    return uv + ff;
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0>
UnivariateMonomial<Fr, domain_end, domain_start, skip_count> operator-(
    const Fr& ff, const UnivariateMonomial<Fr, domain_end, domain_start, skip_count>& uv)
{
    return -uv + ff;
}

template <class Fr, size_t domain_end, size_t domain_start = 0, size_t skip_count = 0>
UnivariateMonomial<Fr, domain_end, domain_start, skip_count> operator*(
    const Fr& ff, const UnivariateMonomial<Fr, domain_end, domain_start, skip_count>& uv)
{
    return uv * ff;
}

} // namespace bb

namespace std {
template <typename T, size_t N>
struct tuple_size<bb::UnivariateMonomial<T, N>> : std::integral_constant<std::size_t, N> {};

} // namespace std
