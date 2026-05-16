// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <algorithm>
#include <array>
#include <span>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate_coefficient_basis.hpp"

namespace bb {

class Bn254FqParams;
class Bn254FrParams;

template <class Fr> void extend_univariate_evaluations(std::span<Fr> result, std::span<const Fr> evaluations)
{
    BB_ASSERT_GTE(result.size(), evaluations.size());
    if (evaluations.empty()) {
        return;
    }

    std::copy(evaluations.begin(), evaluations.end(), result.begin());
    if (result.size() == evaluations.size()) {
        return;
    }

    std::array<Fr, 64> differences;
    std::array<Fr, 64> tail_differences;
    BB_ASSERT_LTE(evaluations.size(), differences.size());
    std::copy(evaluations.begin(), evaluations.end(), differences.begin());

    // Extend equally spaced evaluations via finite differences. This keeps the template surface small while preserving
    // the existing interpolation semantics for the integer domain 0, 1, ...
    const size_t source_length = evaluations.size();
    tail_differences[0] = evaluations[source_length - 1];
    for (size_t level = 1; level < source_length; ++level) {
        for (size_t idx = source_length - 1; idx >= level; --idx) {
            differences[idx] -= differences[idx - 1];
        }
        tail_differences[level] = differences[source_length - 1];
    }

    for (size_t idx = source_length; idx < result.size(); ++idx) {
        for (size_t level = source_length - 1; level > 0; --level) {
            tail_differences[level - 1] += tail_differences[level];
        }
        result[idx] = tail_differences[0];
    }
}

template <class Fr> void add_assign_univariate_evaluations(std::span<Fr> lhs, std::span<const Fr> rhs)
{
    BB_ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t idx = 0; idx < lhs.size(); ++idx) {
        lhs[idx] += rhs[idx];
    }
}

template <class Fr> void sub_assign_univariate_evaluations(std::span<Fr> lhs, std::span<const Fr> rhs)
{
    BB_ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t idx = 0; idx < lhs.size(); ++idx) {
        lhs[idx] -= rhs[idx];
    }
}

template <class Fr> void mul_assign_univariate_evaluations(std::span<Fr> lhs, std::span<const Fr> rhs)
{
    BB_ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t idx = 0; idx < lhs.size(); ++idx) {
        lhs[idx] *= rhs[idx];
    }
}

template <class Fr> void sqr_univariate_evaluations(std::span<Fr> values)
{
    for (auto& value : values) {
        value.self_sqr();
    }
}

template <class Fr> void add_assign_univariate_evaluations(std::span<Fr> values, const Fr& scalar)
{
    for (auto& value : values) {
        value += scalar;
    }
}

template <class Fr> void sub_assign_univariate_evaluations(std::span<Fr> values, const Fr& scalar)
{
    for (auto& value : values) {
        value -= scalar;
    }
}

template <class Fr> void mul_assign_univariate_evaluations(std::span<Fr> values, const Fr& scalar)
{
    for (auto& value : values) {
        value *= scalar;
    }
}

template <class Fr> void negate_univariate_evaluations(std::span<Fr> values)
{
    for (auto& value : values) {
        value = -value;
    }
}

void extend_univariate_evaluations(std::span<field<Bn254FrParams>> result,
                                   std::span<const field<Bn254FrParams>> evaluations);
void add_assign_univariate_evaluations(std::span<field<Bn254FrParams>> lhs, std::span<const field<Bn254FrParams>> rhs);
void sub_assign_univariate_evaluations(std::span<field<Bn254FrParams>> lhs, std::span<const field<Bn254FrParams>> rhs);
void mul_assign_univariate_evaluations(std::span<field<Bn254FrParams>> lhs, std::span<const field<Bn254FrParams>> rhs);
void sqr_univariate_evaluations(std::span<field<Bn254FrParams>> values);
void add_assign_univariate_evaluations(std::span<field<Bn254FrParams>> values, const field<Bn254FrParams>& scalar);
void sub_assign_univariate_evaluations(std::span<field<Bn254FrParams>> values, const field<Bn254FrParams>& scalar);
void mul_assign_univariate_evaluations(std::span<field<Bn254FrParams>> values, const field<Bn254FrParams>& scalar);
void negate_univariate_evaluations(std::span<field<Bn254FrParams>> values);

void extend_univariate_evaluations(std::span<field<Bn254FqParams>> result,
                                   std::span<const field<Bn254FqParams>> evaluations);
void add_assign_univariate_evaluations(std::span<field<Bn254FqParams>> lhs, std::span<const field<Bn254FqParams>> rhs);
void sub_assign_univariate_evaluations(std::span<field<Bn254FqParams>> lhs, std::span<const field<Bn254FqParams>> rhs);
void mul_assign_univariate_evaluations(std::span<field<Bn254FqParams>> lhs, std::span<const field<Bn254FqParams>> rhs);
void sqr_univariate_evaluations(std::span<field<Bn254FqParams>> values);
void add_assign_univariate_evaluations(std::span<field<Bn254FqParams>> values, const field<Bn254FqParams>& scalar);
void sub_assign_univariate_evaluations(std::span<field<Bn254FqParams>> values, const field<Bn254FqParams>& scalar);
void mul_assign_univariate_evaluations(std::span<field<Bn254FqParams>> values, const field<Bn254FqParams>& scalar);
void negate_univariate_evaluations(std::span<field<Bn254FqParams>> values);

template <class Fr, size_t RESULT_LENGTH, size_t SOURCE_LENGTH>
void extend_univariate_evaluations(std::array<Fr, RESULT_LENGTH>& result,
                                   const std::array<Fr, SOURCE_LENGTH>& evaluations)
{
    extend_univariate_evaluations(std::span<Fr>(result), std::span<const Fr>(evaluations.data(), evaluations.size()));
}

template <class Fr, size_t LENGTH>
void add_assign_univariate_evaluations(std::array<Fr, LENGTH>& lhs, const std::array<Fr, LENGTH>& rhs)
{
    add_assign_univariate_evaluations(std::span<Fr>(lhs), std::span<const Fr>(rhs.data(), rhs.size()));
}

template <class Fr, size_t LENGTH>
void add_assign_univariate_evaluations(std::array<Fr, LENGTH>& lhs, std::span<const Fr, LENGTH> rhs)
{
    add_assign_univariate_evaluations(std::span<Fr>(lhs), std::span<const Fr>(rhs.data(), rhs.size()));
}

template <class Fr, size_t LENGTH>
void sub_assign_univariate_evaluations(std::array<Fr, LENGTH>& lhs, const std::array<Fr, LENGTH>& rhs)
{
    sub_assign_univariate_evaluations(std::span<Fr>(lhs), std::span<const Fr>(rhs.data(), rhs.size()));
}

template <class Fr, size_t LENGTH>
void sub_assign_univariate_evaluations(std::array<Fr, LENGTH>& lhs, std::span<const Fr, LENGTH> rhs)
{
    sub_assign_univariate_evaluations(std::span<Fr>(lhs), std::span<const Fr>(rhs.data(), rhs.size()));
}

template <class Fr, size_t LENGTH>
void mul_assign_univariate_evaluations(std::array<Fr, LENGTH>& lhs, const std::array<Fr, LENGTH>& rhs)
{
    mul_assign_univariate_evaluations(std::span<Fr>(lhs), std::span<const Fr>(rhs.data(), rhs.size()));
}

template <class Fr, size_t LENGTH>
void mul_assign_univariate_evaluations(std::array<Fr, LENGTH>& lhs, std::span<const Fr, LENGTH> rhs)
{
    mul_assign_univariate_evaluations(std::span<Fr>(lhs), std::span<const Fr>(rhs.data(), rhs.size()));
}

template <class Fr, size_t LENGTH> void sqr_univariate_evaluations(std::array<Fr, LENGTH>& values)
{
    sqr_univariate_evaluations(std::span<Fr>(values));
}

template <class Fr, size_t LENGTH>
void add_assign_univariate_evaluations(std::array<Fr, LENGTH>& values, const Fr& scalar)
{
    add_assign_univariate_evaluations(std::span<Fr>(values), scalar);
}

template <class Fr, size_t LENGTH>
void sub_assign_univariate_evaluations(std::array<Fr, LENGTH>& values, const Fr& scalar)
{
    sub_assign_univariate_evaluations(std::span<Fr>(values), scalar);
}

template <class Fr, size_t LENGTH>
void mul_assign_univariate_evaluations(std::array<Fr, LENGTH>& values, const Fr& scalar)
{
    mul_assign_univariate_evaluations(std::span<Fr>(values), scalar);
}

template <class Fr, size_t LENGTH> void negate_univariate_evaluations(std::array<Fr, LENGTH>& values)
{
    negate_univariate_evaluations(std::span<Fr>(values));
}

/**
 * @brief A view of a univariate, also used to truncate univariates.
 *
 * @details For optimization purposes, it makes sense to define univariates with large lengths and then reuse only some
 * of the data in those univariates. We do that by taking a view of those elements and then, as needed, using this to
 * populate new containers.
 */
template <class Fr, size_t view_domain_end> class UnivariateView;

/**
 * @brief A univariate polynomial represented by its values on {0, 1,..., domain_end - 1}.
 */
template <class Fr, size_t domain_end> class Univariate {
  public:
    static constexpr size_t LENGTH = domain_end;
    using View = UnivariateView<Fr, domain_end>;
    static constexpr size_t MONOMIAL_LENGTH = LENGTH > 1 ? 2 : 1;
    using CoefficientAccumulator = UnivariateCoefficientBasis<Fr, MONOMIAL_LENGTH, true>;

    using value_type = Fr; // used to get the type of the elements consistently with std::array

    std::array<Fr, LENGTH> evaluations;

    Univariate() = default;

    explicit Univariate(const std::array<Fr, LENGTH>& evaluations)
        : evaluations(evaluations)
    {}
    ~Univariate() = default;
    Univariate(const Univariate& other) = default;
    Univariate(Univariate&& other) noexcept = default;
    Univariate& operator=(const Univariate& other) = default;
    Univariate& operator=(Univariate&& other) noexcept = default;

    explicit operator UnivariateCoefficientBasis<Fr, 2, true>() const
        requires(LENGTH > 1)
    {
        static_assert(domain_end >= 2);

        UnivariateCoefficientBasis<Fr, 2, true> result;
        result.coefficients[0] = evaluations[0];
        result.coefficients[1] = evaluations[1] - evaluations[0];
        result.coefficients[2] = evaluations[1];
        return result;
    }

    // Compute Lagrange coefficients of a given linear polynomial represented in monomial basis.
    template <bool has_a0_plus_a1> Univariate(const UnivariateCoefficientBasis<Fr, 2, has_a0_plus_a1>& monomial)
    {
        Fr to_add = monomial.coefficients[1];
        evaluations[0] = monomial.coefficients[0];
        auto prev = evaluations[0];

        for (size_t i = 1; i < domain_end; ++i) {
            prev = prev + to_add;
            evaluations[i] = prev;
        }
    }

    // Compute Lagrange coefficients of a given quadratic polynomial represented in monomial basis.
    template <bool has_a0_plus_a1> Univariate(const UnivariateCoefficientBasis<Fr, 3, has_a0_plus_a1>& monomial)
    {
        Fr to_add = monomial.coefficients[1];                                // a1 + a2
        Fr derivative = monomial.coefficients[2] + monomial.coefficients[2]; // 2a2
        evaluations[0] = monomial.coefficients[0];
        auto prev = evaluations[0];

        for (size_t i = 1; i < domain_end - 1; ++i) {
            prev += to_add;
            evaluations[i] = prev;
            to_add += derivative;
        }
        prev += to_add;
        evaluations[domain_end - 1] = prev;
    }

    // Construct constant Univariate from scalar which represents the value that all the points in the domain
    // evaluate to
    explicit Univariate(const Fr& value)
    {
        for (size_t i = 0; i < LENGTH; ++i) {
            evaluations[i] = value;
        }
    }
    // Construct Univariate from UnivariateView.
    // Lengths will match since we use `domain_end` both in the Univariate and the UnivariateView.
    explicit Univariate(const UnivariateView<Fr, domain_end>& in)
    {
        static_assert(UnivariateView<Fr, domain_end>::LENGTH == LENGTH);
        for (size_t i = 0; i < LENGTH; ++i) {
            evaluations[i] = in.evaluations[i];
        }
    }

    Fr& value_at(size_t i) { return evaluations[i]; }
    const Fr& value_at(size_t i) const { return evaluations[i]; }
    size_t size() { return evaluations.size(); };

    // Check if the univariate is identically zero
    bool is_zero() const
    {
        for (size_t i = 0; i < LENGTH; ++i) {
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
    static Univariate serialize_from_buffer(uint8_t const* buffer)
    {
        Univariate result;
        std::read(buffer, result.evaluations);
        return result;
    }

    static Univariate get_random()
    {
        auto output = Univariate<Fr, domain_end>();
        for (size_t i = 0; i != LENGTH; ++i) {
            output.value_at(i) = Fr::random_element();
        }
        return output;
    };

    static Univariate zero() { return Univariate<Fr, domain_end>(Fr::zero()); };

    // Operations between Univariate and other Univariate
    bool operator==(const Univariate& other) const = default;

    Univariate& operator+=(const Univariate& other)
    {
        add_assign_univariate_evaluations(evaluations, other.evaluations);
        return *this;
    }
    Univariate& operator-=(const Univariate& other)
    {
        sub_assign_univariate_evaluations(evaluations, other.evaluations);
        return *this;
    }
    Univariate& operator*=(const Univariate& other)
    {
        mul_assign_univariate_evaluations(evaluations, other.evaluations);
        return *this;
    }
    Univariate& self_sqr()
    {
        sqr_univariate_evaluations(evaluations);
        return *this;
    }
    Univariate operator+(const Univariate& other) const
    {
        Univariate res(*this);
        res += other;
        return res;
    }

    Univariate operator-(const Univariate& other) const
    {
        Univariate res(*this);
        res -= other;
        return res;
    }
    Univariate operator-() const
    {
        Univariate res(*this);
        negate_univariate_evaluations(res.evaluations);
        return res;
    }

    Univariate operator*(const Univariate& other) const
    {
        Univariate res(*this);
        res *= other;
        return res;
    }

    Univariate sqr() const
    {
        Univariate res(*this);
        res.self_sqr();
        return res;
    }

    // Operations between Univariate and scalar
    Univariate& operator+=(const Fr& scalar)
    {
        add_assign_univariate_evaluations(evaluations, scalar);
        return *this;
    }

    Univariate& operator-=(const Fr& scalar)
    {
        sub_assign_univariate_evaluations(evaluations, scalar);
        return *this;
    }
    Univariate& operator*=(const Fr& scalar)
    {
        mul_assign_univariate_evaluations(evaluations, scalar);
        return *this;
    }

    Univariate operator+(const Fr& scalar) const
    {
        Univariate res(*this);
        res += scalar;
        return res;
    }

    Univariate operator-(const Fr& scalar) const
    {
        Univariate res(*this);
        res -= scalar;
        return res;
    }

    Univariate operator*(const Fr& scalar) const
    {
        Univariate res(*this);
        res *= scalar;
        return res;
    }

    // Operations between Univariate and UnivariateView
    Univariate& operator+=(const UnivariateView<Fr, domain_end>& view)
    {
        add_assign_univariate_evaluations(evaluations, view.evaluations);
        return *this;
    }

    Univariate& operator-=(const UnivariateView<Fr, domain_end>& view)
    {
        sub_assign_univariate_evaluations(evaluations, view.evaluations);
        return *this;
    }

    Univariate& operator*=(const UnivariateView<Fr, domain_end>& view)
    {
        mul_assign_univariate_evaluations(evaluations, view.evaluations);
        return *this;
    }

    Univariate operator+(const UnivariateView<Fr, domain_end>& view) const
    {
        Univariate res(*this);
        res += view;
        return res;
    }

    Univariate operator-(const UnivariateView<Fr, domain_end>& view) const
    {
        Univariate res(*this);
        res -= view;
        return res;
    }

    Univariate operator*(const UnivariateView<Fr, domain_end>& view) const
    {
        Univariate res(*this);
        res *= view;
        return res;
    }

    // Output is immediately parsable as a list of integers by Python.
    friend std::ostream& operator<<(std::ostream& os, const Univariate& u)
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

    template <size_t EXTENDED_DOMAIN_END>
    explicit operator Univariate<Fr, EXTENDED_DOMAIN_END>()
        requires(domain_end == 2)
    {
        return extend_to<EXTENDED_DOMAIN_END>();
    }

    /**
     * @brief Given a univariate f represented by {f(0), ..., f(domain_end - 1)}, compute the
     * evaluations {f(domain_end),..., f(extended_domain_end -1)} and return the Univariate represented by
     * {f(0),..., f(extended_domain_end -1)}
     *
     * @details The input domain is equally spaced, so finite differences extend the evaluations without constructing
     * a per-domain barycentric table.
     *
     */
    template <size_t EXTENDED_DOMAIN_END> Univariate<Fr, EXTENDED_DOMAIN_END> extend_to() const
    {
        static constexpr size_t EXTENDED_LENGTH = EXTENDED_DOMAIN_END;
        static_assert(EXTENDED_LENGTH >= LENGTH);

        Univariate<Fr, EXTENDED_LENGTH> result;
        extend_univariate_evaluations(result.evaluations, evaluations);
        return result;
    }

    /**
     * @brief Compute the evaluations of the polynomial from the INITIAL_LENGTH up to the total LENGTH. Currently only
     * supports INITIAL_LENGTH = 2.
     *
     * @tparam INITIAL_LENGTH
     */
    template <size_t INITIAL_LENGTH> void self_extend_from()
    {
        if constexpr (INITIAL_LENGTH == 2) {
            const Fr delta = value_at(1) - value_at(0);
            Fr next = value_at(1);
            for (size_t idx = 2; idx < LENGTH; idx++) {
                next += delta;
                value_at(idx) = next;
            }
        } else {
            throw_or_abort("self_extend_from called with INITIAL_LENGTH different from 2.");
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
        using Data = BarycentricData<Fr, domain_end, LENGTH>;
        Fr full_numerator_value = 1;
        for (size_t i = 0; i != domain_end; ++i) {
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
        for (size_t i = 0; i != domain_end; ++i) {
            Fr term = value_at(i);
            term *= denominator_inverses[i];
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

template <typename B, class Fr, size_t domain_end> inline void read(B& it, Univariate<Fr, domain_end>& univariate)
{
    using serialize::read;
    read(it, univariate.evaluations);
}

template <typename B, class Fr, size_t domain_end>
inline void write(B& it, Univariate<Fr, domain_end> const& univariate)
{
    using serialize::write;
    write(it, univariate.evaluations);
}

template <class Fr, size_t domain_end>
Univariate<Fr, domain_end> operator+(const Fr& ff, const Univariate<Fr, domain_end>& uv)
{
    return uv + ff;
}

template <class Fr, size_t domain_end>
Univariate<Fr, domain_end> operator-(const Fr& ff, const Univariate<Fr, domain_end>& uv)
{
    return -uv + ff;
}

template <class Fr, size_t domain_end>
Univariate<Fr, domain_end> operator*(const Fr& ff, const Univariate<Fr, domain_end>& uv)
{
    return uv * ff;
}

template <class Fr, size_t domain_end> class UnivariateView {
  public:
    static constexpr size_t LENGTH = domain_end;
    std::span<const Fr, LENGTH> evaluations;
    static constexpr size_t MONOMIAL_LENGTH = LENGTH > 1 ? 2 : 1;
    using CoefficientAccumulator = UnivariateCoefficientBasis<Fr, MONOMIAL_LENGTH, true>;

    UnivariateView() = default;

    bool operator==(const UnivariateView& other) const
    {
        for (size_t i = 0; i < LENGTH; ++i) {
            if (evaluations[i] != other.evaluations[i]) {
                return false;
            }
        }
        return true;
    };

    const Fr& value_at(size_t i) const { return evaluations[i]; };

    template <size_t full_domain_end>
    explicit UnivariateView(const Univariate<Fr, full_domain_end>& univariate_in)
        : evaluations(std::span<const Fr>(univariate_in.evaluations.data(), LENGTH)){};

    explicit operator UnivariateCoefficientBasis<Fr, 2, true>() const
        requires(LENGTH > 1)
    {
        static_assert(domain_end >= 2);

        UnivariateCoefficientBasis<Fr, 2, true> result;

        result.coefficients[0] = evaluations[0];
        result.coefficients[1] = evaluations[1] - evaluations[0];
        result.coefficients[2] = evaluations[1];
        return result;
    }

    Univariate<Fr, domain_end> operator+(const UnivariateView& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res += other;
        return res;
    }

    Univariate<Fr, domain_end> operator-(const UnivariateView& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res -= other;
        return res;
    }

    Univariate<Fr, domain_end> operator-() const
    {
        Univariate<Fr, domain_end> res(*this);
        negate_univariate_evaluations(res.evaluations);
        return res;
    }

    Univariate<Fr, domain_end> operator*(const UnivariateView& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res *= other;
        return res;
    }
    Univariate<Fr, domain_end> sqr() const
    {
        Univariate<Fr, domain_end> res(*this);
        res = res.sqr();
        return res;
    }

    Univariate<Fr, domain_end> operator*(const Univariate<Fr, domain_end>& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res *= other;
        return res;
    }

    Univariate<Fr, domain_end> operator+(const Univariate<Fr, domain_end>& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res += other;
        return res;
    }

    Univariate<Fr, domain_end> operator+(const Fr& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res += other;
        return res;
    }

    Univariate<Fr, domain_end> operator-(const Fr& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res -= other;
        return res;
    }

    Univariate<Fr, domain_end> operator*(const Fr& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res *= other;
        return res;
    }

    Univariate<Fr, domain_end> operator-(const Univariate<Fr, domain_end>& other) const
    {
        Univariate<Fr, domain_end> res(*this);
        res -= other;
        return res;
    }

    // Output is immediately parsable as a list of integers by Python.
    friend std::ostream& operator<<(std::ostream& os, const UnivariateView& u)
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
};

template <class Fr, size_t domain_end>
Univariate<Fr, domain_end> operator+(const Fr& ff, const UnivariateView<Fr, domain_end>& uv)
{
    return uv + ff;
}

template <class Fr, size_t domain_end>
Univariate<Fr, domain_end> operator-(const Fr& ff, const UnivariateView<Fr, domain_end>& uv)
{
    return -uv + ff;
}

template <class Fr, size_t domain_end>
Univariate<Fr, domain_end> operator*(const Fr& ff, const UnivariateView<Fr, domain_end>& uv)
{
    return uv * ff;
}

/**
 * @brief Create a sub-array of `elements` at the indices given in the template pack `Is`, converting them
 * to the new type T.
 *
 * @tparam T type to convert to
 * @tparam U type to convert from
 * @tparam N number (deduced by `elements`)
 * @tparam Is list of indices we want in the returned array. When the second argument is called with
 * `std::make_index_sequence<N>`, these will be `0, 1, ..., N-1`.
 * @param elements array to convert from
 * @return std::array<T, sizeof...(Is)> result array s.t. result[i] = T(elements[Is[i]]). By default, Is[i]
 * = i when called with `std::make_index_sequence<N>`.
 */
template <typename T, typename U, std::size_t N, std::size_t... Is>
std::array<T, sizeof...(Is)> array_to_array_aux(const std::array<U, N>& elements, std::index_sequence<Is...>)
{
    return { { T{ elements[Is] }... } };
};

/**
 * @brief Given an std::array<U,N>, returns an std::array<T,N>, by calling the (explicit) constructor T(U).
 *
 * @details https://stackoverflow.com/a/32175958
 * The main use case is to convert an array of `Univariate` into `UnivariateView`. The main use case would
 * be to let Sumcheck decide the required degree of the relation evaluation, rather than hardcoding it
 * inside the relation. The
 * `_aux` version could also be used to create an array of only the polynomials required by the relation,
 * and it could help us implement the optimization where we extend each edge only up to the maximum degree
 * that is required over all relations (for example, `L_LAST` only needs degree 3).
 *
 * @tparam T Output type
 * @tparam U Input type (deduced from `elements`)
 * @tparam N Common array size (deduced from `elements`)
 * @param elements array to be converted
 * @return std::array<T, N> result s.t. result[i] = T(elements[i])
 */
template <typename T, typename U, std::size_t N> std::array<T, N> array_to_array(const std::array<U, N>& elements)
{
    // Calls the aux method that uses the index sequence to unpack all values in `elements`
    return array_to_array_aux<T, U, N>(elements, std::make_index_sequence<N>());
};

} // namespace bb

namespace std {

template <typename T, size_t N> struct tuple_size<bb::Univariate<T, N>> : std::integral_constant<std::size_t, N> {};

} // namespace std
